/**
 * CTDP (主链 + 辅助链) 预约兑现流程测试
 *
 * 这些测试定义了 CTDP 协议中预约到任务兑现的完整行为。
 * 当前实现缺少 CTDPService、MainChain、AuxChain 等模块，
 * 因此测试会在 import 阶段失败——这正是预期的结果。
 *
 * 一旦实现任务 2-4 完成，这些测试应当全部通过。
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// ---------------------------------------------------------------------------
// 预约兑现协议测试 — CTDPService（尚未实现）
// ---------------------------------------------------------------------------
describe('CTDP 预约兑现协议', () => {
  const userId = globalThis.testUserId;
  let ctdpService: any;
  let queueService: any;

  beforeEach(async () => {
    // CTDPService 尚未实现，下面的 import 会失败。
    // 当实现完成后，替换为真实导入：
    // import CTDPService from '../../src/services/CTDPService.js';
    try {
      const mod = await import('../../src/services/CTDPService.js');
      ctdpService = new mod.default();
    } catch {
      ctdpService = null;
    }

    queueService = {
      addReminder: vi.fn().mockResolvedValue('job-id'),
      cancelTaskReminders: vi.fn().mockResolvedValue(0),
      scheduleReservation: vi.fn().mockResolvedValue('res-job-id'),
      cancelReservation: vi.fn().mockResolvedValue(true)
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('预约到点后点击立即开始，应直接兑现为绑定 reservationId 的主链任务', async () => {
    expect.hasAssertions();

    expect(ctdpService).not.toBeNull();

    const reservationId = 'res_test_001';

    const result = await ctdpService.startReservedTask(userId, reservationId);

    // 主链任务应标记为预约兑现
    expect(result.mainTask.isReserved).toBe(true);
    expect(result.mainTask.reservationId).toBe(reservationId);
    expect(result.mainTask.status).toBe('running');

    // 辅助链应不再持有该预约
    expect(result.auxChain.pendingReservation).toBeNull();
  });

  test('预约兑现后，主链任务失败应按神圣座位原理重置主链', async () => {
    expect.hasAssertions();

    expect(ctdpService).not.toBeNull();

    const reservationId = 'res_test_002';
    const startResult = await ctdpService.startReservedTask(userId, reservationId);

    // 任务失败
    const failResult = await ctdpService.completeMainTask(
      userId,
      startResult.mainTask.taskId,
      false,
      '预约任务失败'
    );

    expect(failResult.chain.status).toBe('broken');
    expect(failResult.chain.totalTasks).toBe(0);
    expect(failResult.chain.completedTasks).toBe(0);
  });

  test('预约未到期时直接点击开始，应提示等待或允许延期', async () => {
    expect.hasAssertions();

    expect(ctdpService).not.toBeNull();

    const reservationId = 'res_test_early';

    // 模拟一个尚未到期的预约
    await expect(
      ctdpService.startReservedTask(userId, reservationId)
    ).rejects.toThrow(/尚未到期|waiting|not yet/i);
  });

  test('预约到期后无操作，辅助链应记录为过期', async () => {
    expect.hasAssertions();

    expect(ctdpService).not.toBeNull();

    const reservationId = 'res_test_expire';

    const result = await ctdpService.expireReservation(reservationId);

    expect(result.expired).toBe(true);
    expect(result.auxChain.pendingReservation).toBeNull();
  });

  test('同一用户同时只能有一个活跃预约', async () => {
    expect.hasAssertions();

    expect(ctdpService).not.toBeNull();

    await ctdpService.createReservation(userId, '学习', 25);

    await expect(
      ctdpService.createReservation(userId, '读书', 30)
    ).rejects.toThrow(/已有|already|conflict/i);
  });
});

// ---------------------------------------------------------------------------
// 预约回调 — 当前实现边界测试
// ---------------------------------------------------------------------------
describe('预约回调 handleStartReservedCallback — 当前实现边界', () => {
  test('当前 start_reserved 回调只发提示消息，不会创建任务', async () => {
    /**
     * 验证现有 handleStartReservedCallback 行为：
     * 它只发送一条鼓励消息，要求用户手动执行 /task 命令。
     * 这是需要被 CTDP 预约兑现协议替换的缺口。
     */
    const { beforeEach: _b, afterEach: _a, ...vitest } = await import('vitest');
    const { default: TaskCommandHandlers } = await import('../../src/handlers/taskCommands.js');
    const { default: TaskService } = await import('../../src/services/TaskService.js');

    const mockBot = {
      sendMessage: vitest.vi.fn().mockResolvedValue({ message_id: 1 })
    };

    const mockQueueService = {
      addReminder: vitest.vi.fn().mockResolvedValue('job-id'),
      cancelTaskReminders: vitest.vi.fn().mockResolvedValue(0),
      scheduleReservation: vitest.vi.fn().mockResolvedValue('res-job-id'),
      cancelReservation: vitest.vi.fn().mockResolvedValue(true)
    };

    const mockCultivationService = {
      awardCultivation: vitest.vi.fn().mockResolvedValue({
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

    const taskService = new TaskService(mockQueueService, mockCultivationService);

    const handlers = new (TaskCommandHandlers as any)({
      bot: mockBot,
      taskService,
      queueService: mockQueueService,
      onError: vitest.vi.fn()
    });

    const userId = globalThis.testUserId;
    const reservationId = 'res_boundary_test';

    await handlers.handleStartReservedCallback(userId, `start_reserved_${reservationId}`);

    // 当前实现：只发一条消息，不创建任务
    expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
    const sentMessage = mockBot.sendMessage.mock.calls[0][1] as string;
    expect(sentMessage).toContain('预约任务启动');

    // 关键缺口：消息内容要求用户手动使用 /task
    // CTDP 协议要求自动创建绑定 reservationId 的任务
    expect(sentMessage).toContain('/task');
  });
});
