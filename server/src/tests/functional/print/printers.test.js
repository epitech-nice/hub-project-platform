const request = require('supertest');
const app = require('../../../app');
const Printer = require('../../../models/Printer');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');

describe('GET /api/print/printers', () => {
  it('returns 401 with no auth', async () => {
    const res = await request(app).get('/api/print/printers');
    expect(res.status).toBe(401);
  });

  it('lists printers for an authenticated student', async () => {
    const student = await createUser();
    await Printer.create({ name: 'Kobra 3 - A', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });

    const res = await request(app).get('/api/print/printers').set(authHeader(student));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Kobra 3 - A');
    expect(res.body.data[0].apiKeyHash).toBeUndefined();
  });
});

describe('POST /api/print/printers', () => {
  it('returns 403 for a non-admin', async () => {
    const student = await createUser();
    const res = await request(app)
      .post('/api/print/printers')
      .set(authHeader(student))
      .send({ name: 'Kobra 3 - B', model: 'kobra3' });
    expect(res.status).toBe(403);
  });

  it('creates a printer and returns the raw API key exactly once', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .post('/api/print/printers')
      .set(authHeader(admin))
      .send({ name: 'Kobra 3 Max - C', model: 'kobra3max' });

    expect(res.status).toBe(201);
    expect(res.body.data.printer.name).toBe('Kobra 3 Max - C');
    expect(typeof res.body.data.apiKey).toBe('string');
    expect(res.body.data.apiKey.length).toBeGreaterThan(20);

    const stored = await Printer.findById(res.body.data.printer._id);
    expect(stored.apiKeyHash).not.toBe(res.body.data.apiKey);
  });
});

describe('POST /api/print/printers/:id/regenerate-key', () => {
  it('invalidates the old key hash', async () => {
    const admin = await createAdmin();
    const created = await request(app)
      .post('/api/print/printers')
      .set(authHeader(admin))
      .send({ name: 'Kobra 3 - D', model: 'kobra3' });
    const printerId = created.body.data.printer._id;
    const oldHash = (await Printer.findById(printerId)).apiKeyHash;

    const res = await request(app)
      .post(`/api/print/printers/${printerId}/regenerate-key`)
      .set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(typeof res.body.data.apiKey).toBe('string');
    const reloaded = await Printer.findById(printerId);
    expect(reloaded.apiKeyHash).not.toBe(oldHash);
  });
});
