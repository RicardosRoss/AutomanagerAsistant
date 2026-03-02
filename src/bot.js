import TelegramBot from 'node-telegram-bot-api';
import BotConfig from './config/bot.js';
import TaskService from './services/TaskService.js';
import QueueService from './services/QueueService.js';
import CultivationService from './services/CultivationService.js';
import logger from './utils/logger.js';
import {
  BOT_COMMANDS,
  CALLBACK_PREFIXES,
  NOTIFICATION_TEMPLATES
} from './utils/constants.js';
import CultivationCommandHandlers from './handlers/cultivationCommands.js';

/**
 * Telegram自控力助手Bot
 * 实现神圣座位原理和线性时延原理
 */
class SelfControlBot {
  constructor() {
    this.config = new BotConfig();
    this.bot = null;
    this.queueService = new QueueService();
    this.cultivationService = new CultivationService();
    this.taskService = new TaskService(this.queueService, this.cultivationService); // 传递共享的服务
    this.cultivationHandlers = null; // 修仙命令处理器
    this.isRunning = false;

    // 绑定处理器方法
    this.handleMessage = this.handleMessage.bind(this);
    this.handleCallbackQuery = this.handleCallbackQuery.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  /**
   * 启动Bot
   */
  async start() {
    try {
      // 创建Bot实例
      this.bot = new TelegramBot(
        this.config.token,
        this.config.getBotOptions()
      );

      // 设置Bot实例到QueueService（用于发送消息）
      this.queueService.setBotInstance(this.bot);

      // 初始化QueueService
      await this.queueService.initialize();

      // 设置命令列表
      await this.setupCommands();

      // 注册事件处理器
      this.registerEventHandlers();

      // 设置WebHook（生产环境）
      if (this.config.options.webHook) {
        try {
          await this.setupWebHook();
        } catch (error) {
          logger.warn('Webhook设置失败，回退到polling模式', { error: error.message });
          // 回退到polling模式
          await this.bot.startPolling();
        }
      } else {
        // 开发环境或polling模式
        await this.bot.startPolling();
      }

      this.isRunning = true;
      const botInfo = await this.bot.getMe();

      logger.info('🤖 Telegram自控力助手启动成功', {
        botName: botInfo.first_name,
        botUsername: botInfo.username,
        environment: process.env.NODE_ENV,
        polling: this.config.options.polling
      });

      return this;
    } catch (error) {
      logger.error('Bot启动失败', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * 设置Bot命令
   */
  async setupCommands() {
    try {
      const commands = this.config.getSupportedCommands();
      await this.bot.setMyCommands(commands);
      logger.info('Bot命令设置完成', { commandCount: commands.length });
    } catch (error) {
      logger.error('设置Bot命令失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 注册事件处理器
   */
  registerEventHandlers() {
    // 消息处理
    this.bot.on('message', this.handleMessage);

    // 回调查询处理
    this.bot.on('callback_query', this.handleCallbackQuery);

    // 错误处理
    this.bot.on('polling_error', this.handleError);
    this.bot.on('webhook_error', this.handleError);

    logger.info('Bot事件处理器注册完成');

    // 注册修仙系统命令
    this.cultivationHandlers = new CultivationCommandHandlers(this.bot);
    this.cultivationHandlers.registerCommands();
    logger.info('修仙系统命令已注册');
  }

  /**
   * 处理文本消息
   */
  async handleMessage(msg) {
    const userId = msg.from.id;
    const username = msg.from.username || `${msg.from.first_name} ${msg.from.last_name || ''}`.trim();
    const text = msg.text || '';

    logger.logBotCommand(userId, text, { username, chatId: msg.chat.id });

    try {
      // 解析命令
      if (text.startsWith('/')) {
        await this.handleCommand(msg);
      } else {
        // 处理非命令文本（可能是任务描述）
        await this.handleTextInput(msg);
      }
    } catch (error) {
      logger.logError(error, { userId, text, command: 'message_handler' });
      await this.sendErrorMessage(userId, '处理消息时发生错误，请稍后重试');
    }
  }

  /**
   * 处理命令
   */
  async handleCommand(msg) {
    const userId = msg.from.id;
    const { text } = msg;
    const [command, ...args] = text.slice(1).split(' ');

    // 修仙系统命令列表（由 CultivationCommandHandlers 处理）
    const cultivationCommands = [
      'realm', 'divination', 'divination_history', 'divination_chart',
      'breakthrough', 'ascension', 'confirm_ascension',
      'rankings', 'mystats', 'stones'
    ];

    // 如果是修仙命令，不处理（由 CultivationCommandHandlers 处理）
    if (cultivationCommands.includes(command.toLowerCase())) {
      return;
    }

    switch (command.toLowerCase()) {
      case BOT_COMMANDS.START:
        await this.handleStartCommand(userId, msg.from);
        break;

      case BOT_COMMANDS.HELP:
        await this.handleHelpCommand(userId);
        break;

      case BOT_COMMANDS.TASK:
        await this.handleTaskCommand(userId, args.join(' '));
        break;

      case BOT_COMMANDS.RESERVE:
        await this.handleReserveCommand(userId, args.join(' '));
        break;

      case BOT_COMMANDS.STATUS:
        await this.handleStatusCommand(userId);
        break;

      case BOT_COMMANDS.STATS:
        await this.handleStatsCommand(userId);
        break;

      case BOT_COMMANDS.WEEK:
        await this.handleWeekCommand(userId);
        break;

      case BOT_COMMANDS.SETTINGS:
        await this.handleSettingsCommand(userId);
        break;

      default:
        await this.bot.sendMessage(
          userId,
          '未知命令。使用 /help 查看可用命令列表。'
        );
    }
  }

  /**
   * 处理/start命令
   */
  async handleStartCommand(userId, userInfo) {
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

    logger.logUserAction(userId, 'start_command', { username: userInfo.username });
  }

  /**
   * 处理/help命令
   */
  async handleHelpCommand(userId) {
    const commands = this.config.getSupportedCommands();
    const helpText = `📚 **命令帮助**

${commands.map((cmd) => `/${cmd.command} - ${cmd.description}`).join('\n')}

**使用示例：**
\`/task 学习Python 45\` - 创建45分钟学习任务
\`/task 写作业\` - 创建默认25分钟任务
\`/reserve 准备考试 60\` - 预约60分钟后开始

**重要提醒：**
🔴 **神圣座位原理** - 任何任务失败都会重置所有进度
⏰ **15分钟预约** - 降低60%的启动阻力

如需更多帮助，请查看 /settings 进行个性化配置。`;

    await this.bot.sendMessage(userId, helpText, { parse_mode: 'Markdown' });
  }

  /**
   * 处理/task命令
   */
  async handleTaskCommand(userId, taskInput) {
    try {
      if (!taskInput.trim()) {
        await this.bot.sendMessage(
          userId,
          '请提供任务描述。\n\n示例：\n`/task 学习编程 30`\n`/task 写作业`',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const { description, duration } = this.parseTaskInput(taskInput);
      const result = await this.taskService.createTask(userId, description, duration);

      const message = NOTIFICATION_TEMPLATES.TASK_STARTED
        .replace('{description}', description)
        .replace('{duration}', duration);

      await this.bot.sendMessage(userId, message, {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ 完成任务', callback_data: `${CALLBACK_PREFIXES.COMPLETE_TASK}${result.task.taskId}` },
            { text: '❌ 放弃任务', callback_data: `${CALLBACK_PREFIXES.FAIL_TASK}${result.task.taskId}` }
          ]]
        }
      });

      logger.logTaskAction(userId, result.task.taskId, 'created', { description, duration });
    } catch (error) {
      logger.logError(error, { userId, taskInput, command: 'task' });
      await this.sendErrorMessage(userId, error.message);
    }
  }

  /**
   * 处理回调查询
   */
  async handleCallbackQuery(callbackQuery) {
    const userId = callbackQuery.from.id;
    const { data } = callbackQuery;

    try {
      // 确认回调查询
      await this.bot.answerCallbackQuery(callbackQuery.id);

      // 处理不同类型的回调
      if (data.startsWith(CALLBACK_PREFIXES.COMPLETE_TASK)) {
        await this.handleCompleteTaskCallback(userId, data);
      } else if (data.startsWith(CALLBACK_PREFIXES.FAIL_TASK)) {
        await this.handleFailTaskCallback(userId, data);
      } else if (data.startsWith(CALLBACK_PREFIXES.START_RESERVED)) {
        await this.handleStartReservedCallback(userId, data);
      } else {
        // 处理快捷回调
        await this.handleQuickCallback(userId, data);
      }
    } catch (error) {
      logger.logError(error, { userId, callbackData: data, command: 'callback_query' });
      await this.bot.answerCallbackQuery(callbackQuery.id, {
        text: '操作失败，请稍后重试',
        show_alert: true
      });
    }
  }

  /**
   * 处理完成任务回调
   */
  async handleCompleteTaskCallback(userId, data) {
    const taskId = data.replace(CALLBACK_PREFIXES.COMPLETE_TASK, '');

    try {
      const result = await this.taskService.completeTask(userId, taskId, true);

      // 基础任务完成消息
      let message = `✅ 闭关修炼结束！\n\n`;
      message += `⏰ 实际时长：${result.task.actualDuration} 分钟\n`;

      // 修仙奖励信息
      if (result.cultivationReward) {
        const reward = result.cultivationReward;

        message += `\n⚡ 获得灵力：${reward.spiritualPower} 点`;
        if (reward.bonus > 1) {
          message += ` (x${reward.bonus.toFixed(1)} 加成)`;
        }

        message += `\n💎 获得仙石：${reward.immortalStones} 颗`;

        // 仙缘事件
        if (reward.fortuneEvent && reward.fortuneEvent.message) {
          message += `\n\n${reward.fortuneEvent.message}`;
          if (reward.fortuneEvent.power > 0) {
            message += `\n⚡ 额外灵力：+${reward.fortuneEvent.power}`;
          }
          if (reward.fortuneEvent.stones > 0) {
            message += `\n💎 额外仙石：+${reward.fortuneEvent.stones}`;
          }
        }

        message += `\n\n📊 当前境界：${reward.newRealm}（${reward.newStage}）`;
        message += `\n⚡ 当前灵力：${reward.newSpiritualPower}`;

        // 境界突破提示
        if (reward.realmChanged) {
          message += `\n\n🎊🎊🎊\n✨ 恭喜！境界提升！\n${reward.oldRealm} → ${reward.newRealm}`;
        }

        message += `\n\n💡 使用 /divination 占卜天机试试手气！`;
      }

      await this.bot.sendMessage(userId, message);

      // 连击提示
      if (result.user.stats.currentStreak > 0 && result.user.stats.currentStreak % 5 === 0) {
        await this.bot.sendMessage(
          userId,
          `🔥 连击达到 ${result.user.stats.currentStreak} 次！保持专注，继续加油！`
        );
      }

      logger.logTaskAction(userId, taskId, 'completed_success');
    } catch (error) {
      await this.sendErrorMessage(userId, error.message);
    }
  }

  /**
   * 处理任务失败回调
   */
  async handleFailTaskCallback(userId, data) {
    const taskId = data.replace(CALLBACK_PREFIXES.FAIL_TASK, '');

    try {
      const result = await this.taskService.completeTask(userId, taskId, false, '用户主动放弃');

      await this.bot.sendMessage(userId, NOTIFICATION_TEMPLATES.TASK_FAILED);

      if (result.wasChainBroken) {
        await this.bot.sendMessage(userId, NOTIFICATION_TEMPLATES.CHAIN_BROKEN);
      }

      logger.logTaskAction(userId, taskId, 'completed_failure', { reason: '用户主动放弃' });
    } catch (error) {
      await this.sendErrorMessage(userId, error.message);
    }
  }

  /**
   * 解析任务输入
   */
  parseTaskInput(input) {
    const parts = input.trim().split(' ');
    const lastPart = parts[parts.length - 1];
    const duration = parseInt(lastPart, 10);

    if (!isNaN(duration) && duration >= 5 && duration <= 480) {
      return {
        description: parts.slice(0, -1).join(' ') || '专注任务',
        duration
      };
    }

    return {
      description: input || '专注任务',
      duration: 25
    };
  }

  /**
   * 处理/reserve命令
   */
  async handleReserveCommand(userId, taskInput) {
    try {
      const { description, duration } = this.parseTaskInput(taskInput || '专注任务 25');
      const reservationId = `res_${Date.now()}_${userId}`;

      // 安排15分钟后的预约
      await this.queueService.scheduleReservation(userId, reservationId, description, duration);

      await this.bot.sendMessage(userId,
        `⏰ **预约已设置**\n\n` +
        `📋 任务：${description}\n` +
        `⏱ 时长：${duration}分钟\n` +
        `🕐 预约时间：15分钟后\n\n` +
        `根据线性时延原理，15分钟的延迟将降低60%的启动阻力，` +
        `让您在最佳状态下开始任务。`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '❌ 取消预约', callback_data: `${CALLBACK_PREFIXES.CANCEL_RESERVATION}${reservationId}` }
            ]]
          }
        }
      );

      logger.logTaskAction(userId, reservationId, 'reservation_created', { description, duration });

    } catch (error) {
      logger.logError(error, { userId, taskInput, command: 'reserve' });
      await this.sendErrorMessage(userId, error.message);
    }
  }

  /**
   * 处理/status命令
   */
  async handleStatusCommand(userId) {
    try {
      const status = await this.taskService.getUserStatus(userId);

      if (!status.user) {
        await this.bot.sendMessage(userId, '请先使用 /start 命令初始化您的账户。');
        return;
      }

      const { user, activeChain, currentTask } = status;
      let statusMessage = `📊 **您的专注状态**\n\n`;

      // 当前任务状态
      if (currentTask) {
        const elapsed = Math.floor((new Date() - new Date(currentTask.startTime)) / 60000);
        statusMessage += `🎯 **当前任务**\n`;
        statusMessage += `📋 ${currentTask.description}\n`;
        statusMessage += `⏱ 已进行：${elapsed}分钟 / ${currentTask.duration}分钟\n`;
        statusMessage += `📈 进度：${Math.min(100, Math.round((elapsed / currentTask.duration) * 100))}%\n\n`;
      } else {
        statusMessage += `💤 当前没有进行中的任务\n\n`;
      }

      // 统计信息
      statusMessage += `🏆 **总体统计**\n`;
      statusMessage += `✅ 完成任务：${user.stats.completedTasks}\n`;
      statusMessage += `🔥 当前连击：${user.stats.currentStreak}\n`;
      statusMessage += `🎖 最长连击：${user.stats.longestStreak}\n`;
      statusMessage += `⏰ 总专注时长：${Math.floor(user.stats.totalMinutes / 60)}小时${user.stats.totalMinutes % 60}分钟\n`;
      statusMessage += `📊 成功率：${user.successRate}%\n\n`;

      // 链条状态
      if (activeChain) {
        statusMessage += `⛓ **任务链状态**\n`;
        statusMessage += `📈 链中任务：${activeChain.completedTasks}/${activeChain.totalTasks}\n`;
        statusMessage += `🎯 链条状态：${activeChain.status === 'active' ? '活跃' : '已中断'}\n`;
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
      logger.logError(error, { userId, command: 'status' });
      await this.sendErrorMessage(userId, error.message);
    }
  }

  /**
   * 处理/stats命令
   */
  async handleStatsCommand(userId) {
    try {
      const [status, todayStats] = await Promise.all([
        this.taskService.getUserStatus(userId),
        this.taskService.getDailyStats(userId)
      ]);

      if (!status.user) {
        await this.bot.sendMessage(userId, '请先使用 /start 命令初始化您的账户。');
        return;
      }

      const today = new Date().toLocaleDateString('zh-CN');
      let statsMessage = `📈 **今日统计** (${today})\n\n`;

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
        statsMessage += `💤 今日还未开始任何任务\n\n`;
      }

      // 历史对比
      const { user } = status;
      statsMessage += `🏆 **历史总览**\n`;
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
      logger.logError(error, { userId, command: 'stats' });
      await this.sendErrorMessage(userId, error.message);
    }
  }

  /**
   * 处理/week命令
   */
  async handleWeekCommand(userId) {
    await this.bot.sendMessage(userId,
      `📅 **周报功能**\n\n` +
      `此功能正在开发中，将在后续版本中提供：\n` +
      `• 本周专注统计\n` +
      `• 连击记录分析\n` +
      `• 时间分布图表\n` +
      `• 专注效率趋势\n\n` +
      `敬请期待！🚀`,
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * 处理/settings命令
   */
  async handleSettingsCommand(userId) {
    await this.bot.sendMessage(userId,
      `⚙️ **个人设置**\n\n` +
      `此功能正在开发中，将支持：\n` +
      `• 默认任务时长设置\n` +
      `• 提醒偏好配置\n` +
      `• 时区设置\n` +
      `• 通知开关\n\n` +
      `当前使用默认配置，敬请期待！`,
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * 处理文本输入
   */
  async handleTextInput(msg) {
    const userId = msg.from.id;
    const { text } = msg;

    // 简单的意图识别
    if (text.includes('任务') || text.includes('专注') || text.includes('学习') || text.includes('工作')) {
      await this.bot.sendMessage(userId,
        `看起来您想创建一个任务！\n\n` +
        `使用命令格式：\`/task ${text} [时长]\`\n\n` +
        `例如：\`/task ${text} 30\` (30分钟)`,
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
    } else {
      await this.bot.sendMessage(userId,
        '💭 我理解您的输入，但请使用具体的命令来操作。\n\n' +
        '输入 /help 查看所有可用命令。',
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
  }

  /**
   * 处理预约启动回调
   */
  async handleStartReservedCallback(userId, data) {
    const reservationId = data.replace(CALLBACK_PREFIXES.START_RESERVED, '');

    try {
      // 这里应该从存储中获取预约信息，暂时使用默认值
      await this.bot.sendMessage(userId,
        '🚀 **预约任务启动**\n\n' +
        '根据线性时延原理，您的启动阻力已降低60%！\n' +
        '现在是开始专注的绝佳时机。\n\n' +
        '使用 `/task` 命令创建具体任务。',
        { parse_mode: 'Markdown' }
      );

      logger.logTaskAction(userId, reservationId, 'reservation_started');

    } catch (error) {
      await this.sendErrorMessage(userId, error.message);
    }
  }

  /**
   * 处理快捷回调
   */
  async handleQuickCallback(userId, data) {
    switch (data) {
      case 'quick_task':
        await this.bot.sendMessage(userId,
          '🚀 **创建新任务**\n\n' +
          '使用格式：`/task 任务描述 时长`\n\n' +
          '例如：\n' +
          '• `/task 学习编程 45`\n' +
          '• `/task 读书 30`\n' +
          '• `/task 写作业` (默认25分钟)',
          { parse_mode: 'Markdown' }
        );
        break;

      case 'quick_reserve':
        await this.bot.sendMessage(userId,
          '⏰ **预约任务**\n\n' +
          '使用格式：`/reserve 任务描述 时长`\n\n' +
          '15分钟的延迟将帮助您：\n' +
          '• 降低60%启动阻力\n' +
          '• 做好心理准备\n' +
          '• 提高成功率',
          { parse_mode: 'Markdown' }
        );
        break;

      case 'quick_status':
        await this.handleStatusCommand(userId);
        break;

      case 'quick_stats':
        await this.handleStatsCommand(userId);
        break;

      case 'quick_week':
        await this.handleWeekCommand(userId);
        break;

      case 'quick_help':
        await this.handleHelpCommand(userId);
        break;

      case 'quick_realm':
        // 调用修仙命令处理器的境界查看功能
        if (this.cultivationHandlers) {
          await this.cultivationHandlers.handleRealmCommand({ chat: { id: userId }, from: { id: userId } });
        }
        break;

      case 'quick_rankings':
        // 调用修仙命令处理器的排行榜功能
        if (this.cultivationHandlers) {
          await this.cultivationHandlers.handleRankingsCommand({ chat: { id: userId } });
        }
        break;

      default:
        // 处理动态回调 (create_task:description:duration)
        if (data.startsWith('create_task:')) {
          const [, description, duration] = data.split(':');
          await this.handleTaskCommand(userId, `${description} ${duration}`);
        } else if (data.startsWith('reserve_task:')) {
          const [, description, duration] = data.split(':');
          await this.handleReserveCommand(userId, `${description} ${duration}`);
        } else {
          await this.bot.sendMessage(userId, '未知操作，请重试。');
        }
    }
  }

  /**
   * 发送错误消息
   */
  async sendErrorMessage(userId, message) {
    const userFriendlyMessage = this.getUserFriendlyError(message);
    await this.bot.sendMessage(userId, `❌ ${userFriendlyMessage}`);
  }

  /**
   * 获取用户友好的错误信息
   */
  getUserFriendlyError(errorMessage) {
    const errorMap = {
      '任务不存在或已被删除': '任务已过期或不存在，请创建新任务',
      '用户不存在': '用户信息异常，请重新使用 /start 命令',
      '任务未在运行状态，无法完成': '任务已结束或不存在，无法操作',
      'QueueService 未初始化': '系统正在初始化，请稍后重试',
      '指定的任务不存在': '任务不存在，请检查任务状态'
    };

    // 检查是否包含特定关键词
    if (errorMessage.includes('当前已有任务正在进行中')) {
      return '您已有任务在进行中，请先完成当前任务';
    }

    if (errorMessage.includes('创建任务失败')) {
      return errorMessage.replace('创建任务失败: ', '');
    }

    return errorMap[errorMessage] || '操作失败，请稍后重试';
  }

  /**
   * 处理错误
   */
  async handleError(error) {
    logger.logError(error, { source: 'bot_error_handler' });

    // 根据错误类型决定是否需要重启
    if (error.code === 'EFATAL') {
      logger.error('Bot遇到致命错误，需要重启', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * 设置Webhook（生产环境）
   */
  async setupWebHook() {
    try {
      const webhookConfig = this.config.getWebHookConfig();

      if (!webhookConfig || !webhookConfig.url) {
        throw new Error('Webhook配置无效');
      }

      await this.bot.setWebHook(webhookConfig.url, {
        certificate: webhookConfig.certificate,
        max_connections: 40,
        allowed_updates: ['message', 'callback_query']
      });

      logger.info('✅ Webhook设置成功', { url: webhookConfig.url });
    } catch (error) {
      logger.error('❌ Webhook设置失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 关闭Bot
   */
  async stop() {
    if (this.bot && this.isRunning) {
      try {
        await this.bot.stopPolling();
        await this.queueService.close();
        this.isRunning = false;
        logger.info('Bot已停止运行');
      } catch (error) {
        logger.error('停止Bot时发生错误', { error: error.message });
      }
    }
  }
}

export default SelfControlBot;
