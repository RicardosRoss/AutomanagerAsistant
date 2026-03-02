/**
 * 测试任务重复完成问题的修复
 * 验证原子性操作是否能防止重复结算奖励
 *
 * 运行: NODE_ENV=test node tests/task-duplicate-completion.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import TaskService from '../src/services/TaskService.js';
import QueueService from '../src/services/QueueService.js';
import CultivationService from '../src/services/CultivationService.js';
import { TaskChain, User } from '../src/models/index.js';
import config from '../config/index.js';

describe('任务重复完成防护测试', () => {
  let taskService;
  let queueService;
  let cultivationService;
  let testUserId;

  before(async () => {
    // 连接测试数据库
    await mongoose.connect(config.database.uri);

    // 初始化服务（不初始化 QueueService 以避免 Redis 连接）
    cultivationService = new CultivationService();

    // 创建一个模拟的 QueueService
    queueService = {
      addReminder: async () => 'mock-job-id',
      cancelTaskReminders: async () => 0,
      setBotInstance: () => {},
      initialize: async () => {},
      isInitialized: true
    };

    taskService = new TaskService(queueService, cultivationService);

    // 创建测试用户
    testUserId = Math.floor(Math.random() * 1000000);

    console.log(`✅ 测试环境初始化完成，测试用户ID: ${testUserId}`);
  });

  after(async () => {
    // 清理测试数据
    await User.deleteMany({ userId: testUserId });
    await TaskChain.deleteMany({ userId: testUserId });
    await mongoose.connection.close();

    console.log('✅ 测试数据清理完成');
  });

  it('应该防止同一任务被重复完成', async () => {
    console.log('\n🧪 测试场景: 并发完成同一任务');

    // 创建测试任务
    const result = await taskService.createTask(testUserId, '测试任务', 25);
    const testTaskId = result.task.taskId;

    console.log(`   - 任务ID: ${testTaskId}`);

    // 获取初始状态
    const userBefore = await User.findOne({ userId: testUserId });
    const completedBefore = userBefore.stats.completedTasks;
    const minutesBefore = userBefore.stats.totalMinutes;
    const cultivationBefore = userBefore.cultivation.spiritualPower;

    console.log(`📊 初始状态:`);
    console.log(`   - 完成任务数: ${completedBefore}`);
    console.log(`   - 总分钟数: ${minutesBefore}`);
    console.log(`   - 灵力: ${cultivationBefore}`);

    // 🔥 并发执行两次完成操作（模拟重复点击）
    const [result1, result2] = await Promise.allSettled([
      taskService.completeTask(testUserId, testTaskId, true),
      taskService.completeTask(testUserId, testTaskId, true)
    ]);

    console.log(`\n📋 执行结果:`);
    console.log(`   - 请求1: ${result1.status}`);
    console.log(`   - 请求2: ${result2.status}`);

    // 验证：一个成功，一个失败
    const successCount = [result1, result2].filter((r) => r.status === 'fulfilled').length;
    const failureCount = [result1, result2].filter((r) => r.status === 'rejected').length;

    console.log(`\n✅ 断言验证:`);
    console.log(`   - 成功次数: ${successCount} (期望: 1)`);
    console.log(`   - 失败次数: ${failureCount} (期望: 1)`);

    assert.strictEqual(successCount, 1, '应该只有一个请求成功');
    assert.strictEqual(failureCount, 1, '应该有一个请求失败');

    // 验证失败原因
    const failedResult = [result1, result2].find((r) => r.status === 'rejected');
    console.log(`   - 失败原因: ${failedResult.reason.message}`);
    assert.match(
      failedResult.reason.message,
      /任务不存在、已完成或未在运行状态/,
      '失败原因应该是任务已完成'
    );

    // 获取最终状态
    const userAfter = await User.findOne({ userId: testUserId });
    const completedAfter = userAfter.stats.completedTasks;
    const minutesAfter = userAfter.stats.totalMinutes;
    const cultivationAfter = userAfter.cultivation.spiritualPower;

    console.log(`\n📊 最终状态:`);
    console.log(`   - 完成任务数: ${completedAfter} (增加: ${completedAfter - completedBefore})`);
    console.log(`   - 总分钟数: ${minutesAfter} (增加: ${minutesAfter - minutesBefore})`);
    console.log(`   - 灵力: ${cultivationAfter} (增加: ${cultivationAfter - cultivationBefore})`);

    // 验证：统计只增加了一次
    assert.strictEqual(completedAfter - completedBefore, 1, '完成任务数应该只增加1');
    assert.ok(minutesAfter > minutesBefore, '总分钟数应该增加');
    assert.ok(cultivationAfter > cultivationBefore, '灵力应该增加');

    // 验证任务状态
    const chain = await TaskChain.findOne({ userId: testUserId });
    const task = chain.tasks.find((t) => t.taskId === testTaskId);
    assert.strictEqual(task.status, 'completed', '任务状态应该是completed');

    console.log(`\n🎉 测试通过：原子性操作成功防止了重复结算！`);
  });

  it('应该允许不同任务的并发完成', async () => {
    console.log('\n🧪 测试场景: 并发完成不同任务');

    // 创建两个任务
    const result1 = await taskService.createTask(testUserId, '测试任务1', 25);
    const testTaskId1 = result1.task.taskId;

    const result2 = await taskService.createTask(testUserId, '测试任务2', 30);
    const testTaskId2 = result2.task.taskId;

    // 获取初始状态
    const userBefore = await User.findOne({ userId: testUserId });
    const completedBefore = userBefore.stats.completedTasks;

    console.log(`📊 初始状态: 完成任务数 = ${completedBefore}`);
    console.log(`   - 任务1 ID: ${testTaskId1}`);
    console.log(`   - 任务2 ID: ${testTaskId2}`);

    // 并发完成两个不同任务
    const [resultA, resultB] = await Promise.allSettled([
      taskService.completeTask(testUserId, testTaskId1, true),
      taskService.completeTask(testUserId, testTaskId2, true)
    ]);

    console.log(`\n📋 执行结果:`);
    console.log(`   - 任务1: ${resultA.status}`);
    console.log(`   - 任务2: ${resultB.status}`);

    // 验证：两个都应该成功（因为是不同的任务）
    assert.strictEqual(resultA.status, 'fulfilled', '任务1应该完成成功');
    assert.strictEqual(resultB.status, 'fulfilled', '任务2应该完成成功');

    // 验证最终状态
    const userAfter = await User.findOne({ userId: testUserId });
    const completedAfter = userAfter.stats.completedTasks;

    console.log(`📊 最终状态: 完成任务数 = ${completedAfter} (增加: ${completedAfter - completedBefore})`);

    // 验证：统计增加了两次
    assert.strictEqual(completedAfter - completedBefore, 2, '完成任务数应该增加2');

    console.log(`\n🎉 测试通过：不同任务可以正常并发完成！`);
  });
});
