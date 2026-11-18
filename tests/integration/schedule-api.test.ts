import express from 'express';
import request from 'supertest';
import moment from 'moment-timezone';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createScheduleRouter, isLoopbackAddress } from '../../src/routes/scheduleSync.js';
import ScheduleService from '../../src/services/ScheduleService.js';
import ScheduledPlan from '../../src/models/ScheduledPlan.js';
import User from '../../src/models/User.js';
import appInstance from '../../src/app.js';
import config from '../../config/index.js';

const token = 'test-secret-'.padEnd(64, 'a');
const owner = 88501;
function fixture(options: { token?: string; userId?: number; ready?: boolean } = {}) {
  const app = express();
  const service = new ScheduleService();
  app.use('/api/nautilus', createScheduleRouter(() => service,
    { token: options.token ?? token, userId: options.userId ?? owner }, () => options.ready ?? true));
  return app;
}
const input = () => ({
  source: 'nautilus', date: moment.tz('Asia/Shanghai').add(1, 'day').format('YYYY-MM-DD'), timezone: 'Asia/Shanghai',
  generatedAt: new Date().toISOString(),
  items: [{ title: 'API任务', kind: 'pinned', startMinute: 540, endMinute: 600 }]
});
beforeEach(async () => { await User.create({ userId: owner }); });

describe('authenticated local import', () => {
  test('authenticates before parsing input; invalid and missing tokens never write', async () => {
    const app = fixture();
    for (const auth of ['', 'Bearer incorrect', `Basic ${token}`]) {
      const response = await request(app).post('/api/nautilus/sync').set('authorization', auth)
        .set('content-type', 'application/json').send('{malformed');
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: '同步身份验证失败' });
    }
    expect(await ScheduledPlan.countDocuments()).toBe(0);
  });

  test('valid input creates a snapshot for the configured user, and duplicated input keeps the tokens', async () => {
    const app = fixture();
    const payload = input();
    const first = await request(app).post('/api/nautilus/sync').auth(token, { type: 'bearer' }).send(payload);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ date: payload.date, count: 1, pending: 1, queued: false });
    const persisted = (await ScheduledPlan.findOne({ userId: owner }))!;
    expect(persisted.items[0]?.title).toBe('API任务');
    expect(persisted.items[0]?.startAt.toISOString()).toBe(`${payload.date}T01:00:00.000Z`);
    const again = await request(app).post('/api/nautilus/sync').auth(token, { type: 'bearer' }).send(payload);
    expect(again.body.unchanged).toBe(true);
    expect((await ScheduledPlan.findOne())?.items[0]?.token).toBe(persisted.items[0]?.token);
    expect(await ScheduledPlan.countDocuments()).toBe(1);
  });

  test('cannot inject another owner, accepts only valid JSON and leaves no partial writes', async () => {
    const app = fixture();
    for (const payload of [{ ...input(), userId: 999 }, { ...input(), date: '2026-02-30' }, { items: [] }]) {
      const response = await request(app).post('/api/nautilus/sync').auth(token, { type: 'bearer' }).send(payload);
      expect(response.status).toBe(400);
      expect(response.body.error).toBeTypeOf('string');
    }
    const malformed = await request(app).post('/api/nautilus/sync').auth(token, { type: 'bearer' })
      .set('content-type', 'application/json').send('bad');
    expect(malformed.status).toBe(400);
    expect(await ScheduledPlan.countDocuments()).toBe(0);
  });

  test('disabled import and bot startup reject without leaking configuration', async () => {
    const disabled = await request(fixture({ token: '' })).post('/api/nautilus/sync')
      .auth(token, { type: 'bearer' }).send(input());
    expect(disabled.status).toBe(503);
    const starting = await request(fixture({ ready: false })).post('/api/nautilus/sync')
      .auth(token, { type: 'bearer' }).send(input());
    expect(starting.status).toBe(503);
    expect(await ScheduledPlan.countDocuments()).toBe(0);
  });

  test('loopback boundary is independent of forwarding headers', () => {
    expect(['127.0.0.1', '::1', '::ffff:127.0.0.1'].every(isLoopbackAddress)).toBe(true);
    expect(['192.0.2.10', '::ffff:192.0.2.10', 'localhost', '', undefined].some(isLoopbackAddress)).toBe(false);
  });

  test('the application mounts auth before its global parser and accepts authenticated snapshots', async () => {
    const previous = { ...config.security };
    const priorBot = appInstance.bot;
    config.security.scheduleSyncToken = token;
    config.security.scheduleSyncUserId = owner;
    appInstance.bot = { isRunning: true, scheduleService: new ScheduleService() } as never;
    vi.spyOn(appInstance.db, 'isConnected', 'get').mockReturnValue(true);
    vi.spyOn(appInstance.redis, 'isConnected', 'get').mockReturnValue(true);
    try {
      await appInstance.setupExpress();
      const noAuth = await request(appInstance.app).post('/api/nautilus/sync')
        .set('content-type', 'application/json').send('malformed');
      expect(noAuth.status).toBe(401);
      const imported = await request(appInstance.app).post('/api/nautilus/sync')
        .auth(token, { type: 'bearer' }).send(input());
      expect(imported.status).toBe(200);
      expect((await ScheduledPlan.findOne({ userId: owner }))?.items).toHaveLength(1);
    } finally {
      Object.assign(config.security, previous);
      appInstance.bot = priorBot;
      vi.restoreAllMocks();
    }
  });
});
