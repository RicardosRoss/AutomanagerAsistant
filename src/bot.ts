import TelegramBot from 'node-telegram-bot-api';
import BotConfig from './config/bot.js';
import redisConnection from './config/redis.js';
import TaskService from './services/TaskService.js';
import QueueService from './services/QueueService.js';
import CultivationService from './services/CultivationService.js';
import CTDPService from './services/CTDPService.js';
import logger from './utils/logger.js';
import { DEFAULT_TASK_DURATION_MINUTES } from './types/taskDefaults.js';
import { BOT_COMMANDS, CALLBACK_PREFIXES } from './utils/constants.js';
import CultivationCommandHandlers from './handlers/cultivationCommands.js';
import CoreCommandHandlers from './handlers/coreCommands.js';
import TaskCommandHandlers from './handlers/taskCommands.js';
import type { ContentNameResolverDependency } from './services/CultivationService.js';

interface SelfControlBotDependencies {
  contentNameResolver?: ContentNameResolverDependency;
}

class SelfControlBot {
  private static readonly UPDATE_DEDUP_TTL_SECONDS = 60 * 60;

  private static readonly CALLBACK_ACTION_TTL_SECONDS = 3;

  private static readonly processedUpdateCache = new Map<string, number>();

  config: BotConfig;

  bot: TelegramBot | null;

  queueService: QueueService;

  cultivationService: CultivationService;

  taskService: TaskService;

  ctdpService: CTDPService;

  cultivationHandlers: CultivationCommandHandlers | null;

  coreHandlers: CoreCommandHandlers | null;

  taskHandlers: TaskCommandHandlers | null;

  isRunning: boolean;

