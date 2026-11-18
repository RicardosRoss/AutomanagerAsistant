import type TelegramBot from 'node-telegram-bot-api';
import { expect, test, vi } from 'vitest';
import SelfControlBot from '../../src/bot.js';
import TaskDraft from '../../src/models/TaskDraft.js';
import { TaskChain, AuxChain, MainChain, User, PrecedentRule } from '../../src/models/index.js';

function fixture() {
  const bot = new SelfControlBot();
  const sent: Array<{ userId: number; text: string; options?: TelegramBot.SendMessageOptions }> = [];
  const sendMessage = vi.fn(async (userId: number, text: string, options?: TelegramBot.SendMessageOptions) => {
    if (text.length > 4096) throw new Error('Telegram message is too long');
    sent.push({ userId, text, options });
    return { message_id: sent.length };
  });
  const transport = { sendMessage };
  bot.bot = transport as never;
  (bot as unknown as { initializeHandlers: (value: unknown) => void }).initializeHandlers(transport);
  const schedule = vi.spyOn(bot.queueService, 'scheduleReservation').mockResolvedValue('job');
  vi.spyOn(bot.queueService, 'cancelReservation').mockResolvedValue(true);
  vi.spyOn(bot.queueService, 'addReminder').mockResolvedValue('reminder');
  return { bot, sent, schedule };
}

test.each(['task', 'reserve'])('overlong /%s is rejected before any commitment is persisted', async (command) => {
  const userId = command === 'task' ? 825001 : 825002;
  const { bot, sent, schedule } = fixture();
  await bot.handleCommand({ from: { id: userId }, chat: { id: userId },
    text: `/${command} ${'阅读'.repeat(501)} 30` } as never);
  expect(await TaskChain.countDocuments({ userId })).toBe(0);
  expect(await AuxChain.countDocuments({ userId })).toBe(0);
  expect(await MainChain.countDocuments({ userId })).toBe(0);
  expect(schedule).not.toHaveBeenCalled();
  expect(sent.at(-1)?.text).toContain('1000');
});

test('overlong natural input does not overwrite an existing preparation', async () => {
  const { bot, sent } = fixture();
  await bot.draftHandlers!.begin(825003, 'reserve', '原准备');
  const original = (await TaskDraft.findOne({ userId: 825003 }))!;
  await bot.handleMessage({ message_id: 1001, from: { id: 825003 }, chat: { id: 825003 },
    text: '学习'.repeat(501) } as never);
  const after = (await TaskDraft.findOne({ userId: 825003 }))!;
  expect(after.token).toBe(original.token);
  expect(after.description).toBe('原准备');
  expect(sent.at(-1)?.text).toContain('1000');
});

test('a thousand supplementary Unicode characters fit the same draft and direct task contract', async () => {
  const { bot, sent } = fixture();
  const description = '📖'.repeat(1000);
  await bot.draftHandlers!.begin(825004, 'start');
  expect(await bot.draftHandlers!.handleText(825004, description)).toBe(true);
  expect((await TaskDraft.findOne({ userId: 825004 }))?.description).toBe(description);
  await expect((await TaskDraft.findOne({ userId: 825004 }))!.validate()).resolves.toBeUndefined();
  expect(sent.at(-1)?.text).toContain(description);
  await bot.handleCommand({ from: { id: 825005 }, chat: { id: 825005 }, text: `/task ${description} 30` } as never);
  expect((await TaskChain.findOne({ userId: 825005 }))?.tasks[0]?.description).toBe(description);
  expect(sent.at(-1)?.options?.parse_mode).toBeUndefined();
});

