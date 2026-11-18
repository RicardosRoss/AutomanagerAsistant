import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const stage = resolve(process.argv[2] || '.');
const directory = await mkdtemp('/root/automanager-backups/nautilus-isolated-');
await mkdir(join(directory, 'db'));
async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
const mongoPort = await freePort();
const redisPort = await freePort();
const mongo = spawn('mongod', ['--bind_ip', '127.0.0.1', '--port', String(mongoPort),
  '--dbpath', join(directory, 'db'), '--logpath', join(directory, 'mongod.log')], { stdio: 'ignore' });
const redis = spawn('redis-server', ['--bind', '127.0.0.1', '--port', String(redisPort),
  '--save', '', '--appendonly', 'no', '--dir', directory], { stdio: 'ignore' });
let mongoose;
let service;
const module = file => import(pathToFileURL(join(stage, file)).href);
try {
  mongoose = (await module('node_modules/mongoose/index.js')).default;
  await mongoose.connect(`mongodb://127.0.0.1:${mongoPort}/nautilus_rehearsal`, { serverSelectionTimeoutMS: 15000 });
  const models = (await module('dist/src/models/index.js')).default;
  await Promise.all(Object.values(models).map(model => model.init()));
  const config = (await module('dist/config/index.js')).default;
  Object.assign(config.redis, { host: '127.0.0.1', port: redisPort, password: undefined, db: 0 });
  const ScheduleService = (await module('dist/src/services/ScheduleService.js')).default;
  const sent = [];
  service = new ScheduleService(async (...args) => { sent.push(args); return { message_id: 901 }; });
  await service.initialize(null, 'nautilus-isolated');
  await models.User.create({ userId: 991001 });
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const payload = { source: 'nautilus', date: tomorrow, timezone: 'Asia/Shanghai',
    generatedAt: new Date().toISOString(), items: [
      { title: '跨午夜验证', kind: 'pinned', startMinute: 1470, endMinute: 1530 }
    ] };
  assert.equal((await service.sync(991001, payload)).queued, true);
  const first = await models.ScheduledPlan.findOne();
  assert.equal(first.items[0].startAt.getUTCHours(), 16);
  assert.equal(first.items[0].startAt.getUTCMinutes(), 30);
  assert.equal((await service.sync(991001, payload)).unchanged, true);
  assert.equal(await models.ScheduledPlan.countDocuments(), 1);
  await service.restoreAfterRedisReconnect();
  assert.equal((await service.queue.getRepeatableJobs()).length, 1);
  await models.ScheduledPlan.updateOne({ userId: 991001 }, { $set: {
    'items.0.startAt': new Date(Date.now() - 1000), 'items.0.endAt': new Date(Date.now() + 300000)
  } });
  await Promise.all([service.deliver(first.items[0].token), service.deliver(first.items[0].token)]);
  assert.equal(sent.length, 1);
  assert.equal((await models.ScheduledPlan.findOne()).items[0].messageId, 901);
  assert.equal(await models.TaskChain.countDocuments(), 0);
  assert.equal(await models.MainChain.countDocuments(), 0);
  assert.equal(await models.AuxChain.countDocuments(), 0);
  const serverVersion = (await mongoose.connection.db.admin().serverInfo()).version;
  const result = { verifiedAt: new Date().toISOString(), serverVersion, isolatedDirectory: directory,
    idempotentSnapshot: true, crossMidnight: true, competingDeliveryOnce: true, persistedReceipt: true,
    repeatUnique: true, commitmentsCreated: 0, productionWrites: 0, telegramMessagesSent: 0 };
  await writeFile(join(directory, 'VERIFIED.json'), JSON.stringify(result, null, 2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await service?.close();
  await mongoose?.disconnect();
  for (const child of [redis, mongo]) {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
  }
}
