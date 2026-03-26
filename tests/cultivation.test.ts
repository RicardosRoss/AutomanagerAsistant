import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import CultivationService from '../src/services/CultivationService.js';
import { DivinationHistory, User } from '../src/models/index.js';

describe('修仙系统测试', () => {
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

    expect(status.realm.name).toBe('炼气期');
    expect(status.user.cultivation.spiritualPower).toBe(0);
    expect(status.user.cultivation.immortalStones).toBe(0);
  });

  test('应该能奖励修炼', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const reward = await cultivationService.awardCultivation(testUserId, 25);
    const user = await User.findOne({ userId: testUserId });

    expect(reward.spiritualPower).toBeGreaterThan(0);
    expect(reward.immortalStones).toBeGreaterThan(0);
    expect(user?.cultivation.spiritualPower).toBe(reward.newSpiritualPower);
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
    expect(history).toHaveLength(1);
    expect(history[0]?.gameId).toBeDefined();
  });

  test('应该能升级境界', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    await cultivationService.awardCultivation(testUserId, 1000);
    const status = await cultivationService.getCultivationStatus(testUserId);

    expect(status.user.cultivation.spiritualPower).toBeGreaterThanOrEqual(1000);
    expect(status.realm.name).toBe('筑基期');
  });

  test('应该能渡劫成功', async () => {
    const user = await User.findOne({ userId: testUserId });
    expect(user).not.toBeNull();

    if (user) {
      user.cultivation.spiritualPower = 999;
      user.cultivation.realm = '炼气期';
      user.cultivation.realmId = 1;
      await user.save();
    }

    vi.spyOn(Math, 'random').mockReturnValue(0.1);

    const result = await cultivationService.attemptBreakthrough(testUserId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newRealm).toBe('筑基期');
    }
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
