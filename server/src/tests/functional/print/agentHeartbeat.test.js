const request = require('supertest');
const app = require('../../../app');
const Printer = require('../../../models/Printer');
const PrintJob = require('../../../models/PrintJob');
const { generateApiKey } = require('../../../utils/apiKey');

describe('GET /api/print/agent/heartbeat', () => {
  it('returns 401 with no auth headers', async () => {
    const res = await request(app).get('/api/print/agent/heartbeat');
    expect(res.status).toBe(401);
  });

  it('returns 200 with a valid printer and updates lastSeenAt', async () => {
    const { rawKey, hash } = generateApiKey();
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: hash });
    const before = printer.lastSeenAt;

    const res = await request(app)
      .get('/api/print/agent/heartbeat')
      .set('x-printer-id', printer._id.toString())
      .set('x-api-key', rawKey);

    expect(res.status).toBe(200);
    expect(res.body.cancelRequested).toBe(false);

    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.lastSeenAt).not.toBeNull();
    expect(reloaded.lastSeenAt).not.toEqual(before);
    expect(Date.now() - reloaded.lastSeenAt.getTime()).toBeLessThan(5000);
  });

  it('reports cancelRequested false when there is no current job', async () => {
    const { rawKey, hash } = generateApiKey();
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: hash });

    const res = await request(app)
      .get('/api/print/agent/heartbeat')
      .set('x-printer-id', printer._id.toString())
      .set('x-api-key', rawKey);

    expect(res.body.cancelRequested).toBe(false);
  });

  it('reports cancelRequested true when the current job has a pending cancellation', async () => {
    const { rawKey, hash } = generateApiKey();
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: hash });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'S' },
      printer: printer._id,
      fileName: 'a.gcode',
      filePath: '/a',
      status: 'printing',
      cancelRequestedAt: new Date(),
    });
    printer.currentJob = job._id;
    await printer.save();

    const res = await request(app)
      .get('/api/print/agent/heartbeat')
      .set('x-printer-id', printer._id.toString())
      .set('x-api-key', rawKey);

    expect(res.body.cancelRequested).toBe(true);
  });

  it('reports cancelRequested false once the job is already cancelled', async () => {
    const { rawKey, hash } = generateApiKey();
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: hash });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'S' },
      printer: printer._id,
      fileName: 'a.gcode',
      filePath: '/a',
      status: 'cancelled',
      cancelRequestedAt: new Date(),
    });
    printer.currentJob = job._id;
    await printer.save();

    const res = await request(app)
      .get('/api/print/agent/heartbeat')
      .set('x-printer-id', printer._id.toString())
      .set('x-api-key', rawKey);

    expect(res.body.cancelRequested).toBe(false);
  });
});
