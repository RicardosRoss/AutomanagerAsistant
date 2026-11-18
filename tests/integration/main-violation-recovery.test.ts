import { expect, test, vi } from 'vitest';
import MainViolationService from '../../src/services/MainViolationService.js';
import TaskService from '../../src/services/TaskService.js';
import CTDPService from '../../src/services/CTDPService.js';
import { MainChain, TaskChain, User, PrecedentRule } from '../../src/models/index.js';
import SelfControlBot from '../../src/bot.js';
import PrecedentService from '../../src/services/PrecedentService.js';
import QueueService from '../../src/services/QueueService.js';

function fixture() {
  const queue = { addReminder: vi.fn(), cancelTaskReminders: vi.fn().mockResolvedValue(0) };
  const tasks = new TaskService(queue as never, { awardCultivation: vi.fn() } as never);
  const ctdp = new CTDPService(tasks, queue as never);
  const rules = new MainViolationService(queue as never, tasks);
  return { queue, tasks, ctdp, rules };
}

test('reminder cleanup failure keeps the chosen break decision and recovery settles failure exactly once', async () => {
  const { queue, ctdp, rules } = fixture();
  const started = await ctdp.startMainTask(823001, { markerLabel: '确认', description: '阅读', duration: 30 });
  const violation = await rules.report(823001, '刷手机');
  const token = violation.pending!.decisionToken!;
  queue.cancelTaskReminders.mockRejectedValueOnce(new Error('Redis outage'));
  await expect(rules.resolve(823001, 'break_chain', token)).rejects.toThrow('Redis outage');
  expect((await MainChain.findOne({ userId: 823001 }))?.pendingViolation?.decision).toBe('break_chain');
  await expect(rules.resolve(823001, 'allow_forever', token)).rejects.toThrow();
  await rules.recoverSelectedDecisions();
  const main = (await MainChain.findById(started.mainChain._id))!;
  expect(main.status).toBe('broken');
  expect(main.pendingViolation).toBeUndefined();
  const task = (await TaskChain.findOne({ userId: 823001 }))!.tasks[0]!;
  expect(task.status).toBe('failed');
  expect(task.settlementStatus).toBe('settled');
  const taskChain = (await TaskChain.findOne({ userId: 823001 }))!;
  expect(taskChain.status).toBe('broken');
  expect(taskChain.totalTasks).toBe(0);
  expect(taskChain.completedTasks).toBe(0);
  expect(taskChain.totalMinutes).toBe(0);
  expect((await User.findOne({ userId: 823001 }))?.stats.failedTasks).toBe(1);
  await rules.recoverSelectedDecisions();
  expect((await User.findOne({ userId: 823001 }))?.stats.failedTasks).toBe(1);
});

test('a failed allow decision resumes automatically using the same case and clears the startup blocker', async () => {
  const { ctdp, rules } = fixture();
  const started = await ctdp.startMainTask(823002, { markerLabel: '确认', description: '阅读', duration: 30 });
  const violation = await rules.report(823002, '回复消息');
  const allow = vi.spyOn(PrecedentService.prototype, 'allowForever').mockRejectedValueOnce(new Error('DB outage'));
  try {
    await expect(rules.resolve(823002, 'allow_forever', violation.pending!.decisionToken!))
      .rejects.toThrow('DB outage');
    await rules.recoverSelectedDecisions();
    expect((await MainChain.findById(started.mainChain._id))?.pendingViolation).toBeUndefined();
    expect((await MainChain.findById(started.mainChain._id))?.status).toBe('active');
    expect((await TaskChain.findOne({ userId: 823002 }))?.tasks[0]?.status).toBe('running');
  } finally {
    allow.mockRestore();
  }
});

test('a pending violation blocks new task creation and successful completion', async () => {
  const { tasks, ctdp, rules } = fixture();
  const started = await ctdp.startMainTask(823003, { markerLabel: '确认', description: '阅读', duration: 30 });
  await rules.report(823003, '刷手机');
  await TaskChain.updateOne({ userId: 823003, 'tasks.taskId': started.task.taskId }, {
    $set: { 'tasks.$.startTime': new Date(Date.now() - 1800000) }
  });
  await expect(ctdp.completeTrackedTask(823003, started.task.taskId)).rejects.toThrow('请先处理主链判例');
  await expect(tasks.createTask(823003, '换个任务', 30)).rejects.toThrow('请先处理主链判例');
  expect((await TaskChain.findOne({ userId: 823003 }))?.tasks[0]?.status).toBe('running');
  expect((await User.findOne({ userId: 823003 }))?.stats.completedTasks).toBe(0);
});

