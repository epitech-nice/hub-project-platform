const fs = require('fs');
const path = require('path');
const PendingPrintUpload = require('../models/PendingPrintUpload');

// Le TTL Mongo (900s / 15min, voir PendingPrintUpload.js) supprime le document en attente
// directement dans mongod, sans que le code applicatif ne puisse jamais l'observer (pas de
// hook Mongoose possible sur une expiration TTL). Le fichier .gcode correspondant sur disque
// n'est donc jamais nettoyé par la simple expiration du document — ce sweeper compense en
// scannant périodiquement storage/pending-print-jobs/ et en supprimant tout fichier orphelin
// (plus aucun document ne le référence) une fois passée une marge de sécurité au-delà du TTL,
// pour ne pas courir après un confirm en cours de `rename`.
const PENDING_UPLOADS_DIR = path.join(__dirname, '../../storage', 'pending-print-jobs');
const SAFETY_MARGIN_MS = 20 * 60 * 1000; // 20 min, confortablement au-delà du TTL de 15 min
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 min

const sweepOrphanedPendingUploads = async () => {
  let files;
  try {
    files = await fs.promises.readdir(PENDING_UPLOADS_DIR);
  } catch (err) {
    if (err.code === 'ENOENT') return; // rien à nettoyer si le dossier n'existe pas encore
    console.error('[pendingUploadCleanup] erreur lecture répertoire:', err.message);
    return;
  }

  const cutoff = Date.now() - SAFETY_MARGIN_MS;

  for (const fileName of files) {
    const filePath = path.join(PENDING_UPLOADS_DIR, fileName);
    try {
      const stats = await fs.promises.stat(filePath);
      if (!stats.isFile()) continue;
      if (stats.mtimeMs > cutoff) continue; // pas assez vieux, ne pas risquer un confirm en cours

      const stillReferenced = await PendingPrintUpload.exists({ filePath });
      if (stillReferenced) continue;

      await fs.promises.unlink(filePath);
    } catch (err) {
      console.error(`[pendingUploadCleanup] erreur traitement fichier ${fileName}:`, err.message);
    }
  }
};

let intervalHandle = null;

const startPendingUploadCleanup = (intervalMs = DEFAULT_CLEANUP_INTERVAL_MS) => {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    sweepOrphanedPendingUploads().catch((err) => console.error('[pendingUploadCleanup] erreur:', err.message));
  }, intervalMs);
};

const stopPendingUploadCleanup = () => {
  clearInterval(intervalHandle);
  intervalHandle = null;
};

module.exports = {
  sweepOrphanedPendingUploads,
  startPendingUploadCleanup,
  stopPendingUploadCleanup,
  PENDING_UPLOADS_DIR,
  SAFETY_MARGIN_MS,
};
