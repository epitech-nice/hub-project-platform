// Fusionne le rapport brut de l'agent (POST /agent/spool-status) avec les slots existants, en
// préservant une déclaration manuelle tant que la valeur auto-détectée n'a pas dérivé depuis
// qu'elle a été posée. L'API Moonraker n'expose aucun signal direct "ceci vient d'une lecture
// RFID" (voir spec 2026-09-10, section spike) — un changement de valeur auto-rapportée est donc
// traité comme une nouvelle détection faisant autorité : une heuristique, pas une certitude.
//
// Prend des slots existants sous forme de tableau d'objets à accès par propriété (fonctionne
// aussi bien avec des sous-documents Mongoose qu'avec des objets JS simples) et retourne
// toujours de NOUVEAUX objets simples — jamais les sous-documents existants eux-mêmes, pour
// éviter tout problème de ré-attachement de sous-document Mongoose au moment de la réaffectation
// de `printer.spoolSlots`.
//
// Note sur la forme de `manualSetBy` : dans le schéma Mongoose (Printer.spoolSlots[].manualSetBy,
// voir Task 1), ce champ est un sous-document structuré `{ email, name }` avec des valeurs par
// défaut à `null` chacune — pas un champ qui accepte `null` au niveau racine. On retourne donc
// `{ email: null, name: null }` (et non `null`) dans les branches "auto" ci-dessous, pour que ce
// que produit cette fonction pure corresponde exactement à ce que Mongoose lit/écrit réellement
// une fois assigné à un document `Printer` et rechargé.

// Même normalisation que client/src/utils/spoolMatch.js#normalizeColor (slicer "#RRGGBB" vs
// Moonraker/ACE "RRGGBBAA") — utilisée ici pour que le check de dérive d'une déclaration manuelle
// ne soit pas trompé par un simple changement de casse/format entre deux rapports de la même
// couleur physique.
function normalizeColor(hex) {
  if (!hex) return null;
  return hex.replace('#', '').toLowerCase().slice(0, 6);
}

function toPlainSlot(existing) {
  return {
    gate: existing.gate,
    material: existing.material,
    color: existing.color,
    empty: existing.empty,
    source: existing.source,
    manualSetBy: existing.manualSetBy
      ? { email: existing.manualSetBy.email, name: existing.manualSetBy.name }
      : { email: null, name: null },
    manualSetAt: existing.manualSetAt,
    autoMaterialAtSet: existing.autoMaterialAtSet,
    autoColorAtSet: existing.autoColorAtSet,
    autoEmptyAtSet: existing.autoEmptyAtSet,
  };
}

function mergeSpoolSlots(existingSlots, reportedGates) {
  const reportedByGate = new Set(reportedGates.map((g) => g.gate));

  const merged = reportedGates.map((g) => {
    const reported = {
      gate: g.gate,
      material: g.material || '',
      color: g.color || '',
      empty: !!g.empty,
    };

    const existing = existingSlots.find((s) => s.gate === g.gate);

    if (existing && existing.source === 'manual') {
      const unchanged =
        reported.material === existing.autoMaterialAtSet &&
        normalizeColor(reported.color) === normalizeColor(existing.autoColorAtSet) &&
        reported.empty === existing.autoEmptyAtSet;

      if (unchanged) {
        return toPlainSlot(existing);
      }
    }

    return {
      ...reported,
      source: 'auto',
      manualSetBy: { email: null, name: null },
      manualSetAt: null,
      autoMaterialAtSet: null,
      autoColorAtSet: null,
      autoEmptyAtSet: null,
    };
  });

  // Un gate connu du Hub mais absent de CE rapport (glitch de requête MMU côté agent, ou
  // num_gates mal rapporté un tick) doit être conservé tel quel plutôt que disparaître de
  // Printer.spoolSlots — sinon une déclaration manuelle posée sur ce gate serait perdue au
  // prochain tick qui omet simplement de le rapporter, sans que rien n'ait réellement changé.
  const preserved = existingSlots.filter((s) => !reportedByGate.has(s.gate)).map(toPlainSlot);

  return [...merged, ...preserved].sort((a, b) => a.gate - b.gate);
}

module.exports = { mergeSpoolSlots };
