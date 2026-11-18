import { expect, test, vi } from 'vitest';
import TaskService from '../../src/services/TaskService.js';
import CTDPService from '../../src/services/CTDPService.js';
import { TaskChain, MainChain, User } from '../../src/models/index.js';
import MainViolationService from '../../src/services/MainViolationService.js';
import TaskDraft from '../../src/models/TaskDraft.js';
import TaskDraftHandlers from '../../src/handlers/taskDraftCommands.js';

function fixture() {
  const queue = { addReminder: vi.fn(), cancelTaskReminders: vi.fn() };
  const tasks = new TaskService(queue as never);
  return { tasks, ctdp: new CTDPService(tasks, queue as never) };
}

test('a concurrent rollback cannot delete a task while its main node is being published', async () => {
  const { tasks, ctdp } = fixture();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const reached = new Promise<void>(resolve => {
    entered = resolve;
  });
  const save = MainChain.prototype.save;
  const publisher = vi.spyOn(MainChain.prototype, 'save').mockImplementationOnce(async function (this: any) {
    entered();
    await gate;
    return save.call(this);
  });
  const starting = ctdp.startMainTask(831020, { description: '发布并发', duration: 30, markerLabel: '确认' });
  let rollback: Promise<{ succeeded: boolean }> | undefined;
  try {
    await reached;
    const partial = (await TaskChain.findOne({ userId: 831020 }))!;
    await expect(tasks.completeTask(831020, partial.tasks[0]!.taskId, false)).rejects.toThrow();
    expect((await User.findOne({ userId: 831020 }))?.stats.failedTasks).toBe(0);
    rollback = tasks.rollbackTaskCreation(831020, partial.tasks[0]!.taskId).then(
      () => ({ succeeded: true }),
      () => ({ succeeded: false })
    );
    release();
    const started = await starting;
    expect((await rollback).succeeded).toBe(false);
    const task = (await TaskChain.findOne({ userId: 831020 }))?.tasks[0];
    expect(task?.taskId).toBe(started.task.taskId);
    expect(task?.mainChainId).toBe(started.mainChain.chainId);
    expect(task?.creationState).toBe('ready');
    expect((await MainChain.findOne({ userId: 831020 }))?.nodes[0]?.taskId).toBe(task?.taskId);
    expect((await User.findOne({ userId: 831020 }))?.stats.totalTasks).toBe(1);
  } finally {
    release();
    await starting.catch(() => undefined);
    await rollback;
    publisher.mockRestore();
  }
});

test('a ready task whose creator stopped before publication resumes on its original main chain', async () => {
  const { tasks, ctdp } = fixture();
  const main = await MainChain.findOrCreateActive(831021, '原来的标志');
  const created = await (tasks.createTask as any)(
    831021,
    '原任务',
    30,
    false,
    null,
    'recovery-token',
    undefined,
    main.chainId
  );
  await TaskChain.collection.updateOne(
    { userId: 831021 },
    {
      $set: {
        'tasks.0.mainChainId': main.chainId,
        'tasks.0.startTime': new Date(Date.now() - 360000)
      }
    }
  );
  await (ctdp as any).recoverUnpublishedStarts();
  await (ctdp as any).recoverUnpublishedStarts();
  const restored = (await MainChain.findOne({ userId: 831021 }))!;
  expect(restored.chainId).toBe(main.chainId);
  expect(restored.sacredMarker.label).toBe('原来的标志');
  expect(restored.nodes).toHaveLength(1);
  expect(restored.nodes[0]?.taskId).toBe(created.task.taskId);
  expect((await TaskChain.findOne({ userId: 831021 }))?.tasks).toHaveLength(1);
  expect((await User.findOne({ userId: 831021 }))?.stats.totalTasks).toBe(1);
});

test('a break decision does not freeze a task ID for a startup that has not published its node', async () => {
  const { tasks } = fixture();
  const main = await MainChain.findOrCreateActive(831022, '原标志');
  await tasks.createTask(831022, '未发布任务', 30, false, null, 'unpublished-break', undefined, main.chainId);
  const rules = new MainViolationService({ cancelTaskReminders: vi.fn() } as never, tasks);
  const reported = await rules.report(831022, '离开位置');
  await rules.resolve(831022, 'break_chain', reported.pending!.decisionToken);
  const broken = (await MainChain.findOne({ userId: 831022 }))!;
  expect(broken.status).toBe('broken');
  expect(broken.pendingViolation).toBeUndefined();
  expect((await User.findOne({ userId: 831022 }))?.stats.failedTasks).toBe(0);
  await tasks.recoverCreationRollbacks();
  expect((await TaskChain.findOne({ userId: 831022 }))?.tasks).toHaveLength(0);
  expect((await User.findOne({ userId: 831022 }))?.stats.totalTasks).toBe(0);
});

