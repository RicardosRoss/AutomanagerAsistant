import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { expect, test } from 'vitest';

const exec = promisify(execFile);
const oldName = 'userId_1_scope.behaviorKey_1_scope.chainType_1';

test('migration CLI refuses live workers and unverified data; a valid migration is repeatable', async () => {
  const { createManifest } = await import(new URL('../../scripts/database-backup.mjs', import.meta.url).href);
  const server = await MongoMemoryServer.create({
    binary: { version: '7.0.14' },
    instance: { storageEngine: 'wiredTiger' }
  });
  const uri = server.getUri('selfcontrol');
  const client = new MongoClient(uri);
  const directory = await mkdtemp(join(tmpdir(), 'selfcontrol-migration-cli-'));
  const backup = join(directory, 'backup');
  const bin = join(directory, 'bin');
  try {
    await mkdir(backup);
    await mkdir(bin);
    await writeFile(
      join(bin, 'pm2'),
      `#!/bin/sh
if [ "$TASK_CLI_WORKER" = online ]; then
  printf '%s' '[{"name":"telegram-self-control-bot","pid":99,"pm2_env":{"status":"online"}}]'
else
  printf '%s' '[{"name":"telegram-self-control-bot","pid":0,"pm2_env":{"status":"stopped"}}]'
fi
`,
      { mode: 0o700 }
    );
    await client.connect();
    const collection = client.db().collection('precedentrules');
    await collection.createIndex(
      { userId: 1, 'scope.behaviorKey': 1, 'scope.chainType': 1 },
      { name: oldName, unique: true }
    );
    await collection.createIndex(
      { userId: 1, 'scope.behaviorKey': 1, 'scope.chainType': 1, 'scope.chainId': 1 },
      { name: 'precedent_per_chain', unique: true }
    );
    const manifest = await createManifest(client.db());
    await client.close();
    await writeFile(join(backup, 'COMPLETE'), 'fixture-complete');
    const text = JSON.stringify(manifest);
    await writeFile(join(backup, 'before.json'), text);
    await writeFile(join(backup, 'SHA256SUMS'), `${createHash('sha256').update(text).digest('hex')}  before.json\n`);
    const run = (worker = 'stopped') =>
      exec(process.execPath, ['scripts/migrate-precedent-index.mjs', '--apply'], {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          MONGODB_URI: uri,
          TASK_PRECEDENT_BACKUP: backup,
          TASK_CLI_WORKER: worker
        }
      });
    await expect(run('online')).rejects.toMatchObject({ code: 1 });
    await expect(run()).rejects.toMatchObject({ code: 1 });
    await mkdir(join(backup, 'verify-fixture'));
    await writeFile(join(backup, 'verify-fixture', 'RESTORE_VERIFIED'), 'fixture-verified');
    await client.connect();
    await collection.insertOne({ userId: 1, scope: { behaviorKey: 'changed', chainType: 'main', chainId: 'one' } });
    await client.close();
    await expect(run()).rejects.toMatchObject({ code: 1 });
    await client.connect();
    expect((await collection.listIndexes().toArray()).some(index => index.name === oldName)).toBe(true);
    await collection.deleteMany({});
    await client.close();
    expect(JSON.parse((await run()).stdout).action).toBe('migrated');
    expect(JSON.parse((await run()).stdout).action).toBe('already-migrated');
  } finally {
    await client.close();
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
