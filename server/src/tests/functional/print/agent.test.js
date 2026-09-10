const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');
const app = require('../../../app');
const PrintJob = require('../../../models/PrintJob');
const Printer = require('../../../models/Printer');
const { createPrinter, printerAuthHeader } = require('../../helpers/print');
const { PRINTER_STATUSES } = require('../../../utils/constants');

// Crée un PrintJob 'queued' et verrouille l'imprimante directement via les modèles — l'ancien
// endpoint POST /api/print/jobs (soumission en une étape) a été retiré, ce fixture reproduit
// juste l'état qu'il laissait derrière lui (job créé + imprimante verrouillée avec un vrai
// fichier sur disque, pour le test de téléchargement), sans dépendre d'un endpoint HTTP de
// soumission particulier.
const submitAcceptedJob = async (printer) => {
  const filePath = path.join(os.tmpdir(), `${Date.now()}-${Math.random().toString(36).slice(2)}-part.gcode`);
  fs.writeFileSync(filePath, 'G1 X10\n');

  const job = await PrintJob.create({
    student: { email: 'ok@epitech.eu', name: 'Ok' },
    printer: printer._id,
    fileName: 'part.gcode',
    filePath,
    history: [{ status: 'queued', date: new Date(), detail: 'Soumission acceptée' }],
  });
  await Printer.findByIdAndUpdate(printer._id, { status: PRINTER_STATUSES.PRINTING, currentJob: job._id });
  // JSON.parse(JSON.stringify(...)) matche la sérialisation qu'une réponse Express aurait
  // produite (_id en string, dates en ISO string) — les tests de ce fichier comparent job._id
  // (toBe, égalité stricte) à res.body.data.jobId, qui est toujours une string côté API.
  return JSON.parse(JSON.stringify(job));
};

describe('GET /api/print/agent/next-job', () => {
  it('returns 401 without printer auth headers', async () => {
    const res = await request(app).get('/api/print/agent/next-job');
    expect(res.status).toBe(401);
  });

  it('returns null when there is no job for this printer', async () => {
    const { printer, rawKey } = await createPrinter();
    const res = await request(app)
      .get('/api/print/agent/next-job')
      .set(printerAuthHeader(printer._id, rawKey));
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('dispatches the queued job for this printer and marks it sent', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);

    const res = await request(app)
      .get('/api/print/agent/next-job')
      .set(printerAuthHeader(printer._id, rawKey));

    expect(res.status).toBe(200);
    expect(res.body.data.jobId).toBe(job._id);
    expect(res.body.data.fileName).toBe('part.gcode');
    expect(res.body.data.downloadUrl).toMatch(new RegExp(`/api/print/agent/jobs/${job._id}/file`));

    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.status).toBe('sent');
  });

  it('does not re-dispatch a job already sent', async () => {
    const { printer, rawKey } = await createPrinter();
    await submitAcceptedJob(printer);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const second = await request(app)
      .get('/api/print/agent/next-job')
      .set(printerAuthHeader(printer._id, rawKey));
    expect(second.body.data).toBeNull();
  });

  it('includes selectedGate in the dispatched job payload when set on the job', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);
    await PrintJob.findByIdAndUpdate(job._id, { selectedGate: 2 });

    const res = await request(app)
      .get('/api/print/agent/next-job')
      .set(printerAuthHeader(printer._id, rawKey));

    expect(res.body.data.selectedGate).toBe(2);
  });

  it('reports selectedGate as null when not set on the job', async () => {
    const { printer, rawKey } = await createPrinter();
    await submitAcceptedJob(printer);

    const res = await request(app)
      .get('/api/print/agent/next-job')
      .set(printerAuthHeader(printer._id, rawKey));

    expect(res.body.data.selectedGate).toBeNull();
  });
});

describe('GET /api/print/agent/jobs/:id/file', () => {
  it('streams the file for the owning printer', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const res = await request(app)
      .get(`/api/print/agent/jobs/${job._id}/file`)
      .set(printerAuthHeader(printer._id, rawKey));
    expect(res.status).toBe(200);
    expect(res.text).toContain('G1 X10');
  });

  it('returns 403 if the job belongs to a different printer', async () => {
    const { printer: printerA } = await createPrinter({ name: 'A' });
    const { printer: printerB, rawKey: keyB } = await createPrinter({ name: 'B' });
    const job = await submitAcceptedJob(printerA);

    const res = await request(app)
      .get(`/api/print/agent/jobs/${job._id}/file`)
      .set(printerAuthHeader(printerB._id, keyB));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/print/agent/jobs/:id/status', () => {
  it('printing: keeps printer in printing status', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const res = await request(app)
      .post(`/api/print/agent/jobs/${job._id}/status`)
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ status: 'printing' });

    expect(res.status).toBe(200);
    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.status).toBe('printing');
    expect(reloadedJob.startedAt).not.toBeNull();
  });

  it('completed: moves the printer to awaiting_clearance', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const res = await request(app)
      .post(`/api/print/agent/jobs/${job._id}/status`)
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.status).toBe(PRINTER_STATUSES.AWAITING_CLEARANCE);
    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.status).toBe('completed');
    expect(reloadedJob.completedAt).not.toBeNull();
  });

  it('failed: moves the printer to awaiting_clearance and records errorMessage', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const res = await request(app)
      .post(`/api/print/agent/jobs/${job._id}/status`)
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ status: 'failed', errorMessage: 'Bourrage filament' });

    expect(res.status).toBe(200);
    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.status).toBe(PRINTER_STATUSES.AWAITING_CLEARANCE);
    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.status).toBe('failed');
    expect(reloadedJob.errorMessage).toBe('Bourrage filament');
  });

  it('rejects an invalid status value', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);

    const res = await request(app)
      .post(`/api/print/agent/jobs/${job._id}/status`)
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ status: 'nonsense' });
    expect(res.status).toBe(400);
  });

  it('rejects a status update for a job that is no longer the printer current job', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    // Simule le pointeur currentJob qui a bougé entre-temps (ex: disable/re-enable, Fix 2)
    await Printer.findByIdAndUpdate(printer._id, { currentJob: null });

    const res = await request(app)
      .post(`/api/print/agent/jobs/${job._id}/status`)
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ status: 'printing' });
    expect(res.status).toBe(409);

    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.status).toBe('sent');
  });

  it('rejects a second status update on an already-completed job (idempotency)', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const first = await request(app)
      .post(`/api/print/agent/jobs/${job._id}/status`)
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ status: 'completed' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/print/agent/jobs/${job._id}/status`)
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ status: 'completed' });
    expect(second.status).toBe(409);
  });

  it('cancelled: moves the printer to awaiting_clearance', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const res = await request(app)
      .post(`/api/print/agent/jobs/${job._id}/status`)
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.status).toBe(PRINTER_STATUSES.AWAITING_CLEARANCE);
    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.status).toBe('cancelled');
  });

  it('rejects a second status update on an already-cancelled job (idempotency)', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const first = await request(app)
      .post(`/api/print/agent/jobs/${job._id}/status`)
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ status: 'cancelled' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/print/agent/jobs/${job._id}/status`)
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ status: 'cancelled' });
    expect(second.status).toBe(409);
  });
});
