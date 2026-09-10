const mongoose = require('mongoose');
const { PRINT_JOB_STATUSES, PRINT_REJECTION_REASONS, PRINT_JOB_GCODE_MODES } = require('../utils/constants');

const PrintJobSchema = new mongoose.Schema({
  student: {
    email: { type: String, required: true },
    name: { type: String, required: true },
  },
  printer: { type: mongoose.Schema.Types.ObjectId, ref: 'Printer', required: true },
  fileName: { type: String, required: true },
  filePath: { type: String, required: true },
  status: {
    type: String,
    enum: Object.values(PRINT_JOB_STATUSES),
    default: PRINT_JOB_STATUSES.QUEUED,
  },
  rejectionReason: {
    type: String,
    enum: [...Object.values(PRINT_REJECTION_REASONS), null],
    default: null,
  },
  errorMessage: { type: String, default: null },
  cancelRequestedAt: { type: Date, default: null },
  cancelledBy: {
    email: { type: String, default: null },
    role: { type: String, default: null },
  },
  gateAssignments: {
    type: [
      {
        tool: { type: String, default: null },
        gate: { type: Number, required: true },
      },
    ],
    default: [],
  },
  slotSelectionOverridden: { type: Boolean, default: false },
  gcodeMode: {
    type: String,
    enum: [...Object.values(PRINT_JOB_GCODE_MODES), null],
    default: null,
  },
  submittedAt: { type: Date, default: Date.now },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  history: {
    type: [
      {
        status: { type: String, enum: Object.values(PRINT_JOB_STATUSES) },
        date: { type: Date, default: Date.now },
        detail: String,
      },
    ],
    default: [],
  },
});

PrintJobSchema.index({ 'student.email': 1, submittedAt: -1 });
PrintJobSchema.index({ printer: 1, status: 1 });

module.exports = mongoose.model('PrintJob', PrintJobSchema);
