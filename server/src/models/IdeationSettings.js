const mongoose = require("mongoose");

// Vrai si la chaîne est une date calendaire réelle au format YYYY-MM-DD
function isValidCalendarDate(v) {
  if (v === null || v === undefined) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// Réglages du module idéation (document unique)
const IdeationSettingsSchema = new mongoose.Schema(
  {
    // Clé fixe + index unique : garantit un seul document
    key: { type: String, default: "singleton", unique: true },
    // YYYY-MM-DD ; une date invalide ferait échouer assertWritable en mode ouvert
    deadlineDate: {
      type: String,
      validate: {
        validator: isValidCalendarDate,
        message: "Date limite invalide (YYYY-MM-DD, date réelle)",
      },
    },
  },
  { timestamps: true }
);

// Renvoie le document unique, le crée de façon atomique s'il n'existe pas
IdeationSettingsSchema.statics.getSingleton = function () {
  return this.findOneAndUpdate(
    { key: "singleton" },
    { $setOnInsert: { key: "singleton" } },
    { upsert: true, new: true }
  );
};

module.exports = mongoose.model("IdeationSettings", IdeationSettingsSchema);
