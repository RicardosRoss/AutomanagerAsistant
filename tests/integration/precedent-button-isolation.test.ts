import { expect, test, vi } from 'vitest';
import SelfControlBot from '../../src/bot.js';
import { AuxChain, MainChain, PrecedentRule, TaskChain, User } from '../../src/models/index.js';
import PrecedentService from '../../src/services/PrecedentService.js';
import AuxiliaryRulesService from '../../src/services/AuxiliaryRulesService.js';

function fixture() {
  const bot = new SelfControlBot();
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
  const transport = { sendMessage };
  bot.bot = transport as never;
  (bot as unknown as { initializeHandlers: (value: unknown) => void }).initializeHandlers(transport);
  vi.spyOn(bot.queueService, 'cancelReservation').mockResolvedValue(false);
  vi.spyOn(bot.queueService, 'rescheduleReservation').mockResolvedValue('test-job');
  vi.spyOn(bot.queueService, 'cancelTaskReminders').mockResolvedValue(0);
  return { bot, sendMessage };
}

function button(sendMessage: ReturnType<typeof vi.fn>, prefix: string): string {
  const options = sendMessage.mock.calls.at(-1)?.[2];
  const found = options?.reply_markup.inline_keyboard.flat().find((entry: { callback_data: string }) =>
    entry.callback_data.startsWith(prefix));
  if (!found) throw new Error('decision button missing');
  expect(Buffer.byteLength(found.callback_data)).toBeLessThanOrEqual(64);
  return found.callback_data;
}

async function main(userId: number, chainId: string) {
  await User.findOrCreate({ userId });
  await MainChain.create({ userId, chainId, sacredMarker: { type: 'seat', label: '确认开始' }, nodes: [] });
}

test('old main-chain buttons cannot decide a new violation in the same chain', async () => {
  const { bot, sendMessage } = fixture();
  await main(822001, 'isolation-main-one');
  await bot.handleViolationCommand(822001, '回复消息');
  const oldBreak = button(sendMessage, 'main_violation:break_chain');
  const allow = button(sendMessage, 'main_violation:allow_forever');
  await bot.handleQuickCallback(822001, allow);
  await bot.handleViolationCommand(822001, '刷视频');
  await bot.handleQuickCallback(822001, oldBreak);
  const current = (await MainChain.findOne({ userId: 822001 }))!;
  expect(current.status).toBe('active');
  expect(current.pendingViolation?.behaviorKey).toBe('刷视频');
  expect(await PrecedentRule.countDocuments({ userId: 822001 })).toBe(1);
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('过期');
});

test('old main-chain buttons cannot allow a violation in a newly-created chain', async () => {
  const { bot, sendMessage } = fixture();
  await main(822002, 'isolation-main-old');
  await bot.handleViolationCommand(822002, '回复消息');
  const oldAllow = button(sendMessage, 'main_violation:allow_forever');
  await bot.handleQuickCallback(822002, button(sendMessage, 'main_violation:break_chain'));
  await main(822002, 'isolation-main-new');
  await bot.handleViolationCommand(822002, '回复消息');
  await bot.handleQuickCallback(822002, oldAllow);
  expect((await MainChain.findOne({ chainId: 'isolation-main-new' }))?.pendingViolation).toBeDefined();
  expect(await PrecedentRule.countDocuments({ userId: 822002 })).toBe(0);
});

test('an auxiliary delay button cannot resolve the later cancellation decision on the same reservation', async () => {
  const { bot, sendMessage } = fixture();
  await bot.ctdpService.createReservation(822003, '阅读', 30, 'same-reservation');
  await bot.ctdpService.requestAuxiliaryViolation(822003, 'same-reservation', 'delay_reservation_5', 5);
  await bot.taskHandlers!.sendAuxiliaryDecision(822003, 'same-reservation');
  const oldBreak = button(sendMessage, 'aux_decide:break_chain');
  await bot.handleQuickCallback(822003, button(sendMessage, 'aux_decide:allow_forever'));
  await bot.ctdpService.requestAuxiliaryViolation(822003, 'same-reservation', 'cancel_reservation');
  await bot.taskHandlers!.sendAuxiliaryDecision(822003, 'same-reservation');
  const newBreak = button(sendMessage, 'aux_decide:break_chain');
  expect(newBreak).not.toBe(oldBreak);
  await bot.handleQuickCallback(822003, oldBreak);
  const pending = (await AuxChain.findOne({ userId: 822003 }))!;
  expect(pending.status).toBe('active');
  expect(pending.pendingDecision?.behaviorKey).toBe('cancel_reservation');
  expect(pending.reservationHistory).toHaveLength(1);
  await bot.handleQuickCallback(822003, newBreak);
  const completed = (await AuxChain.findOne({ userId: 822003 }))!;
  expect(completed.status).toBe('inactive');
  expect(completed.reservationHistory).toHaveLength(2);
});

