import { beforeEach, expect, test, vi } from 'vitest';
import SelfControlBot from '../../src/bot.js';
import TaskDraft from '../../src/models/TaskDraft.js';
import { AuxChain, MainChain, TaskChain, User } from '../../src/models/index.js';
import PatternTree from '../../src/models/PatternTree.js';

beforeEach(() => {
  vi.restoreAllMocks();
  (SelfControlBot as unknown as { processedUpdateCache: Map<string, number> }).processedUpdateCache.clear();
});

function fixture() {
  const bot = new SelfControlBot();
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
  const transport = { sendMessage, answerCallbackQuery: vi.fn().mockResolvedValue(true) };
  bot.bot = transport as never;
  (bot as any).initializeHandlers(transport);
  vi.spyOn(bot.queueService, 'addReminder').mockResolvedValue('reminder');
  vi.spyOn(bot.queueService, 'scheduleReservation').mockResolvedValue('reservation');
  vi.spyOn(bot.queueService, 'cancelReservation').mockResolvedValue(true);
  const callbacks = () => (sendMessage.mock.calls.at(-1)?.[2]?.reply_markup?.inline_keyboard ?? [])
    .flat().map((button: any) => button.callback_data);
  return { bot, sendMessage, callbacks };
}

test('status finds the prepared draft and resumes its original content and duration without committing', async () => {
  const userId = 837001;
  await User.create({ userId });
  const { bot, sendMessage, callbacks } = fixture();
  await bot.draftHandlers!.begin(userId, 'reserve', '阅读：[原来的章节]_笔记');
  const draft = (await TaskDraft.findOne({ userId }))!;
  await bot.draftHandlers!.handleCallback(userId, `draft:${draft.token}:duration90`);
  const prepared = (await TaskDraft.collection.findOne({ userId }))!;
  await bot.coreHandlers!.handleStatusCommand(userId);
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('准备中的预约');
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('尚未建立承诺');
  expect(callbacks()).toContain(`draft:${draft.token}:resume`);
  expect(callbacks()).not.toContain('quick_task');
  await bot.handleQuickCallback(userId, `draft:${draft.token}:resume`);
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain(prepared.description);
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('90 分钟');
  expect(await TaskDraft.collection.findOne({ userId })).toEqual(prepared);
  expect(await AuxChain.countDocuments()).toBe(0);
  expect(await TaskChain.countDocuments()).toBe(0);
});

test('reopening the same preparation keeps the token, duration and original expiry', async () => {
  const userId = 837002;
  const { bot, sendMessage } = fixture();
  await bot.draftHandlers!.begin(userId, 'reserve', '之前写好的材料');
  const draft = (await TaskDraft.findOne({ userId }))!;
  await bot.draftHandlers!.handleCallback(userId, `draft:${draft.token}:duration30`);
  const original = await TaskDraft.collection.findOne({ userId });
  await bot.draftHandlers!.begin(userId, 'reserve');
  expect(await TaskDraft.collection.findOne({ userId })).toEqual(original);
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('之前写好的材料');
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('30 分钟');
});

test('an unfilled draft stays available from status even before account initialization', async () => {
  const userId = 837003;
  const { bot, callbacks, sendMessage } = fixture();
  await bot.draftHandlers!.begin(userId, 'reserve');
  const draft = (await TaskDraft.findOne({ userId }))!;
  await bot.coreHandlers!.handleStatusCommand(userId);
  expect(callbacks()).toContain(`draft:${draft.token}:resume`);
  await bot.handleQuickCallback(userId, `draft:${draft.token}:resume`);
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('直接回复');
  expect(await User.countDocuments()).toBe(0);
  expect(await AuxChain.countDocuments()).toBe(0);
});

test.each(['expired', 'foreign', 'stale'])(
  'resume of an %s draft never changes the current preparation or creates a commitment', async kind => {
    const userId = 837004;
    const { bot, sendMessage } = fixture();
    await bot.draftHandlers!.begin(userId, 'reserve', '旧准备');
    const old = (await TaskDraft.findOne({ userId }))!;
    if (kind === 'expired') await TaskDraft.updateOne({ userId }, { $set: { expiresAt: new Date(0) } });
    if (kind === 'stale') await bot.draftHandlers!.begin(userId, 'reserve', '另一个明确准备');
    const before = await TaskDraft.collection.findOne({ userId });
    await bot.draftHandlers!.handleCallback(kind === 'foreign' ? userId + 1 : userId, `draft:${old.token}:resume`);
    expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('这份准备已结束或不存在');
    expect(await TaskDraft.collection.findOne({ userId })).toEqual(before);
    expect(await AuxChain.countDocuments()).toBe(0);
    expect(await TaskChain.countDocuments()).toBe(0);
  }
);

