const mongoose = require('mongoose');
const { PRINTER_STATUSES, PRINTER_STATUS_SOURCES, CLEARANCE_METHODS } = require('../utils/constants');

const PrinterSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  model: { type: String, required: true, enum: ['kobra3', 'kobra3max'] },
  apiKeyHash: { type: String, required: true },
  status: {
    type: String,
    enum: Object.values(PRINTER_STATUSES),
    default: PRINTER_STATUSES.IDLE,
  },
  currentJob: { type: mongoose.Schema.Types.ObjectId, ref: 'PrintJob', default: null },
  lastSeenAt: { type: Date, default: Date.now },
  lastKnownStatus: {
    type: String,
    enum: Object.values(PRINTER_STATUSES),
    default: PRINTER_STATUSES.IDLE,
  },
  clearanceHistory: {
    type: [
      {
        method: { type: String, enum: Object.values(CLEARANCE_METHODS) },
        byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        byEmail: String,
        byName: String,
        date: { type: Date, default: Date.now },
      },
    ],
    default: [],
  },
  statusHistory: {
    type: [
      {
        status: { type: String, enum: Object.values(PRINTER_STATUSES) },
        source: { type: String, enum: Object.values(PRINTER_STATUS_SOURCES) },
        detail: String,
        byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        byName: String,
        date: { type: Date, default: Date.now },
      },
    ],
    default: [],
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Printer', PrinterSchema);
