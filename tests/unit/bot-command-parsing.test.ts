import { expect, test, vi } from 'vitest';
import SelfControlBot from '../../src/bot.js';

test('core commands accept the Telegram /command@bot form and preserve arguments', async () => {
  const bot = new SelfControlBot();
  const task = vi.fn();
  bot.taskHandlers = { handleTaskCommand: task } as never;
  Object.assign(bot, { botUsername: 'AutomanageMyselfBot' });
  await bot.handleCommand({
    from: { id: 818001 },
    chat: { id: 818001 },
    text: '/task@AutomanageMyselfBot 读书 45'
  } as never);
  expect(task).toHaveBeenCalledWith(818001, '读书 45');
});

test('commands addressed to another bot and malformed command boundaries are ignored', async () => {
  const bot = new SelfControlBot();
  const task = vi.fn();
  const sendMessage = vi.fn();
  bot.bot = { sendMessage } as never;
  bot.taskHandlers = { handleTaskCommand: task } as never;
  Object.assign(bot, { botUsername: 'AutomanageMyselfBot' });
  for (const text of ['/task@OtherBot 读书 45', '/ task 读书 45', '说明 /task 读书 45']) {
    await bot.handleCommand({ from: { id: 818002 }, chat: { id: 818002 }, text } as never);
  }
  expect(task).not.toHaveBeenCalled();
});

test('group commands cannot mutate a private task', async () => {
  const bot = new SelfControlBot();
  const task = vi.fn();
  const sendMessage = vi.fn();
  bot.bot = { sendMessage } as never;
  bot.taskHandlers = { handleTaskCommand: task } as never;
  await bot.handleCommand({
    from: { id: 818003 }, chat: { id: -818003, type: 'supergroup' }, text: '/task 阅读 45'
  } as never);
  expect(task).not.toHaveBeenCalled();
  expect(sendMessage).toHaveBeenCalledWith(-818003, expect.stringContaining('私聊'));
});

test('group and forwarded private buttons cannot mutate another chat', async () => {
  const bot = new SelfControlBot();
  const complete = vi.fn();
  const answerCallbackQuery = vi.fn();
  bot.bot = { answerCallbackQuery } as never;
  bot.taskHandlers = { handleCompleteTaskCallback: complete } as never;
  for (const chat of [{ id: -818004, type: 'supergroup' }, { id: 99999, type: 'private' }]) {
    await bot.handleCallbackQuery({
      id: `boundary-${chat.id}`, from: { id: 818004 }, data: 'complete_task_other',
      message: { message_id: 1, chat }
    } as never);
  }
  expect(complete).not.toHaveBeenCalled();
  expect(answerCallbackQuery).toHaveBeenCalledTimes(2);
  expect(answerCallbackQuery).toHaveBeenLastCalledWith('boundary-99999', {
    text: expect.stringContaining('私聊'), show_alert: true
  });
});

test('a duplicate group command sends its private-use hint only once', async () => {
  const bot = new SelfControlBot();
  const sendMessage = vi.fn();
  bot.bot = { sendMessage } as never;
  const msg = { message_id: 89001, from: { id: 818005 }, chat: { id: -818005 }, text: '/task 阅读 45' };
  await bot.handleMessage(msg as never);
  await bot.handleMessage(msg as never);
  expect(sendMessage).toHaveBeenCalledTimes(1);
});
