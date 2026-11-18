import request from 'supertest';
import { afterEach, describe, expect, test, vi } from 'vitest';
import app from '../../src/app.js';
import { MainChain } from '../../src/models/index.js';

afterEach(() => vi.restoreAllMocks());

describe('application readiness', () => {
  test('HTTP is diagnostic while the bot is not ready, rather than always healthy', async () => {
    await app.setupExpress();
    app.bot = { isRunning: false } as never;
    vi.spyOn(app.db, 'isConnected', 'get').mockReturnValue(true);
    vi.spyOn(app.redis, 'isConnected', 'get').mockReturnValue(true);
    const pending = await request(app.app).get('/health');
    expect(pending.status).toBe(503);
    expect(pending.body).toMatchObject({ status: 'not_ready', bot: 'starting' });

    app.bot.isRunning = true;
    const ready = await request(app.app).get('/health');
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({ status: 'healthy', bot: 'running' });

    vi.spyOn(app.redis, 'isConnected', 'get').mockReturnValue(false);
    const disconnected = await request(app.app).get('/health');
    expect(disconnected.status).toBe(503);
    expect(disconnected.body.redis).toBe('disconnected');
  });

  test('opens diagnostics and installs shutdown handlers before waiting on external startup', async () => {
    const order: string[] = [];
    for (const method of [
      'connectDatabase', 'connectRedis', 'warmupContentNames', 'setupExpress', 'startBot', 'startServer'
    ] as const) {
      vi.spyOn(app, method).mockImplementation(async () => { order.push(method); });
    }
    vi.spyOn(app, 'setupGracefulShutdown').mockImplementation(() => { order.push('shutdownHandlers'); });
    await app.initialize();
    expect(order.indexOf('startServer')).toBeLessThan(order.indexOf('startBot'));
    expect(order.indexOf('shutdownHandlers')).toBeLessThan(order.indexOf('connectDatabase'));
  });

  test('does not start the bot until registered model indexes are ready', async () => {
    app.bot = null;
    vi.spyOn(app.db, 'connect').mockResolvedValue({} as never);
    let release!: () => void;
    const gate = new Promise<any>((resolve) => { release = () => resolve(MainChain); });
    const indexes = vi.spyOn(MainChain, 'init').mockReturnValue(gate);
    for (const method of ['setupExpress', 'startServer', 'connectRedis', 'warmupContentNames'] as const) {
      vi.spyOn(app, method).mockResolvedValue(undefined);
    }
    vi.spyOn(app, 'setupGracefulShutdown').mockImplementation(() => undefined);
    const start = vi.spyOn(app, 'startBot').mockResolvedValue(undefined);
    const initializing = app.initialize();
    try {
      await vi.waitFor(() => expect(indexes).toHaveBeenCalled());
      expect(start).not.toHaveBeenCalled();
    } finally {
      release();
      await initializing;
    }
    expect(start).toHaveBeenCalledTimes(1);
  });

  test('model index initialization failure shuts down without opening Telegram processing', async () => {
    app.bot = null;
    vi.spyOn(app.db, 'connect').mockResolvedValue({} as never);
    vi.spyOn(MainChain, 'init').mockRejectedValue(new Error('index initialization conflict'));
    vi.spyOn(app, 'setupExpress').mockResolvedValue(undefined);
    vi.spyOn(app, 'startServer').mockResolvedValue(undefined);
    vi.spyOn(app, 'setupGracefulShutdown').mockImplementation(() => undefined);
    const start = vi.spyOn(app, 'startBot').mockResolvedValue(undefined);
    const stop = vi.spyOn(app, 'shutdown').mockResolvedValue(undefined);
    await app.initialize();
    expect(start).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledWith(1);
  });
});
