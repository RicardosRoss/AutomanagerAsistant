/**
 * CTDP (主链 + 辅助链) 预约兑现流程测试
 *
 * 验证 CTDP 协议中预约到任务兑现的完整行为：
 * - 预约创建与兑现
 * - 神圣座位原理重置
 * - 预约过期
 * - 单一活跃预约约束
 * - CTDP 与 handler 集成
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import CTDPService from '../../src/services/CTDPService.js';
import TaskService from '../../src/services/TaskService.js';

describe('CTDP 预约兑现协议', () => {
  const userId = globalThis.testUserId;
  let ctdpService: CTDPService;
  let taskService: TaskService;
  let queueService: any;

  beforeEach(async () => {
    queueService = {
      addReminder: vi.fn().mockResolvedValue('job-id'),
      cancelTaskReminders: vi.fn().mockResolvedValue(0),
      scheduleReservation: vi.fn().mockResolvedValue('res-job-id'),
      cancelReservation: vi.fn().mockResolvedValue(true),
      rescheduleReservation: vi.fn().mockResolvedValue('new-job-id')
    };

    const cultivationService = {
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

    taskService = new TaskService(queueService, cultivationService as any);
    ctdpService = new CTDPService(taskService, queueService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('预约到点后点击立即开始，应直接兑现为绑定 reservationId 的主链任务', async () => {
    const reservationId = 'res_test_001';

    // First create the reservation in AuxChain
    await ctdpService.createReservation(userId, '测试任务', 25, reservationId);

    // Then fulfill it via startReservedTask
    const result = await ctdpService.startReservedTask(userId, reservationId, '测试任务', 25);

    // The API returns `task` not `mainTask`
    expect(result.task.isReserved).toBe(true);
    expect(result.task.reservationId).toBe(reservationId);

    // AuxChain pendingReservation should be cleared (undefined)
    expect(result.auxChain.pendingReservation).toBeUndefined();
  });

  test('预约兑现后，主链任务失败应按神圣座位原理重置主链', async () => {
    const reservationId = 'res_test_002';
    await ctdpService.createReservation(userId, '测试任务2', 25, reservationId);
    const startResult = await ctdpService.startReservedTask(userId, reservationId, '测试任务2', 25);

    // Use failMainTask with chainId and nodeNo
    const failResult = await ctdpService.failMainTask(
      userId,
      startResult.mainChain.chainId,
      1, // nodeNo
      '预约任务失败'
    );

    expect(failResult.mainChain.status).toBe('broken');
    expect(failResult.mainChain.nodes).toHaveLength(0);
  });

  test('预约到期后无操作，辅助链应记录为过期', async () => {
    const reservationId = 'res_test_expire';
    await ctdpService.createReservation(userId, '过期测试', 25, reservationId);

    const result = await ctdpService.expireReservation(reservationId);

    expect(result.expired).toBe(true);
    expect(result.auxChain?.pendingReservation).toBeUndefined();
  });

  test('同一用户同时只能有一个活跃预约', async () => {
    await ctdpService.createReservation(userId, '学习', 25, 'res_unique_1');

    await expect(
      ctdpService.createReservation(userId, '读书', 30, 'res_unique_2')
    ).rejects.toThrow(/已有|already|conflict/i);
  });
});

// ---------------------------------------------------------------------------
// 预约回调 — CTDP 集成验证
// ---------------------------------------------------------------------------
describe('预约回调 handleStartReservedCallback — CTDP 集成验证', () => {
  test('有 CTDPService 时，handleStartReservedCallback 尝试通过 CTDP 创建任务', async () => {
    const { default: TaskCommandHandlers } = await import('../../src/handlers/taskCommands.js');
    const { default: TaskSvc } = await import('../../src/services/TaskService.js');
    const { default: CTDPSvc } = await import('../../src/services/CTDPService.js');

    const mockBot = {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 1 })
    };

    const mockQueueService = {
      addReminder: vi.fn().mockResolvedValue('job-id'),
      cancelTaskReminders: vi.fn().mockResolvedValue(0),
      scheduleReservation: vi.fn().mockResolvedValue('res-job-id'),
      cancelReservation: vi.fn().mockResolvedValue(true),
      rescheduleReservation: vi.fn().mockResolvedValue('new-job-id')
    };

    const mockCultivationService = {
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

    const taskService = new TaskSvc(mockQueueService, mockCultivationService as any);
    const ctdpService = new CTDPSvc(taskService, mockQueueService);

    const mockOnError = vi.fn();

    const handlers = new (TaskCommandHandlers as any)({
      bot: mockBot,
      taskService,
      queueService: mockQueueService,
      ctdpService,
      onError: mockOnError
    });

    const userId = globalThis.testUserId;
    const reservationId = 'res_ctdp_boundary';

    // Without creating a reservation first, CTDP should throw
    // The error is caught internally by the handler which calls onError
    await handlers.handleStartReservedCallback(userId, `start_reserved_${reservationId}`);

    // The handler should have called onError because CTDPService throws
    // (no reservation exists for this reservationId)
    expect(mockOnError).toHaveBeenCalledTimes(1);
    const errorMessage = mockOnError.mock.calls[0][1] as string;
    expect(errorMessage).toMatch(/不存在或已处理|CTDP startReservedTask/i);
  });
});
