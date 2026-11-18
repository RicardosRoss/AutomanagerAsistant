import { sendTelegramMessage, databaseErrorNotice } from '../utils/telegramMessages.js';
import type TelegramBot from 'node-telegram-bot-api';
import logger from '../utils/logger.js';
import CultivationService from '../services/CultivationService.js';
import { formatInjuryLevelLabel } from '../config/xuanjianCombat.js';
import {
  formatCanonicalRealmDisplay,
  getCanonicalRealmByPower,
  getMainDaoTrackDisplayName,
  isUniversalDaoTrack
} from '../config/xuanjianCanonical.js';
import type { DevEncounterType } from '../types/cultivationCanonical.js';

function parseCsvIds(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function cultivationErrorMessage(error: unknown): string {
  const databaseNotice = databaseErrorNotice(error);
  if (databaseNotice) return databaseNotice;
  return error instanceof Error ? error.message : String(error);
}

function formatNamedList(items: Array<{ name: string }>): string {
  return items.length > 0 ? items.map((item) => item.name).join('、') : '无';
}

function pendingHistoryNotice(count = 0): string {
  return count ? `\n\n有 ${count} 条已结算记录正在同步，历史统计可能尚未更新完整，请勿重复下注。` : '';
}

function formatOptionsList(items: Array<{ id: string; name: string }>): string {
  return items.length > 0
    ? items.map((item) => `${item.name}(${item.id})`).join('、')
    : '无';
}

class CultivationCommandHandlers {
  bot: TelegramBot;

  cultivationService: CultivationService;

  constructor(bot: TelegramBot, cultivationService = new CultivationService()) {
    this.bot = bot;
    this.cultivationService = cultivationService;
  }

  private isDevEncounterEnabled(): boolean {
    return (process.env.NODE_ENV ?? 'development') !== 'production';
  }

  async dispatchCommand(msg: TelegramBot.Message, command: string, input: string): Promise<boolean> {
    const match = /^(.*)$/s.exec(input);
    const handlers: Record<string, () => Promise<void>> = {
      realm: () => this.handleRealmCommand(msg),
      divination: () => this.handleDivinationCommand(msg, match),
      divination_history: () => this.handleDivinationHistoryCommand(msg),
      divination_chart: () => this.handleDivinationChartCommand(msg),
      breakthrough: () => this.handleBreakthroughCommand(msg),
      loadout: () => this.handleLoadoutCommand(msg),
      equip_art: () => this.handleEquipArtCommand(msg, match),
      equip_support: () => this.handleEquipSupportCommand(msg, match),
      equip_power: () => this.handleEquipPowerCommand(msg, match),
      ascension: () => this.handleAscensionCommand(msg),
      confirm_ascension: () => this.handleConfirmAscensionCommand(msg),
      rankings: () => this.handleRankingsCommand(msg),
      mystats: () => this.handleMyStatsCommand(msg),
      stones: () => this.handleStonesCommand(msg),
      dev_combat_detail: () => this.handleDevCombatDetailCommand(msg, match),
      dev_set_injury: () => this.handleDevSetInjuryCommand(msg, match),
      dev_grant_art: () => this.handleDevGrantArtCommand(msg, match),
      dev_grant_power: () => this.handleDevGrantPowerCommand(msg, match),
      dev_encounter_set: () => this.handleDevEncounterSetCommand(msg, /^(\w+)\s+(\d+)$/.exec(input)),
      dev_encounter_status: () => this.handleDevEncounterStatusCommand(msg),
      dev_encounter_clear: () => this.handleDevEncounterClearCommand(msg)
    };
    const handler = handlers[command];
    if (!Object.prototype.hasOwnProperty.call(handlers, command)) return false;
    if (command.startsWith('dev_') && !this.isDevEncounterEnabled()) {
      await sendTelegramMessage(this.bot, msg.chat.id, '❌ 该命令仅在开发环境可用');
      return true;
    }
    await handler!();
    return true;
  }

  async handleDevEncounterSetCommand(
    msg: TelegramBot.Message,
    match?: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    if (!this.isDevEncounterEnabled()) {
      await sendTelegramMessage(this.bot, chatId, '❌ 该命令仅在开发环境可用');
      return;
    }

    const type = match?.[1] as DevEncounterType | undefined;
    const count = Number.parseInt(match?.[2] ?? '', 10);

    if (!type || Number.isNaN(count)) {
      await sendTelegramMessage(this.bot, chatId, '❌ 用法：/dev_encounter_set <none|stones|item|combat|offer> <count>');
      return;
    }

    try {
      const script = await this.cultivationService.setDevEncounterScript(userId, type, count);
      let message = '🧪 开发奇遇脚本已设置\n\n';
      message += `类别：${script.type}\n`;
      message += `次数：${script.remainingUses} 次\n\n`;
      message += `接下来 ${script.remainingUses} 次专注奇遇将固定进入 ${script.type} 类别随机结果。`;
      await sendTelegramMessage(this.bot, chatId, message);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
    }
  }

  async handleDevCombatDetailCommand(
    msg: TelegramBot.Message,
    match?: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    if (!this.isDevEncounterEnabled()) {
      await sendTelegramMessage(this.bot, chatId, '❌ 该命令仅在测试环境可用');
      return;
    }

    const action = match?.[1] ?? 'status';

    try {
      if (action === 'status') {
        const enabled = await this.cultivationService.getDevCombatDetailStatus(userId);
        await sendTelegramMessage(this.bot, chatId, `🧪 详细战报状态：${enabled ? 'on' : 'off'}`);
        return;
      }

      if (action !== 'on' && action !== 'off') {
        await sendTelegramMessage(this.bot, chatId, '❌ 用法：/dev_combat_detail <on|off|status>');
        return;
      }

      const enabled = await this.cultivationService.setDevCombatDetailEnabled(userId, action === 'on');
      await sendTelegramMessage(this.bot, chatId, `🧪 详细战报已${enabled ? '开启' : '关闭'}`);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
    }
  }

  async handleDevSetInjuryCommand(
    msg: TelegramBot.Message,
    match?: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    if (!this.isDevEncounterEnabled()) {
      await sendTelegramMessage(this.bot, chatId, '❌ 该命令仅在测试环境可用');
      return;
    }

    const level = match?.[1];
    if (!level || !['none', 'light', 'medium', 'heavy'].includes(level)) {
      await sendTelegramMessage(this.bot, chatId, '❌ 用法：/dev_set_injury <none|light|medium|heavy>');
      return;
    }

    try {
      const result = await this.cultivationService.setInjuryLevelForTesting(
        userId,
        level as 'none' | 'light' | 'medium' | 'heavy'
      );
      await sendTelegramMessage(this.bot, chatId, `🧪 当前伤势已设为：${formatInjuryLevelLabel(result.level)}`);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
    }
  }

  async handleDevGrantArtCommand(
    msg: TelegramBot.Message,
    match?: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    if (!this.isDevEncounterEnabled()) {
      await sendTelegramMessage(this.bot, chatId, '❌ 该命令仅在测试环境可用');
      return;
    }

    const ids = parseCsvIds(match?.[1]);
    if (ids.length === 0) {
      await sendTelegramMessage(this.bot, chatId, '❌ 用法：/dev_grant_art <id[,id...]> ');
      return;
    }

    try {
      const result = await this.cultivationService.grantBattleArtsForTesting(userId, ids);
      let message = '🧪 开发法门授予成功\n\n';
      message += `新增法门：${result.grantedNames.join('、')}\n`;
      message += `数量：${result.grantedIds.length}`;
      await sendTelegramMessage(this.bot, chatId, message);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
    }
  }

  async handleDevEncounterStatusCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    if (!this.isDevEncounterEnabled()) {
      await sendTelegramMessage(this.bot, chatId, '❌ 该命令仅在开发环境可用');
      return;
    }

    try {
      const script = await this.cultivationService.getDevEncounterScript(userId);
      if (!script) {
        await sendTelegramMessage(this.bot, chatId, '🧪 当前未设置开发奇遇脚本');
        return;
      }

      let message = '🧪 当前开发奇遇脚本\n\n';
      message += `类别：${script.type}\n`;
      message += `剩余次数：${script.remainingUses}\n`;
      message += `更新时间：${script.updatedAt.toISOString()}`;
      await sendTelegramMessage(this.bot, chatId, message);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
    }
  }

  async handleDevGrantPowerCommand(
    msg: TelegramBot.Message,
    match?: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    if (!this.isDevEncounterEnabled()) {
      await sendTelegramMessage(this.bot, chatId, '❌ 该命令仅在测试环境可用');
      return;
    }

    const ids = parseCsvIds(match?.[1]);
    if (ids.length === 0) {
      await sendTelegramMessage(this.bot, chatId, '❌ 用法：/dev_grant_power <id[,id...]> ');
      return;
    }

    try {
      const result = await this.cultivationService.grantDivinePowersForTesting(userId, ids);
      let message = '🧪 开发神通授予成功\n\n';
      message += `新增神通：${result.grantedNames.join('、')}\n`;
      message += `数量：${result.grantedIds.length}`;
      await sendTelegramMessage(this.bot, chatId, message);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
    }
  }

  async handleDevEncounterClearCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    if (!this.isDevEncounterEnabled()) {
      await sendTelegramMessage(this.bot, chatId, '❌ 该命令仅在开发环境可用');
      return;
    }

    try {
      await this.cultivationService.clearDevEncounterScript(userId);
      await sendTelegramMessage(this.bot, chatId, '🧪 开发奇遇脚本已清除');
    } catch (error) {
      const message = cultivationErrorMessage(error);
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
    }
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
      message += `⚡ 当前修为：${status.user.cultivation.spiritualPower}\n`;
      message += `🧭 当前道行：${status.cultivationAttainment}\n`;
      const mainDaoTrack = status.canonicalState?.mainDaoTrack;
      const daoTrackDisplay = getMainDaoTrackDisplayName(mainDaoTrack);
      message += isUniversalDaoTrack(mainDaoTrack)
        ? `☯️ 当前道统：${daoTrackDisplay}\n`
        : `☯️ 当前主道统：${daoTrackDisplay}\n`;
      message += `📘 主修功法：${status.mainMethodName}\n`;
      message += `🗂 已习法门：${status.knownBattleArtCount}\n`;
      message += `✨ 已掌神通：${status.knownDivinePowerCount}\n`;
      message += `💎 灵石：${status.immortalStones}`;
      if (status.pendingFocusRewardCount) {
        message += `\n\n${status.pendingFocusRewardCount} 项附加奖励等待同步，专注任务可以照常进行。`;
      }

      if (status.ascensions > 0) {
        message += `\n☁️ 飞升次数：${status.ascensions}`;
        message += `\n👑 仙位印记：${status.immortalMarks}`;
      }

      if (status.breakthroughSuccesses + status.breakthroughFailures > 0) {
        message += '\n\n📜 渡劫记录：';
        message += `\n✅ 成功：${status.breakthroughSuccesses} 次`;
        message += `\n❌ 失败：${status.breakthroughFailures} 次`;
      }

      if (status.activeBuff) {
        message += `\n\n🔮 ${status.activeBuff}`;
      }

      const injury = status.canonicalState?.injuryState;
      if (injury && injury.level !== 'none') {
        message += `\n🩹 当前伤势：${formatInjuryLevelLabel(injury.level)}`;
      }

      const latestCombat = status.canonicalState?.combatHistorySummary.at(-1);
      if (latestCombat) {
        message += `\n⚔️ 最近斗法：${latestCombat.summary}`;
      }

      if (status.canBreakthrough) {
        message += '\n\n⚡⚡⚡ 灵力已达巅峰！';
        message += '\n可使用 /breakthrough 尝试渡劫突破！';
      }

      const offer = status.canonicalState?.combatFlags?.pendingEncounterOffer as {
        offerId?: string; lootDisplayName?: string
      };
      if (offer?.offerId) message += `\n\n待选择的守宝奇遇：${offer.lootDisplayName ?? '已发现宝物'}。`;
      await sendTelegramMessage(this.bot, chatId, message, offer?.offerId ? { reply_markup: { inline_keyboard: [[
        { text: '离开，放弃此宝', callback_data: `encounter_abandon_${offer.offerId}` },
        { text: '争抢此宝', callback_data: `encounter_contest_${offer.offerId}` }
      ]] } } : undefined);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      logger.error(`/realm 命令错误: ${message}`, { userId });
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
    }
  }

  async handleLoadoutCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    try {
      const loadout = await this.cultivationService.getCombatLoadoutStatus(userId);
      const availableBattleArts = loadout.availableBattleArts ?? [];
      const availableSupportArts = loadout.availableSupportArts ?? [];
      const availableDivinePowers = loadout.availableDivinePowers ?? [];
      let message = '⚔️ 战斗构筑\n\n';
      message += `当前境界：${loadout.realmName}\n`;
      message += `主战法门：${formatNamedList(loadout.battleArts)}\n`;
      message += `辅助法门：${loadout.supportArt?.name ?? '无'}\n`;
      message += `已配神通：${formatNamedList(loadout.divinePowers)}\n\n`;
      message += `可用主战法门：${formatOptionsList(availableBattleArts)}\n`;
      message += `可用辅助法门：${formatOptionsList(availableSupportArts)}\n`;
      message += `可用神通：${formatOptionsList(availableDivinePowers)}\n\n`;
      message += '用法：\n';
      message += '• /equip_art <id[,id...]>\n';
      message += '• /equip_support <id|none>\n';
      message += '• /equip_power <id[,id...]|none>';

      await sendTelegramMessage(this.bot, chatId, message);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      logger.error(`/loadout 命令错误: ${message}`, { userId });
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
    }
  }

  async handleEquipArtCommand(
    msg: TelegramBot.Message,
    match?: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    const ids = parseCsvIds(match?.[1]);
    if (ids.length === 0) {
      await sendTelegramMessage(this.bot, chatId, '❌ 用法：/equip_art <id[,id...]> ');
      return;
    }

    try {
      const loadout = await this.cultivationService.updateBattleArtLoadout(userId, ids);
      let message = '✅ 主战法门已更新\n\n';
      message += `当前：${formatNamedList(loadout.battleArts)}`;
      await sendTelegramMessage(this.bot, chatId, message);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      logger.error(`/equip_art 命令错误: ${message}`, { userId });
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
    }
  }

  async handleEquipSupportCommand(
    msg: TelegramBot.Message,
    match?: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    const raw = match?.[1]?.trim();
    if (!raw) {
      await sendTelegramMessage(this.bot, chatId, '❌ 用法：/equip_support <id|none>');
      return;
    }

    try {
      const loadout = await this.cultivationService.updateSupportArtLoadout(
        userId,
        raw === 'none' ? null : raw
      );
      let message = '✅ 辅助法门已更新\n\n';
      message += `当前：${loadout.supportArt?.name ?? '无'}`;
      await sendTelegramMessage(this.bot, chatId, message);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      logger.error(`/equip_support 命令错误: ${message}`, { userId });
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
    }
  }

  async handleEquipPowerCommand(
    msg: TelegramBot.Message,
    match?: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    const raw = match?.[1]?.trim();
    if (!raw) {
      await sendTelegramMessage(this.bot, chatId, '❌ 用法：/equip_power <id[,id...]|none>');
      return;
    }

    const ids = raw === 'none' ? [] : parseCsvIds(raw);

    try {
      const loadout = await this.cultivationService.updateDivinePowerLoadout(userId, ids);
      let message = '✅ 神通构筑已更新\n\n';
      message += `当前：${formatNamedList(loadout.divinePowers)}`;
      await sendTelegramMessage(this.bot, chatId, message);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      logger.error(`/equip_power 命令错误: ${message}`, { userId });
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
    }
  }

  async handleDivinationCommand(
    msg: TelegramBot.Message,
    match?: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const betAmountStr = match?.[1]?.trim() ?? '';
    let settled = false;
    let waitMessageId: number | undefined;

    if (!userId) {
      return;
    }

    try {
      const betAmount = Number.parseInt(betAmountStr, 10);

      if (Number.isNaN(betAmount) || betAmount <= 0) {
        await sendTelegramMessage(this.bot, chatId, '❌ 请输入有效的下注金额！\n\n示例：/divination 100');
        return;
      }

      const waitMsg = await sendTelegramMessage(this.bot, chatId, '🔮 占卜天机中...\n✨ 八卦流转，天机显现...');
      waitMessageId = waitMsg.message_id;
      const result = await this.cultivationService.castDivination(userId, betAmount);
      settled = true;

      let message = `${result.gua.emoji} 得 ${result.gua.name} - ${result.gua.meaning}！\n\n`;
      message += `💰 下注：${result.betAmount} 灵石\n`;
      message += `📊 倍率：${result.gua.multiplier}x\n`;

      const resultEmoji = result.result > 0 ? '📈' : '📉';
      const resultText = result.result > 0 ? `+${result.result}` : `${result.result}`;
      message += `${resultEmoji} 结果：${resultText} 灵石\n\n`;

      message += `💎 当前灵石：${result.stonesAfter}\n`;
      message += '🧭 本次不影响境界与修为\n\n';
      message += `🔮 ${result.buff.label}：${result.buff.description}`;

      message += '\n\n继续占卜：/divination <灵石>';
      message += '\n查看走势：/divination_chart';
      if (result.historyPending) message += '\n\n本次已结算，历史记录正在同步；无需重复下注。';

      await this.bot.deleteMessage(chatId, waitMsg.message_id).catch(error => {
        logger.warn('占卜已结算，等待消息未能删除', { userId,
          error: error instanceof Error ? error.message : String(error) });
      });
      waitMessageId = undefined;
      await sendTelegramMessage(this.bot, chatId, message);
    } catch (error) {
      if (waitMessageId !== undefined) {
        await this.bot.deleteMessage(chatId, waitMessageId).catch(cleanupError => {
          logger.warn('占卜等待消息清理失败', { userId,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) });
        });
      }
      const message = settled
        ? '本次占卜已结算，结果提示未能送达；请查看 /realm 或 /divination_history，不要重复下注。'
        : cultivationErrorMessage(error);
      logger.error(`/divination 命令错误: ${message}`, { userId });
      await sendTelegramMessage(this.bot, chatId, `${settled ? '提示：' : '❌ '}${message}`);
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
        await sendTelegramMessage(this.bot, chatId, history.pendingSyncCount
          ? `📜 已有结算记录等待同步${pendingHistoryNotice(history.pendingSyncCount)}`
          : '📜 暂无占卜记录\n\n使用 /divination <金额> 开始占卜');
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
      message += pendingHistoryNotice(history.pendingSyncCount);

      await sendTelegramMessage(this.bot, chatId, message);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      logger.error(`/divination_history 命令错误: ${message}`, { userId });
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
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
        await sendTelegramMessage(this.bot, chatId, '📜 暂无已同步占卜记录' +
          pendingHistoryNotice(Math.max(history.pendingSyncCount ?? 0, stats.pendingSyncCount ?? 0)));
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
      message += pendingHistoryNotice(Math.max(history.pendingSyncCount ?? 0, stats.pendingSyncCount ?? 0));

      await sendTelegramMessage(this.bot, chatId, message);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      logger.error(`/divination_chart 命令错误: ${message}`, { userId });
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
    }
  }

  async handleBreakthroughCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    try {
      const waitMsg = await sendTelegramMessage(this.bot, chatId, '🌩️ 天劫降临！\n⚡⚡⚡ 九天雷劫齐至...');
      const result = await this.cultivationService.attemptBreakthrough(userId);

      await this.bot.deleteMessage(chatId, waitMsg.message_id);
      await sendTelegramMessage(this.bot, chatId, result.message);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      logger.error(`/breakthrough 命令错误: ${message}`, { userId });
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
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

      if (status.realm.canonicalId !== 'realm.yuanying') {
        await sendTelegramMessage(this.bot, chatId, `❌ 只有元婴修士才能飞升！\n\n当前境界：${status.fullName}`);
        return;
      }

      const requiredPower = 50000;
      if (status.user.cultivation.spiritualPower < requiredPower) {
        await sendTelegramMessage(this.bot,
          chatId,
          `❌ 飞升需要 ${requiredPower} 灵力！\n\n`
            + `当前灵力：${status.user.cultivation.spiritualPower}\n`
            + `还需：${requiredPower - status.user.cultivation.spiritualPower} 灵力`
        );
        return;
      }

      let message = '🌟 您已达到元婴圆满！\n☁️ 天门已开，是否飞升仙界？\n\n';
      message += '飞升后：\n';
      message += '✅ 获得 ☁️ 仙位印记 x1（永久）\n';
      message += `✅ 保留灵石：${status.immortalStones}\n`;
      message += '⚠️ 灵力重置为 0\n';
      message += '⚠️ 境界回到炼气期\n\n';
      message += '使用 /confirm_ascension 确认飞升';

      await sendTelegramMessage(this.bot, chatId, message);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      logger.error(`/ascension 命令错误: ${message}`, { userId });
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
    }
  }

  async handleConfirmAscensionCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return;
    }

    try {
      const waitMsg = await sendTelegramMessage(this.bot, chatId, '☁️☁️☁️ 天门洞开...\n🌟 飞升进行中...');
      const result = await this.cultivationService.ascend(userId);

      await this.bot.deleteMessage(chatId, waitMsg.message_id);
      await sendTelegramMessage(this.bot, chatId, result.message);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      logger.error(`/confirm_ascension 命令错误: ${message}`, { userId });
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
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
        const canonicalState = user.cultivation.canonical?.state ?? {
          realmId: getCanonicalRealmByPower(user.cultivation.spiritualPower).id,
          currentPower: user.cultivation.spiritualPower
        };
        const display = formatCanonicalRealmDisplay(canonicalState);
        message += `${index + 1}. ${user.username || `用户${user.userId}`} - `;
        message += `${user.cultivation.spiritualPower} 修为 `;
        message += `(${display.realm.name})\n`;
      });

      message += '\n🏔️ 境界榜（Top 10）\n';
      realmRanking.forEach((user, index) => {
        const canonicalState = user.cultivation.canonical?.state ?? {
          realmId: getCanonicalRealmByPower(user.cultivation.spiritualPower).id,
          currentPower: user.cultivation.spiritualPower
        };
        const display = formatCanonicalRealmDisplay(canonicalState);
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

      await sendTelegramMessage(this.bot, chatId, message);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      logger.error(`/rankings 命令错误: ${message}`);
      await sendTelegramMessage(this.bot, chatId, '❌ 获取排行榜失败');
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
      message += `💎 当前灵石：${status.immortalStones}\n\n`;

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
      message += `净收益：${divinationStats.netProfit > 0 ? '+' : ''}${divinationStats.netProfit} 灵石\n`;
      message += pendingHistoryNotice(divinationStats.pendingSyncCount);

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

      await sendTelegramMessage(this.bot, chatId, message);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      logger.error(`/mystats 命令错误: ${message}`, { userId });
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
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

      let message = '💎 灵石余额\n\n';
      message += `当前灵石：${status.immortalStones}\n\n`;
      message += '📊 占卜盈亏：\n';
      message += `总盈利：+${divinationStats.totalGain}\n`;
      message += `总亏损：-${divinationStats.totalLoss}\n`;
      message += `净收益：${divinationStats.netProfit > 0 ? '+' : ''}${divinationStats.netProfit}\n\n`;
      message += pendingHistoryNotice(divinationStats.pendingSyncCount);
      message += '💡 提示：\n';
      message += '• 完成任务获得灵石\n';
      message += '• 使用 /divination <金额> 占卜天机';

      await sendTelegramMessage(this.bot, chatId, message);
    } catch (error) {
      const message = cultivationErrorMessage(error);
      logger.error(`/stones 命令错误: ${message}`, { userId });
      await sendTelegramMessage(this.bot, chatId, `❌ ${message}`);
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
