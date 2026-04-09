import { DailyStats, TaskChain, User } from '../models/index.js';
import { generateId } from '../utils/index.js';
import logger from '../utils/logger.js';
import QueueService from './QueueService.js';
import CultivationService from './CultivationService.js';
import type { DailyStatsDocument, ITask } from '../types/models.js';
import type {
  CompleteTaskResult,
  CreateTaskResult,
  CultivationReward,
  CultivationServiceDependency,
  GetUserStatusOptions,
  QueueServiceDependency,
  UserStatusResult
} from '../types/services.js';

class TaskService {
  queueService: QueueServiceDependency;

  cultivationService: CultivationServiceDependency;

  constructor(
    queueService: QueueServiceDependency | null = null,
    cultivationService: CultivationServiceDependency | null = null
  ) {
    this.queueService = queueService || new QueueService();
    this.cultivationService = cultivationService || new CultivationService();
  }

  async createTask(
    userId: number,
    description = '专注任务',
    duration = 25,
    isReserved = false,
    reservationId: string | null = null
  ): Promise<CreateTaskResult> {
    try {
      let user = await User.findOne({ userId });
      if (!user) {
        user = await User.create({
          userId,
          settings: { defaultDuration: duration }
        });
        logger.info(`新用户创建: ${userId}`);
      }

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

      const runningTask = chain.tasks.find((task) => task.status === 'running');
      if (runningTask) {
        runningTask.status = 'cancelled';
        runningTask.endTime = new Date();
        runningTask.metadata.notes = '被新任务中断';

        await this.cancelTaskReminders(runningTask.taskId);
        logger.info(`自动停止旧任务: ${runningTask.taskId}, 开始新任务`);
      }

      const task: ITask = {
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

      chain.tasks.push(task);
      chain.totalTasks += 1;
      await chain.save();

      user.stats.totalTasks += 1;
      await user.save();

      await this.scheduleProgressReminders(userId, task.taskId, duration);

      logger.info(`任务创建成功: ${task.taskId} for user ${userId}, duration: ${duration}min`);

      return { chain, task, user };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`创建任务失败: ${message}`, { userId, description, duration });
      throw new Error(`创建任务失败: ${message}`);
    }
  }

