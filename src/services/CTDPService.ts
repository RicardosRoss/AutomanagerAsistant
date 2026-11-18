import { AuxChain, MainChain, TaskChain, User } from '../models/index.js';
import config from '../../config/index.js';
import { generateId } from '../utils/index.js';
import logger from '../utils/logger.js';
import { DEFAULT_TASK_DURATION_MINUTES } from '../types/taskDefaults.js';
import AuxiliaryRulesService from './AuxiliaryRulesService.js';
import type { ViolationOption } from './PrecedentService.js';
import type { AuxChainDocument, ITask, MainChainDocument, NodeLevel } from '../types/models.js';
import type {
  CompleteMainTaskResult,
  CompleteTaskResult,
  FailMainTaskResult,
  StartMainTaskInput,
  StartMainTaskResult
} from '../types/services.js';
import { randomUUID } from 'node:crypto';
import { withTaskCreationLock } from '../utils/taskCreationLock.js';

/**
 * Minimal interface for the TaskService dependency.
 * CTDPService orchestrates calls to TaskService without inheriting from it.
 */
interface TaskServiceDependency {
  createTask(
    userId: number,
    description?: string,
    duration?: number,
    isReserved?: boolean,
    reservationId?: string | null,
    submissionToken?: string,
    reservationStartToken?: string,
    mainChainId?: string
  ): Promise<{ chain: unknown; task: ITask; user: unknown }>;
  rollbackTaskCreation(userId: number, taskId: string): Promise<void>;
  recoverAbandonedCreation(userId: number, taskId: string): Promise<boolean>;
  isTaskCreationActive(taskId: string): boolean;
  completeTask(
    userId: number,
    taskId: string,
    success?: boolean,
    failureReason?: string | null
  ): Promise<CompleteTaskResult>;
}

/**
 * Minimal interface for the QueueService dependency used by CTDPService.
 */
interface QueueServiceDependency {
  rescheduleReservation(reservationId: string, delayMs: number): Promise<string | number | undefined>;
  cancelReservation(reservationId: string): Promise<boolean>;
}

export interface StartReservedTaskResult {
  mainChain: MainChainDocument;
  task: ITask;
  auxChain: AuxChainDocument;
  alreadyStarted?: boolean;
}

export interface DelayReservationResult {
  auxChain: AuxChainDocument;
  newJobId: string | number | undefined;
  decisionPending?: boolean;
}

export interface CancelReservationResult {
  auxChain: AuxChainDocument | null;
  queueCancelled: boolean;
  cancelled: boolean;
  decisionPending?: boolean;
}

class CTDPService {
  private taskService: TaskServiceDependency;
  private queueService: QueueServiceDependency | null;

  constructor(taskService: TaskServiceDependency, queueService?: QueueServiceDependency) {
    this.taskService = taskService;
    this.queueService = queueService ?? null;
  }

