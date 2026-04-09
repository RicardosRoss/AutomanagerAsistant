import { AuxChain, MainChain } from '../models/index.js';
import { generateId } from '../utils/index.js';
import logger from '../utils/logger.js';
import type { AuxChainDocument, ITask, MainChainDocument, NodeLevel } from '../types/models.js';
import type {
  CompleteMainTaskResult,
  CompleteTaskResult,
  FailMainTaskResult,
  StartMainTaskInput,
  StartMainTaskResult
} from '../types/services.js';

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
    reservationId?: string | null
  ): Promise<{ chain: unknown; task: ITask; user: unknown }>;
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
}

export interface DelayReservationResult {
  auxChain: AuxChainDocument;
  newJobId: string | number | undefined;
}

export interface CancelReservationResult {
  auxChain: AuxChainDocument | null;
  queueCancelled: boolean;
  cancelled: boolean;
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
      // 1. Find or create active MainChain
      const mainChain = await MainChain.findOrCreateActive(userId, input.markerLabel);

      // 2. Create the underlying task via TaskService
      const createResult = await this.taskService.createTask(
        userId,
        input.description,
        input.duration,
        input.isReserved ?? false,
        input.reservationId ?? null
      );

      const task = createResult.task;

      // 3. Determine node number and level
      const nodeNo = mainChain.nodes.length + 1;
      const level = this.resolveLevel(nodeNo);

      // 4. Append running node to the MainChain
      mainChain.nodes.push({
        nodeNo,
        level,
        taskId: task.taskId,
        status: 'running'
      });

      const saved = await mainChain.save();

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

      // 2. Find the node
      const node = mainChain.nodes.find((n) => n.nodeNo === nodeNo);
      if (!node) {
        throw new Error(`节点 #${nodeNo} 不存在于主链中`);
      }

      // 3. Complete the underlying task
      const completeResult = await this.taskService.completeTask(userId, taskId, true);

      // 4. Update node status
      node.status = 'completed';

      // 5. Increment the appropriate level counter
      const counterField = node.level as keyof typeof mainChain.levelCounters;
      mainChain.levelCounters[counterField] += 1;

