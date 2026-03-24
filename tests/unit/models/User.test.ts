import { describe, expect, test } from 'vitest';
import { User } from '../../../src/models/index.js';

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
      expect(user.settings.defaultDuration).toBe(25);
      expect(user.settings.reminderEnabled).toBe(true);
      expect(user.stats.totalTasks).toBe(0);
      expect(user.stats.currentStreak).toBe(0);
      expect(user.stats.longestStreak).toBe(0);
    });

    test('用户ID应该是唯一的', async () => {
      const user1 = new User({ userId: 999999 });
      await user1.save();

      const user2 = new User({ userId: 999999 });
      await expect(user2.save()).rejects.toThrow();
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
});
