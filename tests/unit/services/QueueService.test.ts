import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import config from '../../../config/index.js';
import QueueService from '../../../src/services/QueueService.js';
import { DEFAULT_TASK_DURATION_MINUTES } from '../../../src/types/taskDefaults.js';

describe('QueueService', () => {
  const originalReservationDelay = config.linearDelay.defaultReservationDelay;
  let queueService: QueueService;
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });

  beforeEach(() => {
    vi.clearAllMocks();
    queueService = new QueueService();
    queueService.setBotInstance({ sendMessage } as never);
  });

  afterEach(() => {
    config.linearDelay.defaultReservationDelay = originalReservationDelay;
  });

  test('reservation notification should render configured delay text', async () => {
    config.linearDelay.defaultReservationDelay = 90 * 60;

    await queueService.sendReservationNotification(123456789, 'res_001', '深度工作', 45);

    expect(sendMessage).toHaveBeenCalledWith(
      123456789,
      expect.stringContaining('⏳ 1小时30分钟的延迟已经大大降低了启动阻力。'),
      expect.any(Object)
    );
  });

  test('scheduleReservation 在未显式传时长时应使用统一默认时长', async () => {
    const add = vi.fn().mockResolvedValue({ id: 'job-default-duration' });
    queueService.isInitialized = true;
    queueService.reservationQueue = { add } as never;

    await queueService.scheduleReservation(123456789, 'res_default_duration', '默认预约任务');

    expect(add).toHaveBeenCalledWith(
      'reservation',
      expect.objectContaining({
        duration: DEFAULT_TASK_DURATION_MINUTES
      }),
      expect.any(Object)
    );
  });

  test('延期重排失败时恢复原预约队列任务', async () => {
    const originalJob = {
      data: {
        userId: 123456789,
        reservationId: 'res_restore',
        taskDescription: '恢复队列',
        duration: 30,
        scheduledFor: new Date(),
        principle: 'LINEAR_DELAY' as const
      },
      timestamp: Date.now(),
      opts: { delay: 60_000 },
      remove: vi.fn().mockResolvedValue(undefined)
    };
    const add = vi
      .fn()
      .mockRejectedValueOnce(new Error('Redis 暂时不可用'))
      .mockResolvedValueOnce({ id: 'res_restore' });
    queueService.isInitialized = true;
    queueService.reservationQueue = {
      getJob: vi.fn().mockResolvedValue(originalJob),
      add
    } as never;

    await expect(queueService.rescheduleReservation('res_restore', 300_000)).rejects.toThrow('Redis 暂时不可用');
    expect(originalJob.remove).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls[1]).toEqual([
      'reservation',
      originalJob.data,
      expect.objectContaining({ jobId: 'res_restore' })
    ]);
  });
});
