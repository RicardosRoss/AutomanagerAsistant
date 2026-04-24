import { beforeEach, describe, expect, test, vi } from 'vitest';
import TaskService from '../../../src/services/TaskService.js';
import CultivationService from '../../../src/services/CultivationService.js';
import { TaskChain } from '../../../src/models/index.js';
import { DEFAULT_TASK_DURATION_MINUTES } from '../../../src/types/taskDefaults.js';

/**
 * Backdate a task's startTime so the duration check passes on complete.
 * Simulates real elapsed time in tests.
 */
async function backdateTask(taskId: string, minutesAgo: number): Promise<void> {
  await TaskChain.updateOne(
    { 'tasks.taskId': taskId },
    { $set: { 'tasks.$.startTime': new Date(Date.now() - minutesAgo * 60 * 1000) } }
  );
}

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
        spiritualPower: 2,
        immortalStones: 8,
        bonus: 1,
        cultivationAttainment: 1,
        cultivationAttainmentDelta: 1,
        mainMethodName: '玄门吐纳法',
        encounter: { type: 'stones', message: '偶得灵石', spiritStoneDelta: 8, obtainedDefinitionIds: [] },
        fortuneEvent: { power: 0, stones: 8, message: '偶得灵石' },
        newRealm: '胎息',
        newStage: '玄景',
        newSpiritualPower: 2,
        realmChanged: false,
        breakthroughReady: false
      })
    };

    taskService = new TaskService(queueService, cultivationService);
  });

  describe('神圣座位原理测试', () => {
    test('任务失败应完全重置链条', async () => {
      const userId = globalThis.testUserId;

      const firstTask = await taskService.createTask(userId, '任务1', 30);
      await backdateTask(firstTask.task.taskId, 30);
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
        await backdateTask(taskResult.task.taskId, 25);
        await taskService.completeTask(userId, taskResult.task.taskId, true);
      }

      const status = await taskService.getUserStatus(userId);
      expect(status.user.stats.currentStreak).toBe(3);
      expect(status.user.stats.longestStreak).toBe(3);
      expect(status.user.stats.completedTasks).toBe(3);
    });

    test('用户不存在时应自动创建', async () => {
      const userId = 111222333;
      const result = await taskService.createTask(userId, '新用户任务');

      expect(result.user).toBeDefined();
      expect(result.user.userId).toBe(userId);
      expect(result.chain).toBeDefined();
      expect(result.task).toBeDefined();
      expect(result.task.duration).toBe(DEFAULT_TASK_DURATION_MINUTES);
      expect(result.user.settings.defaultDuration).toBe(DEFAULT_TASK_DURATION_MINUTES);
    });

    test('新用户首个任务显式指定时长时，不应污染统一默认时长', async () => {
      const userId = 222333444;
      const result = await taskService.createTask(userId, '临时短任务', 30);

      expect(result.task.duration).toBe(30);
      expect(result.user.settings.defaultDuration).toBe(DEFAULT_TASK_DURATION_MINUTES);
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

    test('获取用户状态时可跳过 todayStats 查询', async () => {
      const userId = globalThis.testUserId;
      await taskService.createTask(userId, '测试任务', 25);

      const getDailyStatsSpy = vi.spyOn(taskService, 'getDailyStats');
      const status = await taskService.getUserStatus(userId, { includeTodayStats: false });

      expect(status.user).toBeDefined();
      expect(status.activeChain).toBeDefined();
      expect(status.currentTask).toBeDefined();
      expect(status.todayStats).toBeUndefined();
      expect(getDailyStatsSpy).not.toHaveBeenCalled();
    });
  });

  describe('默认60分钟任务与玄鉴主修为主循环', () => {
    test('默认任务完成后应进入主修为模板并获得修为', async () => {
      const userId = 246813579;
      const realCultivationService = new CultivationService();
      const integratedTaskService = new TaskService(queueService, realCultivationService);

      vi.spyOn(Math, 'random').mockReturnValue(0.88);

      const taskResult = await integratedTaskService.createTask(userId, '默认专注任务');
      expect(taskResult.task.duration).toBe(DEFAULT_TASK_DURATION_MINUTES);

      await backdateTask(taskResult.task.taskId, DEFAULT_TASK_DURATION_MINUTES);
      const result = await integratedTaskService.completeTask(userId, taskResult.task.taskId, true);

      expect(result.cultivationReward).not.toBeNull();
      expect(result.cultivationReward?.spiritualPower).toBeGreaterThan(0);
      expect(result.user.cultivation.spiritualPower).toBe(result.cultivationReward?.newSpiritualPower);
      expect(result.user.cultivation.spiritualPower).toBeGreaterThan(0);
    });
  });
});
