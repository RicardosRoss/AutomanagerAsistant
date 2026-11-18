import { beforeEach, expect, test, vi } from 'vitest';
import type TelegramBot from 'node-telegram-bot-api';
import SelfControlBot from '../../src/bot.js';
import { AuxChain, TaskChain, User } from '../../src/models/index.js';
import PatternTree from '../../src/models/PatternTree.js';
import PatternCommandHandlers from '../../src/handlers/patternCommands.js';
import { sendTelegramMessage, isValidTelegramCallbackData } from '../../src/utils/telegramMessages.js';

beforeEach(() => {
  vi.restoreAllMocks();
  (SelfControlBot as unknown as { processedUpdateCache: Map<string, number> }).processedUpdateCache.clear();
});

test('callback boundaries measure UTF-8 bytes and keep valid text exactly', () => {
  for (const value of ['a', 'a'.repeat(64), '中'.repeat(21) + 'a', '📖'.repeat(16)]) {
    expect(isValidTelegramCallbackData(value)).toBe(true);
  }
  for (const value of [undefined, null, 42, '', 'a'.repeat(65), '中'.repeat(22), '📖'.repeat(17),
    '\u0000', 'id\u007f', 'id\u0085', '\uD800', '\uDC00']) {
    expect(isValidTelegramCallbackData(value)).toBe(false);
  }
});

test('invalid callback buttons cannot prevent the readable message or valid controls from arriving', async () => {
  const sent: Array<{ text: string; options?: TelegramBot.SendMessageOptions }> = [];
  const bot = { sendMessage: async (_id: number, text: string, options?: TelegramBot.SendMessageOptions) => {
    const markup = options?.reply_markup as TelegramBot.InlineKeyboardMarkup | undefined;
    for (const row of markup?.inline_keyboard ?? []) {
      for (const button of row) {
        if (button.callback_data && Buffer.byteLength(button.callback_data, 'utf8') > 64) {
          throw new Error('BUTTON_DATA_INVALID');
        }
      }
    }
    sent.push({ text, options });
    return { message_id: sent.length };
  } };
  const keyboard: TelegramBot.InlineKeyboardMarkup = { inline_keyboard: [
    [{ text: '旧长记录', callback_data: `complete_task_${'中'.repeat(30)}` }],
    [{ text: '当前状态', callback_data: 'quick_status' }, { text: '边界', callback_data: 'a'.repeat(64) }],
    [{ text: '无效文本', callback_data: 'task_bad\uD800' }, { text: '换行', callback_data: 'task_bad\n' }],
    [{ text: '帮助链接', url: 'https://core.telegram.org/bots/api' }]
  ] };
  const original = structuredClone(keyboard);
  await sendTelegramMessage(bot as never, 836001, '历史任务原文📖', { reply_markup: keyboard });
  expect(sent[0]?.text).toContain('历史任务原文📖');
  expect(sent[0]?.text).toContain('部分记录的操作按钮暂不可用');
  const markup = sent[0]?.options?.reply_markup as TelegramBot.InlineKeyboardMarkup;
  expect(markup.inline_keyboard).toEqual([keyboard.inline_keyboard[1], keyboard.inline_keyboard[3]]);
  expect(keyboard).toEqual(original);
});

test('long text and invalid buttons remain readable with safe controls only on the last chunk', async () => {
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
  const text = '原文📖'.repeat(2000);
  await sendTelegramMessage({ sendMessage } as never, 836002, text, { reply_markup: { inline_keyboard: [[
    { text: '旧记录', callback_data: 'b'.repeat(65) }, { text: '查看', callback_data: 'quick_status' }
  ]] } });
  expect(sendMessage.mock.calls.map(call => call[1]).join('')).toContain(text);
  expect(sendMessage.mock.calls.every(call => call[1].length <= 4096)).toBe(true);
  expect(sendMessage.mock.calls.slice(0, -1).every(call => call[2]?.reply_markup === undefined)).toBe(true);
  expect(sendMessage.mock.calls.at(-1)?.[2]?.reply_markup.inline_keyboard).toEqual([
    [{ text: '查看', callback_data: 'quick_status' }]
  ]);
});

