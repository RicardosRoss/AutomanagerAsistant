import { expect, test, vi } from 'vitest';
import SelfControlBot from '../../src/bot.js';
import TaskDraft from '../../src/models/TaskDraft.js';
import { TaskChain, MainChain, AuxChain } from '../../src/models/index.js';

test('message/callback entry → preparation → commitment → early start persists the whole CTDP flow', async () => {
  const userId = 810101;
  const bot = new SelfControlBot();
  const texts: string[] = [];
  const transport = {
    sendMessage: vi.fn(async (_id: number, text: string) => { texts.push(text); return { message_id: texts.length }; }),
    answerCallbackQuery: vi.fn()
  };
  bot.bot = transport as never;
  (bot as unknown as { initializeHandlers: (instance: unknown) => void }).initializeHandlers(transport);
  vi.spyOn(bot.queueService, 'scheduleReservation').mockResolvedValue('deadline-job');
  vi.spyOn(bot.queueService, 'addReminder').mockResolvedValue('reminder-job');
  vi.spyOn(bot.queueService, 'cancelReservation').mockResolvedValue(true);
  await bot.handleMessage({ message_id: 11, from: { id: userId }, chat: { id: userId }, text: '/reserve' } as never);
  await bot.handleMessage({ message_id: 12, from: { id: userId }, chat: { id: userId }, text: '学习：读论文_方法部分' } as never);
  const draft = (await TaskDraft.findOne({ userId }))!;
  expect(await TaskChain.countDocuments({ userId })).toBe(0);
  expect(await AuxChain.countDocuments({ userId })).toBe(0);
  await bot.handleCallbackQuery({ id: 'confirm-810101', from: { id: userId }, data: `draft:${draft.token}:confirm`,
    message: { message_id: 15, chat: { id: userId, type: 'private' } } } as never);
  const aux = (await AuxChain.findOne({ userId, status: 'active' }))!;
  expect(aux.pendingReservation?.signal).toBe('学习：读论文_方法部分');
  expect(aux.pendingReservation?.deadlineAt!.getTime() - aux.pendingReservation!.createdAt!.getTime()).toBe(15 * 60000);
  await bot.handleCallbackQuery({ id: 'start-810101', from: { id: userId },
    data: `start_reserved_${aux.pendingReservation!.reservationId}`,
    message: { message_id: 16, chat: { id: userId, type: 'private' } } } as never);
  expect((await AuxChain.findById(aux._id))?.completedReservations).toBe(1);
  expect((await AuxChain.findById(aux._id))?.pendingReservation).toBeUndefined();
  const task = (await TaskChain.findOne({ userId }))!.tasks[0]!;
  expect(task.description).toBe('学习：读论文_方法部分');
  expect((await MainChain.findOne({ userId }))?.nodes[0]?.taskId).toBe(task.taskId);
  expect(texts.at(-1)).toContain('预约已兑现，开始专注');
});