test('a main-chain write failure after task settlement resumes without counting the failure twice', async () => {
  const { ctdp, rules } = fixture();
  await ctdp.startMainTask(823004, { markerLabel: '确认', description: '阅读', duration: 30 });
  const violation = await rules.report(823004, '刷手机');
  const token = violation.pending!.decisionToken!;
  const original = MainChain.findOneAndUpdate.bind(MainChain);
  let failed = false;
  const write = vi.spyOn(MainChain, 'findOneAndUpdate').mockImplementation(((
    filter: any, update: any, options: any
  ) => {
    if (!failed && update?.$push?.violationResolutions) {
      failed = true;
      return Promise.reject(new Error('main write unavailable'));
    }
    return original(filter, update, options);
  }) as any);
  try {
    await expect(rules.resolve(823004, 'break_chain', token)).rejects.toThrow('main write unavailable');
    expect((await TaskChain.findOne({ userId: 823004 }))?.tasks[0]?.settlementStatus).toBe('settled');
    expect((await User.findOne({ userId: 823004 }))?.stats.failedTasks).toBe(1);
    await rules.recoverSelectedDecisions();
    const main = (await MainChain.findOne({ userId: 823004 }))!;
    expect(main.status).toBe('broken');
    expect(main.violationResolutions).toHaveLength(1);
    expect((await User.findOne({ userId: 823004 }))?.stats.failedTasks).toBe(1);
  } finally {
    write.mockRestore();
  }
});

test('a committed main resolution with a lost response returns its receipt without repeating settlement', async () => {
  const { ctdp, rules } = fixture();
  await ctdp.startMainTask(823005, { markerLabel: '确认', description: '阅读', duration: 30 });
  const violation = await rules.report(823005, '刷手机');
  const token = violation.pending!.decisionToken!;
  const original = MainChain.findOneAndUpdate.bind(MainChain);
  let lost = false;
  const write = vi.spyOn(MainChain, 'findOneAndUpdate').mockImplementation((async (
    filter: any, update: any, options: any
  ) => {
    const saved = await original(filter, update, options);
    if (!lost && update?.$push?.violationResolutions) {
      lost = true;
      throw new Error('main response lost');
    }
    return saved;
  }) as any);
  try {
    const result = await rules.resolve(823005, 'break_chain', token);
    expect(result.chain.status).toBe('broken');
    await rules.resolve(823005, 'break_chain', token);
    expect((await MainChain.findOne({ userId: 823005 }))?.violationResolutions).toHaveLength(1);
    expect((await User.findOne({ userId: 823005 }))?.stats.failedTasks).toBe(1);
  } finally {
    write.mockRestore();
  }
});

test('the persistent maintenance entry resumes main decisions even when no reservations exist', async () => {
  const { ctdp, rules } = fixture();
  await ctdp.startMainTask(823006, { markerLabel: '确认', description: '阅读', duration: 30 });
  const violation = await rules.report(823006, '刷手机');
  await MainChain.updateOne({ userId: 823006 }, { $set: {
    'pendingViolation.decision': 'break_chain',
    'pendingViolation.processingUntil': new Date(Date.now() - 1000)
  } });
  const queue = new QueueService();
  queue.isInitialized = true;
  queue.reservationQueue = {} as never;
  queue.setMainDecisionRecoveryHandler(() => rules.recoverSelectedDecisions());
  await queue.reconcileReservations();
  const main = (await MainChain.findOne({ userId: 823006 }))!;
  expect(main.status).toBe('broken');
  expect(main.violationResolutions?.[0]?.decisionToken).toBe(violation.pending!.decisionToken);
  expect((await User.findOne({ userId: 823006 }))?.stats.failedTasks).toBe(1);
});

