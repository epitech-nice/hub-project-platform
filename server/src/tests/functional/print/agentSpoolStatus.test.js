const request = require('supertest');
const app = require('../../../app');
const Printer = require('../../../models/Printer');
const { createPrinter, printerAuthHeader } = require('../../helpers/print');

describe('POST /api/print/agent/spool-status', () => {
  it('returns 401 without printer auth headers', async () => {
    const res = await request(app).post('/api/print/agent/spool-status').send({ gates: [] });
    expect(res.status).toBe(401);
  });

  it('rejects a body without a gates array', async () => {
    const { printer, rawKey } = await createPrinter();
    const res = await request(app)
      .post('/api/print/agent/spool-status')
      .set(printerAuthHeader(printer._id, rawKey))
      .send({});
    expect(res.status).toBe(400);
  });

  it('stores the reported gates and sets spoolSlotsUpdatedAt', async () => {
    const { printer, rawKey } = await createPrinter();
    const gates = [
      { gate: 0, material: 'PLA', color: '212721FF', empty: false },
      { gate: 1, material: '', color: '', empty: true },
      { gate: 2, material: 'PETG', color: 'F40031FF', empty: false },
      { gate: 3, material: 'PLA', color: 'FED141FF', empty: false },
    ];

    const res = await request(app)
      .post('/api/print/agent/spool-status')
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ gates });

    expect(res.status).toBe(200);

    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.spoolSlots).toHaveLength(4);
    expect(reloaded.spoolSlots[1].empty).toBe(true);
    expect(reloaded.spoolSlotsUpdatedAt).not.toBeNull();
  });

  it('preserves a manual declaration across a tick when the auto-reported value is unchanged', async () => {
    const { printer, rawKey } = await createPrinter({
      spoolSlots: [
        {
          gate: 0,
          material: 'Blanc générique',
          color: 'ffffff',
          empty: false,
          source: 'manual',
          manualSetBy: { email: 's@epitech.eu', name: 'Student' },
          manualSetAt: new Date(),
          autoMaterialAtSet: 'PLA',
          autoColorAtSet: '212721FF',
          autoEmptyAtSet: false,
        },
      ],
    });

    const res = await request(app)
      .post('/api/print/agent/spool-status')
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ gates: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }] });

    expect(res.status).toBe(200);
    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.spoolSlots[0].source).toBe('manual');
    expect(reloaded.spoolSlots[0].material).toBe('Blanc générique');
  });

  it('clears a manual declaration when a new auto-detection reports a different value', async () => {
    const { printer, rawKey } = await createPrinter({
      spoolSlots: [
        {
          gate: 0,
          material: 'Blanc générique',
          color: 'ffffff',
          empty: false,
          source: 'manual',
          manualSetBy: { email: 's@epitech.eu', name: 'Student' },
          manualSetAt: new Date(),
          autoMaterialAtSet: 'PLA',
          autoColorAtSet: '212721FF',
          autoEmptyAtSet: false,
        },
      ],
    });

    const res = await request(app)
      .post('/api/print/agent/spool-status')
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ gates: [{ gate: 0, material: 'PETG', color: 'AABBCCFF', empty: false }] });

    expect(res.status).toBe(200);
    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.spoolSlots[0].source).toBe('auto');
    expect(reloaded.spoolSlots[0].material).toBe('PETG');
  });
});
