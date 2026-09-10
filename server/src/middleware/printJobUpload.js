// server/src/middleware/printJobUpload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const fileFilter = (req, file, cb) => {
  if (path.extname(file.originalname).toLowerCase() === '.gcode') {
    cb(null, true);
  } else {
    cb(new Error('Seuls les fichiers .gcode sont acceptés'), false);
  }
};

// Fabrique un multer dédié à un sous-répertoire de storage/ — utilisé pour les jobs définitifs
// (print-jobs/) et pour les uploads en attente de confirmation (pending-print-jobs/), qui
// partagent exactement les mêmes règles de validation (extension, taille max).
const createGcodeUpload = (dirName) => {
  const uploadDir = path.join(__dirname, '../../storage', dirName);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
      cb(null, `${Date.now()}-${sanitized}`);
    },
  });

  return multer({ storage, fileFilter, limits: { fileSize: 200 * 1024 * 1024 } });
};

module.exports = {
  printJobUpload: createGcodeUpload('print-jobs'),
  pendingPrintUpload: createGcodeUpload('pending-print-jobs'),
};