test('an unbound legacy button cannot mutate a current violation', async () => {
  const { bot, sendMessage } = fixture();
  await main(822004, 'isolation-legacy');
  await bot.handleViolationCommand(822004, '刷手机');
  await bot.handleQuickCallback(822004, 'main_violation:break_chain');
  expect((await MainChain.findOne({ userId: 822004 }))?.status).toBe('active');
  expect((await MainChain.findOne({ userId: 822004 }))?.pendingViolation).toBeDefined();
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('过期');
  expect(await TaskChain.countDocuments({ userId: 822004 })).toBe(0);
});

test('a repeated report displays the existing pending behavior rather than a different new input', async () => {
  const { bot, sendMessage } = fixture();
  await main(822005, 'isolation-display');
  await bot.handleViolationCommand(822005, '原行为：[学习]'.repeat(10));
  const first = button(sendMessage, 'main_violation:allow_forever');
  await bot.handleViolationCommand(822005, '后来输入的其他行为');
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('原行为：[学习]');
  expect(sendMessage.mock.calls.at(-1)?.[1]).not.toContain('后来输入的其他行为');
  expect(button(sendMessage, 'main_violation:allow_forever')).toBe(first);
  await bot.handleViolationCommand(822005, '过长输入'.repeat(100));
  expect(button(sendMessage, 'main_violation:allow_forever')).toBe(first);
});

test('an old auxiliary-chain token cannot affect the next auxiliary chain lifecycle', async () => {
  const { bot, sendMessage } = fixture();
  await bot.ctdpService.createReservation(822010, '阅读', 30, 'old-aux-life');
  await bot.ctdpService.requestAuxiliaryViolation(822010, 'old-aux-life', 'cancel_reservation');
  await bot.taskHandlers!.sendAuxiliaryDecision(822010, 'old-aux-life');
  const oldAllow = button(sendMessage, 'aux_decide:allow_forever');
  await bot.handleQuickCallback(822010, button(sendMessage, 'aux_decide:break_chain'));
  await bot.ctdpService.createReservation(822010, '学习：[章节]'.repeat(50), 30, 'new-aux-life');
  await bot.ctdpService.requestAuxiliaryViolation(822010, 'new-aux-life', 'cancel_reservation');
  await bot.taskHandlers!.sendAuxiliaryDecision(822010, 'new-aux-life');
  expect(button(sendMessage, 'aux_decide:allow_forever')).not.toBe(oldAllow);
  await bot.handleQuickCallback(822010, oldAllow);
  const current = (await AuxChain.findOne({ userId: 822010, status: 'active' }))!;
  expect(current.pendingReservation?.reservationId).toBe('new-aux-life');
  expect(current.pendingDecision).toBeDefined();
  expect(await PrecedentRule.countDocuments({ userId: 822010 })).toBe(0);
});

test('a violation replacement between snapshot read and claim cannot be resolved with the old token', async () => {
  const { bot } = fixture();
  await main(822011, 'isolation-snapshot');
  const first = await bot.mainViolationService.report(822011, '行为A');
  const token = first.pending!.decisionToken!;
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { reached = resolve; });
  const original = MainChain.findOne.bind(MainChain);
  const snapshot = vi.spyOn(MainChain, 'findOne').mockImplementationOnce((async (filter: any) => {
    const doc = await original(filter);
    reached();
    await gate;
    return doc;
  }) as any);
  const stale = bot.mainViolationService.resolve(822011, 'break_chain', token)
    .then(() => 'success', (error: Error) => error.message);
  await entered;
  try {
    await bot.mainViolationService.resolve(822011, 'allow_forever', token);
    await bot.mainViolationService.report(822011, '行为B');
    release();
    expect(await stale).toContain('过期');
    const current = (await MainChain.findOne({ userId: 822011 }))!;
    expect(current.status).toBe('active');
    expect(current.pendingViolation?.behaviorKey).toBe('行为B');
    expect(current.pendingViolation?.decisionToken).not.toBe(token);
  } finally {
    release();
    await stale;
    snapshot.mockRestore();
  }
});

