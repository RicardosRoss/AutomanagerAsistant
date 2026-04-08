import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MainChain } from '../../../src/models/index.js';
import type { MainChainDocument } from '../../../src/types/models.js';
import type {
  CompleteTaskResult,
  CreateTaskResult,
  CultivationReward
} from '../../../src/types/services.js';

// --- Build a mock TaskService that matches TaskService's public shape ---

function createMockTaskService() {
  return {
    createTask: vi.fn(),
    completeTask: vi.fn(),
    getUserStatus: vi.fn(),
    scheduleProgressReminders: vi.fn(),
    cancelTaskReminders: vi.fn(),
    updateDailyStats: vi.fn(),
    getDailyStats: vi.fn()
  };
}

// We'll lazy-import CTDPService after models are registered
let CTDPService: typeof import('../../../src/services/CTDPService.js').default;

describe('CTDPService', () => {
  let taskService: ReturnType<typeof createMockTaskService>;
  let ctdpService: InstanceType<typeof CTDPService>;

  const testUserId = 123456789;

  // Helper: a minimal fake ITask returned by mock createTask
  const fakeTask = (overrides: Record<string, unknown> = {}) => ({
    taskId: 'task_mock_001',
    description: '专注任务',
    duration: 25,
    startTime: new Date(),
    status: 'running',
    isReserved: false,
    reservationId: null,
    metadata: { progressReminders: [], interruptions: [], notes: '' },
    ...overrides
  });

  // Helper: a minimal CreateTaskResult
  const fakeCreateResult = (taskOverrides: Record<string, unknown> = {}): CreateTaskResult => ({
    chain: {} as any,
    task: fakeTask(taskOverrides),
    user: {} as any
  });

  // Helper: a minimal CompleteTaskResult (success)
  const fakeCompleteResult = (taskOverrides: Record<string, unknown> = {}): CompleteTaskResult => ({
    chain: {} as any,
    task: fakeTask({ status: 'completed', ...taskOverrides }),
    user: {} as any,
    wasChainBroken: false,
    cultivationReward: null
  });

  // Helper: a fake CultivationReward
  const fakeCultivationReward: CultivationReward = {
    spiritualPower: 25,
    immortalStones: 10,
    bonus: 1,
    fortuneEvent: { power: 0, stones: 0, message: null },
    newRealm: '炼气期',
    newStage: '初期',
    newSpiritualPower: 25,
    realmChanged: false
  };

  beforeEach(async () => {
    taskService = createMockTaskService();

    // Dynamic import so the model is registered by the time the service loads
    const mod = await import('../../../src/services/CTDPService.js');
    CTDPService = mod.default;

    ctdpService = new CTDPService(taskService as any);
  });

  // ─── startMainTask ─────────────────────────────────────────────────────

  describe('startMainTask', () => {
    it('should create a new MainChain and add a running node', async () => {
      const createdTask = fakeTask({ taskId: 'task_new_001' });
      taskService.createTask.mockResolvedValue(fakeCreateResult({ taskId: 'task_new_001' }));

      const result = await ctdpService.startMainTask(testUserId, {
        markerLabel: 'my-seat',
        description: '专注任务',
        duration: 25
      });

      // Should have called TaskService.createTask
      expect(taskService.createTask).toHaveBeenCalledWith(
        testUserId,
        '专注任务',
        25,
        false,
        null
      );

      // MainChain should exist with one running node
      expect(result.mainChain).toBeDefined();
      expect(result.mainChain.status).toBe('active');
      expect(result.mainChain.nodes).toHaveLength(1);
      expect(result.mainChain.nodes[0].status).toBe('running');
      expect(result.mainChain.nodes[0].taskId).toBe('task_new_001');
      expect(result.mainChain.nodes[0].nodeNo).toBe(1);
      expect(result.mainChain.nodes[0].level).toBe('unit');
      expect(result.task).toBeDefined();
      expect(result.task.taskId).toBe('task_new_001');
    });

    it('should reuse existing active MainChain and append a node', async () => {
      // Create the chain via first call
      taskService.createTask.mockResolvedValueOnce(fakeCreateResult({ taskId: 'task_first' }));
      await ctdpService.startMainTask(testUserId, {
        markerLabel: 'seat-1',
        description: '任务1',
        duration: 25
      });

      // Second call should reuse the chain
      taskService.createTask.mockResolvedValueOnce(fakeCreateResult({ taskId: 'task_second' }));
      const result = await ctdpService.startMainTask(testUserId, {
        markerLabel: 'seat-1',
        description: '任务2',
        duration: 30
      });

      expect(result.mainChain.nodes).toHaveLength(2);
      expect(result.mainChain.nodes[1].nodeNo).toBe(2);
      expect(result.mainChain.nodes[1].taskId).toBe('task_second');
      expect(result.mainChain.nodes[1].status).toBe('running');
    });

    it('should pass isReserved and reservationId through', async () => {
      taskService.createTask.mockResolvedValue(fakeCreateResult({ taskId: 'task_res_001' }));

      await ctdpService.startMainTask(testUserId, {
        markerLabel: 'my-seat',
        description: '预约任务',
        duration: 15,
        isReserved: true,
        reservationId: 'res_123'
      });

      expect(taskService.createTask).toHaveBeenCalledWith(
        testUserId,
        '预约任务',
        15,
        true,
        'res_123'
      );
    });
  });

  // ─── completeMainTask ──────────────────────────────────────────────────

  describe('completeMainTask', () => {
    it('should mark node as completed and increment unit counter', async () => {
      // Setup: start a task first
      taskService.createTask.mockResolvedValueOnce(fakeCreateResult({ taskId: 'task_comp_001' }));
      const startResult = await ctdpService.startMainTask(testUserId, {
        markerLabel: 'seat-complete',
        description: '任务',
        duration: 25
      });

      const chainId = startResult.mainChain.chainId;
      const node = startResult.mainChain.nodes[0];

      // Complete the task
      taskService.completeTask.mockResolvedValueOnce(
        fakeCompleteResult({ taskId: 'task_comp_001', actualDuration: 25 })
      );

      const result = await ctdpService.completeMainTask(
        testUserId,
        chainId,
        node.nodeNo,
        node.taskId
      );

      expect(taskService.completeTask).toHaveBeenCalledWith(
        testUserId,
        'task_comp_001',
        true
      );

      // Node should be completed
      const completedNode = result.mainChain.nodes.find(
        (n: any) => n.nodeNo === node.nodeNo
      );
      expect(completedNode.status).toBe('completed');

      // unit counter should increment
      expect(result.mainChain.levelCounters.unit).toBe(1);
      expect(result.task).toBeDefined();
    });

    it('should return cultivationReward from TaskService', async () => {
      taskService.createTask.mockResolvedValueOnce(fakeCreateResult({ taskId: 'task_cult_001' }));
      const startResult = await ctdpService.startMainTask(testUserId, {
        markerLabel: 'seat-cult',
        description: '修仙任务',
        duration: 25
      });

      const chainId = startResult.mainChain.chainId;
      const node = startResult.mainChain.nodes[0];

      taskService.completeTask.mockResolvedValueOnce({
        chain: {},
        task: fakeTask({ taskId: 'task_cult_001', status: 'completed' }),
        user: {},
        wasChainBroken: false,
        cultivationReward: fakeCultivationReward
      });

      const result = await ctdpService.completeMainTask(
        testUserId,
        chainId,
        node.nodeNo,
        node.taskId
      );

      expect(result.cultivationReward).toEqual(fakeCultivationReward);
    });

    it('should increment correct level counters based on node level', async () => {
      // Create chain with nodes at different levels
      // First we need to manually set up a chain with nodes at different levels
      taskService.createTask.mockResolvedValueOnce(fakeCreateResult({ taskId: 'task_level_1' }));
      const startResult = await ctdpService.startMainTask(testUserId, {
        markerLabel: 'seat-levels',
        description: '任务',
        duration: 25
      });

      // Manually update a node's level to 'group' for testing
      const chain = startResult.mainChain;
      chain.nodes[0].level = 'group';
      await chain.save();

      const node = chain.nodes[0];
      taskService.completeTask.mockResolvedValueOnce(
        fakeCompleteResult({ taskId: 'task_level_1' })
      );

      const result = await ctdpService.completeMainTask(
        testUserId,
        chain.chainId,
        node.nodeNo,
        node.taskId
      );

      // group counter should increment, not unit
      expect(result.mainChain.levelCounters.group).toBe(1);
      expect(result.mainChain.levelCounters.unit).toBe(0);
    });

    it('should throw if MainChain not found', async () => {
      await expect(
        ctdpService.completeMainTask(testUserId, 'nonexistent_chain', 1, 'task_001')
      ).rejects.toThrow();
    });

    it('should throw if node not found in chain', async () => {
      taskService.createTask.mockResolvedValueOnce(fakeCreateResult({ taskId: 'task_node_nf' }));
      const startResult = await ctdpService.startMainTask(testUserId, {
        markerLabel: 'seat-nf',
        description: '任务',
        duration: 25
      });

      await expect(
        ctdpService.completeMainTask(
          testUserId,
          startResult.mainChain.chainId,
          999, // nonexistent nodeNo
          'task_001'
        )
      ).rejects.toThrow();
    });
  });

  // ─── failMainTask (神圣座位原理) ───────────────────────────────────────

  describe('failMainTask (神圣座位原理)', () => {
    it('should set MainChain status to broken', async () => {
      // Setup: create chain with multiple completed nodes
      taskService.createTask.mockResolvedValueOnce(fakeCreateResult({ taskId: 'task_fail_1' }));
      const startResult = await ctdpService.startMainTask(testUserId, {
        markerLabel: 'seat-fail',
        description: '任务1',
        duration: 25
      });

      const chainId = startResult.mainChain.chainId;

      // Complete first node
      const node1 = startResult.mainChain.nodes[0];
      taskService.completeTask.mockResolvedValueOnce(
        fakeCompleteResult({ taskId: 'task_fail_1' })
      );
      await ctdpService.completeMainTask(testUserId, chainId, node1.nodeNo, node1.taskId);

      // Add second node
      taskService.createTask.mockResolvedValueOnce(fakeCreateResult({ taskId: 'task_fail_2' }));
      const startResult2 = await ctdpService.startMainTask(testUserId, {
        markerLabel: 'seat-fail',
        description: '任务2',
        duration: 25
      });
      const node2 = startResult2.mainChain.nodes[1];

      // Now fail the second task
      const result = await ctdpService.failMainTask(
        testUserId,
        chainId,
        node2.nodeNo,
        '没有坚持住'
      );

      expect(result.mainChain.status).toBe('broken');
    });

    it('should clear all nodes from the chain', async () => {
      // Create chain with multiple nodes
      taskService.createTask.mockResolvedValueOnce(fakeCreateResult({ taskId: 'task_clr_1' }));
      const startResult = await ctdpService.startMainTask(testUserId, {
        markerLabel: 'seat-clear',
        description: '任务1',
        duration: 25
      });
      const chainId = startResult.mainChain.chainId;

      // Complete first node
      taskService.completeTask.mockResolvedValueOnce(
        fakeCompleteResult({ taskId: 'task_clr_1' })
      );
      await ctdpService.completeMainTask(
        testUserId,
        chainId,
        startResult.mainChain.nodes[0].nodeNo,
        startResult.mainChain.nodes[0].taskId
      );

      // Add second node
      taskService.createTask.mockResolvedValueOnce(fakeCreateResult({ taskId: 'task_clr_2' }));
      const startResult2 = await ctdpService.startMainTask(testUserId, {
        markerLabel: 'seat-clear',
        description: '任务2',
        duration: 25
      });

      // Verify chain has 2 nodes before fail
      expect(startResult2.mainChain.nodes.length).toBeGreaterThanOrEqual(2);

      // Fail the second node
      const node2 = startResult2.mainChain.nodes[1];
      const result = await ctdpService.failMainTask(
        testUserId,
        chainId,
        node2.nodeNo,
        '中断了'
      );

      // All nodes should be cleared
      expect(result.mainChain.nodes).toHaveLength(0);
    });

    it('should reset all levelCounters to zero', async () => {
      // Create chain and complete several nodes to build counters
      taskService.createTask.mockResolvedValueOnce(fakeCreateResult({ taskId: 'task_rst_1' }));
      const startResult = await ctdpService.startMainTask(testUserId, {
        markerLabel: 'seat-reset',
        description: '任务1',
        duration: 25
      });
      const chainId = startResult.mainChain.chainId;

      // Complete the first node (unit counter becomes 1)
      taskService.completeTask.mockResolvedValueOnce(
        fakeCompleteResult({ taskId: 'task_rst_1' })
      );
      await ctdpService.completeMainTask(
        testUserId,
        chainId,
        startResult.mainChain.nodes[0].nodeNo,
        startResult.mainChain.nodes[0].taskId
      );

      // Add and fail the second node
      taskService.createTask.mockResolvedValueOnce(fakeCreateResult({ taskId: 'task_rst_2' }));
      const startResult2 = await ctdpService.startMainTask(testUserId, {
        markerLabel: 'seat-reset',
        description: '任务2',
        duration: 25
      });
      const node2 = startResult2.mainChain.nodes[1];

      const result = await ctdpService.failMainTask(
        testUserId,
        chainId,
        node2.nodeNo,
        '放弃了'
      );

      expect(result.mainChain.levelCounters.unit).toBe(0);
      expect(result.mainChain.levelCounters.group).toBe(0);
      expect(result.mainChain.levelCounters.cluster).toBe(0);
    });

    it('should also call TaskService.completeTask with success=false', async () => {
      taskService.createTask.mockResolvedValueOnce(fakeCreateResult({ taskId: 'task_svc_fail' }));
      const startResult = await ctdpService.startMainTask(testUserId, {
        markerLabel: 'seat-svc',
        description: '任务',
        duration: 25
      });
      const node = startResult.mainChain.nodes[0];

      await ctdpService.failMainTask(
        testUserId,
        startResult.mainChain.chainId,
        node.nodeNo,
        '失败了'
      );

      expect(taskService.completeTask).toHaveBeenCalledWith(
        testUserId,
        'task_svc_fail',
        false,
        '失败了'
      );
    });

    it('should throw if MainChain not found', async () => {
      await expect(
        ctdpService.failMainTask(testUserId, 'nonexistent_chain', 1, 'reason')
      ).rejects.toThrow();
    });

    it('should throw if node not found in chain', async () => {
      taskService.createTask.mockResolvedValueOnce(fakeCreateResult({ taskId: 'task_nf' }));
      const startResult = await ctdpService.startMainTask(testUserId, {
        markerLabel: 'seat-nf',
        description: '任务',
        duration: 25
      });

      await expect(
        ctdpService.failMainTask(
          testUserId,
          startResult.mainChain.chainId,
          999,
          'reason'
        )
      ).rejects.toThrow();
    });
  });

  // ─── Integration: Full lifecycle ───────────────────────────────────────

  describe('full lifecycle: start -> complete -> start -> fail', () => {
    it('should demonstrate the sacred seat principle end-to-end', async () => {
      // 1. Start first task
      taskService.createTask.mockResolvedValueOnce(fakeCreateResult({ taskId: 'lc_task_1' }));
      const r1 = await ctdpService.startMainTask(testUserId, {
        markerLabel: 'seat-e2e',
        description: '专注任务1',
        duration: 25
      });
      const chainId = r1.mainChain.chainId;

      // 2. Complete first task
      taskService.completeTask.mockResolvedValueOnce(fakeCompleteResult({ taskId: 'lc_task_1' }));
      const r2 = await ctdpService.completeMainTask(
        testUserId, chainId, r1.mainChain.nodes[0].nodeNo, r1.mainChain.nodes[0].taskId
      );
      expect(r2.mainChain.levelCounters.unit).toBe(1);

      // 3. Start second task
      taskService.createTask.mockResolvedValueOnce(fakeCreateResult({ taskId: 'lc_task_2' }));
      const r3 = await ctdpService.startMainTask(testUserId, {
        markerLabel: 'seat-e2e',
        description: '专注任务2',
        duration: 25
      });
      expect(r3.mainChain.nodes).toHaveLength(2);
      expect(r3.mainChain.levelCounters.unit).toBe(1); // preserved

      // 4. Fail second task -> entire chain should reset
      const node2 = r3.mainChain.nodes[1];
      const r4 = await ctdpService.failMainTask(
        testUserId, chainId, node2.nodeNo, '分心了'
      );

      // Sacred seat: everything resets
      expect(r4.mainChain.status).toBe('broken');
      expect(r4.mainChain.nodes).toHaveLength(0);
      expect(r4.mainChain.levelCounters.unit).toBe(0);
      expect(r4.mainChain.levelCounters.group).toBe(0);
      expect(r4.mainChain.levelCounters.cluster).toBe(0);
    });
  });
});
