const mongoose = require('mongoose');
const { REPORT_CATEGORIES, REPORT_STATUS } = require('../utils/constants');

const toolReportSchema = new mongoose.Schema(
  {
    tool: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tool',
      required: true,
    },
    student: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      name:   { type: String, required: true },
      email:  { type: String, required: true },
    },
    category: {
      type: String,
      enum: {
        values: Object.values(REPORT_CATEGORIES),
        message: 'Catégorie invalide : {VALUE}',
      },
      required: true,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    status: {
      type: String,
      enum: {
        values: Object.values(REPORT_STATUS),
        message: 'Statut invalide : {VALUE}',
      },
      default: REPORT_STATUS.OPEN,
    },
    resolvedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name:   { type: String },
    },
    resolvedAt:     { type: Date },
    resolveMessage: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

toolReportSchema.index({ tool: 1, status: 1 });

module.exports = mongoose.model('ToolReport', toolReportSchema);
