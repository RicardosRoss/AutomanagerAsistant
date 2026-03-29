import type TelegramBot from 'node-telegram-bot-api';
import logger from '../utils/logger.js';
import CultivationService from '../services/CultivationService.js';
import { formatRealmDisplay } from '../config/cultivation.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

class CultivationCommandHandlers {
  bot: TelegramBot;

  cultivationService: CultivationService;

  constructor(bot: TelegramBot) {
    this.bot = bot;
    this.cultivationService = new CultivationService();
  }

  registerCommands(): void {
    this.bot.onText(/\/realm/, (msg) => {
      void this.handleRealmCommand(msg);
    });
    this.bot.onText(/\/divination (.+)/, (msg, match) => {
      void this.handleDivinationCommand(msg, match);
    });
    this.bot.onText(/\/divination_history/, (msg) => {
      void this.handleDivinationHistoryCommand(msg);
    });
    this.bot.onText(/\/divination_chart/, (msg) => {
      void this.handleDivinationChartCommand(msg);
    });
    this.bot.onText(/\/breakthrough/, (msg) => {
      void this.handleBreakthroughCommand(msg);
    });
    this.bot.onText(/\/ascension/, (msg) => {
      void this.handleAscensionCommand(msg);
    });
    this.bot.onText(/\/confirm_ascension/, (msg) => {
      void this.handleConfirmAscensionCommand(msg);
    });
    this.bot.onText(/\/rankings/, (msg) => {
      void this.handleRankingsCommand(msg);
    });
    this.bot.onText(/\/mystats/, (msg) => {
      void this.handleMyStatsCommand(msg);
    });
    this.bot.onText(/\/stones/, (msg) => {
      void this.handleStonesCommand(msg);
    });

    logger.info('修仙系统命令已注册');
  }

