const mongoose = require('mongoose');
const PrintJob = require('../../models/PrintJob');
const Printer = require('../../models/Printer');
const { PRINT_JOB_STATUSES, PRINT_JOB_GCODE_MODES } = require('../../utils/constants');

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

  it('defaults the spool-selection fields to false/null/empty', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'Student' },
      printer: printer._id,
      fileName: 'part.gcode',
      filePath: '/x',
    });
    expect(job.gateAssignments).toEqual([]);
    expect(job.slotSelectionOverridden).toBe(false);
    expect(job.gcodeMode).toBeNull();
  });

  it('accepts a populated gateAssignments array', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'Student' },
      printer: printer._id,
      fileName: 'part.gcode',
      filePath: '/x',
      gcodeMode: PRINT_JOB_GCODE_MODES.MULTI_MATERIAL,
      gateAssignments: [
        { tool: 'T0', gate: 2 },
        { tool: 'T2', gate: 1 },
      ],
    });
    expect(job.gcodeMode).toBe('multi-material');
    expect(job.gateAssignments).toHaveLength(2);
    expect(job.gateAssignments[0].tool).toBe('T0');
    expect(job.gateAssignments[0].gate).toBe(2);
  });

  it('accepts a null tool in gateAssignments for the zero-Tx case', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'Student' },
      printer: printer._id,
      fileName: 'part.gcode',
      filePath: '/x',
      gcodeMode: PRINT_JOB_GCODE_MODES.SINGLE,
      gateAssignments: [{ tool: null, gate: 3 }],
    });
    expect(job.gateAssignments[0].tool).toBeNull();
    expect(job.gateAssignments[0].gate).toBe(3);
  });
});
