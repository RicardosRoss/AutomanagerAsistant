import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import Redis from 'redis';
import { RedisConnection } from '../../src/config/redis.js';
import config from '../../config/index.js';
import QueueService from '../../src/services/QueueService.js';
import AuxChain from '../../src/models/AuxChain.js';

let server: ChildProcess;
let directory: string;
let port: number;
let connection: RedisConnection;
let control: ReturnType<typeof Redis.createClient>;
const previous = { ...config.redis };

function launch() {
  server = spawn('redis-server', ['--bind', '127.0.0.1', '--port', String(port),
    '--save', '', '--appendonly', 'no', '--dir', directory], { stdio: 'ignore' });
}

async function stop() {
  if (!server || server.exitCode !== null) return;
  const ended = new Promise<void>((resolve) => server.once('exit', () => resolve()));
  server.kill('SIGTERM');
  await ended;
}

beforeAll(async () => {
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('test port unavailable');
  port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  directory = await mkdtemp(join(tmpdir(), 'selfcontrol-redis-fault-'));
  config.redis.host = '127.0.0.1';
  config.redis.port = port;
  config.redis.password = undefined;
  config.redis.db = 0;
  launch();
  connection = new RedisConnection();
  connection.reconnectDelay = 20;
  await connection.connect();
  control = Redis.createClient({ socket: { host: '127.0.0.1', port } });
  control.on('error', () => undefined);
  await control.connect();
});

afterAll(async () => {
  if (control?.isOpen) await control.disconnect();
  if (connection) await connection.disconnect();
  await stop();
  Object.assign(config.redis, previous);
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('real Redis stop/restart updates readiness and preserves the same reconnecting SDK clients', async () => {
  const original = [connection.client, connection.publisher, connection.subscriber];
  expect(connection.isConnected).toBe(true);
  await stop();
  await vi.waitFor(() => {
    expect(connection.getConnectionStatus()).toMatchObject({
      isConnected: false, clientReady: false, publisherReady: false, subscriberReady: false
    });
  }, { timeout: 3000 });
  expect((await connection.healthCheck()).status).toBe('unhealthy');
  expect(() => connection.getClient()).toThrow('未连接');
  launch();
  await vi.waitFor(() => expect(connection.isConnected).toBe(true), { timeout: 5000 });
  expect([connection.client, connection.publisher, connection.subscriber]).toEqual(original);
  expect(await connection.getClient().ping()).toBe('PONG');
  await connection.getClient().set('restored-test', 'ready');
  expect(await connection.getClient().get('restored-test')).toBe('ready');
  expect((await connection.healthCheck()).status).toBe('healthy');
});

test('a publisher-only socket loss is observable while primary-client dedup remains usable', async () => {
  await vi.waitFor(() => expect(control.isReady).toBe(true), { timeout: 5000 });
  const name = `selfcontrol:${process.pid}:publisher`;
  const all = await control.clientList();
  const publisher = all.find((client) => client.name === name);
  expect(publisher).toBeDefined();
  // Capture the socket-loss event before its next successful handshake.
  const disconnected = new Promise<void>((resolve) => connection.publisher!.once('error', () => resolve()));
  await control.sendCommand(['CLIENT', 'KILL', 'ID', String(publisher!.id)]);
  await disconnected;
  expect(connection.isConnected).toBe(false);
  expect(connection.getConnectionStatus().publisherReady).toBe(false);
  expect(connection.getConnectionStatus().clientReady).toBe(true);
  expect(() => connection.getPublisher()).toThrow('未连接');
  expect(await connection.getClient().ping()).toBe('PONG');
  await vi.waitFor(() => expect(connection.isConnected).toBe(true), { timeout: 5000 });
  expect((await connection.healthCheck()).status).toBe('healthy');
});

test('Redis data loss restores the maintenance schedule and original reservation deadline', async () => {
  const service = new QueueService();
  const removeListener = connection.onReady(() => service.restoreAfterRedisReconnect());
  const deadlineAt = new Date(Date.now() + 120000);
  await AuxChain.create({ userId: 826001, chainId: 'socket-recovery-reservation', pendingReservation: {
    reservationId: 'res_socket_recovery', signal: '阅读', duration: 30, deadlineAt, status: 'pending'
  } });
  try {
    await service.initialize();
    expect(await service.maintenanceQueue!.getRepeatableJobs()).toHaveLength(2);
    expect(await service.reservationQueue!.getJob('res_socket_recovery')).not.toBeNull();
    await stop();
    await vi.waitFor(() => expect(connection.isConnected).toBe(false), { timeout: 3000 });
    launch();
    await vi.waitFor(() => expect(connection.isConnected).toBe(true), { timeout: 5000 });
    await vi.waitFor(async () => {
      expect(await service.maintenanceQueue!.getRepeatableJobs()).toHaveLength(2);
      const restored = await service.reservationQueue!.getJob('res_socket_recovery');
      expect(restored?.data.scheduledFor).toBe(deadlineAt.toISOString());
    }, { timeout: 5000 });
    expect((await AuxChain.findOne({ userId: 826001 }))?.pendingReservation?.deadlineAt).toEqual(deadlineAt);
  } finally {
    removeListener();
    await service.close();
  }
});

test('explicit connect recovers after the real SDK reconnect budget is exhausted', async () => {
  connection.maxReconnectAttempts = 0;
  await stop();
  await vi.waitFor(() => {
    expect([connection.client, connection.publisher, connection.subscriber].every((client) => !client?.isOpen))
      .toBe(true);
  }, { timeout: 5000 });
  expect(connection.isConnected).toBe(false);
  const old = connection.client;
  launch();
  connection.maxReconnectAttempts = 10;
  await connection.connect();
  expect(connection.client).not.toBe(old);
  expect(connection.isConnected).toBe(true);
  expect(await connection.getClient().ping()).toBe('PONG');
});
