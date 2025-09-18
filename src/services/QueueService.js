import Queue from 'bull';
import config from '../../config/index.js';

class QueueService {
  constructor() {
    this.botInstance = null;
    this.reminderQueue = null;
    this.reservationQueue = null;
    this.isInitialized = false;
  }

  // 初始化队列服务
  async initialize() {
    try {
      if (this.isInitialized) {
        console.warn('⚠️ QueueService 已经初始化');
        return;
      }

      // 创建任务提醒队列
      this.reminderQueue = new Queue('任务提醒队列', {
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

      // 创建预约提醒队列
      this.reservationQueue = new Queue('预约提醒队列', {
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

      // 设置队列处理器
      this.setupProcessors();

      // 设置事件监听器
      this.setupEventListeners();

      this.isInitialized = true;
      console.log('✅ QueueService 初始化成功');
    } catch (error) {
      console.error('❌ QueueService 初始化失败:', error.message);
      throw error;
    }
  }

  // 设置队列处理器
  setupProcessors() {
    // 任务进度提醒处理器
    this.reminderQueue.process('progress', config.queues.concurrency, async (job) => {
      const {
        userId, taskId, progress, message
      } = job.data;

      try {
        await this.sendProgressNotification(userId, message, progress);
        console.log(`📊 进度提醒发送成功: ${taskId} - ${progress}%`);
        return { success: true, taskId, progress };
      } catch (error) {
        console.error(`❌ 进度提醒发送失败: ${error.message}`, { userId, taskId, progress });
        throw error;
      }
    });

    // 任务完成提醒处理器
    this.reminderQueue.process('completion', config.queues.concurrency, async (job) => {
      const { userId, taskId, message } = job.data;

      try {
        await this.sendCompletionNotification(userId, message, taskId);
        console.log(`✅ 完成提醒发送成功: ${taskId}`);
        return { success: true, taskId };
      } catch (error) {
        console.error(`❌ 完成提醒发送失败: ${error.message}`, { userId, taskId });
        throw error;
      }
    });

    // 预约提醒处理器 - 线性时延原理实现
    this.reservationQueue.process('reservation', config.queues.concurrency, async (job) => {
      const {
        userId, reservationId, taskDescription, duration
      } = job.data;

      try {
        await this.sendReservationNotification(userId, reservationId, taskDescription, duration);
        console.log(`⏰ 预约提醒发送成功: ${reservationId} for user ${userId}`);
        return { success: true, reservationId, userId };
      } catch (error) {
        console.error(`❌ 预约提醒发送失败: ${error.message}`, { userId, reservationId });
        throw error;
      }
    });

    console.log('🔧 队列处理器设置完成');
  }

  // 设置队列事件监听器
  setupEventListeners() {
    // 任务提醒队列事件
    this.reminderQueue.on('completed', (job, result) => {
      console.log(`✅ 任务提醒队列任务完成: ${job.id}`, result);
    });

    this.reminderQueue.on('failed', (job, err) => {
      console.error(`❌ 任务提醒队列任务失败: ${job.id}`, {
        error: err.message,
        data: job.data,
        attempts: job.attemptsMade
      });
    });

    this.reminderQueue.on('stalled', (job) => {
      console.warn(`⏸️ 任务提醒队列任务停滞: ${job.id}`);
    });

    // 预约提醒队列事件
    this.reservationQueue.on('completed', (job, result) => {
      console.log(`✅ 预约提醒队列任务完成: ${job.id}`, result);
    });

    this.reservationQueue.on('failed', (job, err) => {
      console.error(`❌ 预约提醒队列任务失败: ${job.id}`, {
        error: err.message,
        data: job.data,
        attempts: job.attemptsMade
      });
    });

    this.reservationQueue.on('stalled', (job) => {
      console.warn(`⏸️ 预约提醒队列任务停滞: ${job.id}`);
    });

    // 全局错误处理
    this.reminderQueue.on('error', (error) => {
      console.error('❌ 任务提醒队列错误:', error.message);
    });

    this.reservationQueue.on('error', (error) => {
      console.error('❌ 预约提醒队列错误:', error.message);
    });

    console.log('👂 队列事件监听器设置完成');
  }

  // 添加提醒任务
  async addReminder(type, data, delay) {
    try {
      if (!this.isInitialized) {
        throw new Error('QueueService 未初始化');
      }

      const jobOptions = {
        delay,
        jobId: `${type}_${data.taskId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}` // 唯一ID避免重复
      };

      const job = await this.reminderQueue.add(type, data, jobOptions);

      console.log(`⏰ ${type} 提醒已安排: ${job.id}, 延迟: ${delay}ms`);
      return job.id;
    } catch (error) {
      console.error(`❌ 添加提醒任务失败: ${error.message}`, { type, data, delay });
      throw error;
    }
  }

  // 添加15分钟预约 - 线性时延原理核心实现
  async scheduleReservation(userId, reservationId, taskDescription, duration = 25) {
    try {
      if (!this.isInitialized) {
        throw new Error('QueueService 未初始化');
      }

      // 🔴 线性时延原理：15分钟延迟
      const delay = config.linearDelay.defaultReservationDelay * 1000; // 转换为毫秒

      const jobData = {
        userId,
        reservationId,
        taskDescription,
        duration,
        scheduledFor: new Date(Date.now() + delay),
        principle: 'LINEAR_DELAY' // 标记原理类型
      };

      const job = await this.reservationQueue.add('reservation', jobData, {
        delay,
        jobId: reservationId // 使用预约ID作为Job ID，便于后续管理
      });

      console.log(`⏰ 15分钟预约已安排: ${reservationId} for user ${userId}, 延迟: ${delay / 1000}秒`);
      return job.id;
    } catch (error) {
      console.error(`❌ 安排预约失败: ${error.message}`, { userId, reservationId });
      throw error;
    }
  }

  // 取消任务相关的所有提醒
  async cancelTaskReminders(taskId) {
    try {
      if (!this.isInitialized) {
        throw new Error('QueueService 未初始化');
      }

      // 获取所有等待中和延迟的任务
      const [waitingJobs, delayedJobs] = await Promise.all([
        this.reminderQueue.getWaiting(),
        this.reminderQueue.getDelayed()
      ]);

      const allJobs = [...waitingJobs, ...delayedJobs];

      // 找到与此任务相关的提醒任务并取消
      const jobsToCancel = allJobs.filter((job) => job.data.taskId === taskId);

      let canceledCount = 0;
      for (const job of jobsToCancel) {
        try {
          await job.remove();
          console.log(`🗑️ 已取消任务提醒: ${job.id} for task ${taskId}`);
          canceledCount += 1;
        } catch (error) {
          console.warn(`⚠️ 取消任务提醒失败: ${job.id}`, error.message);
        }
      }

      console.log(`✅ 共取消 ${canceledCount} 个任务提醒 for task ${taskId}`);
      return canceledCount;
    } catch (error) {
      console.error(`❌ 取消任务提醒失败: ${error.message}`, { taskId });
      throw error;
    }
  }

  // 取消预约
  async cancelReservation(reservationId) {
    try {
      if (!this.isInitialized) {
        throw new Error('QueueService 未初始化');
      }

      // 通过Job ID取消特定预约
      const job = await this.reservationQueue.getJob(reservationId);
      if (job) {
        await job.remove();
        console.log(`🗑️ 预约已取消: ${reservationId}`);
        return true;
      }

      console.warn(`⚠️ 预约不存在或已执行: ${reservationId}`);
      return false;
    } catch (error) {
      console.error(`❌ 取消预约失败: ${error.message}`, { reservationId });
      throw error;
    }
  }

  // 发送进度通知
  async sendProgressNotification(userId, message, progress) {
    if (!this.botInstance) {
      console.warn('⚠️ Bot实例未注入，无法发送进度通知');
      return;
    }

    try {
      await this.botInstance.sendMessage(userId, `${message}\n📈 专注进度: ${progress}%`);
    } catch (error) {
      console.error(`❌ 发送进度通知失败 [用户: ${userId}]:`, error.message);
      throw error;
    }
  }

  // 发送完成通知
  async sendCompletionNotification(userId, message, taskId) {
    if (!this.botInstance) {
      console.warn('⚠️ Bot实例未注入，无法发送完成通知');
      return;
    }

    try {
      await this.botInstance.sendMessage(
        userId,
        `${message}\n\n`
        + '请确认任务完成状态：',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ 成功完成', callback_data: `complete_task_${taskId}` },
              { text: '❌ 未能完成', callback_data: `fail_task_${taskId}` }
            ]]
          }
        }
      );
    } catch (error) {
      console.error(`❌ 发送完成通知失败 [用户: ${userId}]:`, error.message);
      throw error;
    }
  }