  async completeTask(
    userId: number,
    taskId: string,
    success = true,
    failureReason: string | null = null
  ): Promise<CompleteTaskResult> {
    try {
      // Step 1: Read task data for duration check (non-atomic read)
      const checkChain = await TaskChain.findOne({
        userId,
        'tasks.taskId': taskId,
        'tasks.status': 'running'
      });

      if (!checkChain) {
        throw new Error('任务不存在、已完成或未在运行状态');
      }

      const checkTask = checkChain.tasks.find((entry) => entry.taskId === taskId);
      if (!checkTask) {
        throw new Error('指定的任务不存在');
      }

      const endTime = new Date();
      const actualDuration = Math.floor((endTime.getTime() - checkTask.startTime.getTime()) / 60000);

      // Self-control enforcement: cannot mark complete before duration elapsed
      if (success && actualDuration < checkTask.duration) {
        const remaining = checkTask.duration - actualDuration;
        throw new Error(
          `自控力检查：任务时长 ${checkTask.duration} 分钟，实际仅过 ${actualDuration} 分钟。还差 ${remaining} 分钟，请继续专注！`
        );
      }

      // Step 2: Atomic status transition to prevent duplicate completion
      const newStatus = success ? 'completed' : 'failed';
      const chain = await TaskChain.findOneAndUpdate(
        {
          userId,
          'tasks.taskId': taskId,
          'tasks.status': 'running'
        },
        {
          $set: {
            'tasks.$.status': newStatus,
            'tasks.$.endTime': endTime,
            'tasks.$.actualDuration': actualDuration
          }
        },
        { new: true }
      );

      if (!chain) {
        throw new Error('任务不存在、已完成或未在运行状态');
      }

      const task = chain.tasks.find((entry) => entry.taskId === taskId);
      if (!task) {
        throw new Error('指定的任务不存在');
      }

      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error('用户不存在');
      }

      if (success) {
        chain.completedTasks += 1;
        chain.totalMinutes += actualDuration;
        chain.lastTaskCompletedAt = endTime;

        user.stats.completedTasks += 1;
        user.stats.totalMinutes += actualDuration;
        user.updateStreak(true);
        user.stats.lastTaskDate = endTime;

        let cultivationReward: CultivationReward | null = null;
        try {
          cultivationReward = await this.cultivationService.awardCultivation(userId, actualDuration);
          logger.info(
            `修仙奖励: +${cultivationReward.spiritualPower}灵力, +${cultivationReward.immortalStones}仙石`,
            {
              userId,
              taskId,
              realmChanged: cultivationReward.realmChanged
            }
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`修仙奖励失败: ${message}`, { userId, taskId });
        }

        logger.info(`任务完成成功: ${taskId}, 用户连击数: ${user.stats.currentStreak}`);

        await Promise.all([chain.save(), user.save()]);
        await this.cancelTaskReminders(taskId);
        await this.updateDailyStats(userId, task, true);

        return {
          chain,
          task,
          user,
          wasChainBroken: false,
          cultivationReward
        };
      }

      chain.failedTasks += 1;
      chain.breakChain(failureReason || '任务未能完成', taskId);

      user.stats.failedTasks += 1;
      user.updateStreak(false);

      logger.warn(`任务失败，链条重置: ${taskId}, 原因: ${failureReason}`, {
        userId,
        chainId: chain.chainId,
        previousTotal: chain.totalTasks,
        previousCompleted: chain.completedTasks
      });

      await Promise.all([chain.save(), user.save()]);
      await this.cancelTaskReminders(taskId);
      await this.updateDailyStats(userId, task, false);

      return {
        chain,
        task,
        user,
        wasChainBroken: true,
        cultivationReward: null
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`完成任务失败: ${message}`, { userId, taskId, success });
      throw new Error(`完成任务失败: ${message}`);
    }
  }

  async getUserStatus(
    userId: number,
    options: GetUserStatusOptions = {}
  ): Promise<UserStatusResult> {
    try {
      const { includeTodayStats = true } = options;
      const [user, activeChain, todayStats] = await Promise.all([
        User.findOne({ userId }),
        TaskChain.findOne({ userId, status: 'active' }),
        includeTodayStats ? this.getDailyStats(userId, new Date()) : Promise.resolve(undefined)
      ]);

      const currentTask = activeChain?.currentTask;

      return {
        user,
        activeChain,
        currentTask,
        todayStats,
        isActive: Boolean(currentTask),
        stats: user?.stats || {}
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`获取用户状态失败: ${message}`, { userId });
      throw new Error(`获取用户状态失败: ${message}`);
    }
  }

  async scheduleProgressReminders(userId: number, taskId: string, duration: number): Promise<void> {
    const progressIntervals = [0.25, 0.5, 0.75];

    const reminderPromises = progressIntervals.map(async (progress) => {
      const delay = duration * progress * 60 * 1000;
      return this.queueService.addReminder(
        'progress',
        {
          userId,
          taskId,
          progress: progress * 100,
          message: `📊 任务进度: ${progress * 100}% 完成`
        },
        delay
      );
    });

    await Promise.all(reminderPromises);

    const completionDelay = duration * 60 * 1000;
    await this.queueService.addReminder(
      'completion',
      {
        userId,
        taskId,
        message: '⏰ 专注时间结束！'
      },
      completionDelay
    );
  }

  async cancelTaskReminders(taskId: string): Promise<void> {
    await this.queueService.cancelTaskReminders(taskId);
  }

  async updateDailyStats(userId: number, task: ITask, success: boolean): Promise<DailyStatsDocument> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await DailyStats.findOneAndUpdate(
      { userId, date: today },
      {
        $inc: {
          'stats.tasksStarted': 1,
          'stats.tasksCompleted': success ? 1 : 0,
          'stats.tasksFailed': success ? 0 : 1,
          'stats.totalMinutes': success ? (task.actualDuration ?? 0) : 0
        },
        $set: {
          'metadata.lastTaskAt': task.endTime
        }
      },
      { upsert: true, new: true }
    );

    if (!stats) {
      throw new Error('更新每日统计失败');
    }

    if (stats.stats.tasksStarted > 0) {
      stats.stats.successRate = (stats.stats.tasksCompleted / stats.stats.tasksStarted) * 100;
      await stats.save();
    }

    return stats;
  }

  async getDailyStats(userId: number, date = new Date()): Promise<DailyStatsDocument> {
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
