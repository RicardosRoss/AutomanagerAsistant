import { expect, test, vi } from 'vitest';
import CTDPService from '../../src/services/CTDPService.js';
import TaskService from '../../src/services/TaskService.js';
import { AuxChain, TaskChain, MainChain, User } from '../../src/models/index.js';
import SelfControlBot from '../../src/bot.js';

function fixture() {
  const queue = {
    addReminder: vi.fn(), cancelTaskReminders: vi.fn().mockResolvedValue(0),
    cancelReservation: vi.fn(), rescheduleReservation: vi.fn()
  };
  const tasks = new TaskService(queue as never, { awardCultivation: vi.fn() } as never);
  return { tasks, service: new CTDPService(tasks, queue as never) };
}

test('a start claimed before the deadline excludes the simultaneous expiry decision', async () => {
  const { tasks, service } = fixture();
  await service.createReservation(821101, '阅读', 30, 'race_start');
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { reached = resolve; });
  const create = tasks.createTask.bind(tasks);
  const pause = vi.spyOn(tasks, 'createTask').mockImplementationOnce(async (...args) => {
    reached();
    await gate;
    return create(...args);
  });
  const start = service.startReservedTask(821101, 'race_start');
  await entered;
  try {
    await expect(service.startReservedTask(821101, 'race_start')).rejects.toThrow('正在启动');
    await AuxChain.updateOne({ userId: 821101 }, {
      $set: { 'pendingReservation.deadlineAt': new Date(Date.now() - 1) }
    });
    const expiry = await service.expireReservation('race_start');
    expect(expiry.expired).toBe(false);
    await expect(service.requestAuxiliaryViolation(821101, 'race_start', 'cancel_reservation'))
      .rejects.toThrow('正在启动');
  } finally {
    release();
    await start;
    pause.mockRestore();
  }
  const aux = (await AuxChain.findOne({ userId: 821101 }))!;
  expect(aux.pendingDecision).toBeUndefined();
  expect(aux.pendingReservation).toBeUndefined();
  expect(aux.reservationHistory).toHaveLength(1);
  expect(aux.reservationHistory[0]!.status).toBe('fulfilled');
});

test('an expiry that wins first excludes a new main task', async () => {
  const { service } = fixture();
  await service.createReservation(821102, '阅读', 30, 'race_expiry');
  await AuxChain.updateOne({ userId: 821102 }, {
    $set: { 'pendingReservation.deadlineAt': new Date(Date.now() - 1000) }
  });
  await service.expireReservation('race_expiry');
  await expect(service.startReservedTask(821102, 'race_expiry')).rejects.toThrow();
  expect(await TaskChain.countDocuments({ userId: 821102 })).toBe(0);
  expect((await AuxChain.findOne({ userId: 821102 }))?.pendingDecision?.behaviorKey).toBe('missed_start');
});

test('task creation followed by auxiliary-write failure is recovered without another task', async () => {
  const { service } = fixture();
  await service.createReservation(821103, '阅读', 30, 'recover_started');
  const original = AuxChain.findOneAndUpdate.bind(AuxChain);
  let rejected = false;
  const write = vi.spyOn(AuxChain, 'findOneAndUpdate').mockImplementation(((filter: any, update: any, options: any) => {
    if (!rejected && update?.$push?.reservationHistory?.status === 'fulfilled') {
      rejected = true;
      return Promise.reject(new Error('auxiliary write unavailable'));
    }
    return original(filter, update, options);
  }) as any);
  try {
    await expect(service.startReservedTask(821103, 'recover_started')).rejects.toThrow('auxiliary write unavailable');
    expect((await AuxChain.findOne({ userId: 821103 }))?.pendingReservation?.status).toBe('starting');
    await AuxChain.updateOne({ userId: 821103 }, {
      $set: { 'pendingReservation.startLeaseUntil': new Date(Date.now() - 1) }
    });
    expect(await service.recoverReservation('recover_started')).toBe(true);
    const aux = (await AuxChain.findOne({ userId: 821103 }))!;
    expect(aux.pendingReservation).toBeUndefined();
    expect(aux.completedReservations).toBe(1);
    expect(aux.reservationHistory).toHaveLength(1);
    expect((await TaskChain.findOne({ userId: 821103 }))?.tasks).toHaveLength(1);
    expect(await service.recoverReservation('recover_started')).toBe(false);
  } finally {
    write.mockRestore();
  }
});

