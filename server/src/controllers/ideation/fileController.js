// server/src/controllers/ideation/fileController.js
const fs = require('fs');
const path = require('path');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');
const Idea = require('../../models/Idea');
const { storageDirFor, EXT_TYPE } = require('../../utils/fileSignature');
const { isAcceptedMember, isCreator } = require('../../middleware/ideaAccess');
const { toDetail } = require('./ideaController');

const MIME = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  zip: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const removeQuietly = (filePath) => {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch (e) {
    // fichier déjà absent
  }
};

// Nom de fichier pour Content-Disposition (RFC 5987) : caractères de contrôle retirés,
// tout le reste hors [A-Za-z0-9._-] encodé en pourcentage
const encodeFilename = (name) => {
  const clean = String(name || 'fichier').replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/]/g, '_');
  return encodeURIComponent(clean).replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
};

// POST /api/ideas/:id/(logo|deck) : ajoute une version du fichier déposé par multer
const uploadVersion = (kind) =>
  asyncHandler(async (req, res) => {
    const file = req.file;
    const ideaId = req.idea._id.toString();
    try {
      const current = req.idea.currentVersion(kind);
      const number = current ? current.number + 1 : 1;
      const version = {
        number,
        storedName: file.filename,
        originalName: file.originalname,
        size: file.size,
        author: { userId: req.user._id, name: req.user.name },
        createdAt: new Date(),
      };

      // Condition sur le numéro : deux dépôts simultanés ne produisent pas le même numéro
      const updated = await Idea.findOneAndUpdate(
        { _id: ideaId, [`${kind}.versions.number`]: { $ne: number } },
        { $push: { [`${kind}.versions`]: version }, $set: { lastActivityAt: new Date() } },
        { new: true }
      );
      if (!updated) throw new ErrorResponse('Un autre dépôt vient d\'avoir lieu, réessayez', 409);

      res.json({ success: true, data: toDetail(updated, req.user) });
    } catch (err) {
      removeQuietly(file && file.path);
      throw err;
    }
  });

exports.uploadLogo = uploadVersion('logo');
exports.uploadDeck = uploadVersion('deck');

// GET /api/ideas/:id/:kind(logo|deck)/:version? : flux du fichier (version courante par défaut)
exports.downloadFile = asyncHandler(async (req, res) => {
  const { kind, version: versionParam } = req.params;
  const idea = req.idea;
  const notFound = () => new ErrorResponse('Fichier introuvable', 404);

  // Même règle que le détail : une idée sans deck n'est visible que des siens et des admins
  const hasDeck = idea.deck.versions.length > 0;
  const canSee = hasDeck || req.user.role === 'admin' || isCreator(idea, req.user) || isAcceptedMember(idea, req.user);
  if (!canSee) throw notFound();

  let version;
  if (versionParam === undefined) {
    version = idea.currentVersion(kind);
  } else {
    if (!/^\d{1,9}$/.test(versionParam)) throw notFound();
    const wanted = parseInt(versionParam, 10);
    version = idea[kind].versions.find((v) => v.number === wanted) || null;
  }
  if (!version) throw notFound();

  // Chemin toujours reconstruit depuis l'_id de l'idée ; le nom stocké a pu être altéré en base
  const dir = path.resolve(storageDirFor(idea._id.toString()));
  const fullPath = path.resolve(path.join(dir, String(version.storedName)));
  if (!fullPath.startsWith(dir + path.sep)) throw notFound();

  let stat;
  try {
    stat = await fs.promises.stat(fullPath);
  } catch (e) {
    throw notFound();
  }
  if (!stat.isFile()) throw notFound();

  const type = EXT_TYPE[path.extname(fullPath).toLowerCase()];
  const mime = MIME[type] || 'application/octet-stream';
  // Seuls les logos PNG/JPEG s'affichent dans la page ; tout le reste est téléchargé
  const inline = kind === 'logo' && (type === 'png' || type === 'jpeg');

  res.set({
    'Content-Type': mime,
    'Content-Length': String(stat.size),
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}${inline ? '' : `; filename*=UTF-8''${encodeFilename(version.originalName)}`}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, max-age=0, must-revalidate',
  });

  await new Promise((resolve) => {
    const stream = fs.createReadStream(fullPath);
    stream.on('error', () => {
      // Fichier disparu entre le stat et la lecture
      if (!res.headersSent) {
        res.removeHeader('Content-Disposition');
        res.removeHeader('Content-Length');
        res.removeHeader('Content-Type');
        res.status(404).json({ success: false, error: 'Fichier introuvable' });
      } else {
        res.destroy();
      }
      resolve();
    });
    stream.on('end', resolve);
    res.on('close', () => {
      stream.destroy();
      resolve();
    });
    stream.pipe(res);
  });
});
