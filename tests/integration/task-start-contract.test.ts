import { describe, expect, test, vi } from 'vitest';
import TaskService from '../../src/services/TaskService.js';
import CTDPService from '../../src/services/CTDPService.js';
import TaskCommandHandlers from '../../src/handlers/taskCommands.js';
import { MainChain, TaskChain, User } from '../../src/models/index.js';

function fixture() {
  const queue = { addReminder: vi.fn(), cancelTaskReminders: vi.fn(), cancelReservation: vi.fn() };
  const tasks = new TaskService(queue as never, { awardCultivation: vi.fn() } as never);
  const ctdp = new CTDPService(tasks, queue as never);
  const messages: string[] = [];
  const handler = new TaskCommandHandlers({
    bot: {
      sendMessage: async (_id: number, text: string) => {
        messages.push(text);
      }
    } as never,
    taskService: tasks,
    ctdpService: ctdp,
    queueService: queue as never,
    onError: async (_id: number, text: string) => {
      messages.push(text);
    }
  });
  return { tasks, ctdp, handler, messages };
}

describe('sacred seat start contract', () => {
  test('direct /task creates a running node in the same main chain protocol as reservations', async () => {
    const { handler } = fixture();
    expect(await handler.handleTaskCommand(808101, '阅读论文 60')).toBe(true);
    const taskChain = (await TaskChain.findOne({ userId: 808101 }))!;
    const main = (await MainChain.findOne({ userId: 808101, status: 'active' }))!;
    expect(main.nodes).toHaveLength(1);
    expect(main.nodes[0]).toMatchObject({ taskId: taskChain.tasks[0]!.taskId, status: 'running' });
  });

  test('another start cannot silently replace a running task or evade the failure rule', async () => {
    const { tasks } = fixture();
    const first = await tasks.createTask(808102, '专注阅读', 60);
    await expect(tasks.createTask(808102, '换个任务', 30)).rejects.toThrow('当前已有任务正在进行中');
    const chain = (await TaskChain.findById(first.chain._id))!;
    expect(chain.tasks).toHaveLength(1);
    expect(chain.tasks[0]!.status).toBe('running');
    expect((await User.findOne({ userId: 808102 }))!.stats.totalTasks).toBe(1);
  });

  test('simultaneous starts create only one active chain and one running task', async () => {
    const { tasks } = fixture();
    await User.create({ userId: 808103 });
    const results = await Promise.allSettled([
      tasks.createTask(808103, '任务一', 60),
      tasks.createTask(808103, '任务二', 60)
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const chains = await TaskChain.find({ userId: 808103, status: 'active' });
    expect(chains).toHaveLength(1);
    expect(chains[0]!.tasks.filter((task) => task.status === 'running')).toHaveLength(1);
  });

  test('queue failure compensates a partially-created task and allows another start', async () => {
    const { tasks } = fixture();
    const schedule = vi.spyOn(tasks, 'scheduleProgressReminders').mockRejectedValueOnce(new Error('queue unavailable'));
    await expect(tasks.createTask(808104, '重试启动', 30)).rejects.toThrow('queue unavailable');
    const chain = (await TaskChain.findOne({ userId: 808104 }))!;
    expect(chain.tasks).toHaveLength(0);
    expect(chain.totalTasks).toBe(0);
    expect((await User.findOne({ userId: 808104 }))!.stats.totalTasks).toBe(0);
    schedule.mockRestore();
    const result = await tasks.createTask(808104, '重试启动', 30);
    expect(result.task.status).toBe('running');
  });

  test('main-chain node save failure compensates task creation without breaking the chain', async () => {
    const { ctdp } = fixture();
    const save = vi.spyOn(MainChain.prototype, 'save').mockRejectedValueOnce(new Error('node save unavailable'));
    await expect(ctdp.startMainTask(808105, {
      markerLabel: '确认', description: '完整启动', duration: 30
    })).rejects.toThrow('node save unavailable');
    expect((await TaskChain.findOne({ userId: 808105 }))!.tasks).toHaveLength(0);
    expect((await User.findOne({ userId: 808105 }))!.stats.totalTasks).toBe(0);
    expect((await MainChain.findOne({ userId: 808105 }))!.status).toBe('active');
    save.mockRestore();
    expect((await ctdp.startMainTask(808105, {
      markerLabel: '确认', description: '完整启动', duration: 30
    })).mainChain.nodes).toHaveLength(1);
  });

  test('a lost node-save response preserves a task whose node was actually saved', async () => {
    const { ctdp } = fixture();
    const originalSave = MainChain.prototype.save;
    const save = vi.spyOn(MainChain.prototype, 'save').mockImplementationOnce(async function (this: any) {
      await originalSave.call(this);
      throw new Error('saved but response lost');
    });
    const result = await ctdp.startMainTask(808106, {
      markerLabel: '确认', description: '网络丢响应', duration: 30
    });
    expect(result.mainChain.nodes[0]!.taskId).toBe(result.task.taskId);
    const persisted = (await TaskChain.findOne({ userId: 808106 }))!;
    expect(persisted.tasks).toHaveLength(1);
    expect(persisted.tasks[0]!.status).toBe('running');
    expect((await User.findOne({ userId: 808106 }))!.stats.totalTasks).toBe(1);
    save.mockRestore();
  });

  test('the same submission token is idempotent across service retries', async () => {
    const { ctdp } = fixture();
    const input = { markerLabel: '确认', description: '幂等启动', duration: 30, submissionToken: 'same-submit' };
    const first = await ctdp.startMainTask(808107, input);
    const second = await ctdp.startMainTask(808107, input);
    expect(second.task.taskId).toBe(first.task.taskId);
    expect((await TaskChain.findOne({ userId: 808107 }))!.tasks).toHaveLength(1);
    expect((await MainChain.findOne({ userId: 808107 }))!.nodes).toHaveLength(1);
  });

  test('retrying a failed submission cannot resurrect a cleared main chain', async () => {
    const { ctdp } = fixture();
    const input = { markerLabel: '确认', description: '已结束', duration: 30, submissionToken: 'ended-submit' };
    const first = await ctdp.startMainTask(808108, input);
    await ctdp.failTrackedTask(808108, first.task.taskId, '主动放弃');
    await expect(ctdp.startMainTask(808108, input)).rejects.toThrow('这次提交的任务已结束');
    expect((await TaskChain.findOne({ userId: 808108 }))!.tasks).toHaveLength(1);
    expect((await MainChain.findOne({ userId: 808108 }))!.nodes).toHaveLength(0);
  });

  test('overlapping token retries cannot append the same main-chain node twice', async () => {
    const { ctdp } = fixture();
    const input = { markerLabel: '确认', description: '并发幂等', duration: 30, submissionToken: 'overlap-submit' };
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const waiting = new Promise<void>((resolve) => { reached = resolve; });
    const originalSave = MainChain.prototype.save;
    let calls = 0;
    const save = vi.spyOn(MainChain.prototype, 'save').mockImplementation(async function (this: any) {
      calls += 1;
      if (calls === 1) {
        reached();
        await gate;
      }
      return originalSave.call(this);
    });
    const first = ctdp.startMainTask(808109, input);
    await waiting;
    try {
      const second = ctdp.startMainTask(808109, input);
      release();
      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(firstResult.task.taskId).toBe(secondResult.task.taskId);
      expect((await MainChain.findOne({ userId: 808109 }))!.nodes).toHaveLength(1);
      expect((await TaskChain.findOne({ userId: 808109 }))!.tasks).toHaveLength(1);
    } finally {
      release();
      save.mockRestore();
    }
  });
});
