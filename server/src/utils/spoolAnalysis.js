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

// Normalise un hex couleur venant de deux sources au format différent (slicer: "#RRGGBB",
// Moonraker/ACE: "RRGGBBAA" sans '#') vers une forme comparable : 6 caractères hex, minuscules,
// sans '#', sans canal alpha.
function normalizeColor(hex) {
  if (!hex) return null;
  return hex.replace('#', '').toLowerCase().slice(0, 6);
}

function computeSlotMismatches(expectedTools, spoolSlots) {
  const mismatches = [];

  for (const expected of expectedTools) {
    if (!expected.material && !expected.color) continue; // rien à comparer, pas un mismatch

    const gate = Number(expected.tool.slice(1));
    const actual = spoolSlots.find((slot) => slot.gate === gate);

    const materialMismatch =
      !!expected.material && (!actual || (actual.material || '').toLowerCase() !== expected.material.toLowerCase());
    const colorMismatch =
      !!expected.color && (!actual || normalizeColor(actual.color) !== normalizeColor(expected.color));
    const isEmpty = !actual || actual.empty;

    if (isEmpty || materialMismatch || colorMismatch) {
      mismatches.push({
        tool: expected.tool,
        expectedMaterial: expected.material,
        expectedColor: expected.color,
        actualGate: gate,
        actualMaterial: actual && !actual.empty ? actual.material || null : null,
        actualColor: actual && !actual.empty ? actual.color || null : null,
      });
    }
  }

  return mismatches;
}

module.exports = { parseGcodeSpoolInfo, computeSlotMismatches };
