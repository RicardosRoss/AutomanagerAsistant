/**
 * TaskService CTDP 边界测试
 *
 * 这些测试记录 TaskService 当前实现中与 CTDP 协议相关的行为边界。
 * 当 CTDP 层实现后，部分行为将被替换或增强。
 *
 * 重点验证：
 * 1. createTask 已支持 isReserved / reservationId 参数
 * 2. 但没有"预约兑现"自动创建任务的流程
 * 3. handleStartReservedCallback 只发消息，不创建任务（集成测试已覆盖）
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import TaskService from '../../../src/services/TaskService.js';
import { TaskChain } from '../../../src/models/index.js';

async function backdateTask(taskId: string, minutesAgo: number): Promise<void> {
  await TaskChain.updateOne(
    { 'tasks.taskId': taskId },
    { $set: { 'tasks.$.startTime': new Date(Date.now() - minutesAgo * 60 * 1000) } }
  );
}

describe('TaskService — CTDP 协议边界', () => {
  let taskService: TaskService;
  let queueService: any;
  let cultivationService: any;

  beforeEach(() => {
    queueService = {
      addReminder: vi.fn().mockResolvedValue('job-id'),
      cancelTaskReminders: vi.fn().mockResolvedValue(0)
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

  describe('createTask 已有的预约字段', () => {
    test('createTask 接受 isReserved 和 reservationId 参数并持久化到任务', async () => {
      const userId = globalThis.testUserId;
      const reservationId = 'res_boundary_001';

      const result = await taskService.createTask(
        userId,
        '预约任务',
        25,
        true,
        reservationId
      );

      // 验证任务携带预约标记
      expect(result.task.isReserved).toBe(true);
      expect(result.task.reservationId).toBe(reservationId);

      // 验证任务状态为 running（正常创建）
      expect(result.task.status).toBe('running');
    });

    test('非预约任务的 isReserved 默认为 false', async () => {
      const userId = 555666777;

      const result = await taskService.createTask(userId, '普通任务', 30);

      expect(result.task.isReserved).toBe(false);
      expect(result.task.reservationId).toBeNull();
    });
  });

  describe('当前实现无法做到的事（CTDP 缺口）', () => {
    test('没有 startReservedTask 方法', () => {
      // TaskService 缺少 CTDP 协议中的预约兑现方法
      expect((taskService as any).startReservedTask).toBeUndefined();
    });

    test('没有辅助链概念', () => {
      // TaskService 不知道辅助链（AuxChain），只有单一 TaskChain
      // 当用户创建预约时，无法存储"等待兑现"状态
      expect((taskService as any).createAuxChain).toBeUndefined();
      expect((taskService as any).getAuxChain).toBeUndefined();
    });

    test('没有延期预约的方法', () => {
      // CTDP 协议要求支持预约延期（线性时延原理）
      expect((taskService as any).delayReservation).toBeUndefined();
    });

    test('createTask 不区分主链和辅助链', async () => {
      const userId = globalThis.testUserId;

      // 当前 createTask 总是把任务加到同一个活跃 TaskChain
      const result = await taskService.createTask(userId, '任务A', 25, true, 'res_001');

      // 只有一个链，没有主链/辅助链的区分
      expect(result.chain).toBeDefined();
      expect((result as any).mainChain).toBeUndefined();
      expect((result as any).auxChain).toBeUndefined();
    });
  });

  describe('预约标记的任务失败时仍遵循神圣座位原理', () => {
    test('预约任务的失败应重置链条', async () => {
      const userId = 444555666;

      // 先完成一个普通任务
      const firstResult = await taskService.createTask(userId, '普通任务', 25);
      await backdateTask(firstResult.task.taskId, 25);
      await taskService.completeTask(userId, firstResult.task.taskId, true);

      // 再创建一个预约任务并失败
      const secondResult = await taskService.createTask(
        userId,
        '预约任务',
        30,
        true,
        'res_fail_test'
      );
      const failResult = await taskService.completeTask(
        userId,
        secondResult.task.taskId,
        false,
        '预约任务失败'
      );

      // 神圣座位原理：任何任务失败重置整条链
      expect(failResult.chain.status).toBe('broken');
      expect(failResult.chain.totalTasks).toBe(0);
      expect(failResult.chain.completedTasks).toBe(0);
      expect(failResult.wasChainBroken).toBe(true);
    });
  });
});
