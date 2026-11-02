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

// Un SVG peut exécuter du script : balise <script ou gestionnaire on...=
const SVG_DANGEROUS = /<script|\son\w+\s*=/i;

const startsWith = (buf, bytes) =>
  buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);

const detectFileType = (buf) => {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return null;
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return 'zip';

  const text = buf.toString('utf8');
  if (/<svg/i.test(text)) {
    return SVG_DANGEROUS.test(text) ? null : 'svg';
  }
  return null;
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
