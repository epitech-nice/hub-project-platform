// Port client-side de la logique de comparaison qui vivait dans
// server/src/utils/spoolAnalysis.js (computeSlotMismatches/normalizeColor, retirée en Task 4 de
// ce plan) — nécessaire car le mismatch dépend maintenant du gate choisi interactivement par
// l'étudiant, recalculé à chaque clic, plutôt que figé une fois côté serveur à l'analyse. Pas de
// module partagé entre client/ et server/ dans ce repo, d'où la duplication assumée.

// Normalise un hex couleur venant de deux sources au format différent (slicer: "#RRGGBB",
// Moonraker/ACE: "RRGGBBAA" sans '#') vers une forme comparable : 6 caractères hex, minuscules,
// sans '#', sans canal alpha.
export function normalizeColor(hex) {
  if (!hex) return null;
  return hex.replace('#', '').toLowerCase().slice(0, 6);
}

// Compare la matière/couleur attendue par le slicer pour un tool à ce qui est réellement chargé
// dans le slot choisi pour ce tool. Retourne null si rien à comparer (ni matière ni couleur
// attendue — fichier multi-couleur sans commentaires slicer) ou si tout correspond ; sinon un
// objet décrivant l'écart pour affichage d'avertissement non-bloquant.
export function computeGateMismatch(tool, slot) {
  if (!tool.material && !tool.color) return null;

  const materialMismatch =
    !!tool.material && (!slot || (slot.material || '').toLowerCase() !== tool.material.toLowerCase());
  const colorMismatch = !!tool.color && (!slot || normalizeColor(slot.color) !== normalizeColor(tool.color));
  const isEmpty = !slot || slot.empty;

  if (!isEmpty && !materialMismatch && !colorMismatch) return null;

  return {
    expectedMaterial: tool.material,
    expectedColor: tool.color,
    actualMaterial: slot && !slot.empty ? slot.material || null : null,
    actualColor: slot && !slot.empty ? slot.color || null : null,
  };
}