test('a long legacy running task is visible and actionable without altering its original description', async () => {
  const { bot, sent } = fixture();
  await User.create({ userId: 825006 });
  const description = '📖_<重点>[章节]&'.repeat(600);
  await TaskChain.create({ userId: 825006, chainId: 'legacy-long-task', tasks: [{
    taskId: 'legacy-task-id', description, duration: 30, startTime: new Date(), status: 'running'
  }] });
  await bot.coreHandlers!.handleStatusCommand(825006);
  expect(sent.at(-1)?.text).toContain('当前任务');
  expect(sent.at(-1)?.text).toContain('仅显示');
  expect(sent.at(-1)?.text).not.toContain('**您的专注状态**');
  const keyboard = sent.at(-1)?.options?.reply_markup as TelegramBot.InlineKeyboardMarkup;
  expect(keyboard.inline_keyboard.flat().map((item) => item.callback_data)).toContain('complete_task_legacy-task-id');
  expect((await TaskChain.findOne({ userId: 825006 }))?.tasks[0]?.description).toBe(description);
});

test('a legacy long reservation remains readable and can still be fulfilled from its original button', async () => {
  const { bot, sent } = fixture();
  const description = '章节：[长任务]_'.repeat(800);
  await AuxChain.create({ userId: 825007, chainId: 'legacy-long-reservation', pendingReservation: {
    reservationId: 'legacy-long-res', signal: description, duration: 30, createdAt: new Date(),
    deadlineAt: new Date(Date.now() + 600000), status: 'pending'
  } });
  await bot.handleReserveStatusCommand(825007);
  expect(sent.at(-1)?.text).toContain('仅显示');
  await bot.taskHandlers!.handleStartReservedCallback(825007, 'start_reserved_legacy-long-res');
  expect(sent.at(-1)?.text).toContain('预约已兑现');
  expect(sent.at(-1)?.text).toContain('仅显示');
  expect((await TaskChain.findOne({ userId: 825007 }))?.tasks[0]?.description).toBe(description);
});

test('large precedent lists fit Telegram limits and identify current versus historical scope', async () => {
  const { bot, sent } = fixture();
  await MainChain.create({ userId: 825008, chainId: 'current-text-scope',
    sacredMarker: { type: 'seat', label: '确认' }, nodes: [] });
  await PrecedentRule.insertMany(Array.from({ length: 30 }, (_, index) => ({
    userId: 825008,
    scope: { chainType: 'main', chainId: index === 0 ? 'current-text-scope' : `old-text-scope-${index}`,
      behaviorKey: `${index}:${'阅读_[]&'.repeat(80)}` },
    decision: 'allow_forever'
  })));
  await bot.handlePrecedentsCommand(825008);
  expect(sent.length).toBeGreaterThan(1);
  const combined = sent.map((message) => message.text).join('');
  expect(combined).toContain('当前主链');
  expect(combined).toContain('历史主链');
  for (let index = 0; index < 30; index += 1) expect(combined).toContain(`${index}:`);
  for (const message of sent) {
    expect(message.text.length).toBeLessThanOrEqual(4096);
    expect(message.options?.parse_mode).toBeUndefined();
  }
});

test('task text containing replacement tokens and markup is preserved literally in the confirmation', async () => {
  const { bot, sent } = fixture();
  const description = "$& $` $' {duration} <b>重点</b> **_[]&";
  await bot.handleCommand({ from: { id: 825009 }, chat: { id: 825009 }, text: `/task ${description} 30` } as never);
  const task = (await TaskChain.findOne({ userId: 825009 }))!.tasks[0]!;
  expect(task.description).toBe(description);
  expect(sent.at(-1)?.text).toContain(description);
  expect(sent.at(-1)?.text).toContain('时长：30分钟');
  expect(sent.at(-1)?.options?.parse_mode).toBeUndefined();
});

test('a task still initializing is shown as starting and cannot be completed or abandoned from status', async () => {
  const { bot, sent } = fixture();
  await User.create({ userId: 825010 });
  await TaskChain.create({ userId: 825010, chainId: 'initializing-text-task', tasks: [{
    taskId: 'initializing-task-id', description: '阅读', duration: 30,
    startTime: new Date(Date.now() - 1800000), status: 'running', creationState: 'initializing'
  }] });
  await bot.coreHandlers!.handleStatusCommand(825010);
  expect(sent.at(-1)?.text).toContain('正在启动');
  const keyboard = sent.at(-1)?.options?.reply_markup as TelegramBot.InlineKeyboardMarkup;
  expect(keyboard.inline_keyboard.flat().map((item) => item.callback_data))
    .not.toContain('complete_task_initializing-task-id');
  await expect(bot.taskService.completeTask(825010, 'initializing-task-id', false)).rejects.toThrow('正在启动');
  expect((await TaskChain.findOne({ userId: 825010 }))?.tasks[0]?.status).toBe('running');
});

