import { describe, expect, test } from 'vitest';
import { User } from '../../../src/models/index.js';
import { DEFAULT_TASK_DURATION_MINUTES } from '../../../src/types/taskDefaults.js';

describe('User Model', () => {
  describe('用户创建和验证', () => {
    test('创建新用户应设置默认值', async () => {
      const userData = {
        userId: 123456,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User'
      };

      const user = new User(userData);
      await user.save();

      expect(user.userId).toBe(userData.userId);
      expect(user.settings.defaultDuration).toBe(DEFAULT_TASK_DURATION_MINUTES);
      expect(user.settings.reminderEnabled).toBe(true);
      expect(user.stats.totalTasks).toBe(0);
      expect(user.stats.currentStreak).toBe(0);
      expect(user.stats.longestStreak).toBe(0);
    });

    test('findOrCreate 应使用统一默认任务时长', async () => {
      const user = await User.findOrCreate({ userId: 123457 });

      expect(user.settings.defaultDuration).toBe(DEFAULT_TASK_DURATION_MINUTES);
    });

    test('用户ID应该是唯一的', async () => {
      await User.init();

      await expect(
        User.collection.insertMany(
          [
            { userId: 999999 },
            { userId: 999999 }
          ],
          { ordered: true }
        )
      ).rejects.toMatchObject({ code: 11000 });
    });
  });

  describe('虚拟字段', () => {
    test('成功率计算应该正确', () => {
      const user = new User({ userId: 888888 });
      user.stats.totalTasks = 10;
      user.stats.completedTasks = 8;

      expect(user.successRate).toBe(80);
    });

    test('零任务时成功率应该为0', () => {
      const user = new User({ userId: 777777 });
      expect(user.successRate).toBe(0);
    });
  });

  describe('连击更新方法', () => {
    test('成功任务应增加连击', () => {
      const user = new User({ userId: 666666 });
      user.stats.currentStreak = 5;
      user.stats.longestStreak = 8;

      user.updateStreak(true);

      expect(user.stats.currentStreak).toBe(6);
      expect(user.stats.longestStreak).toBe(8);
    });

    test('成功任务应更新最长连击记录', () => {
      const user = new User({ userId: 555555 });
      user.stats.currentStreak = 9;
      user.stats.longestStreak = 8;

      user.updateStreak(true);

      expect(user.stats.currentStreak).toBe(10);
      expect(user.stats.longestStreak).toBe(10);
    });

    test('失败任务应重置连击（神圣座位原理）', () => {
      const user = new User({ userId: 444444 });
      user.stats.currentStreak = 15;
      user.stats.longestStreak = 20;

      user.updateStreak(false);

      expect(user.stats.currentStreak).toBe(0);
      expect(user.stats.longestStreak).toBe(20);
    });
  });

  describe('每日统计重置方法', () => {
    test('应该重置今日任务计数', () => {
      const user = new User({ userId: 333333 });
      user.stats.todayCompletedTasks = 5;

      user.resetDailyStats();

      expect(user.stats.todayCompletedTasks).toBe(0);
    });
  });

  test('initializes inert V2 phase-a cultivation fields for new users', async () => {
    const user = await User.create({ userId: 99001, username: 'v2-defaults' });

    expect(user.cultivation.canonical?.state.realmSubStageId).toBe('realmSubStage.taixi.xuanjing');
    expect(user.cultivation.canonical?.state.branchCultivationAttainments).toEqual({});
    expect(user.cultivation.canonical?.state.battleLoadout.activeSupportArtId).toBeNull();
    expect(user.cultivation.canonical?.state.cooldowns).toEqual({});
    expect(user.cultivation.canonical?.state.combatHistorySummary).toEqual([]);
  });

  test('ensureCanonicalCultivation should expose inert V2 fields for older canonical snapshots', async () => {
    const user = await User.create({ userId: 99002, username: 'legacy-canonical' });

    await User.collection.updateOne(
      { _id: user._id },
      {
        $unset: {
          'cultivation.canonical.state.realmSubStageId': '',
          'cultivation.canonical.state.branchCultivationAttainments': '',
          'cultivation.canonical.state.battleLoadout': '',
          'cultivation.canonical.state.cooldowns': '',
          'cultivation.canonical.state.combatFlags': '',
          'cultivation.canonical.state.combatHistorySummary': ''
        }
      }
    );

    const refreshed = await User.findOne({ userId: 99002 });
    expect(refreshed).not.toBeNull();

    const canonical = refreshed!.ensureCanonicalCultivation();

    expect(canonical.state.realmSubStageId).toBe('realmSubStage.taixi.xuanjing');
    expect(canonical.state.branchCultivationAttainments).toEqual({});
    expect(canonical.state.battleLoadout).toEqual({
      equippedBattleArtIds: ['art.basic_guarding_hand'],
      equippedDivinePowerIds: [],
      equippedArtifactIds: [],
      activeSupportArtId: null
    });
    expect(canonical.state.cooldowns).toEqual({});
    expect(canonical.state.combatFlags).toEqual({});
    expect(canonical.state.combatHistorySummary).toEqual([]);
  });
});
