import { beforeEach, describe, expect, test, vi } from 'vitest';
import TaskService from '../src/services/TaskService.js';
import { TaskChain, User } from '../src/models/index.js';

describe('任务重复完成防护测试', () => {
  let taskService: TaskService;

  beforeEach(() => {
    const queueService = {
      addReminder: vi.fn().mockResolvedValue('mock-job-id'),
      cancelTaskReminders: vi.fn().mockResolvedValue(0),
      scheduleReservation: vi.fn().mockResolvedValue('reservation-job-id'),
      cancelReservation: vi.fn().mockResolvedValue(true)
    };

    const cultivationService = {
      awardCultivation: vi.fn().mockResolvedValue({
        spiritualPower: 25,
        immortalStones: 12,
        bonus: 1,
        fortuneEvent: { power: 0, stones: 0, message: null },
        oldRealm: '炼气期',
        newRealm: '炼气期',
        newStage: '初期',
        realmChanged: false,
        oldSpiritualPower: 0,
        newSpiritualPower: 25
      })
    };

    taskService = new TaskService(queueService, cultivationService);
  });

  test('应该防止同一任务被重复完成', async () => {
    const testUserId = globalThis.testUserId;
    const result = await taskService.createTask(testUserId, '测试任务', 25);
    const testTaskId = result.task.taskId;

    const userBefore = await User.findOne({ userId: testUserId });
    expect(userBefore).not.toBeNull();

    const completedBefore = userBefore?.stats.completedTasks ?? 0;
    const minutesBefore = userBefore?.stats.totalMinutes ?? 0;

    const [result1, result2] = await Promise.allSettled([
      taskService.completeTask(testUserId, testTaskId, true),
      taskService.completeTask(testUserId, testTaskId, true)
    ]);

    const successCount = [result1, result2].filter((entry) => entry.status === 'fulfilled').length;
    const failureCount = [result1, result2].filter((entry) => entry.status === 'rejected').length;

    expect(successCount).toBe(1);
    expect(failureCount).toBe(1);

    const failedResult = [result1, result2].find((entry) => entry.status === 'rejected');
    expect(failedResult?.status).toBe('rejected');
    if (failedResult?.status === 'rejected') {
      expect(failedResult.reason.message).toMatch(/任务不存在、已完成或未在运行状态/);
    }

    const userAfter = await User.findOne({ userId: testUserId });
    expect(userAfter).not.toBeNull();
    expect((userAfter?.stats.completedTasks ?? 0) - completedBefore).toBe(1);
    expect((userAfter?.stats.totalMinutes ?? 0) - minutesBefore).toBeGreaterThanOrEqual(0);

    const chain = await TaskChain.findOne({ userId: testUserId });
    const task = chain?.tasks.find((entry) => entry.taskId === testTaskId);
    expect(task?.status).toBe('completed');
  });

  test('应该允许不同用户的任务并发完成', async () => {
    const firstUserId = globalThis.testUserId;
    const secondUserId = globalThis.testUserId + 1;

    const firstTask = await taskService.createTask(firstUserId, '测试任务1', 25);
    const secondTask = await taskService.createTask(secondUserId, '测试任务2', 30);

    const [resultA, resultB] = await Promise.allSettled([
      taskService.completeTask(firstUserId, firstTask.task.taskId, true),
      taskService.completeTask(secondUserId, secondTask.task.taskId, true)
    ]);

    expect(resultA.status).toBe('fulfilled');
    expect(resultB.status).toBe('fulfilled');

    const [firstUser, secondUser] = await Promise.all([
      User.findOne({ userId: firstUserId }),
      User.findOne({ userId: secondUserId })
    ]);

    expect(firstUser?.stats.completedTasks).toBe(1);
    expect(secondUser?.stats.completedTasks).toBe(1);
  });
});
