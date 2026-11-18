import { afterEach, expect, test, vi } from 'vitest';
import CultivationService from '../../src/services/CultivationService.js';
import TaskService from '../../src/services/TaskService.js';
import CultivationCommandHandlers from '../../src/handlers/cultivationCommands.js';
import { User, TaskChain } from '../../src/models/index.js';

afterEach(() => vi.restoreAllMocks());

test('the same task reward is recorded once even when two service instances try concurrently', async () => {
  await User.create({ userId: 816001 });
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  const results = await Promise.allSettled([
    new CultivationService().awardCultivation(816001, 60, 'receipt-task'),
    new CultivationService().awardCultivation(816001, 60, 'receipt-task')
  ]);
  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  expect(fulfilled.length).toBeGreaterThanOrEqual(1);
  expect(fulfilled.length).toBeLessThanOrEqual(2);
  const rewards = fulfilled.map((result) => (result as PromiseFulfilledResult<unknown>).value);
  if (rewards.length === 2) expect(rewards[0]).toEqual(rewards[1]);
  const user = (await User.findOne({ userId: 816001 }))!;
  expect(user.cultivation.spiritualPower).toBe(1);
  expect(user.cultivation.canonical?.state.focusStreak).toBe(1);
  expect(user.focusRewardReceipts?.filter((entry) => entry.taskId === 'receipt-task')).toHaveLength(1);
});

test('an acknowledged reward followed by a lost response is recovered without another reward', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  const rewardService = new CultivationService();
  const award = rewardService.awardCultivation.bind(rewardService);
  let lost = false;
  vi.spyOn(rewardService, 'awardCultivation').mockImplementation(async (...args) => {
    const result = await award(...args);
    if (!lost) {
      lost = true;
      throw new Error('lost reward response');
    }
    return result;
  });
  const queue = { addReminder: vi.fn(), cancelTaskReminders: vi.fn() };
  const service = new TaskService(queue as never, rewardService);
  const created = await service.createTask(816002, '奖励故障恢复', 60);
  await TaskChain.updateOne(
    { 'tasks.taskId': created.task.taskId },
    {
      $set: { 'tasks.$.startTime': new Date(Date.now() - 3600000) }
    }
  );
  await service.completeTask(816002, created.task.taskId);
  await expect(service.recoverPendingRewards(816002)).rejects.toThrow('附加奖励');
  await new TaskService(queue as never, new CultivationService()).recoverPendingRewards(816002);
  const user = (await User.findOne({ userId: 816002 }))!;
  expect(user.cultivation.spiritualPower).toBe(1);
  expect(user.cultivation.canonical?.state.focusStreak).toBe(1);
  expect(user.stats.completedTasks).toBe(1);
});

test('an expired processing lease resumes after a crash, but an active lease cannot be stolen', async () => {
  const service = new TaskService({ addReminder: vi.fn(), cancelTaskReminders: vi.fn() } as never);
  const created = await service.createTask(816003, '中断恢复', 60);
  const start = new Date(Date.now() - 3600000);
  await TaskChain.updateOne(
    { 'tasks.taskId': created.task.taskId },
    {
      $set: {
        'tasks.$.status': 'completed',
        'tasks.$.startTime': start,
        'tasks.$.endTime': new Date(),
        'tasks.$.actualDuration': 60,
        'tasks.$.settlementStatus': 'processing',
        'tasks.$.settlementLeaseUntil': new Date(Date.now() + 60000)
      }
    }
  );
  await expect(service.completeTask(816003, created.task.taskId)).rejects.toThrow();
  await TaskChain.updateOne(
    { 'tasks.taskId': created.task.taskId },
    {
      $set: {
        'tasks.$.settlementLeaseUntil': new Date(Date.now() - 1000)
      }
    }
  );
  const result = await service.completeTask(816003, created.task.taskId);
  expect(result.task.settlementStatus).toBe('settled');
  expect(result.task.actualDuration).toBe(60);
});

test('an expired reward receipt lease can be reclaimed after a process crash', async () => {
  await User.create({
    userId: 816004,
    focusRewardReceipts: [
      {
        taskId: 'expired-receipt',
        processingToken: 'earlier-atomic-owner',
        status: 'processing',
        createdAt: new Date(Date.now() - 120000),
        updatedAt: new Date(Date.now() - 120000),
        processingUntil: new Date(Date.now() - 1000)
      }
    ]
  });
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  const reward = await new CultivationService().awardCultivation(816004, 60, 'expired-receipt');
  expect(reward.spiritualPower).toBe(1);
  expect((await User.findOne({ userId: 816004 }))?.focusRewardReceipts?.[0]?.status).toBe('settled');
});

