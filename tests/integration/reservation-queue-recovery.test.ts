import { expect, test, vi } from 'vitest';
import QueueService from '../../src/services/QueueService.js';
import AuxChain from '../../src/models/AuxChain.js';
import SelfControlBot from '../../src/bot.js';

function fixture() {
  const service = new QueueService();
  service.isInitialized = true;
  const jobs = new Map<string, any>();
  const add = vi.fn(async (_name: string, data: unknown, options: { jobId: string; delay: number }) => {
    if (!jobs.has(options.jobId)) jobs.set(options.jobId, {
      id: options.jobId, data, opts: options, timestamp: Date.now(),
      getState: async () => 'delayed', remove: async () => { jobs.delete(options.jobId); }
    });
    return jobs.get(options.jobId);
  });
  service.reservationQueue = { getJob: async (id: string) => jobs.get(id), add } as never;
  return { service, jobs, add };
}

test('recovery restores missing jobs from stored deadlines without extending the commitment', async () => {
  const { service, jobs, add } = fixture();
  const deadlineAt = new Date(Date.now() + 60_000);
  await AuxChain.create({ userId: 820001, chainId: 'recovery-future', pendingReservation: {
    reservationId: 'res_future', signal: '阅读', duration: 30, createdAt: new Date(), deadlineAt, status: 'pending'
  } });
  await service.reconcileReservations();
  await service.reconcileReservations();
  expect(jobs.size).toBe(1);
  expect(add).toHaveBeenCalledTimes(1);
  expect(jobs.get('res_future').data.scheduledFor).toEqual(deadlineAt);
  expect(jobs.get('res_future').opts.delay).toBeGreaterThan(50_000);
  expect(jobs.get('res_future').opts.delay).toBeLessThanOrEqual(60_000);
  expect((await AuxChain.findOne({ userId: 820001 }))?.pendingReservation?.deadlineAt).toEqual(deadlineAt);
});

test('overdue jobs run immediately; delivered decisions and inactive or legacy chains are skipped', async () => {
  const { service, jobs } = fixture();
  for (const [index, options] of [
    { status: 'active', deadlineAt: new Date(Date.now() - 1000) },
    { status: 'inactive', deadlineAt: new Date(Date.now() - 1000) },
    { status: 'active', deadlineAt: undefined },
    { status: 'active', deadlineAt: new Date(Date.now() - 1000), pendingDecision: {
      behaviorKey: 'missed_start', notifiedAt: new Date()
    } }
  ].entries()) {
    await AuxChain.create({ userId: 820002 + index, chainId: `recovery-skip-${index}`, ...options,
      pendingReservation: {
        reservationId: `res_skip_${index}`, status: 'pending', deadlineAt: options.deadlineAt
      },
      pendingDecision: options.pendingDecision
    });
  }
  await service.reconcileReservations();
  expect([...jobs.keys()]).toEqual(['res_skip_0']);
  expect(jobs.get('res_skip_0').opts.delay).toBe(0);
});

test('terminal deadline jobs are recreated but active jobs are preserved', async () => {
  const { service, jobs, add } = fixture();
  for (const [index, state] of ['failed', 'completed', 'active'].entries()) {
    const reservationId = `res_terminal_${index}`;
    await AuxChain.create({ userId: 820010 + index, chainId: `recovery-terminal-${index}`, pendingReservation: {
      reservationId, deadlineAt: new Date(Date.now() - 1000), status: 'pending'
    } });
    jobs.set(reservationId, {
      getState: async () => state,
      remove: vi.fn(async () => { jobs.delete(reservationId); })
    });
  }
  await service.reconcileReservations();
  expect(add).toHaveBeenCalledTimes(2);
  expect(jobs.get('res_terminal_2').remove).not.toHaveBeenCalled();
});

test('failed decision delivery stays retryable and successful delivery is not repeated', async () => {
  const bot = new SelfControlBot();
  const sendMessage = vi.fn().mockRejectedValueOnce(new Error('Telegram timeout')).mockResolvedValue({ message_id: 1 });
  (bot as unknown as { initializeHandlers: (transport: unknown) => void }).initializeHandlers({ sendMessage });
  await AuxChain.create({ userId: 820020, chainId: 'recovery-delivery', pendingReservation: {
    reservationId: 'res_delivery', deadlineAt: new Date(Date.now() - 1000), status: 'pending'
  } });
  const expire = bot.queueService.reservationExpiryHandler!;
  await expect(expire('res_delivery')).rejects.toThrow('Telegram timeout');
  const failed = (await AuxChain.findOne({ userId: 820020 }))!;
  expect(failed.pendingDecision?.behaviorKey).toBe('missed_start');
  expect(failed.pendingDecision?.notifiedAt).toBeUndefined();
  await AuxChain.updateOne({ userId: 820020 }, {
    $set: { 'pendingDecision.nextNotificationAt': new Date(Date.now() - 1) }
  });
  await expire('res_delivery');
  expect((await AuxChain.findOne({ userId: 820020 }))?.pendingDecision?.notifiedAt).toBeInstanceOf(Date);
  await expire('res_delivery');
  expect(sendMessage).toHaveBeenCalledTimes(2);
});

test('a manual cancel decision that failed delivery is recovered immediately before its deadline', async () => {
  const { service, jobs } = fixture();
  const bot = new SelfControlBot();
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
  (bot as unknown as { initializeHandlers: (transport: unknown) => void }).initializeHandlers({ sendMessage });
  const deadlineAt = new Date(Date.now() + 120_000);
  await AuxChain.create({ userId: 820040, chainId: 'recovery-manual', pendingReservation: {
    reservationId: 'res_manual', deadlineAt, status: 'pending'
  }, pendingDecision: { behaviorKey: 'cancel_reservation' } });
  await service.reconcileReservations();
  expect(jobs.get('res_manual').opts.delay).toBe(0);
  await bot.queueService.reservationExpiryHandler!('res_manual');
  expect(sendMessage).toHaveBeenCalledTimes(1);
  expect(sendMessage.mock.calls[0]?.[1]).toContain('希望取消预约');
  expect((await AuxChain.findOne({ userId: 820040 }))?.pendingReservation?.deadlineAt).toEqual(deadlineAt);
});

