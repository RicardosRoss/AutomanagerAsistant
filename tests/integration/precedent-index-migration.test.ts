import mongoose from 'mongoose';
import { expect, test } from 'vitest';
import PrecedentService from '../../src/services/PrecedentService.js';

const load = () => import(new URL('../../scripts/migrate-precedent-index.mjs', import.meta.url).href);
const oldName = 'userId_1_scope.behaviorKey_1_scope.chainType_1';
const oldKey = { userId: 1, 'scope.behaviorKey': 1, 'scope.chainType': 1 } as const;

test('dry-run preserves rules and indexes; applying migration allows one rule in each lifecycle', async () => {
  const { migratePrecedentIndex } = await load();
  const collection = mongoose.connection.db.collection('precedentrules');
  await collection.createIndex(oldKey, { unique: true, name: oldName });
  try {
    const service = new PrecedentService();
    await service.allowForever({ userId: 830006, chainType: 'main', chainId: 'old-chain', behaviorKey: 'phone' });
    const docs = await collection.find().toArray();
    const indexes = await collection.listIndexes().toArray();
    expect((await migratePrecedentIndex(collection)).action).toBe('needs-migration');
    expect(await collection.listIndexes().toArray()).toEqual(indexes);
    expect(await collection.find().toArray()).toEqual(docs);
    await expect(
      service.allowForever({ userId: 830006, chainType: 'main', chainId: 'new-chain', behaviorKey: 'phone' })
    ).rejects.toThrow(/duplicate/i);
    expect((await migratePrecedentIndex(collection, { apply: true })).action).toBe('migrated');
    expect(await collection.find().toArray()).toEqual(docs);
    expect((await collection.listIndexes().toArray()).filter(index => index.name !== oldName)).toEqual(
      indexes.filter(index => index.name !== oldName)
    );
    await service.allowForever({ userId: 830006, chainType: 'main', chainId: 'new-chain', behaviorKey: 'phone' });
    await service.allowForever({ userId: 830006, chainType: 'main', chainId: 'new-chain', behaviorKey: 'phone' });
    expect(await collection.countDocuments()).toBe(2);
    expect((await migratePrecedentIndex(collection, { apply: true })).action).toBe('already-migrated');
    await expect(
      collection.insertOne({
        userId: 830006,
        scope: {
          behaviorKey: 'phone',
          chainType: 'main',
          chainId: 'new-chain'
        },
        decision: 'allow_forever'
      })
    ).rejects.toMatchObject({ code: 11000 });
  } finally {
    const indexes = await collection.listIndexes().toArray();
    if (indexes.some(index => index.name === oldName)) await collection.dropIndex(oldName);
  }
});

test('migration refuses an obsolete index name whose key or options were changed', async () => {
  const { migratePrecedentIndex } = await load();
  const collection = mongoose.connection.db.collection('precedentrules');
  await collection.createIndex({ 'scope.chainId': 1 }, { unique: true, name: oldName });
  try {
    const before = await collection.listIndexes().toArray();
    await expect(migratePrecedentIndex(collection, { apply: true })).rejects.toThrow(/index/i);
    expect(await collection.listIndexes().toArray()).toEqual(before);
  } finally {
    await collection.dropIndex(oldName);
  }
});

test('migration refuses removal until the exact new unique index exists', async () => {
  const { migratePrecedentIndex } = await load();
  const db = mongoose.connection.db;
  const collection = db.collection('precedentmigrationfixtures');
  await collection.createIndex(oldKey, { unique: true, name: oldName });
  try {
    const before = await collection.listIndexes().toArray();
    await expect(migratePrecedentIndex(collection, { apply: true })).rejects.toThrow(/index/i);
    expect(await collection.listIndexes().toArray()).toEqual(before);
  } finally {
    await collection.drop();
  }
});
