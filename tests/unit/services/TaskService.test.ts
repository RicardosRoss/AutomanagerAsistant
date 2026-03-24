import { beforeEach, describe, expect, test, vi } from 'vitest';
import TaskService from '../../../src/services/TaskService.js';

describe('TaskService', () => {
  let taskService: TaskService;
  let queueService: {
    addReminder: ReturnType<typeof vi.fn>;
    cancelTaskReminders: ReturnType<typeof vi.fn>;
    setBotInstance: ReturnType<typeof vi.fn>;
    initialize: ReturnType<typeof vi.fn>;
    isInitialized: boolean;
  };
  let cultivationService: {
    awardCultivation: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    queueService = {
      addReminder: vi.fn().mockResolvedValue('job-id'),
      cancelTaskReminders: vi.fn().mockResolvedValue(0),
      setBotInstance: vi.fn(),
      initialize: vi.fn(),
      isInitialized: true
    };

    cultivationService = {
      awardCultivation: vi.fn().mockResolvedValue({
        spiritualPower: 25,
        immortalStones: 12,
        bonus: 1,
        fortuneEvent: null,
        newRealm: '炼气期',
        newStage: '初期',
        newSpiritualPower: 25,
        realmChanged: false
      })
    };

    taskService = new TaskService(queueService, cultivationService);
  });

  describe('神圣座位原理测试', () => {
    test('任务失败应完全重置链条', async () => {
      const userId = globalThis.testUserId;

      const firstTask = await taskService.createTask(userId, '任务1', 30);
      await taskService.completeTask(userId, firstTask.task.taskId, true);

      const secondTask = await taskService.createTask(userId, '任务2', 30);
      const result = await taskService.completeTask(userId, secondTask.task.taskId, false, '测试失败');

      expect(result.chain.status).toBe('broken');
      expect(result.chain.totalTasks).toBe(0);
      expect(result.chain.completedTasks).toBe(0);
      expect(result.wasChainBroken).toBe(true);
      expect(result.user.stats.currentStreak).toBe(0);
    });

    test('连续成功应增加连击数', async () => {
      const userId = 999888777;

      for (let i = 1; i <= 3; i += 1) {
        const taskResult = await taskService.createTask(userId, `任务${i}`, 25);
        await taskService.completeTask(userId, taskResult.task.taskId, true);
      }

      const status = await taskService.getUserStatus(userId);
      expect(status.user.stats.currentStreak).toBe(3);
      expect(status.user.stats.longestStreak).toBe(3);
      expect(status.user.stats.completedTasks).toBe(3);
    });

    test('用户不存在时应自动创建', async () => {
      const userId = 111222333;
      const result = await taskService.createTask(userId, '新用户任务', 25);

      expect(result.user).toBeDefined();
      expect(result.user.userId).toBe(userId);
      expect(result.chain).toBeDefined();
      expect(result.task).toBeDefined();
    });
  });

  describe('任务状态管理', () => {
    test('正在进行的任务会自动停止并创建新任务', async () => {
      const userId = globalThis.testUserId;
      const firstResult = await taskService.createTask(userId, '任务1', 30);
      const secondResult = await taskService.createTask(userId, '任务2', 30);

      const firstTask = secondResult.chain.tasks.find((task: any) => task.taskId === firstResult.task.taskId);

      expect(firstTask?.status).toBe('cancelled');
      expect(firstTask?.metadata.notes).toBe('被新任务中断');
      expect(secondResult.task.status).toBe('running');
      expect(queueService.cancelTaskReminders).toHaveBeenCalledWith(firstResult.task.taskId);
    });

    test('获取用户状态应返回正确信息', async () => {
      const userId = globalThis.testUserId;
      const result = await taskService.createTask(userId, '测试任务', 25);
      const status = await taskService.getUserStatus(userId);

      expect(status.user).toBeDefined();
      expect(status.activeChain).toBeDefined();
      expect(status.currentTask).toBeDefined();
      expect(status.isActive).toBe(true);
      expect(status.currentTask.taskId).toBe(result.task.taskId);
    });
  });
});
