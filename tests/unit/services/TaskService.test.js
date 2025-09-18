import TaskService from '../../../src/services/TaskService.js';

describe('TaskService', () => {
  let taskService;

  beforeEach(() => {
    taskService = new TaskService();
  });

  describe('神圣座位原理测试', () => {
    test('任务失败应完全重置链条', async () => {
      const userId = global.testUserId;

      // 创建第一个任务并完成
      const firstTask = await taskService.createTask(userId, '任务1', 30);
      await taskService.completeTask(userId, firstTask.task.taskId, true);

      // 创建第二个任务
      const secondTask = await taskService.createTask(userId, '任务2', 30);

      // 第二个任务失败
      const result = await taskService.completeTask(userId, secondTask.task.taskId, false, '测试失败');

      // 验证神圣座位原理：完全重置
      expect(result.chain.status).toBe('broken');
      expect(result.chain.totalTasks).toBe(0);
      expect(result.chain.completedTasks).toBe(0);
      expect(result.wasChainBroken).toBe(true);
      expect(result.user.stats.currentStreak).toBe(0);
    });

    test('连续成功应增加连击数', async () => {
      const userId = 999888777;

      // 连续完成3个任务
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
    test('正在进行的任务不能创建新任务', async () => {
      const userId = global.testUserId;

      // 创建第一个任务
      await taskService.createTask(userId, '任务1', 30);

      // 尝试创建第二个任务，应该失败
      await expect(
        taskService.createTask(userId, '任务2', 30)
      ).rejects.toThrow('当前已有任务正在进行中');
    });

    test('获取用户状态应返回正确信息', async () => {
      const userId = global.testUserId;
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
