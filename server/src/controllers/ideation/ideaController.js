// server/src/controllers/ideation/ideaController.js
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');
const Idea = require('../../models/Idea');
const IdeationSettings = require('../../models/IdeationSettings');
const {
  normalizeHashtag,
  normalizeHashtags,
  countWords,
  assertWritable,
  escapeRegex,
} = require('../../utils/ideation');
const { isAcceptedMember, isListedMember, isCreator } = require('../../middleware/ideaAccess');

const TITLE_MAX = 80;
const DESCRIPTION_MAX_WORDS = 50;
const MIN_HASHTAGS = 3;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;
const MAX_PAGE = 10000;
const SUGGESTION_LIMIT = 10;

// Valeur de query/body : chaîne uniquement (objets et tableaux refusés, jamais transmis à Mongo)
const queryString = (value, name) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ErrorResponse(`Paramètre invalide : ${name}`, 400);
  return value;
};

// Valide et normalise { title, description, hashtags } (création et modification)
const parseIdeaBody = (body = {}) => {
  const { title, description, hashtags } = body;

  if (typeof title !== 'string' || !title.trim()) {
    throw new ErrorResponse('Le titre est requis', 400);
  }
  const cleanTitle = title.trim();
  if ([...cleanTitle].length > TITLE_MAX) {
    throw new ErrorResponse(`Le titre ne doit pas dépasser ${TITLE_MAX} caractères`, 400);
  }

  if (typeof description !== 'string' || !description.trim()) {
    throw new ErrorResponse('La description est requise', 400);
  }
  if (countWords(description) > DESCRIPTION_MAX_WORDS) {
    throw new ErrorResponse(`La description ne doit pas dépasser ${DESCRIPTION_MAX_WORDS} mots`, 400);
  }

  const { tags, error } = normalizeHashtags(hashtags);
  if (error) throw new ErrorResponse(error, 400);
  if (tags.length < MIN_HASHTAGS) {
    throw new ErrorResponse(`Au moins ${MIN_HASHTAGS} hashtags distincts sont requis`, 400);
  }

  return { title: cleanTitle, description: description.trim(), hashtags: tags };
};

// Carte du catalogue / de "mes idées" : aucun email
const toCard = (idea) => ({
  _id: idea._id,
  title: idea.title,
  description: idea.description,
  hashtags: idea.hashtags,
  hasLogo: Boolean(idea.logo && idea.logo.versions && idea.logo.versions.length > 0),
  memberCount: idea.acceptedCount(),
  incomplete: idea.isIncomplete(),
  createdAt: idea.createdAt,
});

// Version de fichier exposée : jamais le nom stocké sur disque
const toFileInfo = (idea, kind) => {
  const versions = (idea[kind] && idea[kind].versions) || [];
  const current = idea.currentVersion(kind);
  const pick = (v) => ({
    number: v.number,
    originalName: v.originalName,
    size: v.size,
    author: { name: v.author && v.author.name },
    createdAt: v.createdAt,
  });
  return {
    current: current ? pick(current) : null,
    versions: versions.map(pick).sort((a, b) => b.number - a.number),
  };
};

// Rôle de l'utilisateur sur l'idée
const roleOf = (idea, user) => {
  if (isCreator(idea, user)) return 'creator';
  if (isAcceptedMember(idea, user)) return 'member';
  if (idea.members.some((m) => m.status === 'pending' && String(m.userId) === String(user._id))) {
    return 'pending';
  }
  return null;
};

// Détail d'une idée ; emails réservés aux admins. Les invités en attente et les userId
// ne sont montrés qu'au créateur, aux admins et (entrée propre) à l'intéressé.
const toDetail = (idea, user) => {
  const admin = user.role === 'admin';
  const creator = isCreator(idea, user);
  const privileged = admin || creator;
  const isMe = (id) => String(id) === String(user._id);
  const withEmail = (obj, email) => (admin ? { ...obj, email } : obj);

  const members = idea.members
    .filter((m) => privileged || m.status === 'accepted' || isMe(m.userId))
    .map((m) => {
      const base = { name: m.name, status: m.status, invitedAt: m.invitedAt };
      if (privileged || isMe(m.userId)) base.userId = m.userId;
      return withEmail(base, m.email);
    });

  const creatorInfo = { name: idea.creator.name };
  if (privileged) creatorInfo.userId = idea.creator.userId;

  return {
    _id: idea._id,
    title: idea.title,
    description: idea.description,
    hashtags: idea.hashtags,
    creator: withEmail(creatorInfo, idea.creator.email),
    members,
    memberCount: idea.acceptedCount(),
    incomplete: idea.isIncomplete(),
    logo: toFileInfo(idea, 'logo'),
    deck: toFileInfo(idea, 'deck'),
    day2Links: idea.day2Links.map((l) => ({
      _id: l._id,
      label: l.label,
      url: l.url,
      author: { name: l.author && l.author.name },
      createdAt: l.createdAt,
    })),
    hidden: idea.hidden,
    myRole: admin ? 'admin' : roleOf(idea, user),
    createdAt: idea.createdAt,
    updatedAt: idea.updatedAt,
  };
};

exports.toDetail = toDetail;

// GET /api/ideas/settings
exports.getSettings = asyncHandler(async (req, res) => {
  const settings = await IdeationSettings.getSingleton();
  res.json({ success: true, data: { deadlineDate: settings.deadlineDate || null } });
});