test('a historical malformed pattern ID leaves its original BSON unchanged and still shows the tree', async () => {
  await PatternTree.collection.insertOne({ userId: 836003, treeId: 'bad-history-tree', nodes: [
    { nodeId: 'x'.repeat(100), title: '旧定式原文', status: 'pending', children: [], createdOn: '2026-01-01' }
  ] });
  const original = await PatternTree.collection.findOne({ userId: 836003 });
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
  await new PatternCommandHandlers({ sendMessage } as never).show(836003);
  const text = sendMessage.mock.calls.map(call => call[1]).join('');
  expect(text).toContain('旧定式原文');
  expect(text).toContain('部分记录的操作按钮暂不可用');
  expect(sendMessage.mock.calls.at(-1)?.[2]?.reply_markup).toBeUndefined();
  expect(await PatternTree.collection.findOne({ userId: 836003 })).toEqual(original);
});

test.each(['quick_\uD800', 'quick_status\n', 'a'.repeat(65), '中'.repeat(22), '', { toString: () => 'quick_status' }])(
  'invalid incoming callback data is refused before deduplication or personal state writes: %j', async data => {
    const bot = new SelfControlBot();
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    bot.bot = { sendMessage, answerCallbackQuery } as never;
    (bot as any).initializeHandlers(bot.bot);
    const claim = vi.spyOn(bot as any, 'claimProcessingKey');
    await bot.handleCallbackQuery({ id: 'invalid-test', from: { id: 836004 }, data,
      message: { message_id: 1, chat: { id: 836004, type: 'private' } }
    } as never);
    expect(claim).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledWith('invalid-test', expect.objectContaining({ show_alert: true }));
    expect(await TaskChain.countDocuments()).toBe(0);
    expect(await AuxChain.countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(0);
    expect(sendMessage.mock.calls.map(call => call[1]).join('')).not.toContain('操作失败');
  }
);

test('rejecting an invalid callback does not consume its update ID before a valid retry', async () => {
  const bot = new SelfControlBot();
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
  bot.bot = { sendMessage, answerCallbackQuery: vi.fn().mockResolvedValue(true) } as never;
  (bot as any).initializeHandlers(bot.bot);
  const query = { id: 'retry-boundary', from: { id: 836005 },
    message: { message_id: 1, chat: { id: 836005, type: 'private' } } };
  await bot.handleCallbackQuery({ ...query, data: 'quick_status\n' } as never);
  await bot.handleCallbackQuery({ ...query, data: 'quick_reserve' } as never);
  const { default: TaskDraft } = await import('../../src/models/TaskDraft.js');
  expect((await TaskDraft.findOne({ userId: 836005 }))?.mode).toBe('reserve');
  expect(await AuxChain.countDocuments()).toBe(0);
  expect(await TaskChain.countDocuments()).toBe(0);
});

test.each(['HTML', 'entities'])(
  'an invalid keyboard cannot make an already valid long %s message exceed the text limit', async format => {
    const calls: any[] = [];
    const bot = { sendMessage: async (...args: any[]) => {
      if (args[1].length > 4096) throw new Error('text limit');
      calls.push(args);
      return { message_id: calls.length };
    } };
    const text = 'a'.repeat(4090);
    const options = { ...(format === 'HTML' ? { parse_mode: 'HTML' as const }
      : { entities: [{ type: 'bold' as const, offset: 0, length: 10 }] }),
    reply_markup: { inline_keyboard: [[
      { text: 'broken', callback_data: 'b'.repeat(65) }, { text: 'valid', callback_data: 'quick_status' }
    ]] } };
    const before = structuredClone(options);
    const result = await sendTelegramMessage(bot as never, 836006, text, options);
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toContain('部分记录的操作按钮暂不可用');
    expect(calls[0][2]?.parse_mode).toBeUndefined();
    expect(calls[1][1]).toBe(text);
    expect(calls[1][2]?.parse_mode).toBe(options.parse_mode);
    expect(calls[1][2]?.entities).toEqual(options.entities);
    expect(calls[1][2]?.reply_markup.inline_keyboard).toEqual([
      [{ text: 'valid', callback_data: 'quick_status' }]
    ]);
    expect(result.message_id).toBe(2);
    expect(options).toEqual(before);
  }
);

test('a failed separate warning cannot block the safe formatted body', async () => {
  const sendMessage = vi.fn().mockRejectedValueOnce(new Error('warning transport unavailable'))
    .mockResolvedValueOnce({ message_id: 9 });
  const text = 'a'.repeat(4090);
  const result = await sendTelegramMessage({ sendMessage } as never, 836007, text, {
    parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'bad', callback_data: 'a'.repeat(65) }]] }
  });
  expect(result.message_id).toBe(9);
  expect(sendMessage.mock.calls[1]).toEqual([836007, text, { parse_mode: 'HTML' }]);
});
