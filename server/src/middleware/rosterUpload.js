// server/src/middleware/rosterUpload.js
// Upload du CSV de la promotion : en mémoire (rien n'est écrit sur le disque), 1 Mo, un seul fichier.
const multer = require('multer');
const path = require('path');
const ErrorResponse = require('../utils/errorResponse');

const MAX_SIZE = 1024 * 1024;
const FORMAT_ERROR = 'Format non accepté : envoyez un fichier .csv';

// .csv quel que soit le type annoncé (Windows envoie souvent application/vnd.ms-excel),
// .txt seulement en text/plain ; le contenu n'est de toute façon jamais interprété
const fileFilter = (req, file, cb) => {
  const ext = path.extname(String(file.originalname)).toLowerCase();
  const mime = String(file.mimetype).toLowerCase();
  const ok = ext === '.csv' || (ext === '.txt' && mime === 'text/plain');
  cb(ok ? null : new ErrorResponse(FORMAT_ERROR, 400), ok);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_SIZE, files: 1 },
}).single('file');

module.exports = (req, res, next) => {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ErrorResponse('Fichier trop volumineux (1 Mo maximum)', 400));
      }
      return next(new ErrorResponse('Envoi de fichier invalide', 400));
    }
    next(err);
  });
};
