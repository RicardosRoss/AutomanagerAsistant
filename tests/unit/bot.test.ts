import { describe, expect, test, vi } from 'vitest';
import SelfControlBot from '../../src/bot.js';

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
});
