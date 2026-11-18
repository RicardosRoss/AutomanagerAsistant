import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import mongoose from 'mongoose';
import { expect, test, vi } from 'vitest';
import TaskService from '../../src/services/TaskService.js';
import CTDPService from '../../src/services/CTDPService.js';
import { TaskChain, MainChain, User } from '../../src/models/index.js';

test('a process killed after ready but before main publication recovers the original task once', async () => {
  if (mongoose.connection.host !== '127.0.0.1') throw new Error('Crash test requires isolated local MongoDB');
  const directory = await mkdtemp(join(tmpdir(), 'selfcontrol-main-start-crash-'));
  const script = join(directory, 'crash.mjs');
  await writeFile(script, `
import { pathToFileURL } from 'node:url';
const root = process.env.TASK_MAIN_CRASH_ROOT;
const { default: mongoose } = await import(pathToFileURL(root + '/node_modules/mongoose/index.js').href);
const { default: TaskService } = await import(pathToFileURL(root + '/src/services/TaskService.ts').href);
const { MainChain, TaskChain, User } = await import(pathToFileURL(root + '/src/models/index.ts').href);
await mongoose.connect(process.env.TASK_MAIN_CRASH_URI);
await Promise.all([MainChain.init(), TaskChain.init(), User.init()]);
const main = await MainChain.findOrCreateActive(831030, '真实崩溃原标志');
const queue = { addReminder: async () => 1, cancelTaskReminders: async () => 0 };
await new TaskService(queue).createTask(831030, '真实崩溃任务', 30, false, null, 'crash-start', undefined, main.chainId);
process.kill(process.pid, 'SIGKILL');
process.exit(7);
`);
  let output = '';
  try {
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', script], {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test', TASK_MAIN_CRASH_ROOT: process.cwd(),
          TASK_MAIN_CRASH_URI: `mongodb://127.0.0.1:${mongoose.connection.port}/${mongoose.connection.name}` },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      child.stdout.on('data', data => { output += data.toString(); });
      child.stderr.on('data', data => { output += data.toString(); });
      child.on('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    expect(result.signal, output).toBe('SIGKILL');
    const before = (await TaskChain.findOne({ userId: 831030 }))!;
    const task = before.tasks[0]!;
    expect(task.creationState).toBe('ready');
    expect((await MainChain.findOne({ userId: 831030 }))?.nodes).toHaveLength(0);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60000);
    try {
      const queue = { addReminder: vi.fn(), cancelTaskReminders: vi.fn() };
      const fresh = new CTDPService(new TaskService(queue as never), queue as never);
      await fresh.recoverUnpublishedStarts();
      await fresh.recoverUnpublishedStarts();
      const main = (await MainChain.findOne({ userId: 831030 }))!;
      expect(main.chainId).toBe(task.mainChainId);
      expect(main.nodes).toHaveLength(1);
      expect(main.nodes[0]?.taskId).toBe(task.taskId);
      expect((await TaskChain.findOne({ userId: 831030 }))?.tasks[0]?.startTime).toEqual(task.startTime);
      expect((await User.findOne({ userId: 831030 }))?.stats.totalTasks).toBe(1);
    } finally {
      clock.mockRestore();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