  // 发送预约通知 - 线性时延原理实现
  async sendReservationNotification(userId, reservationId, taskDescription, duration) {
    if (!this.botInstance) {
      console.warn('⚠️ Bot实例未注入，无法发送预约通知');
      return;
    }

    try {
      const message = '⏰ 预约时间到！\n\n'
        + '🧠 根据线性时延原理，现在是开始任务的最佳时机。\n'
        + `⏳ ${config.linearDelay.defaultReservationDelay / 60}分钟的延迟已经大大降低了启动阻力。\n\n`
        + `📋 任务：${taskDescription}\n`
        + `⏱ 时长：${duration}分钟\n\n`
        + '准备好开始了吗？';

      await this.botInstance.sendMessage(userId, message, {
        reply_markup: {
          inline_keyboard: [[
            { text: '🚀 立即开始', callback_data: `start_reserved_${reservationId}` },
            { text: '⏰ 延迟5分钟', callback_data: `delay_reservation_${reservationId}_5` },
            { text: '❌ 取消预约', callback_data: `cancel_reservation_${reservationId}` }
          ]]
        }
      });
    } catch (error) {
      console.error(`❌ 发送预约通知失败 [用户: ${userId}]:`, error.message);
      throw error;
    }
  }

  // 注入Bot实例（用于发送消息）
  setBotInstance(botInstance) {
    this.botInstance = botInstance;
    console.log('🤖 Bot实例已注入到QueueService');
  }

