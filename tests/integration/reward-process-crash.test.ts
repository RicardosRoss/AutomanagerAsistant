import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import mongoose from 'mongoose';
import { expect, test, vi } from 'vitest';
import User from '../../src/models/User.js';
import CultivationService from '../../src/services/CultivationService.js';

test.each(['before', 'after'])('a writer killed %s commit recovers exactly one reward', async (timing) => {
  await User.create({ userId: 816009 });
  const directory = await mkdtemp(join(tmpdir(), 'selfcontrol-reward-crash-'));
  const script = join(directory, 'crash.mjs');
  const uri = `mongodb://${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`;
  if (mongoose.connection.host !== '127.0.0.1') throw new Error('Crash test requires isolated local MongoDB');
  await writeFile(script, `
import mongoose from ${JSON.stringify(new URL('../../node_modules/mongoose/index.js', import.meta.url).pathname)};
import { pathToFileURL } from 'node:url';
const root = process.env.TASK_REWARD_TEST_ROOT;
const { default: User } = await import(pathToFileURL(root + '/src/models/User.ts').href);
const { default: CultivationService } = await import(pathToFileURL(root + '/src/services/CultivationService.ts').href);
await mongoose.connect(process.env.TASK_REWARD_TEST_URI);
await User.init();
Math.random = () => 0.1;
const save = User.prototype.save;
User.prototype.save = async function (...args) {
  if (process.env.TASK_REWARD_CRASH_TIMING === 'before') process.kill(process.pid, 'SIGKILL');
  const result = await save.apply(this, args);
  process.kill(process.pid, 'SIGKILL');
  return result;
};
await new CultivationService().awardCultivation(816009, 60, 'crashed-award');
process.exit(7);
`);
  let output = '';
  const rng = vi.spyOn(Math, 'random').mockReturnValue(0.1);
  try {
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', script], {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test', MONGODB_URI: uri,
          TASK_REWARD_TEST_ROOT: process.cwd(), TASK_REWARD_TEST_URI: uri, TASK_REWARD_CRASH_TIMING: timing },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => { output += data.toString(); });
      child.on('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    expect(result.signal, output).toBe('SIGKILL');
    const persisted = (await User.findOne({ userId: 816009 }))!;
    expect(persisted.cultivation.spiritualPower).toBe(timing === 'after' ? 1 : 0);
    expect(persisted.focusRewardReceipts?.[0]?.status).toBe(timing === 'after' ? 'settled' : 'processing');
    if (timing === 'before') {
      expect(persisted.focusRewardReceipts?.[0]?.processingToken).toBeDefined();
      await User.updateOne({ userId: 816009, 'focusRewardReceipts.taskId': 'crashed-award' }, {
        $set: { 'focusRewardReceipts.$.processingUntil': new Date(Date.now() - 1) }
      });
    }
    const commit = vi.spyOn(User.prototype, 'save');
    try {
      const reward = await new CultivationService().awardCultivation(816009, 60, 'crashed-award');
      expect(reward.spiritualPower).toBe(1);
      expect(commit).toHaveBeenCalledTimes(timing === 'after' ? 0 : 1);
      const after = (await User.findOne({ userId: 816009 }))!;
      expect(after.cultivation.spiritualPower).toBe(1);
      expect(after.cultivation.canonical?.state.focusStreak).toBe(1);
      expect(after.focusRewardReceipts).toHaveLength(1);
    } finally {
      commit.mockRestore();
    }
  } finally {
    rng.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});
