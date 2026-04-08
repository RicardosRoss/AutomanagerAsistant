import { MainChain } from '../models/index.js';
import logger from '../utils/logger.js';
import type { ITask, MainChainDocument, NodeLevel } from '../types/models.js';
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

class CTDPService {
  private taskService: TaskServiceDependency;

  constructor(taskService: TaskServiceDependency) {
    this.taskService = taskService;
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
      await this.taskService.completeTask(userId, node.taskId, false, reason);

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

      return { mainChain: saved };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`CTDP failMainTask failed: ${message}`, { userId, chainId, nodeNo, reason });
      throw new Error(`CTDP failMainTask 失败: ${message}`);
    }
  }

  /**
   * Resolve the node level based on node number.
   * Simple mapping: every node starts as 'unit'.
   * Level escalation logic can be refined later based on the CTDP protocol spec.
   */
  private resolveLevel(nodeNo: number): NodeLevel {
    // MVP: all nodes are 'unit' level
    // Future: implement group (every N units) and cluster (every M groups) escalation
    return 'unit';
  }
}

export default CTDPService;
