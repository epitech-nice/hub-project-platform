const Printer = require('../../models/Printer');
const PrintJob = require('../../models/PrintJob');
const { checkStalePrinters, OFFLINE_THRESHOLD_MS } = require('../../utils/printerScheduler');
const { PRINTER_STATUSES } = require('../../utils/constants');

describe('checkStalePrinters', () => {
  it('leaves a recently-seen printer untouched', async () => {
    const printer = await Printer.create({
      name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64),
      status: PRINTER_STATUSES.IDLE, lastSeenAt: new Date(),
    });
    await checkStalePrinters();
    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.status).toBe(PRINTER_STATUSES.IDLE);
  });

  it('marks a silent idle printer offline with lastKnownStatus recorded', async () => {
    const staleDate = new Date(Date.now() - OFFLINE_THRESHOLD_MS - 1000);
    const printer = await Printer.create({
      name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64),
      status: PRINTER_STATUSES.IDLE, lastSeenAt: staleDate,
    });

    await checkStalePrinters();

    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.status).toBe(PRINTER_STATUSES.OFFLINE);
    expect(reloaded.lastKnownStatus).toBe(PRINTER_STATUSES.IDLE);
    expect(reloaded.statusHistory).toHaveLength(1);
    expect(reloaded.statusHistory[0].source).toBe('heartbeat_timeout');
  });

  it('auto-fails the current job of a silent printer that was printing', async () => {
    const staleDate = new Date(Date.now() - OFFLINE_THRESHOLD_MS - 1000);
    const printer = await Printer.create({
      name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64),
      status: PRINTER_STATUSES.PRINTING, lastSeenAt: staleDate,
    });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'S' }, printer: printer._id,
      fileName: 'a.gcode', filePath: '/a', status: 'printing',
    });
    printer.currentJob = job._id;
    await printer.save();

    await checkStalePrinters();

    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.status).toBe('failed');
    expect(reloadedJob.errorMessage).toMatch(/contact/i);
  });

  it('never rebounces a disabled printer to offline', async () => {
    const staleDate = new Date(Date.now() - OFFLINE_THRESHOLD_MS - 1000);
    const printer = await Printer.create({
      name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64),
      status: PRINTER_STATUSES.DISABLED, lastSeenAt: staleDate,
    });
    await checkStalePrinters();
    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.status).toBe(PRINTER_STATUSES.DISABLED);
  });

  it('still auto-fails a stale job on a disabled printer, without changing the printer status', async () => {
    // Régression pour le deadlock trouvé en revue 2026-09-22 : une imprimante désactivée en
    // cours d'impression garde currentJob posé (voir printerController.setDisabled) pour
    // permettre l'annulation asynchrone — si l'agent ne répond plus jamais, ce job doit quand
    // même être résolu, sinon currentJob reste bloqué et setDisabled(false) refuse pour
    // toujours, sans aucune échappatoire côté API.
    const staleDate = new Date(Date.now() - OFFLINE_THRESHOLD_MS - 1000);
    const printer = await Printer.create({
      name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64),
      status: PRINTER_STATUSES.DISABLED, lastSeenAt: staleDate,
    });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'S' }, printer: printer._id,
      fileName: 'a.gcode', filePath: '/a', status: 'printing',
    });
    printer.currentJob = job._id;
    await printer.save();

    await checkStalePrinters();

    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.status).toBe(PRINTER_STATUSES.DISABLED);
    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.status).toBe('failed');
  });

  it('processes every stale printer in one tick, even several at once', async () => {
    // Régression pour le bug corrigé le 2026-09-21 : un VersionError non catché sur l'une
    // (save() nu face à une écriture concurrente) sortait de la boucle for..of et laissait
    // toutes les imprimantes staleness suivantes du même tick intactes.
    const staleDate = new Date(Date.now() - OFFLINE_THRESHOLD_MS - 1000);
    const printers = await Printer.insertMany([
      { name: 'P1', model: 'kobra3', apiKeyHash: 'a'.repeat(64), status: PRINTER_STATUSES.IDLE, lastSeenAt: staleDate },
      { name: 'P2', model: 'kobra3', apiKeyHash: 'b'.repeat(64), status: PRINTER_STATUSES.IDLE, lastSeenAt: staleDate },
      { name: 'P3', model: 'kobra3', apiKeyHash: 'c'.repeat(64), status: PRINTER_STATUSES.IDLE, lastSeenAt: staleDate },
    ]);

    await checkStalePrinters();

    for (const printer of printers) {
      const reloaded = await Printer.findById(printer._id);
      expect(reloaded.status).toBe(PRINTER_STATUSES.OFFLINE);
    }
  });

  it('does not fail an already-completed job that raced ahead of the staleness check', async () => {
    // Fermeture de la course avec updateJobStatus (Fix 5, agentController.js) : l'écriture du
    // job ici est désormais conditionnée sur un statut encore actif ('sent'/'printing') — si
    // l'agent a rapporté 'completed' juste avant la coupure de contact, ce report doit gagner.
    const staleDate = new Date(Date.now() - OFFLINE_THRESHOLD_MS - 1000);
    const printer = await Printer.create({
      name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64),
      status: PRINTER_STATUSES.PRINTING, lastSeenAt: staleDate,
    });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'S' }, printer: printer._id,
      fileName: 'a.gcode', filePath: '/a', status: 'completed', completedAt: new Date(),
    });
    printer.currentJob = job._id;
    await printer.save();

    await checkStalePrinters();

    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.status).toBe('completed');
  });
});
