import type TelegramBot from 'node-telegram-bot-api';
import type BotConfig from '../config/bot.js';
import type TaskService from '../services/TaskService.js';
import User from '../models/User.js';

type ErrorReporter = (userId: number, message: string) => Promise<void>;

interface CoreCommandDependencies {
  bot: TelegramBot;
  config: BotConfig;
  taskService: TaskService;
  onError: ErrorReporter;
}

class CoreCommandHandlers {
  bot: TelegramBot;

  config: BotConfig;

  taskService: TaskService;

  onError: ErrorReporter;

  constructor({ bot, config, taskService, onError }: CoreCommandDependencies) {
    this.bot = bot;
    this.config = config;
    this.taskService = taskService;
    this.onError = onError;
  }

  async handleStartCommand(userId: number, userInfo: TelegramBot.User): Promise<void> {
    await User.findOrCreate({
      userId,
      username: userInfo.username,
      firstName: userInfo.first_name,
      lastName: userInfo.last_name
    });

    const botInfo = this.config.getBotInfo();
    const welcomeMessage = `🧙‍♂️ **欢迎踏入修仙之路！**

${botInfo.description}

**📚 基础功能：**
• 完成任务获得灵力和仙石
• 提升境界，最终飞升成仙
• 占卜天机，改变命运

**⚡ 核心命令：**
• \`/task 任务描述 时长\` - 闭关修炼
• \`/realm\` - 查看境界和灵力
• \`/divination <仙石>\` - 占卜天机
• \`/rankings\` - 修仙排行榜
• \`/help\` - 查看所有命令

**🎯 修仙之路：**
🌱 炼气期 → 🏔️ 筑基期 → 💊 金丹期 → 👶✨ 元婴期 → 🔮 化神期
🌌 炼虚期 → ☯️ 合体期 → ⚡ 渡劫期 → 🌟 大乘期 → ☁️ 飞升成仙

开始你的修仙之旅吧！💪`;

    await this.bot.sendMessage(userId, welcomeMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🚀 开始修炼', callback_data: 'quick_task' },
          { text: '⚡ 查看境界', callback_data: 'quick_realm' }
        ], [
          { text: '📊 修仙排行榜', callback_data: 'quick_rankings' },
          { text: '❓ 帮助', callback_data: 'quick_help' }
        ]]
      }
    });
  }

  async handleHelpCommand(userId: number): Promise<void> {
    const commands = this.config.getSupportedCommands();
    const helpText = `📚 <b>命令帮助</b>

${commands.map((cmd) => `/${cmd.command} - ${cmd.description.replace(/</g, '&lt;').replace(/>/g, '&gt;')}`).join('\n')}

<b>使用示例：</b>
<code>/task 学习Python 45</code> - 创建45分钟学习任务
<code>/task 写作业</code> - 创建默认25分钟任务
<code>/reserve 准备考试 60</code> - 预约60分钟后开始

<b>重要提醒：</b>
🔴 <b>神圣座位原理</b> - 任何任务失败都会重置所有进度
⏰ <b>15分钟预约</b> - 降低60%的启动阻力

如需更多帮助，请查看 /settings 进行个性化配置。`;

    await this.bot.sendMessage(userId, helpText, { parse_mode: 'HTML' });
  }

  async handleStatusCommand(userId: number): Promise<void> {
    try {
      const status = await this.taskService.getUserStatus(userId, { includeTodayStats: false });

      if (!status.user) {
        await this.bot.sendMessage(userId, '请先使用 /start 命令初始化您的账户。');
        return;
      }

      const { user, activeChain, currentTask } = status;
      let statusMessage = '📊 **您的专注状态**\n\n';

      if (currentTask) {
        const elapsed = Math.floor((Date.now() - new Date(currentTask.startTime).getTime()) / 60000);
        statusMessage += '🎯 **当前任务**\n';
        statusMessage += `📋 ${currentTask.description}\n`;
        statusMessage += `⏱ 已进行：${elapsed}分钟 / ${currentTask.duration}分钟\n`;
        statusMessage += `📈 进度：${Math.min(100, Math.round((elapsed / currentTask.duration) * 100))}%\n\n`;
      } else {
        statusMessage += '💤 当前没有进行中的任务\n\n';
      }

      statusMessage += '🏆 **总体统计**\n';
      statusMessage += `✅ 完成任务：${user.stats.completedTasks}\n`;
      statusMessage += `🔥 当前连击：${user.stats.currentStreak}\n`;
      statusMessage += `🎖 最长连击：${user.stats.longestStreak}\n`;
      statusMessage += `⏰ 总专注时长：${Math.floor(user.stats.totalMinutes / 60)}小时${user.stats.totalMinutes % 60}分钟\n`;
      statusMessage += `📊 成功率：${user.successRate ?? 0}%\n\n`;

      if (activeChain) {
        statusMessage += '⛓ **任务链状态**\n';
        statusMessage += `📈 链中任务：${activeChain.completedTasks}/${activeChain.totalTasks}\n`;
        statusMessage += `🎯 链条状态：${activeChain.status === 'active' ? '活跃' : '已中断'}\n`;
      }

      // CTDP/RSIP status
      try {
        const { MainChain, AuxChain, PrecedentRule } = await import('../models/index.js');
        const { default: PatternTree } = await import('../models/PatternTree.js');

        const mainChain = await MainChain.findOne({ userId }).sort({ updatedAt: -1, createdAt: -1 });
        const auxChain = await AuxChain.findOne({ userId, status: 'active' });
        const precedentCount = await PrecedentRule.countDocuments({ userId });
        const patternTree = await PatternTree.findOne({ userId });

        statusMessage += '\n🧠 **CTDP 协议状态**\n';
        if (mainChain) {
          statusMessage += `⛓ 主链节点：${mainChain.nodes.length}\n`;
          statusMessage += `🎯 主链状态：${mainChain.status === 'active' ? '活跃' : '已中断'}\n`;
        }
        if (auxChain?.pendingReservation) {
          statusMessage += `⏰ 预约状态：${auxChain.pendingReservation.status}\n`;
        } else {
          statusMessage += '⏰ 预约状态：无预约\n';
        }
        statusMessage += `⚖️ 判例数：${precedentCount}\n`;
        statusMessage += `🌲 定式树节点：${patternTree?.nodes.length ?? 0}\n`;
      } catch {
        // CTDP/RSIP data is optional, don't fail the whole status command
      }

      await this.bot.sendMessage(userId, statusMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🚀 开始新任务', callback_data: 'quick_task' },
            { text: '📊 详细统计', callback_data: 'quick_stats' }
          ]]
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.onError(userId, message);
    }
  }

  async handleStatsCommand(userId: number): Promise<void> {
    try {
      const status = await this.taskService.getUserStatus(userId);

      if (!status.user) {
        await this.bot.sendMessage(userId, '请先使用 /start 命令初始化您的账户。');
        return;
      }

      if (!status.todayStats) {
        throw new Error('获取今日统计失败');
      }

      const today = new Date().toLocaleDateString('zh-CN');
      let statsMessage = `📈 **今日统计** (${today})\n\n`;
      const { todayStats } = status;

      if (todayStats.stats.tasksStarted > 0) {
        statsMessage += `🎯 启动任务：${todayStats.stats.tasksStarted}\n`;
        statsMessage += `✅ 完成任务：${todayStats.stats.tasksCompleted}\n`;
        statsMessage += `❌ 失败任务：${todayStats.stats.tasksFailed}\n`;
        statsMessage += `⏰ 专注时长：${todayStats.stats.totalMinutes}分钟\n`;
        statsMessage += `📊 成功率：${todayStats.stats.successRate.toFixed(1)}%\n\n`;

        if (todayStats.stats.averageTaskDuration > 0) {
          statsMessage += `📏 平均时长：${todayStats.stats.averageTaskDuration}分钟\n`;
        }
      } else {
        statsMessage += '💤 今日还未开始任何任务\n\n';
      }

      const { user } = status;
      statsMessage += '🏆 **历史总览**\n';
      statsMessage += `✅ 总完成：${user.stats.completedTasks} 任务\n`;
      statsMessage += `🔥 当前连击：${user.stats.currentStreak}\n`;
      statsMessage += `🎖 最佳记录：${user.stats.longestStreak} 连击\n`;

      const totalHours = Math.floor(user.stats.totalMinutes / 60);
      const remainingMinutes = user.stats.totalMinutes % 60;
      statsMessage += `⏰ 累计专注：${totalHours}小时${remainingMinutes}分钟\n`;

      await this.bot.sendMessage(userId, statsMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '📅 周报告', callback_data: 'quick_week' },
            { text: '🚀 开始任务', callback_data: 'quick_task' }
          ]]
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.onError(userId, message);
    }
  }

  async handleWeekCommand(userId: number): Promise<void> {
    await this.bot.sendMessage(
      userId,
      '📅 **周报功能**\n\n'
        + '本周数据汇总功能正在开发中。\n'
        + '当前可使用以下命令查看数据：\n\n'
        + '• `/status` — 查看当前状态（含 CTDP/RSIP 数据）\n'
        + '• `/stats` — 查看今日统计\n'
        + '• `/patterns` — 查看 RSIP 定式树',
      { parse_mode: 'Markdown' }
    );
  }

  async handleSettingsCommand(userId: number): Promise<void> {
    await this.bot.sendMessage(
      userId,
      '⚙️ **个人设置**\n\n'
        + '此功能正在开发中，将支持：\n'
        + '• 默认任务时长设置\n'
        + '• 提醒偏好配置\n'
        + '• 时区设置\n'
        + '• 通知开关\n\n'
        + '当前使用默认配置，敬请期待！',
      { parse_mode: 'Markdown' }
    );
  }

  async handleTextInput(msg: TelegramBot.Message): Promise<void> {
    const userId = msg.from?.id;
    const text = msg.text;

    if (!userId || !text) {
      return;
    }

    if (text.includes('任务') || text.includes('专注') || text.includes('学习') || text.includes('工作')) {
      await this.bot.sendMessage(
        userId,
        `看起来您想创建一个任务！\n\n`
          + `使用命令格式：\`/task ${text} [时长]\`\n\n`
          + `例如：\`/task ${text} 30\` (30分钟)`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '🚀 立即创建25分钟任务', callback_data: `create_task:${text}:25` },
              { text: '⏰ 预约15分钟后开始', callback_data: `reserve_task:${text}:25` }
            ]]
          }
        }
      );
      return;
    }

    await this.bot.sendMessage(
      userId,
      '💭 我理解您的输入，但请使用具体的命令来操作。\n\n输入 /help 查看所有可用命令。',
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '❓ 查看帮助', callback_data: 'quick_help' },
            { text: '🚀 开始任务', callback_data: 'quick_task' }
          ]]
        }
      }
    );
  }

  async sendQuickHelp(userId: number): Promise<void> {
    await this.handleHelpCommand(userId);
  }
}

export default CoreCommandHandlers;
