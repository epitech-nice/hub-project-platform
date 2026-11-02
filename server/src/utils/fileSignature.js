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


// Toutes les analyses SVG sont linéaires (indexOf, curseur, regex sans `[^>]*` rescanné depuis
// chaque position) : un fichier hostile de 2 Mo ne doit jamais bloquer la boucle d'événements.

// Saute BOM, espaces, déclaration XML, commentaires et DOCTYPE ; renvoie l'index de la racine
// ou -1 si ce n'est pas <svg (ou si le DOCTYPE a un sous-ensemble interne).
const svgRootIndex = (text) => {
  const n = text.length;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) {
      i += 1;
    } else if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end === -1) return -1;
      i = end + 2;
    } else if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end === -1) return -1;
      i = end + 3;
    } else if (text.substr(i, 9).toUpperCase() === '<!DOCTYPE') {
      const end = text.indexOf('>', i + 9);
      if (end === -1) return -1;
      const bracket = text.indexOf('[', i + 9);
      if (bracket !== -1 && bracket < end) return -1;
      i = end + 1;
    } else {
      break;
    }
  }
  if (text.substr(i, 4).toLowerCase() !== '<svg') return -1;
  const next = text.charCodeAt(i + 4);
  const ok = next === 0x3e || next === 0x2f || next === 0x20 || next === 0x09 || next === 0x0a || next === 0x0d;
  return ok ? i : -1;
};

const NAMED_REFS = { colon: ':', tab: '\t', newline: '\n' };

// Décode une seule fois (sans récursion) les références de caractères XML : &#106; &#x6a; &colon; &Tab; &NewLine;
const decodeXmlRefs = (text) =>
  text.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|(colon|Tab|NewLine));/g, (m, dec, hex, name) => {
    if (name) return NAMED_REFS[name.toLowerCase()];
    const cp = dec ? parseInt(dec, 10) : parseInt(hex, 16);
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
  });

const SAFE_DATA_IMAGE = '(?!image/(?:png|jpe?g|gif|webp);base64,)';

// Motifs sur le texte décodé sans espaces ni caractères de contrôle (« java\tscript: » détecté)
const SVG_DANGEROUS_SQUEEZED = [
  /<(?:[\w-]+:)?(?:script|iframe|embed|object|foreignobject)/i,
  /javascript:/i,
  /<!entity/i,
  /<!doctype/i,
  new RegExp(`href=["']?data:${SAFE_DATA_IMAGE}`, 'i'),
  /attributename=["']?(?:xlink:)?href/i,
];

// Gestionnaire on...= : à tester AVANT de retirer les espaces (le séparateur compte)
const SVG_HANDLER = /[\s/"']on\w+\s*=/i;

// SVG : contrôle heuristique de défense en profondeur seulement. La route de téléchargement
// doit TOUJOURS servir un SVG en pièce jointe (attachment) avec nosniff et une CSP sandbox.
const isSafeSvg = (text) => {
  const root = svgRootIndex(text);
  if (root === -1) return false;
  const decoded = decodeXmlRefs(text.slice(root));
  if (SVG_HANDLER.test(decoded)) return false;
  const squeezed = decoded.replace(/[\u0000- \u007f-\u009f]+/g, '');
  return !SVG_DANGEROUS_SQUEEZED.some((re) => re.test(squeezed));
};

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
