import { TaskChain, User, DailyStats } from '../models/index.js';
import { generateId } from '../utils/index.js';
import logger from '../utils/logger.js';
import QueueService from './QueueService.js';
import CultivationService from './CultivationService.js';

/**
 * TaskService - 任务管理核心服务
 * 实现神圣座位原理：任何任务失败立即重置所有进度
 */
class TaskService {
  constructor(queueService = null, cultivationService = null) {
    this.queueService = queueService || new QueueService();
    this.cultivationService = cultivationService || new CultivationService();
  }

  /**
   * 创建新任务 - 遵循神圣座位原理
   * @param {number} userId - 用户ID
   * @param {string} description - 任务描述
   * @param {number} duration - 任务时长（分钟）
   * @param {boolean} isReserved - 是否为预约任务
   * @param {string} reservationId - 预约ID（如果适用）
   */
  async createTask(userId, description = '专注任务', duration = 25, isReserved = false, reservationId = null) {
    try {
      // 1. 确保用户存在
      let user = await User.findOne({ userId });
      if (!user) {
        user = await User.create({
          userId,
          settings: { defaultDuration: duration }
        });
        logger.info(`新用户创建: ${userId}`);
      }

      // 2. 查找或创建活跃任务链
      let chain = await TaskChain.findOne({
        userId,
        status: 'active'
      });

      if (!chain) {
        chain = await TaskChain.create({
          userId,
          chainId: generateId('chain'),
          title: '专注任务链',
          status: 'active'
        });
        logger.info(`新任务链创建: ${chain.chainId} for user ${userId}`);
      }

      // 3. 检查是否有正在进行的任务，如果有则自动停止
      const runningTask = chain.tasks.find((task) => task.status === 'running');
      if (runningTask) {
        // 自动停止当前任务（标记为取消）
        runningTask.status = 'cancelled';
        runningTask.endTime = new Date();
        runningTask.metadata.notes = '被新任务中断';

        // 取消旧任务的提醒
        await this.cancelTaskReminders(runningTask.taskId);

        logger.info(`自动停止旧任务: ${runningTask.taskId}, 开始新任务`);
      }

      // 4. 创建新任务
      const task = {
        taskId: generateId('task'),
        description,
        duration,
        startTime: new Date(),
        status: 'running',
        isReserved,
        reservationId,
        metadata: {
          progressReminders: [],
          interruptions: [],
          notes: ''
        }
      };

      // 5. 更新任务链
      chain.tasks.push(task);
      chain.totalTasks += 1;
      await chain.save();

      // 6. 更新用户统计
      user.stats.totalTasks += 1;
      await user.save();

      // 7. 安排进度提醒
      await this.scheduleProgressReminders(userId, task.taskId, duration);

      // 8. 记录日志
      logger.info(`任务创建成功: ${task.taskId} for user ${userId}, duration: ${duration}min`);

      return { chain, task, user };
    } catch (error) {
      logger.error(`创建任务失败: ${error.message}`, { userId, description, duration });
      throw new Error(`创建任务失败: ${error.message}`);
    }
  }

