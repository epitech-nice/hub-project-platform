const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../../app');
const Printer = require('../../../models/Printer');
const PrintJob = require('../../../models/PrintJob');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');
const { PRINTER_STATUSES, PRINT_JOB_STATUSES } = require('../../../utils/constants');
const { checkStalePrinters, OFFLINE_THRESHOLD_MS } = require('../../../utils/printerScheduler');
const { createPrinter, printerAuthHeader } = require('../../helpers/print');

describe('GET /api/print/printers', () => {
  it('returns 401 with no auth', async () => {
    const res = await request(app).get('/api/print/printers');
    expect(res.status).toBe(401);
  });

  it('lists printers for an authenticated student', async () => {
    const student = await createUser();
    await Printer.create({ name: 'Kobra 3 - A', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });

    const res = await request(app).get('/api/print/printers').set(authHeader(student));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Kobra 3 - A');
    expect(res.body.data[0].apiKeyHash).toBeUndefined();
  });
});

describe('POST /api/print/printers', () => {
  it('returns 403 for a non-admin', async () => {
    const student = await createUser();
    const res = await request(app)
      .post('/api/print/printers')
      .set(authHeader(student))
      .send({ name: 'Kobra 3 - B', model: 'kobra3' });
    expect(res.status).toBe(403);
  });

  it('creates a printer and returns the raw API key exactly once', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .post('/api/print/printers')
      .set(authHeader(admin))
      .send({ name: 'Kobra 3 Max - C', model: 'kobra3max' });

    expect(res.status).toBe(201);
    expect(res.body.data.printer.name).toBe('Kobra 3 Max - C');
    expect(typeof res.body.data.apiKey).toBe('string');
    expect(res.body.data.apiKey.length).toBeGreaterThan(20);

    const stored = await Printer.findById(res.body.data.printer._id);
    expect(stored.apiKeyHash).not.toBe(res.body.data.apiKey);
  });
});

describe('POST /api/print/printers/:id/regenerate-key', () => {
  it('invalidates the old key hash', async () => {
    const admin = await createAdmin();
    const created = await request(app)
      .post('/api/print/printers')
      .set(authHeader(admin))
      .send({ name: 'Kobra 3 - D', model: 'kobra3' });
    const printerId = created.body.data.printer._id;
    const oldHash = (await Printer.findById(printerId)).apiKeyHash;

    const res = await request(app)
      .post(`/api/print/printers/${printerId}/regenerate-key`)
      .set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(typeof res.body.data.apiKey).toBe('string');
    const reloaded = await Printer.findById(printerId);
    expect(reloaded.apiKeyHash).not.toBe(oldHash);
  });
});