test('an auxiliary decision replacement between snapshot and claim rejects the old token', async () => {
  const { bot } = fixture();
  await bot.ctdpService.createReservation(822012, '阅读', 30, 'snapshot-aux');
  const first = await bot.ctdpService.requestAuxiliaryViolation(822012, 'snapshot-aux', 'delay_reservation_5', 5);
  const token = first.pendingDecision!.decisionToken!;
  const service = new AuxiliaryRulesService(bot.queueService);
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { reached = resolve; });
  const original = AuxChain.findOne.bind(AuxChain);
  const snapshot = vi.spyOn(AuxChain, 'findOne').mockImplementationOnce((async (filter: any) => {
    const doc = await original(filter);
    reached();
    await gate;
    return doc;
  }) as any);
  const stale = service.resolve(822012, 'snapshot-aux', 'break_chain', token)
    .then(() => 'success', (error: Error) => error.message);
  await entered;
  try {
    await service.resolve(822012, 'snapshot-aux', 'allow_forever', token);
    await bot.ctdpService.requestAuxiliaryViolation(822012, 'snapshot-aux', 'cancel_reservation');
    release();
    expect(await stale).toContain('过期');
    const current = (await AuxChain.findOne({ userId: 822012 }))!;
    expect(current.status).toBe('active');
    expect(current.pendingDecision?.behaviorKey).toBe('cancel_reservation');
    expect(current.reservationHistory).toHaveLength(1);
  } finally {
    release();
    await stale;
    snapshot.mockRestore();
  }
});

test('legacy pending records get stable bound buttons and another user cannot use them', async () => {
  const { bot, sendMessage } = fixture();
  await main(822006, 'isolation-legacy-record');
  const reportedAt = new Date();
  await MainChain.updateOne({ userId: 822006 }, { $set: {
    pendingViolation: { behaviorKey: '旧待判例', reportedAt }
  } });
  await bot.handleViolationCommand(822006, '');
  const mainAllow = button(sendMessage, 'main_violation:allow_forever');
  await bot.handleViolationCommand(822006, '');
  expect(button(sendMessage, 'main_violation:allow_forever')).toBe(mainAllow);
  expect((await MainChain.findOne({ userId: 822006 }))?.pendingViolation?.reportedAt).toEqual(reportedAt);
  await bot.handleQuickCallback(822007, mainAllow);
  expect((await MainChain.findOne({ userId: 822006 }))?.pendingViolation).toBeDefined();

  await AuxChain.create({ userId: 822006, chainId: 'legacy-aux-record', pendingReservation: {
    reservationId: 'legacy-res', deadlineAt: new Date(Date.now() + 600000), status: 'pending'
  }, pendingDecision: { behaviorKey: 'cancel_reservation' } });
  await bot.taskHandlers!.sendAuxiliaryDecision(822006, 'legacy-res');
  const auxAllow = button(sendMessage, 'aux_decide:allow_forever');
  await bot.taskHandlers!.sendAuxiliaryDecision(822006, 'legacy-res');
  expect(button(sendMessage, 'aux_decide:allow_forever')).toBe(auxAllow);
  await bot.handleQuickCallback(822007, auxAllow);
  await bot.handleQuickCallback(822006, 'aux_decide:break_chain:legacy-res');
  expect((await AuxChain.findOne({ userId: 822006 }))?.status).toBe('active');
  expect((await AuxChain.findOne({ userId: 822006 }))?.pendingDecision).toBeDefined();
});

test('allowing a main violation cannot overwrite progress persisted while the rule is being saved', async () => {
  const { bot } = fixture();
  await main(822008, 'isolation-progress');
  await bot.mainViolationService.report(822008, '回复消息');
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { reached = resolve; });
  const original = PrecedentService.prototype.allowForever;
  const rule = vi.spyOn(PrecedentService.prototype, 'allowForever')
    .mockImplementationOnce(async function (this: any, input) {
    reached();
    await gate;
    return original.call(this, input);
  });
  const allowed = bot.mainViolationService.resolve(822008, 'allow_forever');
  await entered;
  try {
    await MainChain.updateOne({ userId: 822008 }, { $set: {
      nodes: [{ nodeNo: 1, level: 'unit', taskId: 'persisted-progress', status: 'completed' }],
      'levelCounters.unit': 1
    } });
  } finally {
    release();
    await allowed;
    rule.mockRestore();
  }
  const updated = (await MainChain.findOne({ userId: 822008 }))!;
  expect(updated.nodes).toHaveLength(1);
  expect(updated.levelCounters.unit).toBe(1);
  expect(updated.pendingViolation).toBeUndefined();
});

test('an in-flight allow decision cannot revive a chain broken by another operation', async () => {
  const { bot } = fixture();
  await main(822009, 'isolation-broken');
  await bot.mainViolationService.report(822009, '回复消息');
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { reached = resolve; });
  const original = PrecedentService.prototype.allowForever;
  const rule = vi.spyOn(PrecedentService.prototype, 'allowForever')
    .mockImplementationOnce(async function (this: any, input) {
    reached();
    await gate;
    return original.call(this, input);
  });
  const result = bot.mainViolationService.resolve(822009, 'allow_forever').then(() => true, () => false);
  await entered;
  try {
    await MainChain.updateOne({ userId: 822009 }, { $set: { status: 'broken' } });
    release();
    expect(await result).toBe(false);
    expect((await MainChain.findOne({ userId: 822009 }))?.status).toBe('broken');
  } finally {
    release();
    await result;
    rule.mockRestore();
  }
});
