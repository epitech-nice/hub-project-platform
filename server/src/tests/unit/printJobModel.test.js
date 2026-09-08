const mongoose = require('mongoose');
const PrintJob = require('../../models/PrintJob');
const Printer = require('../../models/Printer');
const { PRINT_JOB_STATUSES } = require('../../utils/constants');

describe('PrintJob model', () => {
  it('defaults to queued status', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'Student' },
      printer: printer._id,
      fileName: 'part.gcode',
      filePath: '/uploads/print-jobs/1-part.gcode',
    });
    expect(job.status).toBe(PRINT_JOB_STATUSES.QUEUED);
    expect(job.history).toEqual([]);
  });

  it('rejects an invalid status', async () => {
    await expect(
      PrintJob.create({
        student: { email: 's@epitech.eu', name: 'Student' },
        printer: new mongoose.Types.ObjectId(),
        fileName: 'part.gcode',
        filePath: '/x',
        status: 'nonsense',
      })
    ).rejects.toThrow();
  });

  it('accepts a cancelled status with cancelRequestedAt and cancelledBy', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'Student' },
      printer: printer._id,
      fileName: 'part.gcode',
      filePath: '/uploads/print-jobs/1-part.gcode',
      status: PRINT_JOB_STATUSES.CANCELLED,
      cancelRequestedAt: new Date(),
      cancelledBy: { email: 'admin@epitech.eu', role: 'admin' },
    });
    expect(job.status).toBe('cancelled');
    expect(job.cancelledBy.email).toBe('admin@epitech.eu');
  });

  it('defaults cancelRequestedAt and cancelledBy to null/empty when not set', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'Student' },
      printer: printer._id,
      fileName: 'part.gcode',
      filePath: '/x',
    });
    expect(job.cancelRequestedAt).toBeNull();
    expect(job.cancelledBy.email).toBeNull();
  });
});
