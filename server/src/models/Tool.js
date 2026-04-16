// models/Tool.js
const mongoose = require('mongoose');

const toolSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Le nom de l'outil est requis"],
      trim: true,
      maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'La description ne peut pas dépasser 500 caractères'],
    },
    tags: {
      type: [String],
      default: [],
    },
    rfid: {
      type: String,
      unique: true,
      sparse: true, // null/absent ne génère pas de conflit sur l'index unique
      trim: true,
      uppercase: true,
    },
    quantity: {
      type: Number,
      default: 1,
      min: [0, 'La quantité ne peut pas être négative'],
    },
    borrowedCount: {
      type: Number,
      default: 0,
      min: [0, 'La quantité empruntée ne peut pas être négative'],
    },
    maxBorrowPerUser: {
      type: Number,
      default: null, // null signifie pas de limite
      min: [1, 'La limite par étudiant doit être d\'au moins 1'],
    },
    status: {
      type: String,
      enum: {
        values: ['available', 'borrowed', 'maintenance'],
        message: 'Statut invalide : {VALUE}',
      },
      default: 'available',
    },
  },
  {
    timestamps: true,
  }
);

// Index texte pour la recherche par nom/description
toolSchema.index({ name: 'text', description: 'text' });
toolSchema.index({ tags: 1 });
toolSchema.index({ status: 1 });

// Méthodes pour l'Optimistic Concurrency & Encapsulation Métier
toolSchema.statics.processBorrow = async function(toolId, userId, quantity, maxBorrowPerUser) {
  const Loan = mongoose.model('Loan');

  // 1. PERFORMANCE : Vérification de la limite personnelle via AGGREGATION (plus scalable que find + reduce JS)
  if (maxBorrowPerUser !== null) {
    const activeAggregation = await Loan.aggregate([
      { $match: { tool: new mongoose.Types.ObjectId(toolId), user: new mongoose.Types.ObjectId(userId), status: 'borrowed' } },
      { $group: { _id: null, total: { $sum: "$quantity" } } }
    ]);
    
    const alreadyBorrowed = activeAggregation.length > 0 ? activeAggregation[0].total : 0;
    
    if (alreadyBorrowed + quantity > maxBorrowPerUser) {
      throw new Error(`LIMITE_ATTEINTE:${maxBorrowPerUser}:${alreadyBorrowed}`);
    }
  }

  // 2. SCALABILITÉ & RACE CONDITIONS : Opération ATOMIQUE
  const updatedTool = await this.findOneAndUpdate(
    {
      _id: toolId,
      status: { $ne: 'maintenance' },
      $expr: {
        $gte: [
          { $subtract: ["$quantity", "$borrowedCount"] },
          quantity
        ]
      }
    },
    {
      $inc: { borrowedCount: quantity }
    },
    { new: true }
  );

  if (!updatedTool) {
    throw new Error('STOCK_INSUFFISANT_OU_MAINTENANCE');
  }

  // 3. FIABILITÉ : Création du registre
  try {
    const loan = await Loan.create({
      tool: toolId,
      user: userId,
      quantity: quantity,
      status: 'borrowed'
    });
    return { tool: updatedTool, loan };
  } catch (error) {
    // Rollback de sécurité (Optimistic)
    await this.updateOne({ _id: toolId }, { $inc: { borrowedCount: -quantity } });
    throw error;
  }
};

toolSchema.statics.processReturn = async function(toolId, userId, quantity) {
  const Loan = mongoose.model('Loan');

  // SOLID : Délégation de la complexité algorithmique au modèle Loan
  await Loan.resolveReturn(toolId, userId, quantity);

  // Mise à jour atomique du stock global
  await this.updateOne(
    { _id: toolId },
    { $inc: { borrowedCount: -quantity } }
  );

  return true;
};

module.exports = mongoose.model('Tool', toolSchema);
