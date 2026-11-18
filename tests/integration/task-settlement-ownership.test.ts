import { expect, test, vi } from 'vitest';
import TaskService from '../../src/services/TaskService.js';
import { TaskChain, User, MainChain, DailyStats } from '../../src/models/index.js';
import CultivationService from '../../src/services/CultivationService.js';
import CoreCommandHandlers from '../../src/handlers/coreCommands.js';

function fixture() {
  const queue = { addReminder: vi.fn(), cancelTaskReminders: vi.fn().mockResolvedValue(0) };
  return { service: new TaskService(queue as never, new CultivationService()) };
}

async function elapsed(userId: number, service: TaskService) {
  const created = await service.createTask(userId, '结算凭证', 30);
  await TaskChain.updateOne({ userId }, { $set: { 'tasks.0.startTime': new Date(Date.now() - 1800000) } });
  return created.task.taskId;
}

test('a confirmed task must finish settlement before another task can start', async () => {
  const { service } = fixture();
  const taskId = await elapsed(834001, service);
  vi.spyOn(service, 'updateDailyStats').mockRejectedValueOnce(new Error('daily store offline'));
  await expect(service.completeTask(834001, taskId)).rejects.toThrow();
  await expect(service.createTask(834001, '下一项', 30)).rejects.toThrow(/上次任务结果/);
  expect((await TaskChain.findOne({ userId: 834001 }))?.tasks).toHaveLength(1);
  await service.completeTask(834001, taskId);
  const next = await service.createTask(834001, '下一项', 30);
  expect(next.task.status).toBe('running');
  expect((await User.findOne({ userId: 834001 }))?.stats.totalTasks).toBe(2);
});

test('status exposes the committed outcome retry and does not offer its opposite', async () => {
  const { service } = fixture();
  const taskId = await elapsed(834002, service);
  vi.spyOn(service, 'updateDailyStats').mockRejectedValueOnce(new Error('daily store offline'));
  await expect(service.completeTask(834002, taskId)).rejects.toThrow();
  const messages: any[] = [];
  const handler = new CoreCommandHandlers({
    bot: {
      sendMessage: async (...args: any[]) => {
        messages.push(args);
        return { message_id: messages.length };
      }
    } as never,
    config: {} as never,
    taskService: service,
    onError: vi.fn()
  });
  await handler.handleStatusCommand(834002);
  expect(messages.at(-1)?.[1]).toContain('结果正在保存');
  const callbacks = messages
    .at(-1)?.[2]
    .reply_markup.inline_keyboard.flat()
    .map((button: any) => button.callback_data);
  expect(callbacks).toContain(`complete_task_${taskId}`);
  expect(callbacks).not.toContain(`fail_task_${taskId}`);
});

test('retrying a committed completion from a broken chain does not extend the current streak', async () => {
  const { service } = fixture();
  await User.create({ userId: 834005, stats: { currentStreak: 0, longestStreak: 3 } });
  await TaskChain.create({
    userId: 834005,
    chainId: 'old-confirmation',
    status: 'broken',
    totalTasks: 0,
    completedTasks: 0,
    tasks: [
      {
        taskId: 'old-completion',
        description: '旧确认',
        duration: 30,
        status: 'completed',
        startTime: new Date(Date.now() - 1800000),
        endTime: new Date(),
        actualDuration: 30,
        settlementStatus: 'needs_retry',
        rewardApplied: true,
        chainStatsApplied: true
      }
    ]
  });
  await service.completeTask(834005, 'old-completion');
  const user = (await User.findOne({ userId: 834005 }))!;
  expect(user.stats.completedTasks).toBe(1);
  expect(user.stats.totalMinutes).toBe(30);
  expect(user.stats.currentStreak).toBe(0);
  expect(user.stats.longestStreak).toBe(3);
  expect((await TaskChain.findOne({ userId: 834005 }))?.completedTasks).toBe(0);
});

test('a failed result in a broken chain remains retryable and blocks a new start until settled', async () => {
  const { service } = fixture();
  const taskId = await elapsed(834007, service);
  const cleanup = vi.spyOn(service, 'cancelTaskReminders').mockRejectedValueOnce(new Error('reminder offline'));
  try {
    await expect(service.completeTask(834007, taskId, false)).rejects.toThrow('reminder offline');
    expect((await TaskChain.findOne({ userId: 834007 }))?.status).toBe('broken');
    await expect(service.createTask(834007, '下一项', 30)).rejects.toThrow('上次任务结果');
    const status = await service.getUserStatus(834007);
    expect(status.isActive).toBe(false);
    expect(status.currentTask?.status).toBe('failed');
    await service.completeTask(834007, taskId, false);
    expect((await User.findOne({ userId: 834007 }))?.stats.failedTasks).toBe(1);
    await service.createTask(834007, '下一项', 30);
    expect((await User.findOne({ userId: 834007 }))?.stats.totalTasks).toBe(2);
  } finally {
    cleanup.mockRestore();
  }
});

