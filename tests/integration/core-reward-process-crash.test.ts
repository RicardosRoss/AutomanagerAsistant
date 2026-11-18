import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import mongoose from 'mongoose';
import { expect, test, vi } from 'vitest';
import { TaskChain, MainChain, User } from '../../src/models/index.js';
import TaskService from '../../src/services/TaskService.js';
import CTDPService from '../../src/services/CTDPService.js';
import CultivationService from '../../src/services/CultivationService.js';

test.each(['core', 'reward'])('SIGKILL after the %s account commit preserves one result', async point => {
  const userId = 835030;
  const queue = { addReminder: vi.fn(), cancelTaskReminders: vi.fn().mockResolvedValue(0) };
  const tasks = new TaskService(queue as never, new CultivationService());
  const ctdp = new CTDPService(tasks, queue as never);
  const created = await ctdp.startMainTask(userId, { description: '进程退出恢复', duration: 60, markerLabel: '确认' });
  await TaskChain.updateOne({ userId }, { $set: { 'tasks.0.startTime': new Date(Date.now() - 3600000) } });
  if (point === 'reward') await ctdp.completeTrackedTask(userId, created.task.taskId);
  const directory = await mkdtemp(join(tmpdir(), 'selfcontrol-core-reward-crash-'));
  const script = join(directory, 'crash.mjs');
  if (mongoose.connection.host !== '127.0.0.1') throw new Error('Crash test requires isolated local MongoDB');
  const uri = `mongodb://${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`;
  await writeFile(script, `
import mongoose from ${JSON.stringify(new URL('../../node_modules/mongoose/index.js', import.meta.url).pathname)};
import { pathToFileURL } from 'node:url';
const root = process.env.CORE_REWARD_TEST_ROOT;
const { TaskChain, User } = await import(pathToFileURL(root + '/src/models/index.ts').href);
const { default: TaskService } = await import(pathToFileURL(root + '/src/services/TaskService.ts').href);
const { default: CultivationService } = await import(pathToFileURL(root + '/src/services/CultivationService.ts').href);
await mongoose.connect(process.env.CORE_REWARD_TEST_URI);
await Promise.all([TaskChain.init(), User.init()]);
Math.random = () => 0.1;
const tasks = new TaskService({ cancelTaskReminders: async () => 0 }, new CultivationService());
if (process.env.CORE_REWARD_TEST_POINT === 'core') {
  const update = User.updateOne.bind(User);
  User.updateOne = async (...args) => {
    const result = await update(...args);
    if (Array.isArray(args[1]) && args[1][0]?.$set?.pendingFocusRewards) process.kill(process.pid, 'SIGKILL');
    return result;
  };
  await tasks.completeTask(835030, process.env.CORE_REWARD_TEST_TASK);
} else {
  const save = User.prototype.save;
  User.prototype.save = async function (...args) {
    const result = await save.apply(this, args);
    if (this.focusRewardReceipts?.some(r => r.status === 'settled')) process.kill(process.pid, 'SIGKILL');
    return result;
  };
  await tasks.recoverPendingRewards(835030);
}
process.exit(7);
`);
  let output = '';
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.1);
  try {
    const result = await new Promise<{ signal: NodeJS.Signals | null }>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', script], {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test', MONGODB_URI: uri, CORE_REWARD_TEST_URI: uri,
          CORE_REWARD_TEST_ROOT: process.cwd(), CORE_REWARD_TEST_POINT: point,
          CORE_REWARD_TEST_TASK: created.task.taskId },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      child.stdout.on('data', data => { output += data.toString(); });
      child.stderr.on('data', data => { output += data.toString(); });
      child.on('error', reject);
      child.once('exit', (_code, signal) => resolve({ signal }));
    });
    expect(result.signal, output).toBe('SIGKILL');
    const committed = (await User.findOne({ userId }))!;
    expect(committed.stats.completedTasks).toBe(1);
    expect(committed.pendingFocusRewards).toHaveLength(point === 'core' ? 1 : 0);
    expect(committed.cultivation.spiritualPower).toBe(point === 'core' ? 0 : 1);
    await TaskChain.updateOne({ userId }, { $set: {
      'tasks.0.settlementLeaseUntil': new Date(0), 'tasks.0.rewardLeaseUntil': new Date(0)
    } });
    await tasks.recoverCoreResults(userId);
    await ctdp.recoverConfirmedNodes(userId);
    await tasks.recoverPendingRewards(userId);
    await tasks.recoverPendingRewards(userId);
    const after = (await User.findOne({ userId }))!;
    const chain = (await TaskChain.findOne({ userId }))!;
    expect(after.stats.completedTasks).toBe(1);
    expect(after.stats.totalMinutes).toBe(60);
    expect(after.pendingFocusRewards).toHaveLength(0);
    expect(after.cultivation.spiritualPower).toBe(1);
    expect(after.cultivation.canonical?.state.focusStreak).toBe(1);
    expect(after.focusRewardReceipts).toHaveLength(1);
    expect(chain.tasks[0]).toMatchObject({ settlementStatus: 'settled', rewardStatus: 'settled' });
    expect((await MainChain.findOne({ userId }))?.nodes[0]?.status).toBe('completed');
    const next = await ctdp.startMainTask(userId, { description: '恢复后继续', duration: 30, markerLabel: '确认' });
    expect(next.mainChain.nodes[1]?.nodeNo).toBe(2);
  } finally {
    random.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});
