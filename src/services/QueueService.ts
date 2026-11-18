import { sendTelegramMessage } from '../utils/telegramMessages.js';
import Queue from 'bull';
import type TelegramBot from 'node-telegram-bot-api';
import config from '../../config/index.js';
import AuxChain from '../models/AuxChain.js';
import TaskChain from '../models/TaskChain.js';
import MainChain from '../models/MainChain.js';
import User from '../models/User.js';
import type { AuxChainDocument } from '../types/models.js';
import { DEFAULT_TASK_DURATION_MINUTES } from '../types/taskDefaults.js';
import { formatDurationFromSeconds } from '../utils/helpers.js';
import type {
  CompletionReminderData,
  ProgressReminderData,
  QueueCounts,
  QueueHealthCheck,
  QueueStats,
  ReminderJobData,
  ReminderJobType,
  ReservationJobData
} from '../types/services.js';

type BullQueue<T> = import('bull').Queue<T>;
type BullJob<T> = import('bull').Job<T>;
type BullJobId = import('bull').JobId;
type BullJobOptions = import('bull').JobOptions;

class QueueService {
  botInstance: TelegramBot | null;

  reminderQueue: BullQueue<ReminderJobData> | null;

  reservationQueue: BullQueue<ReservationJobData> | null;

  maintenanceQueue: BullQueue<Record<string, never>> | null = null;

  isInitialized: boolean;

  reservationExpiryHandler: ((reservationId: string) => Promise<void>) | null = null;

  reservationRecoveryHandler: ((reservationId: string) => Promise<boolean>) | null = null;

  mainDecisionRecoveryHandler: (() => Promise<void>) | null = null;

  taskCreationRecoveryHandler: (() => Promise<void>) | null = null;

  focusRewardRecoveryHandler: (() => Promise<void>) | null = null;

  private reconciliationPromise: Promise<void> | null = null;
  private rewardRecoveryPromise: Promise<void> | null = null;

  constructor() {
    this.botInstance = null;
    this.reminderQueue = null;
    this.reservationQueue = null;
    this.isInitialized = false;
  }

  async initialize(): Promise<void> {
    try {
      if (this.isInitialized) {
        console.warn('⚠️ QueueService 已经初始化');
        return;
      }

      this.reminderQueue = new Queue<ReminderJobData>('任务提醒队列', {
        redis: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db
        },
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 5,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      });

      this.reservationQueue = new Queue<ReservationJobData>('预约提醒队列', {
        redis: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db
        },
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 5,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      });

      this.maintenanceQueue = new Queue<Record<string, never>>('预约恢复队列', {
        redis: {
          host: config.redis.host, port: config.redis.port, password: config.redis.password, db: config.redis.db
        },
        defaultJobOptions: { removeOnComplete: 10, removeOnFail: 10, attempts: 3, backoff: 2000 }
      });
      this.maintenanceQueue.on('error', (error: Error) => console.error('❌ 预约恢复队列错误:', error.message));
      this.maintenanceQueue.process('reconcile', 1, async () => this.reconcileReservations());
      this.maintenanceQueue.process('focus-rewards', 1, async () => {
        // Duplicate wakeups must leave a worker slot free for core reconciliation.
        if (this.rewardRecoveryPromise) return;
        await this.recoverFocusRewards();
      });
      this.setupProcessors();
      this.setupEventListeners();

      this.isInitialized = true;
      await this.ensureRecoverySchedule();
      await this.requestFocusRewardRecovery().catch(error => {
        console.warn('附加奖励唤醒失败，周期任务将继续恢复', { error: String(error) });
      });
      try {
        await this.reconcileReservations();
      } catch (error) {
        console.warn('⚠️ 部分预约启动恢复失败，持久恢复任务将继续重试', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      console.log('✅ QueueService 初始化成功');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('❌ QueueService 初始化失败:', message);
      throw error;
    }
  }

  private getReminderQueue(): BullQueue<ReminderJobData> {
    if (!this.reminderQueue) {
      throw new Error('提醒队列未初始化');
    }

    return this.reminderQueue;
  }