test('breaking an idle chain resets its record and streak without inventing a failed task', async () => {
  const { rules } = fixture();
  await User.create({ userId: 823007, stats: { completedTasks: 1, currentStreak: 1, totalMinutes: 30 } });
  await MainChain.create({ userId: 823007, chainId: 'idle-main', sacredMarker: { type: 'seat', label: '确认' },
    nodes: [{ taskId: 'idle-task', nodeNo: 1, level: 'unit', status: 'completed' }], levelCounters: { unit: 1 } });
  await TaskChain.create({
    userId: 823007, chainId: 'idle-task-chain', completedTasks: 1, totalTasks: 1, totalMinutes: 30,
    tasks: [{ taskId: 'idle-task', status: 'completed', duration: 30, description: '阅读',
      startTime: new Date(Date.now() - 3600000), settlementStatus: 'settled' }] });
  await rules.report(823007, '改变座位规则');
  await rules.resolve(823007, 'break_chain');
  expect((await TaskChain.findOne({ userId: 823007 }))?.status).toBe('broken');
  expect((await TaskChain.findOne({ userId: 823007 }))?.completedTasks).toBe(0);
  const user = (await User.findOne({ userId: 823007 }))!;
  expect(user.stats.currentStreak).toBe(0);
  expect(user.stats.failedTasks).toBe(0);
  expect(user.stats.totalMinutes).toBe(30);
});

test('one failed recovery does not starve another user, while an unselected case remains untouched', async () => {
  const { ctdp, rules } = fixture();
  for (const userId of [823008, 823009, 823010]) {
    await ctdp.startMainTask(userId, { markerLabel: '确认', description: '阅读', duration: 30 });
    await rules.report(userId, '回复消息');
  }
  for (const userId of [823008, 823009]) {
    await MainChain.updateOne({ userId }, { $set: { 'pendingViolation.decision': 'allow_forever' } });
  }
  const original = PrecedentService.prototype.allowForever;
  const rule = vi.spyOn(PrecedentService.prototype, 'allowForever').mockImplementation(async function (
    this: any, input
  ) {
    if (input.userId === 823008) throw new Error('one user rule write failed');
    return original.call(this, input);
  });
  try {
    await expect(rules.recoverSelectedDecisions()).rejects.toThrow('1 个主链判例');
    expect((await MainChain.findOne({ userId: 823008 }))?.pendingViolation?.decision).toBe('allow_forever');
    expect((await MainChain.findOne({ userId: 823009 }))?.pendingViolation).toBeUndefined();
    expect((await MainChain.findOne({ userId: 823010 }))?.pendingViolation?.decision).toBeUndefined();
    expect((await MainChain.findOne({ userId: 823010 }))?.pendingViolation?.behaviorKey).toBe('回复消息');
  } finally {
    rule.mockRestore();
  }
});

test('a crashed task transition left pending is settled by main-decision recovery', async () => {
  const { ctdp, rules } = fixture();
  const started = await ctdp.startMainTask(823011, { markerLabel: '确认', description: '阅读', duration: 30 });
  await rules.report(823011, '刷手机');
  await MainChain.updateOne({ userId: 823011 }, { $set: {
    'pendingViolation.decision': 'break_chain', 'pendingViolation.taskIds': [started.task.taskId],
    'pendingViolation.processingUntil': new Date(Date.now() - 1)
  } });
  await TaskChain.updateOne({ userId: 823011, 'tasks.taskId': started.task.taskId }, { $set: {
    'tasks.$.status': 'failed', 'tasks.$.settlementStatus': 'pending',
    'tasks.$.actualDuration': 0, 'tasks.$.endTime': new Date()
  } });
  await rules.recoverSelectedDecisions();
  expect((await TaskChain.findOne({ userId: 823011 }))?.tasks[0]?.settlementStatus).toBe('settled');
  expect((await MainChain.findOne({ userId: 823011 }))?.status).toBe('broken');
  expect((await User.findOne({ userId: 823011 }))?.stats.failedTasks).toBe(1);
});

