const request = require('supertest');
const app = require('../../app');
const Tool = require('../../models/Tool');
const ToolReport = require('../../models/ToolReport');
const { createAdmin, createUser, authHeader } = require('../helpers/auth');

describe('ToolReport API', () => {
  let tool;

  beforeEach(async () => {
    tool = await Tool.create({ name: 'Test Tool', quantity: 2 });
  });

  // ── POST /api/tools/:id/report ─────────────────────────────────────────────
  describe('POST /api/tools/:id/report', () => {
    it('creates a report — 201', async () => {
      const student = await createUser();
      const res = await request(app)
        .post(`/api/tools/${tool._id}/report`)
        .set(authHeader(student))
        .send({ category: 'broken' });

      expect(res.status).toBe(201);
      expect(res.body.data.category).toBe('broken');
      expect(res.body.data.status).toBe('open');
    });

    it('creates a report with optional message — 201', async () => {
      const student = await createUser();
      const res = await request(app)
        .post(`/api/tools/${tool._id}/report`)
        .set(authHeader(student))
        .send({ category: 'missing', message: 'Il manque 2 câbles' });

      expect(res.status).toBe(201);
      expect(res.body.data.message).toBe('Il manque 2 câbles');
    });

    it('returns 401 without token', async () => {
      const res = await request(app)
        .post(`/api/tools/${tool._id}/report`)
        .send({ category: 'broken' });
      expect(res.status).toBe(401);
    });

    it('returns 404 for unknown tool', async () => {
      const student = await createUser();
      const res = await request(app)
        .post('/api/tools/000000000000000000000001/report')
        .set(authHeader(student))
        .send({ category: 'broken' });
      expect(res.status).toBe(404);
    });

    it('returns 400 for missing category', async () => {
      const student = await createUser();
      const res = await request(app)
        .post(`/api/tools/${tool._id}/report`)
        .set(authHeader(student))
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid category', async () => {
      const student = await createUser();
      const res = await request(app)
        .post(`/api/tools/${tool._id}/report`)
        .set(authHeader(student))
        .send({ category: 'exploded' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when message exceeds 100 chars', async () => {
      const student = await createUser();
      const res = await request(app)
        .post(`/api/tools/${tool._id}/report`)
        .set(authHeader(student))
        .send({ category: 'broken', message: 'a'.repeat(101) });
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/tools/:id/reports ─────────────────────────────────────────────
  describe('GET /api/tools/:id/reports', () => {
    it('returns reports for admin — 200', async () => {
      const admin = await createAdmin();
      await ToolReport.create({
        tool:     tool._id,
        student:  { userId: admin._id, name: admin.name, email: admin.email },
        category: 'broken',
      });

      const res = await request(app)
        .get(`/api/tools/${tool._id}/reports`)
        .set(authHeader(admin));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].category).toBe('broken');
    });

    it('returns 403 for non-admin', async () => {
      const student = await createUser();
      const res = await request(app)
        .get(`/api/tools/${tool._id}/reports`)
        .set(authHeader(student));
      expect(res.status).toBe(403);
    });

    it('returns 404 for unknown tool', async () => {
      const admin = await createAdmin();
      const res = await request(app)
        .get('/api/tools/000000000000000000000001/reports')
        .set(authHeader(admin));
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /api/tools/:id/reports/:reportId/resolve ────────────────────────
  describe('PATCH /api/tools/:id/reports/:reportId/resolve', () => {
    it('resolves a report with message — 200', async () => {
      const admin = await createAdmin();
      const report = await ToolReport.create({
        tool:     tool._id,
        student:  { userId: admin._id, name: admin.name, email: admin.email },
        category: 'broken',
      });

      const res = await request(app)
        .patch(`/api/tools/${tool._id}/reports/${report._id}/resolve`)
        .set(authHeader(admin))
        .send({ resolveMessage: 'Pièce remplacée' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('resolved');
      expect(res.body.data.resolveMessage).toBe('Pièce remplacée');
      expect(res.body.data.resolvedBy.name).toBe(admin.name);
      expect(res.body.data.resolvedAt).toBeDefined();
    });

    it('resolves a report without message — 200', async () => {
      const admin = await createAdmin();
      const report = await ToolReport.create({
        tool:     tool._id,
        student:  { userId: admin._id, name: admin.name, email: admin.email },
        category: 'missing',
      });

      const res = await request(app)
        .patch(`/api/tools/${tool._id}/reports/${report._id}/resolve`)
        .set(authHeader(admin))
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('resolved');
    });

    it('returns 400 when report is already resolved', async () => {
      const admin = await createAdmin();
      const report = await ToolReport.create({
        tool:       tool._id,
        student:    { userId: admin._id, name: admin.name, email: admin.email },
        category:   'broken',
        status:     'resolved',
        resolvedBy: { userId: admin._id, name: admin.name },
        resolvedAt: new Date(),
      });

      const res = await request(app)
        .patch(`/api/tools/${tool._id}/reports/${report._id}/resolve`)
        .set(authHeader(admin))
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown report', async () => {
      const admin = await createAdmin();
      const res = await request(app)
        .patch(`/api/tools/${tool._id}/reports/000000000000000000000001/resolve`)
        .set(authHeader(admin))
        .send({});
      expect(res.status).toBe(404);
    });

    it('returns 403 for non-admin', async () => {
      const student = await createUser();
      const admin = await createAdmin();
      const report = await ToolReport.create({
        tool:     tool._id,
        student:  { userId: admin._id, name: admin.name, email: admin.email },
        category: 'broken',
      });

      const res = await request(app)
        .patch(`/api/tools/${tool._id}/reports/${report._id}/resolve`)
        .set(authHeader(student))
        .send({});

      expect(res.status).toBe(403);
    });
  });
});