describe('PATCH /api/print/printers/:id/disabled', () => {
  it('requires a note when disabling', async () => {
    const admin = await createAdmin();
    const printer = await Printer.create({ name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const res = await request(app)
      .patch(`/api/print/printers/${printer._id}/disabled`)
      .set(authHeader(admin))
      .send({ disabled: true });
    expect(res.status).toBe(400);
  });

  it('disables with a note, logs statusHistory, and re-enables back to idle', async () => {
    const admin = await createAdmin();
    const printer = await Printer.create({ name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });

    const disableRes = await request(app)
      .patch(`/api/print/printers/${printer._id}/disabled`)
      .set(authHeader(admin))
      .send({ disabled: true, note: 'Buse bouchée, en réparation' });
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.data.status).toBe(PRINTER_STATUSES.DISABLED);

    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.statusHistory).toHaveLength(1);
    expect(reloaded.statusHistory[0].source).toBe('admin_action');
    expect(reloaded.statusHistory[0].detail).toBe('Buse bouchée, en réparation');

    const enableRes = await request(app)
      .patch(`/api/print/printers/${printer._id}/disabled`)
      .set(authHeader(admin))
      .send({ disabled: false, note: 'Réparée' });
    expect(enableRes.body.data.status).toBe(PRINTER_STATUSES.IDLE);
  });

  it('clears currentJob when re-enabling a printer that had one set', async () => {
    const admin = await createAdmin();
    const printer = await Printer.create({
      name: 'P',
      model: 'kobra3',
      apiKeyHash: 'x'.repeat(64),
      status: PRINTER_STATUSES.AWAITING_CLEARANCE,
      currentJob: new mongoose.Types.ObjectId(),
    });

    const disableRes = await request(app)
      .patch(`/api/print/printers/${printer._id}/disabled`)
      .set(authHeader(admin))
      .send({ disabled: true, note: 'Maintenance' });
    expect(disableRes.status).toBe(200);

    const enableRes = await request(app)
      .patch(`/api/print/printers/${printer._id}/disabled`)
      .set(authHeader(admin))
      .send({ disabled: false, note: 'Réparée' });
    expect(enableRes.status).toBe(200);
    expect(enableRes.body.data.status).toBe(PRINTER_STATUSES.IDLE);

    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.currentJob).toBeNull();
  });

  it('requests async cancellation instead of orphaning a job that is actively printing, and the agent sees it via heartbeat', async () => {
    const admin = await createAdmin();
    const { printer, rawKey } = await createPrinter({ status: PRINTER_STATUSES.PRINTING });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'S' },
      printer: printer._id,
      fileName: 'a.gcode',
      filePath: '/tmp/a.gcode',
      status: PRINT_JOB_STATUSES.PRINTING,
    });
    await Printer.findByIdAndUpdate(printer._id, { currentJob: job._id });

    const res = await request(app)
      .patch(`/api/print/printers/${printer._id}/disabled`)
      .set(authHeader(admin))
      .send({ disabled: true, note: 'Maintenance urgente' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(PRINTER_STATUSES.DISABLED);

    // Le canal par lequel l'agent apprend la demande d'annulation est GET /agent/heartbeat, qui
    // ne consulte cancelRequestedAt que via req.printer.currentJob (voir agentController.js) —
    // c'est cette dépendance précise qui justifie de ne pas nuller currentJob ici.
    const heartbeatRes = await request(app)
      .get('/api/print/agent/heartbeat')
      .set(printerAuthHeader(printer._id, rawKey));
    expect(heartbeatRes.body.cancelRequested).toBe(true);

    // currentJob doit rester posé : GET /agent/heartbeat et POST /agent/jobs/:id/status ne
    // fonctionnent tous les deux qu'à travers req.printer.currentJob — le nuller couperait le
    // seul canal par lequel l'agent apprend la demande d'annulation et peut rapporter un statut
    // final, orphelinant le job pour de bon (voir revue 2026-09-21).
    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.currentJob.toString()).toBe(job._id.toString());

    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.cancelRequestedAt).not.toBeNull();
    expect(reloadedJob.status).toBe(PRINT_JOB_STATUSES.PRINTING);
  });

  it('refuses to re-enable a printer whose job is still pending cancellation', async () => {
    const admin = await createAdmin();
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'S' },
      printer: new mongoose.Types.ObjectId(),
      fileName: 'a.gcode',
      filePath: '/tmp/a.gcode',
      status: PRINT_JOB_STATUSES.PRINTING,
    });
    const printer = await Printer.create({
      name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64),
      status: PRINTER_STATUSES.DISABLED, currentJob: job._id,
    });

    const res = await request(app)
      .patch(`/api/print/printers/${printer._id}/disabled`)
      .set(authHeader(admin))
      .send({ disabled: false, note: 'Réparée' });

    expect(res.status).toBe(409);
    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.status).toBe(PRINTER_STATUSES.DISABLED);
  });

  it('cancels a still-queued job synchronously and frees the printer when disabling', async () => {
    const admin = await createAdmin();
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'S' },
      printer: new mongoose.Types.ObjectId(),
      fileName: 'a.gcode',
      filePath: '/tmp/a.gcode',
      status: PRINT_JOB_STATUSES.QUEUED,
    });
    const printer = await Printer.create({
      name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64),
      status: PRINTER_STATUSES.PRINTING, currentJob: job._id,
    });

    const res = await request(app)
      .patch(`/api/print/printers/${printer._id}/disabled`)
      .set(authHeader(admin))
      .send({ disabled: true, note: 'Maintenance' });

    expect(res.status).toBe(200);
    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.currentJob).toBeNull();

    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.status).toBe(PRINT_JOB_STATUSES.CANCELLED);
  });

  it('resolves a job whose agent never comes back after a mid-print disable, so re-enabling stays possible', async () => {
    // Régression pour le deadlock trouvé en revue 2026-09-22 : DISABLED était exclu de
    // checkStalePrinters, donc un job resté 'sent'/'printing' sur une imprimante désactivée en
    // cours d'impression puis jamais rallumée ne pouvait plus jamais être résolu — bloquant
    // setDisabled(false) avec un 409 permanent, sans aucune échappatoire côté API.
    const admin = await createAdmin();
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'S' },
      printer: new mongoose.Types.ObjectId(),
      fileName: 'a.gcode',
      filePath: '/tmp/a.gcode',
      status: PRINT_JOB_STATUSES.PRINTING,
    });
    const printer = await Printer.create({
      name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64),
      status: PRINTER_STATUSES.PRINTING, currentJob: job._id,
    });

    const disableRes = await request(app)
      .patch(`/api/print/printers/${printer._id}/disabled`)
      .set(authHeader(admin))
      .send({ disabled: true, note: 'Maintenance urgente' });
    expect(disableRes.status).toBe(200);

    // L'agent ne revient jamais (imprimante éteinte pour de bon) — simule le dépassement du
    // seuil de staleness plutôt que d'attendre OFFLINE_THRESHOLD_MS réel.
    await Printer.findByIdAndUpdate(printer._id, {
      lastSeenAt: new Date(Date.now() - OFFLINE_THRESHOLD_MS - 1000),
    });
    await checkStalePrinters();

    const afterScheduler = await Printer.findById(printer._id);
    expect(afterScheduler.status).toBe(PRINTER_STATUSES.DISABLED); // jamais rebasculée OFFLINE
    const failedJob = await PrintJob.findById(job._id);
    expect(failedJob.status).toBe(PRINT_JOB_STATUSES.FAILED);

    const enableRes = await request(app)
      .patch(`/api/print/printers/${printer._id}/disabled`)
      .set(authHeader(admin))
      .send({ disabled: false, note: 'Réparée' });
    expect(enableRes.status).toBe(200);
    expect(enableRes.body.data.status).toBe(PRINTER_STATUSES.IDLE);
  });

  it('falls back to async cancellation when getNextJob wins the race on a queued job being disabled', async () => {
    // Simule la perte de la course décrite en revue 2026-09-22 : le findOneAndUpdate conditionné
    // sur status: QUEUED ne trouve plus rien parce que getNextJob l'a déjà fait passer à 'sent'
    // entre temps — setDisabled doit alors basculer sur l'annulation asynchrone plutôt que de
    // nuller currentJob (ce qui orphelinerait un job que l'agent est en train de dispatcher).
    const admin = await createAdmin();
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'S' },
      printer: new mongoose.Types.ObjectId(),
      fileName: 'a.gcode',
      filePath: '/tmp/a.gcode',
      status: PRINT_JOB_STATUSES.QUEUED,
    });
    const printer = await Printer.create({
      name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64),
      status: PRINTER_STATUSES.PRINTING, currentJob: job._id,
    });

    const findOneAndUpdateSpy = jest.spyOn(PrintJob, 'findOneAndUpdate').mockResolvedValueOnce(null);
    try {
      const res = await request(app)
        .patch(`/api/print/printers/${printer._id}/disabled`)
        .set(authHeader(admin))
        .send({ disabled: true, note: 'Maintenance' });
      expect(res.status).toBe(200);
    } finally {
      findOneAndUpdateSpy.mockRestore();
    }

    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.currentJob.toString()).toBe(job._id.toString());

    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.cancelRequestedAt).not.toBeNull();
  });
});

describe('GET /api/print/printers/:id/qr', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'http://localhost:3000';
  });

  afterEach(() => {
    if (originalFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = originalFrontendUrl;
    }
  });

  it('returns a PNG image for an admin', async () => {
    const admin = await createAdmin();
    const printer = await Printer.create({ name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const res = await request(app)
      .get(`/api/print/printers/${printer._id}/qr`)
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });

  it('returns 500 when FRONTEND_URL is not configured', async () => {
    delete process.env.FRONTEND_URL;
    const admin = await createAdmin();
    const printer = await Printer.create({ name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const res = await request(app)
      .get(`/api/print/printers/${printer._id}/qr`)
      .set(authHeader(admin));
    expect(res.status).toBe(500);
  });
});
