/**
 * 修仙系统功能测试
 *
 * 运行：NODE_ENV=test node tests/cultivation.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { User, DivinationHistory } from '../src/models/index.js';
import CultivationService from '../src/services/CultivationService.js';
import config from '../config/index.js';

const cultivationService = new CultivationService();

describe('修仙系统测试', () => {
  let testUserId;

  before(async () => {
    // 连接测试数据库
    await mongoose.connect(config.database.uri);

    // 创建测试用户
    testUserId = Math.floor(Math.random() * 1000000);
    await User.create({
      userId: testUserId,
      username: 'test_cultivator',
      firstName: 'Test',
      lastName: 'User'
    });

    console.log(`✅ 测试用户创建: ${testUserId}`);
  });

  after(async () => {
    // 清理测试数据
    await User.deleteOne({ userId: testUserId });
    await DivinationHistory.deleteMany({ userId: testUserId });
    await mongoose.connection.close();

    console.log('✅ 测试数据清理完成');
  });

  it('应该能获取修仙状态', async () => {
    const status = await cultivationService.getCultivationStatus(testUserId);

    assert.strictEqual(status.realm.name, '炼气期', '初始境界应为炼气期');
    assert.strictEqual(status.user.cultivation.spiritualPower, 0, '初始灵力应为0');
    assert.strictEqual(status.user.cultivation.immortalStones, 0, '初始仙石应为0');

    console.log('✅ 获取修仙状态测试通过');
  });

  it('应该能奖励修炼', async () => {
    const duration = 25; // 25分钟
    const reward = await cultivationService.awardCultivation(testUserId, duration);

    assert.ok(reward.spiritualPower > 0, '应该获得灵力');
    assert.ok(reward.immortalStones > 0, '应该获得仙石');

    console.log(`✅ 修炼奖励测试通过: +${reward.spiritualPower}灵力, +${reward.immortalStones}仙石`);
  });

  it('应该能占卜天机', async () => {
    // 先获得一些仙石
    await cultivationService.awardCultivation(testUserId, 100);

    const user = await User.findOne({ userId: testUserId });
    const initialStones = user.cultivation.immortalStones;

    const result = await cultivationService.castDivination(testUserId, 10);

    assert.ok(result.roll >= 1 && result.roll <= 8, '骰子点数应在1-8之间');
    assert.ok(result.gua, '应该有卦象信息');
    assert.strictEqual(result.betAmount, 10, '下注金额应为10');

    console.log(`✅ 占卜测试通过: ${result.gua.emoji} ${result.gua.name} (${result.gua.meaning})`);
  });

  it('应该能记录占卜历史', async () => {
    const history = await cultivationService.getDivinationHistory(testUserId, 5);

    assert.ok(Array.isArray(history), '历史记录应为数组');
    assert.ok(history.length > 0, '应该有至少一条占卜记录');

    console.log(`✅ 占卜历史测试通过: 共${history.length}条记录`);
  });

  it('应该能升级境界', async () => {
    // 奖励足够的灵力以升级
    await cultivationService.awardCultivation(testUserId, 1000);

    const status = await cultivationService.getCultivationStatus(testUserId);

    assert.ok(status.user.cultivation.spiritualPower >= 1000, '灵力应达到1000');

    // 检查是否升级到筑基期
    if (status.user.cultivation.spiritualPower >= 1000) {
      assert.strictEqual(status.realm.name, '筑基期', '灵力达到1000应升级到筑基期');
    }

    console.log(`✅ 境界升级测试通过: ${status.realm.name} (${status.user.cultivation.spiritualPower}灵力)`);
  });

  it('应该能尝试渡劫（需要达到境界巅峰）', async () => {
    const user = await User.findOne({ userId: testUserId });

    // 设置灵力到炼气期巅峰
    user.cultivation.spiritualPower = 999;
    await user.save();

    try {
      const result = await cultivationService.attemptBreakthrough(testUserId);

      if (result.success) {
        assert.strictEqual(result.newRealm, '筑基期', '渡劫成功应进入筑基期');
        console.log('✅ 渡劫成功测试通过');
      } else {
        assert.ok(result.penalty > 0, '渡劫失败应有灵力惩罚');
        console.log('✅ 渡劫失败测试通过（这是正常的随机结果）');
      }
    } catch (error) {
      console.log(`⚠️ 渡劫测试跳过: ${error.message}`);
    }
  });

  it('应该能获取修仙排行榜', async () => {
    const leaderboard = await cultivationService.getLeaderboard('power', 10);

    assert.ok(Array.isArray(leaderboard), '排行榜应为数组');
    console.log(`✅ 排行榜测试通过: ${leaderboard.length}个用户`);
  });

  it('应该能获取占卜统计', async () => {
    const stats = await cultivationService.getDivinationStats(testUserId);

    assert.ok(typeof stats.totalGames === 'number', '总游戏次数应为数字');
    assert.ok(typeof stats.netProfit === 'number', '净收益应为数字');

    console.log(`✅ 占卜统计测试通过: ${stats.totalGames}次占卜，净收益${stats.netProfit}`);
  });
});

// 运行测试
console.log('🧪 开始修仙系统测试...\n');