  private async ensureRecoverySchedule(): Promise<void> {
    if (!this.isInitialized || !this.maintenanceQueue) throw new Error('恢复队列尚未初始化');
    await this.maintenanceQueue.add('reconcile', {}, {
      jobId: 'reservation-reconcile', repeat: { every: 60000 }
    });
    await this.maintenanceQueue.add('focus-rewards', {}, {
      jobId: 'focus-reward-reconcile', repeat: { every: 60000 }
    });
  }

  async restoreAfterRedisReconnect(): Promise<void> {
    if (!this.isInitialized) return;
    await this.ensureRecoverySchedule();
    await this.requestFocusRewardRecovery();
    await this.reconcileReservations();
  }

  async requestFocusRewardRecovery(): Promise<void> {
    if (!this.isInitialized || !this.maintenanceQueue) throw new Error('附加奖励队列尚未初始化');
    await this.maintenanceQueue.add('focus-rewards', {}, {
      jobId: 'focus-reward-wakeup', removeOnComplete: true, removeOnFail: true
    });
  }

  recoverFocusRewards(): Promise<void> {
    if (this.rewardRecoveryPromise) return this.rewardRecoveryPromise;
    const pending = (this.focusRewardRecoveryHandler?.() ?? Promise.resolve()).finally(() => {
      if (this.rewardRecoveryPromise === pending) this.rewardRecoveryPromise = null;
    });
    this.rewardRecoveryPromise = pending;
    return pending;
  }

  private getReservationQueue(): BullQueue<ReservationJobData> {
    if (!this.reservationQueue) {
      throw new Error('预约队列未初始化');
    }

    return this.reservationQueue;
  }