test('status prioritizes an existing reservation instead of offering another start', async () => {
  const userId = 837005;
  const { bot, callbacks } = fixture();
  await User.create({ userId });
  await AuxChain.create({ userId, chainId: 'navigation-reservation', pendingReservation: {
    reservationId: 'res_navigation', signal: '已承诺的阅读', duration: 30,
    deadlineAt: new Date(Date.now() + 900000), status: 'pending'
  } });
  await bot.coreHandlers!.handleStatusCommand(userId);
  expect(callbacks()).toContain('quick_reserve_status');
  expect(callbacks()).not.toContain('quick_task');
  expect(callbacks()).not.toContain('quick_reserve');
  await bot.handleQuickCallback(userId, 'quick_reserve_status');
  expect(callbacks()).toContain('start_reserved_res_navigation');
});

test('status prioritizes the running task or pending main decision over a leftover draft', async () => {
  const userId = 837006;
  const { bot, callbacks } = fixture();
  const started = await bot.ctdpService.startMainTask(userId, {
    description: '当前专注', duration: 30, markerLabel: '确认'
  });
  await bot.draftHandlers!.begin(userId, 'reserve', '之后再做');
  await bot.coreHandlers!.handleStatusCommand(userId);
  expect(callbacks()).toContain(`complete_task_${started.task.taskId}`);
  expect(callbacks()).not.toContain('quick_task');
  expect(callbacks().some((value: string) => value.endsWith(':resume'))).toBe(false);
  await MainChain.updateOne({ userId }, { $set: { pendingViolation: {
    behaviorKey: '离开位置', reportedAt: new Date(), decisionToken: '0123456789abcdef0123'
  } } });
  await bot.coreHandlers!.handleStatusCommand(userId);
  expect(callbacks()).toContain('quick_violation');
  expect(callbacks()).not.toContain(`complete_task_${started.task.taskId}`);
  expect(callbacks()).not.toContain('quick_reserve');
});

test('a submission can be viewed from status without executing the confirmation again', async () => {
  const userId = 837007;
  const { bot, callbacks, sendMessage } = fixture();
  await User.create({ userId });
  await bot.draftHandlers!.begin(userId, 'reserve', '正在提交的准备');
  const draft = (await TaskDraft.findOne({ userId }))!;
  await TaskDraft.updateOne({ userId }, { $set: { stage: 'submitting' } });
  await bot.coreHandlers!.handleStatusCommand(userId);
  expect(callbacks()).toContain(`draft:${draft.token}:resume`);
  expect(callbacks()).not.toContain(`draft:${draft.token}:cancel`);
  await bot.handleQuickCallback(userId, `draft:${draft.token}:resume`);
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('正在提交');
  expect((await TaskDraft.findOne({ userId }))?.stage).toBe('submitting');
  expect(await AuxChain.countDocuments()).toBe(0);
});

test('draft callbacks with trailing data cannot submit the prefix action', async () => {
  const userId = 837008;
  const { bot } = fixture();
  await bot.draftHandlers!.begin(userId, 'reserve', '需要明确确认');
  const draft = (await TaskDraft.findOne({ userId }))!;
  await bot.draftHandlers!.handleCallback(userId, `draft:${draft.token}:confirm:ignored`);
  expect((await TaskDraft.findOne({ userId }))?.stage).toBe('ready');
  expect(await AuxChain.countDocuments()).toBe(0);
});

test('when idle status provides reservation preparation as the first next action', async () => {
  const { bot, callbacks } = fixture();
  await User.create({ userId: 837009 });
  await bot.coreHandlers!.handleStatusCommand(837009);
  expect(callbacks()[0]).toBe('quick_reserve');
  expect(callbacks()).toContain('quick_task');
});

test('a submission starting between preparation reads never reopens the description prompt', async () => {
  const userId = 837010;
  const { bot, sendMessage } = fixture();
  await bot.draftHandlers!.begin(userId, 'reserve', '原准备正在确认');
  const read = TaskDraft.findOne.bind(TaskDraft);
  const interleave = vi.spyOn(TaskDraft, 'findOne').mockImplementationOnce((async (...args: any[]) => {
    const result = await read(args[0]);
    await TaskDraft.updateOne({ userId }, { $set: { stage: 'submitting' } });
    return result;
  }) as any);
  try {
    await bot.draftHandlers!.begin(userId, 'reserve');
    expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('正在提交');
    expect(sendMessage.mock.calls.at(-1)?.[1]).not.toContain('直接回复');
    expect((await TaskDraft.findOne({ userId }))?.stage).toBe('submitting');
    expect(await AuxChain.countDocuments()).toBe(0);
  } finally { interleave.mockRestore(); }
});

