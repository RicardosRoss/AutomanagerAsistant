import { expect, test, vi } from 'vitest';
import { TaskChain, User, MainChain } from '../../src/models/index.js';
import TaskService from '../../src/services/TaskService.js';
import StatsService from '../../src/services/StatsService.js';
import QueueService from '../../src/services/QueueService.js';
import TaskDraftHandlers from '../../src/handlers/taskDraftCommands.js';
import TaskDraft from '../../src/models/TaskDraft.js';

function fixture() {
  const queue = { addReminder: vi.fn().mockResolvedValue(1), cancelTaskReminders: vi.fn().mockResolvedValue(0) };
  return new TaskService(queue as never);
}

async function incomplete(userId: number, broken = false) {
  await User.create({ userId, stats: { totalTasks: 1, startedTaskIds: [`partial-${userId}`] } });
  const task = {
    taskId: `partial-${userId}`,
    description: '未建成任务',
    duration: 30,
    startTime: new Date(Date.now() - 360000),
    status: 'running',
    creationState: 'initializing'
  };
  const chain = await TaskChain.create({
    userId,
    chainId: `partial-chain-${userId}`,
    status: broken ? 'broken' : 'active',
    totalTasks: broken ? 0 : 1,
    tasks: [task]
  });
  return { chain, task };
}

test.each([false, true])('an interrupted initialization can be fully rolled back with broken=%s', async broken => {
  const service = fixture();
  const { task, chain } = await incomplete(831001, broken);
  expect(await service.recoverAbandonedCreation(831001, task.taskId)).toBe(true);
  const raw = await TaskChain.collection.findOne({ _id: chain._id });
  expect(raw?.tasks).toHaveLength(0);
  expect(raw?.status).toBe(broken ? 'broken' : 'active');
  expect(raw?.totalTasks).toBe(0);
  const user = (await User.findOne({ userId: 831001 }))!;
  expect(user.stats.totalTasks).toBe(0);
  expect(user.stats.startedTaskIds).toHaveLength(0);
  expect((await new StatsService().build(831001, 1)).summary.started).toBe(0);
});

test('rollback cannot touch a legacy running task without creation proof', async () => {
  const service = fixture();
  const cancel = vi.spyOn(service, 'cancelTaskReminders');
  await User.create({ userId: 831002, stats: { totalTasks: 10 } });
  await TaskChain.collection.insertOne({
    userId: 831002,
    chainId: 'legacy-orphan',
    status: 'broken',
    totalTasks: 0,
    tasks: [{ taskId: 'legacy', status: 'running', description: '旧孤儿', duration: 30, startTime: new Date(0) }]
  });
  const before = await TaskChain.collection.findOne({ userId: 831002 });
  await service.rollbackTaskCreation(831002, 'legacy');
  expect(await TaskChain.collection.findOne({ userId: 831002 })).toEqual(before);
  expect((await User.findOne({ userId: 831002 }))?.stats.totalTasks).toBe(10);
  expect(cancel).not.toHaveBeenCalled();
  cancel.mockRestore();
});

test('a durable rollback claim blocks completion before user counters are undone', async () => {
  const service = fixture();
  const { task } = await incomplete(831003);
  await TaskChain.updateOne({ userId: 831003 }, { $set: { 'tasks.0.creationState': 'ready' } });
  const original = User.updateOne.bind(User);
  const counter = vi.spyOn(User, 'updateOne').mockImplementationOnce(async (...args: any[]) => {
    await expect(service.completeTask(831003, task.taskId, false)).rejects.toThrow();
    return original(...(args as [any, any]));
  });
  try {
    await service.rollbackTaskCreation(831003, task.taskId);
    expect((await User.findOne({ userId: 831003 }))?.stats.failedTasks).toBe(0);
    expect((await TaskChain.findOne({ userId: 831003 }))?.tasks).toHaveLength(0);
  } finally {
    counter.mockRestore();
  }
});

test('a published main node prevents startup compensation from erasing its task', async () => {
  const service = fixture();
  const { task } = await incomplete(831004);
  await MainChain.create({
    userId: 831004,
    chainId: 'published',
    sacredMarker: { type: 'custom', label: '确认' },
    nodes: [
      {
        nodeNo: 1,
        taskId: task.taskId,
        status: 'running',
        level: 'unit'
      }
    ]
  });
  const before = await TaskChain.collection.findOne({ userId: 831004 });
  await expect(service.rollbackTaskCreation(831004, task.taskId)).rejects.toThrow();
  expect(await TaskChain.collection.findOne({ userId: 831004 })).toEqual(before);
  expect((await User.findOne({ userId: 831004 }))?.stats.totalTasks).toBe(1);
});