  async handleRealmCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    try {
      const status = await this.cultivationService.getCultivationStatus(userId);

      let message = '🧙‍♂️ 修仙状态\n\n';
      message += `📊 当前境界：${status.fullName}\n`;
      message += `📖 称号：${status.title}\n`;
      message += `⚡ 灵力：${status.user.cultivation.spiritualPower}`;

      if (status.nextRealmProgress) {
        message += ` / ${status.realm.maxPower}\n`;
        message += `📈 距离下一境界：${status.nextRealmProgress} 灵力`;
      } else {
        message += ' (已达巅峰)';
      }

      message += `\n\n💎 仙石：${status.immortalStones}`;

      if (status.ascensions > 0) {
        message += `\n☁️ 飞升次数：${status.ascensions}`;
        message += `\n👑 仙位印记：${status.immortalMarks}`;
      }

      message += '\n\n📜 渡劫记录：';
      message += `\n✅ 成功：${status.breakthroughSuccesses} 次`;
      message += `\n❌ 失败：${status.breakthroughFailures} 次`;

      if (status.canBreakthrough) {
        message += '\n\n⚡⚡⚡ 灵力已达巅峰！';
        message += '\n可使用 /breakthrough 尝试渡劫突破！';
      }

      await this.bot.sendMessage(chatId, message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`/realm 命令错误: ${message}`, { userId });
      await this.bot.sendMessage(chatId, `❌ ${message}`);
    }
  }

  async handleDivinationCommand(
    msg: TelegramBot.Message,
    match?: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const betAmountStr = match?.[1]?.trim() ?? '';

    if (!userId) {
      return;
    }

    try {
      const betAmount = Number.parseInt(betAmountStr, 10);

      if (Number.isNaN(betAmount) || betAmount <= 0) {
        await this.bot.sendMessage(chatId, '❌ 请输入有效的下注金额！\n\n示例：/divination 100');
        return;
      }

      const waitMsg = await this.bot.sendMessage(chatId, '🔮 占卜天机中...\n✨ 八卦流转，天机显现...');
      await delay(1500);

      const result = await this.cultivationService.castDivination(userId, betAmount);

      let message = `${result.gua.emoji} 得 ${result.gua.name} - ${result.gua.meaning}！\n\n`;
      message += `💰 下注：${result.betAmount} 仙石\n`;
      message += `📊 倍率：${result.gua.multiplier}x\n`;

      const resultEmoji = result.result > 0 ? '📈' : '📉';
      const resultText = result.result > 0 ? `+${result.result}` : `${result.result}`;
      message += `${resultEmoji} 结果：${resultText} 仙石\n\n`;

      message += `💎 当前仙石：${result.stonesAfter}\n`;
      message += `⚡ 当前灵力：${result.powerAfter}`;

      if (result.realmChanged) {
        message += `\n\n🎊 境界变化：${result.realmBefore} → ${result.realmAfter}！`;
      }

      message += '\n\n继续占卜：/divination <仙石>';
      message += '\n查看走势：/divination_chart';

      await this.bot.deleteMessage(chatId, waitMsg.message_id);
      await this.bot.sendMessage(chatId, message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`/divination 命令错误: ${message}`, { userId });
      await this.bot.sendMessage(chatId, `❌ ${message}`);
    }
  }

  async handleDivinationHistoryCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    try {
      const history = await this.cultivationService.getDivinationHistory(userId, 10);

      if (history.length === 0) {
        await this.bot.sendMessage(chatId, '📜 暂无占卜记录\n\n使用 /divination <金额> 开始占卜');
        return;
      }

      let message = '📜 占卜历史（最近10次）\n\n';

      history.forEach((record, index) => {
        const resultValue = record.result ?? 0;
        const resultEmoji = resultValue > 0 ? '📈' : '📉';
        const resultText = resultValue > 0 ? `+${resultValue}` : `${resultValue}`;

        message += `${index + 1}. ${record.guaEmoji} ${record.guaName} - ${record.meaning}\n`;
        message += `   💰 ${record.betAmount} | ${resultEmoji} ${resultText}`;

        if (record.realmChanged) {
          message += ` | 🎊 ${record.realmBefore}→${record.realmAfter}`;
        }

        message += '\n';
      });

      await this.bot.sendMessage(chatId, message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`/divination_history 命令错误: ${message}`, { userId });
      await this.bot.sendMessage(chatId, `❌ ${message}`);
    }
  }

  async handleDivinationChartCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    try {
      const history = await this.cultivationService.getDivinationHistory(userId, 20);
      const stats = await this.cultivationService.getDivinationStats(userId);

      if (history.length === 0) {
        await this.bot.sendMessage(chatId, '📜 暂无占卜记录');
        return;
      }

      let message = '📊 占卜走势图（最近20次）\n\n';
      message += '点数 | 卦象 | 倍率 | 盈亏\n';
      message += `${'─'.repeat(35)}\n`;

      history.reverse().forEach((record, index) => {
        const resultValue = record.result ?? 0;
        const bar = resultValue > 0 ? '📈' : resultValue < 0 ? '📉' : '➖';
        const resultText = resultValue > 0 ? `+${resultValue}` : `${resultValue}`;

        message += `${index + 1}. ${record.diceRoll} | ${record.guaEmoji} | `;
        message += `${record.multiplier}x | ${bar} ${resultText}\n`;
      });

      message += '\n📈 占卜统计：\n';
      message += `总次数：${stats.totalGames}\n`;
      message += `获胜：${stats.wins} 次 | 失败：${stats.losses} 次\n`;
      message += `总盈利：${stats.totalGain} | 总亏损：${stats.totalLoss}\n`;
      message += `净收益：${stats.netProfit > 0 ? '+' : ''}${stats.netProfit}\n`;

      if (stats.totalGames > 0) {
        const winRate = ((stats.wins / stats.totalGames) * 100).toFixed(1);
        message += `胜率：${winRate}%`;
      }

      await this.bot.sendMessage(chatId, message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`/divination_chart 命令错误: ${message}`, { userId });
      await this.bot.sendMessage(chatId, `❌ ${message}`);
    }
  }

  async handleBreakthroughCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    try {
      const waitMsg = await this.bot.sendMessage(chatId, '🌩️ 天劫降临！\n⚡⚡⚡ 九天雷劫齐至...');
      await delay(2000);

      const result = await this.cultivationService.attemptBreakthrough(userId);

      await this.bot.deleteMessage(chatId, waitMsg.message_id);
      await this.bot.sendMessage(chatId, result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`/breakthrough 命令错误: ${message}`, { userId });
      await this.bot.sendMessage(chatId, `❌ ${message}`);
    }
  }

  async handleAscensionCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    try {
      const status = await this.cultivationService.getCultivationStatus(userId);

      if (status.realm.id !== 9) {
        await this.bot.sendMessage(chatId, `❌ 只有大乘期修士才能飞升！\n\n当前境界：${status.fullName}`);
        return;
      }

      const requiredPower = 50000;
      if (status.user.cultivation.spiritualPower < requiredPower) {
        await this.bot.sendMessage(
          chatId,
          `❌ 飞升需要 ${requiredPower} 灵力！\n\n`
            + `当前灵力：${status.user.cultivation.spiritualPower}\n`
            + `还需：${requiredPower - status.user.cultivation.spiritualPower} 灵力`
        );
        return;
      }

      let message = '🌟 您已达到大乘期圆满！\n☁️ 天门已开，是否飞升仙界？\n\n';
      message += '飞升后：\n';
      message += '✅ 获得 ☁️ 仙位印记 x1（永久）\n';
      message += `✅ 保留仙石：${status.immortalStones}\n`;
      message += '⚠️ 灵力重置为 0\n';
      message += '⚠️ 境界回到炼气期\n\n';
      message += '使用 /confirm_ascension 确认飞升';

      await this.bot.sendMessage(chatId, message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`/ascension 命令错误: ${message}`, { userId });
      await this.bot.sendMessage(chatId, `❌ ${message}`);
    }
  }

  async handleConfirmAscensionCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    try {
      const waitMsg = await this.bot.sendMessage(chatId, '☁️☁️☁️ 天门洞开...\n🌟 飞升进行中...');

      await delay(2000);

      const result = await this.cultivationService.ascend(userId);

      await this.bot.deleteMessage(chatId, waitMsg.message_id);
      await this.bot.sendMessage(chatId, result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`/confirm_ascension 命令错误: ${message}`, { userId });
      await this.bot.sendMessage(chatId, `❌ ${message}`);
    }
  }

  async handleRankingsCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    try {
      const [powerRanking, realmRanking, ascensionRanking] = await Promise.all([
        this.cultivationService.getLeaderboard('power', 10),
        this.cultivationService.getLeaderboard('realm', 10),
        this.cultivationService.getLeaderboard('ascension', 10)
      ]);

      let message = '🏆 修仙排行榜\n\n';
      message += '⚡ 灵力榜（Top 10）\n';
      powerRanking.forEach((user, index) => {
        const display = formatRealmDisplay(user.cultivation.spiritualPower);
        message += `${index + 1}. ${user.username || `用户${user.userId}`} - `;
        message += `${user.cultivation.spiritualPower} 灵力 `;
        message += `(${display.realm.emoji}${display.realm.name})\n`;
      });

      message += '\n🏔️ 境界榜（Top 10）\n';
      realmRanking.forEach((user, index) => {
        const display = formatRealmDisplay(user.cultivation.spiritualPower);
        message += `${index + 1}. ${user.username || `用户${user.userId}`} - ${display.fullName}\n`;
      });

      const topAscensionUser = ascensionRanking[0];
      if (topAscensionUser && topAscensionUser.cultivation.ascensions > 0) {
        message += '\n☁️ 飞升榜（Top 10）\n';
        ascensionRanking.forEach((user, index) => {
          if (user.cultivation.ascensions > 0) {
            message += `${index + 1}. ${user.username || `用户${user.userId}`} - ${user.cultivation.ascensions} 次飞升\n`;
          }
        });
      }

      await this.bot.sendMessage(chatId, message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`/rankings 命令错误: ${message}`);
      await this.bot.sendMessage(chatId, '❌ 获取排行榜失败');
    }
  }

  async handleMyStatsCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    try {
      const status = await this.cultivationService.getCultivationStatus(userId);
      const divinationStats = await this.cultivationService.getDivinationStats(userId);

      let message = '📊 修仙统计\n\n';
      message += `🧙‍♂️ 当前境界：${status.fullName}\n`;
      message += `⚡ 当前灵力：${status.user.cultivation.spiritualPower}\n`;
      message += `💎 当前仙石：${status.immortalStones}\n\n`;

      message += '📈 历史最高：\n';
      message += `境界：${status.user.cultivation.peakRealm}\n`;
      message += `灵力：${status.user.cultivation.peakSpiritualPower}\n\n`;

      message += '⚡ 渡劫记录：\n';
      message += `成功：${status.breakthroughSuccesses} | 失败：${status.breakthroughFailures}\n`;
      if (status.breakthroughSuccesses + status.breakthroughFailures > 0) {
        const successRate = (
          (status.breakthroughSuccesses / (status.breakthroughSuccesses + status.breakthroughFailures)) * 100
        ).toFixed(1);
        message += `成功率：${successRate}%\n`;
      }

      message += '\n🔮 占卜统计：\n';
      message += `总次数：${divinationStats.totalGames}\n`;
      message += `获胜：${divinationStats.wins} | 失败：${divinationStats.losses}\n`;
      message += `净收益：${divinationStats.netProfit > 0 ? '+' : ''}${divinationStats.netProfit} 仙石\n`;

      if (status.ascensions > 0) {
        message += '\n☁️ 飞升记录：\n';
        message += `飞升次数：${status.ascensions}\n`;
        message += `仙位印记：${status.immortalMarks} 👑\n`;
      }

      if (status.user.cultivation.achievements.length > 0) {
        message += '\n🏆 成就：\n';
        status.user.cultivation.achievements.forEach((achievement) => {
          message += `✨ ${achievement}\n`;
        });
      }

      await this.bot.sendMessage(chatId, message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`/mystats 命令错误: ${message}`, { userId });
      await this.bot.sendMessage(chatId, `❌ ${message}`);
    }
  }

  async handleStonesCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    try {
      const status = await this.cultivationService.getCultivationStatus(userId);
      const divinationStats = await this.cultivationService.getDivinationStats(userId);

      let message = '💎 仙石余额\n\n';
      message += `当前仙石：${status.immortalStones}\n\n`;
      message += '📊 占卜盈亏：\n';
      message += `总盈利：+${divinationStats.totalGain}\n`;
      message += `总亏损：-${divinationStats.totalLoss}\n`;
      message += `净收益：${divinationStats.netProfit > 0 ? '+' : ''}${divinationStats.netProfit}\n\n`;
      message += '💡 提示：\n';
      message += '• 完成任务获得仙石\n';
      message += '• 使用 /divination <金额> 占卜天机';

      await this.bot.sendMessage(chatId, message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`/stones 命令错误: ${message}`, { userId });
      await this.bot.sendMessage(chatId, `❌ ${message}`);
    }
  }

  async sendRealmStatus(chatId: number, userId: number): Promise<void> {
    await this.handleRealmCommand({
      chat: { id: chatId, type: 'private' },
      from: { id: userId, is_bot: false, first_name: '' },
      date: Math.floor(Date.now() / 1000),
      message_id: 0
    } as TelegramBot.Message);
  }

  async sendRankings(chatId: number): Promise<void> {
    await this.handleRankingsCommand({
      chat: { id: chatId, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      message_id: 0
    } as TelegramBot.Message);
  }
}

export default CultivationCommandHandlers;
