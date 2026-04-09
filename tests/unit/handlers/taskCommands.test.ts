import { beforeEach, describe, expect, test, vi } from 'vitest';
import TaskCommandHandlers from '../../../src/handlers/taskCommands.js';

describe('TaskCommandHandlers', () => {
  const bot = {
    sendMessage: vi.fn().mockResolvedValue({ message_id: 1 })
  };
  const taskService = {
    createTask: vi.fn()
  };
  const onError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('/reserve 在 reservation 状态创建失败时，不应先留下队列任务', async () => {
    const queueService = {
      scheduleReservation: vi.fn().mockResolvedValue('job-id'),
      cancelReservation: vi.fn().mockResolvedValue(true)
    };
    const ctdpService = {
      createReservation: vi.fn().mockRejectedValue(new Error('已有活跃预约')),
      cancelReservation: vi.fn().mockResolvedValue({ cancelled: true })
    };

    const handlers = new TaskCommandHandlers({
      bot: bot as never,
      taskService: taskService as never,
      queueService: queueService as never,
      ctdpService: ctdpService as never,
      onError
    });

    await handlers.handleReserveCommand(123456789, '学习编程 30');

    expect(ctdpService.createReservation).toHaveBeenCalledTimes(1);
    expect(queueService.scheduleReservation).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(123456789, '已有活跃预约');
  });

  test('/reserve 在队列调度失败时，应回滚已创建的 reservation 状态', async () => {
    const queueService = {
      scheduleReservation: vi.fn().mockRejectedValue(new Error('队列不可用')),
      cancelReservation: vi.fn().mockResolvedValue(true)
    };
    const ctdpService = {
      createReservation: vi.fn().mockResolvedValue({}),
      cancelReservation: vi.fn().mockResolvedValue({ cancelled: true })
    };

    const handlers = new TaskCommandHandlers({
      bot: bot as never,
      taskService: taskService as never,
      queueService: queueService as never,
      ctdpService: ctdpService as never,
      onError
    });

    await handlers.handleReserveCommand(123456789, '读书 45');

    expect(ctdpService.createReservation).toHaveBeenCalledTimes(1);
    expect(queueService.scheduleReservation).toHaveBeenCalledTimes(1);
    expect(ctdpService.cancelReservation).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(123456789, '队列不可用');
  });
});
