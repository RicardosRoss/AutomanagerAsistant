import { expect, test, vi } from 'vitest';
import TaskService from '../../src/services/TaskService.js';
import CTDPService from '../../src/services/CTDPService.js';
import MainViolationService from '../../src/services/MainViolationService.js';
import { MainChain, TaskChain, User } from '../../src/models/index.js';

function fixture() {
  const queue = { addReminder: vi.fn(), cancelTaskReminders: vi.fn().mockResolvedValue(0) };
  const tasks = new TaskService(
    queue as never,
    { awardCultivation: vi.fn().mockResolvedValue({ spiritualPower: 0 }) } as never
  );
  return {
    tasks,
    ctdp: new CTDPService(tasks, queue as never),
    rules: new MainViolationService(queue as never, tasks)
  };
}

test.each(['settled', 'pending'])(
  'a chosen break can finish with a snapshotted task already confirmed completed/%s',
  async state => {
    const { ctdp, rules } = fixture();
    const started = await ctdp.startMainTask(834010, { description: '确认交错', duration: 30, markerLabel: '确认' });
    const report = await rules.report(834010, '离开位置');
    await MainChain.updateOne(
      { userId: 834010 },
      {
        $set: {
          'pendingViolation.decision': 'break_chain',
          'pendingViolation.taskIds': [started.task.taskId],
          'pendingViolation.taskChainId': (await TaskChain.findOne({ userId: 834010 }))!.chainId
        }
      }
    );
    const start = new Date(Date.now() - 1800000);
    await TaskChain.updateOne(
      { userId: 834010 },
      {
        $set: {
          'tasks.0.status': 'completed',
          'tasks.0.startTime': start,
          'tasks.0.endTime': new Date(start.getTime() + 1800000),
          'tasks.0.actualDuration': 30,
          'tasks.0.settlementStatus': state,
          'tasks.0.rewardApplied': true,
          'tasks.0.chainStatsApplied': state === 'settled',
          'tasks.0.userStatsApplied': state === 'settled',
          'tasks.0.dailyStatsApplied': state === 'settled'
        }
      }
    );
    if (state === 'settled')
      await User.updateOne(
        { userId: 834010 },
        {
          $set: {
            'stats.completedTasks': 1,
            'stats.currentStreak': 1,
            'stats.totalMinutes': 30,
            'stats.settledTaskIds': [started.task.taskId]
          }
        }
      );
    await rules.resolve(834010, 'break_chain', report.pending!.decisionToken);
    const main = (await MainChain.findOne({ userId: 834010 }))!;
    const chain = (await TaskChain.findOne({ userId: 834010 }))!;
    const user = (await User.findOne({ userId: 834010 }))!;
    expect(main.status).toBe('broken');
    expect(main.pendingViolation).toBeUndefined();
    expect(main.nodes).toHaveLength(0);
    expect(chain.status).toBe('broken');
    expect(chain.completedTasks).toBe(0);
    expect(chain.totalTasks).toBe(0);
    expect(chain.tasks[0]?.status).toBe('completed');
    expect(chain.tasks[0]?.settlementStatus).toBe('settled');
    expect(user.stats.currentStreak).toBe(0);
    expect(user.stats.completedTasks).toBe(1);
    expect(user.stats.failedTasks).toBe(0);
    expect(user.stats.totalMinutes).toBe(30);
    const next = await ctdp.startMainTask(834010, { description: '新链', duration: 30, markerLabel: '确认' });
    expect(next.mainChain.chainId).not.toBe(main.chainId);
    expect(next.mainChain.nodes[0]?.nodeNo).toBe(1);
  }
);

