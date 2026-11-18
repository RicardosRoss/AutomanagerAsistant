import moment from 'moment-timezone';
import { afterEach, describe, expect, test, vi } from 'vitest';
import User from '../../src/models/User.js';
import ScheduledPlan from '../../src/models/ScheduledPlan.js';
import TaskDraft from '../../src/models/TaskDraft.js';
import { TaskChain, MainChain, AuxChain } from '../../src/models/index.js';
import ScheduleService from '../../src/services/ScheduleService.js';
import ScheduleCommandHandlers from '../../src/handlers/scheduleCommands.js';
import TaskDraftHandlers from '../../src/handlers/taskDraftCommands.js';

afterEach(() => vi.restoreAllMocks());

async function fixture(userId = 88301) {
  await User.create({ userId });
  const sender = vi.fn().mockResolvedValue({ message_id: 713 });
  const service = new ScheduleService(sender);
  await service.sync(userId, {
    source: 'nautilus', date: moment.tz('Asia/Shanghai').format('YYYY-MM-DD'), timezone: 'Asia/Shanghai',
    generatedAt: new Date().toISOString(),
    items: [{ title: '读论文_方法*部分', kind: 'pinned', startMinute: 0, endMinute: 1440 }]
  });
  await ScheduledPlan.updateOne({ userId }, { $set: {
    'items.0.status': 'pending', 'items.0.startAt': new Date(Date.now() - 1000),
    'items.0.endAt': new Date(Date.now() + 60 * 60 * 1000)
  } });
  const plan = (await ScheduledPlan.findOne({ userId }))!;
  return { service, sender, token: plan.items[0]!.token, userId };
}

describe('schedule reminder delivery', () => {
  test('competing workers deliver once and persist a receipt without creating commitments', async () => {
    const { service, sender, token } = await fixture();
    await Promise.all([service.deliver(token), new ScheduleService(sender).deliver(token)]);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender.mock.calls[0]?.[1]).toContain('该开始了');
    expect(sender.mock.calls[0]?.[1]).toContain('读论文_方法*部分');
    expect(sender.mock.calls[0]?.[2].parse_mode).toBeUndefined();
    const keyboard = sender.mock.calls[0]?.[2].reply_markup.inline_keyboard.flat();
    expect(keyboard.map((button: any) => button.callback_data)).toEqual([
      `schedule:${token}:start`, `schedule:${token}:reserve`, `schedule:${token}:dismiss`
    ]);
    expect((await ScheduledPlan.findOne())?.items[0]).toMatchObject({ status: 'sent', messageId: 713, attempts: 1 });
    expect(await TaskChain.countDocuments()).toBe(0);
    expect(await MainChain.countDocuments()).toBe(0);
    expect(await AuxChain.countDocuments()).toBe(0);
    await service.deliver(token);
    expect(sender).toHaveBeenCalledTimes(1);
  });

  test('early, removed, ended and excessively late reminders are not sent', async () => {
    const { service, sender, token, userId } = await fixture(88302);
    await ScheduledPlan.updateOne({ userId }, { $set: { 'items.0.startAt': new Date(Date.now() + 10000) } });
    await service.deliver(token);
    expect(sender).not.toHaveBeenCalled();
    await ScheduledPlan.updateOne({ userId }, { $set: { 'items.0.startAt': new Date(Date.now() - 16 * 60000) } });
    await service.deliver(token);
    expect((await ScheduledPlan.findOne())?.items[0]?.status).toBe('expired');
    expect(sender).not.toHaveBeenCalled();
    await ScheduledPlan.updateOne({ userId }, { $set: { items: [] } });
    await service.deliver(token);
    expect(sender).not.toHaveBeenCalled();
  });

  test('only explicit Telegram rate limiting can retry; unknown transport outcomes cannot duplicate', async () => {
    const { service, sender, token, userId } = await fixture(88303);
    sender.mockRejectedValueOnce({ response: { body: { ok: false, error_code: 429,
      parameters: { retry_after: 1 } } } });
    await service.deliver(token);
    expect((await ScheduledPlan.findOne())?.items[0]?.status).toBe('pending');
    await service.deliver(token);
    expect(sender).toHaveBeenCalledTimes(1);
    await ScheduledPlan.updateOne({ userId }, { $unset: { 'items.0.retryAt': '' } });
    sender.mockRejectedValueOnce(new Error('ETIMEDOUT'));
    await service.deliver(token);
    expect((await ScheduledPlan.findOne())?.items[0]?.status).toBe('unknown');
    await service.deliver(token);
    expect(sender).toHaveBeenCalledTimes(2);
  });

  test.each([
    [{ response: { body: { ok: false, error_code: 403 } } }, 'failed'],
    [{ response: { body: { ok: false, error_code: 502 } } }, 'unknown'],
    [new Error('socket hang up'), 'unknown']
  ])('records a bounded failure state for %j', async (failure, expected) => {
    const { service, sender, token } = await fixture(88304);
    sender.mockRejectedValue(failure);
    await service.deliver(token);
    expect((await ScheduledPlan.findOne())?.items[0]?.status).toBe(expected);
    await service.deliver(token);
    expect(sender).toHaveBeenCalledTimes(1);
  });

  test('malformed receipts never result in automatic second sends', async () => {
    const { service, sender, token } = await fixture(88305);
    sender.mockResolvedValueOnce({});
    await service.deliver(token);
    expect((await ScheduledPlan.findOne())?.items[0]?.status).toBe('unknown');
    expect(sender).toHaveBeenCalledTimes(1);
    await service.deliver(token);
    expect(sender).toHaveBeenCalledTimes(1);
  });

  test('a DB failure after send leaves a durable claim and a retry does not send again', async () => {
    const { service, sender, token } = await fixture(88307);
    const spy = vi.spyOn(ScheduledPlan, 'updateOne').mockRejectedValueOnce(new Error('database disconnected'));
    await expect(service.deliver(token)).rejects.toThrow('database disconnected');
    spy.mockRestore();
    expect((await ScheduledPlan.findOne())?.items[0]?.status).toBe('sending');
    await service.deliver(token);
    expect(sender).toHaveBeenCalledTimes(1);
  });

  test('a changed snapshot during the delivery claim prevents dispatch of the removed token', async () => {
    const { service, sender, token, userId } = await fixture(88306);
    const original = ScheduledPlan.findOneAndUpdate.bind(ScheduledPlan);
    const spy = vi.spyOn(ScheduledPlan, 'findOneAndUpdate').mockImplementation(((...args: any[]) => {
      return { lean: async () => {
        const result = await original(...args as [any, any, any]).lean();
        if (result) await ScheduledPlan.updateOne({ userId }, { $set: { items: [] }, $inc: { __v: 1 } });
        return result;
      } } as never;
    }) as never);
    try { await service.deliver(token); } finally { spy.mockRestore(); }
    expect(sender).not.toHaveBeenCalled();
  });
});

