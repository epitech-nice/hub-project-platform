const request = require('supertest');
const app = require('../../../app');
const PendingPrintUpload = require('../../../models/PendingPrintUpload');
const { createUser, authHeader } = require('../../helpers/auth');
const { createPrinter, whitelistEmail } = require('../../helpers/print');

const MONO_GCODE = 'G28\nG1 X10 Y10\nM104 S200\n';
const MULTI_GCODE = [
  '; filament_colour = #FF6A14;#FED141;#F40031;#212721',
  '; filament_type = PLA;PLA;PETG;PLA',
  'G28',
  'T0',
  'G1 X10',
  'T2',
  'G1 X20',
].join('\n');

describe('POST /api/print/jobs/analyze', () => {
  it('returns 401 without auth', async () => {
    const { printer } = await createPrinter();
    const res = await request(app)
      .post('/api/print/jobs/analyze')
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from(MONO_GCODE), 'part.gcode');
    expect(res.status).toBe(401);
  });

  it('rejects a non-whitelisted student with 403 and creates no PendingPrintUpload', async () => {
    const student = await createUser({ email: 'not-whitelisted@epitech.eu' });
    const { printer } = await createPrinter();

    const res = await request(app)
      .post('/api/print/jobs/analyze')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from(MONO_GCODE), 'part.gcode');

    expect(res.status).toBe(403);
    expect(await PendingPrintUpload.countDocuments()).toBe(0);
  });

  it('detects mono-material mode and returns the printer current slots', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [
        { gate: 0, material: 'PLA', color: '212721FF', empty: false },
        { gate: 1, material: '', color: '', empty: true },
      ],
      spoolSlotsUpdatedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/print/jobs/analyze')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from(MONO_GCODE), 'part.gcode');

    expect(res.status).toBe(201);
    expect(res.body.data.mode).toBe('single');
    expect(res.body.data.slots).toHaveLength(2);
    expect(res.body.data.pendingUploadId).toBeDefined();

    const pending = await PendingPrintUpload.findById(res.body.data.pendingUploadId);
    expect(pending.gcodeMode).toBe('single');
    expect(pending.student.email).toBe(student.email);
  });

  it('detects multi-material mode and extracts expected tools', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [
        { gate: 0, material: 'PLA', color: 'FF6A14FF', empty: false },
        { gate: 2, material: 'PLA', color: 'F40031FF', empty: false },
      ],
      spoolSlotsUpdatedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/print/jobs/analyze')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from(MULTI_GCODE), 'part.gcode');

    expect(res.status).toBe(201);
    expect(res.body.data.mode).toBe('multi-material');
    expect(res.body.data.expectedTools).toEqual([
      { tool: 'T0', material: 'PLA', color: '#FF6A14' },
      { tool: 'T2', material: 'PETG', color: '#F40031' },
    ]);
    expect(res.body.data.mismatches).toBeUndefined();
  });

  it('rejects a non-.gcode file', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter();

    const res = await request(app)
      .post('/api/print/jobs/analyze')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from('not gcode'), 'part.txt');

    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown printer', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);

    const res = await request(app)
      .post('/api/print/jobs/analyze')
      .set(authHeader(student))
      .field('printerId', '000000000000000000000000')
      .attach('file', Buffer.from(MONO_GCODE), 'part.gcode');

    expect(res.status).toBe(404);
  });
});
