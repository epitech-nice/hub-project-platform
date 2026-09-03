const request = require('supertest');
const app = require('../../../app');
const Printer = require('../../../models/Printer');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');
const { PRINTER_STATUSES } = require('../../../utils/constants');

describe('POST /api/print/printers/:id/confirm-clearance', () => {
  it('returns 400 if the printer is not awaiting_clearance', async () => {
    const student = await createUser();
    const printer = await Printer.create({ name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64), status: PRINTER_STATUSES.IDLE });

    const res = await request(app)
      .post(`/api/print/printers/${printer._id}/confirm-clearance`)
      .set(authHeader(student));
    expect(res.status).toBe(400);
  });

  it('confirms clearance for any authenticated user and logs identity', async () => {
    const student = await createUser({ name: 'Jean Dupont', email: 'jean@epitech.eu' });
    const printer = await Printer.create({ name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64), status: PRINTER_STATUSES.AWAITING_CLEARANCE });

    const res = await request(app)
      .post(`/api/print/printers/${printer._id}/confirm-clearance`)
      .set(authHeader(student));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(PRINTER_STATUSES.IDLE);

    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.status).toBe(PRINTER_STATUSES.IDLE);
    expect(reloaded.clearanceHistory).toHaveLength(1);
    expect(reloaded.clearanceHistory[0].method).toBe('qr');
    expect(reloaded.clearanceHistory[0].byEmail).toBe('jean@epitech.eu');
  });
});

describe('POST /api/print/printers/:id/confirm-clearance/override', () => {
  it('returns 403 for a non-admin', async () => {
    const student = await createUser();
    const printer = await Printer.create({ name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64), status: PRINTER_STATUSES.AWAITING_CLEARANCE });
    const res = await request(app)
      .post(`/api/print/printers/${printer._id}/confirm-clearance/override`)
      .set(authHeader(student));
    expect(res.status).toBe(403);
  });

  it('confirms clearance as admin_override', async () => {
    const admin = await createAdmin();
    const printer = await Printer.create({ name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64), status: PRINTER_STATUSES.AWAITING_CLEARANCE });

    const res = await request(app)
      .post(`/api/print/printers/${printer._id}/confirm-clearance/override`)
      .set(authHeader(admin));

    expect(res.status).toBe(200);
    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.clearanceHistory[0].method).toBe('admin_override');
  });
});