  setupProcessors(): void {
    const reminderQueue = this.getReminderQueue();
    const reservationQueue = this.getReservationQueue();

    reminderQueue.process('progress', config.queues.concurrency, async (job: BullJob<ReminderJobData>) => {
      const { userId, taskId, progress, message } = job.data as ProgressReminderData;

      try {
        if (!await this.canNotifyTask(userId, taskId)) return;
        if (await this.sendProgressNotification(userId, message, progress)) {
          console.log(`📊 进度提醒发送成功: ${taskId} - ${progress}%`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ 进度提醒发送失败: ${errorMessage}`, { userId, taskId, progress });
        throw error;
      }
    });

    reminderQueue.process('completion', config.queues.concurrency, async (job: BullJob<ReminderJobData>) => {
      const { userId, taskId, message } = job.data as CompletionReminderData;

      try {
        await this.sendCompletionNotification(userId, message, taskId);
        console.log(`✅ 完成提醒发送成功: ${taskId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ 完成提醒发送失败: ${errorMessage}`, { userId, taskId });
        throw error;
      }
    });

    reservationQueue.process(
      'reservation',
      config.queues.concurrency,
      async (job: BullJob<ReservationJobData>) => {
        const { userId, reservationId } = job.data;

        try {
          if (!this.reservationExpiryHandler) throw new Error('预约到期处理器尚未初始化');
          await this.reservationExpiryHandler(reservationId);
          console.log(`⏰ 预约期限已处理: ${reservationId} for user ${userId}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`❌ 预约提醒发送失败: ${errorMessage}`, { userId, reservationId });
          throw error;
        }
      }
    );


    console.log('🔧 队列处理器设置完成');
  }

  setupEventListeners(): void {
    const reminderQueue = this.getReminderQueue();
    const reservationQueue = this.getReservationQueue();

    reminderQueue.on('completed', (job, result) => {
      console.log(`✅ 任务提醒队列任务完成: ${job.id}`, result);
    });

    reminderQueue.on('failed', (job, err) => {
      console.error(`❌ 任务提醒队列任务失败: ${job.id}`, {
        error: err.message,
        data: job.data,
        attempts: job.attemptsMade
      });
    });

    reminderQueue.on('stalled', (job) => {
      console.warn(`⏸️ 任务提醒队列任务停滞: ${job.id}`);
    });

    reservationQueue.on('completed', (job, result) => {
      console.log(`✅ 预约提醒队列任务完成: ${job.id}`, result);
    });

    reservationQueue.on('failed', (job, err) => {
      console.error(`❌ 预约提醒队列任务失败: ${job.id}`, {
        error: err.message,
        data: job.data,
        attempts: job.attemptsMade
      });
    });

    reservationQueue.on('stalled', (job) => {
      console.warn(`⏸️ 预约提醒队列任务停滞: ${job.id}`);
    });

    reminderQueue.on('error', (error: Error) => {
      console.error('❌ 任务提醒队列错误:', error.message);
    });

    reservationQueue.on('error', (error: Error) => {
      console.error('❌ 预约提醒队列错误:', error.message);
    });

    console.log('👂 队列事件监听器设置完成');
  }

  async addReminder(
    type: ReminderJobType,
    data: ReminderJobData,
    delay: number
  ): Promise<BullJobId | undefined> {
    try {
      if (!this.isInitialized) {
        throw new Error('QueueService 未初始化');
      }

      const reminderQueue = this.getReminderQueue();
      const jobOptions: BullJobOptions = {
        delay,
        jobId: `${type}_${data.taskId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      };

      const job = await reminderQueue.add(type, data, jobOptions);

      console.log(`⏰ ${type} 提醒已安排: ${job.id}, 延迟: ${delay}ms`);
      return job.id;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ 添加提醒任务失败: ${errorMessage}`, { type, data, delay });
      throw error;
    }
  }

  async scheduleReservation(
    userId: number,
    reservationId: string,
    taskDescription: string,
    duration = DEFAULT_TASK_DURATION_MINUTES
  ): Promise<BullJobId | undefined> {
    try {
      if (!this.isInitialized) {
        throw new Error('QueueService 未初始化');
      }

      const reservationQueue = this.getReservationQueue();
      const delay = config.linearDelay.defaultReservationDelay * 1000;
      const reservationDelayText = formatDurationFromSeconds(config.linearDelay.defaultReservationDelay);
      const jobData: ReservationJobData = {
        userId,
        reservationId,
        taskDescription,
        duration,
        scheduledFor: new Date(Date.now() + delay),
        principle: 'LINEAR_DELAY'
      };

      const job = await reservationQueue.add('reservation', jobData, {
        delay,
        jobId: reservationId
      });

      console.log(`⏰ ${reservationDelayText}预约已安排: ${reservationId} for user ${userId}, 延迟: ${delay / 1000}秒`);
      return job.id;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ 安排预约失败: ${errorMessage}`, { userId, reservationId });
      throw error;
    }
  }

  reconcileReservations(): Promise<void> {
    if (this.reconciliationPromise) return this.reconciliationPromise;
    const reconciling = this.performReconciliation().finally(() => {
      if (this.reconciliationPromise === reconciling) this.reconciliationPromise = null;
    });
    this.reconciliationPromise = reconciling;
    return reconciling;
  }

  private async performReconciliation(): Promise<void> {
    if (!this.isInitialized) throw new Error('QueueService 未初始化');
    const queue = this.getReservationQueue();
    const cursor = AuxChain.find({
      status: 'active',
      'pendingReservation.reservationId': { $exists: true },
      'pendingReservation.status': { $in: ['pending', 'starting', 'expired'] }
    }).cursor();
    let failures = 0;
    if (this.taskCreationRecoveryHandler) {
      try {
        await this.taskCreationRecoveryHandler();
      } catch (error) {
        failures += 1;
        console.error('❌ 任务启动补偿恢复失败', { error: String(error) });
      }
    }
    for await (const chain of cursor) {
      try {
        await this.reconcileReservation(chain, queue);
      } catch (error) {
        failures += 1;
        console.error('❌ 单个预约恢复失败', {
          chainId: chain.chainId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    if (this.mainDecisionRecoveryHandler) {
      try {
        await this.mainDecisionRecoveryHandler();
      } catch (error) {
        failures += 1;
        console.error('❌ 主链判例恢复失败', { error: String(error) });
      }
    }
    if (failures) throw new Error(`${failures} 个预约恢复失败，将由恢复队列重试`);
  }

  private async reconcileReservation(chain: AuxChainDocument, queue: BullQueue<ReservationJobData>): Promise<void> {
    const reservation = chain.pendingReservation!;
    if (chain.pendingDecision?.chosenDecision || reservation.status === 'starting') {
      const recovered = await this.reservationRecoveryHandler?.(reservation.reservationId!);
      if (recovered || reservation.status === 'starting') return;
    }
    if (chain.pendingDecision?.notifiedAt || chain.pendingDecision?.chosenDecision) return;
    if (chain.pendingDecision?.nextNotificationAt && chain.pendingDecision.nextNotificationAt.getTime() > Date.now()) {
      return;
    }
    const deadlineAt = chain.pendingDecision ? new Date() : reservation.deadlineAt;
    if (!deadlineAt || !Number.isFinite(deadlineAt.getTime())) {
      console.warn('⚠️ 旧预约缺少有效截止时间，跳过自动恢复', { chainId: chain.chainId });
      return;
    }
    const reservationId = reservation.reservationId!;
    const existing = await queue.getJob(reservationId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'active' || state === 'waiting' || state === 'paused') return;
      if (state === 'delayed') {
        const queuedFor = existing.timestamp + Number(existing.opts.delay ?? 0);
        if (Math.abs(queuedFor - deadlineAt.getTime()) <= 1000) return;
      } else if (state !== 'failed' && state !== 'completed') {
        return;
      }
      await existing.remove();
    }
    await queue.add('reservation', {
      userId: chain.userId,
      reservationId,
      taskDescription: reservation.signal ?? '预约任务',
      duration: reservation.duration ?? DEFAULT_TASK_DURATION_MINUTES,
      scheduledFor: deadlineAt,
      principle: 'LINEAR_DELAY'
    }, { jobId: reservationId, delay: Math.max(0, deadlineAt.getTime() - Date.now()) });
  }

  async cancelTaskReminders(taskId: string): Promise<number> {
    try {
      if (!this.isInitialized) {
        throw new Error('QueueService 未初始化');
      }

      const reminderQueue = this.getReminderQueue();
      const [waitingJobs, delayedJobs] = await Promise.all([
        reminderQueue.getWaiting(),
        reminderQueue.getDelayed()
      ]);

      const jobsToCancel = [...waitingJobs, ...delayedJobs].filter((job) => job.data.taskId === taskId);

      let canceledCount = 0;
      for (const job of jobsToCancel) {
        try {
          await job.remove();
          console.log(`🗑️ 已取消任务提醒: ${job.id} for task ${taskId}`);
          canceledCount += 1;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`⚠️ 取消任务提醒失败: ${job.id}`, errorMessage);
        }
      }

      console.log(`✅ 共取消 ${canceledCount} 个任务提醒 for task ${taskId}`);
      return canceledCount;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ 取消任务提醒失败: ${errorMessage}`, { taskId });
      throw error;
    }
  }

  async rescheduleReservation(reservationId: string, delayMs: number): Promise<BullJobId | undefined> {
    let removedJobData: ReservationJobData | null = null;
    let removedJobDelay = 0;
    let removedExistingJob = false;
    try {
      if (!this.isInitialized) {
        throw new Error('QueueService 未初始化');
      }

      const reservationQueue = this.getReservationQueue();
      const existingJob = await reservationQueue.getJob(reservationId);

      let jobData: ReservationJobData;
      if (existingJob) {
        jobData = existingJob.data;
        removedJobData = jobData;
        removedJobDelay = Math.max(
          0,
          (existingJob.timestamp ?? Date.now()) + Number(existingJob.opts.delay ?? 0) - Date.now()
        );
        await existingJob.remove();
        removedExistingJob = true;
      } else {
        throw new Error('预约不存在或已执行');
      }

      const job = await reservationQueue.add('reservation', jobData, {
        delay: delayMs,
        jobId: reservationId
      });

      console.log(`⏰ 预约已延期: ${reservationId}, 新延迟: ${delayMs / 1000}秒`);
      return job.id;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ 延期预约失败: ${errorMessage}`, { reservationId, delayMs });

      // Removing the old job before re-adding is unavoidable with a stable Bull
      // job id. Restore it if the replacement cannot be created, otherwise the
      // persisted reservation would have no expiry worker after a transient
      // Redis failure.
      if (removedExistingJob && removedJobData) {
        try {
          await this.getReservationQueue().add('reservation', removedJobData, {
            delay: removedJobDelay,
            jobId: reservationId
          });
          console.warn(`⚠️ 延期失败，已恢复原预约队列任务: ${reservationId}`);
        } catch (restoreError) {
          console.error('❌ 延期失败且无法恢复原预约队列任务', {
            reservationId,
            error: restoreError instanceof Error ? restoreError.message : String(restoreError)
          });
        }
      }
      throw error;
    }
  }

  async cancelReservation(reservationId: string): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        throw new Error('QueueService 未初始化');
      }

      const reservationQueue = this.getReservationQueue();
      const job = await reservationQueue.getJob(reservationId);
      if (job) {
        await job.remove();
        console.log(`🗑️ 预约已取消: ${reservationId}`);
        return true;
      }

      console.warn(`⚠️ 预约不存在或已执行: ${reservationId}`);
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ 取消预约失败: ${errorMessage}`, { reservationId });
      throw error;
    }
  }

