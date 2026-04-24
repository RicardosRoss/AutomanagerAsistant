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
});
