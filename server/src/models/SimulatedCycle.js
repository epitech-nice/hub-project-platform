// models/SimulatedCycle.js
const mongoose = require("mongoose");

const SimulatedCycleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, // ex: "Cycle 1 — Printemps 2026"

  // W0 vendredi (+0j) : ouverture du cycle — l'étudiant peut choisir et déposer son projet
  startDate: { type: Date, required: true },

  // W1 mercredi (+5j) : deadline de dépôt du lien GitHub — phase 1
  firstSubmissionDeadline: { type: Date, required: true },

  // W2 vendredi (+14j) : 1ère défense + attribution des crédits phase 1
  // Après validation admin, l'étudiant peut mettre à jour son lien GitHub
  firstDefenseDate: { type: Date, required: true },

  // W3 mercredi (+19j) : deadline de mise à jour du GitHub Project — phase 2
  secondSubmissionDeadline: { type: Date, required: true },

  // W4 vendredi (+28j) : 2ème défense + attribution des crédits phase 2 — fin du cycle
  secondDefenseDate: { type: Date, required: true },

  // Double cycle (ex: vacances) → plage de crédits étendue
  isDoubleCycle: { type: Boolean, default: false },

  createdBy: {
    userId: mongoose.Schema.Types.ObjectId,
    name: String,
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("SimulatedCycle", SimulatedCycleSchema);
