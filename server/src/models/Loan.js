// models/Loan.js
const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema(
  {
    tool: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tool',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'La quantité empruntée doit être d\'au moins 1'],
    },
    status: {
      type: String,
      enum: {
        values: ['borrowed', 'returned'],
        message: 'Statut invalide : {VALUE}',
      },
      default: 'borrowed',
    },
    borrowedAt: {
      type: Date,
      default: Date.now,
    },
    returnedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

loanSchema.index({ tool: 1, status: 1 });
loanSchema.index({ user: 1, status: 1 });
loanSchema.index({ borrowedAt: -1 });

module.exports = mongoose.model('Loan', loanSchema);
