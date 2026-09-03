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

  it('never touches a disabled printer', async () => {
    const staleDate = new Date(Date.now() - OFFLINE_THRESHOLD_MS - 1000);
    const printer = await Printer.create({
      name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64),
      status: PRINTER_STATUSES.DISABLED, lastSeenAt: staleDate,
    });
    await checkStalePrinters();
    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.status).toBe(PRINTER_STATUSES.DISABLED);
  });
});
