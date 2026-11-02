// server/src/middleware/ideaAccess.js
const mongoose = require('mongoose');
const asyncHandler = require('./asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Idea = require('../models/Idea');
const IdeationSettings = require('../models/IdeationSettings');
const { assertWritable } = require('../utils/ideation');

const sameUser = (a, b) => Boolean(a) && Boolean(b) && String(a) === String(b);

// Charge req.idea ; 404 si absente, id invalide, ou masquée pour un non-admin
const loadIdea = asyncHandler(async (req, res, next) => {
  const notFound = new ErrorResponse('Idée introuvable', 404);
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return next(notFound);

  const idea = await Idea.findById(req.params.id);
  if (!idea) return next(notFound);
  if (idea.hidden && req.user.role !== 'admin') return next(notFound);

  req.idea = idea;
  next();
});

const isAcceptedMember = (idea, user) =>
  idea.members.some((m) => m.status === 'accepted' && sameUser(m.userId, user._id));

// Toute entrée de members (en attente ou acceptée) : suffit pour lire l'idée et répondre à l'invitation
const isListedMember = (idea, user) =>
  idea.members.some((m) => sameUser(m.userId, user._id));

const isCreator = (idea, user) => sameUser(idea.creator && idea.creator.userId, user._id);

// Membre ayant accepté (le créateur en fait partie) ; les admins ne passent pas ici
const requireAcceptedMember = (req, res, next) => {
  if (!isAcceptedMember(req.idea, req.user)) {
    return next(new ErrorResponse('Réservé aux membres du groupe', 403));
  }
  next();
};

const requireCreator = (req, res, next) => {
  if (!isCreator(req.idea, req.user)) {
    return next(new ErrorResponse('Réservé au créateur de l\'idée', 403));
  }
  next();
};

// Refuse (403) si la date limite est dépassée, sauf réouverture de cette idée
const requireWritable = asyncHandler(async (req, res, next) => {
  const settings = await IdeationSettings.getSingleton();
  assertWritable(req.idea, settings);
  next();
});

module.exports = {
  loadIdea,
  requireAcceptedMember,
  requireCreator,
  requireWritable,
  isAcceptedMember,
  isListedMember,
  isCreator,
};
