const request = require('supertest');
const app = require('../../../app');
const Printer = require('../../../models/Printer');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');
const { createPrinter, whitelistEmail } = require('../../helpers/print');

describe('PUT /api/print/printers/:id/spool-slots/:gate/manual', () => {
  it('returns 401 without auth', async () => {
    const { printer } = await createPrinter({ spoolSlots: [{ gate: 0, material: '', color: '', empty: true }] });
    const res = await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/0/manual`)
      .send({ material: 'PLA', color: '#ffffff' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for a student who is not whitelisted and not an admin', async () => {
    const student = await createUser({ email: 'not-whitelisted@epitech.eu' });
    const { printer } = await createPrinter({ spoolSlots: [{ gate: 0, material: '', color: '', empty: true }] });

    const res = await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/0/manual`)
      .set(authHeader(student))
      .send({ material: 'PLA', color: '#ffffff' });

    expect(res.status).toBe(403);
  });

  it('lets a whitelisted student declare a gate manually', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }],
      spoolSlotsUpdatedAt: new Date(),
    });

    const res = await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/0/manual`)
      .set(authHeader(student))
      .send({ material: 'Blanc générique', color: '#ffffff' });

    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('manual');
    expect(res.body.data.material).toBe('Blanc générique');

    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.spoolSlots[0].source).toBe('manual');
    expect(reloaded.spoolSlots[0].autoMaterialAtSet).toBe('PLA');
    expect(reloaded.spoolSlots[0].autoColorAtSet).toBe('212721FF');
    expect(reloaded.spoolSlots[0].manualSetBy.email).toBe('ok@epitech.eu');
  });

  it('lets an admin declare a gate manually even when not whitelisted', async () => {
    const admin = await createAdmin();
    const { printer } = await createPrinter({ spoolSlots: [{ gate: 0, material: '', color: '', empty: true }] });

    const res = await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/0/manual`)
      .set(authHeader(admin))
      .send({ material: 'PETG', color: '#ff0000' });

    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('manual');
  });

  it('preserves the original drift-detection snapshot when correcting an existing manual declaration', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }],
    });

    await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/0/manual`)
      .set(authHeader(student))
      .send({ material: 'Blanc générique', color: '#ffffff' });

    // Correction : ne doit PAS re-capturer la valeur manuelle précédente comme référence de dérive.
    const res = await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/0/manual`)
      .set(authHeader(student))
      .send({ material: 'Blanc mat', color: '#f5f5f5' });

    expect(res.status).toBe(200);
    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.spoolSlots[0].material).toBe('Blanc mat');
    expect(reloaded.spoolSlots[0].autoMaterialAtSet).toBe('PLA');
    expect(reloaded.spoolSlots[0].autoColorAtSet).toBe('212721FF');
  });

  it('returns 400 when material or color is missing', async () => {
    const admin = await createAdmin();
    const { printer } = await createPrinter({ spoolSlots: [{ gate: 0, material: '', color: '', empty: true }] });

    const res = await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/0/manual`)
      .set(authHeader(admin))
      .send({ material: 'PLA' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when material is longer than 64 characters', async () => {
    const admin = await createAdmin();
    const { printer } = await createPrinter({ spoolSlots: [{ gate: 0, material: '', color: '', empty: true }] });

    const res = await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/0/manual`)
      .set(authHeader(admin))
      .send({ material: 'A'.repeat(65), color: '#ffffff' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when material is not a string (e.g. an array)', async () => {
    const admin = await createAdmin();
    const { printer } = await createPrinter({ spoolSlots: [{ gate: 0, material: '', color: '', empty: true }] });

    const res = await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/0/manual`)
      .set(authHeader(admin))
      .send({ material: ['PLA'], color: '#ffffff' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when color is not a valid hex color', async () => {
    const admin = await createAdmin();
    const { printer } = await createPrinter({ spoolSlots: [{ gate: 0, material: '', color: '', empty: true }] });

    const res = await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/0/manual`)
      .set(authHeader(admin))
      .send({ material: 'PLA', color: 'notacolor' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown printer', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .put('/api/print/printers/000000000000000000000000/spool-slots/0/manual')
      .set(authHeader(admin))
      .send({ material: 'PLA', color: '#ffffff' });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a gate not present in spoolSlots', async () => {
    const admin = await createAdmin();
    const { printer } = await createPrinter({ spoolSlots: [{ gate: 0, material: '', color: '', empty: true }] });

    const res = await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/2/manual`)
      .set(authHeader(admin))
      .send({ material: 'PLA', color: '#ffffff' });

    expect(res.status).toBe(404);
  });
});
