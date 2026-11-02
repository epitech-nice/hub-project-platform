// server/src/utils/fileSignature.js
// Détection du type réel d'un fichier par ses premiers octets (on ne fait pas confiance
// à l'extension ni au mimetype envoyé par le client).
const path = require('path');

const IDEA_STORAGE_ROOT = path.join(__dirname, '../../storage/ideas');

const IDEA_FILE_RULES = {
  logo: { exts: ['.png', '.jpg', '.jpeg', '.svg'], types: ['png', 'jpeg', 'svg'], maxSize: 2 * 1024 * 1024 },
  deck: { exts: ['.pptx', '.pdf'], types: ['pdf', 'zip'], maxSize: 20 * 1024 * 1024 },
};

// Signature attendue pour chaque extension autorisée
const EXT_TYPE = {
  '.png': 'png',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.svg': 'svg',
  '.pdf': 'pdf',
  '.pptx': 'zip',
};

// Motifs interdits dans un SVG (il peut exécuter du script ou charger du contenu actif)
const SVG_DANGEROUS = [
  /<script/i,
  /[\s/"']on\w+\s*=/i,
  /javascript:/i,
  /<foreignObject/i,
  /<iframe/i,
  /<embed/i,
  /<object/i,
  /<!ENTITY/i,
  /<!DOCTYPE[^>]*\[/i,
  /href\s*=\s*["']?\s*data:/i,
  /<(animate|set)\b[^>]*attributeName\s*=\s*["']?\s*(xlink:)?href/i,
];

// <svg doit être l'élément racine : après BOM, espaces, déclaration XML, commentaires et
// DOCTYPE éventuels. Un document HTML qui contient un <svg> est refusé.
const isSvgRoot = (text) => {
  let rest = text.replace(/^﻿/, '');
  const skippable = /^(\s+|<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)/i;
  let m;
  while ((m = skippable.exec(rest))) rest = rest.slice(m[0].length);
  return /^<svg[\s/>]/i.test(rest);
};

// SVG : contrôle heuristique de défense en profondeur seulement. La route de téléchargement
// doit TOUJOURS servir un SVG en pièce jointe (attachment) avec nosniff et une CSP sandbox.
const isSafeSvg = (text) => isSvgRoot(text) && !SVG_DANGEROUS.some((re) => re.test(text));

const startsWith = (buf, bytes) =>
  buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);

const detectFileType = (buf) => {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return null;
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
  // Limite connue : le contrôle PPTX accepte n'importe quel conteneur ZIP
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return 'zip';

  return isSafeSvg(buf.toString('utf8')) ? 'svg' : null;
};

// Dossier de stockage d'une idée. L'id doit être un ObjectId (24 hex) : aucun séparateur
// de chemin ne peut passer.
const storageDirFor = (ideaId) => {
  if (typeof ideaId !== 'string' || !/^[a-f0-9]{24}$/i.test(ideaId)) {
    throw new Error("Identifiant d'idée invalide");
  }
  return path.join(IDEA_STORAGE_ROOT, ideaId);
};

module.exports = { detectFileType, storageDirFor, IDEA_FILE_RULES, EXT_TYPE };