  async sendProgressNotification(userId: number, message: string, progress: number): Promise<boolean> {
    if (!this.botInstance) {
      console.warn('⚠️ Bot实例未注入，无法发送进度通知');
      return false;
    }

    try {
      // Recheck preferences at delivery: queued reminders may predate an opt-out.
      const user = await User.findOne({ userId });
      if (!user?.settings.reminderEnabled || !user.preferences.progressReminders) return false;
      await sendTelegramMessage(this.botInstance, userId, `${message}\n📈 专注进度: ${progress}%`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ 发送进度通知失败 [用户: ${userId}]:`, errorMessage);
      throw error;
    }
  }

  async sendCompletionNotification(userId: number, message: string, taskId: string): Promise<void> {
    if (!this.botInstance) {
      console.warn('⚠️ Bot实例未注入，无法发送完成通知');
      return;
    }

    try {
      if (!await this.canNotifyTask(userId, taskId)) return;
      await sendTelegramMessage(this.botInstance, userId, `${message}\n\n请确认任务完成状态：`, {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ 成功完成', callback_data: `complete_task_${taskId}` },
            { text: '❌ 未能完成', callback_data: `fail_task_${taskId}` }
          ]]
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ 发送完成通知失败 [用户: ${userId}]:`, errorMessage);
      throw error;
    }
  }