// GET /api/ideas/hashtags?prefix=
exports.suggestHashtags = asyncHandler(async (req, res) => {
  const raw = queryString(req.query.prefix, 'prefix');
  const prefix = raw === undefined ? null : normalizeHashtag(raw);
  if (!prefix) return res.json({ success: true, data: [] });

  const rows = await Idea.aggregate([
    { $match: { hidden: { $ne: true } } },
    { $unwind: '$hashtags' },
    { $match: { hashtags: { $regex: `^${escapeRegex(prefix)}` } } },
    { $group: { _id: '$hashtags' } },
    { $sort: { _id: 1 } },
    { $limit: SUGGESTION_LIMIT },
  ]);
  res.json({ success: true, data: rows.map((r) => r._id) });
});

// GET /api/ideas/me : mes idées (rôle) et mes invitations en attente
exports.getMine = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const [mine, invited] = await Promise.all([
    Idea.find({ hidden: { $ne: true }, members: { $elemMatch: { userId, status: 'accepted' } } })
      .sort({ createdAt: -1, _id: -1 }),
    Idea.find({ hidden: { $ne: true }, members: { $elemMatch: { userId, status: 'pending' } } })
      .sort({ createdAt: -1, _id: -1 }),
  ]);

  const ideas = mine.map((idea) => ({
    ...toCard(idea),
    hasDeck: idea.deck.versions.length > 0,
    role: isCreator(idea, req.user) ? 'creator' : 'member',
  }));

  const invitations = invited.map((idea) => {
    const entry = idea.members.find(
      (m) => m.status === 'pending' && String(m.userId) === String(userId)
    );
    return {
      ideaId: idea._id,
      title: idea.title,
      invitedBy: idea.creator.name,
      invitedAt: entry && entry.invitedAt,
    };
  });

  res.json({ success: true, data: { ideas, invitations } });
});

// GET /api/ideas : catalogue (idées avec deck, non masquées)
exports.listIdeas = asyncHandler(async (req, res) => {
  const q = queryString(req.query.q, 'q');
  const tagsRaw = queryString(req.query.tags, 'tags');
  const sort = queryString(req.query.sort, 'sort') || 'date';
  if (!['date', 'title'].includes(sort)) throw new ErrorResponse('Tri invalide', 400);

  const limitParam = parseInt(queryString(req.query.limit, 'limit'), 10);
  const pageParam = parseInt(queryString(req.query.page, 'page'), 10);
  const limit = Number.isNaN(limitParam) ? DEFAULT_LIMIT : Math.min(Math.max(limitParam, 1), MAX_LIMIT);
  const page = Number.isNaN(pageParam) ? 1 : Math.min(Math.max(pageParam, 1), MAX_PAGE);

  const filter = { hidden: { $ne: true }, 'deck.versions.0': { $exists: true } };

  if (tagsRaw) {
    const tags = tagsRaw.split(',').map((t) => normalizeHashtag(t));
    // Un tag invalide ne peut correspondre à rien
    if (tags.some((t) => !t)) return res.json({ success: true, data: [], total: 0 });
    filter.hashtags = { $all: tags };
  }

  if (q && q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    filter.$or = [
      { title: rx },
      { members: { $elemMatch: { status: 'accepted', name: rx } } },
    ];
  }

  const order = sort === 'title' ? { title: 1, _id: 1 } : { createdAt: -1, _id: -1 };
  const query = Idea.find(filter)
    .select('title description hashtags logo members.status createdAt')
    .sort(order)
    .skip((page - 1) * limit)
    .limit(limit);
  if (sort === 'title') query.collation({ locale: 'fr', strength: 2 });

  const [ideas, total] = await Promise.all([query, Idea.countDocuments(filter)]);
  res.json({ success: true, data: ideas.map(toCard), total });
});

// POST /api/ideas : crée l'idée (le deck suit via POST /:id/deck)
exports.createIdea = asyncHandler(async (req, res) => {
  const settings = await IdeationSettings.getSingleton();
  assertWritable({}, settings);

  const data = parseIdeaBody(req.body);
  const idea = await Idea.create({
    ...data,
    creator: { userId: req.user._id, name: req.user.name, email: req.user.email },
    members: [
      { userId: req.user._id, name: req.user.name, email: req.user.email, status: 'accepted' },
    ],
    lastActivityAt: new Date(),
  });

  res.status(201).json({ success: true, data: toDetail(idea, req.user) });
});

// GET /api/ideas/:id
exports.getIdea = asyncHandler(async (req, res) => {
  const idea = req.idea;
  const hasDeck = idea.deck.versions.length > 0;
  const canSee =
    hasDeck ||
    req.user.role === 'admin' ||
    isCreator(idea, req.user) ||
    isListedMember(idea, req.user);
  if (!canSee) throw new ErrorResponse('Idée introuvable', 404);

  res.json({ success: true, data: toDetail(idea, req.user) });
});

// PUT /api/ideas/:id
exports.updateIdea = asyncHandler(async (req, res) => {
  const idea = req.idea;
  const data = parseIdeaBody(req.body);

  idea.title = data.title;
  idea.description = data.description;
  idea.hashtags = data.hashtags;
  idea.lastActivityAt = new Date();
  await idea.save();

  res.json({ success: true, data: toDetail(idea, req.user) });
});