test('reward assets and the completed receipt are persisted together before any response can be lost', async () => {
  await User.create({ userId: 816005 });
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  const originalSave = User.prototype.save;
  const save = vi.spyOn(User.prototype, 'save').mockImplementationOnce(async function (this: any) {
    await originalSave.call(this);
    const persisted = (await User.findOne({ userId: 816005 }))!;
    expect(persisted.cultivation.spiritualPower).toBe(1);
    expect(persisted.focusRewardReceipts?.[0]?.status).toBe('settled');
    expect(persisted.focusRewardReceipts?.[0]?.reward?.spiritualPower).toBe(1);
    throw new Error('save response lost');
  });
  const service = new CultivationService();
  try {
    const first = await service.awardCultivation(816005, 60, 'atomic-receipt');
    const second = await new CultivationService().awardCultivation(816005, 60, 'atomic-receipt');
    expect(second).toEqual(first);
    const user = (await User.findOne({ userId: 816005 }))!;
    expect(user.cultivation.spiritualPower).toBe(1);
    expect(user.cultivation.canonical?.state.focusStreak).toBe(1);
    expect(user.focusRewardReceipts).toHaveLength(1);
    expect(user.focusRewardReceipts?.[0]?.status).toBe('settled');
    const raw = (await User.collection.findOne({ userId: 816005 }))!;
    expect(raw.focusRewardReceipts[0]).not.toHaveProperty('processingUntil');
    expect(raw.focusRewardReceipts[0]).not.toHaveProperty('processingToken');
  } finally {
    save.mockRestore();
  }
});

test('two claimers reclaiming an expired receipt cannot both apply a reward', async () => {
  await User.create({ userId: 816006, focusRewardReceipts: [{
    taskId: 'reclaim-race', status: 'processing', processingToken: 'earlier-atomic-owner',
    createdAt: new Date(Date.now() - 120000),
    updatedAt: new Date(Date.now() - 120000), processingUntil: new Date(Date.now() - 1000)
  }] });
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  const original = User.findOne.bind(User);
  const commit = vi.spyOn(User.prototype, 'save');
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { reached = resolve; });
  let reads = 0;
  const read = vi.spyOn(User, 'findOne').mockImplementation((async (filter: any) => {
    const doc = await original(filter);
    if (filter?.userId === 816006 && filter?.['focusRewardReceipts.taskId'] === 'reclaim-race' && reads < 2) {
      reads += 1;
      if (reads === 2) reached();
      await gate;
    }
    return doc;
  }) as any);
  const first = new CultivationService().awardCultivation(816006, 60, 'reclaim-race');
  const second = new CultivationService().awardCultivation(816006, 60, 'reclaim-race');
  const results = Promise.allSettled([first, second]);
  await entered;
  release();
  try {
    await results;
    expect(commit).toHaveBeenCalledTimes(1);
    const user = (await original({ userId: 816006 }))!;
    expect(user.cultivation.spiritualPower).toBe(1);
    expect(user.cultivation.canonical?.state.focusStreak).toBe(1);
    expect(user.focusRewardReceipts).toHaveLength(1);
    expect(user.focusRewardReceipts?.[0]?.status).toBe('settled');
  } finally {
    release();
    read.mockRestore();
    commit.mockRestore();
  }
});

test('an unclaimed active legacy receipt cannot be marked failed by a rejected duplicate caller', async () => {
  const deadline = new Date(Date.now() + 60000);
  await User.create({ userId: 816007, focusRewardReceipts: [{
    taskId: 'active-legacy', status: 'processing', createdAt: new Date(), updatedAt: new Date(),
    processingUntil: deadline
  }] });
  await expect(new CultivationService().awardCultivation(816007, 60, 'active-legacy')).rejects.toThrow('正在处理');
  const user = (await User.findOne({ userId: 816007 }))!;
  expect(user.focusRewardReceipts?.[0]?.status).toBe('processing');
  expect(user.focusRewardReceipts?.[0]?.processingUntil).toEqual(deadline);
  expect(user.cultivation.spiritualPower).toBe(0);
});

