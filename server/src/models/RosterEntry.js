// server/src/models/RosterEntry.js
// Liste de la promotion importée par le staff. Données personnelles : jamais exposée aux étudiants,
// supprimée à la purge de fin de saison.
const mongoose = require('mongoose');

const RosterEntrySchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  lastName: { type: String, trim: true },
  firstName: { type: String, trim: true },
  importedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('RosterEntry', RosterEntrySchema);
