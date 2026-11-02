// server/src/controllers/ideation/linkController.js
const mongoose = require('mongoose');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');
const Idea = require('../../models/Idea');
const { validateLink } = require('../../utils/ideation');
const { toDetail } = require('./ideaController');

const LABEL_MAX = 80;
const LINKS_MAX = 10;

// POST /api/ideas/:id/links : { label, url } ; l'URL n'est jamais contactée
exports.addLink = asyncHandler(async (req, res) => {
  const { label, url } = req.body || {};

  if (typeof label !== 'string' || !label.trim()) {
    throw new ErrorResponse('Le libellé est requis', 400);
  }
  const cleanLabel = label.trim();
  if ([...cleanLabel].length > LABEL_MAX) {
    throw new ErrorResponse(`Le libellé ne doit pas dépasser ${LABEL_MAX} caractères`, 400);
  }

  const checked = validateLink(url);
  if (!checked.ok) throw new ErrorResponse(checked.error, 400);

  const ideaId = req.idea._id;
  const entry = {
    label: cleanLabel,
    url: checked.url,
    author: { userId: req.user._id, name: req.user.name },
    createdAt: new Date(),
  };

  // Maximum et doublon vérifiés dans le filtre : atomique face aux ajouts simultanés
  const updated = await Idea.findOneAndUpdate(
    {
      _id: ideaId,
      [`day2Links.${LINKS_MAX - 1}`]: { $exists: false },
      'day2Links.url': { $ne: checked.url },
    },
    { $push: { day2Links: entry }, $set: { lastActivityAt: new Date() } },
    { new: true, runValidators: true }
  );

  if (!updated) {
    // Aucun match : relire l'idée pour donner la bonne raison
    const current = await Idea.findById(ideaId);
    if (!current) throw new ErrorResponse('Idée introuvable', 404);
    if (current.day2Links.length >= LINKS_MAX) {
      throw new ErrorResponse(`${LINKS_MAX} liens maximum`, 400);
    }
    if (current.day2Links.some((l) => l.url === checked.url)) {
      throw new ErrorResponse('Ce lien est déjà ajouté', 400);
    }
    throw new ErrorResponse('Un autre ajout vient d\'avoir lieu, réessayez', 409);
  }

  res.json({ success: true, data: toDetail(updated, req.user) });
});

// DELETE /api/ideas/:id/links/:linkId
exports.removeLink = asyncHandler(async (req, res) => {
  const { linkId } = req.params;
  const notFound = new ErrorResponse('Lien introuvable', 404);
  if (!mongoose.Types.ObjectId.isValid(linkId)) throw notFound;

  const updated = await Idea.findOneAndUpdate(
    { _id: req.idea._id, 'day2Links._id': linkId },
    { $pull: { day2Links: { _id: linkId } }, $set: { lastActivityAt: new Date() } },
    { new: true }
  );
  if (!updated) throw notFound;

  res.json({ success: true, data: toDetail(updated, req.user) });
});