  constructor(dependencies: SelfControlBotDependencies = {}) {
    this.config = new BotConfig();
    this.bot = null;
    this.queueService = new QueueService();
    this.cultivationService = new CultivationService({
      contentNameResolver: dependencies.contentNameResolver
    });
    this.taskService = new TaskService(this.queueService, this.cultivationService);
    this.ctdpService = new CTDPService(this.taskService, this.queueService);
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
      cultivationService: this.cultivationService,
      queueService: this.queueService,
      ctdpService: this.ctdpService,
      onError: this.sendErrorMessage.bind(this)
    });

    this.cultivationHandlers = new CultivationCommandHandlers(bot, this.cultivationService);
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
    const messageId = msg.message_id;
    const chatId = msg.chat.id;
    const username =
      msg.from?.username || `${msg.from?.first_name || ''} ${msg.from?.last_name || ''}`.trim();

    if (!userId) {
      return;
    }

    const updateKey = this.getMessageUpdateKey(msg);
    logger.info('收到 Telegram message update', {
      userId,
      chatId,
      messageId,
      updateKey,
      text,
      isCommand: text.startsWith('/'),
      source: 'message_update'
    });

    if (updateKey) {
      const shouldProcess = await this.claimProcessingKey(
        updateKey,
        SelfControlBot.UPDATE_DEDUP_TTL_SECONDS
      );
      if (!shouldProcess) {
        logger.warn('忽略重复的 Telegram message update', {
          userId,
          chatId,
          messageId,
          updateKey,
          text,
          source: 'message_update'
        });
        return;
      }
    }

    logger.logBotCommand(userId, text, { username, chatId });

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
      'loadout',
      'equip_art',
      'equip_support',
      'equip_power',
      'dev_combat_detail',
      'dev_set_injury',
      'dev_grant_art',
      'dev_grant_power',
      'dev_encounter_set',
      'dev_encounter_status',
      'dev_encounter_clear',
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
      case BOT_COMMANDS.PATTERNS:
        await this.handlePatternsCommand(userId);
        break;
      case BOT_COMMANDS.PRECEDENTS:
        await this.handlePrecedentsCommand(userId);
        break;
      case BOT_COMMANDS.RESERVE_STATUS:
        await this.handleReserveStatusCommand(userId);
        break;
      default:
        await this.getBot().sendMessage(userId, '未知命令。使用 /help 查看可用命令列表。');
    }
  }

  async handleCallbackQuery(callbackQuery: TelegramBot.CallbackQuery): Promise<void> {
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    const messageId = callbackQuery.message?.message_id;

    if (!data) {
      return;
    }

    try {
      const updateKey = this.getCallbackUpdateKey(callbackQuery);
      const actionKey = this.getCallbackActionKey(callbackQuery);

      logger.info('收到 Telegram callback_query update', {
        userId,
        callbackId: callbackQuery.id,
        callbackData: data,
        messageId,
        updateKey,
        actionKey,
        source: 'callback_query_update'
      });

      const shouldProcessUpdate = await this.claimProcessingKey(
        updateKey,
        SelfControlBot.UPDATE_DEDUP_TTL_SECONDS
      );
      if (!shouldProcessUpdate) {
        logger.warn('忽略重复的 Telegram callback_query update', {
          userId,
          callbackId: callbackQuery.id,
          callbackData: data,
          messageId,
          updateKey,
          source: 'callback_query_update'
        });
        return;
      }

      const shouldProcessAction = await this.claimProcessingKey(
        actionKey,
        SelfControlBot.CALLBACK_ACTION_TTL_SECONDS
      );
      if (!shouldProcessAction) {
        logger.warn('忽略短时间内重复触发的 callback 操作', {
          userId,
          callbackId: callbackQuery.id,
          callbackData: data,
          messageId,
          actionKey,
          source: 'callback_query_update'
        });
        await this.getBot().answerCallbackQuery(callbackQuery.id, {
          text: '操作处理中，请勿重复点击',
          show_alert: false
        });
        return;
      }

      await this.getBot().answerCallbackQuery(callbackQuery.id);

      if (data.startsWith(CALLBACK_PREFIXES.COMPLETE_TASK)) {
        await this.getTaskHandlers().handleCompleteTaskCallback(userId, data);
      } else if (data.startsWith(CALLBACK_PREFIXES.FAIL_TASK)) {
        await this.getTaskHandlers().handleFailTaskCallback(userId, data);
      } else if (data.startsWith(CALLBACK_PREFIXES.ENCOUNTER_ABANDON)) {
        await this.getTaskHandlers().handleAbandonEncounterCallback(userId, data);
      } else if (data.startsWith(CALLBACK_PREFIXES.ENCOUNTER_CONTEST)) {
        await this.getTaskHandlers().handleContestEncounterCallback(userId, data);
      } else if (data.startsWith(CALLBACK_PREFIXES.START_RESERVED)) {
        await this.getTaskHandlers().handleStartReservedCallback(userId, data);
      } else if (data.startsWith(CALLBACK_PREFIXES.CANCEL_RESERVATION)) {
        await this.getTaskHandlers().handleCancelReservationCallback(userId, data);
      } else if (data.startsWith(CALLBACK_PREFIXES.DELAY_RESERVATION)) {
        await this.getTaskHandlers().handleDelayReservationCallback(userId, data);
      } else {
        await this.handleQuickCallback(userId, data);
      }
    } catch (error) {
      logger.logError(error, { userId, callbackData: data, command: 'callback_query' });

      if (this.isExpiredCallbackQueryError(error)) {
        logger.warn('忽略过期的 callback query', { userId, callbackData: data });
        return;
      }

      try {
        await this.getBot().answerCallbackQuery(callbackQuery.id, {
          text: '操作失败，请稍后重试',
          show_alert: true
        });
      } catch (callbackError) {
        if (this.isExpiredCallbackQueryError(callbackError)) {
          logger.warn('callback query 错误提示已过期，跳过响应', {
            userId,
            callbackData: data
          });
          return;
        }

        logger.logError(callbackError, {
          userId,
          callbackData: data,
          command: 'callback_query_error_response'
        });
      }
    }
  }

  isExpiredCallbackQueryError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return (
      error.message.includes('query is too old') ||
      error.message.includes('query ID is invalid') ||
      error.message.includes('response timeout expired')
    );
  }

  isTransientPollingError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();

    return (
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('esockettimedout') ||
      message.includes('eai_again')
    );
  }

  isPollingConflictError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();

    return (
      message.includes('409 conflict')
      || message.includes('terminated by other getupdates request')
    );
  }

  private getMessageUpdateKey(msg: TelegramBot.Message): string | null {
    if (typeof msg.message_id !== 'number') {
      return null;
    }

    return `message:${msg.chat.id}:${msg.message_id}`;
  }

  private getCallbackUpdateKey(callbackQuery: TelegramBot.CallbackQuery): string {
    return `callback-update:${callbackQuery.id}`;
  }

  private getCallbackActionKey(callbackQuery: TelegramBot.CallbackQuery): string {
    const messageId = callbackQuery.message?.message_id ?? 'unknown';
    const data = callbackQuery.data ?? 'unknown';
    return `callback-action:${callbackQuery.from.id}:${messageId}:${data}`;
  }

  private pruneProcessedUpdateCache(now = Date.now()): void {
    SelfControlBot.processedUpdateCache.forEach((expiresAt, key) => {
      if (expiresAt <= now) {
        SelfControlBot.processedUpdateCache.delete(key);
      }
    });
  }

  private async claimProcessingKey(key: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;

    this.pruneProcessedUpdateCache(now);

    const cachedExpiresAt = SelfControlBot.processedUpdateCache.get(key);
    if (cachedExpiresAt && cachedExpiresAt > now) {
      return false;
    }

    if (redisConnection.isConnected) {
      try {
        const result = await redisConnection.getClient().set(
          `bot:processed-update:${key}`,
          JSON.stringify({
            processedAt: new Date(now).toISOString(),
            processId: process.pid
          }),
          { EX: ttlSeconds, NX: true }
        );

        if (result !== 'OK') {
          SelfControlBot.processedUpdateCache.set(key, expiresAt);
          return false;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Redis update 去重写入失败，回退到进程内去重缓存', {
          key,
          ttlSeconds,
          error: message
        });
      }
    }

    SelfControlBot.processedUpdateCache.set(key, expiresAt);
    return true;
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
          const [, description = '', duration = String(DEFAULT_TASK_DURATION_MINUTES)] = data.split(':');
          await this.getTaskHandlers().handleTaskCommand(userId, `${description} ${duration}`.trim());
        } else if (data.startsWith('reserve_task:')) {
          const [, description = '', duration = String(DEFAULT_TASK_DURATION_MINUTES)] = data.split(':');
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
    if (errorMessage.includes('自控力检查')) {
      return errorMessage.replace('完成任务失败: ', '');
    }

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

  async handlePatternsCommand(userId: number): Promise<void> {
    try {
      const { RSIPService } = await import('./services/index.js');
      const rsipService = new RSIPService();
      const tree = await rsipService.getPatternTree(userId);

      if (!tree || tree.nodes.length === 0) {
        await this.getBot().sendMessage(userId, '🌲 您还没有创建任何定式。\n\n使用 `/patterns` 后面的子命令来管理 RSIP 定式树。');
        return;
      }

      let message = '🌲 **RSIP 定式树**\n\n';
      const rootNode = tree.nodes.find((n: { parentId: string | null }) => !n.parentId);
      if (rootNode) {
        message += `📌 根定式：${rootNode.title} (${rootNode.status})\n`;
      }
      message += `📊 总节点数：${tree.nodes.length}\n`;
      message += `📅 今日新增限制：${tree.limits.maxNewPatternsPerDay} 个/天`;

      await this.getBot().sendMessage(userId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.sendErrorMessage(userId, msg);
    }
  }

  async handlePrecedentsCommand(userId: number): Promise<void> {
    try {
      const { PrecedentRule } = await import('./models/index.js');
      const rules = await PrecedentRule.find({ userId });

      if (rules.length === 0) {
        await this.getBot().sendMessage(userId, '⚖️ 您还没有任何判例规则。\n\n当违规行为出现时，系统会要求您做出决定。');
        return;
      }

      let message = `⚖️ **判例规则** (${rules.length} 条)\n\n`;
      for (const rule of rules) {
        const chainType = rule.scope.chainType === 'main' ? '主链' : '辅助链';
        const decision = rule.decision === 'allow_forever' ? '永久允许' : rule.decision;
        message += `• ${rule.scope.behaviorKey} (${chainType}): ${decision}\n`;
      }

      await this.getBot().sendMessage(userId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.sendErrorMessage(userId, msg);
    }
  }

  async handleReserveStatusCommand(userId: number): Promise<void> {
    try {
      const { AuxChain } = await import('./models/index.js');
      const auxChain = await AuxChain.findOne({ userId, status: 'active' });

      if (!auxChain || !auxChain.pendingReservation) {
        await this.getBot().sendMessage(userId, '⏰ 当前没有活跃预约。\n\n使用 `/reserve 任务描述 时长` 创建预约。');
        return;
      }

      const res = auxChain.pendingReservation;
      const remaining = res.deadlineAt
        ? Math.max(0, Math.ceil((res.deadlineAt.getTime() - Date.now()) / 60000))
        : 0;

      let message = '⏰ **预约状态**\n\n';
      message += `📋 任务：${res.signal}\n`;
      message += `🆔 预约ID：${res.reservationId}\n`;
      message += `⏱ 剩余时间：${remaining} 分钟\n`;
      message += `📊 状态：${res.status}`;

      await this.getBot().sendMessage(userId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🚀 立即开始', callback_data: `start_reserved_${res.reservationId}` },
            { text: '❌ 取消预约', callback_data: `cancel_reservation_${res.reservationId}` }
          ]]
        }
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.sendErrorMessage(userId, msg);
    }
  }

  async handleError(error: Error & { code?: string }): Promise<void> {
    if (this.isPollingConflictError(error)) {
      logger.error('检测到 Telegram polling 409 conflict，请检查是否有多个 Bot 实例同时运行', {
        error: error.message,
        code: error.code,
        source: 'bot_error_handler',
        hint: '确认只保留一个 polling 进程，避免 PM2、手动启动或其他环境同时运行相同 Bot token'
      });
      return;
    }

    logger.logError(error, { source: 'bot_error_handler' });

    if (this.isTransientPollingError(error)) {
      logger.warn('忽略瞬时 polling 网络错误，等待下一轮重试', {
        error: error.message,
        code: error.code
      });
      return;
    }

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
