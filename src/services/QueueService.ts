import Queue from 'bull';
import type TelegramBot from 'node-telegram-bot-api';
import config from '../../config/index.js';
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

  isInitialized: boolean;

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

      this.setupProcessors();
      this.setupEventListeners();

      this.isInitialized = true;
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
        await this.sendProgressNotification(userId, message, progress);
        console.log(`📊 进度提醒发送成功: ${taskId} - ${progress}%`);
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
        const { userId, reservationId, taskDescription, duration } = job.data;

        try {
          await this.sendReservationNotification(userId, reservationId, taskDescription, duration);
          console.log(`⏰ 预约提醒发送成功: ${reservationId} for user ${userId}`);
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
    duration = 25
  ): Promise<BullJobId | undefined> {
    try {
      if (!this.isInitialized) {
        throw new Error('QueueService 未初始化');
      }

      const reservationQueue = this.getReservationQueue();
      const delay = config.linearDelay.defaultReservationDelay * 1000;
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

      console.log(`⏰ 15分钟预约已安排: ${reservationId} for user ${userId}, 延迟: ${delay / 1000}秒`);
      return job.id;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ 安排预约失败: ${errorMessage}`, { userId, reservationId });
      throw error;
    }
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
    try {
      if (!this.isInitialized) {
        throw new Error('QueueService 未初始化');
      }

      const reservationQueue = this.getReservationQueue();
      const existingJob = await reservationQueue.getJob(reservationId);

      let jobData: ReservationJobData;
      if (existingJob) {
        jobData = existingJob.data;
        await existingJob.remove();
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

  async sendProgressNotification(userId: number, message: string, progress: number): Promise<void> {
    if (!this.botInstance) {
      console.warn('⚠️ Bot实例未注入，无法发送进度通知');
      return;
    }

    try {
      await this.botInstance.sendMessage(userId, `${message}\n📈 专注进度: ${progress}%`);
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
      await this.botInstance.sendMessage(userId, `${message}\n\n请确认任务完成状态：`, {
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
      const message =
        '⏰ 预约时间到！\n\n'
        + '🧠 根据线性时延原理，现在是开始任务的最佳时机。\n'
        + `⏳ ${config.linearDelay.defaultReservationDelay / 60}分钟的延迟已经大大降低了启动阻力。\n\n`
        + `📋 任务：${taskDescription}\n`
        + `⏱ 时长：${duration}分钟\n\n`
        + '准备好开始了吗？';

      await this.botInstance.sendMessage(userId, message, {
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
    try {
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
