import { expect, test, vi } from 'vitest';
import { TaskChain, User, DailyStats } from '../../src/models/index.js';
import TaskService from '../../src/services/TaskService.js';
import SelfControlBot from '../../src/bot.js';
import moment from 'moment-timezone';

function fixture() {
  return new TaskService(
    { addReminder: vi.fn(), cancelTaskReminders: vi.fn() } as never,
    { awardCultivation: vi.fn().mockResolvedValue({ spiritualPower: 0, immortalStones: 0 }) } as never
  );
}

test('a delayed old daily snapshot cannot overwrite a newer completed-task snapshot', async () => {
  const service = fixture();
  const created = await service.createTask(832001, '日报并发', 30);
  let entered!: () => void;
  let release!: () => void;
  const reached = new Promise<void>(resolve => {
    entered = resolve;
  });
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const original = service.getDailyStats.bind(service);
  const snapshot = vi.spyOn(service, 'getDailyStats').mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    entered();
    await gate;
    return result;
  });
  const stale = service.updateDailyStats(832001, created.task, false);
  try {
    await reached;
    await TaskChain.updateOne(
      { userId: 832001 },
      {
        $set: {
          'tasks.0.status': 'completed',
          'tasks.0.actualDuration': 30,
          'tasks.0.endTime': new Date(created.task.startTime.getTime() + 1800000)
        }
      }
    );
    await fixture().updateDailyStats(832001, created.task, true);
    release();
    await stale;
    const persisted = await DailyStats.findOne({ userId: 832001 });
    expect(persisted?.stats.tasksStarted).toBe(1);
    expect(persisted?.stats.tasksCompleted).toBe(1);
    expect(persisted?.stats.totalMinutes).toBe(30);
  } finally {
    release();
    await stale;
    snapshot.mockRestore();
  }
});

test('a refresh interrupted after its durable claim is repaired by maintenance', async () => {
  const service = fixture();
  const created = await service.createTask(832002, '日报中断', 30);
  await TaskChain.updateOne(
    { userId: 832002 },
    { $set: { 'tasks.0.status': 'failed', 'tasks.0.endTime': new Date() } }
  );
  const read = vi.spyOn(service, 'getDailyStats').mockRejectedValueOnce(new Error('snapshot DB unavailable'));
  await expect(service.updateDailyStats(832002, created.task, false)).rejects.toThrow();
  read.mockRestore();
  expect((await DailyStats.findOne({ userId: 832002 }))?.metadata.refreshPending).toBe(true);
  await (fixture() as any).recoverDailySnapshots();
  const repaired = await DailyStats.findOne({ userId: 832002 });
  expect(repaired?.metadata.refreshPending).toBe(false);
  expect(repaired?.stats.tasksFailed).toBe(1);
  expect(repaired?.stats.tasksStarted).toBe(1);
});

test('an interrupted snapshot keeps its original timezone when account settings change', async () => {
  const service = fixture();
  await User.create({ userId: 832004, settings: { timezone: 'Asia/Shanghai' } });
  const created = await service.createTask(832004, '跨时区恢复', 30);
  const read = vi.spyOn(service, 'getDailyStats').mockRejectedValueOnce(new Error('read offline'));
  await expect(service.updateDailyStats(832004, created.task, false)).rejects.toThrow();
  read.mockRestore();
  const pending = (await DailyStats.findOne({ userId: 832004 }))!;
  expect(pending.metadata.refreshTimezone).toBe('Asia/Shanghai');
  await User.updateOne({ userId: 832004 }, { $set: { 'settings.timezone': 'America/Los_Angeles' } });
  await fixture().recoverDailySnapshots();
  const repaired = (await DailyStats.findById(pending._id))!;
  expect(repaired.metadata.refreshPending).toBe(false);
  expect(repaired.date).toEqual(pending.date);
  expect(repaired.stats.tasksStarted).toBe(1);
});

test('a superseded snapshot keeps the failed newer claim for wired maintenance recovery', async () => {
  const firstService = fixture();
  const newerService = fixture();
  const created = await firstService.createTask(832005, '覆盖后中断', 30);
  let entered!: () => void;
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const reached = new Promise<void>(resolve => {
    entered = resolve;
  });
  const read = firstService.getDailyStats.bind(firstService);
  const oldRead = vi.spyOn(firstService, 'getDailyStats').mockImplementationOnce(async (...args) => {
    const snapshot = await read(...args);
    entered();
    await gate;
    return snapshot;
  });
  const stale = firstService.updateDailyStats(832005, created.task, false);
  try {
    await reached;
    await TaskChain.updateOne(
      { userId: 832005 },
      { $set: { 'tasks.0.status': 'failed', 'tasks.0.endTime': new Date() } }
    );
    const fault = vi.spyOn(newerService, 'getDailyStats').mockRejectedValueOnce(new Error('newer read failed'));
    await expect(newerService.updateDailyStats(832005, created.task, false)).rejects.toThrow('newer read');
    fault.mockRestore();
    release();
    await stale;
    expect((await DailyStats.findOne({ userId: 832005 }))?.metadata.refreshPending).toBe(true);
    await new SelfControlBot().queueService.taskCreationRecoveryHandler!();
    const recovered = (await DailyStats.findOne({ userId: 832005 }))!;
    expect(recovered.metadata.refreshPending).toBe(false);
    expect(recovered.stats.tasksFailed).toBe(1);
  } finally {
    release();
    await stale;
    oldRead.mockRestore();
  }
});

