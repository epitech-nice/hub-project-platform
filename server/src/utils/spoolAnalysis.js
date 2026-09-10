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

module.exports = { parseGcodeSpoolInfo };
