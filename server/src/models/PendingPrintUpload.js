const mongoose = require('mongoose');
const { PRINT_JOB_GCODE_MODES } = require('../utils/constants');

const PendingPrintUploadSchema = new mongoose.Schema({
  student: {
    email: { type: String, required: true },
    name: { type: String, required: true },
  },
  printer: { type: mongoose.Schema.Types.ObjectId, ref: 'Printer', required: true },
  fileName: { type: String, required: true },
  filePath: { type: String, required: true },
  gcodeMode: {
    type: String,
    enum: Object.values(PRINT_JOB_GCODE_MODES),
    required: true,
  },
  expectedTools: {
    type: [
      {
        tool: String,
        material: String,
        color: String,
      },
    ],
    default: [],
  },
  mismatches: {
    type: [
      {
        tool: String,
        expectedMaterial: String,
        expectedColor: String,
        actualGate: Number,
        actualMaterial: String,
        actualColor: String,
      },
    ],
    default: [],
  },
  createdAt: { type: Date, default: Date.now },
});

// TTL : un upload en attente non confirmé (étudiant qui ferme l'onglet, etc.) est nettoyé
// automatiquement après 15 minutes — pas de scheduler custom à écrire.
PendingPrintUploadSchema.index({ createdAt: 1 }, { expireAfterSeconds: 900 });

module.exports = mongoose.model('PendingPrintUpload', PendingPrintUploadSchema);