  /**
   * 完成任务 - 神圣座位原理核心实现
   * @param {number} userId - 用户ID
   * @param {string} taskId - 任务ID
   * @param {boolean} success - 是否成功完成
   * @param {string} failureReason - 失败原因（如果适用）
   */
  async completeTask(userId, taskId, success = true, failureReason = null) {
    try {
      // 🔒 使用原子操作更新任务状态，防止重复结算
      const endTime = new Date();
      const newStatus = success ? 'completed' : 'failed';

      // 1. 原子性地查找并更新任务状态（防止竞态条件）
      const chain = await TaskChain.findOneAndUpdate(
        {
          userId,
          'tasks.taskId': taskId,
          'tasks.status': 'running' // ← 关键：只有running状态才能更新
        },
        {
          $set: {
            'tasks.$.status': newStatus,
            'tasks.$.endTime': endTime
          }
        },
        {
          new: false // 返回更新前的文档，用于计算奖励
        }
      );

      // 如果没有找到，说明任务不存在或已经被完成
      if (!chain) {
        throw new Error('任务不存在、已完成或未在运行状态');
      }

      // 2. 获取任务信息（从更新前的文档）
      const task = chain.tasks.find((t) => t.taskId === taskId);
      if (!task) {
        throw new Error('指定的任务不存在');
      }

      // 3. 计算实际时长
      task.status = newStatus; // 更新本地对象状态用于后续逻辑
      task.endTime = endTime;
      task.actualDuration = Math.floor((endTime - task.startTime) / 60000); // 实际时长（分钟）

      // 4. 重新获取更新后的 chain（用于后续统计更新）
      const updatedChain = await TaskChain.findOne({
        userId,
        'tasks.taskId': taskId
      });

      if (!updatedChain) {
        throw new Error('任务链在更新后丢失');
      }

      // 5. 获取用户信息
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error('用户不存在');
      }

      if (success) {
        // 成功完成任务
        updatedChain.completedTasks += 1;
        updatedChain.totalMinutes += task.actualDuration;
        updatedChain.lastTaskCompletedAt = endTime;

        // 更新用户统计
        user.stats.completedTasks += 1;
        user.stats.totalMinutes += task.actualDuration;
        user.updateStreak(true);
        user.stats.lastTaskDate = endTime;

        // 🌟 奖励修仙系统
        let cultivationReward = null;
        try {
          cultivationReward = await this.cultivationService.awardCultivation(userId, task.actualDuration);
          logger.info(`修仙奖励: +${cultivationReward.spiritualPower}灵力, +${cultivationReward.immortalStones}仙石`, {
            userId,
            taskId,
            realmChanged: cultivationReward.realmChanged
          });
        } catch (error) {
          logger.error(`修仙奖励失败: ${error.message}`, { userId, taskId });
          // 修仙奖励失败不影响任务完成
        }

        logger.info(`任务完成成功: ${taskId}, 用户连击数: ${user.stats.currentStreak}`);

        // 6. 保存更新
        await Promise.all([
          updatedChain.save(),
          user.save()
        ]);

        // 7. 取消相关的定时任务
        await this.cancelTaskReminders(taskId);

        // 8. 更新每日统计
        await this.updateDailyStats(userId, task, success);

        return {
          chain: updatedChain,
          task,
          user,
          wasChainBroken: false,
          cultivationReward
        };
      } else {
        // 🔴 神圣座位原理：任务失败 - 完全重置
        updatedChain.failedTasks += 1;

        // 破坏任务链 - 核心逻辑
        updatedChain.breakChain(failureReason || '任务未能完成', taskId);

        // 重置用户连击记录
        user.stats.failedTasks += 1;
        user.updateStreak(false); // 连击清零

        logger.warn(`任务失败，链条重置: ${taskId}, 原因: ${failureReason}`, {
          userId,
          chainId: updatedChain.chainId,
          previousTotal: updatedChain.totalTasks,
          previousCompleted: updatedChain.completedTasks
        });

        // 6. 保存更新
        await Promise.all([
          updatedChain.save(),
          user.save()
        ]);

        // 7. 取消相关的定时任务
        await this.cancelTaskReminders(taskId);

        // 8. 更新每日统计
        await this.updateDailyStats(userId, task, success);

        return {
          chain: updatedChain,
          task,
          user,
          wasChainBroken: true,
          cultivationReward: null
        };
      }
    } catch (error) {
      logger.error(`完成任务失败: ${error.message}`, { userId, taskId, success });
      throw new Error(`完成任务失败: ${error.message}`);
    }
  }

  /**
   * 获取用户当前状态
   */
  async getUserStatus(userId) {
    try {
      const [user, activeChain, todayStats] = await Promise.all([
        User.findOne({ userId }),
        TaskChain.findOne({ userId, status: 'active' }),
        this.getDailyStats(userId, new Date())
      ]);

      const currentTask = activeChain?.currentTask;

      return {
        user,
        activeChain,
        currentTask,
        todayStats,
        isActive: !!currentTask,
        stats: user?.stats || {}
      };
    } catch (error) {
      logger.error(`获取用户状态失败: ${error.message}`, { userId });
      throw new Error(`获取用户状态失败: ${error.message}`);
    }
  }

  /**
   * 安排进度提醒
   */
  async scheduleProgressReminders(userId, taskId, duration) {
    const progressIntervals = [0.25, 0.5, 0.75]; // 25%, 50%, 75%

    const reminderPromises = progressIntervals.map(async (progress) => {
      const delay = duration * progress * 60 * 1000; // 毫秒
      return this.queueService.addReminder('progress', {
        userId,
        taskId,
        progress: progress * 100,
        message: `📊 任务进度: ${progress * 100}% 完成`
      }, delay);
    });

    await Promise.all(reminderPromises);

    // 完成提醒
    const completionDelay = duration * 60 * 1000;
    await this.queueService.addReminder('completion', {
      userId,
      taskId,
      message: '⏰ 专注时间结束！'
    }, completionDelay);
  }

  /**
   * 取消任务相关提醒
   */
  async cancelTaskReminders(taskId) {
    await this.queueService.cancelTaskReminders(taskId);
  }

  /**
   * 更新每日统计
   */
  async updateDailyStats(userId, task, success) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await DailyStats.findOneAndUpdate(
      { userId, date: today },
      {
        $inc: {
          'stats.tasksStarted': 1,
          'stats.tasksCompleted': success ? 1 : 0,
          'stats.tasksFailed': success ? 0 : 1,
          'stats.totalMinutes': success ? task.actualDuration : 0
        },
        $set: {
          'metadata.lastTaskAt': task.endTime
        }
      },
      { upsert: true, new: true }
    );

    // 更新成功率
    if (stats.stats.tasksStarted > 0) {
      stats.stats.successRate = (stats.stats.tasksCompleted / stats.stats.tasksStarted) * 100;
      await stats.save();
    }

    return stats;
  }

  /**
   * 获取每日统计
   */
  async getDailyStats(userId, date = new Date()) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    let stats = await DailyStats.findOne({
      userId,
      date: startOfDay
    });

    if (!stats) {
      stats = await DailyStats.create({
        userId,
        date: startOfDay,
        stats: {
          tasksStarted: 0,
          tasksCompleted: 0,
          tasksFailed: 0,
          totalMinutes: 0,
          successRate: 0
        }
      });
    }

    return stats;
  }
}

export default TaskService;
