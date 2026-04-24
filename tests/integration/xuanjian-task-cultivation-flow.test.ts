import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { TaskChain, User } from '../../src/models/index.js';
import CultivationService from '../../src/services/CultivationService.js';
import TaskService from '../../src/services/TaskService.js';
import { DEFAULT_TASK_DURATION_MINUTES } from '../../src/types/taskDefaults.js';

async function backdateTask(taskId: string, minutesAgo: number): Promise<void> {
  await TaskChain.updateOne(
    { 'tasks.taskId': taskId },
    {
      $set: {
        'tasks.$.startTime': new Date(Date.now() - minutesAgo * 60 * 1000)
      }
    }
  );
}

describe('玄鉴主循环集成测试', () => {
  let taskService: TaskService;
  let queueService: {
    addReminder: ReturnType<typeof vi.fn>;
    cancelTaskReminders: ReturnType<typeof vi.fn>;
    setBotInstance: ReturnType<typeof vi.fn>;
    initialize: ReturnType<typeof vi.fn>;
    isInitialized: boolean;
  };

  beforeEach(() => {
    queueService = {
      addReminder: vi.fn().mockResolvedValue('job-id'),
      cancelTaskReminders: vi.fn().mockResolvedValue(0),
      setBotInstance: vi.fn(),
      initialize: vi.fn(),
      isInitialized: true
    };

    taskService = new TaskService(queueService, new CultivationService());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('默认 60 分钟任务完成后，应同步更新任务链、返回用户与 canonical 状态', async () => {
    const userId = 602001;
    vi.spyOn(Math, 'random').mockReturnValue(0.8);

    const created = await taskService.createTask(userId, '玄鉴集成测试任务');
    expect(created.task.duration).toBe(DEFAULT_TASK_DURATION_MINUTES);

    await backdateTask(created.task.taskId, DEFAULT_TASK_DURATION_MINUTES);
    const completed = await taskService.completeTask(userId, created.task.taskId, true);
    const persistedUser = await User.findOne({ userId });

    expect(completed.wasChainBroken).toBe(false);
    expect(completed.cultivationReward).not.toBeNull();
    expect(completed.cultivationReward?.spiritualPower).toBe(1);
    expect(completed.cultivationReward?.immortalStones).toBe(8);
    expect(completed.chain.completedTasks).toBe(1);
    expect(completed.chain.totalMinutes).toBe(DEFAULT_TASK_DURATION_MINUTES);
    expect(completed.user.stats.completedTasks).toBe(1);
    expect(completed.user.stats.currentStreak).toBe(1);
    expect(completed.user.cultivation.spiritualPower).toBe(1);
    expect(completed.user.cultivation.immortalStones).toBe(8);
    expect(completed.user.cultivation.canonical?.state.currentPower).toBe(1);
    expect(completed.user.cultivation.canonical?.state.realmId).toBe('realm.taixi');
    expect(persistedUser?.cultivation.spiritualPower).toBe(1);
    expect(persistedUser?.cultivation.immortalStones).toBe(8);
    expect(persistedUser?.cultivation.canonical?.state.currentPower).toBe(1);
  });

  test('旧高修为用户首次完成专注时，应按 fresh-start canonical 结算而不是沿用旧修为', async () => {
    const userId = 602002;
    vi.spyOn(Math, 'random').mockReturnValue(0.8);

    await User.collection.insertOne({
      userId,
      username: 'legacy_integrated_user',
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

    const created = await taskService.createTask(userId, '旧用户首轮专注');
    expect(created.task.duration).toBe(DEFAULT_TASK_DURATION_MINUTES);

    await backdateTask(created.task.taskId, DEFAULT_TASK_DURATION_MINUTES);
    const completed = await taskService.completeTask(userId, created.task.taskId, true);
    const persistedUser = await User.findOne({ userId });

    expect(completed.cultivationReward).not.toBeNull();
    expect(completed.user.cultivation.realm).toBe('胎息');
    expect(completed.user.cultivation.realmId).toBe(1);
    expect(completed.user.cultivation.spiritualPower).toBe(1);
    expect(completed.user.cultivation.immortalStones).toBe(74);
    expect(completed.user.cultivation.canonical?.state.realmId).toBe('realm.taixi');
    expect(completed.user.cultivation.canonical?.state.currentPower).toBe(1);
    expect(completed.user.cultivation.canonical?.state.cultivationAttainment).toBe(0);
    expect(completed.user.cultivation.canonical?.state.focusStreak).toBe(10);
    expect(completed.user.stats.totalTasks).toBe(21);
    expect(completed.user.stats.completedTasks).toBe(19);
    expect(completed.user.stats.currentStreak).toBe(10);
    expect(completed.user.cultivation.canonical?.state.focusStreak).toBe(completed.user.stats.currentStreak);
    expect(persistedUser?.cultivation.spiritualPower).toBe(1);
    expect(persistedUser?.cultivation.realm).toBe('胎息');
    expect(persistedUser?.cultivation.immortalStones).toBe(74);
    expect(persistedUser?.cultivation.canonical?.state.currentPower).toBe(1);
    expect(persistedUser?.cultivation.canonical?.state.focusStreak).toBe(10);
  });

  test('phase-a V2 fields do not change the existing 60-minute focus reward loop', async () => {
    const userId = 45001;
    vi.spyOn(Math, 'random').mockReturnValue(0.8);

    const user = await User.create({ userId, username: 'phase-a-focus' });
    const service = new CultivationService();

    const reward = await service.awardCultivation(user.userId, 60);
    expect(reward.spiritualPower).toBeGreaterThan(0);

    const refreshed = await User.findOne({ userId }).lean();
    expect(refreshed?.cultivation.canonical.state.realmSubStageId).toBe('realmSubStage.taixi.xuanjing');
    expect(refreshed?.cultivation.canonical.state.currentPower).toBeGreaterThan(0);
    expect(refreshed?.cultivation.canonical.state.combatFlags).toEqual({});
  });

  test('守宝奇遇应先保存 pending offer，而不是立刻结算战斗或发放宝物', async () => {
    const userId = 602101;
    const cultivationService = new CultivationService();
    const created = await taskService.createTask(userId, 'phase-e guardian offer', 60);

    await cultivationService.setDevEncounterScript(userId, 'offer', 1);
    vi.spyOn(Math, 'random').mockReturnValue(0.15);

    await backdateTask(created.task.taskId, 60);
    const completed = await taskService.completeTask(userId, created.task.taskId, true);
    const refreshed = await User.findOne({ userId }).lean();

    expect(completed.cultivationReward?.encounter?.type).toBe('offer');
    expect(completed.cultivationReward?.immortalStones).toBe(0);
    expect(completed.cultivationReward?.encounter?.combatSummary).toBeUndefined();
    expect(refreshed?.cultivation.canonical.state.combatFlags.pendingEncounterOffer).toMatchObject({
      offerId: expect.any(String),
      lootDisplayName: expect.any(String)
    });
    expect(refreshed?.cultivation.canonical.state.inventoryItemIds).toEqual([]);
  });

  test('放弃守宝奇遇应无伤结束并清空 pending offer', async () => {
    const userId = 602102;
    const cultivationService = new CultivationService();
    const user = await User.create({ userId, username: 'guardian-resolution' });
    const canonical = user.ensureCanonicalCultivation();
    canonical.state.combatFlags.pendingEncounterOffer = {
      offerId: 'offer_resolution_1',
      lootDefinitionId: 'manual.art.returning_origin_shield',
      lootDisplayName: '归元盾传承玉简',
      lootTier: '玄',
      guardianStyle: 'hybrid',
      riskTier: 'dangerous',
      guardianEncounterId: 'generated.encounter.guardian.hybrid.99',
      guardianName: '镇宝异种',
      createdAt: new Date('2026-04-23T08:00:00.000Z'),
      grantMode: 'deferred_battle_art',
      obtainedDefinitionIdsOnWin: ['manual.art.returning_origin_shield'],
      deferredContentId: 'art.returning_origin_shield'
    };
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    const abandoned = await cultivationService.abandonEncounterOffer(userId, 'offer_resolution_1');
    expect(abandoned.lootDisplayName).toBe('归元盾传承玉简');

    const afterAbandon = await User.findOne({ userId }).lean();
    expect(afterAbandon?.cultivation.canonical.state.combatFlags.pendingEncounterOffer).toBeUndefined();
    expect(afterAbandon?.cultivation.canonical.state.injuryState.level).toBe('none');
  });

  test('争抢高阶传承成功后应只入包待参悟，不应立刻写入 knownBattleArtIds', async () => {
    const userId = 602103;
    const cultivationService = new CultivationService();
    const user = await User.create({ userId, username: 'guardian-deferred-art' });
    const canonical = user.ensureCanonicalCultivation();
    canonical.state.currentPower = 110;
    canonical.state.realmId = 'realm.taixi';
    canonical.state.realmSubStageId = 'realmSubStage.taixi.lingchu';
    canonical.state.knownBattleArtIds = ['art.basic_guarding_hand', 'art.cloud_step'];
    canonical.state.equippedBattleArtIds = ['art.cloud_step'];
    canonical.state.battleLoadout.equippedBattleArtIds = ['art.cloud_step'];
    canonical.state.combatFlags.pendingEncounterOffer = {
      offerId: 'offer_deferred_1',
      lootDefinitionId: 'manual.art.returning_origin_shield',
      lootDisplayName: '归元盾传承玉简',
      lootTier: '玄',
      guardianStyle: 'guard',
      riskTier: 'dangerous',
      guardianEncounterId: 'generated.encounter.guardian.guard.4',
      guardianName: '守宝甲兽',
      createdAt: new Date('2026-04-23T08:00:00.000Z'),
      grantMode: 'deferred_battle_art',
      obtainedDefinitionIdsOnWin: ['manual.art.returning_origin_shield'],
      deferredContentId: 'art.returning_origin_shield'
    };
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    await cultivationService.contestEncounterOffer(userId, 'offer_deferred_1');

    const refreshed = await User.findOne({ userId }).lean();
    const inventoryDefinitionIds = refreshed?.cultivation.canonical.inventory.map((item) => item.definitionId) ?? [];

    expect(inventoryDefinitionIds).toContain('manual.art.returning_origin_shield');
    expect(refreshed?.cultivation.canonical.state.knownBattleArtIds).not.toContain('art.returning_origin_shield');
    expect(refreshed?.cultivation.canonical.state.battleLoadout.equippedBattleArtIds).not.toContain('art.returning_origin_shield');
  });

  test('60 分钟专注结算后应按新修为自动推进胎息小阶', async () => {
    const userId = 602003;
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const user = await User.create({ userId, username: 'phase-b-focus' });
    const canonical = user.ensureCanonicalCultivation();
    canonical.state.realmId = 'realm.taixi';
    canonical.state.currentPower = 19;
    canonical.state.realmSubStageId = 'realmSubStage.taixi.xuanjing';
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    const created = await taskService.createTask(userId, 'phase-b focus');
    await backdateTask(created.task.taskId, DEFAULT_TASK_DURATION_MINUTES);
    await taskService.completeTask(userId, created.task.taskId, true);

    const refreshed = await User.findOne({ userId }).lean();
    expect(refreshed?.cultivation.canonical.state.currentPower).toBe(20);
    expect(refreshed?.cultivation.canonical.state.realmSubStageId).toBe('realmSubStage.taixi.chengming');
  });

  test('combat encounter should resolve through awardCultivation and persist combat history', async () => {
    const userId = 602010;
    const created = await taskService.createTask(userId, 'phase-c combat');
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.98)
      .mockReturnValueOnce(0.18)
      .mockReturnValue(0.18);
    await backdateTask(created.task.taskId, DEFAULT_TASK_DURATION_MINUTES);
    const completed = await taskService.completeTask(userId, created.task.taskId, true);
    const refreshed = await User.findOne({ userId }).lean();

    expect(completed.cultivationReward?.encounter?.type).toBe('combat');
    expect(completed.cultivationReward?.encounter?.combatSummary?.result).toBe('win');
    expect(refreshed?.cultivation.canonical.state.combatHistorySummary).toHaveLength(1);
    expect(refreshed?.cultivation.canonical.state.injuryState.level).toBe('none');
  });

  test('受控随机输入应在胎息 combat encounter 池中落出不同敌人模板', async () => {
    const firstUserId = 602014;
    const secondUserId = 602015;
    const cultivationService = new CultivationService();
    const firstTask = await taskService.createTask(firstUserId, 'phase-d combat pool a', 1);
    const secondTask = await taskService.createTask(secondUserId, 'phase-d combat pool b', 1);

    await cultivationService.setDevEncounterScript(firstUserId, 'combat', 1);
    await cultivationService.setDevEncounterScript(secondUserId, 'combat', 1);

    const randomRolls = [
      0.05, 0.12, 0.18,
      0.05, 0.62, 0.18
    ];
    vi.spyOn(Math, 'random').mockImplementation(() => {
      const next = randomRolls.shift();
      if (next === undefined) {
        throw new Error('phase-d combat pool test random roll depleted');
      }
      return next;
    });

    await backdateTask(firstTask.task.taskId, 1);
    await backdateTask(secondTask.task.taskId, 1);
    const firstCompleted = await taskService.completeTask(firstUserId, firstTask.task.taskId, true);
    const secondCompleted = await taskService.completeTask(secondUserId, secondTask.task.taskId, true);

    const firstCombatSummary = firstCompleted.cultivationReward?.encounter?.combatSummary;
    const secondCombatSummary = secondCompleted.cultivationReward?.encounter?.combatSummary;
    const combatEncounterPool = [
      'combatEncounter.taixi.roadside_wolf',
      'combatEncounter.taixi.stonehide_boar',
      'combatEncounter.taixi.shadow_marten',
      'combatEncounter.taixi.mist_crow'
    ];

    expect(firstCompleted.cultivationReward?.encounter?.type).toBe('combat');
    expect(secondCompleted.cultivationReward?.encounter?.type).toBe('combat');
    expect(firstCombatSummary?.encounterId).toBeDefined();
    expect(secondCombatSummary?.encounterId).toBeDefined();
    expect(firstCombatSummary?.enemyName).toBeDefined();
    expect(secondCombatSummary?.enemyName).toBeDefined();
    expect(firstCombatSummary?.encounterId).not.toBe(secondCombatSummary?.encounterId);
    expect(firstCombatSummary?.enemyName).not.toBe(secondCombatSummary?.enemyName);
    expect(combatEncounterPool).toContain(firstCombatSummary?.encounterId);
    expect(combatEncounterPool).toContain(secondCombatSummary?.encounterId);
  });

  test('1 分钟任务触发 combat 奇遇时，应只有战斗侧奖励而无主修为收益', async () => {
    const userId = 602011;
    const cultivationService = new CultivationService();
    const created = await taskService.createTask(userId, 'phase-c short combat', 1);
    await cultivationService.setDevEncounterScript(userId, 'combat', 1);
    vi.spyOn(Math, 'random').mockReturnValue(0.18);

    await backdateTask(created.task.taskId, 1);
    const completed = await taskService.completeTask(userId, created.task.taskId, true);
    const refreshed = await User.findOne({ userId }).lean();

    expect(completed.task.actualDuration).toBe(1);
    expect(completed.cultivationReward?.spiritualPower).toBe(0);
    expect(completed.cultivationReward?.encounter?.type).toBe('combat');
    expect(completed.cultivationReward?.encounter?.combatSummary?.result).toBe('win');
    expect(completed.cultivationReward?.cultivationAttainmentDelta).toBe(1);
    expect(completed.cultivationReward?.immortalStones).toBe(3);
    expect(refreshed?.cultivation.canonical.state.currentPower).toBe(0);
    expect(refreshed?.cultivation.canonical.state.cultivationAttainment).toBe(1);
    expect(refreshed?.cultivation.canonical.state.combatHistorySummary).toHaveLength(1);
  });

  test('1 分钟任务在无强制脚本时，不应触发奇遇收益', async () => {
    const userId = 602013;
    const created = await taskService.createTask(userId, 'phase-c short no-encounter', 1);
    vi.spyOn(Math, 'random').mockReturnValue(0.995);

    await backdateTask(created.task.taskId, 1);
    const completed = await taskService.completeTask(userId, created.task.taskId, true);
    const refreshed = await User.findOne({ userId }).lean();

    expect(completed.task.actualDuration).toBe(1);
    expect(completed.cultivationReward?.spiritualPower).toBe(0);
    expect(completed.cultivationReward?.immortalStones).toBe(0);
    expect(completed.cultivationReward?.encounter?.type).toBe('none');
    expect(refreshed?.cultivation.canonical.state.currentPower).toBe(0);
    expect(refreshed?.cultivation.canonical.state.combatHistorySummary).toHaveLength(0);
  });

  test('60 分钟任务触发 combat 奇遇时，应同时获得主修为与战斗侧奖励', async () => {
    const userId = 602012;
    const cultivationService = new CultivationService();
    const created = await taskService.createTask(userId, 'phase-c full combat', DEFAULT_TASK_DURATION_MINUTES);
    await cultivationService.setDevEncounterScript(userId, 'combat', 1);
    vi.spyOn(Math, 'random').mockReturnValue(0.18);

    await backdateTask(created.task.taskId, DEFAULT_TASK_DURATION_MINUTES);
    const completed = await taskService.completeTask(userId, created.task.taskId, true);
    const refreshed = await User.findOne({ userId }).lean();

    expect(completed.task.actualDuration).toBe(DEFAULT_TASK_DURATION_MINUTES);
    expect(completed.cultivationReward?.spiritualPower).toBe(1);
    expect(completed.cultivationReward?.encounter?.type).toBe('combat');
    expect(completed.cultivationReward?.encounter?.combatSummary?.result).toBe('win');
    expect(completed.cultivationReward?.cultivationAttainmentDelta).toBe(1);
    expect(completed.cultivationReward?.immortalStones).toBe(3);
    expect(refreshed?.cultivation.canonical.state.currentPower).toBe(1);
    expect(refreshed?.cultivation.canonical.state.cultivationAttainment).toBe(1);
    expect(refreshed?.cultivation.canonical.state.combatHistorySummary).toHaveLength(1);
  });

  test('练气突破筑基成功后，应锁定主道统与筑基根基且保留原修为造诣', async () => {
    const userId = 602016;
    const cultivationService = new CultivationService();
    const user = await User.create({ userId, username: 'zhuji-lock-in' });
    const canonical = user.ensureCanonicalCultivation();
    const attainmentBefore = 12;
    canonical.state.realmId = 'realm.lianqi';
    canonical.state.currentPower = 420;
    canonical.state.mainMethodId = 'method.lianqi_mingyang_route';
    canonical.state.mainDaoTrack = 'universal';
    canonical.state.foundationId = 'foundation.unshaped';
    canonical.state.cultivationAttainment = attainmentBefore;
    canonical.breakthrough = {
      targetRealm: 'realm.zhuji',
      selectedBreakthroughMethodId: 'breakthrough.lianqi_to_zhuji_base',
      requirementProgress: {},
      hardConditionFlags: {},
      stabilityScore: 0,
      attemptHistory: []
    };
    canonical.inventory.push({
      instanceId: 'inv_lock_in_1',
      definitionId: 'material.yellow_breakthrough_token',
      obtainedAt: new Date('2026-04-22T00:00:00.000Z'),
      sourceType: 'encounter',
      bound: false,
      used: false,
      stackCount: 1,
      instanceMeta: {}
    });
    canonical.state.inventoryItemIds = ['inv_lock_in_1'];
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    const result = await cultivationService.attemptBreakthrough(userId);
    expect(result.success).toBe(true);

    const refreshed = await User.findOne({ userId }).lean();
    expect(refreshed?.cultivation.canonical.state.realmId).toBe('realm.zhuji');
    expect(refreshed?.cultivation.canonical.state.mainDaoTrack).toBe('mingyang');
    expect(refreshed?.cultivation.canonical.state.foundationId).toBe('foundation.zhuji_mingyang');
    expect(refreshed?.cultivation.canonical.state.mainMethodId).toBe('method.zhuji_mingyang_script');
    expect(refreshed?.cultivation.canonical.state.cultivationAttainment).toBe(attainmentBefore);
  });

  test('pre-zhuji 旧存档若提前写入筑基功法，应在读取时收敛到对应练气路线功法', async () => {
    const userId = 602017;
    const cultivationService = new CultivationService();
    const user = await User.create({ userId, username: 'legacy-pre-zhuji-method' });
    const canonical = user.ensureCanonicalCultivation();
    canonical.state.realmId = 'realm.lianqi';
    canonical.state.currentPower = 360;
    canonical.state.mainMethodId = 'method.zhuji_mingyang_script';
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    await cultivationService.getCultivationStatus(userId);

    const refreshed = await User.findOne({ userId }).lean();
    expect(refreshed?.cultivation.canonical.state.mainMethodId).toBe('method.lianqi_mingyang_route');
  });

  test('筑基突破紫府时，应按所选法门授予对应副产物并记录副作用', async () => {
    const userId = 602018;
    const cultivationService = new CultivationService();
    const user = await User.create({ userId, username: 'zifu-process-method' });
    const canonical = user.ensureCanonicalCultivation();
    canonical.state.realmId = 'realm.zhuji';
    canonical.state.currentPower = 1120;
    canonical.state.mainMethodId = 'method.zhuji_mingyang_script';
    canonical.state.mainDaoTrack = 'mingyang';
    canonical.state.foundationId = 'foundation.zhuji_mingyang';
    canonical.state.cultivationAttainment = 14;
    canonical.breakthrough = {
      targetRealm: 'realm.zifu',
      selectedBreakthroughMethodId: 'breakthrough.zhuji_to_zifu_mingyang_manifest',
      requirementProgress: {},
      hardConditionFlags: {
        'env.mingyang_surge': true
      },
      stabilityScore: 0,
      attemptHistory: []
    };
    canonical.inventory.push({
      instanceId: 'inv_zifu_process_1',
      definitionId: 'material.mysterious_breakthrough_token',
      obtainedAt: new Date('2026-04-23T00:00:00.000Z'),
      sourceType: 'encounter',
      bound: false,
      used: false,
      stackCount: 1,
      instanceMeta: {}
    });
    canonical.inventory.push({
      instanceId: 'inv_zifu_process_2',
      definitionId: 'material.mingyang_manifest_token',
      obtainedAt: new Date('2026-04-23T00:00:00.000Z'),
      sourceType: 'encounter',
      bound: false,
      used: false,
      stackCount: 1,
      instanceMeta: {}
    });
    canonical.state.inventoryItemIds = ['inv_zifu_process_1', 'inv_zifu_process_2'];
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    const result = await cultivationService.attemptBreakthrough(userId);
    expect(result.success).toBe(true);
    expect(result.message).toContain('明阳化神秘法');

    const refreshed = await User.findOne({ userId }).lean();
    expect(refreshed?.cultivation.canonical.state.realmId).toBe('realm.zifu');
    expect(refreshed?.cultivation.canonical.state.knownDivinePowerIds).toContain('power.invoking_heaven_gate');
    expect(refreshed?.cultivation.canonical.state.combatFlags.zifu_mingyang_burn).toBe(true);
  });

  test('首入紫府成功后，应落库首神通并返回四关过程摘要', async () => {
    const userId = 602022;
    const cultivationService = new CultivationService();
    const user = await User.create({ userId, username: 'zifu-first-power-summary' });
    const canonical = user.ensureCanonicalCultivation();
    canonical.state.realmId = 'realm.zhuji';
    canonical.state.currentPower = 1120;
    canonical.state.mainMethodId = 'method.zhuji_mingyang_script';
    canonical.state.mainDaoTrack = 'mingyang';
    canonical.state.foundationId = 'foundation.zhuji_mingyang';
    canonical.state.cultivationAttainment = 15;
    canonical.state.knownDivinePowerIds = [];
    canonical.breakthrough = {
      targetRealm: 'realm.zifu',
      selectedBreakthroughMethodId: 'breakthrough.zhuji_to_zifu_base',
      requirementProgress: {},
      hardConditionFlags: {},
      stabilityScore: 0,
      attemptHistory: []
    };
    canonical.inventory.push({
      instanceId: 'inv_zifu_first_power_1',
      definitionId: 'material.mysterious_breakthrough_token',
      obtainedAt: new Date('2026-04-23T00:00:00.000Z'),
      sourceType: 'encounter',
      bound: false,
      used: false,
      stackCount: 1,
      instanceMeta: {}
    });
    canonical.state.inventoryItemIds = ['inv_zifu_first_power_1'];
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    const result = await cultivationService.attemptBreakthrough(userId);
    expect(result.success).toBe(true);
    expect(result.message).toContain('四关');

    const refreshed = await User.findOne({ userId }).lean();
    expect(refreshed?.cultivation.canonical.state.realmId).toBe('realm.zifu');
    expect(refreshed?.cultivation.canonical.state.knownDivinePowerIds).toContain('power.invoking_heaven_gate');
  });

  test('筑基破境在幻境关失败时，应保持境界并持久化修为与道行损伤', async () => {
    const userId = 602023;
    const cultivationService = new CultivationService();
    const user = await User.create({ userId, username: 'zifu-fail-damage-persist' });
    const canonical = user.ensureCanonicalCultivation();
    canonical.state.realmId = 'realm.zhuji';
    canonical.state.currentPower = 1120;
    canonical.state.mainMethodId = 'method.zhuji_mingyang_script';
    canonical.state.mainDaoTrack = 'mingyang';
    canonical.state.foundationId = 'foundation.zhuji_mingyang';
    canonical.state.cultivationAttainment = 14;
    canonical.breakthrough = {
      targetRealm: 'realm.zifu',
      selectedBreakthroughMethodId: 'breakthrough.zhuji_to_zifu_base',
      requirementProgress: {},
      hardConditionFlags: {
        'gate.cross_illusion.force_fail': true
      },
      stabilityScore: 0,
      attemptHistory: []
    };
    canonical.inventory.push({
      instanceId: 'inv_zifu_fail_damage_1',
      definitionId: 'material.mysterious_breakthrough_token',
      obtainedAt: new Date('2026-04-23T00:00:00.000Z'),
      sourceType: 'encounter',
      bound: false,
      used: false,
      stackCount: 1,
      instanceMeta: {}
    });
    canonical.state.inventoryItemIds = ['inv_zifu_fail_damage_1'];
    const powerBefore = canonical.state.currentPower;
    const attainmentBefore = canonical.state.cultivationAttainment;
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    const result = await cultivationService.attemptBreakthrough(userId);
    expect(result.success).toBe(false);
    expect(result.penalty).toBeGreaterThan(0);
    expect(result.message).toContain('止步');
    expect(result.message).toContain('修为损失');
    expect(result.message).toContain('道行损失');

    const refreshed = await User.findOne({ userId }).lean();
    expect(refreshed?.cultivation.canonical.state.realmId).toBe('realm.zhuji');
    expect(refreshed?.cultivation.canonical.state.currentPower).toBeLessThan(powerBefore);
    expect(refreshed?.cultivation.canonical.state.cultivationAttainment).toBeLessThan(attainmentBefore);
  });

  test('紫府内后续神通冲关成功后，应新增目标神通并清空本次分支态', async () => {
    const userId = 602024;
    const cultivationService = new CultivationService();
    const user = await User.create({ userId, username: 'zifu-second-power-branch' });
    const canonical = user.ensureCanonicalCultivation();
    canonical.state.realmId = 'realm.zifu';
    canonical.state.currentPower = 1360;
    canonical.state.mainMethodId = 'method.zhuji_mingyang_script';
    canonical.state.mainDaoTrack = 'mingyang';
    canonical.state.foundationId = 'foundation.zhuji_mingyang';
    canonical.state.cultivationAttainment = 18;
    canonical.state.knownDivinePowerIds = ['power.invoking_heaven_gate'];
    canonical.breakthrough = {
      targetRealm: 'realm.zifu',
      selectedBreakthroughMethodId: 'breakthrough.zifu_divine_power_base',
      requirementProgress: {},
      hardConditionFlags: {},
      branchChoice: 'power.clear_heart',
      branchProofs: { 'proof.mingyang_fate_anchor': true },
      stabilityScore: 0,
      attemptHistory: []
    };
    canonical.inventory.push({
      instanceId: 'inv_zifu_second_power_1',
      definitionId: 'material.zifu_second_power_token',
      obtainedAt: new Date('2026-04-23T00:00:00.000Z'),
      sourceType: 'encounter',
      bound: false,
      used: false,
      stackCount: 1,
      instanceMeta: {}
    });
    canonical.state.inventoryItemIds = ['inv_zifu_second_power_1'];
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    const result = await cultivationService.attemptBreakthrough(userId);
    expect(result.success).toBe(true);

    const refreshed = await User.findOne({ userId }).lean();
    expect(refreshed?.cultivation.canonical.state.realmId).toBe('realm.zifu');
    expect(refreshed?.cultivation.canonical.state.knownDivinePowerIds).toContain('power.clear_heart');
    expect(refreshed?.cultivation.canonical.breakthrough?.branchChoice).toBeNull();
    expect(refreshed?.cultivation.canonical.breakthrough?.branchProofs).toEqual({});
  });

  test('紫府圆满五神通可通过正法求金突破金丹并记录路线摘要', async () => {
    const userId = 602025;
    const cultivationService = new CultivationService({
      contentNameResolver: {
        resolve: (id: string) => {
          const names: Record<string, string> = {
            'goldNature.direct_mingyang': '测试明阳金性',
            'jindan_path.direct_gold': '测试正法求金'
          };
          return names[id] ?? id;
        }
      }
    });
    const user = await User.create({ userId, username: 'zifu-to-jindan-direct-gold' });
    const canonical = user.ensureCanonicalCultivation();
    canonical.state.realmId = 'realm.zifu';
    canonical.state.realmSubStageId = 'realmSubStage.zifu.perfect';
    canonical.state.currentPower = 2620;
    canonical.state.mainMethodId = 'method.zhuji_mingyang_script';
    canonical.state.mainDaoTrack = 'mingyang';
    canonical.state.foundationId = 'foundation.zhuji_mingyang';
    canonical.state.cultivationAttainment = 80;
    canonical.state.knownDivinePowerIds = [
      'power.invoking_heaven_gate',
      'power.clear_heart',
      'power.long_bright_steps',
      'power.imperial_gaze_origin',
      'power.scarlet_sundering_bolt'
    ];
    canonical.breakthrough = {
      targetRealm: 'realm.jindan',
      selectedBreakthroughMethodId: 'breakthrough.zifu_to_jindan_direct_gold',
      requirementProgress: {},
      hardConditionFlags: {},
      branchChoice: null,
      branchProofs: {},
      stabilityScore: 0,
      attemptHistory: []
    };
    canonical.inventory.push(
      {
        instanceId: 'inv_jindan_flow_1',
        definitionId: 'material.jindan_gold_catalyst',
        obtainedAt: new Date('2026-04-24T00:00:00.000Z'),
        sourceType: 'encounter',
        bound: false,
        used: false,
        stackCount: 1,
        instanceMeta: {}
      },
      {
        instanceId: 'inv_jindan_flow_2',
        definitionId: 'material.same_origin_treasure',
        obtainedAt: new Date('2026-04-24T00:00:00.000Z'),
        sourceType: 'encounter',
        bound: false,
        used: false,
        stackCount: 1,
        instanceMeta: {}
      }
    );
    canonical.state.inventoryItemIds = ['inv_jindan_flow_1', 'inv_jindan_flow_2'];
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    const result = await cultivationService.attemptBreakthrough(userId);
    expect(result.success).toBe(true);
    expect(result.newRealm).toBe('金丹');
    expect(result.message).toContain('副产物：测试明阳金性');
    expect(result.message).toContain('余波：测试正法求金');
    expect(result.message).not.toContain('goldNature.direct_mingyang');
    expect(result.message).not.toContain('jindan_path.direct_gold');

    const refreshed = await User.findOne({ userId }).lean();
    expect(refreshed?.cultivation.canonical.state.realmId).toBe('realm.jindan');
    expect(refreshed?.cultivation.canonical.state.combatFlags['jindan_path.direct_gold']).toBe(true);
    expect(refreshed?.cultivation.canonical.state.combatFlags.goldNatureTag).toBe('goldNature.direct_mingyang');
    expect(refreshed?.cultivation.canonical.state.inventoryItemIds).toEqual([]);
  });

  test('90 分钟有效专注会恢复一档旧伤并只结算剩余修为', async () => {
    const userId = 602020;
    vi.spyOn(Math, 'random').mockReturnValue(0.8);

    const user = await User.create({ userId, username: 'injury-recovery-focus' });
    const canonical = user.ensureCanonicalCultivation();
    canonical.state.injuryState = { level: 'medium', points: 2, modifiers: ['combat_loss'] };
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    const created = await taskService.createTask(userId, 'injury recovery', 90);
    await backdateTask(created.task.taskId, 90);
    const completed = await taskService.completeTask(userId, created.task.taskId, true);
    const refreshed = await User.findOne({ userId }).lean();

    expect(completed.cultivationReward?.spiritualPower).toBe(1);
    expect(completed.cultivationReward?.cultivationAttainmentDelta).toBe(0);
    expect(completed.cultivationReward?.injuryRecovery).toEqual({
      applied: true,
      previousLevel: 'medium',
      nextLevel: 'none',
      summary: '🩹 伤势恢复：中伤 -> 无伤'
    });
    expect(refreshed?.cultivation.canonical.state.currentPower).toBe(1);
    expect(refreshed?.cultivation.canonical.state.injuryState.level).toBe('none');
    expect(refreshed?.cultivation.canonical.state.injuryState.points).toBe(0);
  });

  test('短专注不会恢复旧伤', async () => {
    const userId = 602021;
    vi.spyOn(Math, 'random').mockReturnValue(0.8);

    const user = await User.create({ userId, username: 'short-no-heal' });
    const canonical = user.ensureCanonicalCultivation();
    canonical.state.injuryState = { level: 'light', points: 1, modifiers: ['combat_loss'] };
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    const created = await taskService.createTask(userId, 'short-no-heal', 30);
    await backdateTask(created.task.taskId, 30);
    const completed = await taskService.completeTask(userId, created.task.taskId, true);
    const refreshed = await User.findOne({ userId }).lean();

    expect(completed.cultivationReward?.spiritualPower).toBe(0);
    expect(completed.cultivationReward?.injuryRecovery).toBeNull();
    expect(refreshed?.cultivation.canonical.state.injuryState.level).toBe('light');
    expect(refreshed?.cultivation.canonical.state.injuryState.points).toBe(1);
  });
});
