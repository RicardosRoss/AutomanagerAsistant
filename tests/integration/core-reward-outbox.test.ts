import { expect, test, vi } from 'vitest';
import TaskService from '../../src/services/TaskService.js';
import CTDPService from '../../src/services/CTDPService.js';
import { TaskChain, MainChain, User } from '../../src/models/index.js';

function fixture(award = vi.fn().mockRejectedValue(new Error('optional reward offline'))) {
  const queue = { addReminder: vi.fn(), cancelTaskReminders: vi.fn().mockResolvedValue(0) };
  const tasks = new TaskService(queue as never, { awardCultivation: award } as never);
  return { tasks, ctdp: new CTDPService(tasks, queue as never), award };
}

async function start(userId: number, ctdp: CTDPService) {
  const started = await ctdp.startMainTask(userId, { description: '专注优先', duration: 60, markerLabel: '确认' });
  await TaskChain.updateOne({ userId }, { $set: { 'tasks.0.startTime': new Date(Date.now() - 3600000) } });
  return started.task.taskId;
}

test('optional reward failure cannot block core completion, main node or the next task', async () => {
  const { ctdp, award } = fixture();
  const taskId = await start(835001, ctdp);
  const result = await ctdp.completeTrackedTask(835001, taskId);
  expect(result.task.settlementStatus).toBe('settled');
  expect(result.rewardPending).toBe(true);
  expect(award).not.toHaveBeenCalled();
  const main = (await MainChain.findOne({ userId: 835001 }))!;
  expect(main.nodes[0]?.status).toBe('completed');
  expect(main.levelCounters.unit).toBe(1);
  const user = (await User.findOne({ userId: 835001 }))!;
  expect(user.stats.completedTasks).toBe(1);
  expect(user.stats.totalMinutes).toBe(60);
  expect(user.cultivation.spiritualPower).toBe(0);
  expect(user.pendingFocusRewards).toHaveLength(1);
  expect(user.pendingFocusRewards?.[0]).toMatchObject({ taskId, duration: 60, legacyCurrentStreakBefore: 0 });
  const next = await ctdp.startMainTask(835001, { description: '下一项', duration: 30, markerLabel: '确认' });
  expect(next.mainChain.nodes[1]?.nodeNo).toBe(2);
  expect(next.task.status).toBe('running');
});

test('core completion returns before any paused reward calculation can delay it', async () => {
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const entered = new Promise<void>(resolve => {
    reached = resolve;
  });
  const award = vi.fn(async () => {
    reached();
    await gate;
    return { spiritualPower: 1 } as never;
  });
  const { ctdp } = fixture(award);
  const taskId = await start(835002, ctdp);
  const completing = ctdp.completeTrackedTask(835002, taskId);
  try {
    const first = await Promise.race([entered.then(() => 'reward-awaited'), completing.then(() => 'core-complete')]);
    expect(first).toBe('core-complete');
    expect((await MainChain.findOne({ userId: 835002 }))?.nodes[0]?.status).toBe('completed');
  } finally {
    release();
    await completing.catch(() => undefined);
  }
});

test('a lost task stats flag cannot duplicate the atomically saved reward intent', async () => {
  const { ctdp, award } = fixture();
  const taskId = await start(835003, ctdp);
  const update = TaskChain.findOneAndUpdate.bind(TaskChain);
  let failed = false;
  const mark = vi.spyOn(TaskChain, 'findOneAndUpdate').mockImplementation((async (...args: any[]) => {
    if (!failed && args[1]?.$set?.['tasks.$.userStatsApplied']) {
      failed = true;
      throw new Error('core flag response lost');
    }
    return update(...(args as [any, any, any]));
  }) as any);
  try {
    await expect(ctdp.completeTrackedTask(835003, taskId)).rejects.toThrow('core flag');
    const saved = (await User.findOne({ userId: 835003 }))!;
    expect(saved.stats.completedTasks).toBe(1);
    expect(saved.pendingFocusRewards).toHaveLength(1);
    await ctdp.completeTrackedTask(835003, taskId);
    expect((await User.findOne({ userId: 835003 }))?.pendingFocusRewards).toHaveLength(1);
    expect((await User.findOne({ userId: 835003 }))?.stats.completedTasks).toBe(1);
    expect((await MainChain.findOne({ userId: 835003 }))?.nodes[0]?.status).toBe('completed');
    expect(award).not.toHaveBeenCalled();
  } finally {
    mark.mockRestore();
  }
});

test('a saved core result with an unfinished main projection is repaired before the next start', async () => {
  const { ctdp } = fixture();
  const taskId = await start(835004, ctdp);
  const save = vi.spyOn(MainChain.prototype, 'save').mockRejectedValueOnce(new Error('main projection offline'));
  try {
    await expect(ctdp.completeTrackedTask(835004, taskId)).rejects.toThrow('main projection');
    expect((await TaskChain.findOne({ userId: 835004 }))?.tasks[0]?.settlementStatus).toBe('settled');
    const next = await ctdp.startMainTask(835004, { description: '继续下一项', duration: 30, markerLabel: '确认' });
    expect(next.mainChain.nodes[0]?.status).toBe('completed');
    expect(next.mainChain.nodes[1]?.status).toBe('running');
    expect((await User.findOne({ userId: 835004 }))?.pendingFocusRewards).toHaveLength(1);
  } finally {
    save.mockRestore();
  }
});