test('inline recovery is scoped to the current user and receipt replays are clearly identified', async () => {
  const { ctdp, rules } = fixture();
  await ctdp.startMainTask(823012, { markerLabel: '确认', description: '阅读', duration: 30 });
  await ctdp.startMainTask(823013, { markerLabel: '确认', description: '阅读', duration: 30 });
  const a = await rules.report(823012, '回复消息');
  await rules.report(823013, '刷手机');
  for (const userId of [823012, 823013]) {
    await MainChain.updateOne({ userId }, { $set: { 'pendingViolation.decision': 'allow_forever' } });
  }
  const original = PrecedentService.prototype.allowForever;
  const rule = vi.spyOn(PrecedentService.prototype, 'allowForever').mockImplementation(async function (
    this: any, input
  ) {
    if (input.userId === 823013) throw new Error('other user DB error');
    return original.call(this, input);
  });
  const bot = new SelfControlBot();
  const sendMessage = vi.fn();
  bot.bot = { sendMessage } as never;
  bot.mainViolationService = rules;
  try {
    await bot.handleViolationCommand(823012, '');
    expect((await MainChain.findOne({ userId: 823012 }))?.pendingViolation).toBeUndefined();
    expect((await MainChain.findOne({ userId: 823013 }))?.pendingViolation).toBeDefined();
    expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('无需重新选择');
    await bot.handleMainViolationDecision(823012, 'allow_forever', a.pending!.decisionToken);
    expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('此前已处理');
    expect(await PrecedentRule.countDocuments({ userId: 823012 })).toBe(1);
  } finally {
    rule.mockRestore();
  }
});

test('overlapping break/allow requests keep one owner and one failure settlement', async () => {
  const { queue, ctdp, rules } = fixture();
  await ctdp.startMainTask(823014, { markerLabel: '确认', description: '阅读', duration: 30 });
  const violation = await rules.report(823014, '刷手机');
  const token = violation.pending!.decisionToken!;
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { reached = resolve; });
  queue.cancelTaskReminders.mockImplementationOnce(async () => {
    reached();
    await gate;
    return 0;
  });
  const first = rules.resolve(823014, 'break_chain', token);
  await entered;
  try {
    await expect(rules.resolve(823014, 'break_chain', token)).rejects.toThrow('正在处理');
    await expect(rules.resolve(823014, 'allow_forever', token)).rejects.toThrow('另一决定');
    await rules.recoverSelectedDecisions();
    expect((await MainChain.findOne({ userId: 823014 }))?.pendingViolation?.decision).toBe('break_chain');
    expect((await User.findOne({ userId: 823014 }))?.stats.failedTasks).toBe(1);
  } finally {
    release();
    await first;
  }
  expect((await MainChain.findOne({ userId: 823014 }))?.violationResolutions).toHaveLength(1);
  expect((await User.findOne({ userId: 823014 }))?.stats.failedTasks).toBe(1);
});

test('a new violation fences stale main-node saving and an allow decision permits completion recovery', async () => {
  const { ctdp, rules } = fixture();
  const started = await ctdp.startMainTask(823015, { markerLabel: '确认', description: '阅读', duration: 30 });
  await TaskChain.updateOne({ userId: 823015, 'tasks.taskId': started.task.taskId }, {
    $set: { 'tasks.$.startTime': new Date(Date.now() - 1800000) }
  });
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { reached = resolve; });
  const original = MainChain.prototype.save;
  const save = vi.spyOn(MainChain.prototype, 'save').mockImplementationOnce(async function (this: any) {
    reached();
    await gate;
    return original.call(this);
  });
  const completed = ctdp.completeTrackedTask(823015, started.task.taskId)
    .then(() => 'success', (error: Error) => error.message);
  await entered;
  try {
    const pending = await rules.report(823015, '回复消息');
    release();
    expect(await completed).toContain('请先处理主链判例');
    expect((await MainChain.findOne({ userId: 823015 }))?.pendingViolation).toBeDefined();
    await rules.resolve(823015, 'allow_forever', pending.pending!.decisionToken);
    await ctdp.completeTrackedTask(823015, started.task.taskId);
    const recovered = (await MainChain.findOne({ userId: 823015 }))!;
    expect(recovered.nodes[0]?.status).toBe('completed');
    expect(recovered.levelCounters.unit).toBe(1);
    expect((await User.findOne({ userId: 823015 }))?.stats.completedTasks).toBe(1);
  } finally {
    release();
    await completed;
    save.mockRestore();
  }
});
