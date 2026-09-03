const request = require('supertest');
const app = require('../../../app');
const PrintAccessRequest = require('../../../models/PrintAccessRequest');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');

describe('POST /api/print/access-requests', () => {
  it('creates a pending request for the current user', async () => {
    const student = await createUser({ email: 'student@epitech.eu', name: 'Student' });

    const res = await request(app)
      .post('/api/print/access-requests')
      .set(authHeader(student));

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.student.email).toBe('student@epitech.eu');

    const stored = await PrintAccessRequest.find({ 'student.email': 'student@epitech.eu' });
    expect(stored).toHaveLength(1);
  });

  it('is idempotent: returns the existing pending request instead of duplicating it', async () => {
    const student = await createUser({ email: 'student@epitech.eu', name: 'Student' });

    const first = await request(app).post('/api/print/access-requests').set(authHeader(student));
    const second = await request(app).post('/api/print/access-requests').set(authHeader(student));

    expect(second.status).toBe(200);
    expect(second.body.data._id).toBe(first.body.data._id);

    const stored = await PrintAccessRequest.find({ 'student.email': 'student@epitech.eu' });
    expect(stored).toHaveLength(1);
  });

  it('allows a new request once the previous one was resolved', async () => {
    const student = await createUser({ email: 'student@epitech.eu', name: 'Student' });
    await PrintAccessRequest.create({
      student: { userId: student._id, name: student.name, email: student.email },
      status: 'resolved',
      resolvedAt: new Date(),
    });

    const res = await request(app).post('/api/print/access-requests').set(authHeader(student));

    expect(res.status).toBe(201);
    const stored = await PrintAccessRequest.find({ 'student.email': 'student@epitech.eu' });
    expect(stored).toHaveLength(2);
  });
});

describe('GET /api/print/access-requests', () => {
  it('returns 403 for a non-admin', async () => {
    const student = await createUser();
    const res = await request(app).get('/api/print/access-requests').set(authHeader(student));
    expect(res.status).toBe(403);
  });

  it('lists only pending requests for an admin', async () => {
    const admin = await createAdmin();
    await PrintAccessRequest.create({
      student: { userId: admin._id, name: 'A', email: 'a@epitech.eu' },
      status: 'pending',
    });
    await PrintAccessRequest.create({
      student: { userId: admin._id, name: 'B', email: 'b@epitech.eu' },
      status: 'resolved',
      resolvedAt: new Date(),
    });

    const res = await request(app).get('/api/print/access-requests').set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0].student.email).toBe('a@epitech.eu');
  });
});
