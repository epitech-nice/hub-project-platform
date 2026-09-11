// Normalise un hex couleur venant de deux sources au format différent (slicer: "#RRGGBB",
// Moonraker/ACE: "RRGGBBAA" sans '#') vers une forme comparable : 6 caractères hex, minuscules,
// sans '#', sans canal alpha. Partagé entre spoolAnalysis.js (mismatch à la confirmation) et
// spoolSlotMerge.js (détection de dérive d'une déclaration manuelle) — les deux tournent
// côté serveur, pas de raison de dupliquer ici comme c'est fait entre client/ et server/
// (voir client/src/utils/spoolMatch.js, dupliqué faute de module partagé entre les deux).
function normalizeColor(hex) {
  if (!hex) return null;
  return hex.replace('#', '').toLowerCase().slice(0, 6);
}

module.exports = { normalizeColor };
