const mongoose = require('mongoose');
const { PRINT_ACCESS_REQUEST_STATUSES } = require('../utils/constants');

const PrintAccessRequestSchema = new mongoose.Schema({
  student: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
  },
  status: {
    type: String,
    enum: Object.values(PRINT_ACCESS_REQUEST_STATUSES),
    default: PRINT_ACCESS_REQUEST_STATUSES.PENDING,
  },
  requestedAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date, default: null },
});

PrintAccessRequestSchema.index({ 'student.email': 1, status: 1 });

module.exports = mongoose.model('PrintAccessRequest', PrintAccessRequestSchema);
