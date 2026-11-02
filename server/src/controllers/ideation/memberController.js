// server/src/controllers/ideation/memberController.js
const mongoose = require('mongoose');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');
const Idea = require('../../models/Idea');
const User = require('../../models/User');
const { toDetail } = require('./ideaController');
const { isListedMember, isCreator } = require('../../middleware/ideaAccess');

const MAX_MEMBERS = 6;

// ObjectId fourni sous forme de chaîne de 24 hex (objets et tableaux refusés)
const parseUserId = (raw) => {
  if (typeof raw !== 'string' || !/^[0-9a-fA-F]{24}$/.test(raw)) {
    throw new ErrorResponse('Identifiant utilisateur invalide', 400);
  }
  return new mongoose.Types.ObjectId(raw);
};

// POST /api/ideas/:id/members : invite un étudiant (créateur seul)
exports.inviteMember = asyncHandler(async (req, res) => {
  const userId = parseUserId(req.body && req.body.userId);
  const user = await User.findById(userId).select('name email');
  if (!user) throw new ErrorResponse('Utilisateur introuvable', 404);

  // Atomique : la taille et l'absence de doublon sont vérifiées dans le filtre de l'écriture
  const updated = await Idea.findOneAndUpdate(
    {
      _id: req.idea._id,
      $expr: { $lt: [{ $size: '$members' }, MAX_MEMBERS] },
      'members.userId': { $ne: userId },
    },
    {
      $push: {
        members: { userId, name: user.name, email: user.email, status: 'pending', invitedAt: new Date() },
      },
      $set: { lastActivityAt: new Date() },
    },
    { new: true }
  );

  if (!updated) {
    const fresh = await Idea.findById(req.idea._id);
    if (!fresh) throw new ErrorResponse('Idée introuvable', 404);
    if (isListedMember(fresh, { _id: userId })) {
      throw new ErrorResponse('Cet étudiant est déjà membre ou invité', 400);
    }
    throw new ErrorResponse('Un groupe ne peut pas dépasser 6 membres', 400);
  }

  res.json({ success: true, data: toDetail(updated, req.user) });
});

// Aucune invitation en attente : 404 si l'utilisateur n'est pas listé du tout, 400 sinon
const noPendingInvitation = async (req) => {
  const fresh = await Idea.findById(req.idea._id);
  if (!fresh || !isListedMember(fresh, req.user)) return new ErrorResponse('Idée introuvable', 404);
  return new ErrorResponse('Aucune invitation en attente', 400);
};

const pendingFilter = (req) => ({
  _id: req.idea._id,
  members: { $elemMatch: { userId: req.user._id, status: 'pending' } },
});

// POST /api/ideas/:id/invitation/accept
exports.acceptInvitation = asyncHandler(async (req, res) => {
  const updated = await Idea.findOneAndUpdate(
    pendingFilter(req),
    { $set: { 'members.$.status': 'accepted', lastActivityAt: new Date() } },
    { new: true }
  );
  if (!updated) throw await noPendingInvitation(req);
  res.json({ success: true, data: toDetail(updated, req.user) });
});

// POST /api/ideas/:id/invitation/decline
exports.declineInvitation = asyncHandler(async (req, res) => {
  const updated = await Idea.findOneAndUpdate(
    pendingFilter(req),
    {
      $pull: { members: { userId: req.user._id, status: 'pending' } },
      $set: { lastActivityAt: new Date() },
    },
    { new: true }
  );
  if (!updated) throw await noPendingInvitation(req);
  res.json({ success: true, data: null });
});

// DELETE /api/ideas/:id/members/:userId : le créateur retire un membre, ou le membre se retire
exports.removeMember = asyncHandler(async (req, res) => {
  const target = parseUserId(req.params.userId);
  const idea = req.idea;

  if (String(target) === String(idea.creator.userId)) {
    throw new ErrorResponse('Le créateur ne peut pas quitter son idée', 400);
  }
  if (!isCreator(idea, req.user) && String(target) !== String(req.user._id)) {
    throw new ErrorResponse('Seul le créateur peut retirer un autre membre', 403);
  }

  const updated = await Idea.findOneAndUpdate(
    { _id: idea._id, 'members.userId': target },
    { $pull: { members: { userId: target } }, $set: { lastActivityAt: new Date() } },
    { new: true }
  );
  if (!updated) throw new ErrorResponse('Membre introuvable', 404);

  res.json({ success: true, data: toDetail(updated, req.user) });
});
