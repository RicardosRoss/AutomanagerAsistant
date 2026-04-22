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

  test('90 分钟有效专注会恢复一档旧伤并只结算剩余修为', async () => {
    const userId = 602020;
    vi.spyOn(Math, 'random').mockReturnValue(0.8);

    const user = await User.create({ userId, username: 'injury-recovery-focus' });
    const canonical = user.ensureCanonicalCultivation();
    canonical.state.injuryState = { level: 'medium', modifiers: ['combat_loss'] };
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
      nextLevel: 'light',
      summary: '🩹 伤势恢复：中伤 -> 轻伤'
    });
    expect(refreshed?.cultivation.canonical.state.currentPower).toBe(1);
    expect(refreshed?.cultivation.canonical.state.injuryState.level).toBe('light');
  });

  test('短专注不会恢复旧伤', async () => {
    const userId = 602021;
    vi.spyOn(Math, 'random').mockReturnValue(0.8);

    const user = await User.create({ userId, username: 'short-no-heal' });
    const canonical = user.ensureCanonicalCultivation();
    canonical.state.injuryState = { level: 'light', modifiers: ['combat_loss'] };
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
  });
});
