import { expect, test, vi } from 'vitest';
import SelfControlBot from '../../src/bot.js';
import { TaskChain, User } from '../../src/models/index.js';

function fixture() {
  const bot = new SelfControlBot();
  const messages: string[] = [];
  const transport = {
    sendMessage: async (_id: number, text: string) => {
      messages.push(text);
      return { message_id: 1 };
    }
  };
  bot.bot = transport as never;
  (bot as unknown as { initializeHandlers: (transport: unknown) => void }).initializeHandlers(transport);
  const reminder = vi.spyOn(bot.queueService, 'addReminder').mockResolvedValue('job');
  return { bot, messages, reminder };
}

test('settings control the default duration and disable progress reminders', async () => {
  await User.create({ userId: 812001 });
  const { bot, reminder } = fixture();
  const command = (text: string) => bot.handleCommand({ from: { id: 812001 }, chat: { id: 812001 }, text } as never);
  await command('/settings duration 45');
  await command('/settings reminders off');
  expect((await User.findOne({ userId: 812001 }))?.settings.defaultDuration).toBe(45);
  await command('/task 学习第一节');
  const task = (await TaskChain.findOne({ userId: 812001 }))!.tasks[0]!;
  expect(task.duration).toBe(45);
  expect(reminder.mock.calls.map((args) => args[0])).toEqual(['completion']);
  expect((await bot.taskService.getUserStatus(812001)).todayStats?.stats.tasksStarted).toBe(1);
});

test('/week displays seven user-local days and genuine task statistics instead of a placeholder', async () => {
  await User.create({ userId: 812002, settings: { timezone: 'America/Los_Angeles' } });
  const { bot, messages } = fixture();
  await bot.taskService.createTask(812002, '本周阅读', 60);
  await bot.handleCommand({ from: { id: 812002 }, chat: { id: 812002 }, text: '/week' } as never);
  expect(messages.at(-1)).toContain('最近7天');
  expect(messages.at(-1)).toContain('America/Los_Angeles');
  expect(messages.at(-1)).toContain('启动：1');
  expect(messages.at(-1)).not.toContain('正在开发');
});

test('invalid numeric duration is rejected instead of silently starting a default task', async () => {
  const { bot, messages } = fixture();
  await bot.handleCommand({ from: { id: 812003 }, chat: { id: 812003 }, text: '/task 读书 999' } as never);
  expect(await TaskChain.countDocuments({ userId: 812003 })).toBe(0);
  expect(messages.at(-1)).toContain('时长');
});
