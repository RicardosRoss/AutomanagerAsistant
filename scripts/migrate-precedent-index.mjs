import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MongoClient } from 'mongodb';
import 'dotenv/config';
import { assertQuietDatabase, createManifest } from './database-backup.mjs';

const oldName = 'userId_1_scope.behaviorKey_1_scope.chainType_1';
const oldKey = { userId: 1, 'scope.behaviorKey': 1, 'scope.chainType': 1 };
const newKey = { ...oldKey, 'scope.chainId': 1 };

function exactIndex(index, key) {
  return index?.unique === true && JSON.stringify(index.key) === JSON.stringify(key) &&
    !index.sparse && !index.partialFilterExpression && !index.collation && !index.hidden;
}

export async function migratePrecedentIndex(collection, { apply = false } = {}) {
  const indexes = await collection.listIndexes().toArray();
  if (!exactIndex(indexes.find(index => index.name === 'precedent_per_chain'), newKey)) {
    throw new Error('Exact replacement unique index required');
  }
  const old = indexes.find(index => index.name === oldName);
  if (old && !exactIndex(old, oldKey)) throw new Error('Unexpected obsolete index definition');
  const documents = await collection.countDocuments();
  const unboundRules = await collection.countDocuments({ $or: [
    { 'scope.chainId': { $exists: false } }, { 'scope.chainId': null }, { 'scope.chainId': '' }
  ] });
  if (!old) return { action: 'already-migrated', documents, unboundRules };
  if (!apply) return { action: 'needs-migration', documents, unboundRules, index: oldName };
  await collection.dropIndex(oldName);
  const after = await collection.listIndexes().toArray();
  if (JSON.stringify(after) !== JSON.stringify(indexes.filter(index => index.name !== oldName))) {
    throw new Error('Unexpected index changes after migration');
  }
  return { action: 'migrated', documents, unboundRules, droppedIndex: oldName };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MongoDB URI required');
  const endpoint = new URL(uri);
  if (!['localhost', '127.0.0.1'].includes(endpoint.hostname) || endpoint.pathname !== '/selfcontrol') {
    throw new Error('Expected local selfcontrol database');
  }
  const client = new MongoClient(uri, { appName: 'automanager-precedent-migration',
    serverSelectionTimeoutMS: 5000, socketTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db();
    if (apply) {
      await assertQuietDatabase(db, 'automanager-precedent-migration');
      const workers = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', timeout: 10000 }));
      const matches = workers.filter(worker => worker.name === 'telegram-self-control-bot');
      if (matches.length !== 1 || matches[0].pid !== 0 || matches[0].pm2_env.status !== 'stopped') {
        throw new Error('Stop the exact project worker before applying migration');
      }
      const root = process.env.TASK_PRECEDENT_BACKUP;
      if (!root) throw new Error('Verified backup required');
      await readFile(resolve(root, 'COMPLETE'));
      execFileSync('sha256sum', ['-c', 'SHA256SUMS'], { cwd: root, stdio: 'ignore', timeout: 10000 });
      let restoreVerified = false;
      for (const entry of await readdir(root)) {
        if (!entry.startsWith('verify-')) continue;
        try { await readFile(resolve(root, entry, 'RESTORE_VERIFIED')); restoreVerified = true; } catch { /* No marker. */ }
      }
      if (!restoreVerified) throw new Error('Isolated restore verification required');
      const before = JSON.parse(await readFile(resolve(root, 'before.json'), 'utf8'));
      const current = await createManifest(db);
      const expected = before.collections.find(collection => collection.name === 'precedentrules');
      const actual = current.collections.find(collection => collection.name === 'precedentrules');
      if (expected && actual && !actual.indexes.some(index => index.name === oldName)) {
        expected.indexes = expected.indexes.filter(index => index.name !== oldName);
      }
      if (!expected || JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error('Precedent data or indexes changed since verified backup');
      }
    }
    const result = await migratePrecedentIndex(db.collection('precedentrules'), { apply });
    const record = { executedAt: new Date().toISOString(), mode: apply ? 'apply' : 'dry-run', ...result };
    if (process.env.TASK_PRECEDENT_AUDIT) await writeFile(process.env.TASK_PRECEDENT_AUDIT,
      `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify(record));
  } finally {
    await client.close();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    console.error('Precedent index migration failed; documents and credentials omitted');
    process.exitCode = 1;
  });
}
