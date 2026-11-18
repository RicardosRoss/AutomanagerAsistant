import { beforeEach, expect, test, vi } from 'vitest';
import SelfControlBot from '../../src/bot.js';
import { AuxChain, MainChain, TaskChain, User } from '../../src/models/index.js';
import TaskDraft from '../../src/models/TaskDraft.js';

beforeEach(() => {
  (SelfControlBot as unknown as { processedUpdateCache: Map<string, number> }).processedUpdateCache.clear();
});

function fixture(userId: number) {
  const bot = new SelfControlBot();
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const transport = { sendMessage, answerCallbackQuery };
  bot.bot = transport as never;
  (bot as unknown as { initializeHandlers: (value: unknown) => void }).initializeHandlers(transport);
  vi.spyOn(bot.queueService, 'addReminder').mockResolvedValue('reminder');
  vi.spyOn(bot.queueService, 'cancelReservation').mockResolvedValue(true);
  const callback = {
    id: `ack-${userId}`, from: { id: userId }, data: `start_reserved_res_${userId}`,
    message: { message_id: 1, chat: { id: userId, type: 'private' } }
  };
  return { bot, sendMessage, answerCallbackQuery, callback };
}

test.each(['EFATAL: network timeout', 'ETELEGRAM: query is too old and response timeout expired'])(
  'a failed acknowledgement does not discard a valid reservation start: %s', async (error) => {
    const userId = error.startsWith('EFATAL') ? 824001 : 824002;
    const { bot, answerCallbackQuery, callback, sendMessage } = fixture(userId);
    await bot.ctdpService.createReservation(userId, '阅读：[章节]_重点', 30, `res_${userId}`);
    answerCallbackQuery.mockRejectedValue(new Error(error));
    await bot.handleCallbackQuery(callback as never);
    await bot.handleCallbackQuery(callback as never);
    const chain = (await TaskChain.findOne({ userId }))!;
    expect(chain.tasks).toHaveLength(1);
    expect(chain.tasks[0]?.status).toBe('running');
    expect((await MainChain.findOne({ userId }))?.nodes).toHaveLength(1);
    expect((await AuxChain.findOne({ userId }))?.completedReservations).toBe(1);
    expect((await AuxChain.findOne({ userId }))?.pendingReservation).toBeUndefined();
    expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('预约已兑现');
  }
);

test('reservation creation proceeds while acknowledgement is still waiting on the network', async () => {
  const { bot, answerCallbackQuery, callback } = fixture(824003);
  await bot.ctdpService.createReservation(824003, '阅读', 30, 'res_824003');
  let release!: () => void;
  const gate = new Promise<boolean>((resolve) => { release = () => resolve(true); });
  answerCallbackQuery.mockReturnValue(gate);
  const processing = bot.handleCallbackQuery(callback as never);
  try {
    await vi.waitFor(async () => {
      expect((await TaskChain.findOne({ userId: 824003 }))?.tasks).toHaveLength(1);
      expect((await AuxChain.findOne({ userId: 824003 }))?.pendingReservation).toBeUndefined();
    }, { timeout: 1000 });
  } finally {
    release();
    await processing;
  }
});

test('failed acknowledgement never bypasses private-chat and ownership guards', async () => {
  const { bot, answerCallbackQuery, callback } = fixture(824004);
  await bot.ctdpService.createReservation(824004, '阅读', 30, 'res_824004');
  answerCallbackQuery.mockRejectedValue(new Error('Telegram down'));
  await bot.handleCallbackQuery({ ...callback, message: {
    ...callback.message, chat: { id: -824004, type: 'supergroup' }
  } } as never);
  await bot.handleCallbackQuery({ ...callback, id: 'foreign-ack', from: { id: 824005 }, message: {
    ...callback.message, chat: { id: 824005, type: 'private' }
  } } as never);
  expect(await TaskChain.countDocuments({})).toBe(0);
  expect((await AuxChain.findOne({ userId: 824004 }))?.pendingReservation?.reservationId).toBe('res_824004');
});

test('an unexpected business failure reports in chat even after callback acknowledgement succeeded', async () => {
  const { bot, callback, sendMessage } = fixture(824006);
  bot.draftHandlers = { handleCallback: vi.fn().mockRejectedValue(new Error('draft DB unavailable')) } as never;
  await bot.handleCallbackQuery({ ...callback, data: 'draft:token:confirm' } as never);
  expect(sendMessage).toHaveBeenCalledWith(824006, expect.stringContaining('操作失败'));
});

test('a callback with no message origin cannot execute a personal task operation', async () => {
  const { bot, callback } = fixture(824007);
  await bot.ctdpService.createReservation(824007, '阅读', 30, 'res_824007');
  await bot.handleCallbackQuery({ ...callback, message: undefined } as never);
  expect(await TaskChain.countDocuments({ userId: 824007 })).toBe(0);
  expect((await AuxChain.findOne({ userId: 824007 }))?.pendingReservation).toBeDefined();
});

test('expired acknowledgement handling cannot start a reservation whose actual deadline has passed', async () => {
  const { bot, callback, answerCallbackQuery, sendMessage } = fixture(824008);
  await bot.ctdpService.createReservation(824008, '阅读', 30, 'res_824008');
  await AuxChain.updateOne({ userId: 824008 }, {
    $set: { 'pendingReservation.deadlineAt': new Date(Date.now() - 1000) }
  });
  answerCallbackQuery.mockRejectedValue(new Error('query is too old'));
  await bot.handleCallbackQuery(callback as never);
  expect(await TaskChain.countDocuments({ userId: 824008 })).toBe(0);
  const aux = (await AuxChain.findOne({ userId: 824008 }))!;
  expect(aux.pendingReservation?.status).toBe('expired');
  expect(aux.pendingDecision?.behaviorKey).toBe('missed_start');
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('预约判例');
});

