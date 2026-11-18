import { beforeEach, expect, test, vi } from 'vitest';

const telegram = vi.hoisted(() => ({
  setMyCommands: vi.fn(), getMe: vi.fn(), startPolling: vi.fn(), stopPolling: vi.fn(), on: vi.fn(), onText: vi.fn()
}));
vi.mock('node-telegram-bot-api', () => ({ default: class { constructor() { Object.assign(this, telegram); } } }));
import SelfControlBot from '../../src/bot.js';

beforeEach(() => {
  vi.resetAllMocks();
  telegram.getMe.mockResolvedValue({ username: 'test', first_name: 'test' });
  telegram.startPolling.mockResolvedValue(undefined);
  telegram.stopPolling.mockResolvedValue(undefined);
});

test('optional menu synchronization failure does not prevent polling startup', async () => {
  telegram.setMyCommands.mockRejectedValue(new Error('network timeout'));
  const bot = new SelfControlBot();
  vi.spyOn(bot.queueService, 'initialize').mockResolvedValue(undefined);
  vi.spyOn(bot.queueService, 'close').mockResolvedValue(undefined);
  await bot.start();
  expect(bot.isRunning).toBe(true);
  expect(telegram.startPolling).toHaveBeenCalledTimes(1);
  expect(telegram.onText).not.toHaveBeenCalled();
  expect(bot.botUsername).toBe('test');
  expect(telegram.getMe.mock.invocationCallOrder[0]).toBeLessThan(telegram.on.mock.invocationCallOrder[0]!);
  expect(telegram.getMe.mock.invocationCallOrder[0]).toBeLessThan(telegram.startPolling.mock.invocationCallOrder[0]!);
  await bot.stop();
});

test('queues and polling are closed even when startup failed before isRunning became true', async () => {
  const bot = new SelfControlBot();
  bot.bot = telegram as never;
  const close = vi.spyOn(bot.queueService, 'close').mockResolvedValue(undefined);
  await bot.stop();
  expect(close).toHaveBeenCalledTimes(1);
  expect(telegram.stopPolling).toHaveBeenCalledTimes(1);
  expect(bot.isRunning).toBe(false);
});
