const request = require('supertest');
const app = require('../../../app');
const PrintJob = require('../../../models/PrintJob');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');
const { createPrinter, whitelistEmail } = require('../../helpers/print');

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