test('optional pattern counters failing cannot hide a running task completion control', async () => {
  const { bot, callbacks } = fixture();
  const started = await bot.ctdpService.startMainTask(837011, {
    description: '定式读数异常时专注继续', duration: 30, markerLabel: '确认'
  });
  const read = vi.spyOn(PatternTree, 'findOne')
    .mockRejectedValueOnce(new Error('optional pattern counter unavailable'));
  try {
    await bot.coreHandlers!.handleStatusCommand(837011);
    expect(callbacks()).toContain(`complete_task_${started.task.taskId}`);
  } finally { read.mockRestore(); }
});

test('the active main decision stays primary even if an older broken chain was updated later', async () => {
  const userId = 837012;
  const { bot, callbacks } = fixture();
  await User.create({ userId });
  await MainChain.create({ userId, chainId: 'navigation-current', sacredMarker: { type: 'custom', label: '确认' },
    pendingViolation: { behaviorKey: '离开位置', reportedAt: new Date(), decisionToken: '0123456789abcdef0123' }
  });
  await MainChain.create({ userId, chainId: 'navigation-old', status: 'broken', sacredMarker: {
    type: 'custom', label: '旧位置'
  } });
  await MainChain.collection.updateOne({ chainId: 'navigation-old' }, {
    $set: { updatedAt: new Date(Date.now() + 1000) }
  });
  await bot.coreHandlers!.handleStatusCommand(userId);
  expect(callbacks()[0]).toBe('quick_violation');
  expect(callbacks()).not.toContain('quick_task');
});

test('unreadable core protocol state asks for refresh without discarding the draft', async () => {
  const userId = 837013;
  const { bot, callbacks } = fixture();
  await User.create({ userId });
  await bot.draftHandlers!.begin(userId, 'reserve', '保留准备内容');
  const before = await TaskDraft.collection.findOne({ userId });
  const read = vi.spyOn(MainChain, 'findOne').mockRejectedValueOnce(new Error('protocol state unavailable'));
  try {
    await bot.coreHandlers!.handleStatusCommand(userId);
    expect(callbacks()[0]).toBe('quick_status');
    expect(callbacks()).not.toContain('quick_task');
    expect(await TaskDraft.collection.findOne({ userId })).toEqual(before);
  } finally { read.mockRestore(); }
});

test('a cancel racing with a committed reservation never says that no commitment exists', async () => {
  const userId = 837014;
  const { bot, sendMessage } = fixture();
  await bot.draftHandlers!.begin(userId, 'reserve', '正要确认的预约');
  const draft = (await TaskDraft.findOne({ userId }))!;
  const remove = TaskDraft.deleteOne.bind(TaskDraft);
  const interleave = vi.spyOn(TaskDraft, 'deleteOne').mockImplementationOnce((async (...args: any[]) => {
    await bot.ctdpService.createReservation(userId, draft.description, draft.duration, `res_${draft.token}`);
    await TaskDraft.updateOne({ userId }, { $set: { stage: 'submitting' } });
    return remove(args[0]);
  }) as any);
  try {
    await bot.draftHandlers!.handleCallback(userId, `draft:${draft.token}:cancel`);
    expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('当前准备状态已变化');
    expect(sendMessage.mock.calls.at(-1)?.[1]).not.toContain('尚未建立');
    expect((await AuxChain.findOne({ userId }))?.pendingReservation?.reservationId).toBe(`res_${draft.token}`);
  } finally { interleave.mockRestore(); }
});

test('selecting another preparation mode preserves content and duration but expires old controls', async () => {
  const userId = 837015;
  const { bot, sendMessage } = fixture();
  await bot.draftHandlers!.begin(userId, 'reserve', '不要清空这件事');
  const old = (await TaskDraft.findOne({ userId }))!;
  await bot.draftHandlers!.handleCallback(userId, `draft:${old.token}:duration90`);
  await bot.draftHandlers!.begin(userId, 'start');
  const after = (await TaskDraft.findOne({ userId }))!;
  expect(after.description).toBe(old.description);
  expect(after.duration).toBe(90);
  expect(after.expiresAt).toEqual(old.expiresAt);
  expect(after.mode).toBe('start');
  expect(after.token).not.toBe(old.token);
  await bot.draftHandlers!.handleCallback(userId, `draft:${old.token}:confirm`);
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('这份准备已结束或不存在');
  expect(await TaskChain.countDocuments()).toBe(0);
});

