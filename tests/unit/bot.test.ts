import { beforeEach, describe, expect, test, vi } from 'vitest';
import SelfControlBot from '../../src/bot.js';
import logger from '../../src/utils/logger.js';

beforeEach(() => {
  vi.restoreAllMocks();
  const processedUpdateCache = (
    SelfControlBot as unknown as { processedUpdateCache: Map<string, number> }
  ).processedUpdateCache;
  processedUpdateCache.clear();
});

describe('SelfControlBot incoming update deduplication', () => {
  test('ignores duplicate message updates with the same message id', async () => {
    const handleStatusCommand = vi.fn().mockResolvedValue(undefined);
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const bot = Object.create(SelfControlBot.prototype) as SelfControlBot & {
      coreHandlers: {
        handleStatusCommand: ReturnType<typeof vi.fn>;
      };
    };

    bot.coreHandlers = {
      handleStatusCommand
    };

    const message = {
      message_id: 2024,
      chat: { id: 5515965469 },
      from: { id: 5515965469, first_name: 'Qing', last_name: 'Yu' },
      text: '/status'
    };

    await bot.handleMessage(message as never);
    await bot.handleMessage(message as never);

    expect(handleStatusCommand).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith(
      '收到 Telegram message update',
      expect.objectContaining({
        userId: 5515965469,
        chatId: 5515965469,
        messageId: 2024,
        updateKey: 'message:5515965469:2024',
        isCommand: true,
        text: '/status'
      })
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '忽略重复的 Telegram message update',
      expect.objectContaining({
        userId: 5515965469,
        chatId: 5515965469,
        messageId: 2024,
        updateKey: 'message:5515965469:2024'
      })
    );
  });

  test('ignores duplicate callback query updates with the same callback id', async () => {
    const answerCallbackQuery = vi.fn().mockResolvedValue(undefined);
    const handleStatsCommand = vi.fn().mockResolvedValue(undefined);
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const bot = Object.create(SelfControlBot.prototype) as SelfControlBot & {
      bot: {
        answerCallbackQuery: ReturnType<typeof vi.fn>;
      };
      coreHandlers: {
        handleStatsCommand: ReturnType<typeof vi.fn>;
      };
    };

    bot.bot = {
      answerCallbackQuery
    };
    bot.coreHandlers = {
      handleStatsCommand
    };

    const callbackQuery = {
      id: 'duplicate-callback',
      from: { id: 5515965469 },
      data: 'quick_stats',
      message: { message_id: 777 }
    };

    await bot.handleCallbackQuery(callbackQuery as never);
    await bot.handleCallbackQuery(callbackQuery as never);

    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(handleStatsCommand).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith(
      '收到 Telegram callback_query update',
      expect.objectContaining({
        userId: 5515965469,
        callbackId: 'duplicate-callback',
        callbackData: 'quick_stats',
        messageId: 777,
        updateKey: 'callback-update:duplicate-callback',
        actionKey: 'callback-action:5515965469:777:quick_stats'
      })
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '忽略重复的 Telegram callback_query update',
      expect.objectContaining({
        userId: 5515965469,
        callbackId: 'duplicate-callback',
        callbackData: 'quick_stats',
        updateKey: 'callback-update:duplicate-callback'
      })
    );
  });

  test('throttles repeated callback actions fired in quick succession', async () => {
    const answerCallbackQuery = vi.fn().mockResolvedValue(undefined);
    const handleStatsCommand = vi.fn().mockResolvedValue(undefined);
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const bot = Object.create(SelfControlBot.prototype) as SelfControlBot & {
      bot: {
        answerCallbackQuery: ReturnType<typeof vi.fn>;
      };
      coreHandlers: {
        handleStatsCommand: ReturnType<typeof vi.fn>;
      };
    };

    bot.bot = {
      answerCallbackQuery
    };
    bot.coreHandlers = {
      handleStatsCommand
    };

    await bot.handleCallbackQuery({
      id: 'callback-1',
      from: { id: 5515965469 },
      data: 'quick_stats',
      message: { message_id: 888 }
    } as never);

    await bot.handleCallbackQuery({
      id: 'callback-2',
      from: { id: 5515965469 },
      data: 'quick_stats',
      message: { message_id: 888 }
    } as never);

    expect(handleStatsCommand).toHaveBeenCalledTimes(1);
    expect(answerCallbackQuery).toHaveBeenCalledTimes(2);
    expect(answerCallbackQuery).toHaveBeenLastCalledWith('callback-2', {
      text: '操作处理中，请勿重复点击',
      show_alert: false
    });
    expect(warnSpy).toHaveBeenCalledWith(
      '忽略短时间内重复触发的 callback 操作',
      expect.objectContaining({
        userId: 5515965469,
        callbackId: 'callback-2',
        callbackData: 'quick_stats',
        messageId: 888,
        actionKey: 'callback-action:5515965469:888:quick_stats'
      })
    );
  });
});

