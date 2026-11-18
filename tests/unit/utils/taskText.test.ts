import { expect, test } from 'vitest';
import { isValidTaskDescription, previewTaskDescription, splitTelegramPlainText } from '../../../src/utils/taskText.js';

test('description limits count Unicode code points and reject malformed surrogate input', () => {
  expect(isValidTaskDescription('📖'.repeat(1000))).toBe(true);
  expect(isValidTaskDescription('📖'.repeat(1001))).toBe(false);
  expect(isValidTaskDescription('x'.repeat(1000))).toBe(true);
  expect(isValidTaskDescription('x'.repeat(1001))).toBe(false);
  expect(isValidTaskDescription('  ')).toBe(false);
  expect(isValidTaskDescription('', true)).toBe(true);
  expect(isValidTaskDescription('\ud800')).toBe(false);
  expect(isValidTaskDescription('\udfff')).toBe(false);
  expect(isValidTaskDescription('x\ud800y', true)).toBe(false);
});

test('legacy previews preserve boundary content and never cut a supplementary character', () => {
  const limit = '📖'.repeat(1000);
  expect(previewTaskDescription(limit)).toBe(limit);
  const preview = previewTaskDescription(limit + '末尾');
  expect(preview.startsWith(limit)).toBe(true);
  expect(preview).toContain('仅显示前1000个字符');
  expect(preview).not.toContain('末尾');
  expect(preview.length).toBeLessThanOrEqual(4096);
  expect(previewTaskDescription(undefined)).toBe('');
});

test('plain-text chunks round-trip at Telegram limits without splitting surrogate pairs', () => {
  expect(splitTelegramPlainText('')).toEqual([]);
  expect(splitTelegramPlainText('a'.repeat(4096))).toEqual(['a'.repeat(4096)]);
  const text = 'a'.repeat(4095) + '📖' + 'b'.repeat(4096);
  const chunks = splitTelegramPlainText(text);
  expect(chunks.join('')).toBe(text);
  expect(chunks[0]?.length).toBe(4095);
  for (const chunk of chunks) {
    expect(chunk.length).toBeLessThanOrEqual(4096);
    for (const character of chunk) {
      const codePoint = character.codePointAt(0)!;
      expect(codePoint < 0xd800 || codePoint > 0xdfff).toBe(true);
    }
  }
});
