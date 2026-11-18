import { beforeEach, expect, test, vi } from 'vitest';
import SelfControlBot from '../../src/bot.js';

function fixture() {
  const bot = new SelfControlBot();
  const drafts = { begin: vi.fn(), handleText: vi.fn().mockResolvedValue(true), handleCallback: vi.fn() };
  const tasks = {
    sendTaskPrompt: vi.fn(),
    sendReservePrompt: vi.fn(),
    handleTaskCommand: vi.fn(),
    handleReserveCommand: vi.fn()
  };
  bot.bot = { sendMessage: vi.fn(), answerCallbackQuery: vi.fn() } as never;
  bot.taskHandlers = tasks as never;
  Object.assign(bot, { draftHandlers: drafts });
  return { bot, drafts, tasks };
}

beforeEach(() => {
  (SelfControlBot as unknown as { processedUpdateCache: Map<string, number> }).processedUpdateCache.clear();
});

test('quick buttons collect input rather than returning command syntax', async () => {
  const { bot, drafts, tasks } = fixture();
  await bot.handleQuickCallback(1001, 'quick_reserve');
  await bot.handleQuickCallback(1001, 'quick_task');
  expect(drafts.begin.mock.calls).toEqual([
    [1001, 'reserve'],
    [1001, 'start']
  ]);
  expect(tasks.sendReservePrompt).not.toHaveBeenCalled();
  expect(tasks.sendTaskPrompt).not.toHaveBeenCalled();
});

test('empty /reserve or /task enters preparation without making a commitment', async () => {
  const { bot, drafts, tasks } = fixture();
  await bot.handleCommand({ from: { id: 1001 }, text: '/reserve', chat: { id: 1001 } } as never);
  await bot.handleCommand({ from: { id: 1001 }, text: '/task', chat: { id: 1001 } } as never);
  expect(drafts.begin.mock.calls).toEqual([
    [1001, 'reserve'],
    [1001, 'start']
  ]);
  expect(tasks.handleReserveCommand).not.toHaveBeenCalled();
  expect(tasks.handleTaskCommand).not.toHaveBeenCalled();
});

test('plain-text replies continue the draft and callbacks are dispatched by short token', async () => {
  const { bot, drafts } = fixture();
  bot.coreHandlers = { handleTextInput: vi.fn() } as never;
  await bot.handleMessage({ message_id: 1, from: { id: 1001 }, chat: { id: 1001 }, text: '论文：方法_部分' } as never);
  await bot.handleQuickCallback(1001, 'draft:abc123:confirm');
  expect(drafts.handleText).toHaveBeenCalledWith(1001, '论文：方法_部分');
  expect(drafts.handleCallback).toHaveBeenCalledWith(1001, 'draft:abc123:confirm');
  expect(bot.coreHandlers!.handleTextInput).not.toHaveBeenCalled();
});