test('a reclaimed lease fences an old reward writer and its failure handler cannot undo the new receipt', async () => {
  await User.create({ userId: 816008 });
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { reached = resolve; });
  const originalSave = User.prototype.save;
  const save = vi.spyOn(User.prototype, 'save').mockImplementationOnce(async function (this: any) {
    reached();
    await gate;
    return originalSave.call(this);
  });
  const stale = new CultivationService().awardCultivation(816008, 60, 'lease-fence')
    .then((value) => value, () => null);
  await entered;
  try {
    await User.updateOne({ userId: 816008, 'focusRewardReceipts.taskId': 'lease-fence' }, {
      $set: { 'focusRewardReceipts.$.processingUntil': new Date(Date.now() - 1) }
    });
    const current = await new CultivationService().awardCultivation(816008, 60, 'lease-fence');
    release();
    expect(await stale).toEqual(current);
    const user = (await User.findOne({ userId: 816008 }))!;
    expect(user.cultivation.spiritualPower).toBe(1);
    expect(user.cultivation.canonical?.state.focusStreak).toBe(1);
    expect(user.focusRewardReceipts).toHaveLength(1);
    expect(user.focusRewardReceipts?.[0]?.status).toBe('settled');
    expect(user.focusRewardReceipts?.[0]?.reward).toEqual(current);
  } finally {
    release();
    await stale;
    save.mockRestore();
  }
});

test('a historical unfinished receipt cannot re-award assets when its previous application is unknown', async () => {
  await User.create({ userId: 816010, cultivation: { spiritualPower: 1 }, focusRewardReceipts: [{
    taskId: 'ambiguous-legacy', status: 'failed', createdAt: new Date(), updatedAt: new Date()
  }] });
  await expect(new CultivationService().awardCultivation(816010, 60, 'ambiguous-legacy')).rejects.toThrow('审计');
  const user = (await User.findOne({ userId: 816010 }))!;
  expect(user.cultivation.spiritualPower).toBe(1);
  expect(user.focusRewardReceipts?.[0]?.status).toBe('failed');
  expect(user.focusRewardReceipts?.[0]?.processingToken).toBeUndefined();
});

test('a conflicting cultivation command reports a retryable message and preserves awarded assets', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  await User.create({ userId: 816011, cultivation: { immortalStones: 100 } });
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { reached = resolve; });
  const originalSave = User.prototype.save;
  const save = vi.spyOn(User.prototype, 'save').mockImplementationOnce(async function (this: any) {
    reached();
    await gate;
    return originalSave.call(this);
  });
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
  const handlers = new CultivationCommandHandlers({
    sendMessage, deleteMessage: vi.fn().mockResolvedValue(true)
  } as never);
  const command = handlers.handleDivinationCommand({ from: { id: 816011 }, chat: { id: 816011 } } as never,
    ['', '10'] as never);
  await entered;
  try {
    await new CultivationService().awardCultivation(816011, 60, 'concurrent-award');
    release();
    await command;
    expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('账户状态已变化');
    expect(sendMessage.mock.calls.at(-1)?.[1]).not.toContain('No matching document');
    const user = (await User.findOne({ userId: 816011 }))!;
    expect(user.cultivation.immortalStones).toBe(100);
    expect(user.cultivation.spiritualPower).toBeGreaterThan(0);
    expect(user.focusRewardReceipts?.[0]?.status).toBe('settled');
  } finally {
    release();
    await command;
    save.mockRestore();
  }
});

test('a failed TaskChain rewardApplied update can recover without a second award', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  const queue = { addReminder: vi.fn(), cancelTaskReminders: vi.fn().mockResolvedValue(0) };
  const service = new TaskService(queue as never, new CultivationService());
  const created = await service.createTask(816012, '奖励收据与任务阶段恢复', 60);
  await TaskChain.updateOne({ userId: 816012, 'tasks.taskId': created.task.taskId }, {
    $set: { 'tasks.$.startTime': new Date(Date.now() - 3600000) }
  });
  const original = TaskChain.findOneAndUpdate.bind(TaskChain);
  await service.completeTask(816012, created.task.taskId);
  let failed = false;
  const mark = vi.spyOn(TaskChain, 'findOneAndUpdate').mockImplementation(((
    filter: any, update: any, options: any
  ) => {
    if (!failed && update?.$set?.['tasks.$.rewardApplied']) {
      failed = true;
      return Promise.reject(new Error('task reward stage unavailable'));
    }
    return original(filter, update, options);
  }) as any);
  try {
    await expect(service.recoverPendingRewards(816012)).rejects.toThrow('附加奖励');
    const saved = (await User.findOne({ userId: 816012 }))!;
    expect(saved.focusRewardReceipts?.[0]?.status).toBe('settled');
    expect(saved.cultivation.spiritualPower).toBe(1);
    await new TaskService(queue as never, new CultivationService()).recoverPendingRewards(816012);
    expect((await TaskChain.findOne({ userId: 816012 }))?.tasks[0]?.rewardStatus).toBe('settled');
    const after = (await User.findOne({ userId: 816012 }))!;
    expect(after.cultivation.spiritualPower).toBe(1);
    expect(after.cultivation.canonical?.state.focusStreak).toBe(1);
    expect(after.stats.completedTasks).toBe(1);
  } finally {
    mark.mockRestore();
  }
});