  // 获取队列统计信息
  async getQueueStats() {
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
      console.error(`❌ 获取队列统计失败: ${error.message}`);
      throw error;
    }
  }

  // 获取提醒队列统计
  async getReminderQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.reminderQueue.getWaiting(),
      this.reminderQueue.getActive(),
      this.reminderQueue.getCompleted(),
      this.reminderQueue.getFailed(),
      this.reminderQueue.getDelayed()
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

  // 获取预约队列统计
  async getReservationQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.reservationQueue.getWaiting(),
      this.reservationQueue.getActive(),
      this.reservationQueue.getCompleted(),
      this.reservationQueue.getFailed(),
      this.reservationQueue.getDelayed()
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

  // 清理过期任务
  async cleanup() {
    try {
      if (!this.isInitialized) {
        throw new Error('QueueService 未初始化');
      }

      const cleanupAge = 24 * 60 * 60 * 1000; // 24小时

      await Promise.all([
        this.reminderQueue.clean(cleanupAge, 'completed'),
        this.reminderQueue.clean(cleanupAge, 'failed'),
        this.reservationQueue.clean(cleanupAge, 'completed'),
        this.reservationQueue.clean(cleanupAge, 'failed')
      ]);

      console.log('🧹 队列清理完成');
    } catch (error) {
      console.error(`❌ 队列清理失败: ${error.message}`);
      throw error;
    }
  }

  // 暂停队列
  async pauseQueues() {
    try {
      if (!this.isInitialized) {
        throw new Error('QueueService 未初始化');
      }

      await Promise.all([
        this.reminderQueue.pause(),
        this.reservationQueue.pause()
      ]);

      console.log('⏸️ 队列已暂停');
    } catch (error) {
      console.error(`❌ 暂停队列失败: ${error.message}`);
      throw error;
    }
  }

  // 恢复队列
  async resumeQueues() {
    try {
      if (!this.isInitialized) {
        throw new Error('QueueService 未初始化');
      }

      await Promise.all([
        this.reminderQueue.resume(),
        this.reservationQueue.resume()
      ]);

      console.log('▶️ 队列已恢复');
    } catch (error) {
      console.error(`❌ 恢复队列失败: ${error.message}`);
      throw error;
    }
  }

  // 健康检查
  async healthCheck() {
    try {
      if (!this.isInitialized) {
        return { status: 'unhealthy', message: 'QueueService 未初始化' };
      }

      const stats = await this.getQueueStats();

      const isHealthy = this.reminderQueue && this.reservationQueue
        && !this.reminderQueue.paused && !this.reservationQueue.paused;

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        message: isHealthy ? '队列服务运行正常' : '队列服务存在问题',
        stats,
        queues: {
          reminder: {
            paused: this.reminderQueue.paused,
            name: this.reminderQueue.name
          },
          reservation: {
            paused: this.reservationQueue.paused,
            name: this.reservationQueue.name
          }
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `队列健康检查失败: ${error.message}`,
        error: error.message
      };
    }
  }

  // 关闭队列服务
  async close() {
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
      console.error(`❌ 关闭队列服务失败: ${error.message}`);
      throw error;
    }
  }
}

export default QueueService;
