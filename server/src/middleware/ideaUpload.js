// server/src/middleware/ideaUpload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ErrorResponse = require('../utils/errorResponse');
const { detectFileType, storageDirFor, IDEA_FILE_RULES, EXT_TYPE } = require('../utils/fileSignature');

const KIND_LABELS = { logo: 'PNG, JPG ou SVG', deck: 'PPTX ou PDF' };

const limitLabel = (bytes) => `${Math.round(bytes / (1024 * 1024))} Mo`;

const removeQuietly = (filePath) => {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch (e) {
    // fichier déjà absent
  }
};

// Fabrique le middleware d'upload d'un fichier d'idée (logo ou deck). Champ : `file`.
// Contrôles : extension, taille, puis signature réelle du contenu ; tout échec supprime le fichier.
const ideaUpload = (kind) => {
  const rules = IDEA_FILE_RULES[kind];
  if (!rules) throw new Error(`Type de fichier d'idée inconnu : ${kind}`);

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      let dir;
      try {
        dir = storageDirFor(req.params.id);
      } catch (e) {
        return cb(new ErrorResponse(e.message, 400));
      }
      fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
    },
    filename: (req, file, cb) => {
      const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${sanitized}`);
    },
  });

  const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (rules.exts.includes(ext)) return cb(null, true);
    cb(new ErrorResponse(`Format non accepté. Formats autorisés : ${KIND_LABELS[kind]}`, 400), false);
  };

  const upload = multer({ storage, fileFilter, limits: { fileSize: rules.maxSize, files: 1 } }).single('file');

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        removeQuietly(req.file && req.file.path);
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(new ErrorResponse(`Fichier trop volumineux (${limitLabel(rules.maxSize)} maximum)`, 400));
          }
          return next(new ErrorResponse('Envoi de fichier invalide', 400));
        }
        return next(err);
      }

      if (!req.file) return next(new ErrorResponse('Aucun fichier fourni', 400));

      const { path: filePath, originalname } = req.file;
      const ext = path.extname(originalname).toLowerCase();
      const expected = EXT_TYPE[ext];
      let detected = null;
      try {
        // Le SVG est lu en entier (script possible n'importe où) ; sinon les premiers octets suffisent
        const buf = ext === '.svg' ? fs.readFileSync(filePath) : readHead(filePath, 512);
        detected = detectFileType(buf);
      } catch (e) {
        removeQuietly(filePath);
        return next(new ErrorResponse('Fichier illisible', 400));
      }

      if (!detected || detected !== expected || !rules.types.includes(detected)) {
        removeQuietly(filePath);
        if (ext === '.svg') {
          return next(new ErrorResponse('Ce fichier SVG contient du code actif ou un contenu non autorisé', 400));
        }
        return next(new ErrorResponse(
          `Le contenu du fichier ne correspond pas à son extension. Formats autorisés : ${KIND_LABELS[kind]}`,
          400
        ));
      }

      next();
    });
  };
};

const readHead = (filePath, length) => {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(length);
    const n = fs.readSync(fd, buf, 0, length, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
};

module.exports = ideaUpload;