test('an interrupted rollback remains durable and retry does not decrement counters twice', async () => {
  const service = fixture();
  const { task } = await incomplete(831005, true);
  const daily = vi.spyOn(service, 'updateDailyStats').mockRejectedValueOnce(new Error('daily store offline'));
  try {
    await expect(service.rollbackTaskCreation(831005, task.taskId)).rejects.toThrow('daily store');
    const raw = await TaskChain.collection.findOne({ userId: 831005 });
    expect(raw?.tasks[0].creationState).toBe('rolling_back');
    expect((await User.findOne({ userId: 831005 }))?.stats.totalTasks).toBe(0);
    expect((await new StatsService().build(831005, 1)).summary.started).toBe(0);
    await service.rollbackTaskCreation(831005, task.taskId);
    await service.rollbackTaskCreation(831005, task.taskId);
    expect((await TaskChain.findOne({ userId: 831005 }))?.tasks).toHaveLength(0);
    expect((await User.findOne({ userId: 831005 }))?.stats.totalTasks).toBe(0);
  } finally {
    daily.mockRestore();
  }
});

test('simultaneous compensators undo the receipt and remove the task once', async () => {
  const { task } = await incomplete(831006);
  await Promise.all([
    fixture().rollbackTaskCreation(831006, task.taskId),
    fixture().rollbackTaskCreation(831006, task.taskId)
  ]);
  expect((await TaskChain.findOne({ userId: 831006 }))?.totalTasks).toBe(0);
  expect((await TaskChain.findOne({ userId: 831006 }))?.tasks).toHaveLength(0);
  expect((await User.findOne({ userId: 831006 }))?.stats.totalTasks).toBe(0);
});

test('maintenance recovers expired initialization while keeping ready tasks and legacy orphans', async () => {
  const service = fixture();
  await incomplete(831007);
  const ready = await service.createTask(831008, '已启动任务', 30);
  await User.create({ userId: 831009 });
  await TaskChain.collection.insertOne({
    userId: 831009,
    chainId: 'unproven',
    status: 'broken',
    tasks: [
      {
        taskId: 'old',
        description: '旧任务',
        duration: 30,
        startTime: new Date(0),
        status: 'running'
      }
    ]
  });
  await service.recoverCreationRollbacks();
  expect((await TaskChain.findOne({ userId: 831007 }))?.tasks).toHaveLength(0);
  expect((await TaskChain.findOne({ userId: 831008 }))?.tasks[0]?.taskId).toBe(ready.task.taskId);
  expect((await TaskChain.findOne({ userId: 831008 }))?.tasks[0]?.creationState).toBe('ready');
  expect((await TaskChain.findOne({ userId: 831009 }))?.tasks[0]?.taskId).toBe('old');
});

test('the persistent maintenance entry invokes creation recovery even if decision recovery fails', async () => {
  const tasks = fixture();
  await incomplete(831010, true);
  const queue = new QueueService();
  queue.isInitialized = true;
  queue.reservationQueue = {} as never;
  queue.setTaskCreationRecoveryHandler(() => tasks.recoverCreationRollbacks());
  queue.setMainDecisionRecoveryHandler(async () => {
    throw new Error('unrelated decision DB failure');
  });
  await expect(queue.reconcileReservations()).rejects.toThrow();
  expect((await TaskChain.findOne({ userId: 831010 }))?.tasks).toHaveLength(0);
  expect((await User.findOne({ userId: 831010 }))?.stats.totalTasks).toBe(0);
});

test('a submitting draft survives task rollback and can be confirmed after cleanup', async () => {
  const { task } = await incomplete(831011);
  await TaskChain.updateOne(
    { userId: 831011 },
    {
      $set: { 'tasks.0.creationState': 'rolling_back', 'tasks.0.submissionToken': 'rollback-draft' }
    }
  );
  await TaskDraft.create({
    userId: 831011,
    token: 'rollback-draft',
    mode: 'start',
    stage: 'submitting',
    description: '重试准备',
    duration: 30,
    expiresAt: new Date(Date.now() + 3600000)
  });
  await TaskDraft.collection.updateOne({ userId: 831011 }, {
    $set: { updatedAt: new Date(Date.now() - 5 * 60000) }
  });
  const messages: string[] = [];
  const handler = new TaskDraftHandlers(
    {
      sendMessage: async (_id: number, text: string) => {
        messages.push(text);
      }
    } as never,
    {} as never
  );
  await handler.handleCallback(831011, 'draft:rollback-draft:confirm');
  expect(messages.at(-1)).not.toContain('已经开始');
  expect((await TaskDraft.findOne({ userId: 831011 }))?.stage).toBe('submitting');
  await fixture().recoverAbandonedCreation(831011, task.taskId);
  await handler.handleCallback(831011, 'draft:rollback-draft:confirm');
  expect((await TaskDraft.findOne({ userId: 831011 }))?.stage).toBe('ready');
});
