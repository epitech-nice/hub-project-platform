// Détecte si un gcode est déjà "conscient" de l'ACE (au moins une commande Tx isolée sur sa
// propre ligne) et, le cas échéant, extrait les métadonnées matière/couleur par tool à partir
// des commentaires d'en-tête standards OrcaSlicer/PrusaSlicer.
//
// Règle de détection (voir spec 2026-09-09) : présence d'AU MOINS une commande Tx → mode
// multi-material, quel que soit le nombre de Tx distincts. Aucune Tx → mode single.

const TOOL_LINE_REGEX = /^[ \t]*T([0-3])[ \t]*(;.*)?$/gm;
const FILAMENT_COLOUR_REGEX = /^;\s*filament_colour\s*=\s*(.+)$/m;
const FILAMENT_TYPE_REGEX = /^;\s*filament_type\s*=\s*(.+)$/m;

function parseGcodeSpoolInfo(gcodeText) {
  const usedTools = new Set();
  let match;
  TOOL_LINE_REGEX.lastIndex = 0;
  while ((match = TOOL_LINE_REGEX.exec(gcodeText)) !== null) {
    usedTools.add(Number(match[1]));
  }

  if (usedTools.size === 0) {
    return { mode: 'single', expectedTools: [] };
  }

  const colourMatch = FILAMENT_COLOUR_REGEX.exec(gcodeText);
  const typeMatch = FILAMENT_TYPE_REGEX.exec(gcodeText);
  const colours = colourMatch ? colourMatch[1].split(';').map((s) => s.trim()) : null;
  const types = typeMatch ? typeMatch[1].split(';').map((s) => s.trim()) : null;

  const expectedTools = [...usedTools]
    .sort((a, b) => a - b)
    .map((toolIndex) => ({
      tool: `T${toolIndex}`,
      material: types?.[toolIndex] || null,
      color: colours?.[toolIndex] || null,
    }));

  return { mode: 'multi-material', expectedTools };
}

// Même normalisation que client/src/utils/spoolMatch.js#normalizeColor (slicer "#RRGGBB" vs
// Moonraker/ACE "RRGGBBAA") — dupliquée ici, pas de module partagé client/server dans ce repo.
function normalizeColor(hex) {
  if (!hex) return null;
  return hex.replace('#', '').toLowerCase().slice(0, 6);
}

// Recalcule, au moment de la confirmation, les écarts matière/couleur entre ce que le slicer
// attendait pour chaque tool et ce qui était réellement chargé dans le gate assigné par
// l'étudiant — et les retourne pour être persistés sur PrintJob.slotMismatches. Le front affiche
// déjà cet avertissement de façon non-bloquante (voir computeGateMismatch côté client) mais rien
// n'était conservé côté serveur : un admin enquêtant après coup sur une impression ratée n'avait
// aucune trace qu'un mismatch avait été signalé à la soumission.
function computeConfirmedSlotMismatches(expectedTools, spoolSlots, gateAssignments) {
  const mismatches = [];

  for (const { tool, gate } of gateAssignments) {
    const expected = expectedTools.find((t) => t.tool === tool);
    if (!expected || (!expected.material && !expected.color)) continue;

    const slot = spoolSlots.find((s) => s.gate === gate);
    const isEmpty = !slot || slot.empty;
    const materialMismatch =
      !!expected.material && (!slot || (slot.material || '').toLowerCase() !== expected.material.toLowerCase());
    const colorMismatch =
      !!expected.color && (!slot || normalizeColor(slot.color) !== normalizeColor(expected.color));

    if (!isEmpty && !materialMismatch && !colorMismatch) continue;

    mismatches.push({
      tool,
      gate,
      expectedMaterial: expected.material || null,
      expectedColor: expected.color || null,
      actualMaterial: slot && !slot.empty ? slot.material || null : null,
      actualColor: slot && !slot.empty ? slot.color || null : null,
    });
  }

  return mismatches;
}

module.exports = { parseGcodeSpoolInfo, computeConfirmedSlotMismatches };
