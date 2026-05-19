const request = require('supertest');
const app = require('../../app');
const Tool = require('../../models/Tool');
const { createAdmin, createUser, authHeader } = require('../helpers/auth');

describe('POST /api/tools/verify-inventory', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/tools/verify-inventory')
      .send({ rfids: ['AAAA0001'] });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const student = await createUser();
    const res = await request(app)
      .post('/api/tools/verify-inventory')
      .set(authHeader(student))
      .send({ rfids: ['AAAA0001'] });
    expect(res.status).toBe(403);
  });

  it('returns 400 when rfids array is empty', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .post('/api/tools/verify-inventory')
      .set(authHeader(admin))
      .send({ rfids: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when rfids is missing', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .post('/api/tools/verify-inventory')
      .set(authHeader(admin))
      .send({});
    expect(res.status).toBe(400);
  });

  it('classifies present, missing, and unknown correctly', async () => {
    const admin = await createAdmin();
    await Tool.create([
      { name: 'Outil A', rfid: 'AAAA0001' },
      { name: 'Outil B', rfid: 'BBBB0002' },
    ]);

    // AAAA0001 → present, BBBB0002 → missing, CCCC0003 → unknown
    const res = await request(app)
      .post('/api/tools/verify-inventory')
      .set(authHeader(admin))
      .send({ rfids: ['AAAA0001', 'CCCC0003'] });

    expect(res.status).toBe(200);
    expect(res.body.data.stats.expected).toBe(2);
    expect(res.body.data.stats.scanned).toBe(2);
    expect(res.body.data.stats.presentCount).toBe(1);
    expect(res.body.data.stats.missingCount).toBe(1);
    expect(res.body.data.stats.unknownCount).toBe(1);
    expect(res.body.data.present[0].rfid).toBe('AAAA0001');
    expect(res.body.data.missing[0].rfid).toBe('BBBB0002');
    expect(res.body.data.unknown).toEqual(['CCCC0003']);
  });

  it('filters expected tools by tag when tags param is provided', async () => {
    const admin = await createAdmin();
    await Tool.create([
      { name: 'Outil A', rfid: 'AAAA0001', tags: ['électronique'] },
      { name: 'Outil B', rfid: 'BBBB0002', tags: ['mécanique'] },
    ]);

    // tag filter = électronique → only AAAA0001 is in scope
    const res = await request(app)
      .post('/api/tools/verify-inventory')
      .set(authHeader(admin))
      .send({ rfids: ['AAAA0001'], tags: ['électronique'] });

    expect(res.status).toBe(200);
    expect(res.body.data.stats.expected).toBe(1);
    expect(res.body.data.present).toHaveLength(1);
    expect(res.body.data.missing).toHaveLength(0);
    expect(res.body.data.unknown).toHaveLength(0);
  });

  it('excludes tools without rfid from expected list', async () => {
    const admin = await createAdmin();
    await Tool.create([
      { name: 'Outil sans RFID' },
      { name: 'Outil avec RFID', rfid: 'AAAA0001' },
    ]);

    const res = await request(app)
      .post('/api/tools/verify-inventory')
      .set(authHeader(admin))
      .send({ rfids: ['AAAA0001'] });

    expect(res.status).toBe(200);
    expect(res.body.data.stats.expected).toBe(1);
    expect(res.body.data.present).toHaveLength(1);
    expect(res.body.data.missing).toHaveLength(0);
  });

  it('normalises rfids to uppercase before comparison', async () => {
    const admin = await createAdmin();
    await Tool.create({ name: 'Outil A', rfid: 'AAAA0001' });

    const res = await request(app)
      .post('/api/tools/verify-inventory')
      .set(authHeader(admin))
      .send({ rfids: ['aaaa0001'] }); // lowercase input

    expect(res.status).toBe(200);
    expect(res.body.data.present).toHaveLength(1);
  });
});