test('a foreign private callback cannot expire another user reservation', async () => {
  const { bot, callback, answerCallbackQuery } = fixture(824009);
  await bot.ctdpService.createReservation(824009, '阅读', 30, 'res_824009');
  await AuxChain.updateOne({ userId: 824009 }, {
    $set: { 'pendingReservation.deadlineAt': new Date(Date.now() - 1000) }
  });
  const start = vi.spyOn(bot.ctdpService, 'startReservedTask');
  answerCallbackQuery.mockRejectedValue(new Error('Telegram down'));
  await bot.handleCallbackQuery({ ...callback, id: 'overdue-foreign', from: { id: 824010 }, message: {
    message_id: 1, chat: { id: 824010, type: 'private' }
  } } as never);
  expect(start).toHaveBeenCalledWith(824010, 'res_824009');
  expect(await TaskChain.countDocuments({})).toBe(0);
  const owner = (await AuxChain.findOne({ userId: 824009 }))!;
  expect(owner.pendingReservation?.status).toBe('pending');
  expect(owner.pendingDecision).toBeUndefined();
  expect(owner.reservationHistory).toHaveLength(0);
});

test('a fresh callback after transport dedup reset cannot fulfill the same reservation twice', async () => {
  const { bot, callback, answerCallbackQuery, sendMessage } = fixture(824011);
  await bot.ctdpService.createReservation(824011, '阅读', 30, 'res_824011');
  answerCallbackQuery.mockRejectedValue(new Error('network timeout'));
  const start = vi.spyOn(bot.ctdpService, 'startReservedTask');
  await bot.handleCallbackQuery(callback as never);
  const startedAt = (await TaskChain.findOne({ userId: 824011 }))!.tasks[0]!.startTime;
  // Clearing the process cache deliberately forces the second event into the service.
  (SelfControlBot as unknown as { processedUpdateCache: Map<string, number> }).processedUpdateCache.clear();
  await bot.handleCallbackQuery({ ...callback, id: 'fresh-start-824011' } as never);
  expect(start).toHaveBeenCalledTimes(2);
  expect((await TaskChain.findOne({ userId: 824011 }))?.tasks).toHaveLength(1);
  expect((await TaskChain.findOne({ userId: 824011 }))?.tasks[0]?.startTime).toEqual(startedAt);
  expect((await User.findOne({ userId: 824011 }))?.stats.totalTasks).toBe(1);
  expect((await AuxChain.findOne({ userId: 824011 }))?.completedReservations).toBe(1);
  expect((await AuxChain.findOne({ userId: 824011 }))?.reservationHistory).toHaveLength(1);
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('不会重新计时');
});

test('foreign cancellation and draft confirmation fail without changing the owner state', async () => {
  const { bot, callback } = fixture(824012);
  await bot.ctdpService.createReservation(824012, '阅读', 30, 'res_824012');
  await bot.draftHandlers!.begin(824012, 'reserve', '另一个准备');
  const draft = (await TaskDraft.findOne({ userId: 824012 }))!;
  const foreign = { from: { id: 824013 }, message: { message_id: 1, chat: { id: 824013, type: 'private' } } };
  await bot.handleCallbackQuery({
    ...callback, ...foreign, id: 'cancel-foreign', data: 'cancel_reservation_res_824012'
  } as never);
  await bot.handleCallbackQuery({
    ...callback, ...foreign, id: 'draft-foreign', data: `draft:${draft.token}:confirm`
  } as never);
  expect((await AuxChain.findOne({ userId: 824012 }))?.pendingDecision).toBeUndefined();
  expect((await TaskDraft.findOne({ userId: 824012 }))?.stage).toBe('ready');
  expect(await TaskChain.countDocuments({})).toBe(0);
});

test('an old fulfilled reservation button cannot restart an ended task or replace a newer one', async () => {
  const { bot, callback, sendMessage } = fixture(824014);
  vi.spyOn(bot.queueService, 'cancelTaskReminders').mockResolvedValue(0);
  await bot.ctdpService.createReservation(824014, '旧任务', 30, 'res_824014');
  await bot.handleCallbackQuery(callback as never);
  const first = (await TaskChain.findOne({ userId: 824014 }))!.tasks[0]!;
  await bot.ctdpService.failTrackedTask(824014, first.taskId, '主动放弃');
  const next = await bot.ctdpService.startMainTask(824014, {
    markerLabel: '确认', description: '新任务', duration: 30
  });
  (SelfControlBot as unknown as { processedUpdateCache: Map<string, number> }).processedUpdateCache.clear();
  await bot.handleCallbackQuery({ ...callback, id: 'ended-reservation-replay' } as never);
  const current = (await TaskChain.findOne({ userId: 824014, status: 'active' }))!;
  expect(current.tasks).toHaveLength(1);
  expect(current.tasks[0]?.taskId).toBe(next.task.taskId);
  expect(current.tasks[0]?.startTime).toEqual(next.task.startTime);
  expect((await User.findOne({ userId: 824014 }))?.stats.totalTasks).toBe(2);
  expect((await AuxChain.findOne({ userId: 824014 }))?.completedReservations).toBe(1);
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('预约不存在或已处理');
});
