const mongoose = require('mongoose');
const PendingPrintUpload = require('../../models/PendingPrintUpload');
const Printer = require('../../models/Printer');

describe('PendingPrintUpload model', () => {
  it('creates a document with the required fields and TTL defaults', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const pending = await PendingPrintUpload.create({
      student: { email: 's@epitech.eu', name: 'Student' },
      printer: printer._id,
      fileName: 'part.gcode',
      filePath: '/tmp/x.gcode',
      gcodeMode: 'single',
    });
    expect(pending.expectedTools).toEqual([]);
    expect(pending.createdAt).toBeInstanceOf(Date);
  });

  it('rejects an invalid gcodeMode', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    await expect(
      PendingPrintUpload.create({
        student: { email: 's@epitech.eu', name: 'Student' },
        printer: printer._id,
        fileName: 'part.gcode',
        filePath: '/tmp/x.gcode',
        gcodeMode: 'nonsense',
      })
    ).rejects.toThrow();
  });

  it('declares a TTL index on createdAt at 900 seconds', () => {
    const ttlIndex = PendingPrintUpload.schema.indexes().find(([, opts]) => opts.expireAfterSeconds !== undefined);
    expect(ttlIndex).toBeDefined();
    const [fields, opts] = ttlIndex;
    expect(fields).toEqual({ createdAt: 1 });
    expect(opts.expireAfterSeconds).toBe(900);
  });
});
