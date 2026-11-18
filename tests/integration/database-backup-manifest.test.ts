import mongoose from 'mongoose';
import { MongoClient } from 'mongodb';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { expect, test } from 'vitest';

const load = () => import(new URL('../../scripts/database-backup.mjs', import.meta.url).href);

test('actual snapshot CLI succeeds against a quiet isolated database and omits document contents', async () => {
  const server = await MongoMemoryServer.create({ binary: { version: '7.0.14' },
    instance: { storageEngine: 'wiredTiger' } });
  const uri = server.getUri('selfcontrol');
  const client = new MongoClient(uri);
  const directory = await mkdtemp(join(tmpdir(), 'selfcontrol-cli-snapshot-'));
  const output = join(directory, 'snapshot.json');
  try {
    await client.connect();
    await client.db().collection('assets').insertOne({ power: 7, privateText: 'cli-private-document' });
    await client.close();
    await promisify(execFile)(process.execPath, ['scripts/database-backup.mjs', 'snapshot', output], {
      env: { ...process.env, MONGODB_URI: uri }
    });
    const contents = await readFile(output, 'utf8');
    const manifest = JSON.parse(contents);
    expect(manifest.database).toBe('selfcontrol');
    expect(manifest.collections).toHaveLength(1);
    expect(manifest.collections[0].count).toBe(1);
    expect(manifest.collections[0].indexes[0].name).toBe('_id_');
    expect(contents).not.toContain('cli-private-document');
  } finally {
    await client.close();
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('the CLI MongoDB driver detects foreign clients without accessing a version-specific Db.client', async () => {
  const { assertQuietDatabase } = await load();
  const client = new MongoClient(`mongodb://127.0.0.1:${mongoose.connection.port}/${mongoose.connection.name}`, {
    appName: 'legacy-backup-test'
  });
  try {
    await client.connect();
    await expect(assertQuietDatabase(client.db(), 'legacy-backup-test')).rejects.toThrow(/connection/i);
  } finally {
    await client.close();
  }
});

test('backup manifests detect asset and index changes without exposing document contents', async () => {
  const { createManifest, compareManifests } = await load();
  const db = mongoose.connection.db;
  await db.collection('backupfixtures').insertOne({ _id: 'asset', power: 7, secret: 'private-content' });
  try {
    const first = await createManifest(db);
    expect(JSON.stringify(first)).not.toContain('private-content');
    expect(first.collections.find((c: { name: string }) => c.name === 'backupfixtures').count).toBe(1);
    compareManifests(first, await createManifest(db));
    await db.collection('backupfixtures').updateOne({ _id: 'asset' }, { $set: { power: 8 } });
    const changed = await createManifest(db);
    expect(() => compareManifests(first, changed)).toThrow(/mismatch/i);
  } finally {
    await db.collection('backupfixtures').drop();
  }
});

test('manifest comparison rejects removed indexes and changed compound key order', async () => {
  const { createManifest, compareManifests } = await load();
  const db = mongoose.connection.db;
  await db.collection('backupfixtures').createIndex({ a: 1, b: -1 }, { name: 'compound' });
  try {
    const before = await createManifest(db);
    await db.collection('backupfixtures').dropIndex('compound');
    const removed = await createManifest(db);
    expect(() => compareManifests(before, removed)).toThrow(/mismatch/i);
    await db.collection('backupfixtures').createIndex({ b: -1, a: 1 }, { name: 'compound' });
    const reordered = await createManifest(db);
    expect(() => compareManifests(before, reordered)).toThrow(/mismatch/i);
  } finally {
    await db.collection('backupfixtures').drop();
  }
});

test('nonempty TTL collections and unrecognized clients block quiescent backup', async () => {
  const { assertQuietDatabase } = await load();
  const db = mongoose.connection.db;
  await db.collection('taskdrafts').insertOne({ userId: 99, expiresAt: new Date(Date.now() + 86400000) });
  await expect(assertQuietDatabase(db, 'backup-test')).rejects.toThrow(/TTL/);
  await db.collection('taskdrafts').deleteMany({});
  await expect(assertQuietDatabase(db, 'backup-test')).rejects.toThrow(/connection/i);
});
