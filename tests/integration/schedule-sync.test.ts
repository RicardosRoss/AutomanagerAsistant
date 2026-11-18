import moment from 'moment-timezone';
import { describe, expect, test, vi } from 'vitest';
import { User, TaskChain, MainChain, AuxChain } from '../../src/models/index.js';
import ScheduledPlan from '../../src/models/ScheduledPlan.js';
import ScheduleService from '../../src/services/ScheduleService.js';

function payload(offset = 0) {
  return {
    source: 'nautilus', date: moment.tz('Asia/Shanghai').add(1, 'day').format('YYYY-MM-DD'),
    timezone: 'Asia/Shanghai', generatedAt: new Date(Date.now() + offset).toISOString(),
    items: [
      { title: '阅读论文', kind: 'pinned', startMinute: 540, endMinute: 600 },
      { title: '写复盘', kind: 'flex', startMinute: 600, endMinute: 630 }
    ]
  };
}

describe('persistent schedule import', () => {
  test('idempotent sync persists one plan and never creates an actual task or commitment', async () => {
    await User.create({ userId: 88101 });
    const service = new ScheduleService();
    const input = payload();
    const first = await service.sync(88101, input);
    const plan = (await ScheduledPlan.findOne({ userId: 88101 }))!;
    const second = await service.sync(88101, input);
    const repeated = (await ScheduledPlan.findOne({ userId: 88101 }))!;
    expect(first).toMatchObject({ count: 2, pending: 2, queued: false });
    expect(second).toMatchObject({ unchanged: true, count: 2 });
    expect(await ScheduledPlan.countDocuments()).toBe(1);
    expect(repeated.items.map(item => item.token)).toEqual(plan.items.map(item => item.token));
    expect(plan.items[0]?.startAt.toISOString()).toBe(`${input.date}T01:00:00.000Z`);
    expect(await TaskChain.countDocuments()).toBe(0);
    expect(await MainChain.countDocuments()).toBe(0);
    expect(await AuxChain.countDocuments()).toBe(0);
  });

  test('resync changes only edited tokens and removes cancelled tasks and old buttons', async () => {
    await User.create({ userId: 88102 });
    const service = new ScheduleService();
    await service.sync(88102, payload());
    const old = (await ScheduledPlan.findOne({ userId: 88102 }))!;
    await ScheduledPlan.updateOne({ _id: old._id }, { $set: { 'items.1.status': 'sent', 'items.1.messageId': 91 } });
    const next = payload(1000);
    next.items[0]!.startMinute += 30;
    next.items[0]!.endMinute += 30;
    await service.sync(88102, next);
    const updated = (await ScheduledPlan.findOne({ userId: 88102 }))!;
    expect(updated.items[0]?.token).not.toBe(old.items[0]?.token);
    expect(updated.items[1]?.token).toBe(old.items[1]?.token);
    expect(updated.items[1]).toMatchObject({ status: 'sent', messageId: 91 });
    expect(await service.actionItem(88102, old.items[0]!.token)).toBeNull();
    await service.sync(88102, { ...payload(2000), items: [] });
    expect((await ScheduledPlan.findOne({ userId: 88102 }))?.items).toHaveLength(0);
    expect(await service.actionItem(88102, updated.items[1]!.token)).toBeNull();
  });

  test('competing initial imports preserve a unique day and stale snapshots cannot overwrite newer ones', async () => {
    await User.create({ userId: 88103 });
    const first = new ScheduleService();
    const second = new ScheduleService();
    await Promise.all([first.sync(88103, payload()), second.sync(88103, payload())]);
    expect(await ScheduledPlan.countDocuments({ userId: 88103 })).toBe(1);
    const newest = { ...payload(3000), items: [payload().items[0]] };
    await first.sync(88103, newest);
    await expect(second.sync(88103, payload())).rejects.toMatchObject({ status: 409 });
    expect((await ScheduledPlan.findOne({ userId: 88103 }))?.items).toHaveLength(1);
  });

  test('does not accept an unregistered owner or leave partial state on invalid input', async () => {
    const service = new ScheduleService();
    await expect(service.sync(88299, payload())).rejects.toMatchObject({ status: 403 });
    await User.create({ userId: 88104 });
    await expect(service.sync(88104, { ...payload(), date: '2026-02-30' })).rejects.toMatchObject({ status: 400 });
    expect(await ScheduledPlan.countDocuments()).toBe(0);
  });

  test('new items whose start has passed are persisted as expired without surprise catch-up messages', async () => {
    await User.create({ userId: 88105 });
    const service = new ScheduleService();
    const input = payload();
    input.date = moment.tz('Asia/Shanghai').format('YYYY-MM-DD');
    input.items = [{ title: '已过时间', kind: 'pinned', startMinute: 0, endMinute: 1 }];
    const result = await service.sync(88105, input);
    expect(result).toMatchObject({ expired: 1, pending: 0 });
    expect((await ScheduledPlan.findOne({ userId: 88105 }))?.items[0]?.status).toBe('expired');
  });

  test('distinguishable flex tasks keep a sent receipt when others are added or removed', async () => {
    await User.create({ userId: 88107 });
    const service = new ScheduleService();
    const input = payload();
    input.items = [
      { title: '读书·上午', kind: 'flex', startMinute: 540, endMinute: 600 },
      { title: '读书·下午', kind: 'flex', startMinute: 600, endMinute: 660 }
    ];
    await service.sync(88107, input);
    await ScheduledPlan.updateOne({ userId: 88107 }, { $set: { 'items.1.status': 'sent', 'items.1.messageId': 101 } });
    await service.sync(88107, { ...input, generatedAt: new Date(Date.now() + 1000).toISOString(),
      items: [{ ...input.items[1], startMinute: 540, endMinute: 600 }] });
    const remaining = (await ScheduledPlan.findOne())!.items[0]!;
    expect(remaining).toMatchObject({ status: 'sent', messageId: 101 });
    await service.sync(88107, { ...input, generatedAt: new Date(Date.now() + 2000).toISOString(), items: [
      { title: '读书·新任务', kind: 'flex', startMinute: 540, endMinute: 600 },
      { ...input.items[1], startMinute: 600, endMinute: 660 }
    ] });
    const final = (await ScheduledPlan.findOne())!.items;
    expect(final[0]?.status).toBe('pending');
    expect(final[1]).toMatchObject({ status: 'sent', messageId: 101 });
  });

  test('a delivery transition between read and replace is preserved by optimistic concurrency', async () => {
    await User.create({ userId: 88106 });
    const service = new ScheduleService();
    await service.sync(88106, payload());
    const original = ScheduledPlan.updateOne.bind(ScheduledPlan);
    let injected = false;
    const spy = vi.spyOn(ScheduledPlan, 'updateOne').mockImplementation(((filter: any, update: any, ...rest: any[]) => {
      if (!injected && filter.__v !== undefined) {
        injected = true;
        return (async () => {
          await original({ userId: 88106 }, {
            $set: { 'items.0.status': 'sent', 'items.0.messageId': 99 }, $inc: { __v: 1 }
          });
          return original(filter, update, ...rest);
        })() as never;
      }
      return original(filter, update, ...rest);
    }) as never);
    try {
      await service.sync(88106, payload(1000));
    } finally {
      spy.mockRestore();
    }
    expect((await ScheduledPlan.findOne({ userId: 88106 }))?.items[0]).toMatchObject({ status: 'sent', messageId: 99 });
  });
});
