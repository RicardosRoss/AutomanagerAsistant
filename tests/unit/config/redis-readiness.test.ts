import { EventEmitter } from 'node:events';
import { beforeEach, expect, test, vi } from 'vitest';

const factory = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('redis', () => ({ default: factory }));
import redisConnection from '../../../src/config/redis.js';

function instance() {
  return new (redisConnection.constructor as new () => typeof redisConnection)();
}

function client(gate: Promise<void> = Promise.resolve()) {
  const value = Object.assign(new EventEmitter(), {
    isOpen: false, isReady: false,
    ping: vi.fn().mockResolvedValue('PONG'),
    connect: vi.fn(async () => {
      value.isOpen = true;
      value.emit('connect');
      await gate;
      if (!value.isOpen) throw new Error('connect cancelled');
      value.isReady = true;
      value.emit('ready');
      return value;
    }),
    disconnect: vi.fn(async () => {
      value.isOpen = false;
      value.isReady = false;
      value.emit('end');
    })
  });
  return value;
}

beforeEach(() => factory.createClient.mockReset());

test('connect events and open sockets do not count as ready, and concurrent connects share one attempt', async () => {
  const connection = instance();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const clients = [client(gate), client(gate), client(gate)];
  clients.forEach((value) => factory.createClient.mockReturnValueOnce(value));
  const first = connection.connect();
  await vi.waitFor(() => expect(factory.createClient).toHaveBeenCalledTimes(3));
  const second = connection.connect();
  let completed = false;
  void second.then(() => { completed = true; });
  try {
    await Promise.resolve();
    await Promise.resolve();
    expect(connection.isConnected).toBe(false);
    expect(completed).toBe(false);
    expect(() => connection.getClient()).toThrow('未连接');
  } finally {
    release();
    await Promise.all([first, second]);
  }
  expect(factory.createClient).toHaveBeenCalledTimes(3);
  expect(connection.isConnected).toBe(true);
  await connection.disconnect();
});

test('publisher or subscriber loss updates readiness and rejects their unready interfaces', async () => {
  const connection = instance();
  const clients = [client(), client(), client()];
  clients.forEach((value) => factory.createClient.mockReturnValueOnce(value));
  await connection.connect();
  clients[1]!.isReady = false;
  clients[1]!.emit('error', new Error('publisher socket closed'));
  expect(connection.isConnected).toBe(false);
  expect(() => connection.getPublisher()).toThrow('未连接');
  expect(connection.getClient()).toBe(clients[0]);
  clients[1]!.isReady = true;
  clients[2]!.isReady = false;
  expect(() => connection.getSubscriber()).toThrow('未连接');
  await connection.disconnect();
});

test('partial connect failure closes every created client instead of leaking the successful connections', async () => {
  const connection = instance();
  const clients = [client(), client(), client()];
  clients[1]!.connect.mockImplementationOnce(async () => { throw new Error('publisher handshake failed'); });
  clients.forEach((value) => factory.createClient.mockReturnValueOnce(value));
  await expect(connection.connect()).rejects.toThrow('publisher handshake failed');
  expect(clients[0]!.isOpen).toBe(false);
  expect(clients[2]!.isOpen).toBe(false);
  expect(connection.isConnected).toBe(false);
});

test('one disconnect failure does not stop the other clients from being closed', async () => {
  const connection = instance();
  const clients = [client(), client(), client()];
  clients.forEach((value) => factory.createClient.mockReturnValueOnce(value));
  await connection.connect();
  clients[0]!.disconnect.mockRejectedValueOnce(new Error('close failed'));
  await expect(connection.disconnect()).rejects.toThrow('close failed');
  expect(clients[1]!.disconnect).toHaveBeenCalledTimes(1);
  expect(clients[2]!.disconnect).toHaveBeenCalledTimes(1);
  expect(connection.isConnected).toBe(false);
});

test('disconnect cancels a pending handshake and the next attempt creates a fresh client set', async () => {
  const connection = instance();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const firstClients = [client(gate), client(gate), client(gate)];
  firstClients.forEach((value) => factory.createClient.mockReturnValueOnce(value));
  const connected = connection.connect().then(() => true, () => false);
  await vi.waitFor(() => expect(firstClients.every((value) => value.isOpen)).toBe(true));
  await connection.disconnect();
  expect(connection.isConnected).toBe(false);
  release();
  expect(await connected).toBe(false);
  const secondClients = [client(), client(), client()];
  secondClients.forEach((value) => factory.createClient.mockReturnValueOnce(value));
  await connection.connect();
  expect(factory.createClient).toHaveBeenCalledTimes(6);
  expect(connection.getClient()).toBe(secondClients[0]);
  expect(firstClients.every((value) => !value.isOpen)).toBe(true);
  await connection.disconnect();
});

test('reconnect budget is bounded for every SDK client', async () => {
  const connection = instance();
  connection.maxReconnectAttempts = 2;
  const clients = [client(), client(), client()];
  clients.forEach((value) => factory.createClient.mockReturnValueOnce(value));
  await connection.connect();
  for (const [options] of factory.createClient.mock.calls) {
    expect(options.disableOfflineQueue).toBe(true);
    expect(options.socket.connectTimeout).toBe(10000);
    expect(options.socket.reconnectStrategy(0)).toBe(1000);
    expect(options.socket.reconnectStrategy(2)).toBe(2000);
    expect(options.socket.reconnectStrategy(3)).toBeInstanceOf(Error);
  }
  await connection.disconnect();
});

test('a connect queued during a failed disconnect retries cleanup rather than inheriting the close error', async () => {
  const connection = instance();
  const clients = [client(), client(), client()];
  clients.forEach((value) => factory.createClient.mockReturnValueOnce(value));
  await connection.connect();
  let rejectClose!: (error: Error) => void;
  clients[0]!.disconnect.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
    rejectClose = reject;
  }));
  const closing = connection.disconnect().then(() => 'closed', () => 'close failed');
  const fresh = [client(), client(), client()];
  fresh.forEach((value) => factory.createClient.mockReturnValueOnce(value));
  const connecting = connection.connect();
  rejectClose(new Error('one close error'));
  expect(await closing).toBe('close failed');
  await connecting;
  expect(connection.isConnected).toBe(true);
  expect(connection.getClient()).toBe(fresh[0]);
  expect(clients[0]!.disconnect).toHaveBeenCalledTimes(2);
  await connection.disconnect();
});

test('ready recovery retries transient failure and removed listeners stay removed on reconnect', async () => {
  const connection = instance();
  const clients = [client(), client(), client()];
  clients.forEach((value) => factory.createClient.mockReturnValueOnce(value));
  const recover = vi.fn().mockRejectedValueOnce(new Error('Bull bootstrap transient failure'))
    .mockResolvedValue(undefined);
  const unsubscribe = connection.onReady(recover);
  await connection.connect();
  await vi.waitFor(() => expect(recover).toHaveBeenCalledTimes(2));
  clients[0]!.isReady = false;
  clients[0]!.emit('error', new Error('socket reset'));
  unsubscribe();
  clients[0]!.isReady = true;
  clients[0]!.emit('ready');
  await Promise.resolve();
  expect(recover).toHaveBeenCalledTimes(2);
  await connection.disconnect();
});
