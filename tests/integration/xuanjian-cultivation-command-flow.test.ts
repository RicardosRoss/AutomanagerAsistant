import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import CultivationCommandHandlers from '../../src/handlers/cultivationCommands.js';
import { User } from '../../src/models/index.js';

describe('玄鉴命令集成测试', () => {
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
  const deleteMessage = vi.fn().mockResolvedValue(true);
  const onText = vi.fn();
  let handler: CultivationCommandHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('/realm 应展示真实 canonical 持久化后的状态', async () => {
    const userId = 603001;
    const user = await User.create({
      userId,
      cultivation: {
        immortalStones: 8
      }
    });

    const canonical = user.ensureCanonicalCultivation();
    canonical.state.currentPower = 1;
    canonical.state.realmId = 'realm.taixi';
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    await handler.handleRealmCommand({
      chat: { id: userId },
      from: { id: userId }
    } as never);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const message = sendMessage.mock.calls[0]?.[1] as string;
    expect(message).toContain('📊 当前境界：胎息·玄景');
    expect(message).toContain('⚡ 当前修为：1');
    expect(message).toContain('🧭 当前道行：0');
    expect(message).toContain('☯️ 当前道统：通用');
    expect(message).toContain('📘 主修功法：玄门吐纳法');
    expect(message).toContain('💎 灵石：8');
    expect(message.indexOf('🧭 当前道行：0')).toBeLessThan(message.indexOf('☯️ 当前道统：通用'));
    expect(message.indexOf('☯️ 当前道统：通用')).toBeLessThan(message.indexOf('📘 主修功法：玄门吐纳法'));
  });

  test('/realm 应展示 phase-B 小阶文案', async () => {
    const userId = 603010;
    const user = await User.create({
      userId,
      cultivation: {
        immortalStones: 8
      }
    });

    const canonical = user.ensureCanonicalCultivation();
    canonical.state.currentPower = 60;
    canonical.state.realmId = 'realm.taixi';
    canonical.state.realmSubStageId = 'realmSubStage.taixi.qingyuan';
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    await handler.handleRealmCommand({
      chat: { id: userId },
      from: { id: userId }
    } as never);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const message = sendMessage.mock.calls[0]?.[1] as string;
    expect(message).toContain('📊 当前境界：胎息·青元');
  });

  test('/realm 应展示当前伤势与最近斗法摘要', async () => {
    const userId = 603011;
    const user = await User.create({
      userId,
      cultivation: {
        immortalStones: 8
      }
    });

    const canonical = user.ensureCanonicalCultivation();
    canonical.state.currentPower = 60;
    canonical.state.realmId = 'realm.taixi';
    canonical.state.injuryState = {
      level: 'light',
      modifiers: ['combat_loss']
    };
    canonical.state.combatHistorySummary = [{
      encounterId: 'combatEncounter.taixi.roadside_wolf',
      result: 'loss',
      happenedAt: new Date('2026-04-22T10:00:00.000Z'),
      summary: '你被拦路青狼逼退。',
      enemyName: '拦路青狼'
    }];
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    await handler.handleRealmCommand({
      chat: { id: userId },
      from: { id: userId }
    } as never);

    const message = sendMessage.mock.calls[0]?.[1] as string;
    expect(message).toContain('🩹 当前伤势：轻伤');
    expect(message).toContain('⚔️ 最近斗法：你被拦路青狼逼退。');
  });

  test('/realm 在筑基后锁定主道统时应展示当前主道统', async () => {
    const userId = 603017;
    const user = await User.create({
      userId,
      cultivation: {
        immortalStones: 8
      }
    });

    const canonical = user.ensureCanonicalCultivation();
    canonical.state.currentPower = 640;
    canonical.state.realmId = 'realm.zhuji';
    canonical.state.realmSubStageId = 'realmSubStage.zhuji.middle';
    canonical.state.mainDaoTrack = 'mingyang';
    canonical.state.mainMethodId = 'method.zhuji_mingyang_script';
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    await handler.handleRealmCommand({
      chat: { id: userId },
      from: { id: userId }
    } as never);

    const message = sendMessage.mock.calls[0]?.[1] as string;
    expect(message).toContain('☯️ 当前主道统：明阳');
    expect(message.indexOf('🧭 当前道行：0')).toBeLessThan(message.indexOf('☯️ 当前主道统：明阳'));
    expect(message.indexOf('☯️ 当前主道统：明阳')).toBeLessThan(message.indexOf('📘 主修功法：上府明谒经'));
  });

  test('/divination 应只影响灵石，不影响 canonical 修为', async () => {
    const userId = 603002;
    const user = await User.create({
      userId,
      cultivation: {
        immortalStones: 100
      }
    });

    const canonical = user.ensureCanonicalCultivation();
    canonical.state.currentPower = 1;
    canonical.state.realmId = 'realm.taixi';
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    await handler.handleDivinationCommand({
      chat: { id: userId },
      from: { id: userId }
    } as never, ['', '10'] as never);

    const persistedUser = await User.findOne({ userId });

    expect(deleteMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    const finalMessage = sendMessage.mock.calls.at(-1)?.[1] as string;
    expect(finalMessage).toContain('🧭 本次不影响境界与修为');
    expect(finalMessage).toContain('💎 当前灵石：140');
    expect(persistedUser?.cultivation.spiritualPower).toBe(1);
    expect(persistedUser?.cultivation.canonical?.state.currentPower).toBe(1);
    expect(persistedUser?.cultivation.immortalStones).toBe(140);
  });

  test('/equip_art 应持久化 battleLoadout 主战法门列表', async () => {
    const userId = 603012;
    const user = await User.create({
      userId,
      cultivation: {
        immortalStones: 8
      }
    });

    const canonical = user.ensureCanonicalCultivation();
    canonical.state.currentPower = 60;
    canonical.state.realmId = 'realm.taixi';
    canonical.state.knownBattleArtIds = ['art.basic_guarding_hand', 'art.cloud_step'];
    canonical.state.equippedBattleArtIds = ['art.basic_guarding_hand', 'art.cloud_step'];
    canonical.state.battleLoadout.equippedBattleArtIds = ['art.basic_guarding_hand'];
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    await handler.handleEquipArtCommand({
      chat: { id: userId },
      from: { id: userId }
    } as never, ['', 'art.cloud_step'] as never);

    const persistedUser = await User.findOne({ userId });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[1]).toContain('主战法门已更新');
    expect(persistedUser?.cultivation.canonical?.state.battleLoadout.equippedBattleArtIds).toEqual(['art.cloud_step']);
  });

  test('/equip_power 应在紫府前拒绝配装神通', async () => {
    const userId = 603015;
    const user = await User.create({
      userId,
      cultivation: {
        immortalStones: 8
      }
    });

    const canonical = user.ensureCanonicalCultivation();
    canonical.state.currentPower = 240;
    canonical.state.realmId = 'realm.lianqi';
    canonical.state.realmSubStageId = 'realmSubStage.lianqi.4';
    canonical.state.knownDivinePowerIds = ['power.spirit_flash'];
    canonical.state.equippedDivinePowerIds = [];
    canonical.state.battleLoadout.equippedDivinePowerIds = [];
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    await handler.handleEquipPowerCommand({
      chat: { id: userId },
      from: { id: userId }
    } as never, ['', 'power.spirit_flash'] as never);

    const persistedUser = await User.findOne({ userId });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[1]).toContain('当前境界尚未开启神通槽');
    expect(persistedUser?.cultivation.canonical?.state.battleLoadout.equippedDivinePowerIds).toEqual([]);
  });

  test('/dev_grant_art 应在开发环境持久化 knownBattleArtIds', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const userId = 603013;
    const user = await User.create({
      userId,
      cultivation: {
        immortalStones: 8
      }
    });

    const canonical = user.ensureCanonicalCultivation();
    canonical.state.currentPower = 60;
    canonical.state.realmId = 'realm.taixi';
    canonical.state.knownBattleArtIds = ['art.basic_guarding_hand', 'art.cloud_step'];
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    await handler.handleDevGrantArtCommand({
      chat: { id: userId },
      from: { id: userId }
    } as never, ['', 'art.golden_light_art,art.fire_sparrow_art'] as never);

    const persistedUser = await User.findOne({ userId });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[1]).toContain('开发法门授予成功');
    expect(persistedUser?.cultivation.canonical?.state.knownBattleArtIds).toEqual([
      'art.basic_guarding_hand',
      'art.cloud_step',
      'art.golden_light_art',
      'art.fire_sparrow_art'
    ]);
  });

  test('/dev_grant_power 应在开发环境持久化 knownDivinePowerIds', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const userId = 603016;
    const user = await User.create({
      userId,
      cultivation: {
        immortalStones: 8
      }
    });

    const canonical = user.ensureCanonicalCultivation();
    canonical.state.currentPower = 1200;
    canonical.state.realmId = 'realm.zifu';
    canonical.state.realmSubStageId = 'realmSubStage.zifu.early';
    canonical.state.knownDivinePowerIds = ['power.invoking_heaven_gate'];
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    await handler.handleDevGrantPowerCommand({
      chat: { id: userId },
      from: { id: userId }
    } as never, ['', 'power.clear_heart,power.long_bright_steps'] as never);

    const persistedUser = await User.findOne({ userId });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[1]).toContain('开发神通授予成功');
    expect(persistedUser?.cultivation.canonical?.state.knownDivinePowerIds).toEqual([
      'power.invoking_heaven_gate',
      'power.clear_heart',
      'power.long_bright_steps'
    ]);
  });

  test('/dev_combat_detail on 应在开发环境持久化详细战报开关', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const userId = 603014;
    await User.create({
      userId,
      cultivation: {
        immortalStones: 8
      }
    });

    await handler.handleDevCombatDetailCommand({
      chat: { id: userId },
      from: { id: userId }
    } as never, ['', 'on'] as never);

    const persistedUser = await User.findOne({ userId });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[1]).toContain('详细战报已开启');
    expect(persistedUser?.cultivation.canonical?.state.combatFlags.devCombatDetailEnabled).toBe(true);
  });
});
