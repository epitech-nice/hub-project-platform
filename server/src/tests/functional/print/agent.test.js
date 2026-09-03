const request = require('supertest');
const app = require('../../../app');
const PrintJob = require('../../../models/PrintJob');
const Printer = require('../../../models/Printer');
const { createUser } = require('../../helpers/auth');
const { createPrinter, whitelistEmail, printerAuthHeader } = require('../../helpers/print');
const { PRINTER_STATUSES } = require('../../../utils/constants');

const submitAcceptedJob = async (printer) => {
  const student = await createUser({ email: 'ok@epitech.eu' });
  await whitelistEmail(student.email);
  const { authHeader } = require('../../helpers/auth');
  const res = await request(app)
    .post('/api/print/jobs')
    .set(authHeader(student))
    .field('printerId', printer._id.toString())
    .attach('file', Buffer.from('G1 X10\n'), 'part.gcode');
  return res.body.data;
};

describe('GET /api/print/agent/next-job', () => {
  it('returns 401 without printer auth headers', async () => {
    const res = await request(app).get('/api/print/agent/next-job');
    expect(res.status).toBe(401);
  });

  it('returns null when there is no job for this printer', async () => {
    const { printer, rawKey } = await createPrinter();
    const res = await request(app)
      .get('/api/print/agent/next-job')
      .set(printerAuthHeader(printer._id, rawKey));
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('dispatches the queued job for this printer and marks it sent', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);

    const res = await request(app)
      .get('/api/print/agent/next-job')
      .set(printerAuthHeader(printer._id, rawKey));

    expect(res.status).toBe(200);
    expect(res.body.data.jobId).toBe(job._id);
    expect(res.body.data.fileName).toBe('part.gcode');
    expect(res.body.data.downloadUrl).toMatch(new RegExp(`/api/print/agent/jobs/${job._id}/file`));

    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.status).toBe('sent');
  });

  it('does not re-dispatch a job already sent', async () => {
    const { printer, rawKey } = await createPrinter();
    await submitAcceptedJob(printer);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const second = await request(app)
      .get('/api/print/agent/next-job')
      .set(printerAuthHeader(printer._id, rawKey));
    expect(second.body.data).toBeNull();
  });
});
