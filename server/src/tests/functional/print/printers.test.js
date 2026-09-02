const request = require('supertest');
const app = require('../../../app');
const Printer = require('../../../models/Printer');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');
const { PRINTER_STATUSES } = require('../../../utils/constants');

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

describe('PATCH /api/print/printers/:id/disabled', () => {
  it('requires a note when disabling', async () => {
    const admin = await createAdmin();
    const printer = await Printer.create({ name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const res = await request(app)
      .patch(`/api/print/printers/${printer._id}/disabled`)
      .set(authHeader(admin))
      .send({ disabled: true });
    expect(res.status).toBe(400);
  });

  it('disables with a note, logs statusHistory, and re-enables back to idle', async () => {
    const admin = await createAdmin();
    const printer = await Printer.create({ name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });

    const disableRes = await request(app)
      .patch(`/api/print/printers/${printer._id}/disabled`)
      .set(authHeader(admin))
      .send({ disabled: true, note: 'Buse bouchée, en réparation' });
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.data.status).toBe(PRINTER_STATUSES.DISABLED);

    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.statusHistory).toHaveLength(1);
    expect(reloaded.statusHistory[0].source).toBe('admin_action');
    expect(reloaded.statusHistory[0].detail).toBe('Buse bouchée, en réparation');

    const enableRes = await request(app)
      .patch(`/api/print/printers/${printer._id}/disabled`)
      .set(authHeader(admin))
      .send({ disabled: false, note: 'Réparée' });
    expect(enableRes.body.data.status).toBe(PRINTER_STATUSES.IDLE);
  });
});

describe('GET /api/print/printers/:id/qr', () => {
  it('returns a PNG image for an admin', async () => {
    const admin = await createAdmin();
    const printer = await Printer.create({ name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const res = await request(app)
      .get(`/api/print/printers/${printer._id}/qr`)
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });
});
