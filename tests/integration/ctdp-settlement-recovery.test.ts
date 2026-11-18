import { expect, test, vi } from 'vitest';
import CTDPService from '../../src/services/CTDPService.js';
import TaskService from '../../src/services/TaskService.js';
import { MainChain, TaskChain, User } from '../../src/models/index.js';

test('a settled task can reconcile a main-chain node after the first node save was lost', async () => {
  const queue = { addReminder: vi.fn(), cancelTaskReminders: vi.fn().mockResolvedValue(0), cancelReservation: vi.fn() };
  const cultivation = {
    awardCultivation: vi.fn().mockResolvedValue({
      spiritualPower: 1,
      immortalStones: 0,
      bonus: 1,
      fortuneEvent: { power: 0, stones: 0, message: null },
      newRealm: '胎息',
      newStage: '玄景',
      realmChanged: false,
      newSpiritualPower: 1
    })
  };
  const tasks = new TaskService(queue as never, cultivation as never);
  const ctdp = new CTDPService(tasks, queue as never);
  const started = await ctdp.startMainTask(817001, { markerLabel: '神圣座位', description: '恢复测试', duration: 60 });
  await TaskChain.updateOne(
    { 'tasks.taskId': started.task.taskId },
    {
      $set: { 'tasks.$.startTime': new Date(Date.now() - 3600000) }
    }
  );
  const originalSave = MainChain.prototype.save;
  let saveCalls = 0;
  vi.spyOn(MainChain.prototype, 'save').mockImplementation(async function saveWithOneLostResponse(this: any) {
    saveCalls += 1;
    if (saveCalls === 1) throw new Error('main chain response lost');
    return originalSave.call(this);
  });
  await expect(ctdp.completeTrackedTask(817001, started.task.taskId)).rejects.toThrow('main chain response lost');
  const recovered = await ctdp.completeTrackedTask(817001, started.task.taskId);
  expect(recovered.task.status).toBe('completed');
  expect((await MainChain.findOne({ userId: 817001 }))?.nodes[0]?.status).toBe('completed');
  expect((await MainChain.findOne({ userId: 817001 }))?.levelCounters.unit).toBe(1);
  expect((await User.findOne({ userId: 817001 }))?.stats.completedTasks).toBe(1);
  expect(cultivation.awardCultivation).not.toHaveBeenCalled();
  expect((await User.findOne({ userId: 817001 }))?.pendingFocusRewards).toHaveLength(1);
  await ctdp.completeMainTask(
    817001, started.mainChain.chainId, started.mainChain.nodes[0]!.nodeNo, started.task.taskId
  );
  expect((await MainChain.findOne({ userId: 817001 }))?.levelCounters.unit).toBe(1);
});
