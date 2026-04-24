import type TelegramBot from 'node-telegram-bot-api';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { User } from '../../src/models/index.js';

type MessageHandler = (msg: TelegramBot.Message) => unknown;
type OnTextHandler = (msg: TelegramBot.Message, match: RegExpExecArray | null) => unknown;

class FakeTelegramBot {
  sendMessage = vi.fn().mockImplementation(async () => ({ message_id: ++this.messageIdCounter }));

  deleteMessage = vi.fn().mockResolvedValue(true);

  answerCallbackQuery = vi.fn().mockResolvedValue(true);

  private readonly eventHandlers = new Map<string, MessageHandler[]>();

  private readonly textHandlers: Array<{ regex: RegExp; handler: OnTextHandler }> = [];

  private messageIdCounter = 1000;

  on(event: string, handler: MessageHandler): this {
    const handlers = this.eventHandlers.get(event) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
    return this;
  }

  onText(regex: RegExp, handler: OnTextHandler): this {
    this.textHandlers.push({ regex, handler });
    return this;
  }

  async emitMessage(text: string, userId: number, messageId: number): Promise<void> {
    const message = {
      message_id: messageId,
      chat: { id: userId },
      from: { id: userId, first_name: 'Test', last_name: 'User' },
      text
    } as TelegramBot.Message;

    for (const handler of this.eventHandlers.get('message') ?? []) {
      await handler(message);
    }

    for (const { regex, handler } of this.textHandlers) {
      const match = regex.exec(text);
      if (match) {
        handler(message, match);
      }
      regex.lastIndex = 0;
    }
  }
}

async function bootstrapBot(fakeBot: FakeTelegramBot) {
  const { default: SelfControlBot } = await import('../../src/bot.js');
  const bot = new SelfControlBot();
  (bot as unknown as { bot: FakeTelegramBot }).bot = fakeBot;
  (bot as unknown as { initializeHandlers: (instance: FakeTelegramBot) => void }).initializeHandlers(fakeBot);
  bot.registerEventHandlers();
  return bot;
}

async function seedCanonicalUser(userId: number, options: {
  currentPower: number;
  realmId?: 'realm.taixi' | 'realm.lianqi';
  immortalStones: number;
  cultivationAttainment?: number;
}): Promise<void> {
  const user = await User.create({
    userId,
    cultivation: {
      immortalStones: options.immortalStones
    }
  });

  const canonical = user.ensureCanonicalCultivation();
  canonical.state.currentPower = options.currentPower;
  canonical.state.realmId = options.realmId ?? 'realm.taixi';
  canonical.state.cultivationAttainment = options.cultivationAttainment ?? 0;
  user.replaceCanonicalCultivation(canonical);
  user.syncLegacyCultivationShell();
  await user.save();
}

