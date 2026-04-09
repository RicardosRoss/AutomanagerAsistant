import { afterEach, describe, expect, test, vi } from 'vitest';

describe('BotConfig polling options', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  test('disables polling auto start so startup is controlled explicitly', async () => {
    vi.stubEnv('NODE_ENV', 'test');

    vi.doMock('../../../config/index.js', () => ({
      default: {
        app: {
          environment: 'test',
          version: '1.0.0'
        },
        telegram: {
          token: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi',
          polling: true
        },
        logging: {
          level: 'info'
        },
        api: {
          rateLimit: {
            perMinute: 60
          }
        }
      }
    }));

    const { default: BotConfig } = await import('../../../src/config/bot.js');
    const botConfig = new BotConfig();
    const options = botConfig.getBotOptions();

    expect(options.polling).toMatchObject({
      autoStart: false,
      interval: 1000,
      params: {
        timeout: 10
      }
    });
  });
});
