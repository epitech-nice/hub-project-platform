const mongoose = require("mongoose");

// Réglages du module idéation (document unique)
const IdeationSettingsSchema = new mongoose.Schema(
  {
    // YYYY-MM-DD ; un format invalide ferait échouer assertWritable en mode ouvert
    deadlineDate: {
      type: String,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Date limite invalide (YYYY-MM-DD)"],
    },
  },
  { timestamps: true }
);

// Renvoie le document unique, le crée s'il n'existe pas
IdeationSettingsSchema.statics.getSingleton = async function () {
  const existing = await this.findOne();
  if (existing) return existing;
  return this.create({});
};

module.exports = mongoose.model("IdeationSettings", IdeationSettingsSchema);
