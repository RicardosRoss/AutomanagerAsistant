import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import moment from 'moment-timezone';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import User from '../../src/models/User.js';
import ScheduledPlan from '../../src/models/ScheduledPlan.js';
import ScheduleService from '../../src/services/ScheduleService.js';
import config from '../../config/index.js';

let redis: ChildProcess;
let directory: string;
let port: number;
const previous = { ...config.redis };

beforeAll(async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing test port');
  port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  directory = await mkdtemp(join(tmpdir(), 'nautilus-test-redis-'));
  redis = spawn('redis-server', [
    '--bind', '127.0.0.1', '--port', String(port), '--save', '', '--appendonly', 'no', '--dir', directory
  ], { stdio: 'ignore' });
  Object.assign(config.redis, { host: '127.0.0.1', port, password: undefined, db: 0 });
});

afterAll(async () => {
  Object.assign(config.redis, previous);
  if (redis && redis.exitCode === null) {
    const exited = new Promise<void>((resolve) => redis.once('exit', () => resolve()));
    redis.kill('SIGTERM');
    await exited;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

const input = () => ({
  source: 'nautilus', date: moment.tz('Asia/Shanghai').add(1, 'day').format('YYYY-MM-DD'), timezone: 'Asia/Shanghai',
  generatedAt: new Date().toISOString(),
  items: [{ title: '队列恢复测试', kind: 'pinned', startMinute: 540, endMinute: 600 }]
});

test('real Bull restart and deleted Redis jobs recover one original deadline from MongoDB', async () => {
  await User.create({ userId: 88401 });
  const name = `nautilus-${randomUUID()}`;
  const first = new ScheduleService();
  const second = new ScheduleService();
  try {
    await first.initialize(null, name);
    expect(await first.queue!.getRepeatableJobs()).toHaveLength(1);
    await first.restoreAfterRedisReconnect();
    await first.restoreAfterRedisReconnect();
    expect(await first.queue!.getRepeatableJobs()).toHaveLength(1);
    const reconciler = vi.spyOn(first, 'reconcile');
    const repeat = (await first.queue!.getJobs(['delayed', 'waiting']))
      .find(job => job.name === 'reconcile');
    expect(repeat?.id).toMatch(/^repeat:/);
    if (await repeat!.getState() === 'delayed') await repeat!.promote();
    await vi.waitFor(() => expect(reconciler).toHaveBeenCalled());
    await vi.waitFor(async () => expect((await first.queue!.getJobs(['delayed', 'waiting']))
      .some(job => job.name === 'reconcile' && job.id !== repeat!.id)).toBe(true));
    expect(await first.sync(88401, input())).toMatchObject({ queued: true });
    const persisted = (await ScheduledPlan.findOne({ userId: 88401 }))!.items[0]!;
    const originalJob = (await first.queue!.getJob(`remind_${persisted.token}`))!;
    expect(originalJob.timestamp + Number(originalJob.opts.delay)).toBeCloseTo(persisted.startAt.getTime(), -2);
    await originalJob.remove();
    await first.close();
    await second.initialize(null, name);
    await Promise.all([second.reconcile(), second.reconcile()]);
    const jobs = await second.queue!.getDelayed();
    expect(jobs.filter(job => job.name === 'remind')).toHaveLength(1);
    expect((await second.queue!.getJob(`remind_${persisted.token}`))?.data.token).toBe(persisted.token);
    expect(await second.queue!.getRepeatableJobs()).toHaveLength(1);
  } finally {
    await first.close();
    await second.close();
  }
});

test('old queued snapshot tokens cannot send after a cancellation; due jobs send through the real queue', async () => {
  await User.create({ userId: 88402 });
  const sender = vi.fn().mockResolvedValue({ message_id: 811 });
  const service = new ScheduleService(sender);
  try {
    await service.initialize(null, `nautilus-${randomUUID()}`);
    await service.sync(88402, input());
    const old = (await ScheduledPlan.findOne())!.items[0]!;
    await service.sync(88402, { ...input(), generatedAt: new Date(Date.now() + 1000).toISOString(), items: [] });
    await service.queue!.add('remind', { token: old.token }, { jobId: 'stale-reminder-test' });
    await vi.waitFor(async () => expect(await (await service.queue!.getJob('stale-reminder-test'))!
      .getState()).toBe('completed'));
    expect(sender).not.toHaveBeenCalled();
    await service.sync(88402, { ...input(), generatedAt: new Date(Date.now() + 2000).toISOString() });
    await ScheduledPlan.updateOne({ userId: 88402 }, { $set: {
      'items.0.startAt': new Date(Date.now() + 700), 'items.0.endAt': new Date(Date.now() + 60000)
    } });
    await service.reconcile();
    await vi.waitFor(() => expect(sender).toHaveBeenCalledTimes(1), { timeout: 5000 });
    await vi.waitFor(async () => expect((await ScheduledPlan.findOne())?.items[0]?.status).toBe('sent'));
    await service.restoreAfterRedisReconnect();
    expect(sender).toHaveBeenCalledTimes(1);
  } finally { await service.close(); }
});

test('stale sending claims become unknown on restart without resending', async () => {
  await User.create({ userId: 88403 });
  const sender = vi.fn();
  const service = new ScheduleService(sender);
  await service.sync(88403, input());
  await ScheduledPlan.updateOne({ userId: 88403 }, { $set: {
    'items.0.status': 'sending', 'items.0.claimedAt': new Date(Date.now() - 180000)
  } });
  try {
    await service.initialize(null, `nautilus-${randomUUID()}`);
    expect((await ScheduledPlan.findOne())?.items[0]?.status).toBe('unknown');
    expect(sender).not.toHaveBeenCalled();
  } finally { await service.close(); }
});
