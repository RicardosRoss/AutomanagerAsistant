import { describe, expect, test, vi } from 'vitest';
import TaskService from '../../src/services/TaskService.js';
import { TaskChain, User, DailyStats } from '../../src/models/index.js';

function fixture() {
  const award = vi.fn().mockResolvedValue({ spiritualPower: 1, immortalStones: 0 });
  const service = new TaskService({ addReminder: vi.fn(), cancelTaskReminders: vi.fn() } as never,
    { awardCultivation: award } as never);
  return { service, award };
}

describe('trusted focus duration', () => {
  test('daily snapshots persist both dates for focus that crosses midnight', async () => {
    const { service } = fixture();
    const created = await service.createTask(810004, '跨午夜阅读', 60);
    const startTime = new Date('2026-10-07T23:30:00Z');
    await TaskChain.updateOne({ 'tasks.taskId': created.task.taskId }, { $set: { 'tasks.$.startTime': startTime } });
    await service.completeTask(810004, created.task.taskId);
    const days = await DailyStats.find({ userId: 810004, date: {
      $gte: new Date('2026-10-07T00:00:00Z'), $lte: new Date('2026-10-08T00:00:00Z')
    } }).sort({ date: 1 });
    expect(days.map((day) => day.stats.totalMinutes)).toEqual([30, 30]);
    expect(days[0]?.stats.tasksStarted).toBe(1);
    expect(days[1]?.stats.tasksCompleted).toBe(1);
  });
  test('an overnight confirmation records 60 focus minutes and a distinct confirmation time', async () => {
    const { service, award } = fixture();
    const created = await service.createTask(810001, '读书', 60);
    const startTime = new Date(Date.now() - 18 * 60 * 60000);
    await TaskChain.updateOne({ 'tasks.taskId': created.task.taskId }, { $set: { 'tasks.$.startTime': startTime } });
    const before = new Date();
    const result = await service.completeTask(810001, created.task.taskId);
    expect(result.task.actualDuration).toBe(60);
    expect(result.task.endTime?.getTime()).toBe(startTime.getTime() + 60 * 60000);
    expect(result.task.confirmedAt?.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.task.elapsedDuration).toBeGreaterThanOrEqual(1080);
    expect(result.chain.totalMinutes).toBe(60);
    expect((await User.findOne({ userId: 810001 }))?.stats.totalMinutes).toBe(60);
    const daily = await DailyStats.find({ userId: 810001 });
    expect(daily.reduce((sum, entry) => sum + entry.stats.totalMinutes, 0)).toBe(60);
    expect(award).not.toHaveBeenCalled();
    expect((await User.findOne({ userId: 810001 }))?.pendingFocusRewards?.[0]?.duration).toBe(60);
  });

  test('short tasks do not become reward-eligible by waiting longer before confirmation', async () => {
    const { service, award } = fixture();
    const created = await service.createTask(810002, '短任务', 30);
    await TaskChain.updateOne({ 'tasks.taskId': created.task.taskId }, {
      $set: { 'tasks.$.startTime': new Date(Date.now() - 90 * 60000) }
    });
    const result = await service.completeTask(810002, created.task.taskId);
    expect(result.task.actualDuration).toBe(30);
    expect(award).not.toHaveBeenCalled();
    expect((await User.findOne({ userId: 810002 }))?.pendingFocusRewards?.[0]?.duration).toBe(30);
  });

  test('early completion fails without consuming the task or giving rewards', async () => {
    const { service, award } = fixture();
    const created = await service.createTask(810003, '完整专注', 60);
    await expect(service.completeTask(810003, created.task.taskId)).rejects.toThrow('自控力检查');
    expect((await TaskChain.findById(created.chain._id))?.tasks[0]?.status).toBe('running');
    expect(award).not.toHaveBeenCalled();
  });
});
