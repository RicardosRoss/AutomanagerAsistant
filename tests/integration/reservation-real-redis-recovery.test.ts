import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Queue from 'bull';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import AuxChain from '../../src/models/AuxChain.js';
import QueueService from '../../src/services/QueueService.js';
import type { ReservationJobData, ReminderJobData } from '../../src/types/services.js';
import config from '../../config/index.js';

let redis: ChildProcess;
let directory: string;
let queue: Queue.Queue<ReservationJobData>;
let service: QueueService;
let redisPort: number;

beforeAll(async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing test port');
  const port = address.port;
  redisPort = port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  directory = await mkdtemp(join(tmpdir(), 'bot-reservation-redis-'));
  redis = spawn('redis-server', [
    '--bind', '127.0.0.1', '--port', String(port), '--save', '', '--appendonly', 'no', '--dir', directory
  ], { stdio: 'ignore' });
  queue = new Queue<ReservationJobData>(`reservation-test-${randomUUID()}`, {
    redis: { host: '127.0.0.1', port }, defaultJobOptions: { removeOnComplete: false }
  });
  await queue.isReady();
  service = new QueueService();
  service.isInitialized = true;
  service.reservationQueue = queue;
});

afterAll(async () => {
  if (queue) await queue.close();
  if (redis && redis.exitCode === null) {
    const exited = new Promise<void>((resolve) => redis.once('exit', () => resolve()));
    redis.kill('SIGTERM');
    await exited;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('real Bull recovery preserves original deadlines and repairs completed/missing jobs after restart', async () => {
  const future = new Date(Date.now() + 120_000);
  await AuxChain.create({ userId: 820030, chainId: 'redis-recovery', pendingReservation: {
    reservationId: 'res_real', signal: '阅读', duration: 30, deadlineAt: future, status: 'pending'
  } });
  await Promise.all([service.reconcileReservations(), service.reconcileReservations()]);
  expect(await queue.getDelayedCount()).toBe(1);
  expect((await queue.getJob('res_real'))?.data.scheduledFor).toBe(future.toISOString());
  const firstJob = (await queue.getJob('res_real'))!;
  await firstJob.remove();
  const restarted = new QueueService();
  restarted.isInitialized = true;
  restarted.reservationQueue = queue;
  await restarted.reconcileReservations();
  expect(await queue.getDelayedCount()).toBe(1);

  await AuxChain.updateOne({ userId: 820030 }, {
    $set: { 'pendingReservation.deadlineAt': new Date(Date.now() - 1000) }
  });
  await restarted.reconcileReservations();
  const received: string[] = [];
  queue.process('reservation', async (job) => { received.push(job.data.reservationId); });
  await vi.waitFor(() => expect(received).toEqual(['res_real']), { timeout: 5000 });
  await vi.waitFor(async () => expect(await (await queue.getJob('res_real'))!.getState()).toBe('completed'));
  // A completed queue job alone is not proof that MongoDB's decision was delivered.
  await restarted.reconcileReservations();
  await vi.waitFor(() => expect(received).toHaveLength(2), { timeout: 5000 });
  const persisted = await AuxChain.findOne({ userId: 820030 });
  expect(persisted?.pendingReservation?.deadlineAt?.getTime()).toBeLessThan(Date.now());
});

test('repeated and competing reminder cleanup is harmless and keeps other tasks intact', async () => {
  const reminders = new Queue<ReminderJobData>(`reminder-cleanup-test-${randomUUID()}`, {
    redis: { host: '127.0.0.1', port: redisPort }
  });
  const first = new QueueService();
  const second = new QueueService();
  first.isInitialized = second.isInitialized = true;
  first.reminderQueue = second.reminderQueue = reminders;
  try {
    await reminders.isReady();
    await reminders.add('completion', { userId: 834030, taskId: 'cleanup-target', message: '结束' },
      { delay: 120000, jobId: 'target-job' });
    await reminders.add('completion', { userId: 834031, taskId: 'cleanup-control', message: '其他任务' },
      { delay: 120000, jobId: 'control-job' });
    await Promise.all([first.cancelTaskReminders('cleanup-target'), second.cancelTaskReminders('cleanup-target')]);
    expect(await first.cancelTaskReminders('cleanup-target')).toBe(0);
    expect(await reminders.getJob('target-job')).toBeNull();
    expect(await reminders.getJob('control-job')).not.toBeNull();
    expect(await reminders.getDelayedCount()).toBe(1);
  } finally {
    await reminders.close();
  }
});

test('the repeat recovery schedule survives worker restart without creating another repeat job', async () => {
  const previous = { ...config.redis };
  config.redis.host = '127.0.0.1';
  config.redis.port = redisPort;
  config.redis.password = undefined;
  config.redis.db = 0;
  const first = new QueueService();
  const second = new QueueService();
  try {
    await first.initialize();
    expect(await first.maintenanceQueue!.getRepeatableJobs()).toHaveLength(2);
    await first.close();
    await second.initialize();
    const repeats = await second.maintenanceQueue!.getRepeatableJobs();
    expect(repeats).toHaveLength(2);
    expect(repeats.map(job => job.name).sort()).toEqual(['focus-rewards', 'reconcile']);
    expect(repeats.every(job => Number(job.every) === 60000)).toBe(true);
  } finally {
    await first.close();
    await second.close();
    Object.assign(config.redis, previous);
  }
});

test('duplicate reward jobs do not occupy the core recovery slot while rewards are blocked', async () => {
  const previous = { ...config.redis };
  Object.assign(config.redis, { host: '127.0.0.1', port: redisPort, password: undefined, db: 0 });
  const isolated = new QueueService();
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const blocked = vi.fn(async () => barrier);
  const core = vi.fn(async () => undefined);
  isolated.setFocusRewardRecoveryHandler(blocked);
  isolated.setTaskCreationRecoveryHandler(core);
  try {
    await isolated.initialize();
    await vi.waitFor(() => expect(blocked).toHaveBeenCalledTimes(1));
    const before = core.mock.calls.length;
    await isolated.maintenanceQueue!.add('focus-rewards', {}, { jobId: 'duplicate-blocked-reward' });
    await isolated.maintenanceQueue!.add('reconcile', {}, { jobId: 'core-during-blocked-reward' });
    await vi.waitFor(() => expect(core.mock.calls.length).toBeGreaterThan(before), { timeout: 2000 });
    expect(blocked).toHaveBeenCalledTimes(1);
  } finally {
    release();
    await isolated.close();
    Object.assign(config.redis, previous);
  }
});
