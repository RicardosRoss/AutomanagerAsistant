import type TelegramBot from 'node-telegram-bot-api';
import { splitTelegramPlainText } from './taskText.js';
import logger from './logger.js';

type TextOptions = TelegramBot.SendMessageOptions & { entities?: TelegramBot.MessageEntity[] };

export function isValidTelegramCallbackData(value: unknown): value is string {
  if (typeof value !== 'string' || !value.length || Buffer.byteLength(value, 'utf8') > 64) return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint < 0x20 || codePoint >= 0x7f && codePoint <= 0x9f ||
        codePoint >= 0xd800 && codePoint <= 0xdfff) return false;
  }
  return true;
}

export async function sendTelegramMessage(
  bot: Pick<TelegramBot, 'sendMessage'>,
  chatId: TelegramBot.ChatId,
  text: string,
  options?: TextOptions
): Promise<TelegramBot.Message> {
  const markup = options?.reply_markup;
  if (markup && typeof markup === 'object' && 'inline_keyboard' in markup) {
    let removed = 0;
    const keyboard = markup.inline_keyboard.map(row => row.filter(button => {
      if ('callback_data' in button && !isValidTelegramCallbackData(button.callback_data)) {
        removed += 1;
        return false;
      }
      return true;
    })).filter(row => row.length);
    if (removed) {
      // Keep the original record and valid controls; never truncate or rebind an ID.
      const { reply_markup: _originalMarkup, ...rest } = options!;
      options = keyboard.length ? { ...rest, reply_markup: { ...markup, inline_keyboard: keyboard } } : rest;
      const notice = '部分记录的操作按钮暂不可用。请查看当前状态；若仍无法操作，请联系管理员检查记录。';
      if ((options.parse_mode || options.entities?.length) && text.length + notice.length + 2 > 4096) {
        // Keep formatted text and entity offsets intact; send the small notice first.
        await bot.sendMessage(chatId, notice).catch(error => {
          logger.warn('按钮异常提示未送达，继续发送可读正文', { chatId,
            error: error instanceof Error ? error.message : String(error) });
        });
      } else {
        text += `\n\n${notice}`;
      }
      logger.warn('无效 callback 按钮已移除，正文和有效操作保留', { chatId, removed });
    }
  }
  if (options?.parse_mode || options?.entities?.length || text.length <= 4096) {
    return options === undefined ? bot.sendMessage(chatId, text) : bot.sendMessage(chatId, text, options);
  }
  const chunks = splitTelegramPlainText(text);
  const { reply_markup, ...baseOptions } = options ?? {};
  let result!: TelegramBot.Message;
  for (let index = 0; index < chunks.length; index += 1) {
    const last = index === chunks.length - 1;
    const chunkOptions = last && reply_markup ? { ...baseOptions, reply_markup } : baseOptions;
    result = await bot.sendMessage(chatId, chunks[index]!, chunkOptions);
  }
  return result;
}

export function databaseErrorNotice(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Error && error.name === 'VersionError' ||
      /No matching document found for id|\bVersionError\b/.test(message)) {
    return '账户状态已变化，请用 /status 或 /realm 查看当前状态后重试';
  }
  if (/E11000|duplicate key error|Cast to .* failed|ValidationError/.test(message)) {
    return '记录状态异常，请查看当前状态后重试；如持续出现，请联系管理员检查记录';
  }
  return null;
}
