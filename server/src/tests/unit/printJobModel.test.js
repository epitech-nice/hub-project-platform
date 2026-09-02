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
});