test('status counts every pending chain and keeps the start gate until all results are saved', async () => {
  const { service } = fixture();
  await User.create({ userId: 834008 });
  for (const [index, status] of ['broken', 'active'].entries()) {
    await TaskChain.create({
      userId: 834008,
      chainId: `multiple-pending-${index}`,
      status,
      tasks: [
        {
          taskId: `pending-${index}`,
          description: '待保存确认',
          status: 'completed',
          duration: 30,
          startTime: new Date(Date.now() - 1800000),
          endTime: new Date(),
          actualDuration: 30,
          settlementStatus: 'needs_retry',
          rewardApplied: true,
          chainStatsApplied: true
        }
      ]
    });
  }
  expect((await service.getUserStatus(834008)).pendingSettlementCount).toBe(2);
  await service.completeTask(834008, 'pending-0');
  expect((await service.getUserStatus(834008)).pendingSettlementCount).toBe(1);
  await expect(service.createTask(834008, '新任务', 30)).rejects.toThrow('上次任务结果');
  await service.completeTask(834008, 'pending-1');
  expect((await service.getUserStatus(834008)).pendingSettlementCount).toBe(0);
  await service.createTask(834008, '新任务', 30);
});

test('status leads to a pending main precedent before offering a blocked settlement retry', async () => {
  const { service } = fixture();
  const taskId = await elapsed(834006, service);
  vi.spyOn(service, 'updateDailyStats').mockRejectedValueOnce(new Error('daily store offline'));
  await expect(service.completeTask(834006, taskId)).rejects.toThrow();
  await MainChain.create({
    userId: 834006,
    chainId: 'status-main-case',
    sacredMarker: { type: 'custom', label: '确认' },
    pendingViolation: { behaviorKey: '离开位置', reportedAt: new Date(), decisionToken: 'case-status' }
  });
  const messages: any[] = [];
  const handler = new CoreCommandHandlers({
    bot: {
      sendMessage: async (...args: any[]) => {
        messages.push(args);
        return { message_id: messages.length };
      }
    } as never,
    config: {} as never,
    taskService: service,
    onError: vi.fn()
  });
  await handler.handleStatusCommand(834006);
  expect(messages.at(-1)?.[1]).toContain('先处理主链判例');
  const callbacks = messages
    .at(-1)?.[2]
    .reply_markup.inline_keyboard.flat()
    .map((button: any) => button.callback_data);
  expect(callbacks).toContain('quick_violation');
  expect(callbacks).not.toContain(`complete_task_${taskId}`);
  expect(callbacks).not.toContain(`fail_task_${taskId}`);
});

test('an expired old owner failure cannot reopen a newer settled task', async () => {
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const entered = new Promise<void>(resolve => {
    reached = resolve;
  });
  const { service } = fixture();
  const taskId = await elapsed(834003, service);
  const pause = vi.spyOn(service, 'updateDailyStats').mockImplementationOnce(async () => {
    reached();
    await gate;
    throw new Error('old owner failed');
  });
  const old = service.completeTask(834003, taskId).then(
    () => ({ ok: true }),
    () => ({ ok: false })
  );
  try {
    await entered;
    await TaskChain.updateOne({ userId: 834003 }, { $set: { 'tasks.0.settlementLeaseUntil': new Date(0) } });
    await fixture().service.completeTask(834003, taskId);
    release();
    expect((await old).ok).toBe(false);
    const raw = await TaskChain.collection.findOne({ userId: 834003 });
    expect(raw?.tasks[0].settlementStatus).toBe('settled');
    expect(raw?.tasks[0].settlementError).toBeUndefined();
    expect(raw?.tasks[0].settlementToken).toBeUndefined();
    expect((await User.findOne({ userId: 834003 }))?.stats.completedTasks).toBe(1);
    expect(raw?.completedTasks).toBe(1);
  } finally {
    release();
    await old;
    pause.mockRestore();
  }
});

test('a delayed old core owner cannot overwrite the new result or its independent reward', async () => {
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const entered = new Promise<void>(resolve => {
    reached = resolve;
  });
  const { service } = fixture();
  const taskId = await elapsed(834004, service);
  const daily = service.updateDailyStats.bind(service);
  const pause = vi.spyOn(service, 'updateDailyStats').mockImplementationOnce(async (...args) => {
    reached();
    await gate;
    return daily(...args);
  });
  const old = service.completeTask(834004, taskId).then(
    () => ({ ok: true }),
    () => ({ ok: false })
  );
  try {
    await entered;
    await TaskChain.updateOne({ userId: 834004 }, { $set: { 'tasks.0.settlementLeaseUntil': new Date(0) } });
    const current = fixture().service;
    await current.completeTask(834004, taskId);
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    await current.recoverPendingRewards(834004);
    release();
    expect((await old).ok).toBe(false);
    const raw = await TaskChain.collection.findOne({ userId: 834004 });
    expect(raw?.tasks[0].rewardSnapshot.spiritualPower).toBe(0);
    expect(raw?.tasks[0].settlementStatus).toBe('settled');
    expect((await User.findOne({ userId: 834004 }))?.stats.completedTasks).toBe(1);
  } finally {
    release();
    await old;
    pause.mockRestore();
  }
});