test.each(['reserve', 'start'] as const)(
  'a live slow %s submission cannot be reset and confirmed again after its nominal lease expires', async mode => {
    const userId = 837016;
    const { bot } = fixture();
    await bot.draftHandlers!.begin(userId, mode, '慢提交仍然是同一次');
    const draft = (await TaskDraft.findOne({ userId }))!;
    let reached!: () => void;
    let release!: () => void;
    const entered = new Promise<void>(resolve => { reached = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const method = mode === 'reserve' ? 'handleReserveCommand' : 'handleTaskCommand';
    const original = bot.taskHandlers![method].bind(bot.taskHandlers!);
    const pause = vi.spyOn(bot.taskHandlers!, method).mockImplementationOnce(async (...args) => {
      reached();
      await gate;
      return original(...args);
    });
    const first = bot.draftHandlers!.handleCallback(userId, `draft:${draft.token}:confirm`);
    try {
      await entered;
      await TaskDraft.collection.updateOne({ userId }, { $set: { updatedAt: new Date(Date.now() - 180000) } });
      await bot.draftHandlers!.handleCallback(userId, `draft:${draft.token}:resume`);
      await bot.draftHandlers!.handleCallback(userId, `draft:${draft.token}:confirm`);
      expect((await TaskDraft.findOne({ userId }))?.stage).toBe('submitting');
      expect(pause).toHaveBeenCalledTimes(1);
      release();
      await first;
      expect(await TaskDraft.countDocuments({ userId })).toBe(0);
      if (mode === 'reserve') {
        expect(await AuxChain.countDocuments({ userId })).toBe(1);
        expect((await AuxChain.findOne({ userId }))?.pendingReservation?.reservationId).toBe(`res_${draft.token}`);
      } else {
        expect((await TaskChain.findOne({ userId }))?.tasks).toHaveLength(1);
        expect((await MainChain.findOne({ userId }))?.nodes).toHaveLength(1);
        expect((await User.findOne({ userId }))?.stats.totalTasks).toBe(1);
      }
    } finally { release(); await first; pause.mockRestore(); }
  }
);

test.each(['reserve', 'start'] as const)(
  'resume after a stopped-process %s attempt resets once and the next confirmation commits once', async mode => {
    const userId = 837017;
    const { bot } = fixture();
    await bot.draftHandlers!.begin(userId, mode, '重启后继续原准备');
    const draft = (await TaskDraft.findOne({ userId }))!;
    await TaskDraft.collection.updateOne({ userId }, { $set: {
      stage: 'submitting', updatedAt: new Date(Date.now() - 180000)
    } });
    await bot.handleQuickCallback(userId, `draft:${draft.token}:resume`);
    expect((await TaskDraft.findOne({ userId }))?.stage).toBe('ready');
    await Promise.all([
      bot.draftHandlers!.handleCallback(userId, `draft:${draft.token}:confirm`),
      bot.draftHandlers!.handleCallback(userId, `draft:${draft.token}:confirm`)
    ]);
    expect(await TaskDraft.countDocuments({ userId })).toBe(0);
    if (mode === 'reserve') expect(await AuxChain.countDocuments({ userId })).toBe(1);
    else {
      expect((await TaskChain.findOne({ userId }))?.tasks).toHaveLength(1);
      expect((await MainChain.findOne({ userId }))?.nodes).toHaveLength(1);
      expect((await User.findOne({ userId }))?.stats.totalTasks).toBe(1);
    }
  }
);

test('restart recovery reads a cancelled reservation receipt instead of reviving its old token', async () => {
  const userId = 837018;
  const { bot, sendMessage } = fixture();
  await bot.draftHandlers!.begin(userId, 'reserve', '历史取消收据');
  const draft = (await TaskDraft.findOne({ userId }))!;
  await AuxChain.create({ userId, chainId: 'old-cancelled-draft', reservationHistory: [{
    reservationId: `res_${draft.token}`, status: 'cancelled', signal: draft.description, duration: draft.duration
  }] });
  await TaskDraft.collection.updateOne({ userId }, { $set: {
    stage: 'submitting', updatedAt: new Date(Date.now() - 180000)
  } });
  const before = await AuxChain.collection.findOne({ userId });
  await bot.handleQuickCallback(userId, `draft:${draft.token}:resume`);
  await bot.draftHandlers!.handleCallback(userId, `draft:${draft.token}:confirm`);
  expect(await TaskDraft.countDocuments({ userId })).toBe(0);
  expect(await AuxChain.collection.findOne({ userId })).toEqual(before);
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('这份准备已结束或不存在');
});