describe('SelfControlBot callback query handling', () => {
  test('ignores expired callback query acknowledgement errors', async () => {
    const bot = Object.create(SelfControlBot.prototype) as SelfControlBot & {
      bot: {
        answerCallbackQuery: ReturnType<typeof vi.fn>;
      };
    };

    bot.bot = {
      answerCallbackQuery: vi.fn().mockRejectedValue(
        new Error(
          'ETELEGRAM: 400 Bad Request: query is too old and response timeout expired or query ID is invalid'
        )
      )
    };

    await expect(
      bot.handleCallbackQuery({
        id: 'expired-query',
        from: { id: 5515965469 },
        data: 'quick_rankings'
      } as never)
    ).resolves.toBeUndefined();

    expect(bot.bot.answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  test('routes guardian encounter callbacks to TaskCommandHandlers', async () => {
    const answerCallbackQuery = vi.fn().mockResolvedValue(undefined);
    const handleAbandonEncounterCallback = vi.fn().mockResolvedValue(undefined);
    const handleContestEncounterCallback = vi.fn().mockResolvedValue(undefined);
    const bot = Object.create(SelfControlBot.prototype) as SelfControlBot & {
      bot: {
        answerCallbackQuery: ReturnType<typeof vi.fn>;
      };
      taskHandlers: {
        handleAbandonEncounterCallback: ReturnType<typeof vi.fn>;
        handleContestEncounterCallback: ReturnType<typeof vi.fn>;
      };
    };

    bot.bot = {
      answerCallbackQuery
    };
    bot.taskHandlers = {
      handleAbandonEncounterCallback,
      handleContestEncounterCallback
    };

    await bot.handleCallbackQuery({
      id: 'guardian-contest',
      from: { id: 5515965469 },
      data: 'encounter_contest_offer_1',
      message: { message_id: 901 }
    } as never);

    await bot.handleCallbackQuery({
      id: 'guardian-abandon',
      from: { id: 5515965469 },
      data: 'encounter_abandon_offer_1',
      message: { message_id: 902 }
    } as never);

    expect(handleContestEncounterCallback).toHaveBeenCalledWith(5515965469, 'encounter_contest_offer_1');
    expect(handleAbandonEncounterCallback).toHaveBeenCalledWith(5515965469, 'encounter_abandon_offer_1');
  });
});

describe('SelfControlBot polling error handling', () => {
  test('does not exit the process for transient EFATAL network reset errors', async () => {
    const bot = Object.create(SelfControlBot.prototype) as SelfControlBot;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await bot.handleError(
      Object.assign(new Error('EFATAL: Error: read ECONNRESET'), {
        code: 'EFATAL'
      })
    );

    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  test('logs a clear diagnostic for Telegram 409 polling conflicts', async () => {
    const bot = Object.create(SelfControlBot.prototype) as SelfControlBot;
    const logErrorSpy = vi.spyOn(logger, 'logError').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const pollingConflictMessage = [
      'ETELEGRAM: 409 Conflict: terminated by other getUpdates request; ',
      'make sure that only one bot instance is running'
    ].join('');

    await bot.handleError(
      Object.assign(
        new Error(pollingConflictMessage),
        {
          code: 'ETELEGRAM'
        }
      )
    );

    expect(logErrorSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      '检测到 Telegram polling 409 conflict，请检查是否有多个 Bot 实例同时运行',
      expect.objectContaining({
        code: 'ETELEGRAM',
        error: expect.stringContaining('409 Conflict')
      })
    );
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
    errorSpy.mockRestore();
    logErrorSpy.mockRestore();
  });
});
