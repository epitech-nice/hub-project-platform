const fs = require('fs');
const path = require('path');
const PendingPrintUpload = require('../../models/PendingPrintUpload');
const Printer = require('../../models/Printer');
const {
  sweepOrphanedPendingUploads,
  PENDING_UPLOADS_DIR,
  SAFETY_MARGIN_MS,
} = require('../../utils/pendingUploadCleanup');

const writeFileWithMtime = (filePath, ageMs) => {
  fs.writeFileSync(filePath, 'G1 X0 Y0');
  const backdated = new Date(Date.now() - ageMs);
  fs.utimesSync(filePath, backdated, backdated);
};

describe('sweepOrphanedPendingUploads', () => {
  beforeAll(() => {
    if (!fs.existsSync(PENDING_UPLOADS_DIR)) {
      fs.mkdirSync(PENDING_UPLOADS_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    for (const name of ['orphan-old.gcode', 'referenced-old.gcode', 'orphan-recent.gcode']) {
      const filePath = path.join(PENDING_UPLOADS_DIR, name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it('deletes an orphaned old file with no matching PendingPrintUpload document', async () => {
    const filePath = path.join(PENDING_UPLOADS_DIR, 'orphan-old.gcode');
    writeFileWithMtime(filePath, SAFETY_MARGIN_MS + 60 * 1000);

    await sweepOrphanedPendingUploads();

    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('keeps an old file that is still referenced by a PendingPrintUpload document', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const filePath = path.join(PENDING_UPLOADS_DIR, 'referenced-old.gcode');
    writeFileWithMtime(filePath, SAFETY_MARGIN_MS + 60 * 1000);

    await PendingPrintUpload.create({
      student: { email: 's@epitech.eu', name: 'Student' },
      printer: printer._id,
      fileName: 'referenced-old.gcode',
      filePath,
      gcodeMode: 'single',
    });

    await sweepOrphanedPendingUploads();

    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('does not delete an orphaned file that is too recent (safety margin respected)', async () => {
    const filePath = path.join(PENDING_UPLOADS_DIR, 'orphan-recent.gcode');
    writeFileWithMtime(filePath, 60 * 1000); // 1 minute old, well under the safety margin

    await sweepOrphanedPendingUploads();

    expect(fs.existsSync(filePath)).toBe(true);
  });
});
