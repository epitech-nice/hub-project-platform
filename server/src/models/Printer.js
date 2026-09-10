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
  spoolSlots: {
    type: [
      {
        gate: { type: Number, required: true },
        material: { type: String, default: '' },
        color: { type: String, default: '' },
        empty: { type: Boolean, default: true },
        // Déclaration manuelle (bobines sans puce RFID, voir spec 2026-09-10) : source vaut
        // 'manual' tant que la valeur auto-rapportée par l'agent n'a pas dérivé de ce qui était
        // vrai au moment de la déclaration (autoXAtSet) — voir server/src/utils/spoolSlotMerge.js.
        source: { type: String, enum: ['auto', 'manual'], default: 'auto' },
        manualSetBy: {
          email: { type: String, default: null },
          name: { type: String, default: null },
        },
        manualSetAt: { type: Date, default: null },
        autoMaterialAtSet: { type: String, default: null },
        autoColorAtSet: { type: String, default: null },
        autoEmptyAtSet: { type: Boolean, default: null },
      },
    ],
    default: [],
  },
  spoolSlotsUpdatedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Printer', PrinterSchema);
