import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { expect, test } from 'vitest';

test('authenticated backup rejects insufficient inprog privilege and detects a foreign client', async () => {
  const { assertQuietDatabase } = await import(new URL('../../scripts/database-backup.mjs', import.meta.url).href);
  const server = await MongoMemoryServer.create({
    binary: { version: '7.0.14' }, instance: { storageEngine: 'wiredTiger' },
    auth: { enable: true, customRootName: 'backup-root', customRootPwd: 'test-only-password' }
  });
  const uri = server.getUri('selfcontrol');
  const options = { auth: { username: 'backup-root', password: 'test-only-password' }, authSource: 'admin' };
  const root = new mongoose.mongo.MongoClient(uri, { ...options, appName: 'backup-auth-root' });
  const limited = new mongoose.mongo.MongoClient(uri, {
    auth: { username: 'limited-backup', password: 'test-only-password' }, authSource: 'admin',
    appName: 'backup-auth-limited'
  });
  const foreign = new mongoose.mongo.MongoClient(uri, { ...options, appName: 'foreign-writer' });
  try {
    await root.connect();
    await root.db('selfcontrol').createCollection('assets');
    await root.db('admin').command({ createUser: 'limited-backup', pwd: 'test-only-password',
      roles: [{ role: 'readWrite', db: 'selfcontrol' }] });
    await limited.connect();
    await expect(assertQuietDatabase(limited.db(), 'backup-auth-limited')).rejects.toMatchObject({ code: 13 });
    await limited.close();
    await expect(assertQuietDatabase(root.db(), 'backup-auth-root')).resolves.toBeUndefined();
    await foreign.connect();
    await foreign.db().command({ ping: 1 });
    await expect(assertQuietDatabase(root.db(), 'backup-auth-root')).rejects.toThrow(/connection/i);
    await foreign.close();
    await expect(assertQuietDatabase(root.db(), 'backup-auth-root')).resolves.toBeUndefined();
  } finally {
    await limited.close();
    await foreign.close();
    await root.close();
    await server.stop();
  }
});
