import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import CultivationService from '../src/services/CultivationService.js';
import { DivinationHistory, User } from '../src/models/index.js';

describe('修仙系统测试（canonical 运行时）', () => {
  const cultivationService = new CultivationService();
  let testUserId: number;

  beforeEach(async () => {
    testUserId = Math.floor(Math.random() * 1_000_000);
    await User.create({
      userId: testUserId,
      username: 'test_cultivator',
      firstName: 'Test',
      lastName: 'User'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('应该能获取修仙状态', async () => {
    const status = await cultivationService.getCultivationStatus(testUserId);

    expect(status.realm.name).toBe('胎息');
    expect(status.user.cultivation.spiritualPower).toBe(0);
    expect(status.user.cultivation.immortalStones).toBe(0);
  });

  test('开发奇遇脚本可设置、读取与清除', async () => {
    const script = await cultivationService.setDevEncounterScript(testUserId, 'combat', 3);

    expect(script.type).toBe('combat');
    expect(script.remainingUses).toBe(3);
    expect((await cultivationService.getDevEncounterScript(testUserId))?.remainingUses).toBe(3);

    await cultivationService.clearDevEncounterScript(testUserId);

    expect(await cultivationService.getDevEncounterScript(testUserId)).toBeNull();
  });

  test('开发奇遇脚本会在专注结算后递减并归零清空', async () => {
    await cultivationService.setDevEncounterScript(testUserId, 'none', 2);

    const first = await cultivationService.awardCultivation(testUserId, 60);
    expect(first.encounter?.type).toBe('none');
    expect((await cultivationService.getDevEncounterScript(testUserId))?.remainingUses).toBe(1);

    const second = await cultivationService.awardCultivation(testUserId, 60);
    expect(second.encounter?.type).toBe('none');
    expect(await cultivationService.getDevEncounterScript(testUserId)).toBeNull();
  });

  test('setInjuryLevelForTesting 设为 none 时应清空 modifiers', async () => {
    const user = await User.findOne({ userId: testUserId });
    expect(user).not.toBeNull();

    if (user) {
      const canonical = user.ensureCanonicalCultivation();
      canonical.state.injuryState = {
        level: 'medium',
        points: 2,
        modifiers: ['combat_loss']
      };
      user.replaceCanonicalCultivation(canonical);
      user.syncLegacyCultivationShell();
      await user.save();
    }

    const result = await cultivationService.setInjuryLevelForTesting(testUserId, 'none');
    const refreshed = await User.findOne({ userId: testUserId }).lean();

    expect(result).toEqual({ level: 'none' });
    expect(refreshed?.cultivation.canonical.state.injuryState).toEqual({
      level: 'none',
      points: 0,
      modifiers: []
    });
  });

  test('setInjuryLevelForTesting 设为 heavy 时只覆盖 level', async () => {
    const user = await User.findOne({ userId: testUserId });
    expect(user).not.toBeNull();

    if (user) {
      const canonical = user.ensureCanonicalCultivation();
      canonical.state.injuryState = {
        level: 'light',
        points: 1,
        modifiers: ['combat_loss']
      };
      user.replaceCanonicalCultivation(canonical);
      user.syncLegacyCultivationShell();
      await user.save();
    }

    const result = await cultivationService.setInjuryLevelForTesting(testUserId, 'heavy');
    const refreshed = await User.findOne({ userId: testUserId }).lean();

    expect(result).toEqual({ level: 'heavy' });
    expect(refreshed?.cultivation.canonical.state.injuryState).toEqual({
      level: 'heavy',
      points: 3,
      modifiers: ['combat_loss']
    });
  });

  test('获取修仙状态时应以 canonical 状态同步 legacy 壳字段', async () => {
    const user = await User.findOne({ userId: testUserId });
    expect(user).not.toBeNull();

    if (user) {
      const canonical = user.ensureCanonicalCultivation();
      canonical.state.realmId = 'realm.lianqi';
      canonical.state.currentPower = 420;
      user.replaceCanonicalCultivation(canonical);
      user.cultivation.realm = '炼气期';
      user.cultivation.realmId = 1;
      user.cultivation.spiritualPower = 0;
      await user.save();
    }

    const status = await cultivationService.getCultivationStatus(testUserId);
    const raw = await User.collection.findOne({ userId: testUserId });

    expect(status.realm.name).toBe('练气');
    expect(status.user.cultivation.realm).toBe('练气');
    expect(status.user.cultivation.realmId).toBe(2);
    expect(status.user.cultivation.spiritualPower).toBe(420);
    expect(raw?.cultivation.realm).toBe('练气');
    expect(raw?.cultivation.realmId).toBe(2);
    expect(raw?.cultivation.spiritualPower).toBe(420);
  });

  test('获取修仙状态时应收敛脏小阶并持久化', async () => {
    const user = await User.findOne({ userId: testUserId });
    expect(user).not.toBeNull();

    if (user) {
      const canonical = user.ensureCanonicalCultivation();
      canonical.state.realmId = 'realm.taixi';
      canonical.state.currentPower = 60;
      canonical.state.realmSubStageId = 'realmSubStage.taixi.xuanjing';
      user.replaceCanonicalCultivation(canonical);
      user.syncLegacyCultivationShell();
      await user.save();
    }

    const status = await cultivationService.getCultivationStatus(testUserId);
    const raw = await User.collection.findOne({ userId: testUserId });

    expect(status.user.cultivation.canonical?.state.realmSubStageId).toBe('realmSubStage.taixi.qingyuan');
    expect(raw?.cultivation.canonical.state.realmSubStageId).toBe('realmSubStage.taixi.qingyuan');
  });

  test('旧高修为用户首次接入 canonical 时应统一清零重开', async () => {
    const legacyOnlyUserId = testUserId + 1_000_000;
    await User.collection.insertOne({
      userId: legacyOnlyUserId,
      username: 'legacy_only_user',
      cultivation: {
        spiritualPower: 12000,
        realm: '炼虚期',
        realmId: 9,
        realmStage: '圆满',
        immortalStones: 66
      },
      stats: {
        totalTasks: 20,
        completedTasks: 18,
        failedTasks: 2,
        totalMinutes: 1200,
        currentStreak: 9,
        longestStreak: 15,
        todayCompletedTasks: 0
      }
    });

    const status = await cultivationService.getCultivationStatus(legacyOnlyUserId);

    expect(status.realm.name).toBe('胎息');
    expect(status.user.cultivation.spiritualPower).toBe(0);
    expect(status.user.cultivation.realm).toBe('胎息');
    expect(status.user.cultivation.realmId).toBe(1);
    expect(status.user.cultivation.canonical?.state.realmId).toBe('realm.taixi');
    expect(status.user.cultivation.canonical?.state.currentPower).toBe(0);
    expect(status.user.cultivation.canonical?.state.focusStreak).toBe(9);
    expect(status.user.cultivation.immortalStones).toBe(66);
  });

  test('应该能奖励修炼', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.88);

    const reward = await cultivationService.awardCultivation(testUserId, 90);
    const user = await User.findOne({ userId: testUserId });

    expect(reward.spiritualPower).toBe(2);
    expect(reward.immortalStones).toBe(8);
    expect(reward.mainMethodName).toBe('玄门吐纳法');
    expect(user?.cultivation.spiritualPower).toBe(reward.newSpiritualPower);
  });

  test('getCultivationStatus 应保留斗法历史和当前伤势', async () => {
    const user = await User.findOne({ userId: testUserId });
    expect(user).not.toBeNull();

    if (user) {
      const canonical = user.ensureCanonicalCultivation();
      canonical.state.injuryState = { level: 'light', modifiers: ['combat_loss'] };
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
    }

    const status = await cultivationService.getCultivationStatus(testUserId);

    expect(status.canonicalState?.injuryState.level).toBe('light');
    expect(status.canonicalState?.combatHistorySummary).toHaveLength(1);
  });

  test('应该能占卜天机并记录历史', async () => {
    const user = await User.findOne({ userId: testUserId });
    expect(user).not.toBeNull();

    if (user) {
      user.cultivation.immortalStones = 100;
      await user.save();
    }

    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const result = await cultivationService.castDivination(testUserId, 10);
    const history = await cultivationService.getDivinationHistory(testUserId, 5);

    expect(result.roll).toBe(8);
    expect(result.gua.name).toBe('乾卦');
    expect(result.betAmount).toBe(10);
    expect(result.powerAfter).toBe(result.powerBefore);
    expect(result.powerChange).toBe(0);
    expect(result.realmChanged).toBe(false);
    expect(history).toHaveLength(1);
    expect(history[0]?.gameId).toBeDefined();
  });

  test('应该能升级境界', async () => {
    const user = await User.findOne({ userId: testUserId });
    expect(user).not.toBeNull();

    if (user) {
      const canonical = user.ensureCanonicalCultivation();
      canonical.state.realmId = 'realm.taixi';
      canonical.state.currentPower = 119;
      user.replaceCanonicalCultivation(canonical);
      user.syncLegacyCultivationShell();
      await user.save();
    }

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await cultivationService.awardCultivation(testUserId, 60);
    const status = await cultivationService.getCultivationStatus(testUserId);

    expect(status.user.cultivation.spiritualPower).toBe(120);
    expect(status.realm.name).toBe('练气');
  });

  test('应该能渡劫成功', async () => {
    const user = await User.findOne({ userId: testUserId });
    expect(user).not.toBeNull();

    if (user) {
      const canonical = user.ensureCanonicalCultivation();
      canonical.state.realmId = 'realm.lianqi';
      canonical.state.currentPower = 420;
      canonical.state.cultivationAttainment = 10;
      canonical.state.mainMethodId = 'method.lianqi_mingyang_route';
      canonical.inventory = [
        {
          instanceId: 'test-yellow-token',
          definitionId: 'material.yellow_breakthrough_token',
          obtainedAt: new Date('2026-04-20T00:00:00.000Z'),
          sourceType: 'migration',
          bound: false,
          used: false,
          stackCount: 1,
          instanceMeta: {}
        }
      ];
      canonical.state.inventoryItemIds = ['test-yellow-token'];
      user.replaceCanonicalCultivation(canonical);
      user.syncLegacyCultivationShell();
      await user.save();
    }

    const result = await cultivationService.attemptBreakthrough(testUserId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newRealm).toBe('筑基');
    }
  });

  test('突破大境后应切到新大境首个小阶', async () => {
    const user = await User.findOne({ userId: testUserId });
    expect(user).not.toBeNull();

    if (user) {
      const canonical = user.ensureCanonicalCultivation();
      canonical.state.realmId = 'realm.taixi';
      canonical.state.currentPower = 120;
      canonical.state.realmSubStageId = 'realmSubStage.taixi.lingchu';
      user.replaceCanonicalCultivation(canonical);
      user.syncLegacyCultivationShell();
      await user.save();
    }

    const result = await cultivationService.attemptBreakthrough(testUserId);
    const refreshed = await User.findOne({ userId: testUserId }).lean();

    expect(result.success).toBe(true);
    expect(refreshed?.cultivation.canonical?.state.realmId).toBe('realm.lianqi');
    expect(refreshed?.cultivation.canonical?.state.realmSubStageId).toBe('realmSubStage.lianqi.1');
  });

  test('破境条件不足时不应被当作渡劫失败统计', async () => {
    const user = await User.findOne({ userId: testUserId });
    expect(user).not.toBeNull();

    if (user) {
      const canonical = user.ensureCanonicalCultivation();
      canonical.state.realmId = 'realm.lianqi';
      canonical.state.currentPower = 419;
      canonical.state.cultivationAttainment = 0;
      canonical.inventory = [];
      canonical.state.inventoryItemIds = [];
      user.cultivation.breakthroughFailures = 0;
      user.replaceCanonicalCultivation(canonical);
      user.syncLegacyCultivationShell();
      await user.save();
    }

    const result = await cultivationService.attemptBreakthrough(testUserId);
    const refreshedUser = await User.findOne({ userId: testUserId });

    expect(result.success).toBe(false);
    expect(result.message).toContain('破境条件未满足');
    expect(refreshedUser?.cultivation.breakthroughFailures).toBe(0);
  });

  test('飞升后应同步重置 canonical 状态，避免状态回弹', async () => {
    const user = await User.findOne({ userId: testUserId });
    expect(user).not.toBeNull();

    if (user) {
      const canonical = user.ensureCanonicalCultivation();
      canonical.state.realmId = 'realm.yuanying';
      canonical.state.currentPower = 50000;
      canonical.state.realmSubStageId = 'realmSubStage.zhuji.early';
      canonical.state.battleLoadout = {
        equippedBattleArtIds: ['art.cloud_step'],
        equippedDivinePowerIds: [],
        equippedArtifactIds: ['artifact.old_sword'],
        activeSupportArtId: 'art.basic_guarding_hand'
      };
      canonical.state.cooldowns = { 'power.zifu_first_light': 3 };
      canonical.state.combatFlags = { escapedDeath: true };
      canonical.state.combatHistorySummary = [
        {
          encounterId: 'encounter-before-ascend',
          result: 'win',
          happenedAt: new Date('2026-04-21T00:00:00.000Z'),
          summary: '旧战斗摘要'
        }
      ];
      user.replaceCanonicalCultivation(canonical);
      user.syncLegacyCultivationShell();
      await user.save();
    }

    const result = await cultivationService.ascend(testUserId);
    const status = await cultivationService.getCultivationStatus(testUserId);
    const raw = await User.collection.findOne({ userId: testUserId });

    expect(result.success).toBe(true);
    expect(status.realm.name).toBe('胎息');
    expect(status.user.cultivation.spiritualPower).toBe(0);
    expect(status.user.cultivation.canonical?.state.currentPower).toBe(0);
    expect(status.user.cultivation.canonical?.state.realmId).toBe('realm.taixi');
    expect(raw?.cultivation.realm).toBe('胎息');
    expect(raw?.cultivation.realmId).toBe(1);
    expect(raw?.cultivation.spiritualPower).toBe(0);
    expect(raw?.cultivation.canonical.state.realmSubStageId).toBe('realmSubStage.taixi.xuanjing');
    expect(status.user.cultivation.canonical?.state.realmSubStageId).toBe('realmSubStage.taixi.xuanjing');
    expect(status.user.cultivation.canonical?.state.battleLoadout).toEqual({
      equippedBattleArtIds: ['art.basic_guarding_hand'],
      equippedDivinePowerIds: [],
      equippedArtifactIds: [],
      activeSupportArtId: null
    });
    expect(status.user.cultivation.canonical?.state.cooldowns).toEqual({});
    expect(status.user.cultivation.canonical?.state.combatFlags).toEqual({});
    expect(status.user.cultivation.canonical?.state.combatHistorySummary).toEqual([]);
  });

  test('应该能获取修仙排行榜和占卜统计', async () => {
    const user = await User.findOne({ userId: testUserId });
    expect(user).not.toBeNull();

    if (user) {
      user.cultivation.immortalStones = 100;
      await user.save();
    }

    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    await cultivationService.castDivination(testUserId, 10);

    const [leaderboard, stats, storedHistory] = await Promise.all([
      cultivationService.getLeaderboard('power', 10),
      cultivationService.getDivinationStats(testUserId),
      DivinationHistory.find({ userId: testUserId })
    ]);

    expect(Array.isArray(leaderboard)).toBe(true);
    expect(typeof stats.totalGames).toBe('number');
    expect(typeof stats.netProfit).toBe('number');
    expect(storedHistory.length).toBe(1);
  });
});