  private async canNotifyTask(userId: number, taskId: string): Promise<boolean> {
    const chain = await TaskChain.findOne({ userId, status: 'active', tasks: { $elemMatch: {
      taskId, status: 'running', creationState: { $nin: ['initializing', 'rolling_back'] }
    } } });
    const task = chain?.tasks.find(entry => entry.taskId === taskId);
    if (!task) return false;
    if (task.mainChainId && !await MainChain.exists({ userId, chainId: task.mainChainId,
      status: 'active', 'nodes.taskId': taskId })) return false;
    return true;
  }

  async sendReservationNotification(
    userId: number,
    reservationId: string,
    taskDescription: string,
    duration: number
  ): Promise<void> {
    if (!this.botInstance) {
      console.warn('⚠️ Bot实例未注入，无法发送预约通知');
      return;
    }

    try {
      const reservationDelayText = formatDurationFromSeconds(config.linearDelay.defaultReservationDelay);
      const message =
        '⏰ 预约时间到！\n\n'
        + '🧠 根据线性时延原理，现在是开始任务的最佳时机。\n'
        + `⏳ ${reservationDelayText}的延迟已经大大降低了启动阻力。\n\n`
        + `📋 任务：${taskDescription}\n`
        + `⏱ 时长：${duration}分钟\n\n`
        + '准备好开始了吗？';

      await sendTelegramMessage(this.botInstance, userId, message, {
        reply_markup: {
          inline_keyboard: [[
            { text: '🚀 立即开始', callback_data: `start_reserved_${reservationId}` },
            { text: '⏰ 延迟5分钟', callback_data: `delay_reservation_5:${reservationId}` },
            { text: '❌ 取消预约', callback_data: `cancel_reservation_${reservationId}` }
          ]]
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ 发送预约通知失败 [用户: ${userId}]:`, errorMessage);
      throw error;
    }
  }

  setBotInstance(botInstance: TelegramBot | null): void {
    this.botInstance = botInstance;
    console.log('🤖 Bot实例已注入到QueueService');
  }

  setReservationExpiryHandler(handler: (reservationId: string) => Promise<void>): void {
    this.reservationExpiryHandler = handler;
  }

  setReservationRecoveryHandler(handler: (reservationId: string) => Promise<boolean>): void {
    this.reservationRecoveryHandler = handler;
  }

  setMainDecisionRecoveryHandler(handler: () => Promise<void>): void {
    this.mainDecisionRecoveryHandler = handler;
  }

  setTaskCreationRecoveryHandler(handler: () => Promise<void>): void {
    this.taskCreationRecoveryHandler = handler;
  }

  setFocusRewardRecoveryHandler(handler: () => Promise<void>): void {
    this.focusRewardRecoveryHandler = handler;
  }

  async getQueueStats(): Promise<QueueStats> {
    try {
      if (!this.isInitialized) {
        throw new Error('QueueService 未初始化');
      }

      const [reminderStats, reservationStats] = await Promise.all([
        this.getReminderQueueStats(),
        this.getReservationQueueStats()
      ]);

      return {
        reminders: reminderStats,
        reservations: reservationStats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ 获取队列统计失败: ${errorMessage}`);
      throw error;
    }
  }

  async getReminderQueueStats(): Promise<QueueCounts> {
    const reminderQueue = this.getReminderQueue();
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      reminderQueue.getWaiting(),
      reminderQueue.getActive(),
      reminderQueue.getCompleted(),
      reminderQueue.getFailed(),
      reminderQueue.getDelayed()
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      total: waiting.length + active.length + delayed.length
    };
  }

  async getReservationQueueStats(): Promise<QueueCounts> {
    const reservationQueue = this.getReservationQueue();
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      reservationQueue.getWaiting(),
      reservationQueue.getActive(),
      reservationQueue.getCompleted(),
      reservationQueue.getFailed(),
      reservationQueue.getDelayed()
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      total: waiting.length + active.length + delayed.length
    };
  }

