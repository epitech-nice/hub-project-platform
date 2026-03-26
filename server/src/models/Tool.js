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

module.exports = mongoose.model('Tool', toolSchema);