test('an unchosen or mismatched main decision cannot authorize completion through break recovery', async () => {
  const { tasks, ctdp, rules } = fixture();
  const started = await ctdp.startMainTask(834011, { description: '判例归属', duration: 30, markerLabel: '确认' });
  const report = await rules.report(834011, '刷手机');
  await expect(
    tasks.finishConfirmedTaskBeforeBreak(834011, started.task.taskId, report.pending!.decisionToken!, 'fake-owner')
  ).rejects.toThrow('认领已变化');
  await expect(
    tasks.finishConfirmedTaskBeforeBreak(834012, started.task.taskId, report.pending!.decisionToken!, 'fake-owner')
  ).rejects.toThrow();
  expect((await TaskChain.findOne({ userId: 834011 }))?.tasks[0]?.status).toBe('running');
  expect((await User.findOne({ userId: 834011 }))?.stats.completedTasks).toBe(0);
});

test('a confirmed compatible task without a main intent is included before the break can finish', async () => {
  const { tasks, rules } = fixture();
  const created = await tasks.createTask(834014, '兼容已确认任务', 30);
  await MainChain.findOrCreateActive(834014, '确认');
  await TaskChain.updateOne(
    { userId: 834014 },
    {
      $set: {
        'tasks.0.status': 'completed',
        'tasks.0.startTime': new Date(Date.now() - 1800000),
        'tasks.0.actualDuration': 30,
        'tasks.0.endTime': new Date(),
        'tasks.0.settlementStatus': 'pending',
        'tasks.0.rewardApplied': true
      }
    }
  );
  const report = await rules.report(834014, '离开位置');
  await rules.resolve(834014, 'break_chain', report.pending!.decisionToken);
  const user = (await User.findOne({ userId: 834014 }))!;
  expect(user.stats.completedTasks).toBe(1);
  expect(user.stats.currentStreak).toBe(0);
  expect((await TaskChain.findOne({ userId: 834014 }))?.tasks[0]?.taskId).toBe(created.task.taskId);
  expect((await TaskChain.findOne({ userId: 834014 }))?.tasks[0]?.settlementStatus).toBe('settled');
  await tasks.createTask(834014, '收尾后下一项', 30);
});

test('an in-flight completion and chosen break converge without a stuck decision or revived chain', async () => {
  const { tasks, ctdp, rules } = fixture();
  const started = await ctdp.startMainTask(834013, { description: '真实交错', duration: 30, markerLabel: '确认' });
  await TaskChain.updateOne({ userId: 834013 }, { $set: { 'tasks.0.startTime': new Date(Date.now() - 1800000) } });
  let reached!: () => void;
  let release!: () => void;
  const entered = new Promise<void>(resolve => {
    reached = resolve;
  });
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const daily = tasks.updateDailyStats.bind(tasks);
  const pause = vi.spyOn(tasks, 'updateDailyStats').mockImplementationOnce(async (...args) => {
    reached();
    await gate;
    return daily(...args);
  });
  const complete = ctdp.completeTrackedTask(834013, started.task.taskId).then(
    result => ({ result }),
    error => ({ error })
  );
  try {
    await entered;
    const report = await rules.report(834013, '离开位置');
    await expect(rules.resolve(834013, 'break_chain', report.pending!.decisionToken)).rejects.toThrow('正在处理中');
    const selected = (await MainChain.findOne({ userId: 834013 }))!;
    expect(selected.pendingViolation?.taskIds).toContain(started.task.taskId);
    expect(selected.pendingViolation?.decision).toBe('break_chain');
    release();
    await complete;
    await rules.recoverSelectedDecisions(834013);
    expect((await MainChain.findOne({ userId: 834013 }))?.pendingViolation).toBeUndefined();
    expect((await MainChain.findOne({ userId: 834013 }))?.status).toBe('broken');
    const chain = (await TaskChain.findOne({ userId: 834013 }))!;
    expect(chain.status).toBe('broken');
    expect(chain.completedTasks).toBe(0);
    expect(chain.totalTasks).toBe(0);
    expect(chain.tasks[0]?.settlementStatus).toBe('settled');
    expect((await User.findOne({ userId: 834013 }))?.stats.completedTasks).toBe(1);
    expect((await User.findOne({ userId: 834013 }))?.stats.currentStreak).toBe(0);
    await ctdp.startMainTask(834013, { description: '交错后新任务', duration: 30, markerLabel: '确认' });
  } finally {
    release();
    await complete;
    pause.mockRestore();
  }
});