  /**
   * Create a main chain task (node #N in the main chain).
   * 1. Find or create an active MainChain for the user
   * 2. Create the underlying task via TaskService
   * 3. Append a running node to the MainChain
   */
  async startMainTask(userId: number, input: StartMainTaskInput): Promise<StartMainTaskResult> {
    try {
      if (await MainChain.exists({ userId, status: 'active', pendingViolation: { $exists: true } })) {
        throw new Error('请先处理主链判例，使用 /violation 查看当前决定');
      }
      await this.recoverConfirmedNodes(userId);
      if (input.submissionToken) {
        const existingChain = await TaskChain.findOne({ userId, 'tasks.submissionToken': input.submissionToken });
        const existingTask = existingChain?.tasks.find((entry) => entry.submissionToken === input.submissionToken);
        if (existingChain && existingTask) {
          if (existingTask.creationState === 'initializing' || existingTask.creationState === 'rolling_back') {
            throw new Error('任务正在初始化或清理，请稍后查看状态');
          }
          if (existingTask.status !== 'running') throw new Error('这次提交的任务已结束，请重新准备新任务');
          const existingMainChain = await MainChain.findOne({
            userId,
            nodes: { $elemMatch: { taskId: existingTask.taskId } }
          });
          if (existingMainChain) return { mainChain: existingMainChain, task: existingTask };
        }
      }
      if (!input.isReserved) {
        const reservation = await AuxChain.findOne({ userId, status: 'active', pendingReservation: { $exists: true } });
        if (reservation?.pendingDecision) throw new Error('请先处理辅助链判例');
        if (reservation?.pendingReservation?.reservationId) {
          return this.startReservedTask(
            userId,
            reservation.pendingReservation.reservationId,
            input.description,
            input.duration,
            input.submissionToken
          );
        }
      }
      // 1. Find or create active MainChain
      const mainChain = await MainChain.findOrCreateActive(userId, input.markerLabel);

      // 2. Create the underlying task via TaskService
      const createResult = await this.taskService.createTask(
        userId,
        input.description,
        input.duration,
        input.isReserved ?? false,
        input.reservationId ?? null,
        input.submissionToken,
        input.reservationStartToken,
        mainChain.chainId
      );

      const task = createResult.task;

      let saved: MainChainDocument;
      try {
        saved = await this.publishMainNode(userId, task, mainChain.chainId);
      } catch (error) {
        // A write error can also mean its response was lost. Read the durable
        // node before compensating, so a successful write keeps its task.
        const persisted = await MainChain.findOne({
          _id: mainChain._id,
          nodes: { $elemMatch: { taskId: task.taskId, status: 'running' } }
        });
        if (persisted) {
          saved = persisted;
        } else {
          await this.taskService.rollbackTaskCreation(userId, task.taskId);
          throw error;
        }
      }

      const published = saved.nodes.find(node => node.taskId === task.taskId)!;
      const nodeNo = published.nodeNo;
      const level = published.level;

      logger.info(`CTDP startMainTask: node #${nodeNo} (${level}) for user ${userId}`, {
        userId,
        chainId: saved.chainId,
        taskId: task.taskId,
        nodeNo,
        level
      });

      return { mainChain: saved, task };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`CTDP startMainTask failed: ${message}`, { userId, input });
      throw new Error(`CTDP startMainTask 失败: ${message}`);
    }
  }

  private async publishMainNode(userId: number, task: ITask, chainId: string): Promise<MainChainDocument> {
    return withTaskCreationLock(task.taskId, async () => {
      const current = await MainChain.findOne({ userId, chainId, status: 'active' });
      if (!current) throw new Error('原主链已结束，不能把任务接入其他链');
      if (current.nodes.some(node => node.taskId === task.taskId)) return current;
      if (current.pendingViolation) throw new Error('请先处理主链判例，使用 /violation 查看当前决定');
      const stored = await TaskChain.findOne({ userId, status: 'active', tasks: { $elemMatch: {
        taskId: task.taskId, status: 'running', creationState: { $nin: ['initializing', 'rolling_back'] }
      } } });
      const storedTask = stored?.tasks.find(entry => entry.taskId === task.taskId);
      if (!storedTask || storedTask.mainChainId && storedTask.mainChainId !== chainId) {
        throw new Error('任务启动状态已变化，不能发布主链节点');
      }
      const nodeNo = current.nodes.length + 1;
      current.nodes.push({ nodeNo, level: this.resolveLevel(nodeNo), taskId: task.taskId, status: 'running' });
      return current.save();
    });
  }

  async recoverUnpublishedStarts(): Promise<void> {
    const cutoff = new Date(Date.now() - 5 * 60000);
    const cursor = TaskChain.find({ status: 'active', tasks: { $elemMatch: {
      status: 'running', creationState: 'ready', mainChainId: { $exists: true }, startTime: { $lte: cutoff }
    } } }).cursor();
    let failures = 0;
    for await (const chain of cursor) {
      for (const task of chain.tasks) {
        if (task.status !== 'running' || task.creationState !== 'ready' || !task.mainChainId ||
            task.startTime > cutoff) continue;
        try {
          await this.publishMainNode(chain.userId, task, task.mainChainId);
        } catch (error) {
          let recoveryError = error;
          try {
            const original = await MainChain.findOne({ userId: chain.userId, chainId: task.mainChainId });
            if (original && original.status !== 'active' && !original.nodes.some(node => node.taskId === task.taskId)) {
              await this.taskService.rollbackTaskCreation(chain.userId, task.taskId);
              continue;
            }
          } catch (cleanupError) {
            recoveryError = cleanupError;
          }
          failures += 1;
          logger.error('主链启动节点恢复失败', { userId: chain.userId, taskId: task.taskId,
            error: recoveryError instanceof Error ? recoveryError.message : String(recoveryError) });
        }
      }
    }
    if (failures) throw new Error(`${failures} 个主链启动节点恢复失败，将由恢复队列重试`);
  }

  /**
   * Complete a main chain task successfully.
   * 1. Find the MainChain and node
   * 2. Call TaskService.completeTask with success=true
   * 3. Update node status to 'completed' and increment the correct levelCounter
   */
  async completeMainTask(
    userId: number,
    chainId: string,
    nodeNo: number,
    taskId: string
  ): Promise<CompleteMainTaskResult> {
    try {
      // 1. Find MainChain
      const mainChain = await MainChain.findOne({ userId, chainId });
      if (!mainChain) {
        throw new Error('主链不存在');
      }
      if (mainChain.pendingViolation) throw new Error('请先处理主链判例，使用 /violation 查看当前决定');

      // 2. Find the node
      const node = mainChain.nodes.find((n) => n.nodeNo === nodeNo);
      if (!node) {
        throw new Error(`节点 #${nodeNo} 不存在于主链中`);
      }
      if (node.taskId !== taskId) throw new Error('任务与主链节点不匹配');

      // 3. Complete the underlying task
      let completeResult: CompleteTaskResult;
      try {
        completeResult = await this.taskService.completeTask(userId, taskId, true);
      } catch (error) {
        const recovered = await this.recoverSettledTask(userId, taskId, 'completed');
        if (!recovered) throw error;
        completeResult = recovered;
      }

      // 4. Update node status
      let saved = mainChain;
      if (node.status !== 'completed') {
        node.status = 'completed';
        const counterField = node.level as keyof typeof mainChain.levelCounters;
        mainChain.levelCounters[counterField] += 1;
        saved = await mainChain.save();
      }

      logger.info(`CTDP completeMainTask: node #${nodeNo} completed for user ${userId}`, {
        userId,
        chainId: saved.chainId,
        nodeNo,
        level: node.level,
        counters: saved.levelCounters
      });

      return {
        mainChain: saved,
        task: completeResult.task,
        user: completeResult.user,
        wasChainBroken: completeResult.wasChainBroken,
        cultivationReward: completeResult.cultivationReward,
        rewardPending: completeResult.rewardPending
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`CTDP completeMainTask failed: ${message}`, { userId, chainId, nodeNo, taskId });
      if (error instanceof Error && error.name === 'VersionError') {
        const current = await MainChain.findOne({ userId, chainId });
        if (current?.pendingViolation) throw new Error('请先处理主链判例，使用 /violation 查看当前决定');
        throw new Error('任务结果已保存，主链状态发生变化，请稍后重试完成确认');
      }
      throw new Error(`CTDP completeMainTask 失败: ${message}`);
    }
  }

  /**
   * Fail a main chain task - the 神圣座位原理 (Sacred Seat Principle).
   * Any task failure resets ALL chain progress:
   * - MainChain status -> 'broken'
   * - All nodes cleared
   * - All levelCounters reset to 0
   */
  async failMainTask(userId: number, chainId: string, nodeNo: number, reason: string): Promise<FailMainTaskResult> {
    try {
      // 1. Find MainChain
      const mainChain = await MainChain.findOne({ userId, chainId });
      if (!mainChain) {
        throw new Error('主链不存在');
      }
      if (mainChain.pendingViolation) throw new Error('请先处理主链判例，使用 /violation 查看当前决定');

      // 2. Find the node to get its taskId
      const node = mainChain.nodes.find((n) => n.nodeNo === nodeNo);
      if (!node) {
        throw new Error(`节点 #${nodeNo} 不存在于主链中`);
      }

      // 3. Fail the underlying task via TaskService
      let failResult: CompleteTaskResult;
      try {
        failResult = await this.taskService.completeTask(userId, node.taskId, false, reason);
      } catch (error) {
        const recovered = await this.recoverSettledTask(userId, node.taskId, 'failed');
        if (!recovered) throw error;
        failResult = recovered;
      }

      // 4. Apply 神圣座位原理: reset everything
      mainChain.status = 'broken';
      mainChain.nodes = [];
      mainChain.levelCounters = { unit: 0, group: 0, cluster: 0 };

      const saved = await mainChain.save();

      logger.warn(`CTDP failMainTask: 神圣座位原理触发 - 主链重置 for user ${userId}, reason: ${reason}`, {
        userId,
        chainId: saved.chainId,
        failedNodeNo: nodeNo,
        reason
      });

      return {
        mainChain: saved,
        task: failResult.task,
        user: failResult.user,
        wasChainBroken: failResult.wasChainBroken
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`CTDP failMainTask failed: ${message}`, { userId, chainId, nodeNo, reason });
      throw new Error(`CTDP failMainTask 失败: ${message}`);
    }
  }

  /**
   * Start a task that was previously reserved (reservation fulfillment).
   * 1. Find the AuxChain with the pending reservation
   * 2. Call startMainTask to create a reserved task on the main chain
   * 3. Move the reservation from pending to fulfilled in AuxChain history
   */
  async startReservedTask(
    userId: number,
    reservationId: string,
    description?: string,
    duration?: number,
    submissionToken?: string
  ): Promise<StartReservedTaskResult> {
    const now = new Date();
    const startToken = randomUUID();
    const claimed = await AuxChain.findOneAndUpdate({
      userId,
      status: 'active',
      'pendingReservation.reservationId': reservationId,
      'pendingReservation.status': 'pending',
      pendingDecision: { $exists: false },
      $or: [
        { 'pendingReservation.deadlineAt': { $gte: now } },
        { 'pendingReservation.deadlineAt': { $exists: false } }
      ]
    }, { $set: {
      'pendingReservation.status': 'starting',
      'pendingReservation.startToken': startToken,
      'pendingReservation.startClaimedAt': now,
      'pendingReservation.startLeaseUntil': new Date(now.getTime() + 5 * 60000)
    } }, { new: true });
    if (!claimed?.pendingReservation) {
      const owned = await AuxChain.findOne({
        userId, status: 'active', 'pendingReservation.reservationId': reservationId
      });
      if (!owned?.pendingReservation) {
        const receipt = await AuxChain.findOne({
          userId, reservationHistory: { $elemMatch: { reservationId, status: 'fulfilled' } }
        });
        const taskChain = receipt ? await TaskChain.findOne({
          userId, tasks: { $elemMatch: { reservationId, status: 'running' } }
        }) : null;
        const task = taskChain?.tasks.find(
          (entry) => entry.reservationId === reservationId && entry.status === 'running'
        );
        const mainChain = task ? await MainChain.findOne({
          userId, status: 'active', nodes: { $elemMatch: { taskId: task.taskId, status: 'running' } }
        }) : null;
        if (receipt && task && mainChain) return { mainChain, task, auxChain: receipt, alreadyStarted: true };
        throw new Error('预约不存在或已处理，请用 /status 或 /reserve_status 查看当前状态');
      }
      if (owned.pendingReservation.status === 'starting') throw new Error('预约正在启动，请用 /status 查看进展');
      if (owned.pendingDecision) throw new Error('请先处理预约判例，使用 /reserve_status 查看当前决定');
      const deadline = owned.pendingReservation.deadlineAt;
      if (deadline && deadline.getTime() < Date.now()) {
        await this.expireReservation(reservationId);
        throw new Error('请先处理预约判例，已错过原启动期限；使用 /reserve_status 查看');
      }
      throw new Error('预约状态已变化，请用 /reserve_status 查看当前状态');
    }
    const reservation = claimed.pendingReservation;
    try {
      const started = await this.startMainTask(userId, {
        markerLabel: '预约兑现',
        description: description ?? reservation.signal ?? '预约任务',
        duration: duration ?? reservation.duration ?? DEFAULT_TASK_DURATION_MINUTES,
        isReserved: true, reservationId,
        submissionToken: submissionToken ?? `reservation:${reservationId}`,
        reservationStartToken: startToken
      });
      const auxChain = await this.fulfillClaimedReservation(claimed, startToken);
      return { mainChain: started.mainChain, task: started.task, auxChain };
    } catch (error) {
      const taskChain = await TaskChain.findOne({ userId, 'tasks.reservationId': reservationId });
      if (!taskChain) {
        await AuxChain.updateOne({ _id: claimed._id, 'pendingReservation.startToken': startToken }, {
          $set: { 'pendingReservation.status': 'pending' },
          $unset: {
            'pendingReservation.startToken': 1, 'pendingReservation.startClaimedAt': 1,
            'pendingReservation.startLeaseUntil': 1
          }
        });
      }
      throw error;
    }
  }

  private async fulfillClaimedReservation(chain: AuxChainDocument, startToken: string): Promise<AuxChainDocument> {
    const reservation = chain.pendingReservation!;
    const reservationId = reservation.reservationId!;
    const updated = await AuxChain.findOneAndUpdate({
      _id: chain._id, status: 'active',
      'pendingReservation.reservationId': reservationId,
      'pendingReservation.status': 'starting', 'pendingReservation.startToken': startToken,
      pendingDecision: { $exists: false }
    }, {
      $unset: { pendingReservation: 1 },
      $inc: { completedReservations: 1 },
      $push: { reservationHistory: {
        reservationId, signal: reservation.signal, duration: reservation.duration,
        createdAt: reservation.createdAt, fulfilledAt: reservation.startClaimedAt, status: 'fulfilled'
      } }
    }, { new: true }).catch(async (error: unknown) => {
      const persisted = await AuxChain.findById(chain._id);
      if (persisted?.reservationHistory.some(
        (item) => item.reservationId === reservationId && item.status === 'fulfilled'
      )) return persisted;
      throw error;
    });
    if (!updated) {
      const persisted = await AuxChain.findById(chain._id);
      if (persisted?.reservationHistory.some(
        (item) => item.reservationId === reservationId && item.status === 'fulfilled'
      )) {
        return persisted;
      }
      throw new Error('预约启动认领已变化，请稍后查看任务状态');
    }
    try {
      await this.queueService?.cancelReservation(reservationId);
    } catch (error) {
      logger.warn('预约已兑现，旧到期队列清理失败', { reservationId, error: String(error) });
    }
    return updated;
  }

  async recoverReservation(reservationId: string): Promise<boolean> {
    if (await new AuxiliaryRulesService(this.queueService).recoverSelectedDecision(reservationId)) return true;
    const chain = await AuxChain.findOne({ status: 'active', 'pendingReservation.reservationId': reservationId });
    const reservation = chain?.pendingReservation;
    if (!chain || reservation?.status !== 'starting') return false;
    if (!reservation.startToken || !reservation.startClaimedAt || !reservation.startLeaseUntil) {
      logger.warn('启动中的预约缺少恢复凭证，保留记录供审计', { reservationId });
      return true;
    }
    if (reservation.startLeaseUntil && reservation.startLeaseUntil.getTime() > Date.now()) return true;
    const taskChain = await TaskChain.findOne({ userId: chain.userId, 'tasks.reservationId': reservationId });
    const task = taskChain?.tasks.find((item) => item.reservationId === reservationId);
    if (task) {
      if (this.taskService.isTaskCreationActive(task.taskId)) return true;
      if (task.creationState === 'initializing' || task.creationState === 'rolling_back') {
        if (!(await this.taskService.recoverAbandonedCreation(chain.userId, task.taskId))) return true;
        return this.recoverReservation(reservationId);
      }
      const main = await MainChain.findOne({ userId: chain.userId, 'nodes.taskId': task.taskId });
      if (!main && task.status === 'running') {
        await this.startMainTask(chain.userId, {
          markerLabel: '预约恢复', description: task.description, duration: task.duration,
          isReserved: true, reservationId, submissionToken: task.submissionToken
        });
      }
      await this.fulfillClaimedReservation(chain, reservation.startToken!);
      return true;
    }
    await AuxChain.updateOne({ _id: chain._id, 'pendingReservation.startToken': reservation.startToken }, {
      $set: { 'pendingReservation.status': 'pending' },
      $unset: {
        'pendingReservation.startToken': 1, 'pendingReservation.startClaimedAt': 1,
        'pendingReservation.startLeaseUntil': 1
      }
    });
    return false;
  }

  /** Public requests always pass through the auxiliary precedent protocol. */
  async delayReservation(userId: number, reservationId: string, delayMinutes: number): Promise<DelayReservationResult> {
    const auxChain = await this.requestAuxiliaryViolation(
      userId, reservationId, `delay_reservation_${delayMinutes}`, delayMinutes
    );
    return { auxChain, newJobId: undefined, decisionPending: Boolean(auxChain.pendingDecision) };
  }

  async cancelReservation(userId: number, reservationId: string): Promise<CancelReservationResult> {
    const auxChain = await this.requestAuxiliaryViolation(userId, reservationId, 'cancel_reservation');
    return {
      auxChain, queueCancelled: false, decisionPending: Boolean(auxChain.pendingDecision),
      cancelled: !auxChain.pendingReservation
    };
  }

  /** Internal compensation for a creation that failed before queue scheduling completed. */
  async rollbackReservationCreation(userId: number, reservationId: string): Promise<CancelReservationResult> {
    const auxChain = await AuxChain.findOneAndUpdate({
      userId, status: 'active',
      'pendingReservation.reservationId': reservationId,
      'pendingReservation.status': 'pending', pendingDecision: { $exists: false }
    }, { $unset: { pendingReservation: 1 } }, { new: true });
    if (!auxChain) return { auxChain: null, queueCancelled: false, cancelled: false };
    let queueCancelled = false;
    try {
      queueCancelled = await this.queueService?.cancelReservation(reservationId) ?? false;
    } catch (error) {
      logger.warn('预约创建已回滚，队列清理失败', { reservationId, error: String(error) });
    }
    return { auxChain, queueCancelled, cancelled: true };
  }

  /**
   * Create a reservation entry in the AuxChain.
   * Called when a user creates a new reservation via /reserve.
   */
  async createReservation(
    userId: number,
    description: string,
    duration: number,
    reservationId: string
  ): Promise<AuxChainDocument> {
    try {
      await AuxChain.init();

      const createdAt = new Date();
      const pendingReservation = {
        reservationId,
        signal: description,
        duration,
        createdAt,
        deadlineAt: new Date(createdAt.getTime() + config.linearDelay.defaultReservationDelay * 1000),
        status: 'pending' as const
      };

      const saved = await AuxChain.findOneAndUpdate(
        {
          userId,
          status: 'active',
          $or: [
            { pendingReservation: { $exists: false } },
            { pendingReservation: null },
            { 'pendingReservation.status': { $in: ['fulfilled', 'cancelled'] } }
          ]
        },
        {
          $setOnInsert: {
            chainId: generateId('aux'),
            reservationHistory: [],
            status: 'active'
          },
          $set: {
            pendingReservation
          }
        },
        {
          upsert: true,
          new: true,
          runValidators: true
        }
      );

      if (!saved) {
        throw new Error('创建预约失败');
      }

      logger.info(`CTDP createReservation: ${reservationId} created for user ${userId}`, {
        userId,
        reservationId,
        description,
        duration
      });

      return saved;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new Error('已有活跃预约，请先处理或取消当前预约');
      }

      const message = error instanceof Error ? error.message : String(error);
      logger.error(`CTDP createReservation failed: ${message}`, { userId, reservationId });
      throw new Error(`CTDP createReservation 失败: ${message}`);
    }
  }

  /**
   * Expire a reservation that was not acted upon.
   */
  async expireReservation(reservationId: string): Promise<{ expired: boolean; auxChain: AuxChainDocument | null }> {
    if (await this.recoverReservation(reservationId)) return { expired: false, auxChain: null };
    return new AuxiliaryRulesService(this.queueService).expire(reservationId);
  }

  async requestAuxiliaryViolation(userId: number, reservationId: string, behaviorKey: string, delayMinutes?: number) {
    return new AuxiliaryRulesService(this.queueService).request(userId, reservationId, behaviorKey, delayMinutes);
  }

  async resolveAuxiliaryViolation(userId: number, reservationId: string, decision: ViolationOption) {
    return new AuxiliaryRulesService(this.queueService).resolve(userId, reservationId, decision);
  }

  async resolveAuxiliaryDecisionToken(userId: number, decisionToken: string, decision: ViolationOption) {
    const chain = await AuxChain.findOne({ userId, status: 'active', 'pendingDecision.decisionToken': decisionToken });
    const reservationId = chain?.pendingReservation?.reservationId;
    if (!reservationId) throw new Error('判例按钮已过期，请用 /reserve_status 查看当前判例');
    return new AuxiliaryRulesService(this.queueService).resolve(userId, reservationId, decision, decisionToken);
  }

  async completeTrackedTask(userId: number, taskId: string): Promise<CompleteTaskResult | CompleteMainTaskResult> {
    const trackedNode = await this.findRunningMainChainNodeByTaskId(userId, taskId);

    if (!trackedNode) {
      return this.taskService.completeTask(userId, taskId, true);
    }

    return this.completeMainTask(userId, trackedNode.mainChain.chainId, trackedNode.node.nodeNo, taskId);
  }

  async failTrackedTask(
    userId: number,
    taskId: string,
    reason: string
  ): Promise<CompleteTaskResult | FailMainTaskResult> {
    const trackedNode = await this.findRunningMainChainNodeByTaskId(userId, taskId);

    if (!trackedNode) {
      return this.taskService.completeTask(userId, taskId, false, reason);
    }

    return this.failMainTask(userId, trackedNode.mainChain.chainId, trackedNode.node.nodeNo, reason);
  }

  async recoverConfirmedNodes(userId?: number): Promise<void> {
    let failures = 0;
    const cursor = MainChain.find({ ...(userId === undefined ? {} : { userId }), status: 'active',
      pendingViolation: { $exists: false }, 'nodes.status': 'running' }).cursor();
    for await (const main of cursor) {
      for (const node of main.nodes) {
        if (node.status !== 'running') continue;
        const chain = await TaskChain.findOne({ userId: main.userId, 'tasks.taskId': node.taskId });
        const task = chain?.tasks.find(entry => entry.taskId === node.taskId);
        if (task?.coreProtocolVersion !== 1 || task.settlementStatus !== 'settled') continue;
        try {
          if (task.status === 'completed') {
            await this.completeMainTask(main.userId, main.chainId, node.nodeNo, task.taskId);
          } else if (task.status === 'failed') {
            await this.failMainTask(main.userId, main.chainId, node.nodeNo, '恢复已确认的未完成任务');
          }
        } catch (error) {
          failures += 1;
          logger.error('主链结果投影恢复失败', { userId: main.userId, taskId: task.taskId,
            error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    if (failures) throw new Error(`${failures} 个主链结果等待恢复，请稍后查看 /status`);
  }

  /**
   * Resolve the node level based on node number.
   * Simple mapping: every node starts as 'unit'.
   * Level escalation logic can be refined later based on the CTDP protocol spec.
   */
  private resolveLevel(_nodeNo: number): NodeLevel {
    // MVP: all nodes are 'unit' level
    // Future: implement group (every N units) and cluster (every M groups) escalation
    return 'unit';
  }

  private async recoverSettledTask(
    userId: number,
    taskId: string,
    status: 'completed' | 'failed'
  ): Promise<CompleteTaskResult | null> {
    const chain = await TaskChain.findOne({ userId, 'tasks.taskId': taskId });
    const task = chain?.tasks.find((entry) => entry.taskId === taskId);
    if (!chain || !task || task.status !== status || task.settlementStatus !== 'settled') return null;
    const user = await User.findOne({ userId });
    if (!user) return null;
    return {
      chain,
      task,
      user,
      wasChainBroken: status === 'failed',
      cultivationReward:
        status === 'completed' ? (task.rewardSnapshot as unknown as CompleteTaskResult['cultivationReward']) : null,
      rewardPending: status === 'completed' && task.rewardProtocolVersion === 1 && !task.rewardApplied
    };
  }

  private async findRunningMainChainNodeByTaskId(
    userId: number,
    taskId: string
  ): Promise<{ mainChain: MainChainDocument; node: MainChainDocument['nodes'][number] } | null> {
    const mainChain = await MainChain.findOne({
      userId,
      nodes: {
        $elemMatch: {
          taskId,
          status: 'running'
        }
      }
    });

    if (!mainChain) {
      return null;
    }

    const node = mainChain.nodes.find((entry) => entry.taskId === taskId && entry.status === 'running');

    if (!node) {
      return null;
    }

    return { mainChain, node };
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}

export default CTDPService;
