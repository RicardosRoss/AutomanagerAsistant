import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import CultivationCommandHandlers from '../../../src/handlers/cultivationCommands.js';

describe('CultivationCommandHandlers', () => {
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
  const deleteMessage = vi.fn().mockResolvedValue(true);
  const onText = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  test('/realm 应展示玄鉴体系字段（含道行）', async () => {
    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      getCultivationStatus: vi.fn().mockResolvedValue({
        user: {
          cultivation: {
            spiritualPower: 420
          }
        },
        realm: {
          id: 'realm.lianqi',
          name: '练气',
          minPower: 100,
          maxPower: 999
        },
        stage: { name: '中期' },
        fullName: '练气中期',
        title: '练气修士',
        progress: 46,
        nextRealmProgress: 580,
        immortalStones: 88,
        ascensions: 0,
        immortalMarks: 0,
        breakthroughSuccesses: 2,
        breakthroughFailures: 1,
        canBreakthrough: false,
        cultivationAttainment: 17,
        mainMethodName: '太虚引气诀',
        knownBattleArtCount: 3,
        knownDivinePowerCount: 1
      })
    } as never;

    await handler.handleRealmCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never);

    const realmMessage = sendMessage.mock.calls[0]?.[1] as string;
    expect(realmMessage).toContain('🧭 当前道行：17');
    expect(realmMessage).toContain('☯️ 当前道统：通用');
    expect(realmMessage).toContain('📘 主修功法：太虚引气诀');
    expect(realmMessage).toContain('🗂 已习法门：3');
    expect(realmMessage).toContain('✨ 已掌神通：1');
    expect(realmMessage.indexOf('🧭 当前道行：17')).toBeLessThan(realmMessage.indexOf('☯️ 当前道统：通用'));
    expect(realmMessage.indexOf('☯️ 当前道统：通用')).toBeLessThan(realmMessage.indexOf('📘 主修功法：太虚引气诀'));
  });

  test('/realm 在筑基后应展示当前主道统', async () => {
    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      getCultivationStatus: vi.fn().mockResolvedValue({
        user: {
          cultivation: {
            spiritualPower: 640
          }
        },
        realm: {
          id: 'realm.zhuji',
          name: '筑基',
          minPower: 420,
          maxPower: 1119
        },
        stage: { name: '中层' },
        fullName: '筑基·中层',
        title: '筑基修士',
        progress: 32,
        nextRealmProgress: 480,
        immortalStones: 88,
        ascensions: 0,
        immortalMarks: 0,
        breakthroughSuccesses: 2,
        breakthroughFailures: 1,
        canBreakthrough: false,
        cultivationAttainment: 17,
        mainMethodName: '上府明谒经',
        knownBattleArtCount: 3,
        knownDivinePowerCount: 1,
        canonicalState: {
          mainDaoTrack: 'mingyang',
          combatHistorySummary: []
        }
      })
    } as never;

    await handler.handleRealmCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never);

    const realmMessage = sendMessage.mock.calls[0]?.[1] as string;
    expect(realmMessage).toContain('☯️ 当前主道统：明阳');
    expect(realmMessage.indexOf('🧭 当前道行：17')).toBeLessThan(realmMessage.indexOf('☯️ 当前主道统：明阳'));
    expect(realmMessage.indexOf('☯️ 当前主道统：明阳')).toBeLessThan(realmMessage.indexOf('📘 主修功法：上府明谒经'));
  });

  test('/divination 文案应明确本次不影响境界与修为', async () => {
    vi.useFakeTimers();

    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      castDivination: vi.fn().mockResolvedValue({
        roll: 8,
        gua: {
          name: '乾卦',
          meaning: '大吉',
          multiplier: 4,
          emoji: '☰',
          color: '#008000'
        },
        betAmount: 10,
        result: 40,
        powerChange: 0,
        stonesBefore: 100,
        stonesAfter: 140,
        powerBefore: 120,
        powerAfter: 120,
        realmBefore: '练气',
        realmAfter: '练气',
        realmChanged: false,
        newStage: '玄景',
        buff: {
          encounterBonus: -0.15,
          qualityBonus: 0.05,
          expiresAfterNextFocus: true,
          label: '大吉加持',
          description: '下次专注奇遇概率+15%，掉率+5%'
        }
      })
    } as never;

    const promise = handler.handleDivinationCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never, ['','10'] as never);

    await vi.runAllTimersAsync();
    await promise;

    const finalMessage = sendMessage.mock.calls.at(-1)?.[1] as string;
    expect(finalMessage).toContain('🧭 本次不影响境界与修为');
    expect(finalMessage).toContain('🔮 大吉加持');
    expect(finalMessage).not.toContain('当前灵力');
  });

  test('/ascension 应按 canonical 顶层境界拦截非元婴修士', async () => {
    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      getCultivationStatus: vi.fn().mockResolvedValue({
        user: {
          cultivation: {
            spiritualPower: 2620
          }
        },
        realm: {
          id: 5,
          canonicalId: 'realm.jindan',
          name: '金丹',
          minPower: 2620,
          maxPower: 5619
        },
        stage: { name: '前期' },
        fullName: '金丹-前期',
        title: '金丹',
        progress: 0,
        nextRealmProgress: 3000,
        immortalStones: 12,
        ascensions: 0,
        immortalMarks: 0,
        breakthroughSuccesses: 0,
        breakthroughFailures: 0,
        canBreakthrough: false,
        cultivationAttainment: 10,
        mainMethodName: '玄门吐纳法',
        knownBattleArtCount: 2,
        knownDivinePowerCount: 1
      })
    } as never;

    await handler.handleAscensionCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never);

    const message = sendMessage.mock.calls[0]?.[1] as string;
    expect(message).toContain('只有元婴修士才能飞升');
    expect(message).toContain('当前境界：金丹-前期');
  });

  test('/rankings 应使用玄鉴六境界展示而非旧九境界文案', async () => {
    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      getLeaderboard: vi.fn()
        .mockResolvedValueOnce([
          {
            userId: 1,
            username: 'tester',
            cultivation: {
              spiritualPower: 420,
              canonical: {
                state: {
                  realmId: 'realm.zhuji',
                  currentPower: 420
                }
              }
            }
          }
        ])
        .mockResolvedValueOnce([
          {
            userId: 1,
            username: 'tester',
            cultivation: {
              spiritualPower: 420,
              canonical: {
                state: {
                  realmId: 'realm.zhuji',
                  currentPower: 420
                }
              }
            }
          }
        ])
        .mockResolvedValueOnce([])
    } as never;

    await handler.handleRankingsCommand({
      chat: { id: 5515965469 }
    } as never);

    const rankingsMessage = sendMessage.mock.calls[0]?.[1] as string;
    expect(rankingsMessage).toContain('筑基·初层');
    expect(rankingsMessage).not.toContain('筑基期');
  });

  test('/dev_encounter_set 应设置当前用户的开发奇遇脚本', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      setDevEncounterScript: vi.fn().mockResolvedValue({
        type: 'combat',
        remainingUses: 3
      })
    } as never;

    await handler.handleDevEncounterSetCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never, ['', 'combat', '3'] as never);

    expect(handler.cultivationService.setDevEncounterScript).toHaveBeenCalledWith(5515965469, 'combat', 3);
    expect(sendMessage.mock.calls[0]?.[1]).toContain('类别：combat');
    expect(sendMessage.mock.calls[0]?.[1]).toContain('次数：3 次');
  });

  test('/dev_encounter_set 应接受 offer 类别用于守宝奇遇冒烟', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      setDevEncounterScript: vi.fn().mockResolvedValue({
        type: 'offer',
        remainingUses: 2
      })
    } as never;

    await handler.handleDevEncounterSetCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never, ['', 'offer', '2'] as never);

    expect(handler.cultivationService.setDevEncounterScript).toHaveBeenCalledWith(5515965469, 'offer', 2);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(5515965469);
    expect(sendMessage.mock.calls[0]?.[1]).toContain('类别：offer');
  });

  test('/dev_encounter_status 应显示当前脚本状态', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      getDevEncounterScript: vi.fn().mockResolvedValue({
        type: 'item',
        remainingUses: 2,
        createdAt: new Date('2026-04-22T10:00:00.000Z'),
        updatedAt: new Date('2026-04-22T10:30:00.000Z')
      })
    } as never;

    await handler.handleDevEncounterStatusCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never);

    const message = sendMessage.mock.calls[0]?.[1] as string;
    expect(message).toContain('类别：item');
    expect(message).toContain('剩余次数：2');
  });

  test('/dev_encounter_clear 应清除当前脚本', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      clearDevEncounterScript: vi.fn().mockResolvedValue(undefined)
    } as never;

    await handler.handleDevEncounterClearCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never);

    expect(handler.cultivationService.clearDevEncounterScript).toHaveBeenCalledWith(5515965469);
    expect(sendMessage.mock.calls[0]?.[1]).toContain('开发奇遇脚本已清除');
  });

  test('/dev_grant_art 应授予当前用户指定法门', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      grantBattleArtsForTesting: vi.fn().mockResolvedValue({
        grantedIds: ['art.golden_light_art', 'art.fire_sparrow_art'],
        grantedNames: ['金光术', '火雀术']
      })
    } as never;

    await handler.handleDevGrantArtCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never, ['', 'art.golden_light_art,art.fire_sparrow_art'] as never);

    expect(handler.cultivationService.grantBattleArtsForTesting).toHaveBeenCalledWith(
      5515965469,
      ['art.golden_light_art', 'art.fire_sparrow_art']
    );
    expect(sendMessage.mock.calls[0]?.[1]).toContain('开发法门授予成功');
    expect(sendMessage.mock.calls[0]?.[1]).toContain('金光术');
    expect(sendMessage.mock.calls[0]?.[1]).toContain('火雀术');
  });

  test('/dev_grant_power 应授予当前用户指定神通', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      grantDivinePowersForTesting: vi.fn().mockResolvedValue({
        grantedIds: ['power.spirit_flash'],
        grantedNames: ['灵闪']
      })
    } as never;

    await handler.handleDevGrantPowerCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never, ['', 'power.spirit_flash'] as never);

    expect(handler.cultivationService.grantDivinePowersForTesting).toHaveBeenCalledWith(
      5515965469,
      ['power.spirit_flash']
    );
    expect(sendMessage.mock.calls[0]?.[1]).toContain('开发神通授予成功');
    expect(sendMessage.mock.calls[0]?.[1]).toContain('灵闪');
  });

  test('/dev_combat_detail 应显示当前详细战报开关状态', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      getDevCombatDetailStatus: vi.fn().mockResolvedValue(true)
    } as never;

    await handler.handleDevCombatDetailCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never, ['', 'status'] as never);

    expect(handler.cultivationService.getDevCombatDetailStatus).toHaveBeenCalledWith(5515965469);
    expect(sendMessage.mock.calls[0]?.[1]).toContain('详细战报状态：on');
  });

  test('/dev_combat_detail on 应开启详细战报', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      setDevCombatDetailEnabled: vi.fn().mockResolvedValue(true)
    } as never;

    await handler.handleDevCombatDetailCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never, ['', 'on'] as never);

    expect(handler.cultivationService.setDevCombatDetailEnabled).toHaveBeenCalledWith(5515965469, true);
    expect(sendMessage.mock.calls[0]?.[1]).toContain('详细战报已开启');
  });

  test('/dev_set_injury 应在开发环境下设置当前伤势', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      setInjuryLevelForTesting: vi.fn().mockResolvedValue({
        level: 'medium'
      })
    } as never;

    await handler.handleDevSetInjuryCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never, ['', 'medium'] as never);

    expect(handler.cultivationService.setInjuryLevelForTesting).toHaveBeenCalledWith(5515965469, 'medium');
    expect(sendMessage).toHaveBeenCalledWith(5515965469, '🧪 当前伤势已设为：中伤');
  });

  test('/dev_set_injury 参数非法时应返回用法错误', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    await handler.handleDevSetInjuryCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never, ['', 'foo'] as never);

    expect(sendMessage).toHaveBeenCalledWith(
      5515965469,
      '❌ 用法：/dev_set_injury <none|light|medium|heavy>'
    );
  });

  test('/dev_set_injury 在生产环境不应生效', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      setInjuryLevelForTesting: vi.fn()
    } as never;

    await handler.handleDevSetInjuryCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never, ['', 'heavy'] as never);

    expect(handler.cultivationService.setInjuryLevelForTesting).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(5515965469, '❌ 该命令仅在测试环境可用');
  });

  test('/loadout 应展示当前主战法门、辅助法门与神通构筑', async () => {
    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      getCombatLoadoutStatus: vi.fn().mockResolvedValue({
        realmName: '筑基·初层',
        battleArts: [
          { id: 'art.cloud_step', name: '云步', category: 'movement', equipped: true },
          { id: 'art.golden_light_art', name: '金光术', category: 'attack', equipped: true }
        ],
        supportArt: { id: 'art.spirit_gathering_chant', name: '聚灵咒' },
        divinePowers: [
          { id: 'power.clear_heart', name: '昭澈心', equipped: true }
        ]
      })
    } as never;

    await handler.handleLoadoutCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never);

    const message = sendMessage.mock.calls[0]?.[1] as string;
    expect(message).toContain('⚔️ 战斗构筑');
    expect(message).toContain('当前境界：筑基·初层');
    expect(message).toContain('主战法门：云步、金光术');
    expect(message).toContain('辅助法门：聚灵咒');
    expect(message).toContain('已配神通：昭澈心');
  });

  test('/equip_art 应调用 service 更新主战法门列表', async () => {
    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      updateBattleArtLoadout: vi.fn().mockResolvedValue({
        battleArts: [
          { id: 'art.cloud_step', name: '云步', category: 'movement', equipped: true },
          { id: 'art.golden_light_art', name: '金光术', category: 'attack', equipped: true }
        ],
        supportArt: null,
        divinePowers: []
      })
    } as never;

    await handler.handleEquipArtCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never, ['', 'art.cloud_step,art.golden_light_art'] as never);

    expect(handler.cultivationService.updateBattleArtLoadout).toHaveBeenCalledWith(
      5515965469,
      ['art.cloud_step', 'art.golden_light_art']
    );
    expect(sendMessage.mock.calls[0]?.[1]).toContain('主战法门已更新');
  });

  test('/equip_support 应允许清空辅助法门', async () => {
    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      updateSupportArtLoadout: vi.fn().mockResolvedValue({
        battleArts: [{ id: 'art.cloud_step', name: '云步', category: 'movement', equipped: true }],
        supportArt: null,
        divinePowers: []
      })
    } as never;

    await handler.handleEquipSupportCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never, ['', 'none'] as never);

    expect(handler.cultivationService.updateSupportArtLoadout).toHaveBeenCalledWith(5515965469, null);
    expect(sendMessage.mock.calls[0]?.[1]).toContain('辅助法门已更新');
    expect(sendMessage.mock.calls[0]?.[1]).toContain('当前：无');
  });

  test('/equip_power 应在缺少参数时返回用法提示', async () => {
    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    await handler.handleEquipPowerCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never, ['', ''] as never);

    expect(sendMessage.mock.calls[0]?.[1]).toContain('用法：/equip_power <id[,id...]|none>');
  });

  test('/equip_power 应透传神通槽未开启错误', async () => {
    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText
    } as never);

    handler.cultivationService = {
      updateDivinePowerLoadout: vi.fn().mockRejectedValue(new Error('当前境界尚未开启神通槽'))
    } as never;

    await handler.handleEquipPowerCommand({
      chat: { id: 5515965469 },
      from: { id: 5515965469 }
    } as never, ['', 'power.spirit_flash'] as never);

    expect(sendMessage.mock.calls[0]?.[1]).toContain('当前境界尚未开启神通槽');
  });

  test('production 环境不注册 dev encounter 命令', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const localOnText = vi.fn();
    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText: localOnText
    } as never);

    handler.registerCommands();

    const patterns = localOnText.mock.calls.map((call) => String(call[0]));
    expect(patterns.some((pattern) => pattern.includes('dev_encounter_set'))).toBe(false);
    expect(patterns.some((pattern) => pattern.includes('dev_encounter_status'))).toBe(false);
    expect(patterns.some((pattern) => pattern.includes('dev_encounter_clear'))).toBe(false);
    expect(patterns.some((pattern) => pattern.includes('dev_grant_art'))).toBe(false);
    expect(patterns.some((pattern) => pattern.includes('dev_grant_power'))).toBe(false);
    expect(patterns.some((pattern) => pattern.includes('dev_combat_detail'))).toBe(false);
  });

  test('registerCommands 应注册 loadout 与 equip 命令', () => {
    const localOnText = vi.fn();
    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText: localOnText
    } as never);

    handler.registerCommands();

    const patterns = localOnText.mock.calls.map((call) => String(call[0]));
    expect(patterns.some((pattern) => pattern.includes('loadout'))).toBe(true);
    expect(patterns.some((pattern) => pattern.includes('equip_art'))).toBe(true);
    expect(patterns.some((pattern) => pattern.includes('equip_support'))).toBe(true);
    expect(patterns.some((pattern) => pattern.includes('equip_power'))).toBe(true);
  });

  test('development 环境应注册 dev_grant_art 与 dev_grant_power 命令', () => {
    vi.stubEnv('NODE_ENV', 'development');

    const localOnText = vi.fn();
    const handler = new CultivationCommandHandlers({
      sendMessage,
      deleteMessage,
      onText: localOnText
    } as never);

    handler.registerCommands();

    const patterns = localOnText.mock.calls.map((call) => String(call[0]));
    expect(patterns.some((pattern) => pattern.includes('dev_grant_art'))).toBe(true);
    expect(patterns.some((pattern) => pattern.includes('dev_grant_power'))).toBe(true);
    expect(patterns.some((pattern) => pattern.includes('dev_combat_detail'))).toBe(true);
  });
});