test('an abandoned start with no durable task is released then judged against its original deadline', async () => {
  const { service } = fixture();
  await service.createReservation(821104, '阅读', 30, 'abandoned_start');
  await AuxChain.updateOne({ userId: 821104 }, { $set: {
    'pendingReservation.status': 'starting', 'pendingReservation.startToken': 'abandoned',
    'pendingReservation.startClaimedAt': new Date(Date.now() - 600000),
    'pendingReservation.startLeaseUntil': new Date(Date.now() - 1),
    'pendingReservation.deadlineAt': new Date(Date.now() - 1000)
  } });
  const result = await service.expireReservation('abandoned_start');
  expect(result.expired).toBe(true);
  expect(result.auxChain?.pendingDecision?.behaviorKey).toBe('missed_start');
  expect(await TaskChain.countDocuments({ userId: 821104 })).toBe(0);
});

test('a durable task without a saved main node is attached once before auxiliary fulfillment', async () => {
  const { service, tasks } = fixture();
  await service.createReservation(821105, '恢复原任务', 30, 'recover_node');
  await AuxChain.updateOne({ userId: 821105 }, { $set: {
    'pendingReservation.status': 'starting', 'pendingReservation.startToken': 'recovery-owner',
    'pendingReservation.startClaimedAt': new Date(),
    'pendingReservation.startLeaseUntil': new Date(Date.now() - 1)
  } });
  const first = await tasks.createTask(821105, '恢复原任务', 30, true, 'recover_node', 'reservation:recover_node');
  expect(await service.recoverReservation('recover_node')).toBe(true);
  expect((await TaskChain.findOne({ userId: 821105 }))?.tasks).toHaveLength(1);
  const aux = (await AuxChain.findOne({ userId: 821105 }))!;
  expect(aux.completedReservations).toBe(1);
  expect(aux.reservationHistory).toHaveLength(1);
  const main = (await MainChain.findOne({ userId: 821105 }))!;
  expect(main.nodes).toHaveLength(1);
  expect(main.nodes[0]!.taskId).toBe(first.task.taskId);
  expect((await User.findOne({ userId: 821105 }))?.stats.totalTasks).toBe(1);
});

test('a paused worker cannot create a late task after its start claim was reclaimed', async () => {
  const { service, tasks } = fixture();
  await service.createReservation(821106, '暂停的启动', 30, 'late_worker');
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { reached = resolve; });
  const create = tasks.createTask.bind(tasks);
  const pause = vi.spyOn(tasks, 'createTask').mockImplementationOnce(async (...args) => {
    reached();
    await gate;
    return create(...args);
  });
  const first = service.startReservedTask(821106, 'late_worker');
  const result = first.then(() => 'success', () => 'failed');
  await entered;
  try {
    await AuxChain.updateOne({ userId: 821106 }, { $set: {
      'pendingReservation.startLeaseUntil': new Date(Date.now() - 1),
      'pendingReservation.deadlineAt': new Date(Date.now() - 1000)
    } });
    await service.expireReservation('late_worker');
    release();
    expect(await result).toBe('failed');
    expect(await TaskChain.countDocuments({ userId: 821106 })).toBe(0);
    expect((await AuxChain.findOne({ userId: 821106 }))?.pendingDecision?.behaviorKey).toBe('missed_start');
  } finally {
    release();
    await result;
    pause.mockRestore();
  }
});

test('reservation status during startup does not offer another start or cancellation', async () => {
  const { service } = fixture();
  await service.createReservation(821107, '启动中', 30, 'status_starting');
  await AuxChain.updateOne({ userId: 821107 }, { $set: {
    'pendingReservation.status': 'starting', 'pendingReservation.startToken': 'status-owner',
    'pendingReservation.startClaimedAt': new Date(),
    'pendingReservation.startLeaseUntil': new Date(Date.now() + 60000)
  } });
  const bot = new SelfControlBot();
  const sendMessage = vi.fn();
  bot.bot = { sendMessage } as never;
  await bot.handleReserveStatusCommand(821107);
  expect(sendMessage.mock.calls[0]?.[1]).toContain('不必重复点击');
  expect(sendMessage.mock.calls[0]?.[2]?.reply_markup.inline_keyboard).toEqual([
    [{ text: '查看任务状态', callback_data: 'quick_status' }]
  ]);
  expect((await AuxChain.findOne({ userId: 821107 }))?.pendingReservation?.status).toBe('starting');
});

