import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { expect, test } from 'vitest';
import { User, DivinationHistory } from '../../src/models/index.js';
import CultivationService from '../../src/services/CultivationService.js';

test('a process killed after divination account commit replays only history and does not cast again', async () => {
  if (mongoose.connection.host !== '127.0.0.1') throw new Error('Crash test requires isolated MongoDB');
  await User.create({ userId: 833010, cultivation: { immortalStones: 100 } });
  const directory = await mkdtemp(join(tmpdir(), 'selfcontrol-divination-crash-'));
  const script = join(directory, 'crash.mjs');
  await writeFile(
    script,
    `
import {pathToFileURL} from 'node:url';
const root=process.env.TASK_DIVINATION_ROOT;
const {default:mongoose}=await import(pathToFileURL(root+'/node_modules/mongoose/index.js').href);
const {User,DivinationHistory}=await import(pathToFileURL(root+'/src/models/index.ts').href);
const {default:CultivationService}=await import(pathToFileURL(root+'/src/services/CultivationService.ts').href);
await mongoose.connect(process.env.TASK_DIVINATION_URI);
await Promise.all([User.init(),DivinationHistory.init()]);
Math.random=()=>0.1;
const save=User.prototype.save;
User.prototype.save=async function(...args){
 const result=await save.apply(this,args);
 process.kill(process.pid,'SIGKILL');
 return result;
};
await new CultivationService().castDivination(833010,10);
process.exit(7);
`
  );
  let output = '';
  try {
    const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', script], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          TASK_DIVINATION_ROOT: process.cwd(),
          TASK_DIVINATION_URI: `mongodb://127.0.0.1:${mongoose.connection.port}/${mongoose.connection.name}`
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      child.stdout.on('data', data => {
        output += data.toString();
      });
      child.stderr.on('data', data => {
        output += data.toString();
      });
      child.on('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    expect(outcome.signal, output).toBe('SIGKILL');
    const committed = (await User.findOne({ userId: 833010 }))!;
    expect(committed.cultivation.immortalStones).toBe(60);
    expect(committed.cultivation.divinationCount).toBe(1);
    expect(committed.pendingDivinationHistories).toHaveLength(1);
    expect(await DivinationHistory.countDocuments({ userId: 833010 })).toBe(0);
    await new CultivationService().recoverDivinationHistories();
    await new CultivationService().recoverDivinationHistories();
    const recovered = (await User.findOne({ userId: 833010 }))!;
    expect(recovered.cultivation.immortalStones).toBe(60);
    expect(recovered.cultivation.divinationCount).toBe(1);
    expect(recovered.pendingDivinationHistories).toHaveLength(0);
    expect(await DivinationHistory.countDocuments({ userId: 833010 })).toBe(1);
    expect((await DivinationHistory.findOne({ userId: 833010 }))?.result).toBe(-40);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
