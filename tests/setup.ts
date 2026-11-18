import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

let mongod: MongoMemoryServer;

process.env.BOT_TOKEN ??= '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi';

beforeAll(async () => {
  await import('../src/models/index.js');
  mongod = await MongoMemoryServer.create({
    instance: { storageEngine: 'wiredTiger' },
    binary: {
      version: '7.0.14'
    }
  });

  await mongoose.connect(mongod.getUri());
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }

  if (mongod) {
    await mongod.stop();
  }
});

afterEach(async () => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

globalThis.testUserId = 123456789;
globalThis.testUser = {
  userId: 123456789,
  username: 'testuser',
  firstName: 'Test',
  lastName: 'User'
};
