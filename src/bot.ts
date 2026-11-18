import { sendTelegramMessage, databaseErrorNotice, isValidTelegramCallbackData } from './utils/telegramMessages.js';
import TelegramBot from 'node-telegram-bot-api';
import BotConfig from './config/bot.js';
import redisConnection from './config/redis.js';
import TaskService from './services/TaskService.js';
import QueueService from './services/QueueService.js';
import CultivationService from './services/CultivationService.js';
import CTDPService from './services/CTDPService.js';
import logger from './utils/logger.js';
import { DEFAULT_TASK_DURATION_MINUTES } from './types/taskDefaults.js';
import {
  CALLBACK_PREFIXES, TASK_DESCRIPTION_ERROR, RESERVATION_SERVICE_UNAVAILABLE
} from './utils/constants.js';
import { dispatchCommand } from './commands/registry.js';
import { previewTaskDescription, splitTelegramPlainText } from './utils/taskText.js';
import CultivationCommandHandlers from './handlers/cultivationCommands.js';
import CoreCommandHandlers from './handlers/coreCommands.js';
import TaskCommandHandlers from './handlers/taskCommands.js';
import TaskDraftHandlers from './handlers/taskDraftCommands.js';
import ScheduleCommandHandlers from './handlers/scheduleCommands.js';
import ScheduleService from './services/ScheduleService.js';
import PatternCommandHandlers from './handlers/patternCommands.js';
import MainViolationService from './services/MainViolationService.js';
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

  mainViolationService: MainViolationService;

  cultivationHandlers: CultivationCommandHandlers | null;

  coreHandlers: CoreCommandHandlers | null;

  taskHandlers: TaskCommandHandlers | null;

  draftHandlers: TaskDraftHandlers | null;

  scheduleService: ScheduleService;

  scheduleHandlers: ScheduleCommandHandlers | null = null;

  isRunning: boolean;

  botUsername: string | null = null;

  private unsubscribeRedisRecovery: (() => void) | null = null;

  constructor(dependencies: SelfControlBotDependencies = {}) {
    this.config = new BotConfig();
    this.bot = null;
    this.queueService = new QueueService();
    this.scheduleService = new ScheduleService();
    this.queueService.scheduleService = this.scheduleService;
    this.cultivationService = new CultivationService({
      contentNameResolver: dependencies.contentNameResolver
    });
    this.taskService = new TaskService(this.queueService, this.cultivationService);
    this.ctdpService = new CTDPService(this.taskService, this.queueService);
    this.mainViolationService = new MainViolationService(this.queueService, this.taskService);
    this.queueService.setMainDecisionRecoveryHandler(() => this.mainViolationService.recoverSelectedDecisions());
    this.queueService.setTaskCreationRecoveryHandler(async () => {
      const outcomes = await Promise.allSettled([
        this.taskService.recoverCreationRollbacks(), this.ctdpService.recoverUnpublishedStarts(),
        this.taskService.recoverCoreResults(), this.ctdpService.recoverConfirmedNodes(),
        this.taskService.recoverDailySnapshots()
      ]);
      if (outcomes.some(result => result.status === 'rejected')) throw new Error('部分任务启动恢复失败，将稍后重试');
    });
    this.queueService.setFocusRewardRecoveryHandler(async () => {
      const outcomes = await Promise.allSettled([
        this.taskService.recoverPendingRewards(undefined, async (userId, taskId, reward, task) => {
          await this.getTaskHandlers().sendRewardNotice(userId, taskId, reward, task);
        }),
        this.cultivationService.recoverDivinationHistories()
      ]);
      if (outcomes.some(result => result.status === 'rejected')) throw new Error('部分附加奖励等待下次恢复，专注不受影响');
    });
    this.queueService.setReservationRecoveryHandler(
      (reservationId) => this.ctdpService.recoverReservation(reservationId)
    );
    this.queueService.setReservationExpiryHandler(async (reservationId) => {
      const result = await this.ctdpService.expireReservation(reservationId);
      if (result.expired && result.auxChain?.pendingDecision && !result.auxChain.pendingDecision.notifiedAt) {
        await this.getTaskHandlers().sendAuxiliaryDecision(result.auxChain.userId, reservationId, true);
      }
    });
    this.cultivationHandlers = null;
    this.coreHandlers = null;
    this.taskHandlers = null;
    this.draftHandlers = null;
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
    this.draftHandlers = new TaskDraftHandlers(bot, this.taskHandlers);
    this.scheduleHandlers = new ScheduleCommandHandlers(bot, this.scheduleService, this.draftHandlers);

    this.cultivationHandlers = new CultivationCommandHandlers(bot, this.cultivationService);
  }

  async start(): Promise<this> {
    try {
      const botOptions = this.config.getBotOptions();
      this.bot = new TelegramBot(this.config.token, { ...botOptions, polling: false });
      this.queueService.setBotInstance(this.bot);
      this.initializeHandlers(this.bot);

      await this.queueService.initialize();
      this.unsubscribeRedisRecovery?.();
      this.unsubscribeRedisRecovery = redisConnection.onReady(() => this.queueService.restoreAfterRedisReconnect());
      try {
        await this.setupCommands();
      } catch (error) {
        logger.warn('命令菜单同步失败，继续启动消息处理', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      const botInfo = await this.bot.getMe();
      this.botUsername = botInfo.username?.toLowerCase() ?? null;
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

    logger.info('核心与修仙命令统一分发已就绪');
  }

  async handleMessage(msg: TelegramBot.Message): Promise<void> {
    const userId = msg.from?.id;
    const text = msg.text || '';
    const messageId = msg.message_id;
    const chatId = msg.chat.id;
    const username = msg.from?.username || `${msg.from?.first_name || ''} ${msg.from?.last_name || ''}`.trim();

    if (!userId || msg.from?.is_bot) {
      return;
    }
    if (!this.isPersonalChat(msg) && !text.startsWith('/')) return;

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
      const shouldProcess = await this.claimProcessingKey(updateKey, SelfControlBot.UPDATE_DEDUP_TTL_SECONDS);
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
        const handled = await this.draftHandlers?.handleText(userId, text);
        if (!handled && this.draftHandlers && /任务|专注|学习|工作/.test(text)) {
          await this.draftHandlers.begin(userId, 'reserve', text);
        } else if (!handled) {
          await this.getCoreHandlers().handleTextInput(msg);
        }
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

    const parsed = /^\/([a-z0-9_]+)(?:@([a-z0-9_]+))?(?:\s+([\s\S]*))?$/i.exec(text);
    if (!parsed) return;
    const command = parsed[1]!.toLowerCase();
    const recipient = parsed[2]?.toLowerCase();
    if (recipient && recipient !== this.botUsername?.toLowerCase()) {
      logger.debug('忽略发给其他机器人或身份尚未就绪的命令', { recipient, botUsername: this.botUsername });
      return;
    }
    if (!this.isPersonalChat(msg)) {
      await sendTelegramMessage(this.getBot(), msg.chat.id, '请在与我的私聊中管理任务、预约和个人记录。');
      return;
    }
    const args = (parsed[3] ?? '').trim().split(/\s+/);

    if (this.cultivationHandlers && await this.cultivationHandlers.dispatchCommand(msg, command, args.join(' '))) {
      return;
    }

    const input = args.join(' ');
    const dispatched = await dispatchCommand(command, {
      schedule: async () => this.scheduleHandlers?.handleCommand(userId, input),
      start: () => this.getCoreHandlers().handleStartCommand(userId, user),
      help: () => this.getCoreHandlers().handleHelpCommand(userId),
      task: async () => {
        if (!input.trim() && this.draftHandlers) await this.draftHandlers.begin(userId, 'start');
        else await this.getTaskHandlers().handleTaskCommand(userId, input);
      },
      reserve: async () => {
        if (!input.trim() && this.draftHandlers) await this.draftHandlers.begin(userId, 'reserve');
        else await this.getTaskHandlers().handleReserveCommand(userId, input);
      },
      status: () => this.getCoreHandlers().handleStatusCommand(userId),
      stats: () => this.getCoreHandlers().handleStatsCommand(userId),
      week: () => this.getCoreHandlers().handleWeekCommand(userId),
      settings: () => this.getCoreHandlers().handleSettingsCommand(userId, input),
      patterns: () => this.handlePatternsCommand(userId, input),
      precedents: () => this.handlePrecedentsCommand(userId),
      violation: () => this.handleViolationCommand(userId, input),
      reserve_status: () => this.handleReserveStatusCommand(userId)
    });
    if (!dispatched) await sendTelegramMessage(this.getBot(), userId, '未知命令。使用 /help 查看可用命令列表。');
  }

  async handleCallbackQuery(callbackQuery: TelegramBot.CallbackQuery): Promise<void> {
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    const messageId = callbackQuery.message?.message_id;

    try {
      if (callbackQuery.inline_message_id || !callbackQuery.message?.chat ||
        !this.isPersonalChat({ ...callbackQuery.message, from: callbackQuery.from })) {
        await this.answerCallbackSafely(callbackQuery.id, {
          text: '请在与我的私聊中操作自己的任务', show_alert: true
        });
        return;
      }
      if (!isValidTelegramCallbackData(data)) {
        await this.answerCallbackSafely(callbackQuery.id, {
          text: '按钮数据无效，请重新查看当前状态', show_alert: true
        });
        return;
      }
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

      const shouldProcessUpdate = await this.claimProcessingKey(updateKey, SelfControlBot.UPDATE_DEDUP_TTL_SECONDS);
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

      const shouldProcessAction = await this.claimProcessingKey(actionKey, SelfControlBot.CALLBACK_ACTION_TTL_SECONDS);
      if (!shouldProcessAction) {
        logger.warn('忽略短时间内重复触发的 callback 操作', {
          userId,
          callbackId: callbackQuery.id,
          callbackData: data,
          messageId,
          actionKey,
          source: 'callback_query_update'
        });
        await this.answerCallbackSafely(callbackQuery.id, {
          text: '操作处理中，请勿重复点击',
          show_alert: false
        });
        return;
      }

      // Acknowledge independently: Telegram's spinner response must not gate
      // a valid, authenticated action or consume it on a transport failure.
      void this.answerCallbackSafely(callbackQuery.id);

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
      const responses = await Promise.allSettled([
        this.answerCallbackSafely(callbackQuery.id, { text: '操作失败，请稍后重试', show_alert: true }),
        sendTelegramMessage(this.getBot(), userId, '❌ 操作失败，请稍后重试。可用 /status 或 /reserve_status 查看当前状态。')
      ]);
      for (const response of responses) {
        if (response.status === 'rejected') {
          logger.logError(response.reason, { userId, command: 'callback_error_notice' });
        }
      }
    }
  }

  private async answerCallbackSafely(
    id: string, options?: Omit<TelegramBot.AnswerCallbackQueryOptions, 'callback_query_id'>
  ): Promise<void> {
    try {
      await this.getBot().answerCallbackQuery(id, options);
    } catch (error) {
      logger.warn(this.isExpiredCallbackQueryError(error)
        ? '按钮确认已过期，业务状态仍按数据库校验处理'
        : '按钮确认发送失败，业务状态仍按数据库校验处理', {
        callbackId: id, error: error instanceof Error ? error.message : String(error)
      });
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

    return message.includes('409 conflict') || message.includes('terminated by other getupdates request');
  }

  private isPersonalChat(msg: TelegramBot.Message): boolean {
    return msg.chat.id === msg.from?.id && (!msg.chat.type || msg.chat.type === 'private');
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
    // Claim locally before awaiting Redis so overlapping deliveries in this
    // process cannot both pass if the remote claim's response is lost.
    SelfControlBot.processedUpdateCache.set(key, expiresAt);

    // Offline fallback is scoped to the configured single polling process;
    // multi-instance operation must not treat this cache as a distributed claim.
    if (redisConnection.getConnectionStatus().clientReady) {
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
        // Keep this update consumed locally until its TTL expires. A new
        // message or callback id can retry; replaying an ambiguous claim cannot.
        logger.warn('Redis update 认领结果不明，跳过本次更新以免重复执行', {
          key,
          ttlSeconds,
          error: message
        });
        return false;
      }
    }

    SelfControlBot.processedUpdateCache.set(key, expiresAt);
    return true;
  }

  async handleQuickCallback(userId: number, data: string): Promise<void> {
    if (data.startsWith('schedule:') && this.scheduleHandlers) {
      await this.scheduleHandlers.handleCallback(userId, data);
      return;
    }
    if (data.startsWith('main_violation:')) {
      const [, decision, decisionToken, extra] = data.split(':');
      await this.handleMainViolationDecision(userId, decision ?? '', extra === undefined ? decisionToken : undefined);
      return;
    }
    if (data.startsWith('pattern:')) {
      const [, action, argument] = data.split(':');
      await this.handlePatternsCommand(userId, `${action ?? ''} ${argument ?? ''}`);
      return;
    }
    if (data.startsWith('settings:')) {
      const [, field, value] = data.split(':');
      await this.getCoreHandlers().handleSettingsCommand(userId, `${field ?? ''} ${value ?? ''}`);
      return;
    }
    if (data.startsWith('aux_decide:')) {
      await this.getTaskHandlers().handleAuxiliaryDecisionCallback(userId, data);
      return;
    }
    if (data.startsWith('draft:') && this.draftHandlers) {
      await this.draftHandlers.handleCallback(userId, data);
      return;
    }
    switch (data) {
      case 'quick_task':
        if (this.draftHandlers) await this.draftHandlers.begin(userId, 'start');
        else await this.getTaskHandlers().sendTaskPrompt(userId);
        break;
      case 'quick_reserve':
        if (this.draftHandlers) await this.draftHandlers.begin(userId, 'reserve');
        else await this.getTaskHandlers().sendReservePrompt(userId);
        break;
      case 'quick_status':
        await this.getCoreHandlers().handleStatusCommand(userId);
        break;
      case 'quick_reserve_status':
        await this.handleReserveStatusCommand(userId);
        break;
      case 'quick_stats':
        await this.getCoreHandlers().handleStatsCommand(userId);
        break;
      case 'quick_week':
        await this.getCoreHandlers().handleWeekCommand(userId);
        break;
      case 'quick_violation':
        await this.handleViolationCommand(userId, '');
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
          await sendTelegramMessage(this.getBot(), userId, '未知操作，请重试。');
        }
    }
  }

  async sendErrorMessage(userId: number, message: string): Promise<void> {
    const userFriendlyMessage = this.getUserFriendlyError(message);
    await sendTelegramMessage(this.getBot(), userId, `❌ ${userFriendlyMessage}`);
  }

  getUserFriendlyError(errorMessage: string): string {
    const databaseNotice = databaseErrorNotice(errorMessage);
    if (databaseNotice) return databaseNotice;
    const settlementNotice = errorMessage.match(/(?:上次任务结果正在保存|任务结算认领已变化|任务结算正在处理中).*$/);
    if (settlementNotice) return settlementNotice[0];
    if (errorMessage === TASK_DESCRIPTION_ERROR) return errorMessage;
    if (errorMessage === RESERVATION_SERVICE_UNAVAILABLE) return errorMessage;
    const rewardError = errorMessage.match(/(?:账户状态已变化|旧奖励收据缺少).*$/);
    if (rewardError) return rewardError[0];
    if (/任务正在(?:启动|初始化)/.test(errorMessage)) return '任务正在启动，请稍后使用 /status 查看进展';
    if (/^(任务时长必须|时区无效|过程提醒只能|可设置|请先使用|判例按钮已过期|违规行为必须|任务结果已保存)/.test(errorMessage)) {
      return errorMessage;
    }
    if (/^(预约不存在或已处理|预约正在启动|预约状态已变化)/.test(errorMessage)) return errorMessage;
    if (errorMessage.includes('请先处理')) return errorMessage.replace(/^.*(?:失败:|失败：)\s*/, '');
    if (errorMessage.includes('自控力检查')) {
      return errorMessage.replace('完成任务失败: ', '');
    }

    const errorMap: Record<string, string> = {
      任务不存在或已被删除: '任务已过期或不存在，请创建新任务',
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

  async handlePatternsCommand(userId: number, input = ''): Promise<void> {
    await new PatternCommandHandlers(this.getBot()).handle(userId, input);
  }

  async handlePrecedentsCommand(userId: number): Promise<void> {
    try {
      const { PrecedentRule } = await import('./models/index.js');
      const rules = await PrecedentRule.find({ userId });
      const { MainChain, AuxChain } = await import('./models/index.js');
      const [main, aux] = await Promise.all([
        MainChain.findOne({ userId, status: 'active' }), AuxChain.findOne({ userId, status: 'active' })
      ]);

      if (rules.length === 0) {
        await sendTelegramMessage(this.getBot(),
          userId,
          '⚖️ 您还没有任何判例规则。\n\n当违规行为出现时，系统会要求您做出决定。'
        );
        return;
      }

      let message = `⚖️ 判例规则 (${rules.length} 条)\n仅标为当前的规则适用于现行链，历史判例保留备查。\n\n`;
      for (const rule of rules) {
        const activeId = rule.scope.chainType === 'main' ? main?.chainId : aux?.chainId;
        const current = rule.scope.chainId && rule.scope.chainId === activeId;
        const chainType = `${current ? '当前' : '历史'}${rule.scope.chainType === 'main' ? '主链' : '辅助链'}`;
        const decision = rule.decision === 'allow_forever' ? '永久允许' : rule.decision;
        message += `• ${rule.scope.behaviorKey} (${chainType}): ${decision}\n`;
      }

      for (const chunk of splitTelegramPlainText(message)) await sendTelegramMessage(this.getBot(), userId, chunk);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.sendErrorMessage(userId, msg);
    }
  }

  async handleViolationCommand(userId: number, behaviorKey: string): Promise<void> {
    try {
      const result = await this.mainViolationService.report(userId, behaviorKey);
      if (!result.requiresDecision) {
        await sendTelegramMessage(this.getBot(), userId, '当前主链已有判例允许这个行为，本次不打断任务。');
        return;
      }
      const pending = result.pending;
      if (!pending?.decisionToken) throw new Error('主链判例状态已变化，请重新查看');
      if (pending.decision) {
        await this.mainViolationService.recoverSelectedDecisions(userId);
        await sendTelegramMessage(this.getBot(),
          userId, '你的主链判例决定已保存，系统会继续处理原决定。请用 /status 查看结果，无需重新选择。'
        );
        return;
      }
      await sendTelegramMessage(this.getBot(),
        userId,
        `主链规则需要判定：${pending.behaviorKey}\n\n` +
          '如果这次允许，当前主链以后遇到同一行为也必须允许。\n' +
          '如果不能接受，就立即断链并清空当前主链记录。',
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '断链，重新从 #1 开始', callback_data: `main_violation:break_chain:${pending.decisionToken}` },
                { text: '当前主链永久允许', callback_data: `main_violation:allow_forever:${pending.decisionToken}` }
              ]
            ]
          }
        }
      );
    } catch (error) {
      await this.sendErrorMessage(userId, error instanceof Error ? error.message : String(error));
    }
  }

  async handleMainViolationDecision(userId: number, decision: string, decisionToken?: string): Promise<void> {
    if (decision !== 'break_chain' && decision !== 'allow_forever') return;
    if (!/^[a-f0-9]{20}$/.test(decisionToken ?? '')) {
      await sendTelegramMessage(this.getBot(), userId, '判例按钮已过期，请用 /violation 查看当前判例');
      return;
    }
    try {
      const result = await this.mainViolationService.resolve(userId, decision, decisionToken);
      if (result.replayed) {
        await sendTelegramMessage(this.getBot(),
          userId, '这条判例决定此前已处理完成，本次没有修改当前任务或规则。使用 /status 查看当前状态。'
        );
        return;
      }
      await sendTelegramMessage(this.getBot(),
        userId,
        decision === 'break_chain'
          ? '主链已断裂，当前任务记录已清空；下一次从 #1 开始。'
          : '已形成当前主链的永久判例，今后相同行为不再视为违规。'
      );
    } catch (error) {
      await this.sendErrorMessage(userId, error instanceof Error ? error.message : String(error));
    }
  }

  async handleReserveStatusCommand(userId: number): Promise<void> {
    try {
      const { AuxChain } = await import('./models/index.js');
      const auxChain = await AuxChain.findOne({ userId, status: 'active' });

      if (!auxChain || !auxChain.pendingReservation) {
        await sendTelegramMessage(this.getBot(), userId, '⏰ 当前没有活跃预约。\n\n使用 `/reserve 任务描述 时长` 创建预约。');
        return;
      }

      const res = auxChain.pendingReservation;
      if (res.status === 'starting' || auxChain.pendingDecision?.chosenDecision) {
        await this.ctdpService.recoverReservation(res.reservationId ?? '');
        const current = await AuxChain.findOne({ userId, status: 'active' });
        if (current?.pendingReservation?.status !== 'starting' && !current?.pendingDecision?.chosenDecision) {
          await this.handleReserveStatusCommand(userId);
          return;
        }
        await sendTelegramMessage(this.getBot(),
          userId,
          res.status === 'starting'
            ? '预约正在启动，不必重复点击。可以用 /status 查看任务进展。'
            : '你的判例决定已保存，系统正在完成处理。不必再次选择，稍后查看 /reserve_status。',
          { reply_markup: { inline_keyboard: [[{ text: '查看任务状态', callback_data: 'quick_status' }]] } }
        );
        return;
      }
      if (auxChain.pendingDecision) {
        await this.getTaskHandlers().sendAuxiliaryDecision(userId, res.reservationId ?? '');
        return;
      }
      const remaining = res.deadlineAt ? Math.max(0, Math.ceil((res.deadlineAt.getTime() - Date.now()) / 60000)) : 0;

      let message = '⏰ **预约状态**\n\n';
      message += `📋 任务：${previewTaskDescription(res.signal)}\n`;
      message += `🆔 预约ID：${res.reservationId}\n`;
      message += `⏱ 剩余时间：${remaining} 分钟\n`;
      message += `📊 状态：${res.status}`;

      await sendTelegramMessage(this.getBot(), userId, message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🚀 立即开始', callback_data: `start_reserved_${res.reservationId}` },
              { text: '❌ 取消预约', callback_data: `cancel_reservation_${res.reservationId}` }
            ]
          ]
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
    this.unsubscribeRedisRecovery?.();
    this.unsubscribeRedisRecovery = null;
    this.isRunning = false;
    const results = await Promise.allSettled([this.bot?.stopPolling(), this.queueService.close()]);
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('停止Bot时发生错误', { error: String(result.reason) });
      }
    }
    logger.info('Bot已停止运行');
  }
}

export default SelfControlBot;
