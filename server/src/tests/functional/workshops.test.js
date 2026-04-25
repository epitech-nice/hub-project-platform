jest.mock('../../utils/backgroundJobs');
jest.mock('../../services/externalService');

const request = require('supertest');
const app = require('../../app');
const { createAdmin, createUser, authHeader } = require('../helpers/auth');

// ─────────────────────────────────────────────
// GET /api/workshops/stats
// ─────────────────────────────────────────────
describe('GET /api/workshops/stats', () => {
  it('admin gets all-time stats → 200', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .get('/api/workshops/stats')
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('total');
    expect(typeof res.body.data.total).toBe('number');
  });

  it('returns 0 total for a future school year → 200', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .get('/api/workshops/stats?schoolYear=2099-2100')
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
  });

  it('malformed schoolYear falls back to all-time → 200', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .get('/api/workshops/stats?schoolYear=invalid-year')
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(typeof res.body.data.total).toBe('number');
  });

  it('student cannot access stats → 403', async () => {
    const student = await createUser();
    const res = await request(app)
      .get('/api/workshops/stats')
      .set(authHeader(student));
    expect(res.status).toBe(403);
  });
});
