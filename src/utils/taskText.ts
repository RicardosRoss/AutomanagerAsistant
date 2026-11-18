import { MAX_TASK_DESCRIPTION_CHARACTERS, TASK_DESCRIPTION_PREVIEW_SUFFIX } from './constants.js';

export function isValidTaskDescription(text: string, allowEmpty = false): boolean {
  let count = 0;
  for (const character of text.trim()) {
    count += 1;
    if (count > MAX_TASK_DESCRIPTION_CHARACTERS) return false;
    const codePoint = character.codePointAt(0)!;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) return false;
  }
  return allowEmpty || count > 0;
}

export function previewTaskDescription(text: string | null | undefined): string {
  let preview = '';
  let count = 0;
  for (const character of text ?? '') {
    if (count === MAX_TASK_DESCRIPTION_CHARACTERS) return preview + TASK_DESCRIPTION_PREVIEW_SUFFIX;
    preview += character;
    count += 1;
  }
  return preview;
}

export function splitTelegramPlainText(text: string): string[] {
  const chunks: string[] = [];
  let chunk = '';
  for (const character of text) {
    // UTF-16 length is conservative for Telegram's character limit, and
    // iterating code points prevents splitting a supplementary character.
    if (chunk.length + character.length > 4096) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += character;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
