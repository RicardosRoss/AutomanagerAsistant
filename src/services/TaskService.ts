import { AuxChain, DailyStats, MainChain, TaskChain, User } from '../models/index.js';
import { DEFAULT_TASK_DURATION_MINUTES } from '../types/taskDefaults.js';
import { generateId } from '../utils/index.js';
import logger from '../utils/logger.js';
import QueueService from './QueueService.js';
import CultivationService from './CultivationService.js';
import StatsService from './StatsService.js';
import FocusRewardService from './FocusRewardService.js';
import { withTaskCreationLock, withUserProtocolLock } from '../utils/taskCreationLock.js';
import { randomUUID } from 'node:crypto';
import moment from 'moment-timezone';
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
  private static readonly activeCreations = new Set<string>();
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
    duration = DEFAULT_TASK_DURATION_MINUTES,
    isReserved = false,
    reservationId: string | null = null,
    submissionToken?: string,
    reservationStartToken?: string,
    mainChainId?: string
  ): Promise<CreateTaskResult> {
    let createdTaskId: string | null = null;
    let taskPersisted = false;
    try {
      await this.assertNoMainViolation(userId);
      if (reservationStartToken) await this.assertReservationStart(userId, reservationId, reservationStartToken);
      const user = await User.findOrCreate({ userId });
      if (submissionToken) {
        const existing = await TaskChain.findOne({ userId, 'tasks.submissionToken': submissionToken });
        const existingTask = existing?.tasks.find((entry) => entry.submissionToken === submissionToken);
        if (existing && existingTask) {
          if (existingTask.creationState === 'initializing' || existingTask.creationState === 'rolling_back') {
            throw new Error('任务正在初始化或清理，请稍后查看状态');
          }
          return { chain: existing, task: existingTask, user };
        }
      }
      await this.assertNoPendingSettlement(userId);
      await TaskChain.init();
      let activeChain;
      try {
        activeChain = await TaskChain.findOneAndUpdate(
          { userId, status: 'active' },
          {
            $setOnInsert: { chainId: generateId('chain'), title: '专注任务链', tasks: [] }
          },
          { upsert: true, new: true }
        );
      } catch (error) {
        if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
        activeChain = await TaskChain.findOne({ userId, status: 'active' });
      }
      if (!activeChain) throw new Error('无法创建任务链');

      const task: ITask = {
        taskId: generateId('task'),
        submissionToken,
        mainChainId,
        creationState: 'initializing',
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
      createdTaskId = task.taskId;
      TaskService.activeCreations.add(task.taskId);

      const chain = await TaskChain.findOneAndUpdate(
        {
          _id: activeChain._id,
          status: 'active',
          // Token retry safety also relies on this single-running-task invariant.
          tasks: { $not: { $elemMatch: { status: 'running' } } },
          $nor: [{ tasks: { $elemMatch: { status: { $in: ['completed', 'failed'] },
            settlementStatus: { $in: ['pending', 'processing', 'needs_retry'] } } } }]
        },
        { $push: { tasks: task }, $inc: { totalTasks: 1 } },
        { new: true }
      );
      if (!chain) {
        await this.assertNoPendingSettlement(userId);
        throw new Error('当前已有任务正在进行中，请先完成或明确放弃当前任务');
      }
      taskPersisted = true;
      await this.assertNoPendingSettlement(userId);
      await this.assertNoMainViolation(userId);
      if (reservationStartToken) await this.assertReservationStart(userId, reservationId, reservationStartToken);

      const updatedUser = await User.findOneAndUpdate({ userId, 'stats.startedTaskIds': { $ne: task.taskId } }, {
        $inc: { 'stats.totalTasks': 1, __v: 1 }, $addToSet: { 'stats.startedTaskIds': task.taskId }
      }, { new: true });
      if (!updatedUser) throw new Error('用户不存在');

      await this.scheduleProgressReminders(userId, task.taskId, duration);
      await this.updateDailyStats(userId, task, false);
      const ready = await TaskChain.findOneAndUpdate({ _id: chain._id, status: 'active', tasks: {
        $elemMatch: { taskId: task.taskId, status: 'running', creationState: 'initializing' }
      } }, { $set: { 'tasks.$.creationState': 'ready' }, $inc: { __v: 1 } }, { new: true });
      if (!ready) throw new Error('任务初始化状态已变化，请稍后查看状态');
      task.creationState = 'ready';

      logger.info(`任务创建成功: ${task.taskId} for user ${userId}, duration: ${duration}min`);

      return { chain: ready, task, user: updatedUser || user };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (taskPersisted && createdTaskId) {
        try {
          await this.rollbackTaskCreation(userId, createdTaskId);
        } catch (rollbackError) {
          logger.error('任务创建失败后的补偿清理失败', {
            userId,
            taskId: createdTaskId,
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
          });
        }
      }
      logger.error(`创建任务失败: ${message}`, { userId, description, duration });
      throw new Error(`创建任务失败: ${message}`);
    } finally {
      if (createdTaskId) TaskService.activeCreations.delete(createdTaskId);
    }
  }

  /** True means removed/already absent; false leaves an active or unproven creation untouched. */
  async recoverAbandonedCreation(userId: number, taskId: string): Promise<boolean> {
    if (TaskService.activeCreations.has(taskId)) return false;
    const existing = await TaskChain.findOne({ userId, 'tasks.taskId': taskId });
    const task = existing?.tasks.find(entry => entry.taskId === taskId);
    if (!task) return true;
    const unboundBrokenStart = existing?.status === 'broken' && task.creationState === 'ready' && task.mainChainId;
    if (task.creationState !== 'initializing' && task.creationState !== 'rolling_back' && !unboundBrokenStart) {
      return false;
    }
    await this.rollbackTaskCreation(userId, taskId);
    const remaining = await TaskChain.exists({ userId, 'tasks.taskId': taskId });
    if (remaining) logger.error('任务初始化补偿未移除记录，需要审计', { userId, taskId });
    return !remaining;
  }

  async recoverCreationRollbacks(): Promise<void> {
    const cutoff = new Date(Date.now() - 5 * 60000);
    const cursor = TaskChain.find({ $or: [
      { tasks: { $elemMatch: { status: 'running', $or: [
        { creationState: 'rolling_back' }, { creationState: 'initializing', startTime: { $lte: cutoff } }
      ] } } },
      { status: 'broken', tasks: { $elemMatch: {
        status: 'running', creationState: 'ready', mainChainId: { $exists: true }
      } } }
    ] }).cursor();
    let failures = 0;
    for await (const chain of cursor) {
      for (const task of chain.tasks) {
        if (task.status !== 'running' || !(
          task.creationState === 'rolling_back' ||
          task.creationState === 'initializing' && task.startTime <= cutoff ||
          chain.status === 'broken' && task.creationState === 'ready' && task.mainChainId
        )) continue;
        try {
          await this.recoverAbandonedCreation(chain.userId, task.taskId);
        } catch (error) {
          failures += 1;
          logger.error('任务启动补偿恢复失败', { userId: chain.userId, taskId: task.taskId,
            error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    if (failures) throw new Error(`${failures} 个任务启动补偿失败，将由恢复队列重试`);
  }

  isTaskCreationActive(taskId: string): boolean {
    return TaskService.activeCreations.has(taskId);
  }

  async recoverPendingRewards(
    userId?: number, onPaid?: Parameters<FocusRewardService['recover']>[1]
  ): Promise<void> {
    return new FocusRewardService(this.cultivationService).recover(userId, onPaid);
  }

  private async assertReservationStart(
    userId: number, reservationId: string | null, startToken: string
  ): Promise<void> {
    const valid = await AuxChain.exists({
      userId, status: 'active', pendingDecision: { $exists: false },
      'pendingReservation.reservationId': reservationId,
      'pendingReservation.status': 'starting', 'pendingReservation.startToken': startToken,
      'pendingReservation.startLeaseUntil': { $gt: new Date() }
    });
    if (!valid) throw new Error('预约启动凭证已过期或已变化，请查看预约状态');
  }

  async recoverCoreResults(userId?: number): Promise<void> {
    let failures = 0;
    const cursor = TaskChain.find({ ...(userId === undefined ? {} : { userId }), tasks: { $elemMatch: {
      coreProtocolVersion: 1, status: { $in: ['completed', 'failed'] },
      settlementStatus: { $in: ['pending', 'processing', 'needs_retry'] }
    } } }).cursor();
    for await (const chain of cursor) {
      if (await MainChain.exists({
        userId: chain.userId, status: 'active', pendingViolation: { $exists: true }
      })) continue;
      for (const task of chain.tasks) {
        if (task.coreProtocolVersion !== 1 || task.status !== 'completed' && task.status !== 'failed' ||
            task.settlementStatus === 'settled' || task.settlementStatus === 'processing' &&
            task.settlementLeaseUntil && task.settlementLeaseUntil > new Date()) continue;
        try {
          await this.completeTask(chain.userId, task.taskId, task.status === 'completed');
        } catch (error) {
          failures += 1;
          logger.error('核心任务结果恢复失败，保留原确认', { userId: chain.userId, taskId: task.taskId,
            error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    if (failures) throw new Error(`${failures} 个核心任务结果等待恢复`);
  }

  private async assertNoMainViolation(userId: number): Promise<void> {
    if (await MainChain.exists({ userId, status: 'active', pendingViolation: { $exists: true } })) {
      throw new Error('请先处理主链判例，使用 /violation 查看当前决定');
    }
  }

  private async assertNoPendingSettlement(userId: number): Promise<void> {
    if (await TaskChain.exists({ userId, tasks: { $elemMatch: { status: { $in: ['completed', 'failed'] },
      settlementStatus: { $in: ['pending', 'processing', 'needs_retry'] } } } })) {
      throw new Error('上次任务结果正在保存，请用 /status 重试保存原结果后再启动下一项');
    }
  }

  /** Remove a partially-created running task after a downstream startup step fails. */
  async rollbackTaskCreation(userId: number, taskId: string): Promise<void> {
    return withTaskCreationLock(taskId, () => this.performCreationRollback(userId, taskId));
  }

  private async performCreationRollback(userId: number, taskId: string): Promise<void> {
    const existing = await TaskChain.findOne({ userId, status: { $in: ['active', 'broken'] }, tasks: {
      $elemMatch: { taskId, status: 'running', creationState: { $in: ['initializing', 'ready', 'rolling_back'] } }
    } });
    if (!existing) return;
    if (await MainChain.exists({ userId, 'nodes.taskId': taskId })) {
      throw new Error('任务已绑定主链节点，不能按启动失败回滚，需要审计');
    }
    const intendedMain = existing.tasks.find(entry => entry.taskId === taskId)?.mainChainId;
    if (intendedMain) {
      // A cancelled save may still reach MongoDB later. Fence its original main-chain version.
      const fenced = await MainChain.findOneAndUpdate({ userId, chainId: intendedMain,
        nodes: { $not: { $elemMatch: { taskId } } }
      }, { $inc: { __v: 1 } }, { new: true });
      if (!fenced) throw new Error('主链启动记录已变化，不能自动回滚，需要审计');
    }
    const claimed = await TaskChain.findOneAndUpdate({
      _id: existing._id, status: { $in: ['active', 'broken'] }, tasks: {
      $elemMatch: { taskId, status: 'running', creationState: { $in: ['initializing', 'ready', 'rolling_back'] } }
    } }, { $set: { 'tasks.$.creationState': 'rolling_back' }, $inc: { __v: 1 } }, { new: true });
    if (!claimed) return;
    const task = claimed.tasks.find(entry => entry.taskId === taskId)!;
    await this.cancelTaskReminders(taskId).catch((error) => {
      logger.warn('回滚任务时取消提醒失败，将继续清理任务记录', {
        userId, taskId, error: error instanceof Error ? error.message : String(error)
      });
    });
    // Undo the receipt before deleting the task so interrupted cleanup can be
    // replayed without decrementing the user's count twice.
    await User.updateOne({ userId, 'stats.startedTaskIds': taskId }, {
      $inc: { 'stats.totalTasks': -1, __v: 1 }, $pull: { 'stats.startedTaskIds': taskId }
    });
    // Keep the durable marker until statistics are repaired; retry never undoes the receipt twice.
    await this.updateDailyStats(userId, task, false);
    const filter = { _id: claimed._id, tasks: {
      $elemMatch: { taskId, status: 'running', creationState: 'rolling_back' }
    } };
    const pull = { tasks: { taskId, status: 'running', creationState: 'rolling_back' } };
    const removed = await TaskChain.findOneAndUpdate({ ...filter, status: 'active' }, {
      $pull: pull, $inc: { totalTasks: -1, __v: 1 }
    }, { new: true });
    if (!removed) await TaskChain.updateOne({ ...filter, status: 'broken' }, { $pull: pull, $inc: { __v: 1 } });
  }

  async completeTask(
    userId: number,
    taskId: string,
    success = true,
    failureReason: string | null = null
  ): Promise<CompleteTaskResult> {
    return this.prepareAndSettleTask(userId, taskId, success, failureReason);
  }

  async finishConfirmedTaskBeforeBreak(
    userId: number, taskId: string, decisionToken: string, processingToken: string
  ): Promise<CompleteTaskResult> {
    return this.prepareAndSettleTask(userId, taskId, true, null, { decisionToken, processingToken });
  }

  private async prepareAndSettleTask(
    userId: number, taskId: string, success: boolean, failureReason: string | null,
    breaking?: { decisionToken: string; processingToken: string }
  ): Promise<CompleteTaskResult> {
    try {
      const prepared = await withUserProtocolLock(userId, async () => {
        if (breaking) {
          if (!await MainChain.exists({ userId, status: 'active',
            'pendingViolation.decision': 'break_chain', 'pendingViolation.decisionToken': breaking.decisionToken,
            'pendingViolation.processingToken': breaking.processingToken, 'pendingViolation.taskIds': taskId })) {
            throw new Error('断链判例认领已变化，请用 /violation 查看原决定');
          }
        } else if (success) await this.assertNoMainViolation(userId);
        const checkChain = await TaskChain.findOne({
          userId,
          $or: [
            { status: 'active', tasks: { $elemMatch: { taskId, status: 'running' } } },
            {
              tasks: {
                $elemMatch: {
                  taskId,
                  $or: [
                    { status: { $in: ['completed', 'failed'] }, settlementStatus: 'pending' },
                    { status: { $in: ['completed', 'failed'] }, settlementStatus: 'needs_retry' },
                    {
                      status: { $in: ['completed', 'failed'] },
                      settlementStatus: 'processing',
                      settlementLeaseUntil: { $lte: new Date() }
                    }
                  ]
                }
              }
            }
          ]
        });

        if (!checkChain) {
          const processing = await TaskChain.exists({ userId, tasks: { $elemMatch: {
            taskId, settlementStatus: 'processing', settlementLeaseUntil: { $gt: new Date() }
          } } });
          if (processing) throw new Error('任务结算正在处理中，请稍后重试');
          throw new Error('任务不存在、已完成或未在运行状态');
        }

        const checkTask = checkChain.tasks.find((entry) => entry.taskId === taskId);
        if (!checkTask) {
          throw new Error('指定的任务不存在');
        }
        if (checkTask.creationState === 'initializing' || checkTask.creationState === 'rolling_back') {
          throw new Error('任务正在启动或清理，请稍后使用 /status 查看进展');
        }

        const isRetry = checkTask.status !== 'running';
        if (breaking && checkTask.status !== 'completed') {
          throw new Error('原任务尚未确认完成，不能绕过判例结算');
        }
        if (!isRetry && checkTask.mainChainId && !await MainChain.exists({ userId, chainId: checkTask.mainChainId,
          'nodes.taskId': taskId })) {
          throw new Error('主链启动记录正在恢复，请稍后使用 /status 查看进展');
        }
        const expectedStatus = success ? 'completed' : 'failed';
        if (isRetry && checkTask.status !== expectedStatus) {
          throw new Error('任务结算结果与原确认不一致，无法重试');
        }

        const confirmedAt = new Date();
        const elapsedDuration = Math.max(0, Math.floor(
          (confirmedAt.getTime() - checkTask.startTime.getTime()) / 60000
        ));
        const actualDuration = isRetry && checkTask.actualDuration !== undefined
          ? checkTask.actualDuration : Math.min(elapsedDuration, checkTask.duration);
        const endTime = isRetry && checkTask.endTime ? checkTask.endTime
          : success ? new Date(checkTask.startTime.getTime() + checkTask.duration * 60000) : confirmedAt;

        if (!isRetry && success && actualDuration < checkTask.duration) {
          const remaining = checkTask.duration - actualDuration;
          throw new Error(
            `自控力检查：任务时长 ${checkTask.duration} 分钟，实际仅过 ${actualDuration} 分钟。还差 ${remaining} 分钟，请继续专注！`
          );
        }

        const newStatus = success ? 'completed' : 'failed';
        let chain = checkChain;
        if (!isRetry) {
          const transitioned = await TaskChain.findOneAndUpdate(
            {
              _id: checkChain._id,
              userId,
              status: 'active',
              tasks: { $elemMatch: {
                taskId, status: 'running', creationState: { $nin: ['initializing', 'rolling_back'] }
              } }
            },
            {
              $set: {
                'tasks.$.status': newStatus,
                'tasks.$.endTime': endTime,
                'tasks.$.confirmedAt': confirmedAt,
                'tasks.$.elapsedDuration': elapsedDuration,
                'tasks.$.actualDuration': actualDuration,
                'tasks.$.settlementStatus': 'pending',
                'tasks.$.coreProtocolVersion': 1,
                ...(success ? { 'tasks.$.rewardProtocolVersion': 1, 'tasks.$.rewardStatus': 'pending' } : {})
              },
              $unset: { 'tasks.$.settlementError': 1, 'tasks.$.settlementLeaseUntil': 1 },
              $inc: { __v: 1 }
            },
            { new: true }
          );
          if (!transitioned) throw new Error('任务不存在、已完成或未在运行状态');
          chain = transitioned;
        }

        const task = chain.tasks.find((entry) => entry.taskId === taskId);
        if (!task) {
          throw new Error('指定的任务不存在');
        }

        const user = await User.findOne({ userId });
        if (!user) {
          throw new Error('用户不存在');
        }

        return { chain, user, task, actualDuration, endTime };
      });

      return await this.settleTask({
        userId,
        taskId,
        success,
        failureReason,
        ...prepared
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`完成任务失败: ${message}`, { userId, taskId, success });
      throw new Error(`完成任务失败: ${message}`);
    }
  }

  private async settleTask(input: {
    userId: number;
    taskId: string;
    success: boolean;
    failureReason: string | null;
    chain: import('../types/models.js').TaskChainDocument;
    user: import('../types/models.js').UserDocument;
    task: ITask;
    actualDuration: number;
    endTime: Date;
  }): Promise<CompleteTaskResult> {
    const { userId, taskId, success, failureReason, actualDuration, endTime } = input;
    const expectedStatus = success ? 'completed' : 'failed';
    const settlementToken = randomUUID();
    const claimed = await TaskChain.findOneAndUpdate(
      {
        userId,
        tasks: {
          $elemMatch: {
            taskId,
            status: expectedStatus,
            $or: [
              { settlementStatus: { $in: ['pending', 'needs_retry'] } },
              { settlementStatus: 'processing', settlementLeaseUntil: { $lte: new Date() } }
            ]
          }
        }
      },
      {
        $set: {
          'tasks.$.settlementStatus': 'processing',
          'tasks.$.settlementToken': settlementToken,
          'tasks.$.settlementLeaseUntil': new Date(Date.now() + 60000)
        },
        $unset: { 'tasks.$.settlementError': 1 },
        $inc: { __v: 1 }
      },
      { new: true }
    );

    if (!claimed) {
      const existing = await TaskChain.findOne({ userId, 'tasks.taskId': taskId });
      const existingTask = existing?.tasks.find((entry) => entry.taskId === taskId);
      if (existingTask?.settlementStatus === 'settled') {
        throw new Error('任务不存在、已完成或未在运行状态');
      }
      throw new Error('任务结算正在处理中，请稍后重试');
    }

    let chain = claimed;
    let task = chain.tasks.find((entry) => entry.taskId === taskId)!;
    const cultivationReward = (task.rewardSnapshot as CultivationReward | undefined) ?? null;
    const owned = { _id: claimed._id, userId, tasks: { $elemMatch: {
      taskId, status: expectedStatus, settlementStatus: 'processing', settlementToken
    } } };
    const writeStage = async (update: Record<string, unknown>) => {
      const updated = await TaskChain.findOneAndUpdate(owned, update, { new: true });
      if (!updated) throw new Error('任务结算认领已变化，请用 /status 查看当前结果');
      return updated;
    };
    const assertOwner = async () => {
      if (!await TaskChain.exists(owned)) throw new Error('任务结算认领已变化，请用 /status 查看当前结果');
    };

    try {
      if (!task.chainStatsApplied) {
        await assertOwner();
        if (success) {
          if (chain.status === 'active') {
            chain.completedTasks += 1;
            chain.totalMinutes += actualDuration;
            chain.lastTaskCompletedAt = endTime;
          }
        } else {
          chain.failedTasks += 1;
          chain.breakChain(failureReason || '任务未能完成', taskId);
        }
        task.chainStatsApplied = true;
        await chain.save();
      }

      if (!task.userStatsApplied) {
        await assertOwner();
        const extendsCurrentChain = chain.status === 'active';
        const userUpdate = success
          ? [{ $set: {
              'stats.completedTasks': { $add: [{ $ifNull: ['$stats.completedTasks', 0] }, 1] },
              'stats.totalMinutes': { $add: [{ $ifNull: ['$stats.totalMinutes', 0] }, actualDuration] },
              'stats.currentStreak': extendsCurrentChain
                ? { $add: [{ $ifNull: ['$stats.currentStreak', 0] }, 1] }
                : { $ifNull: ['$stats.currentStreak', 0] },
              'stats.longestStreak': { $max: [
                { $ifNull: ['$stats.longestStreak', 0] },
                extendsCurrentChain ? { $add: [{ $ifNull: ['$stats.currentStreak', 0] }, 1] }
                  : { $ifNull: ['$stats.longestStreak', 0] }
              ] },
              'stats.lastTaskDate': endTime,
              'stats.settledTaskIds': { $concatArrays: [
                { $ifNull: ['$stats.settledTaskIds', []] }, { $literal: [taskId] }
              ] },
              __v: { $add: [{ $ifNull: ['$__v', 0] }, 1] },
              ...(task.rewardProtocolVersion === 1 && !task.rewardApplied ? {
                pendingFocusRewards: { $concatArrays: [{ $ifNull: ['$pendingFocusRewards', []] }, [{
                  taskId: { $literal: taskId }, duration: actualDuration,
                  confirmedAt: task.confirmedAt ?? endTime,
                  legacyCurrentStreakBefore: { $ifNull: ['$stats.currentStreak', 0] }
                }]] }
              } : {})
            } }]
          : {
              $inc: { 'stats.failedTasks': 1, __v: 1 },
              $set: { 'stats.currentStreak': 0 },
              $addToSet: { 'stats.settledTaskIds': taskId }
            };
        await User.updateOne({ userId, 'stats.settledTaskIds': { $ne: taskId } }, userUpdate);
        chain = await writeStage({ $set: { 'tasks.$.userStatsApplied': true } });
        task = chain.tasks.find((entry) => entry.taskId === taskId)!;
      }

      if (!task.dailyStatsApplied) {
        await assertOwner();
        await this.updateDailyStats(userId, task, success);
        chain = await writeStage({ $set: { 'tasks.$.dailyStatsApplied': true } });
        task = chain.tasks.find((entry) => entry.taskId === taskId)!;
      }

      await this.cancelTaskReminders(taskId);
      chain = await writeStage({ $set: { 'tasks.$.settlementStatus': 'settled' },
        $unset: { 'tasks.$.settlementError': 1, 'tasks.$.settlementLeaseUntil': 1, 'tasks.$.settlementToken': 1 }
      });
      task = chain.tasks.find((entry) => entry.taskId === taskId)!;
      const refreshedUser = await User.findOne({ userId });
      return {
        chain,
        task,
        user: refreshedUser ?? input.user,
        wasChainBroken: !success,
        cultivationReward: success ? cultivationReward : null,
        rewardPending: success && task.rewardProtocolVersion === 1 && !task.rewardApplied
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await TaskChain.updateOne(
        owned,
        {
          $set: { 'tasks.$.settlementStatus': 'needs_retry', 'tasks.$.settlementError': message },
          $unset: { 'tasks.$.settlementLeaseUntil': 1, 'tasks.$.settlementToken': 1 }
        }
      );
      throw error;
    }
  }

  async getUserStatus(userId: number, options: GetUserStatusOptions = {}): Promise<UserStatusResult> {
    try {
      const { includeTodayStats = true } = options;
      const [user, activeChain, todayStats, pendingChains] = await Promise.all([
        User.findOne({ userId }),
        TaskChain.findOne({ userId, status: 'active' }),
        includeTodayStats ? this.getDailyStats(userId, new Date()) : Promise.resolve(undefined),
        TaskChain.find({ userId, tasks: { $elemMatch: { status: { $in: ['completed', 'failed'] },
          settlementStatus: { $in: ['pending', 'processing', 'needs_retry'] } } } }).sort({ updatedAt: -1 })
      ]);

      const pendingTasks = pendingChains.flatMap(chain => chain.tasks.filter(task =>
        (task.status === 'completed' || task.status === 'failed') &&
        ['pending', 'processing', 'needs_retry'].includes(task.settlementStatus ?? '')
      ));
      const currentTask = activeChain?.currentTask ?? pendingTasks[0];

      return {
        user,
        activeChain,
        currentTask,
        pendingSettlementCount: pendingTasks.length,
        pendingRewardCount: user?.pendingFocusRewards?.length ?? 0,
        todayStats,
        isActive: currentTask?.status === 'running',
        stats: user?.stats || {}
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`获取用户状态失败: ${message}`, { userId });
      throw new Error(`获取用户状态失败: ${message}`);
    }
  }

  async scheduleProgressReminders(userId: number, taskId: string, duration: number): Promise<void> {
    const user = await User.findOne({ userId });
    const progressIntervals =
      user?.settings.reminderEnabled && user.preferences.progressReminders ? [0.25, 0.5, 0.75] : [];

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

  async updateDailyStats(userId: number, task: ITask, _success: boolean): Promise<DailyStatsDocument> {
    const user = await User.findOne({ userId });
    const requested = user?.settings.timezone ?? 'UTC';
    const timezone = moment.tz.zone(requested) ? requested : 'UTC';
    const dayAt = (date: Date) => moment(date).tz(timezone).startOf('day').toDate();
    const days = [dayAt(task.startTime)];
    const end = dayAt(task.endTime ?? task.startTime);
    if (end.getTime() !== days[0]!.getTime()) days.push(end);
    const claims: Array<{ day: Date; token: string }> = [];
    // Mark every affected day before reading; a failure on day one must not strand day two.
    for (const day of days) {
      claims.push({ day, token: await this.claimDailySnapshot(userId, day, timezone, task.endTime ?? task.startTime) });
    }
    let persisted: DailyStatsDocument | null = null;
    // A capped task can cross midnight. Persist both affected days; otherwise
    // the report is correct but the daily snapshot only contains its last part.
    for (const { day, token } of claims) {
      persisted = await this.refreshDailySnapshot(userId, day, timezone, token);
    }
    return persisted!;
  }

  private async claimDailySnapshot(
    userId: number, date: Date, timezone: string, lastTaskAt?: Date
  ): Promise<string> {
    const token = randomUUID();
    const claim = { $set: {
      'metadata.refreshToken': token, 'metadata.refreshPending': true, 'metadata.refreshTimezone': timezone
    }, ...(lastTaskAt ? { $max: { 'metadata.lastTaskAt': lastTaskAt } } : {}) };
    try {
      await DailyStats.findOneAndUpdate({ userId, date }, claim, { upsert: true, new: true });
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
      await DailyStats.updateOne({ userId, date }, claim);
    }
    return token;
  }

  private async refreshDailySnapshot(
    userId: number, date: Date, timezone: string, token?: string
  ): Promise<DailyStatsDocument> {
    token ??= await this.claimDailySnapshot(userId, date, timezone);
    const snapshot = await this.getDailyStats(userId, date, timezone);
    if (snapshot.date.getTime() !== date.getTime()) throw new Error('统计时区已变化，需要重新刷新对应日期');
    const saved = await DailyStats.findOneAndUpdate({ userId, date, 'metadata.refreshToken': token }, {
      $set: { stats: snapshot.stats, 'metadata.refreshPending': false },
      $unset: { 'metadata.refreshToken': 1 }
    }, { new: true });
    if (saved) return saved;
    const newer = await DailyStats.findOne({ userId, date });
    if (!newer) throw new Error('更新每日统计失败');
    return newer;
  }

  async recoverDailySnapshots(): Promise<void> {
    let failures = 0;
    for await (const daily of DailyStats.find({ 'metadata.refreshPending': true }).cursor()) {
      try {
        await this.refreshDailySnapshot(daily.userId, daily.date, daily.metadata.refreshTimezone ?? 'UTC');
      } catch (error) {
        failures += 1;
        logger.error('每日统计快照恢复失败', { userId: daily.userId, date: daily.date,
          error: error instanceof Error ? error.message : String(error) });
      }
    }
    if (failures) throw new Error(`${failures} 个每日统计快照恢复失败，将稍后重试`);
  }

  async getDailyStats(userId: number, date = new Date(), snapshotTimezone?: string): Promise<DailyStatsDocument> {
    const report = await new StatsService().build(userId, 1, date, snapshotTimezone);
    const day = report.days[0]!;
    return new DailyStats({
      userId,
      date: report.start,
      stats: {
        tasksStarted: day.started,
        tasksCompleted: day.completed,
        tasksFailed: day.failed,
        tasksCancelled: day.cancelled,
        totalMinutes: day.minutes,
        successRate: report.summary.successRate,
        averageTaskDuration: day.completed ? Math.round((day.completedMinutes / day.completed) * 10) / 10 : 0
      }
    });
  }
}

export default TaskService;
