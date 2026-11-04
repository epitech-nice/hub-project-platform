const fs = require('fs');
const os = require('os');
const path = require('path');

// Racine de stockage des idées isolée par fichier de test (avant tout require de l'app).
// Dossier parent temporaire + sous-dossier "ideas" créé d'avance.
const ideasTestParent = fs.mkdtempSync(path.join(os.tmpdir(), 'ideas-test-'));
process.env.IDEA_STORAGE_ROOT = path.join(ideasTestParent, 'ideas');
fs.mkdirSync(process.env.IDEA_STORAGE_ROOT, { recursive: true });

afterAll(() => {
  fs.rmSync(ideasTestParent, { recursive: true, force: true });
});

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
