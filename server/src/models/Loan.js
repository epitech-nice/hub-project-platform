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

// Méthode Statique : Résolution logique des retours (gestion des retours partiels)
loanSchema.statics.resolveReturn = async function(toolId, userId, quantityToReturn) {
  // 1. Récupérer les emprunts actifs les plus anciens
  const activeLoans = await this.find({
    tool: toolId,
    user: userId,
    status: 'borrowed'
  }).sort({ borrowedAt: 1 });

  const totalBorrowed = activeLoans.reduce((sum, loan) => sum + loan.quantity, 0);

  if (activeLoans.length === 0 || quantityToReturn > totalBorrowed) {
    throw new Error('RETOUR_INVALIDE');
  }

  let remaining = quantityToReturn;

  for (const loan of activeLoans) {
    if (remaining <= 0) break;

    if (loan.quantity <= remaining) {
      // Cas A : On rend la totalité de ce prêt spécifique
      remaining -= loan.quantity;
      loan.status = 'returned';
      loan.returnedAt = Date.now();
      await loan.save();
    } else {
      // Cas B : Retour partiel sur ce prêt (on le scinde)
      // On diminue le prêt original
      loan.quantity -= remaining;
      await loan.save();

      // On crée une archive du retour pour la traçabilité
      await this.create({
        tool: toolId,
        user: userId,
        quantity: remaining,
        status: 'returned',
        borrowedAt: loan.borrowedAt,
        returnedAt: Date.now()
      });
      
      remaining = 0;
      break;
    }
  }

  return true;
};

module.exports = mongoose.model('Loan', loanSchema);