test('two terminal recoveries atomically extend both current and longest streak with each receipt once', async () => {
  const service = fixture();
  await User.create({ userId: 832003, stats: { currentStreak: 3, longestStreak: 3 } });
  const start = new Date(Date.now() - 3600000);
  await TaskChain.create({
    userId: 832003,
    chainId: 'streak-retry',
    status: 'active',
    tasks: [0, 1].map(index => ({
      taskId: `streak-${index}`,
      description: '已确认任务',
      duration: 30,
      actualDuration: 30,
      startTime: start,
      endTime: new Date(start.getTime() + 1800000),
      status: 'completed',
      settlementStatus: 'needs_retry',
      rewardApplied: true,
      chainStatsApplied: true
    }))
  });

  let entered!: () => void;
  let release!: () => void;
  const reached = new Promise<void>(resolve => {
    entered = resolve;
  });
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const update = User.updateOne.bind(User);
  const slow = vi.spyOn(User, 'updateOne').mockImplementationOnce(async (...args: any[]) => {
    entered();
    await gate;
    return update(...(args as [any, any]));
  });
  const first = service.completeTask(832003, 'streak-0');
  try {
    await reached;
    await fixture().completeTask(832003, 'streak-1');
    release();
    await first;
    const user = (await User.findOne({ userId: 832003 }))!;
    expect(user.stats.currentStreak).toBe(5);
    expect(user.stats.longestStreak).toBe(5);
    expect(user.stats.completedTasks).toBe(2);
    expect(user.stats.totalMinutes).toBe(60);
    expect(user.stats.settledTaskIds).toHaveLength(2);
    await expect(fixture().completeTask(832003, 'streak-0')).rejects.toThrow();
    expect((await User.findOne({ userId: 832003 }))?.stats.longestStreak).toBe(5);
  } finally {
    release();
    await first;
    slow.mockRestore();
  }
});

test('a cross-midnight refresh that fails on its first day leaves both days recoverable', async () => {
  const service = fixture();
  await User.create({ userId: 832006, settings: { timezone: 'UTC' } });
  const start = moment.utc().startOf('day').subtract(30, 'minutes').toDate();
  const end = new Date(start.getTime() + 3600000);
  await TaskChain.create({
    userId: 832006,
    chainId: 'cross-refresh',
    tasks: [
      {
        taskId: 'cross-refresh-task',
        description: '跨日刷新',
        duration: 60,
        actualDuration: 60,
        startTime: start,
        endTime: end,
        status: 'completed'
      }
    ]
  });
  const task = (await TaskChain.findOne({ userId: 832006 }))!.tasks[0]!;
  const read = vi.spyOn(service, 'getDailyStats').mockRejectedValueOnce(new Error('first day read unavailable'));
  await expect(service.updateDailyStats(832006, task, true)).rejects.toThrow();
  read.mockRestore();
  expect(await DailyStats.countDocuments({ userId: 832006, 'metadata.refreshPending': true })).toBe(2);
  await fixture().recoverDailySnapshots();
  const days = await DailyStats.find({ userId: 832006 }).sort({ date: 1 });
  expect(days).toHaveLength(2);
  expect(days.map(day => day.stats.totalMinutes)).toEqual([30, 30]);
  expect(days.map(day => day.metadata.refreshPending)).toEqual([false, false]);
});

test('superseded refresh preserves the latest lastTaskAt even when its source task ended later', async () => {
  const service = fixture();
  const created = await service.createTask(832007, '活动时间', 30);
  const later = new Date(created.task.startTime.getTime() + 1800000);
  let entered!: () => void;
  let release!: () => void;
  const reached = new Promise<void>(resolve => {
    entered = resolve;
  });
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const read = service.getDailyStats.bind(service);
  const slow = vi.spyOn(service, 'getDailyStats').mockImplementationOnce(async (...args) => {
    entered();
    await gate;
    return read(...args);
  });
  const first = service.updateDailyStats(832007, { ...created.task, endTime: later }, true);
  try {
    await reached;
    await fixture().updateDailyStats(832007, created.task, false);
    release();
    await first;
    expect((await DailyStats.findOne({ userId: 832007 }))?.metadata.lastTaskAt).toEqual(later);
  } finally {
    release();
    await first;
    slow.mockRestore();
  }
});

test('a lost per-task stats flag reads the settled user receipt without increasing counters again', async () => {
  const service = fixture();
  await User.create({
    userId: 832008,
    stats: {
      currentStreak: 4,
      longestStreak: 4,
      completedTasks: 1,
      totalMinutes: 30,
      settledTaskIds: ['stats-receipt']
    }
  });
  await TaskChain.create({
    userId: 832008,
    chainId: 'stats-flag',
    tasks: [
      {
        taskId: 'stats-receipt',
        description: '恢复标记',
        duration: 30,
        actualDuration: 30,
        status: 'completed',
        startTime: new Date(Date.now() - 3600000),
        endTime: new Date(Date.now() - 1800000),
        settlementStatus: 'needs_retry',
        rewardApplied: true,
        chainStatsApplied: true,
        userStatsApplied: false
      }
    ]
  });
  await service.completeTask(832008, 'stats-receipt');
  const user = (await User.findOne({ userId: 832008 }))!;
  expect(user.stats.completedTasks).toBe(1);
  expect(user.stats.totalMinutes).toBe(30);
  expect(user.stats.currentStreak).toBe(4);
  expect(user.stats.longestStreak).toBe(4);
  expect(user.stats.settledTaskIds).toEqual(['stats-receipt']);
  expect((await TaskChain.findOne({ userId: 832008 }))?.tasks[0]?.userStatsApplied).toBe(true);
});
