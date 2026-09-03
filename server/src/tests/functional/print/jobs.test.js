const request = require('supertest');
const fs = require('fs');
const app = require('../../../app');
const Printer = require('../../../models/Printer');
const PrintJob = require('../../../models/PrintJob');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');
const { createPrinter, whitelistEmail } = require('../../helpers/print');
const { PRINTER_STATUSES } = require('../../../utils/constants');

// fs.unlink on the rejection paths is fire-and-forget; poll briefly instead of asserting
// the file is gone the instant the HTTP response comes back.
const expectFileEventuallyRemoved = async (filePath) => {
  const deadline = Date.now() + 500;
  while (Date.now() < deadline) {
    if (!fs.existsSync(filePath)) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  expect(fs.existsSync(filePath)).toBe(false);
};

describe('POST /api/print/jobs', () => {
  it('rejects a non-whitelisted student with 403 and logs the attempt', async () => {
    const student = await createUser({ email: 'not-whitelisted@epitech.eu' });
    const { printer } = await createPrinter();

    const res = await request(app)
      .post('/api/print/jobs')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from('G1 X10\n'), 'part.gcode');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/autoris/i);

    const jobs = await PrintJob.find({ 'student.email': student.email });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('rejected');
    expect(jobs[0].rejectionReason).toBe('not_authorized');
    await expectFileEventuallyRemoved(jobs[0].filePath);
  });

  it('accepts a whitelisted student on an idle printer and locks the printer atomically', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter();

    const res = await request(app)
      .post('/api/print/jobs')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from('G1 X10\n'), 'part.gcode');

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('queued');

    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.status).toBe(PRINTER_STATUSES.PRINTING);
    expect(reloadedPrinter.currentJob.toString()).toBe(res.body.data._id);
  });

  it('rejects with printer_busy when the printer is already printing', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({ status: PRINTER_STATUSES.PRINTING });

    const res = await request(app)
      .post('/api/print/jobs')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from('G1 X10\n'), 'part.gcode');

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/occup/i);
    const job = await PrintJob.findOne({ 'student.email': student.email });
    expect(job.rejectionReason).toBe('printer_busy');
  });

  it('rejects with printer_offline when the printer is offline', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({ status: PRINTER_STATUSES.OFFLINE });

    const res = await request(app)
      .post('/api/print/jobs')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from('G1 X10\n'), 'part.gcode');

    expect(res.status).toBe(409);
    const job = await PrintJob.findOne({ 'student.email': student.email });
    expect(job.rejectionReason).toBe('printer_offline');
  });

  it('rejects with printer_disabled when the printer is disabled', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({ status: PRINTER_STATUSES.DISABLED });

    const res = await request(app)
      .post('/api/print/jobs')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from('G1 X10\n'), 'part.gcode');

    const job = await PrintJob.findOne({ 'student.email': student.email });
    expect(job.rejectionReason).toBe('printer_disabled');
  });

  it('lets only one of two concurrent submissions to the same idle printer win the lock', async () => {
    const studentA = await createUser({ email: 'racer-a@epitech.eu' });
    const studentB = await createUser({ email: 'racer-b@epitech.eu' });
    await whitelistEmail(studentA.email);
    await whitelistEmail(studentB.email);
    const { printer } = await createPrinter();

    const submit = (student) =>
      request(app)
        .post('/api/print/jobs')
        .set(authHeader(student))
        .field('printerId', printer._id.toString())
        .attach('file', Buffer.from('G1 X10\n'), 'part.gcode');

    const [resA, resB] = await Promise.all([submit(studentA), submit(studentB)]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const winner = resA.status === 201 ? resA : resB;
    const loser = resA.status === 201 ? resB : resA;
    expect(loser.body.error).toMatch(/occup/i);

    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.status).toBe(PRINTER_STATUSES.PRINTING);
    expect(reloadedPrinter.currentJob.toString()).toBe(winner.body.data._id);

    const jobs = await PrintJob.find({ printer: printer._id }).sort({ submittedAt: 1 });
    expect(jobs).toHaveLength(2);
    const statusesInDb = jobs.map((j) => j.status).sort();
    expect(statusesInDb).toEqual(['queued', 'rejected']);
    const rejectedJob = jobs.find((j) => j.status === 'rejected');
    expect(rejectedJob.rejectionReason).toBe('printer_busy');
    await expectFileEventuallyRemoved(rejectedJob.filePath);
  });

  it('rejects a non-.gcode file', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter();

    const res = await request(app)
      .post('/api/print/jobs')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from('not gcode'), 'part.txt');

    expect(res.status).toBe(400);
  });
});

describe('GET /api/print/jobs/me', () => {
  it("returns only the requesting student's jobs, newest first", async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const other = await createUser({ email: 'other@epitech.eu' });
    const { printer } = await createPrinter();

    await PrintJob.create({ student: { email: other.email, name: other.name }, printer: printer._id, fileName: 'x.gcode', filePath: '/x' });
    await PrintJob.create({ student: { email: student.email, name: student.name }, printer: printer._id, fileName: 'y.gcode', filePath: '/y' });

    const res = await request(app).get('/api/print/jobs/me').set(authHeader(student));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].fileName).toBe('y.gcode');
  });
});

describe('GET /api/print/jobs (admin)', () => {
  it('returns 403 for a student', async () => {
    const student = await createUser();
    const res = await request(app).get('/api/print/jobs').set(authHeader(student));
    expect(res.status).toBe(403);
  });

  it('lists all jobs for an admin, filterable by status', async () => {
    const admin = await createAdmin();
    const { printer } = await createPrinter();
    await PrintJob.create({ student: { email: 'a@epitech.eu', name: 'A' }, printer: printer._id, fileName: 'a.gcode', filePath: '/a', status: 'queued' });
    await PrintJob.create({ student: { email: 'b@epitech.eu', name: 'B' }, printer: printer._id, fileName: 'b.gcode', filePath: '/b', status: 'rejected', rejectionReason: 'not_authorized' });

    const all = await request(app).get('/api/print/jobs').set(authHeader(admin));
    expect(all.body.count).toBe(2);

    const onlyRejected = await request(app).get('/api/print/jobs?status=rejected').set(authHeader(admin));
    expect(onlyRejected.body.count).toBe(1);
    expect(onlyRejected.body.data[0].rejectionReason).toBe('not_authorized');
  });
});

describe('GET /api/print/jobs/:id (admin)', () => {
  it('returns the job with its history', async () => {
    const admin = await createAdmin();
    const { printer } = await createPrinter();
    const job = await PrintJob.create({ student: { email: 'a@epitech.eu', name: 'A' }, printer: printer._id, fileName: 'a.gcode', filePath: '/a' });

    const res = await request(app).get(`/api/print/jobs/${job._id}`).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.fileName).toBe('a.gcode');
  });

  it('returns 404 for an unknown id', async () => {
    const admin = await createAdmin();
    const res = await request(app).get('/api/print/jobs/000000000000000000000000').set(authHeader(admin));
    expect(res.status).toBe(404);
  });
});
