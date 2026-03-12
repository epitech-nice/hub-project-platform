// middleware/upload.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Dossier de destination des PDF
const UPLOAD_DIR = path.join(__dirname, "../../uploads/simulated-subjects");

// Créer le dossier s'il n'existe pas
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Nom unique : timestamp + nom original nettoyé
    const sanitized = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .toLowerCase();
    cb(null, `${Date.now()}-${sanitized}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Seuls les fichiers PDF sont acceptés"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
  },
});

module.exports = upload;