test('recovery cannot finalize a task whose reminder and statistics initialization is still in flight', async () => {
  const { service, tasks } = fixture();
  await service.createReservation(821108, '初始化中', 30, 'inflight_initialization');
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { reached = resolve; });
  const schedule = tasks.scheduleProgressReminders.bind(tasks);
  const pause = vi.spyOn(tasks, 'scheduleProgressReminders').mockImplementationOnce(async (...args) => {
    reached();
    await gate;
    return schedule(...args);
  });
  const first = service.startReservedTask(821108, 'inflight_initialization');
  await entered;
  try {
    await expect(tasks.createTask(
      821108, '初始化中', 30, true, 'inflight_initialization', 'reservation:inflight_initialization'
    )).rejects.toThrow('初始化');
    await AuxChain.updateOne({ userId: 821108 }, { $set: {
      'pendingReservation.startLeaseUntil': new Date(Date.now() - 1)
    } });
    expect((await service.expireReservation('inflight_initialization')).expired).toBe(false);
    const aux = (await AuxChain.findOne({ userId: 821108 }))!;
    expect(aux.pendingReservation?.status).toBe('starting');
    expect(aux.reservationHistory).toHaveLength(0);
    expect(await MainChain.countDocuments({ userId: 821108, 'nodes.status': 'running' })).toBe(0);
  } finally {
    release();
    await first;
    pause.mockRestore();
  }
  expect((await TaskChain.findOne({ userId: 821108 }))?.tasks[0]?.creationState).toBe('ready');
  expect((await AuxChain.findOne({ userId: 821108 }))?.completedReservations).toBe(1);
});

test('initialization rollback failure is retried after the creating worker stops', async () => {
  const { service, tasks } = fixture();
  await service.createReservation(821109, '清理重试', 30, 'retry_cleanup');
  const schedule = vi.spyOn(tasks, 'scheduleProgressReminders').mockRejectedValueOnce(new Error('reminder outage'));
  const cleanup = vi.spyOn(tasks, 'rollbackTaskCreation').mockRejectedValueOnce(new Error('cleanup DB outage'));
  try {
    await expect(service.startReservedTask(821109, 'retry_cleanup')).rejects.toThrow('reminder outage');
    expect((await TaskChain.findOne({ userId: 821109 }))?.tasks[0]?.creationState).toBe('initializing');
    await AuxChain.updateOne({ userId: 821109 }, {
      $set: { 'pendingReservation.startLeaseUntil': new Date(Date.now() - 1) }
    });
    await service.recoverReservation('retry_cleanup');
    expect((await TaskChain.findOne({ userId: 821109 }))?.tasks).toHaveLength(0);
    expect((await User.findOne({ userId: 821109 }))?.stats.totalTasks).toBe(0);
    expect((await AuxChain.findOne({ userId: 821109 }))?.pendingReservation?.status).toBe('pending');
    await service.startReservedTask(821109, 'retry_cleanup');
    expect((await User.findOne({ userId: 821109 }))?.stats.totalTasks).toBe(1);
    expect((await AuxChain.findOne({ userId: 821109 }))?.completedReservations).toBe(1);
  } finally {
    schedule.mockRestore();
    cleanup.mockRestore();
  }
});

test('a lost user-count increment response is compensated by its durable task receipt', async () => {
  const { service } = fixture();
  await service.createReservation(821110, '统计响应丢失', 30, 'lost_count_response');
  const original = User.findOneAndUpdate.bind(User);
  let lost = false;
  const count = vi.spyOn(User, 'findOneAndUpdate').mockImplementation((async (
    filter: any, update: any, options: any
  ) => {
    const updated = await original(filter, update, options);
    if (!lost && update?.$inc?.['stats.totalTasks']) {
      lost = true;
      throw new Error('increment response lost');
    }
    return updated;
  }) as any);
  try {
    await expect(service.startReservedTask(821110, 'lost_count_response')).rejects.toThrow('increment response lost');
    expect((await User.findOne({ userId: 821110 }))?.stats.totalTasks).toBe(0);
    expect((await TaskChain.findOne({ userId: 821110 }))?.tasks).toHaveLength(0);
  } finally {
    count.mockRestore();
  }
});