test.each(['account-save', 'reward-return', 'reward-projection', 'chain-save'])(
  'real receipt and daily snapshot remain once after takeover at %s',
  async point => {
    const queue = { addReminder: vi.fn(), cancelTaskReminders: vi.fn().mockResolvedValue(0) };
    const rewards = new CultivationService();
    const service = new TaskService(queue as never, rewards);
    const created = await service.createTask(834020, '双层租约恢复', 60);
    await TaskChain.updateOne({ userId: 834020 }, { $set: { 'tasks.0.startTime': new Date(Date.now() - 3600000) } });
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.1);
    if (point !== 'chain-save') await service.completeTask(834020, created.task.taskId);
    let reached!: () => void;
    let release!: () => void;
    const entered = new Promise<void>(resolve => {
      reached = resolve;
    });
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let restore = () => {};
    if (point === 'account-save') {
      const save = User.prototype.save;
      const pause = vi.spyOn(User.prototype, 'save').mockImplementationOnce(async function (this: any) {
        reached();
        await gate;
        return save.call(this);
      });
      restore = () => pause.mockRestore();
    } else if (point === 'chain-save') {
      const save = TaskChain.prototype.save;
      const pause = vi.spyOn(TaskChain.prototype, 'save').mockImplementationOnce(async function (this: any) {
        reached();
        await gate;
        return save.call(this);
      });
      restore = () => pause.mockRestore();
    } else if (point === 'reward-projection') {
      const update = TaskChain.findOneAndUpdate.bind(TaskChain);
      let paused = false;
      const pause = vi.spyOn(TaskChain, 'findOneAndUpdate').mockImplementation((async (...args: any[]) => {
        if (!paused && args[1]?.$set?.['tasks.$.rewardApplied']) {
          paused = true;
          reached();
          await gate;
        }
        return update(...(args as [any, any, any]));
      }) as any);
      restore = () => pause.mockRestore();
    } else {
      const award = rewards.awardCultivation.bind(rewards);
      const pause = vi.spyOn(rewards, 'awardCultivation').mockImplementationOnce(async (...args) => {
        const result = await award(...args);
        reached();
        await gate;
        return result;
      });
      restore = () => pause.mockRestore();
    }
    const first = (point === 'chain-save'
      ? service.completeTask(834020, created.task.taskId)
      : service.recoverPendingRewards(834020)).then(
      result => ({ result }),
      error => ({ error })
    );
    try {
      await entered;
      await TaskChain.updateOne({ userId: 834020 }, { $set: {
        [point === 'chain-save' ? 'tasks.0.settlementLeaseUntil' : 'tasks.0.rewardLeaseUntil']: new Date(0)
      } });
      if (point === 'account-save')
        await User.updateOne(
          { userId: 834020 },
          {
            $set: { 'focusRewardReceipts.0.processingUntil': new Date(0) }
          }
        );
      const current = new TaskService(queue as never, new CultivationService());
      if (point === 'chain-save') await current.completeTask(834020, created.task.taskId);
      await current.recoverPendingRewards(834020);
      release();
      expect(await first).toHaveProperty('error');
      const user = (await User.findOne({ userId: 834020 }))!;
      const chain = (await TaskChain.findOne({ userId: 834020 }))!;
      expect(user.cultivation.spiritualPower).toBe(1);
      expect(user.cultivation.canonical?.state.focusStreak).toBe(1);
      expect(user.focusRewardReceipts).toHaveLength(1);
      expect(user.focusRewardReceipts?.[0]?.status).toBe('settled');
      expect(user.stats.completedTasks).toBe(1);
      expect(user.stats.totalMinutes).toBe(60);
      expect(chain.completedTasks).toBe(1);
      expect(chain.totalMinutes).toBe(60);
      expect(chain.tasks[0]?.settlementStatus).toBe('settled');
      expect(chain.tasks[0]?.settlementToken).toBeUndefined();
      const daily = await DailyStats.findOne({ userId: 834020 });
      expect(daily?.stats.tasksCompleted).toBe(1);
      expect(daily?.stats.totalMinutes).toBe(60);
    } finally {
      release();
      await first;
      restore();
      rng.mockRestore();
    }
  }
);