test('ended task records never become status actions', async () => {
  const { bot, sent } = fixture();
  await User.create({ userId: 825011 });
  await TaskChain.create({ userId: 825011, chainId: 'ended-text-tasks', tasks: [
    { taskId: 'ended-completed', description: '完成', duration: 30, status: 'completed', startTime: new Date() },
    { taskId: 'ended-failed', description: '失败', duration: 30, status: 'failed', startTime: new Date() },
    { taskId: 'ended-cancelled', description: '取消', duration: 30, status: 'cancelled', startTime: new Date() }
  ] });
  await bot.coreHandlers!.handleStatusCommand(825011);
  expect(sent.at(-1)?.text).toContain('当前没有进行中的任务');
  const keyboard = sent.at(-1)?.options?.reply_markup as TelegramBot.InlineKeyboardMarkup;
  const callbacks = keyboard.inline_keyboard.flat().map((item) => item.callback_data);
  expect(callbacks.some((value) => value?.startsWith('complete_task_') || value?.startsWith('fail_task_'))).toBe(false);
  expect((await bot.taskService.getUserStatus(825011, { includeTodayStats: false })).currentTask).toBeUndefined();
});

test.each(['reserve', 'start', 'delay', 'cancel'])('missing service cannot claim %s succeeded', async (action) => {
  const { bot, sent, schedule } = fixture();
  bot.taskHandlers!.ctdpService = null;
  const cancel = vi.spyOn(bot.queueService, 'cancelReservation').mockResolvedValue(true);
  if (action === 'reserve') await bot.taskHandlers!.handleReserveCommand(825013, '阅读 30');
  if (action === 'start') await bot.taskHandlers!.handleStartReservedCallback(825013, 'start_reserved_unknown');
  if (action === 'delay') await bot.taskHandlers!.handleDelayReservationCallback(825013, 'delay_reservation_5:unknown');
  if (action === 'cancel') {
    await bot.taskHandlers!.handleCancelReservationCallback(825013, 'cancel_reservation_unknown');
  }
  expect(sent.at(-1)?.text).toContain('尚未就绪');
  expect(schedule).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
  expect(await AuxChain.countDocuments({ userId: 825013 })).toBe(0);
});

test('the legacy preview completion button retains the full original task and settles it', async () => {
  const { bot, sent } = fixture();
  vi.spyOn(bot.queueService, 'cancelTaskReminders').mockResolvedValue(0);
  vi.spyOn(bot.cultivationService, 'awardCultivation').mockResolvedValue(null as never);
  await User.create({ userId: 825012 });
  const description = '章节_重点'.repeat(1000);
  await TaskChain.create({ userId: 825012, chainId: 'long-text-action', tasks: [{
    taskId: 'long-text-action-id', description, duration: 30,
    startTime: new Date(Date.now() - 1800000), status: 'running'
  }] });
  await bot.coreHandlers!.handleStatusCommand(825012);
  const keyboard = sent.at(-1)?.options?.reply_markup as TelegramBot.InlineKeyboardMarkup;
  const complete = keyboard.inline_keyboard.flat().find((entry) => entry.callback_data?.startsWith('complete_task_'))!;
  await bot.taskHandlers!.handleCompleteTaskCallback(825012, complete.callback_data!);
  const finished = (await TaskChain.findOne({ userId: 825012 }))!.tasks[0]!;
  expect(finished.description).toBe(description);
  expect(finished.status).toBe('completed');
  expect(finished.settlementStatus).toBe('settled');
  expect((await User.findOne({ userId: 825012 }))?.stats.completedTasks).toBe(1);
});
