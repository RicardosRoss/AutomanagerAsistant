import { describe, expect, test, vi } from 'vitest';
import TaskService from '../../src/services/TaskService.js';
import CultivationService from '../../src/services/CultivationService.js';
import { TaskChain, User } from '../../src/models/index.js';

async function backdate(taskId: string, minutes: number) {
  await TaskChain.updateOne(
    { 'tasks.taskId': taskId },
    {
      $set: { 'tasks.$.startTime': new Date(Date.now() - minutes * 60000) }
    }
  );
}

function fixture() {
  const queue = {
    addReminder: vi.fn().mockResolvedValue('job'),
    cancelTaskReminders: vi.fn().mockResolvedValue(0)
  };
  const cultivation = new CultivationService();
  const award = vi.spyOn(cultivation, 'awardCultivation');
  return { service: new TaskService(queue as never, cultivation), queue, award };
}

describe('task settlement recovery and idempotency', () => {
  test('reward failure preserves the settled core and recovery pays it once', async () => {
    const { service, award } = fixture();
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    award.mockRejectedValueOnce(new Error('temporary reward store failure'));
    const created = await service.createTask(814001, '恢复结算', 60);
    await backdate(created.task.taskId, 60);
    await service.completeTask(814001, created.task.taskId, true);
    await expect(service.recoverPendingRewards(814001)).rejects.toThrow('附加奖励');
    const afterFailure = (await TaskChain.findOne({ userId: 814001 }))!.tasks[0]!;
    expect(afterFailure.status).toBe('completed');
    expect(afterFailure.settlementStatus).toBe('settled');
    expect(afterFailure.rewardStatus).toBe('needs_retry');
    await service.recoverPendingRewards(814001);
    await service.recoverPendingRewards(814001);
    expect(award).toHaveBeenCalledTimes(2);
    const user = await User.findOne({ userId: 814001 });
    expect(user?.stats.completedTasks).toBe(1);
    expect(user?.stats.totalMinutes).toBe(60);
    expect(user?.cultivation.spiritualPower).toBe(1);
    expect(user?.focusRewardReceipts).toHaveLength(1);
  });

  test('daily statistics failure can be retried without repeating reward or user counters', async () => {
    const { service, award } = fixture();
    const created = await service.createTask(814002, '统计重试', 60);
    const daily = vi
      .spyOn(service, 'updateDailyStats')
      .mockRejectedValueOnce(new Error('temporary daily stats failure'))
      .mockResolvedValue({} as never);
    await backdate(created.task.taskId, 60);
    await expect(service.completeTask(814002, created.task.taskId, true)).rejects.toThrow('daily stats');
    await service.completeTask(814002, created.task.taskId, true);
    expect(award).not.toHaveBeenCalled();
    await service.recoverPendingRewards(814002);
    expect(award).toHaveBeenCalledTimes(1);
    expect(daily).toHaveBeenCalledTimes(2); // failed completion + retry
    const user = await User.findOne({ userId: 814002 });
    expect(user?.stats.completedTasks).toBe(1);
    expect(user?.stats.totalMinutes).toBe(60);
  });

  test('concurrent retry attempts have one settlement owner and never double-count user stats', async () => {
    const { service, award } = fixture();
    const created = await service.createTask(814003, '并发结算', 60);
    await backdate(created.task.taskId, 60);
    const results = await Promise.allSettled([
      service.completeTask(814003, created.task.taskId, true),
      service.completeTask(814003, created.task.taskId, true)
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(award).not.toHaveBeenCalled();
    await service.recoverPendingRewards(814003);
    expect(award).toHaveBeenCalledTimes(1);
    expect((await User.findOne({ userId: 814003 }))?.stats.completedTasks).toBe(1);
  });
});
