import { expect, test, vi } from 'vitest';
import type TelegramBot from 'node-telegram-bot-api';
import PatternCommandHandlers from '../../src/handlers/patternCommands.js';
import PatternTree from '../../src/models/PatternTree.js';
import User from '../../src/models/User.js';
import SelfControlBot from '../../src/bot.js';

const load = () => import(new URL('../../src/utils/telegramMessages.ts', import.meta.url).href);

test('long Unicode output stays complete and puts actionable buttons on the last message', async () => {
  const { sendTelegramMessage } = await load();
  const sent: Array<{ text: string; options?: TelegramBot.SendMessageOptions }> = [];
  const bot = {
    sendMessage: async (_id: number, text: string, options?: TelegramBot.SendMessageOptions) => {
      if (text.length > 4096) throw new Error('Telegram limit exceeded');
      sent.push({ text, options });
      return { message_id: sent.length, chat: { id: 832020, type: 'private' }, date: 1 };
    }
  };
  const text = '正文[保持原样]_$&📖'.repeat(700);
  const markup = { inline_keyboard: [[{ text: '确认', callback_data: 'quick_status' }]] };
  const result = await sendTelegramMessage(bot as never, 832020, text, { reply_markup: markup });
  expect(sent.map(item => item.text).join('')).toBe(text);
  expect(sent.length).toBeGreaterThan(1);
  for (const item of sent) {
    expect(item.text.length).toBeLessThanOrEqual(4096);
    expect(item.options?.parse_mode).toBeUndefined();
    expect(item.text).not.toMatch(/[\uD800-\uDBFF]$/u);
  }
  expect(sent.slice(0, -1).every(item => item.options?.reply_markup === undefined)).toBe(true);
  expect(sent.at(-1)?.options?.reply_markup).toEqual(markup);
  expect(result.message_id).toBe(sent.length);
});

test('formatted static output keeps the original Telegram request without splitting markup', async () => {
  const { sendTelegramMessage } = await load();
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 7 });
  await sendTelegramMessage({ sendMessage } as never, 832020, '<b>帮助</b>', { parse_mode: 'HTML' });
  expect(sendMessage.mock.calls).toEqual([[832020, '<b>帮助</b>', { parse_mode: 'HTML' }]]);
});

test('partial delivery failure stops without resending previously delivered chunks', async () => {
  const { sendTelegramMessage } = await load();
  const sendMessage = vi.fn().mockResolvedValueOnce({ message_id: 1 }).mockRejectedValue(new Error('Telegram offline'));
  await expect(sendTelegramMessage({ sendMessage } as never, 832020, '长'.repeat(10000))).rejects.toThrow('offline');
  expect(sendMessage.mock.calls).toHaveLength(2);
  expect(sendMessage.mock.calls[0]?.[1].length).toBe(4096);
});

test('a historical pattern page fits Telegram limits and still delivers its existing action buttons', async () => {
  const messages: Array<{ text: string; options?: TelegramBot.SendMessageOptions }> = [];
  const bot = {
    sendMessage: async (_id: number, text: string, options?: TelegramBot.SendMessageOptions) => {
      if (text.length > 4096) throw new Error('Telegram limit exceeded');
      messages.push({ text, options });
      return { message_id: messages.length };
    }
  };
  const nodes = Array.from({ length: 10 }, (_, index) => ({
    nodeId: `historical-${index}`,
    title: '旧规则📖'.repeat(150),
    createdOn: '2026-01-01',
    status: 'pending',
    children: []
  }));
  await PatternTree.collection.insertOne({ userId: 832021, treeId: 'historical-pattern-page', nodes });
  await new PatternCommandHandlers(bot as never).show(832021);
  const all = messages.map(item => item.text).join('');
  for (const node of nodes) expect(all).toContain(node.title);
  expect(messages.at(-1)?.options?.reply_markup).toHaveProperty('inline_keyboard');
  expect((await PatternTree.collection.findOne({ userId: 832021 }))?.nodes).toEqual(nodes);
});

test('a wrapped real account version conflict gets a Chinese retry notice without document internals', async () => {
  await User.create({ userId: 832022 });
  const first = (await User.findOne({ userId: 832022 }))!;
  const stale = (await User.findOne({ userId: 832022 }))!;
  first.settings.defaultDuration = 30;
  await first.save();
  stale.settings.defaultDuration = 45;
  let conflict: Error | undefined;
  try {
    await stale.save();
  } catch (error) {
    conflict = error as Error;
  }
  expect(conflict?.name).toBe('VersionError');
  const message = new SelfControlBot().getUserFriendlyError(`创建任务失败: ${conflict!.message}`);
  expect(message).toContain('状态已变化');
  expect(message).toContain('重试');
  expect(message).not.toContain(first._id.toString());
  expect(message).not.toContain('modifiedPaths');
});