      const saved = await mainChain.save();

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
        cultivationReward: completeResult.cultivationReward
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`CTDP completeMainTask failed: ${message}`, { userId, chainId, nodeNo, taskId });
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
  async failMainTask(
    userId: number,
    chainId: string,
    nodeNo: number,
    reason: string
  ): Promise<FailMainTaskResult> {
    try {
      // 1. Find MainChain
      const mainChain = await MainChain.findOne({ userId, chainId });
      if (!mainChain) {
        throw new Error('主链不存在');
      }

      // 2. Find the node to get its taskId
      const node = mainChain.nodes.find((n) => n.nodeNo === nodeNo);
      if (!node) {
        throw new Error(`节点 #${nodeNo} 不存在于主链中`);
      }

      // 3. Fail the underlying task via TaskService
      const failResult = await this.taskService.completeTask(userId, node.taskId, false, reason);

      // 4. Apply 神圣座位原理: reset everything
      mainChain.status = 'broken';
      mainChain.nodes = [];
      mainChain.levelCounters = { unit: 0, group: 0, cluster: 0 };

      const saved = await mainChain.save();

      logger.warn(
        `CTDP failMainTask: 神圣座位原理触发 - 主链重置 for user ${userId}, reason: ${reason}`,
        {
          userId,
          chainId: saved.chainId,
          failedNodeNo: nodeNo,
          reason
        }
      );

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
    duration?: number
  ): Promise<StartReservedTaskResult> {
    try {
      // 1. Find the AuxChain with this pending reservation
      const auxChain = await AuxChain.findOne({
        userId,
        'pendingReservation.reservationId': reservationId,
        'pendingReservation.status': 'pending'
      });

      if (!auxChain?.pendingReservation) {
        throw new Error(`预约 ${reservationId} 不存在或已处理`);
      }

      const reservationDescription = description ?? auxChain.pendingReservation.signal ?? '预约任务';
      const reservationDuration = duration ?? auxChain.pendingReservation.duration ?? 25;

      // 2. Create a main chain task bound to this reservation
      const startResult = await this.startMainTask(userId, {
        markerLabel: '预约兑现',
        description: reservationDescription,
        duration: reservationDuration,
        isReserved: true,
        reservationId
      });

      // 3. Move reservation from pending to fulfilled in history
      auxChain.reservationHistory.push({
        reservationId,
        signal: auxChain.pendingReservation.signal,
        duration: auxChain.pendingReservation.duration,
        createdAt: auxChain.pendingReservation.createdAt,
        fulfilledAt: new Date(),
        status: 'fulfilled'
      });
      auxChain.pendingReservation = undefined;

      const savedAuxChain = await auxChain.save();

      logger.info(`CTDP startReservedTask: reservation ${reservationId} fulfilled for user ${userId}`, {
        userId,
        reservationId,
        taskId: startResult.task.taskId
      });

      return {
        mainChain: startResult.mainChain,
        task: startResult.task,
        auxChain: savedAuxChain
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`CTDP startReservedTask failed: ${message}`, { userId, reservationId });
      throw new Error(`CTDP startReservedTask 失败: ${message}`);
    }
  }

  /**
   * Delay a pending reservation by rescheduling the queue job
   * and updating the AuxChain deadline.
   */
  async delayReservation(
    userId: number,
    reservationId: string,
    delayMinutes: number
  ): Promise<DelayReservationResult> {
    try {
      // 1. Find the AuxChain with this pending reservation
      const auxChain = await AuxChain.findOne({
        userId,
        'pendingReservation.reservationId': reservationId,
        'pendingReservation.status': 'pending'
      });

      if (!auxChain?.pendingReservation) {
        throw new Error(`预约 ${reservationId} 不存在或已处理`);
      }

      // 2. Reschedule the queue job
      const delayMs = delayMinutes * 60 * 1000;
      let newJobId: string | number | undefined;
      if (this.queueService) {
        newJobId = await this.queueService.rescheduleReservation(reservationId, delayMs);
      }

      // 3. Record the delay and update the deadline in AuxChain
      const delayedAt = new Date();
      auxChain.reservationHistory.push({
        reservationId,
        signal: auxChain.pendingReservation.signal,
        duration: auxChain.pendingReservation.duration,
        createdAt: auxChain.pendingReservation.createdAt,
        delayedAt,
        delayMinutes,
        status: 'delayed'
      });
      auxChain.pendingReservation.deadlineAt = new Date(Date.now() + delayMs);
      const savedAuxChain = await auxChain.save();

      logger.info(`CTDP delayReservation: ${reservationId} delayed by ${delayMinutes} minutes`, {
        userId,
        reservationId,
        delayMinutes,
        newJobId
      });

      return { auxChain: savedAuxChain, newJobId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`CTDP delayReservation failed: ${message}`, { userId, reservationId, delayMinutes });
      throw new Error(`CTDP delayReservation 失败: ${message}`);
    }
  }

  async cancelReservation(userId: number, reservationId: string): Promise<CancelReservationResult> {
    try {
      const auxChain = await AuxChain.findOne({
        userId,
        'pendingReservation.reservationId': reservationId,
        'pendingReservation.status': 'pending'
      });

      let queueCancelled = false;
      if (this.queueService) {
        queueCancelled = await this.queueService.cancelReservation(reservationId);
      }

      if (!auxChain?.pendingReservation) {
        return {
          auxChain: null,
          queueCancelled,
          cancelled: queueCancelled
        };
      }

      auxChain.reservationHistory.push({
        reservationId,
        signal: auxChain.pendingReservation.signal,
        duration: auxChain.pendingReservation.duration,
        createdAt: auxChain.pendingReservation.createdAt,
        status: 'cancelled'
      });
      auxChain.pendingReservation = undefined;

      const savedAuxChain = await auxChain.save();

      logger.info(`CTDP cancelReservation: ${reservationId} cancelled for user ${userId}`, {
        userId,
        reservationId,
        queueCancelled
      });

      return {
        auxChain: savedAuxChain,
        queueCancelled,
        cancelled: true
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`CTDP cancelReservation failed: ${message}`, { userId, reservationId });
      throw new Error(`CTDP cancelReservation 失败: ${message}`);
    }
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
        deadlineAt: new Date(createdAt.getTime() + 15 * 60 * 1000),
        status: 'pending' as const
      };

      const saved = await AuxChain.findOneAndUpdate(
        {
          userId,
          status: 'active',
          $or: [
            { pendingReservation: { $exists: false } },
            { pendingReservation: null },
            { 'pendingReservation.status': { $ne: 'pending' } }
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
    try {
      const auxChain = await AuxChain.findOne({
        'pendingReservation.reservationId': reservationId,
        'pendingReservation.status': 'pending'
      });

      if (!auxChain?.pendingReservation) {
        return { expired: false, auxChain: null };
      }

      auxChain.reservationHistory.push({
        reservationId,
        signal: auxChain.pendingReservation.signal,
        duration: auxChain.pendingReservation.duration,
        createdAt: auxChain.pendingReservation.createdAt,
        status: 'expired'
      });
      auxChain.pendingReservation = undefined;

      const saved = await auxChain.save();

      logger.info(`CTDP expireReservation: ${reservationId} expired`, { reservationId });

      return { expired: true, auxChain: saved };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`CTDP expireReservation failed: ${message}`, { reservationId });
      throw new Error(`CTDP expireReservation 失败: ${message}`);
    }
  }

  async completeTrackedTask(userId: number, taskId: string): Promise<CompleteTaskResult | CompleteMainTaskResult> {
    const trackedNode = await this.findRunningMainChainNodeByTaskId(userId, taskId);

    if (!trackedNode) {
      return this.taskService.completeTask(userId, taskId, true);
    }

    return this.completeMainTask(
      userId,
      trackedNode.mainChain.chainId,
      trackedNode.node.nodeNo,
      taskId
    );
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

    return this.failMainTask(
      userId,
      trackedNode.mainChain.chainId,
      trackedNode.node.nodeNo,
      reason
    );
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
