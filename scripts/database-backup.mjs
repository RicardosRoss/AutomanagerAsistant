import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BSON, MongoClient } from 'mongodb';
import 'dotenv/config';

const applicationName = 'automanager-backup-snapshot';

export async function createManifest(db) {
  const collections = [];
  const infos = await db.listCollections().toArray();
  for (const info of infos.sort((a, b) => a.name.localeCompare(b.name))) {
    if (info.type !== 'collection' || info.options.timeseries || info.options.encryptedFields) {
      throw new Error('Unsupported collection type');
    }
    const collection = db.collection(info.name);
    const hash = createHash('sha256');
    let count = 0;
    // Hash BSON directly so integer types, dates and binary assets retain their identity.
    for await (const document of collection.find({}, { raw: true }).sort({ _id: 1 })) {
      if (!Buffer.isBuffer(document)) throw new Error('Raw BSON required');
      hash.update(document);
      count += 1;
    }
    const indexes = (await collection.listIndexes().toArray())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ ns, background, ...index }) => BSON.EJSON.serialize(index, { relaxed: false }));
    collections.push({ name: info.name, count, sha256: hash.digest('hex'),
      options: BSON.EJSON.serialize(info.options, { relaxed: false }), indexes });
  }
  return { formatVersion: 1, database: db.databaseName, collections };
}

export function compareManifests(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Database manifest mismatch');
}

export async function assertQuietDatabase(db, allowedApplication = applicationName) {
  const hello = await db.admin().command({ hello: 1 });
  if (hello.setName || hello.msg === 'isdbgrid') throw new Error('Standalone backup required');
  for (const info of await db.listCollections().toArray()) {
    if (info.type !== 'collection') throw new Error('Unsupported collection type');
    const collection = db.collection(info.name);
    const indexes = await collection.listIndexes().toArray();
    if (indexes.some((index) => index.expireAfterSeconds !== undefined) &&
        await collection.countDocuments({}, { limit: 1 }) !== 0) {
      throw new Error('Nonempty TTL collection can change while application is stopped');
    }
  }
  const operations = await db.admin().command({ aggregate: 1,
    pipeline: [
      { $currentOp: { allUsers: true, idleConnections: true } },
      { $match: { client: { $exists: true } } }
    ], cursor: { batchSize: 1000 } });
  // Refuse an incomplete response instead of overlooking clients in a later batch.
  if (operations.cursor?.id?.toString() !== '0') throw new Error('Incomplete MongoDB connection audit');
  const clients = operations.cursor.firstBatch;
  if (clients.some((client) => client.appName !== allowedApplication &&
      client.clientMetadata?.application?.name !== allowedApplication)) {
    throw new Error('Unrecognized MongoDB connection; quiescence not established');
  }
}

function checkService(expected) {
  const services = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', timeout: 10000 }));
  const matches = services.filter((service) => service.name === 'telegram-self-control-bot');
  if (matches.length !== 1) throw new Error('Expected one project worker');
  const service = matches[0];
  if (expected === 'online' ? service.pm2_env?.status !== 'online' || !service.pid :
      service.pm2_env?.status !== 'stopped' || service.pid !== 0) {
    throw new Error('Unexpected project worker status');
  }
}

async function main() {
  const [mode, output, other] = process.argv.slice(2);
  if (mode === 'pm2-check') return checkService(output);
  if (mode === 'compare') {
    return compareManifests(JSON.parse(await readFile(output, 'utf8')), JSON.parse(await readFile(other, 'utf8')));
  }
  const uri = mode === 'verify' ? process.env.TASK_BACKUP_VERIFY_URI : process.env.MONGODB_URI;
  if (!uri) throw new Error('Explicit MongoDB URI required');
  const endpoint = new URL(uri);
  if (!['127.0.0.1', 'localhost'].includes(endpoint.hostname) || endpoint.pathname !== '/selfcontrol') {
    throw new Error('Backup requires local selfcontrol database');
  }
  if (mode === 'verify' && (!endpoint.port || endpoint.port === '27017')) {
    throw new Error('Restore verification requires isolated nonproduction port');
  }
  if (mode === 'config') {
    endpoint.searchParams.set('appName', 'automanager-backup-dump');
    await writeFile(output, `uri: ${JSON.stringify(endpoint.toString())}\n`, { mode: 0o600, flag: 'wx' });
    return;
  }
  const client = new MongoClient(uri, { appName: applicationName,
    serverSelectionTimeoutMS: 5000, socketTimeoutMS: 10000, maxPoolSize: 1 });
  try {
    await client.connect();
    const db = client.db();
    if (mode === 'preflight') {
      const hello = await db.admin().command({ hello: 1 });
      if (hello.setName || hello.msg === 'isdbgrid') throw new Error('Standalone backup required');
      return;
    }
    if (mode !== 'snapshot' && mode !== 'verify') throw new Error('Unknown backup mode');
    if (mode === 'snapshot') await assertQuietDatabase(db);
    const manifest = await createManifest(db);
    if (mode === 'snapshot') await assertQuietDatabase(db);
    await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  } finally {
    await client.close();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    console.error(`Database backup step failed: ${process.argv[2] || 'unknown'} (credentials and documents omitted)`);
    process.exitCode = 1;
  });
}