test('a draft stays submitting until its intended main node is published', async () => {
  const { tasks, ctdp } = fixture();
  const main = await MainChain.findOrCreateActive(831023, '原标志');
  await tasks.createTask(831023, '待恢复准备', 30, false, null, 'publishing-draft', undefined, main.chainId);
  await TaskChain.updateOne({ userId: 831023 }, { $set: { 'tasks.0.startTime': new Date(Date.now() - 360000) } });
  await TaskDraft.create({
    userId: 831023,
    token: 'publishing-draft',
    mode: 'start',
    stage: 'submitting',
    duration: 30,
    description: '待恢复准备',
    expiresAt: new Date(Date.now() + 3600000)
  });
  await TaskDraft.collection.updateOne({ userId: 831023 }, { $set: { updatedAt: new Date(Date.now() - 360000) } });
  const messages: string[] = [];
  const handler = new TaskDraftHandlers(
    {
      sendMessage: async (_id: number, text: string) => {
        messages.push(text);
      }
    } as never,
    {} as never
  );
  await handler.handleCallback(831023, 'draft:publishing-draft:confirm');
  expect(await TaskDraft.countDocuments({ userId: 831023 })).toBe(1);
  expect(messages.at(-1)).not.toContain('已经开始');
  await ctdp.recoverUnpublishedStarts();
  await handler.handleCallback(831023, 'draft:publishing-draft:confirm');
  expect(await TaskDraft.countDocuments({ userId: 831023 })).toBe(0);
  expect((await MainChain.findOne({ userId: 831023 }))?.nodes).toHaveLength(1);
});

test('an unpublished start bound to an ended chain is compensated without reviving that chain', async () => {
  const { tasks, ctdp } = fixture();
  const main = await MainChain.findOrCreateActive(831024, '旧标志');
  await tasks.createTask(831024, '未发布旧任务', 30, false, null, 'ended-publication', undefined, main.chainId);
  await TaskChain.updateOne({ userId: 831024 }, { $set: { 'tasks.0.startTime': new Date(Date.now() - 360000) } });
  await MainChain.updateOne({ _id: main._id }, { $set: { status: 'broken' }, $inc: { __v: 1 } });
  await ctdp.recoverUnpublishedStarts();
  expect((await MainChain.findById(main._id))?.status).toBe('broken');
  expect((await TaskChain.findOne({ userId: 831024 }))?.tasks).toHaveLength(0);
  expect((await User.findOne({ userId: 831024 }))?.stats.totalTasks).toBe(0);
  const next = await ctdp.startMainTask(831024, { markerLabel: '新标志', description: '重新开始', duration: 30 });
  expect(next.mainChain.chainId).not.toBe(main.chainId);
  expect(next.mainChain.nodes[0]?.nodeNo).toBe(1);
  expect((await User.findOne({ userId: 831024 }))?.stats.totalTasks).toBe(1);
});

test('startup compensation fences a stale main-node writer before deleting its task', async () => {
  const { tasks } = fixture();
  const main = await MainChain.findOrCreateActive(831025, '原标志');
  const created = await tasks.createTask(831025, '待回滚任务', 30, false, null, 'late-writer', undefined, main.chainId);
  const stale = (await MainChain.findById(main._id))!;
  await tasks.rollbackTaskCreation(831025, created.task.taskId);
  stale.nodes.push({ taskId: created.task.taskId, nodeNo: 1, level: 'unit', status: 'running' });
  await expect(stale.save()).rejects.toMatchObject({ name: 'VersionError' });
  expect((await MainChain.findById(main._id))?.nodes).toHaveLength(0);
  expect((await TaskChain.findOne({ userId: 831025 }))?.tasks).toHaveLength(0);
});

test('an explicit main break fails a running legacy-compatible task without a publication intent', async () => {
  const { tasks } = fixture();
  const created = await tasks.createTask(831026, '已开始的兼容任务', 30);
  await MainChain.findOrCreateActive(831026, '当前标志');
  const rules = new MainViolationService({ cancelTaskReminders: vi.fn() } as never, tasks);
  const report = await rules.report(831026, '用户明确选择断链');
  await rules.resolve(831026, 'break_chain', report.pending!.decisionToken);
  const task = (await TaskChain.findOne({ userId: 831026 }))?.tasks[0];
  expect(task?.taskId).toBe(created.task.taskId);
  expect(task?.mainChainId).toBeUndefined();
  expect(task?.status).toBe('failed');
  expect(task?.settlementStatus).toBe('settled');
  expect((await User.findOne({ userId: 831026 }))?.stats.totalTasks).toBe(1);
  expect((await User.findOne({ userId: 831026 }))?.stats.failedTasks).toBe(1);
  expect((await MainChain.findOne({ userId: 831026 }))?.status).toBe('broken');
});