  async cleanup(): Promise<void> {
    try {
      if (!this.isInitialized) {
        throw new Error('QueueService 未初始化');
      }

      const reminderQueue = this.getReminderQueue();
      const reservationQueue = this.getReservationQueue();
      const cleanupAge = 24 * 60 * 60 * 1000;

      await Promise.all([
        reminderQueue.clean(cleanupAge, 'completed'),
        reminderQueue.clean(cleanupAge, 'failed'),
        reservationQueue.clean(cleanupAge, 'completed'),
        reservationQueue.clean(cleanupAge, 'failed')
      ]);

      console.log('🧹 队列清理完成');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ 队列清理失败: ${errorMessage}`);
      throw error;
    }
  }

  async pauseQueues(): Promise<void> {
    try {
      if (!this.isInitialized) {
        throw new Error('QueueService 未初始化');
      }

      await Promise.all([this.getReminderQueue().pause(), this.getReservationQueue().pause()]);
      console.log('⏸️ 队列已暂停');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ 暂停队列失败: ${errorMessage}`);
      throw error;
    }
  }

  async resumeQueues(): Promise<void> {
    try {
      if (!this.isInitialized) {
        throw new Error('QueueService 未初始化');
      }

      await Promise.all([this.getReminderQueue().resume(), this.getReservationQueue().resume()]);
      console.log('▶️ 队列已恢复');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ 恢复队列失败: ${errorMessage}`);
      throw error;
    }
  }

  async healthCheck(): Promise<QueueHealthCheck> {
    try {
      if (!this.isInitialized) {
        return { status: 'unhealthy', message: 'QueueService 未初始化' };
      }

      const reminderQueue = this.getReminderQueue();
      const reservationQueue = this.getReservationQueue();
      const stats = await this.getQueueStats();
      const [reminderPaused, reservationPaused] = await Promise.all([
        reminderQueue.isPaused(),
        reservationQueue.isPaused()
      ]);
      const isHealthy = !reminderPaused && !reservationPaused;

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        message: isHealthy ? '队列服务运行正常' : '队列服务存在问题',
        stats,
        queues: {
          reminder: {
            paused: reminderPaused,
            name: reminderQueue.name
          },
          reservation: {
            paused: reservationPaused,
            name: reservationQueue.name
          }
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        status: 'unhealthy',
        message: `队列健康检查失败: ${errorMessage}`,
        error: errorMessage
      };
    }
  }

  async close(): Promise<void> {
    this.isInitialized = false;
    try {
      if (this.maintenanceQueue) {
        await this.maintenanceQueue.close();
      }
      if (this.reminderQueue) {
        await this.reminderQueue.close();
      }

      if (this.reservationQueue) {
        await this.reservationQueue.close();
      }

      this.isInitialized = false;
      console.log('✅ 队列服务已关闭');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ 关闭队列服务失败: ${errorMessage}`);
      throw error;
    }
  }
}

export default QueueService;
