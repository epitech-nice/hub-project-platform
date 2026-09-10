const request = require('supertest');
const fs = require('fs');
const app = require('../../../app');
const PrintJob = require('../../../models/PrintJob');
const Printer = require('../../../models/Printer');
const PendingPrintUpload = require('../../../models/PendingPrintUpload');
const { createUser, authHeader } = require('../../helpers/auth');
const { createPrinter, whitelistEmail } = require('../../helpers/print');
const PrintAuthorization = require('../../../models/PrintAuthorization');
const { PRINTER_STATUSES } = require('../../../utils/constants');

const MONO_GCODE = 'G28\nG1 X10 Y10\nM104 S200\n';
const MULTI_GCODE = [
  '; filament_colour = #FF6A14;#FED141;#F40031;#212721',
  '; filament_type = PLA;PLA;PETG;PLA',
  'G28',
  'T0',
  'G1 X10',
].join('\n');

const analyze = (student, printer, gcode = MONO_GCODE, filename = 'part.gcode') =>
  request(app)
    .post('/api/print/jobs/analyze')
    .set(authHeader(student))
    .field('printerId', printer._id.toString())
    .attach('file', Buffer.from(gcode), filename);

describe('POST /api/print/jobs/:pendingUploadId/confirm', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/print/jobs/000000000000000000000000/confirm').send({});
    expect(res.status).toBe(401);
  });

  it('returns 410 for an unknown/expired pendingUploadId', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    const res = await request(app)
      .post('/api/print/jobs/000000000000000000000000/confirm')
      .set(authHeader(student))
      .send({});
    expect(res.status).toBe(410);
  });

  it("returns 403 when confirming another student's pending upload", async () => {
    const owner = await createUser({ email: 'owner@epitech.eu' });
    const intruder = await createUser({ email: 'intruder@epitech.eu' });
    await whitelistEmail(owner.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }],
      spoolSlotsUpdatedAt: new Date(),
    });
    const analyzeRes = await analyze(owner, printer);

    const res = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(intruder))
      .send({ selectedGate: 0 });
    expect(res.status).toBe(403);
  });

  it('creates a queued PrintJob with the selected gate and locks the printer (mono-material)', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [
        { gate: 0, material: 'PLA', color: '212721FF', empty: false },
        { gate: 1, material: '', color: '', empty: true },
      ],
      spoolSlotsUpdatedAt: new Date(),
    });
    const analyzeRes = await analyze(student, printer);

    const res = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({ selectedGate: 0 });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('queued');
    expect(res.body.data.selectedGate).toBe(0);
    expect(res.body.data.gcodeMode).toBe('single');
    expect(fs.existsSync(res.body.data.filePath)).toBe(true);

    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.status).toBe(PRINTER_STATUSES.PRINTING);
    expect(reloadedPrinter.currentJob.toString()).toBe(res.body.data._id);

    expect(await PendingPrintUpload.findById(analyzeRes.body.data.pendingUploadId)).toBeNull();
  });

  it('rejects a mono-material confirm without selectedGate when spool data exists', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }],
      spoolSlotsUpdatedAt: new Date(),
    });
    const analyzeRes = await analyze(student, printer);

    const res = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects selecting an empty gate', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 1, material: '', color: '', empty: true }],
      spoolSlotsUpdatedAt: new Date(),
    });
    const analyzeRes = await analyze(student, printer);

    const res = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({ selectedGate: 1 });
    expect(res.status).toBe(400);
  });

  it('blocks confirm when no spool data has ever been received, unless overridden', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter(); // spoolSlotsUpdatedAt reste null par défaut
    const analyzeRes = await analyze(student, printer);

    const blocked = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({});
    expect(blocked.status).toBe(400);

    const overridden = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({ overrideNoSpoolData: true });
    expect(overridden.status).toBe(201);
    expect(overridden.body.data.selectedGate).toBeNull();
    expect(overridden.body.data.slotSelectionOverridden).toBe(true);
  });

  it('confirms a multi-material upload without requiring selectedGate, carrying over mismatches', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 0, material: 'PETG', color: '000000FF', empty: false }],
      spoolSlotsUpdatedAt: new Date(),
    });
    const analyzeRes = await analyze(student, printer, MULTI_GCODE);
    expect(analyzeRes.body.data.mismatches).toHaveLength(1); // T0 attend PLA, slot 0 a du PETG

    const res = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.data.selectedGate).toBeNull();
    expect(res.body.data.slotMismatchWarnings).toHaveLength(1);
  });

  it('creates a rejected PrintJob when the printer is busy at confirm time', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }],
      spoolSlotsUpdatedAt: new Date(),
    });
    const analyzeRes = await analyze(student, printer);

    // L'imprimante devient occupée entre l'analyse et la confirmation.
    await Printer.findByIdAndUpdate(printer._id, { status: PRINTER_STATUSES.PRINTING });

    const res = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({ selectedGate: 0 });

    expect(res.status).toBe(409);
    const jobs = await PrintJob.find({ 'student.email': student.email });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('rejected');
    expect(jobs[0].rejectionReason).toBe('printer_busy');
  });

  it('creates a rejected PrintJob when whitelist authorization is revoked between analyze and confirm', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }],
      spoolSlotsUpdatedAt: new Date(),
    });
    const analyzeRes = await analyze(student, printer);

    // L'autorisation est révoquée entre l'analyse et la confirmation.
    await PrintAuthorization.findOneAndUpdate({ email: student.email }, { authorized: false });

    const res = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({ selectedGate: 0 });

    expect(res.status).toBe(403);
    const jobs = await PrintJob.find({ 'student.email': student.email });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('rejected');
    expect(jobs[0].rejectionReason).toBe('not_authorized');

    expect(await PendingPrintUpload.findById(analyzeRes.body.data.pendingUploadId)).toBeNull();
  });

  it('lets only one of two concurrent confirms on the same idle printer win the atomic lock', async () => {
    const studentA = await createUser({ email: 'racer-a@epitech.eu' });
    const studentB = await createUser({ email: 'racer-b@epitech.eu' });
    await whitelistEmail(studentA.email);
    await whitelistEmail(studentB.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }],
      spoolSlotsUpdatedAt: new Date(),
    });

    // Les deux analyses réussissent (aucun verrou posé par /analyze) — seule la confirmation
    // pose le verrou atomique, donc les deux pending uploads coexistent avant la course.
    const analyzeResA = await analyze(studentA, printer, MONO_GCODE, 'a.gcode');
    const analyzeResB = await analyze(studentB, printer, MONO_GCODE, 'b.gcode');

    const confirm = (student, pendingUploadId) =>
      request(app)
        .post(`/api/print/jobs/${pendingUploadId}/confirm`)
        .set(authHeader(student))
        .send({ selectedGate: 0 });

    const [resA, resB] = await Promise.all([
      confirm(studentA, analyzeResA.body.data.pendingUploadId),
      confirm(studentB, analyzeResB.body.data.pendingUploadId),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const winner = resA.status === 201 ? resA : resB;
    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.status).toBe(PRINTER_STATUSES.PRINTING);
    expect(reloadedPrinter.currentJob.toString()).toBe(winner.body.data._id);

    const jobs = await PrintJob.find({ printer: printer._id }).sort({ submittedAt: 1 });
    expect(jobs).toHaveLength(2);
    const statusesInDb = jobs.map((j) => j.status).sort();
    expect(statusesInDb).toEqual(['queued', 'rejected']);
    const rejectedJob = jobs.find((j) => j.status === 'rejected');
    expect(rejectedJob.rejectionReason).toBe('printer_busy');

    // Les deux PendingPrintUpload sont supprimés (gagnant : chemin de succès ; perdant : verrou
    // atomique échoué après création du job, même traitement que le gagnant côté nettoyage).
    expect(await PendingPrintUpload.findById(analyzeResA.body.data.pendingUploadId)).toBeNull();
    expect(await PendingPrintUpload.findById(analyzeResB.body.data.pendingUploadId)).toBeNull();
  });
});
