import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { expect, test } from 'vitest';

const exec = promisify(execFile);

test('official tools restore all BSON documents and index constraints into an isolated server', async () => {
  const { createManifest, compareManifests } = await import(
    new URL('../../scripts/database-backup.mjs', import.meta.url).href
  );
  const original = mongoose.connection.db;
  const fixture = original.collection('backupfixtures');
  await fixture.insertOne({
    _id: new mongoose.Types.ObjectId(),
    asset: new mongoose.mongo.Long(123),
    when: new Date('2026-10-09T00:00:00Z'),
    payload: Buffer.from([0, 255, 8]),
    tag: 'retained',
    __v: 8
  });
  await fixture.createIndex({ tag: 1, asset: -1 }, { unique: true, name: 'asset_constraint' });
  const directory = await mkdtemp(join(tmpdir(), 'selfcontrol-roundtrip-'));
  const target = await MongoMemoryServer.create({
    binary: { version: '7.0.14' },
    instance: { storageEngine: 'wiredTiger' }
  });
  const destination = new mongoose.mongo.MongoClient(target.getUri(original.databaseName));
  try {
    const config = join(directory, 'tools.yml');
    const archive = join(directory, 'database.gz');
    await writeFile(
      config,
      `uri: ${JSON.stringify(`mongodb://127.0.0.1:${mongoose.connection.port}/${original.databaseName}`)}\n`,
      { mode: 0o600 }
    );
    const before = await createManifest(original);
    await exec('mongodump', [`--config=${config}`, `--archive=${archive}`, '--gzip', '--quiet']);
    await exec('mongorestore', [
      `--host=127.0.0.1`,
      `--port=${target.instanceInfo!.port}`,
      `--archive=${archive}`,
      '--gzip',
      '--quiet',
      '--stopOnError'
    ]);
    await destination.connect();
    compareManifests(before, await createManifest(destination.db(original.databaseName)));
    expect((await stat(archive)).size).toBeGreaterThan(0);
    const restored = await destination
      .db(original.databaseName)
      .collection('backupfixtures')
      .findOne({ tag: 'retained' });
    expect(restored?.when).toEqual(new Date('2026-10-09T00:00:00Z'));
    expect(restored?.__v).toBe(8);
    await expect(
      destination.db(original.databaseName).collection('backupfixtures').insertOne({ tag: 'retained', asset: 123 })
    ).rejects.toMatchObject({ code: 11000 });
  } finally {
    await destination.close();
    await target.stop();
    await fixture.drop();
    await rm(directory, { recursive: true, force: true });
  }
});
