// Variables d'env requises par passport-microsoft et JWT au chargement de app.js
process.env.MICROSOFT_CLIENT_ID = 'test-client-id';
process.env.MICROSOFT_CLIENT_SECRET = 'test-client-secret';
process.env.JWT_SECRET = 'your-secret-key';
process.env.RESEND_API_KEY = 're_test_key_000';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
