import { expect, test, vi } from 'vitest';
import QueueService from '../../src/services/QueueService.js';

test('the reservation deadline job requests a decision instead of inviting a first start', async () => {
  const queue = new QueueService();
  const processors = new Map<string, (job: unknown) => Promise<void>>();
  const register = (name: string, _concurrency: number, processor: (job: unknown) => Promise<void>) => {
    processors.set(name, processor);
  };
  queue.reminderQueue = { process: register } as never;
  queue.reservationQueue = { process: register } as never;
  const expire = vi.fn().mockResolvedValue(undefined);
  Object.assign(queue, { reservationExpiryHandler: expire });
  const oldInvitation = vi.spyOn(queue, 'sendReservationNotification').mockResolvedValue(undefined);
  queue.setupProcessors();
  await processors.get('reservation')!({
    data: { userId: 10, reservationId: 'res_test', taskDescription: '读书', duration: 60 }
  });
  expect(expire).toHaveBeenCalledWith('res_test');
  expect(oldInvitation).not.toHaveBeenCalled();
});