describe('玄鉴 Telegram bot 命令接线集成测试', () => {
  let fakeBot: FakeTelegramBot;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeBot = new FakeTelegramBot();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('/realm update 应通过 onText 接线展示 canonical 持久化状态', async () => {
    const userId = 604001;
    await bootstrapBot(fakeBot);
    await seedCanonicalUser(userId, {
      currentPower: 1,
      immortalStones: 8
    });

    await fakeBot.emitMessage('/realm', userId, 9001);

    await vi.waitFor(() => {
      expect(fakeBot.sendMessage).toHaveBeenCalledTimes(1);
    });

    const message = fakeBot.sendMessage.mock.calls[0]?.[1] as string;
    expect(message).toContain('📊 当前境界：胎息·玄景');
    expect(message).toContain('⚡ 当前修为：1');
    expect(message).toContain('🧭 当前道行：0');
    expect(message).toContain('💎 灵石：8');
  });

  test('/divination 10 update 应只影响灵石，不影响 canonical 修为', async () => {
    const userId = 604002;
    await bootstrapBot(fakeBot);
    await seedCanonicalUser(userId, {
      currentPower: 1,
      immortalStones: 100
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    await fakeBot.emitMessage('/divination 10', userId, 9002);

    await vi.waitFor(() => {
      expect(fakeBot.sendMessage).toHaveBeenCalledTimes(2);
      expect(fakeBot.deleteMessage).toHaveBeenCalledTimes(1);
    });

    const persistedUser = await User.findOne({ userId });
    const finalMessage = fakeBot.sendMessage.mock.calls.at(-1)?.[1] as string;

    expect(finalMessage).toContain('🧭 本次不影响境界与修为');
    expect(finalMessage).toContain('💎 当前灵石：140');
    expect(persistedUser?.cultivation.spiritualPower).toBe(1);
    expect(persistedUser?.cultivation.canonical?.state.currentPower).toBe(1);
    expect(persistedUser?.cultivation.immortalStones).toBe(140);
  });

  test('/breakthrough update 应通过 onText 接线完成破境并发出结果文案', async () => {
    const userId = 604003;
    await bootstrapBot(fakeBot);
    await seedCanonicalUser(userId, {
      currentPower: 120,
      immortalStones: 5
    });

    await fakeBot.emitMessage('/breakthrough', userId, 9003);

    await vi.waitFor(() => {
      expect(fakeBot.sendMessage).toHaveBeenCalledTimes(2);
      expect(fakeBot.deleteMessage).toHaveBeenCalledTimes(1);
    });

    const persistedUser = await User.findOne({ userId });
    const finalMessage = fakeBot.sendMessage.mock.calls.at(-1)?.[1] as string;

    expect(finalMessage).toContain('成功突破至 练气');
    expect(persistedUser?.cultivation.realm).toBe('练气');
    expect(persistedUser?.cultivation.realmId).toBe(2);
    expect(persistedUser?.cultivation.spiritualPower).toBe(120);
    expect(persistedUser?.cultivation.canonical?.state.realmId).toBe('realm.lianqi');
    expect(persistedUser?.cultivation.canonical?.state.currentPower).toBe(120);
  });

  test('/equip_art update 应通过 onText 接线持久化主战法门', async () => {
    const userId = 604004;
    await bootstrapBot(fakeBot);
    await seedCanonicalUser(userId, {
      currentPower: 60,
      immortalStones: 8
    });

    await User.updateOne(
      { userId },
      {
        $set: {
          'cultivation.canonical.state.knownBattleArtIds': ['art.basic_guarding_hand', 'art.cloud_step'],
          'cultivation.canonical.state.equippedBattleArtIds': ['art.basic_guarding_hand', 'art.cloud_step'],
          'cultivation.canonical.state.battleLoadout.equippedBattleArtIds': ['art.basic_guarding_hand']
        }
      }
    );

    await fakeBot.emitMessage('/equip_art art.cloud_step', userId, 9004);

    await vi.waitFor(async () => {
      const persistedUser = await User.findOne({ userId });
      expect(fakeBot.sendMessage).toHaveBeenCalledTimes(1);
      expect(persistedUser?.cultivation.canonical?.state.battleLoadout.equippedBattleArtIds).toEqual(['art.cloud_step']);
    });

    const message = fakeBot.sendMessage.mock.calls[0]?.[1] as string;
    expect(message).toContain('主战法门已更新');
  });

  test('/dev_grant_art update 应通过 onText 接线授予法门', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const userId = 604005;
    await bootstrapBot(fakeBot);
    await seedCanonicalUser(userId, {
      currentPower: 60,
      immortalStones: 8
    });

    await fakeBot.emitMessage('/dev_grant_art art.golden_light_art', userId, 9005);

    await vi.waitFor(async () => {
      const persistedUser = await User.findOne({ userId });
      expect(persistedUser?.cultivation.canonical?.state.knownBattleArtIds).toContain('art.golden_light_art');
    });

    const message = fakeBot.sendMessage.mock.calls.at(-1)?.[1] as string;
    expect(message).toContain('开发法门授予成功');
    expect(message).toContain('金光术');
  });

  test('/dev_grant_power update 应通过 onText 接线授予神通', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const userId = 604007;
    await bootstrapBot(fakeBot);
    await seedCanonicalUser(userId, {
      currentPower: 1200,
      realmId: 'realm.taixi',
      immortalStones: 8
    });

    await User.updateOne(
      { userId },
      {
        $set: {
          'cultivation.canonical.state.realmId': 'realm.zifu',
          'cultivation.canonical.state.realmSubStageId': 'realmSubStage.zifu.early',
          'cultivation.canonical.state.currentPower': 1200,
          'cultivation.canonical.state.knownDivinePowerIds': ['power.invoking_heaven_gate']
        }
      }
    );

    await fakeBot.emitMessage('/dev_grant_power power.clear_heart', userId, 9007);

    await vi.waitFor(async () => {
      const persistedUser = await User.findOne({ userId });
      expect(persistedUser?.cultivation.canonical?.state.knownDivinePowerIds).toContain('power.clear_heart');
    });

    const message = fakeBot.sendMessage.mock.calls.at(-1)?.[1] as string;
    expect(message).toContain('开发神通授予成功');
    expect(message).toContain('昭澈心');
  });

  test('/dev_combat_detail on update 应通过 onText 接线开启详细战报', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const userId = 604006;
    await bootstrapBot(fakeBot);
    await seedCanonicalUser(userId, {
      currentPower: 60,
      immortalStones: 8
    });

    await fakeBot.emitMessage('/dev_combat_detail on', userId, 9006);

    await vi.waitFor(async () => {
      const persistedUser = await User.findOne({ userId });
      expect(persistedUser?.cultivation.canonical?.state.combatFlags.devCombatDetailEnabled).toBe(true);
    });

    const message = fakeBot.sendMessage.mock.calls.at(-1)?.[1] as string;
    expect(message).toContain('详细战报已开启');
  });
});