test('one broken reservation job must not prevent recovery of another user', async () => {
  const { service, jobs } = fixture();
  for (const index of [0, 1]) {
    await AuxChain.create({ userId: 820050 + index, chainId: `recovery-isolation-${index}`, pendingReservation: {
      reservationId: `res_isolation_${index}`, deadlineAt: new Date(Date.now() + 60000), status: 'pending'
    } });
  }
  service.reservationQueue!.getJob = vi.fn(async (id) => {
    if (id === 'res_isolation_0') throw new Error('corrupt job state');
    return jobs.get(id);
  });
  await expect(service.reconcileReservations()).rejects.toThrow();
  expect(jobs.has('res_isolation_1')).toBe(true);
});

test('a lost delivery-mark write does not send a decision on every recovery tick', async () => {
  const { service, jobs } = fixture();
  const bot = new SelfControlBot();
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
  (bot as unknown as { initializeHandlers: (transport: unknown) => void }).initializeHandlers({ sendMessage });
  await AuxChain.create({ userId: 820060, chainId: 'recovery-lost-mark', pendingReservation: {
    reservationId: 'res_lost_mark', deadlineAt: new Date(Date.now() - 1000), status: 'pending'
  }, pendingDecision: { behaviorKey: 'missed_start' } });
  const mark = vi.spyOn(AuxChain, 'updateOne').mockRejectedValueOnce(new Error('mark write unavailable'));
  try {
    await expect(bot.queueService.reservationExpiryHandler!('res_lost_mark')).rejects.toThrow('mark write unavailable');
    await bot.queueService.reservationExpiryHandler!('res_lost_mark');
    await service.reconcileReservations();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(jobs.size).toBe(0);
    expect((await AuxChain.findOne({ userId: 820060 }))?.pendingDecision?.nextNotificationAt?.getTime())
      .toBeGreaterThan(Date.now());
  } finally {
    mark.mockRestore();
  }
});

test('two automatic notifications cannot send concurrently for the same decision', async () => {
  const bot = new SelfControlBot();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const sendMessage = vi.fn(async () => {
    await gate;
    return { message_id: 1 };
  });
  (bot as unknown as { initializeHandlers: (transport: unknown) => void }).initializeHandlers({ sendMessage });
  await AuxChain.create({ userId: 820070, chainId: 'recovery-concurrent-notice', pendingReservation: {
    reservationId: 'res_concurrent_notice', deadlineAt: new Date(Date.now() - 1000), status: 'expired'
  }, pendingDecision: { behaviorKey: 'missed_start' } });
  const first = bot.queueService.reservationExpiryHandler!('res_concurrent_notice');
  try {
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    await bot.queueService.reservationExpiryHandler!('res_concurrent_notice');
    expect(sendMessage).toHaveBeenCalledTimes(1);
  } finally {
    release();
    await first;
  }
  expect((await AuxChain.findOne({ userId: 820070 }))?.pendingDecision?.notifiedAt).toBeInstanceOf(Date);
});

test('the maintenance entry resumes a selected decision and then restores its original delayed job', async () => {
  const { service, jobs } = fixture();
  const bot = new SelfControlBot();
  vi.spyOn(bot.queueService, 'rescheduleReservation').mockRejectedValue(new Error('Redis unavailable'));
  service.setReservationRecoveryHandler((id) => bot.ctdpService.recoverReservation(id));
  const resolutionAt = new Date(Date.now() - 120000);
  await AuxChain.create({ userId: 821200, chainId: 'recover-selected-entry', pendingReservation: {
    reservationId: 'res_selected_entry', deadlineAt: new Date(Date.now() + 60000), status: 'pending'
  }, pendingDecision: {
    behaviorKey: 'delay_reservation_5', delayMinutes: 5, chosenDecision: 'allow_forever',
    resolutionAt, processingUntil: new Date(Date.now() - 1)
  } });
  await service.reconcileReservations();
  const saved = (await AuxChain.findOne({ userId: 821200 }))!;
  expect(saved.pendingDecision).toBeUndefined();
  expect(saved.pendingReservation?.deadlineAt).toEqual(new Date(resolutionAt.getTime() + 300000));
  await service.reconcileReservations();
  expect(jobs.size).toBe(1);
  expect(jobs.get('res_selected_entry').data.scheduledFor).toEqual(saved.pendingReservation?.deadlineAt);
  expect(saved.reservationHistory).toHaveLength(1);
  vi.restoreAllMocks();
});

test('overlapping ready recovery and periodic reconciliation share one scan in this worker', async () => {
  const { service, jobs } = fixture();
  await AuxChain.create({ userId: 826002, chainId: 'ready-periodic-race', pendingReservation: {
    reservationId: 'res_ready_periodic', deadlineAt: new Date(Date.now() + 60000), status: 'pending'
  } });
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { reached = resolve; });
  const getJob = vi.fn(async (id: string) => {
    reached();
    await gate;
    return jobs.get(id);
  });
  service.reservationQueue!.getJob = getJob;
  const first = service.reconcileReservations();
  await entered;
  const second = service.reconcileReservations();
  try {
    expect(second).toBe(first);
    expect(getJob).toHaveBeenCalledTimes(1);
  } finally {
    release();
    await Promise.all([first, second]);
  }
  expect(jobs.size).toBe(1);
});
