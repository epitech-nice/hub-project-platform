const request = require('supertest');
const app = require('../../../app');
const PrintJob = require('../../../models/PrintJob');
const Printer = require('../../../models/Printer');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');
const { createPrinter, whitelistEmail, printerAuthHeader } = require('../../helpers/print');
const { PRINTER_STATUSES } = require('../../../utils/constants');

const submitAcceptedJob = async (printer, student) => {
  const res = await request(app)
    .post('/api/print/jobs')
    .set(authHeader(student))
    .field('printerId', printer._id.toString())
    .attach('file', Buffer.from('G1 X10\n'), 'part.gcode');
  return res.body.data;
};

describe('POST /api/print/jobs/:id/cancel', () => {
  it('returns 401 without auth', async () => {
    const { printer } = await createPrinter();
    const job = await PrintJob.create({
      student: { email: 'a@epitech.eu', name: 'A' },
      printer: printer._id,
      fileName: 'a.gcode',
      filePath: '/a',
    });
    const res = await request(app).post(`/api/print/jobs/${job._id}/cancel`);
    expect(res.status).toBe(401);
  });

  it("returns 403 when a student tries to cancel another student's job", async () => {
    const owner = await createUser({ email: 'owner@epitech.eu' });
    const intruder = await createUser({ email: 'intruder@epitech.eu' });
    const { printer } = await createPrinter();
    const job = await PrintJob.create({
      student: { email: owner.email, name: owner.name },
      printer: printer._id,
      fileName: 'a.gcode',
      filePath: '/a',
      status: 'queued',
    });

    const res = await request(app).post(`/api/print/jobs/${job._id}/cancel`).set(authHeader(intruder));
    expect(res.status).toBe(403);
  });

  it('cancels a queued job synchronously and frees the printer', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter();
    const job = await submitAcceptedJob(printer, student);

    const res = await request(app).post(`/api/print/jobs/${job._id}/cancel`).set(authHeader(student));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.cancelledBy.email).toBe(student.email);

    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.status).toBe(PRINTER_STATUSES.IDLE);
    expect(reloadedPrinter.currentJob).toBeNull();
  });

  it('lets an admin cancel any queued job', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const admin = await createAdmin();
    const { printer } = await createPrinter();
    const job = await submitAcceptedJob(printer, student);

    const res = await request(app).post(`/api/print/jobs/${job._id}/cancel`).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });

  it('requests cancellation asynchronously for a sent job without changing its status yet', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer, student);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const res = await request(app).post(`/api/print/jobs/${job._id}/cancel`).set(authHeader(student));
    expect(res.status).toBe(202);
    expect(res.body.data.status).toBe('sent');

    const reloaded = await PrintJob.findById(job._id);
    expect(reloaded.status).toBe('sent');
    expect(reloaded.cancelRequestedAt).not.toBeNull();
    expect(reloaded.cancelledBy.email).toBe(student.email);
  });

  it('is a no-op on a second cancel request for the same in-progress job', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer, student);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const first = await request(app).post(`/api/print/jobs/${job._id}/cancel`).set(authHeader(student));
    expect(first.status).toBe(202);
    const firstReload = await PrintJob.findById(job._id);

    const second = await request(app).post(`/api/print/jobs/${job._id}/cancel`).set(authHeader(student));
    expect(second.status).toBe(202);

    const secondReload = await PrintJob.findById(job._id);
    expect(secondReload.cancelRequestedAt.getTime()).toBe(firstReload.cancelRequestedAt.getTime());
    expect(secondReload.history.length).toBe(firstReload.history.length);
  });

  it('rejects cancelling a job already in a terminal state', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    const { printer } = await createPrinter();
    const job = await PrintJob.create({
      student: { email: student.email, name: student.name },
      printer: printer._id,
      fileName: 'a.gcode',
      filePath: '/a',
      status: 'completed',
    });

    const res = await request(app).post(`/api/print/jobs/${job._id}/cancel`).set(authHeader(student));
    expect(res.status).toBe(400);
  });
});
