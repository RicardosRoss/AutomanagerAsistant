import TelegramBot from 'node-telegram-bot-api';
import BotConfig from './config/bot.js';
import TaskService from './services/TaskService.js';
import QueueService from './services/QueueService.js';
import CultivationService from './services/CultivationService.js';
import logger from './utils/logger.js';
import { BOT_COMMANDS, CALLBACK_PREFIXES } from './utils/constants.js';
import CultivationCommandHandlers from './handlers/cultivationCommands.js';
import CoreCommandHandlers from './handlers/coreCommands.js';
import TaskCommandHandlers from './handlers/taskCommands.js';

class SelfControlBot {
  config: BotConfig;

  bot: TelegramBot | null;

  queueService: QueueService;

  cultivationService: CultivationService;

  taskService: TaskService;

  cultivationHandlers: CultivationCommandHandlers | null;

  coreHandlers: CoreCommandHandlers | null;

  taskHandlers: TaskCommandHandlers | null;

  isRunning: boolean;

  constructor() {
    this.config = new BotConfig();
    this.bot = null;
    this.queueService = new QueueService();
    this.cultivationService = new CultivationService();
    this.taskService = new TaskService(this.queueService, this.cultivationService);
    this.cultivationHandlers = null;
    this.coreHandlers = null;
    this.taskHandlers = null;
    this.isRunning = false;

    this.handleMessage = this.handleMessage.bind(this);
    this.handleCallbackQuery = this.handleCallbackQuery.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  private getBot(): TelegramBot {
    if (!this.bot) {
      throw new Error('Bot 实例尚未初始化');
    }

    return this.bot;
  }

  private getCoreHandlers(): CoreCommandHandlers {
    if (!this.coreHandlers) {
      throw new Error('核心命令处理器尚未初始化');
    }

    return this.coreHandlers;
  }

  private getTaskHandlers(): TaskCommandHandlers {
    if (!this.taskHandlers) {
      throw new Error('任务命令处理器尚未初始化');
    }

    return this.taskHandlers;
  }

  private getCultivationHandlers(): CultivationCommandHandlers {
    if (!this.cultivationHandlers) {
      throw new Error('修仙命令处理器尚未初始化');
    }

    return this.cultivationHandlers;
  }

  private initializeHandlers(bot: TelegramBot): void {
    this.coreHandlers = new CoreCommandHandlers({
      bot,
      config: this.config,
      taskService: this.taskService,
      onError: this.sendErrorMessage.bind(this)
    });

    this.taskHandlers = new TaskCommandHandlers({
      bot,
      taskService: this.taskService,
      queueService: this.queueService,
      onError: this.sendErrorMessage.bind(this)
    });

    this.cultivationHandlers = new CultivationCommandHandlers(bot);
  }

  async start(): Promise<this> {
    try {
      this.bot = new TelegramBot(this.config.token, this.config.getBotOptions());
      this.queueService.setBotInstance(this.bot);
      this.initializeHandlers(this.bot);

      await this.queueService.initialize();
      await this.setupCommands();
      this.registerEventHandlers();

      if (this.config.options.webHook) {
        try {
          await this.setupWebHook();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn('Webhook设置失败，回退到polling模式', { error: message });
          await this.bot.startPolling();
        }
      } else {
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
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      logger.error('Bot启动失败', { error: message, stack });
      throw error;
    }
  }

  async setupCommands(): Promise<void> {
    try {
      const commands = this.config.getSupportedCommands();
      await this.getBot().setMyCommands(commands);
      logger.info('Bot命令设置完成', { commandCount: commands.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('设置Bot命令失败', { error: message });
      throw error;
    }
  }

  registerEventHandlers(): void {
    const bot = this.getBot();
    bot.on('message', this.handleMessage);
    bot.on('callback_query', this.handleCallbackQuery);
    bot.on('polling_error', this.handleError);
    bot.on('webhook_error', this.handleError);

    logger.info('Bot事件处理器注册完成');

    this.getCultivationHandlers().registerCommands();
    logger.info('修仙系统命令已注册');
  }

  async handleMessage(msg: TelegramBot.Message): Promise<void> {
    const userId = msg.from?.id;
    const text = msg.text || '';
    const username =
      msg.from?.username || `${msg.from?.first_name || ''} ${msg.from?.last_name || ''}`.trim();

    if (!userId) {
      return;
    }

    logger.logBotCommand(userId, text, { username, chatId: msg.chat.id });

    try {
      if (text.startsWith('/')) {
        await this.handleCommand(msg);
      } else {
        await this.getCoreHandlers().handleTextInput(msg);
      }
    } catch (error) {
      logger.logError(error, { userId, text, command: 'message_handler' });
      await this.sendErrorMessage(userId, '处理消息时发生错误，请稍后重试');
    }
  }

  async handleCommand(msg: TelegramBot.Message): Promise<void> {
    const userId = msg.from?.id;
    const user = msg.from;
    const text = msg.text;

    if (!userId || !user || !text) {
      return;
    }

    const [command = '', ...args] = text.slice(1).split(' ');

    const cultivationCommands = [
      'realm',
      'divination',
      'divination_history',
      'divination_chart',
      'breakthrough',
      'ascension',
      'confirm_ascension',
      'rankings',
      'mystats',
      'stones'
    ];

    if (cultivationCommands.includes(command.toLowerCase())) {
      return;
    }

    switch (command.toLowerCase()) {
      case BOT_COMMANDS.START:
        await this.getCoreHandlers().handleStartCommand(userId, user);
        break;
      case BOT_COMMANDS.HELP:
        await this.getCoreHandlers().handleHelpCommand(userId);
        break;
      case BOT_COMMANDS.TASK:
        await this.getTaskHandlers().handleTaskCommand(userId, args.join(' '));
        break;
      case BOT_COMMANDS.RESERVE:
        await this.getTaskHandlers().handleReserveCommand(userId, args.join(' '));
        break;
      case BOT_COMMANDS.STATUS:
        await this.getCoreHandlers().handleStatusCommand(userId);
        break;
      case BOT_COMMANDS.STATS:
        await this.getCoreHandlers().handleStatsCommand(userId);
        break;
      case BOT_COMMANDS.WEEK:
        await this.getCoreHandlers().handleWeekCommand(userId);
        break;
      case BOT_COMMANDS.SETTINGS:
        await this.getCoreHandlers().handleSettingsCommand(userId);
        break;
      default:
        await this.getBot().sendMessage(userId, '未知命令。使用 /help 查看可用命令列表。');
    }
  }

  async handleCallbackQuery(callbackQuery: TelegramBot.CallbackQuery): Promise<void> {
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (!data) {
      return;
    }

    try {
      await this.getBot().answerCallbackQuery(callbackQuery.id);

      if (data.startsWith(CALLBACK_PREFIXES.COMPLETE_TASK)) {
        await this.getTaskHandlers().handleCompleteTaskCallback(userId, data);
      } else if (data.startsWith(CALLBACK_PREFIXES.FAIL_TASK)) {
        await this.getTaskHandlers().handleFailTaskCallback(userId, data);
      } else if (data.startsWith(CALLBACK_PREFIXES.START_RESERVED)) {
        await this.getTaskHandlers().handleStartReservedCallback(userId, data);
      } else if (data.startsWith(CALLBACK_PREFIXES.CANCEL_RESERVATION)) {
        await this.getTaskHandlers().handleCancelReservationCallback(userId, data);
      } else {
        await this.handleQuickCallback(userId, data);
      }
    } catch (error) {
      logger.logError(error, { userId, callbackData: data, command: 'callback_query' });
      await this.getBot().answerCallbackQuery(callbackQuery.id, {
        text: '操作失败，请稍后重试',
        show_alert: true
      });
    }
  }

  async handleQuickCallback(userId: number, data: string): Promise<void> {
    switch (data) {
      case 'quick_task':
        await this.getTaskHandlers().sendTaskPrompt(userId);
        break;
      case 'quick_reserve':
        await this.getTaskHandlers().sendReservePrompt(userId);
        break;
      case 'quick_status':
        await this.getCoreHandlers().handleStatusCommand(userId);
        break;
      case 'quick_stats':
        await this.getCoreHandlers().handleStatsCommand(userId);
        break;
      case 'quick_week':
        await this.getCoreHandlers().handleWeekCommand(userId);
        break;
      case 'quick_help':
        await this.getCoreHandlers().sendQuickHelp(userId);
        break;
      case 'quick_realm':
        await this.getCultivationHandlers().sendRealmStatus(userId, userId);
        break;
      case 'quick_rankings':
        await this.getCultivationHandlers().sendRankings(userId);
        break;
      default:
        if (data.startsWith('create_task:')) {
          const [, description = '', duration = '25'] = data.split(':');
          await this.getTaskHandlers().handleTaskCommand(userId, `${description} ${duration}`.trim());
        } else if (data.startsWith('reserve_task:')) {
          const [, description = '', duration = '25'] = data.split(':');
          await this.getTaskHandlers().handleReserveCommand(userId, `${description} ${duration}`.trim());
        } else {
          await this.getBot().sendMessage(userId, '未知操作，请重试。');
        }
    }
  }

  async sendErrorMessage(userId: number, message: string): Promise<void> {
    const userFriendlyMessage = this.getUserFriendlyError(message);
    await this.getBot().sendMessage(userId, `❌ ${userFriendlyMessage}`);
  }

  getUserFriendlyError(errorMessage: string): string {
    const errorMap: Record<string, string> = {
      '任务不存在或已被删除': '任务已过期或不存在，请创建新任务',
      用户不存在: '用户信息异常，请重新使用 /start 命令',
      '任务未在运行状态，无法完成': '任务已结束或不存在，无法操作',
      'QueueService 未初始化': '系统正在初始化，请稍后重试',
      指定的任务不存在: '任务不存在，请检查任务状态'
    };

    if (errorMessage.includes('当前已有任务正在进行中')) {
      return '您已有任务在进行中，请先完成当前任务';
    }

    if (errorMessage.includes('创建任务失败')) {
      return errorMessage.replace('创建任务失败: ', '');
    }

    return errorMap[errorMessage] || '操作失败，请稍后重试';
  }

  async handleError(error: Error & { code?: string }): Promise<void> {
    logger.logError(error, { source: 'bot_error_handler' });

    if (error.code === 'EFATAL') {
      logger.error('Bot遇到致命错误，需要重启', { error: error.message });
      process.exit(1);
    }
  }

  async setupWebHook(): Promise<void> {
    try {
      const webhookConfig = this.config.getWebHookConfig();

      if (!webhookConfig?.url) {
        throw new Error('Webhook配置无效');
      }

      await this.getBot().setWebHook(webhookConfig.url, {
        certificate: webhookConfig.certificate ?? undefined,
        max_connections: 40,
        allowed_updates: ['message', 'callback_query']
      });

      logger.info('✅ Webhook设置成功', { url: webhookConfig.url });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('❌ Webhook设置失败', { error: message });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.bot && this.isRunning) {
      try {
        await this.bot.stopPolling();
        await this.queueService.close();
        this.isRunning = false;
        logger.info('Bot已停止运行');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('停止Bot时发生错误', { error: message });
      }
    }
  }
}

export default SelfControlBot;
