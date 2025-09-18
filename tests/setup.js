import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongod.stop();
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  const collectionNames = Object.keys(collections);

  for (const collectionName of collectionNames) {
    const collection = collections[collectionName];
    await collection.deleteMany({});
  }
});

global.testUserId = 123456789;
global.testUser = {
  userId: 123456789,
  username: 'testuser',
  firstName: 'Test',
  lastName: 'User'
};
