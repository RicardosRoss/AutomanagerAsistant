import { expect, test, vi } from 'vitest';
import TaskService from '../../src/services/TaskService.js';
import { TaskChain, User } from '../../src/models/index.js';

function fixture() {
  const awardCultivation = vi.fn().mockResolvedValue({ spiritualPower: 0, immortalStones: 0 });
  const queue = { addReminder: vi.fn(), cancelTaskReminders: vi.fn().mockResolvedValue(0) };
  return { service: new TaskService(queue as never, { awardCultivation } as never), awardCultivation };
}

test.each([true, false])('an old running task in a broken chain cannot settle success=%s', async success => {
  const { service, awardCultivation } = fixture();
  await User.create({ userId: 830001 });
  await TaskChain.collection.insertOne({
    userId: 830001,
    chainId: 'old-broken-chain',
    status: 'broken',
    totalTasks: 0,
    completedTasks: 0,
    tasks: [
      {
        taskId: 'old-orphan',
        description: '旧任务',
        status: 'running',
        duration: 60,
        startTime: new Date(Date.now() - 3600000)
      }
    ]
  });
  const beforeChain = await TaskChain.collection.findOne({ userId: 830001 });
  const beforeUser = await User.collection.findOne({ userId: 830001 });
  await expect(service.completeTask(830001, 'old-orphan', success)).rejects.toThrow();
  expect(await TaskChain.collection.findOne({ userId: 830001 })).toEqual(beforeChain);
  expect(await User.collection.findOne({ userId: 830001 })).toEqual(beforeUser);
  expect(awardCultivation).not.toHaveBeenCalled();
});

test('reading and saving an old terminal task cannot turn it into a new pending settlement', async () => {
  const { service, awardCultivation } = fixture();
  await User.create({ userId: 830002 });
  await TaskChain.collection.insertOne({
    userId: 830002,
    chainId: 'old-completed-chain',
    status: 'active',
    tasks: [
      {
        taskId: 'old-completed',
        description: '旧已完成任务',
        status: 'completed',
        duration: 60,
        startTime: new Date(Date.now() - 3600000),
        endTime: new Date()
      }
    ]
  });
  const chain = (await TaskChain.findOne({ userId: 830002 }))!;
  expect(chain.tasks[0]?.settlementStatus).toBeUndefined();
  chain.tasks.push({
    taskId: 'another-running',
    description: '新任务',
    status: 'running',
    duration: 30,
    startTime: new Date()
  } as never);
  await chain.save();
  const raw = await TaskChain.collection.findOne({ userId: 830002 });
  expect(raw?.tasks[0].settlementStatus).toBeUndefined();
  await expect(service.completeTask(830002, 'old-completed')).rejects.toThrow();
  expect(awardCultivation).not.toHaveBeenCalled();
  expect((await User.findOne({ userId: 830002 }))?.stats.completedTasks).toBe(0);
});

test('a chain broken after the read fences the running-to-completed transition', async () => {
  const { service, awardCultivation } = fixture();
  const created = await service.createTask(830003, '正在运行', 60);
  await TaskChain.updateOne({ userId: 830003 }, { $set: { 'tasks.0.startTime': new Date(Date.now() - 3600000) } });
  const original = TaskChain.findOneAndUpdate.bind(TaskChain);
  const write = vi.spyOn(TaskChain, 'findOneAndUpdate').mockImplementationOnce(async (...args: any[]) => {
    await TaskChain.collection.updateOne(
      { userId: 830003 },
      {
        $set: { status: 'broken', completedTasks: 0, totalTasks: 0 },
        $inc: { __v: 1 }
      }
    );
    return original(...(args as [any, any, any]));
  });
  try {
    await expect(service.completeTask(830003, created.task.taskId)).rejects.toThrow();
    const raw = await TaskChain.collection.findOne({ userId: 830003 });
    expect(raw?.status).toBe('broken');
    expect(raw?.tasks[0].status).toBe('running');
    expect(awardCultivation).not.toHaveBeenCalled();
    expect((await User.findOne({ userId: 830003 }))?.stats.completedTasks).toBe(0);
  } finally {
    write.mockRestore();
  }
});

test('an explicit failed settlement in a broken chain resumes without counting failure again', async () => {
  const { service, awardCultivation } = fixture();
  const created = await service.createTask(830007, '失败恢复', 30);
  const cleanup = vi
    .spyOn(service, 'cancelTaskReminders')
    .mockRejectedValueOnce(new Error('reminder store unavailable'));
  try {
    await expect(service.completeTask(830007, created.task.taskId, false)).rejects.toThrow('reminder store');
    const unfinished = await TaskChain.collection.findOne({ userId: 830007 });
    expect(unfinished?.status).toBe('broken');
    expect(unfinished?.tasks[0].status).toBe('failed');
    expect(unfinished?.tasks[0].settlementStatus).toBe('needs_retry');
    expect((await User.findOne({ userId: 830007 }))?.stats.failedTasks).toBe(1);
    await service.completeTask(830007, created.task.taskId, false);
    const settled = await TaskChain.collection.findOne({ userId: 830007 });
    expect(settled?.status).toBe('broken');
    expect(settled?.completedTasks).toBe(0);
    expect(settled?.totalTasks).toBe(0);
    expect(settled?.tasks[0].settlementStatus).toBe('settled');
    expect((await User.findOne({ userId: 830007 }))?.stats.failedTasks).toBe(1);
    expect(awardCultivation).not.toHaveBeenCalled();
  } finally {
    cleanup.mockRestore();
  }
});

test('the first terminal transition removes stale error and lease fields in raw MongoDB', async () => {
  const { service } = fixture();
  const created = await service.createTask(830008, '清除旧错误', 30);
  await TaskChain.updateOne(
    { userId: 830008 },
    {
      $set: {
        'tasks.0.settlementError': 'old error',
        'tasks.0.settlementLeaseUntil': new Date(0)
      }
    }
  );
  const original = TaskChain.findOneAndUpdate.bind(TaskChain);
  const transition = vi.spyOn(TaskChain, 'findOneAndUpdate').mockImplementationOnce(async (...args: any[]) => {
    const result = await original(...(args as [any, any, any]));
    const raw = await TaskChain.collection.findOne({ userId: 830008 });
    expect(raw?.tasks[0].settlementError).toBeUndefined();
    expect(raw?.tasks[0].settlementLeaseUntil).toBeUndefined();
    return result;
  });
  try {
    await service.completeTask(830008, created.task.taskId, false);
  } finally {
    transition.mockRestore();
  }
});

test('settlement save keeps an unrelated atomic metadata write', async () => {
  const { service } = fixture();
  const created = await service.createTask(830009, '并发标记', 30);
  const save = TaskChain.prototype.save;
  const concurrent = vi.spyOn(TaskChain.prototype, 'save').mockImplementationOnce(async function (this: any) {
    await TaskChain.collection.updateOne({ userId: 830009 }, { $set: { 'tasks.0.metadata.notes': 'concurrent-note' } });
    return save.call(this);
  });
  try {
    await service.completeTask(830009, created.task.taskId, false);
    expect((await TaskChain.collection.findOne({ userId: 830009 }))?.tasks[0].metadata.notes).toBe('concurrent-note');
  } finally {
    concurrent.mockRestore();
  }
});