describe('schedule buttons and preparation boundary', () => {
  test.each(['sent', 'expired', 'failed', 'unknown', 'pending', 'sending'] as const)(
    'an overdue %s reminder remains available for preparation and explicit dismissal', async status => {
      const { service, token, userId, sender } = await fixture(88320);
      await ScheduledPlan.updateOne({ userId }, { $set: {
        'items.0.status': status,
        'items.0.startAt': new Date(Date.now() - 120 * 60000),
        'items.0.endAt': new Date(Date.now() - 60 * 60000),
        'items.0.startMinute': 540, 'items.0.endMinute': 600
      } });
      const bot = { sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }) };
      const commands = { handleTaskCommand: vi.fn(), handleReserveCommand: vi.fn() };
      const drafts = new TaskDraftHandlers(bot as never, commands as never);
      const handlers = new ScheduleCommandHandlers(bot as never, service, drafts);

      await handlers.handleCommand(userId, '');
      const listing = bot.sendMessage.mock.calls.at(-1)!;
      const buttons = listing[2].reply_markup.inline_keyboard.flat();
      expect(buttons.map((button: any) => button.callback_data)).toEqual([
        `schedule:${token}:start`, `schedule:${token}:reserve`, `schedule:${token}:dismiss`
      ]);
      expect(listing[1]).toContain('待处理');
      expect(listing[1]).not.toContain('已过期');

      await handlers.handleCallback(userId, `schedule:${token}:start`);
      expect(await TaskDraft.findOne({ userId }).lean()).toMatchObject({
        description: '读论文_方法*部分', duration: 60, mode: 'start', stage: 'ready'
      });
      await handlers.handleCallback(userId, `schedule:${token}:reserve`);
      expect(await TaskDraft.findOne({ userId }).lean()).toMatchObject({ duration: 60, mode: 'reserve' });
      expect(await TaskDraft.countDocuments({ userId })).toBe(1);
      expect(commands.handleTaskCommand).not.toHaveBeenCalled();
      expect(commands.handleReserveCommand).not.toHaveBeenCalled();

      const dismissals = await Promise.all([service.dismiss(userId, token), service.dismiss(userId, token)]);
      expect(dismissals.filter(Boolean)).toHaveLength(1);
      expect(await service.actionItem(userId, token)).toBeNull();
      expect(await service.dismiss(userId, token)).toBe(false);
      expect((await ScheduledPlan.findOne({ userId }))?.items[0]?.status).toBe('dismissed');
      expect(sender).not.toHaveBeenCalled();
      expect(await MainChain.countDocuments()).toBe(0);
      expect(await AuxChain.countDocuments()).toBe(0);
    }
  );

  test('overdue reminders reject other owners, malformed tokens and removed snapshots', async () => {
    const { service, token, userId } = await fixture(88321);
    await ScheduledPlan.updateOne({ userId }, { $set: {
      'items.0.status': 'expired', 'items.0.endAt': new Date(Date.now() - 60000)
    } });
    expect(await service.actionItem(userId + 1, token)).toBeNull();
    expect(await service.dismiss(userId + 1, token)).toBe(false);
    expect(await service.actionItem(userId, 'invalid')).toBeNull();
    expect((await ScheduledPlan.findOne({ userId }))?.items[0]?.status).toBe('expired');
    await ScheduledPlan.updateOne({ userId }, { $set: { items: [] } });
    expect(await service.actionItem(userId, token)).toBeNull();
    expect(await service.dismiss(userId, token)).toBe(false);
    expect(await TaskDraft.countDocuments()).toBe(0);
  });

  test('an expired reminder stays actionable across identical resync without being delivered again', async () => {
    const userId = 88322;
    await User.create({ userId });
    const sender = vi.fn().mockResolvedValue({ message_id: 713 });
    const service = new ScheduleService(sender);
    const snapshot = {
      source: 'nautilus', date: moment.tz('Asia/Shanghai').format('YYYY-MM-DD'), timezone: 'Asia/Shanghai',
      generatedAt: new Date().toISOString(),
      items: [{ title: '错过的任务B', kind: 'flex', startMinute: 0, endMinute: 1 }]
    };
    await service.sync(userId, snapshot);
    const original = (await ScheduledPlan.findOne({ userId }))!.items[0]!;
    expect(original.status).toBe('expired');
    await service.sync(userId, snapshot);
    expect(await service.actionItem(userId, original.token)).toMatchObject({ title: '错过的任务B' });
    await service.deliver(original.token);
    expect(sender).not.toHaveBeenCalled();
    expect((await ScheduledPlan.findOne({ userId }))?.items[0]?.token).toBe(original.token);
  });

  test('only the owner may prepare; confirmation remains required; the schedule duration is prefilled', async () => {
    const { service, token, userId } = await fixture(88311);
    const bot = { sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }) };
    const commands = { handleTaskCommand: vi.fn(), handleReserveCommand: vi.fn() };
    const drafts = new TaskDraftHandlers(bot as never, commands as never);
    const handlers = new ScheduleCommandHandlers(bot as never, service, drafts);
    await handlers.handleCallback(88399, `schedule:${token}:start`);
    expect(await TaskDraft.countDocuments()).toBe(0);
    await handlers.handleCallback(userId, `schedule:${token}:reserve`);
    expect((await TaskDraft.findOne({ userId }))?.mode).toBe('reserve');
    expect((await TaskDraft.findOne({ userId }))?.duration).toBe(480);
    expect(commands.handleTaskCommand).not.toHaveBeenCalled();
    expect(commands.handleReserveCommand).not.toHaveBeenCalled();
    expect(await AuxChain.countDocuments()).toBe(0);
    const draft = (await TaskDraft.findOne({ userId }))!;
    await drafts.handleCallback(userId, `draft:${draft.token}:confirm`);
    expect(commands.handleReserveCommand).toHaveBeenCalledWith(userId, '读论文_方法*部分 480', draft.token);
  });

  test('dismiss and stale buttons cannot affect chains or create drafts', async () => {
    const { service, token, userId } = await fixture(88312);
    const bot = { sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }) };
    const drafts = { begin: vi.fn() };
    const handlers = new ScheduleCommandHandlers(bot as never, service, drafts as never);
    await handlers.handleCallback(userId, `schedule:${token}:dismiss`);
    await handlers.handleCallback(userId, `schedule:${token}:start`);
    await handlers.handleCallback(userId, `schedule:${token}:reserve:extra`);
    expect(drafts.begin).not.toHaveBeenCalled();
    expect((await ScheduledPlan.findOne())?.items[0]?.status).toBe('dismissed');
    expect(await MainChain.countDocuments()).toBe(0);
    expect(await AuxChain.countDocuments()).toBe(0);
  });
});
