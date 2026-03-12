// models/SimulatedProject.js
const mongoose = require("mongoose");

const SimulatedProjectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  subjectFile: {
    type: String, // chemin relatif vers le PDF uploadé ex: "simulated-subjects/fichier.pdf"
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true, // visible aux étudiants par défaut
  },
  createdBy: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("SimulatedProject", SimulatedProjectSchema);
