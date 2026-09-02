const request = require('supertest');
const app = require('../../../app');
const PrintAuthorization = require('../../../models/PrintAuthorization');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');

describe('POST /api/print/whitelist', () => {
  it('returns 403 for a non-admin', async () => {
    const student = await createUser();
    const res = await request(app)
      .post('/api/print/whitelist')
      .set(authHeader(student))
      .send({ email: 'x@epitech.eu', authorized: true });
    expect(res.status).toBe(403);
  });

  it('whitelists a new email and records who did it', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .post('/api/print/whitelist')
      .set(authHeader(admin))
      .send({ email: 'Student@Epitech.eu', authorized: true, note: 'Autorisé pour le projet X' });

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('student@epitech.eu');
    expect(res.body.data.authorized).toBe(true);
    expect(res.body.data.history).toHaveLength(1);
    expect(res.body.data.history[0].byName).toBe(admin.name);
  });

  it('revokes (blacklists) an already-whitelisted email and keeps history', async () => {
    const admin = await createAdmin();
    await PrintAuthorization.create({ email: 'student@epitech.eu', authorized: true });

    const res = await request(app)
      .post('/api/print/whitelist')
      .set(authHeader(admin))
      .send({ email: 'student@epitech.eu', authorized: false, note: 'Abus signalé' });

    expect(res.body.data.authorized).toBe(false);
    const reloaded = await PrintAuthorization.findOne({ email: 'student@epitech.eu' });
    expect(reloaded.history).toHaveLength(1);
  });
});

describe('GET /api/print/whitelist', () => {
  it('lists all entries for an admin', async () => {
    const admin = await createAdmin();
    await PrintAuthorization.create({ email: 'a@epitech.eu', authorized: true });
    await PrintAuthorization.create({ email: 'b@epitech.eu', authorized: false });

    const res = await request(app).get('/api/print/whitelist').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });
});
