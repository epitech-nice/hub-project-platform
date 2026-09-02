const express = require('express');
const request = require('supertest');
const Printer = require('../../models/Printer');
const PrintJob = require('../../models/PrintJob');
const { authenticatePrinter } = require('../../middleware/printerAuth');
const { generateApiKey } = require('../../utils/apiKey');
const { PRINTER_STATUSES } = require('../../utils/constants');
const errorHandler = require('../../middleware/errorHandler');

const buildApp = () => {
  const app = express();
  app.get('/whoami', authenticatePrinter, (req, res) => {
    res.status(200).json({ success: true, data: { id: req.printer._id.toString(), status: req.printer.status } });
  });
  app.use(errorHandler);
  return app;
};

describe('authenticatePrinter', () => {
  it('rejects a request with no headers', async () => {
    const res = await request(buildApp()).get('/whoami');
    expect(res.status).toBe(401);
  });

  it('rejects a wrong api key', async () => {
    const { hash } = generateApiKey();
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: hash });
    const res = await request(buildApp())
      .get('/whoami')
      .set('x-printer-id', printer._id.toString())
      .set('x-api-key', 'wrong-key');
    expect(res.status).toBe(401);
  });

  it('accepts the right api key and updates lastSeenAt', async () => {
    const { rawKey, hash } = generateApiKey();
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: hash });
    const res = await request(buildApp())
      .get('/whoami')
      .set('x-printer-id', printer._id.toString())
      .set('x-api-key', rawKey);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(PRINTER_STATUSES.IDLE);
    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.lastSeenAt).not.toBeNull();
  });

  it('reconnects a printer that was offline with no failed job back to lastKnownStatus', async () => {
    const { rawKey, hash } = generateApiKey();
    const printer = await Printer.create({
      name: 'P1', model: 'kobra3', apiKeyHash: hash,
      status: PRINTER_STATUSES.OFFLINE, lastKnownStatus: PRINTER_STATUSES.IDLE,
    });
    const res = await request(buildApp())
      .get('/whoami')
      .set('x-printer-id', printer._id.toString())
      .set('x-api-key', rawKey);
    expect(res.body.data.status).toBe(PRINTER_STATUSES.IDLE);
  });

  it('reconnects a printer whose current job was auto-failed into awaiting_clearance', async () => {
    const { rawKey, hash } = generateApiKey();
    const printer = await Printer.create({
      name: 'P1', model: 'kobra3', apiKeyHash: hash,
      status: PRINTER_STATUSES.OFFLINE, lastKnownStatus: PRINTER_STATUSES.PRINTING,
    });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'S' },
      printer: printer._id, fileName: 'a.gcode', filePath: '/x', status: 'failed',
    });
    printer.currentJob = job._id;
    await printer.save();

    const res = await request(buildApp())
      .get('/whoami')
      .set('x-printer-id', printer._id.toString())
      .set('x-api-key', rawKey);
    expect(res.body.data.status).toBe(PRINTER_STATUSES.AWAITING_CLEARANCE);
  });
});
