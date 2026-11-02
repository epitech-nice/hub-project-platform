// server/src/controllers/ideation/adminController.js
const fs = require('fs');
const path = require('path');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');
const Idea = require('../../models/Idea');
const IdeationSettings = require('../../models/IdeationSettings');
const archiver = require('archiver');
const { countWords, escapeRegex, sanitizeFileName } = require('../../utils/ideation');
const { storageDirFor } = require('../../utils/fileSignature');
const { toDetail } = require('./ideaController');

const TITLE_MAX = 80;
const LABEL_MAX = 80;
const DESCRIPTION_MAX_WORDS = 50;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_PAGE = 10000;

// Valeur de query : chaîne uniquement (objets et tableaux refusés, jamais transmis à Mongo)
const queryString = (value, name) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ErrorResponse(`Paramètre invalide : ${name}`, 400);
  return value;
};

// 'true' / 'false' uniquement
const queryBool = (value, name) => {
  const v = queryString(value, name);
  if (v === undefined) return undefined;
  if (v !== 'true' && v !== 'false') throw new ErrorResponse(`Paramètre invalide : ${name}`, 400);
  return v === 'true';
};

// Un id d'idée ou de lien doit être un ObjectId canonique (24 hex), sinon 404
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const assertId = (value, message) => {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) throw new ErrorResponse(message, 404);
};
const ideaNotFound = () => new ErrorResponse('Idée introuvable', 404);

// Hôtes des liens (URL déjà normalisées à l'écriture), sans doublon
const domainsOf = (links) => {
  const out = [];
  for (const l of links) {
    try {
      const host = new URL(l.url).hostname;
      if (host && !out.includes(host)) out.push(host);
    } catch (e) {
      // URL illisible en base : ignorée
    }
  }
  return out;
};

const toRow = (idea) => ({
  _id: idea._id,
  title: idea.title,
  creator: { name: idea.creator.name, email: idea.creator.email },
  memberCount: idea.acceptedCount(),
  incomplete: idea.isIncomplete(),
  hasDeck: idea.deck.versions.length > 0,
  linkCount: idea.day2Links.length,
  linkDomains: domainsOf(idea.day2Links),
  hidden: Boolean(idea.hidden),
  lastActivityAt: idea.lastActivityAt || idea.updatedAt || idea.createdAt,
});

// Supprime les fichiers listés. Chemin reconstruit depuis l'_id de l'idée ; un nom stocké
// qui sortirait du dossier est ignoré, un fichier absent aussi.
const removeStoredFiles = async (ideaId, versions) => {
  const dir = path.resolve(storageDirFor(ideaId));
  for (const v of versions || []) {
    const full = path.resolve(dir, String(v.storedName));
    if (!full.startsWith(dir + path.sep)) continue;
    try {
      await fs.promises.unlink(full);
    } catch (e) {
      // déjà absent
    }
  }
};

// Chemin d'un fichier stocké, ou null s'il sort du dossier de l'idée
const resolveStored = (ideaId, storedName) => {
  const dir = path.resolve(storageDirFor(ideaId));
  const full = path.resolve(dir, String(storedName));
  return full.startsWith(dir + path.sep) ? full : null;
};

const EXPORT_EXTS = ['.pdf', '.pptx'];

// Nom d'entrée unique sans tenir compte de la casse (systèmes de fichiers Windows/macOS)
const uniqueEntryName = (base, ext, taken) => {
  let name = `${base}${ext}`;
  for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${base}-${n}${ext}`;
  taken.add(name.toLowerCase());
  return name;
};

// GET /api/ideas/admin/export?includeHidden=true|false : ZIP en flux des decks courants
exports.exportDecks = asyncHandler(async (req, res) => {
  const includeHidden = queryBool(req.query.includeHidden, 'includeHidden') === true;

  const filter = { 'deck.versions.0': { $exists: true } };
  if (!includeHidden) filter.hidden = { $ne: true };

  // 'store' : pas de compression (PDF/PPTX déjà compressés, CPU épargné, contenu lisible dans les tests)
  const archive = archiver('zip', { store: true });
  const cursor = Idea.find(filter).select('title deck').sort({ _id: 1 }).lean().cursor();

  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': 'attachment; filename="decks-idees.zip"',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });

  try {
    await new Promise((resolve, reject) => {
      let done = false;
      const finish = (err) => {
        if (done) return;
        done = true;
        cursor.close().catch(() => {});
        if (err) reject(err);
        else resolve();
      };

      // Échec : avant le premier octet, réponse d'erreur normale ; ensuite on coupe la connexion
      const fail = (err) => {
        archive.unpipe(res);
        archive.abort();
        if (res.headersSent) {
          console.error(`Export ZIP interrompu : ${err.message}`);
          res.destroy();
          finish();
        } else {
          finish(err);
        }
      };

      archive.on('error', fail);
      // Avertissement (ex. fichier disparu pendant la lecture) : l'entrée est perdue, le flux continue
      archive.on('warning', (err) => console.error(`Export ZIP, avertissement : ${err.message}`));
      // Fin normale ou client parti avant la fin (res et non req : req.close part dès la requête lue)
      res.on('close', () => {
        if (!res.writableFinished) archive.abort();
        finish();
      });

      archive.pipe(res);

      (async () => {
        const taken = new Set();
        const skipped = [];
        for await (const idea of cursor) {
          if (done) return;
          const versions = idea.deck && idea.deck.versions ? idea.deck.versions : [];
          if (versions.length === 0) continue;
          const current = versions.reduce((best, v) => (v.number > best.number ? v : best));

          const ext = path.extname(String(current.storedName)).toLowerCase();
          const full = EXPORT_EXTS.includes(ext) ? resolveStored(idea._id.toString(), current.storedName) : null;
          let ok = false;
          if (full) {
            try {
              ok = (await fs.promises.stat(full)).isFile();
            } catch (e) {
              ok = false;
            }
          }
          if (!ok) {
            skipped.push(idea.title);
            continue;
          }
          archive.file(full, { name: uniqueEntryName(sanitizeFileName(idea.title), ext, taken) });
        }
        if (done) return;
        if (skipped.length > 0) {
          const lines = skipped.map((t) => `- ${String(t).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')}`);
          const text = [
            "Certains decks n'ont pas pu être ajoutés à cette archive (fichier introuvable ou invalide) :",
            '',
            ...lines,
            '',
          ].join('\n');
          archive.append(text, { name: 'LISEZ-MOI.txt' });
        }
        await archive.finalize();
      })().catch(fail);
    });
  } catch (err) {
    // Aucun octet envoyé : on retire les en-têtes du ZIP, le gestionnaire d'erreurs répond
    res.removeHeader('Content-Type');
    res.removeHeader('Content-Disposition');
    throw err;
  }
});

// GET /api/ideas/admin : tableau de suivi
exports.listAdmin = asyncHandler(async (req, res) => {
  const q = queryString(req.query.q, 'q');
  const hasDeck = queryBool(req.query.hasDeck, 'hasDeck');
  const hasLinks = queryBool(req.query.hasLinks, 'hasLinks');
  const limitRaw = queryString(req.query.limit, 'limit');
  const pageRaw = queryString(req.query.page, 'page');

  const limitParam = parseInt(limitRaw, 10);
  const pageParam = parseInt(pageRaw, 10);
  const limit = Number.isNaN(limitParam) ? DEFAULT_LIMIT : Math.min(Math.max(limitParam, 1), MAX_LIMIT);
  const page = Number.isNaN(pageParam) ? 1 : Math.min(Math.max(pageParam, 1), MAX_PAGE);

  const filter = {};
  if (hasDeck !== undefined) filter['deck.versions.0'] = { $exists: hasDeck };
  if (hasLinks !== undefined) filter['day2Links.0'] = { $exists: hasLinks };
  if (q && q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    filter.$or = [{ title: rx }, { 'members.name': rx }, { 'members.email': rx }];
  }

  const [ideas, total] = await Promise.all([
    Idea.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Idea.countDocuments(filter),
  ]);

  res.json({ success: true, data: ideas.map(toRow), total, page, limit });
});

// PUT /api/ideas/admin/deadline : { deadlineDate: 'YYYY-MM-DD' | null }
exports.setDeadline = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const { deadlineDate } = body;
  if (deadlineDate !== null && typeof deadlineDate !== 'string') {
    throw new ErrorResponse('Date limite invalide (YYYY-MM-DD ou null)', 400);
  }

  await IdeationSettings.getSingleton();
  let settings;
  try {
    // Le validateur du modèle (date calendaire réelle) s'applique
    settings = await IdeationSettings.findOneAndUpdate(
      { key: 'singleton' },
      { $set: { deadlineDate } },
      { new: true, runValidators: true }
    );
  } catch (err) {
    if (err.name === 'ValidationError') {
      throw new ErrorResponse('Date limite invalide (YYYY-MM-DD, date réelle)', 400);
    }
    throw err;
  }
  res.json({ success: true, data: { deadlineDate: settings.deadlineDate || null } });
});

// PATCH /api/ideas/admin/:id/hide : { hidden: boolean }
exports.hideIdea = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Idée introuvable');
  const { hidden } = req.body || {};
  if (typeof hidden !== 'boolean') throw new ErrorResponse('hidden doit être un booléen', 400);

  const updated = await Idea.findOneAndUpdate({ _id: req.params.id }, { $set: { hidden } }, { new: true });
  if (!updated) throw ideaNotFound();
  res.json({ success: true, data: toDetail(updated, req.user) });
});

// PATCH /api/ideas/admin/:id/unlock : { until: date ISO | null }
exports.unlockIdea = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Idée introuvable');
  const { until } = req.body || {};

  let update;
  if (until === null) {
    update = { $unset: { unlockedUntil: 1 } };
  } else {
    if (typeof until !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(until)) {
      throw new ErrorResponse('Date de déblocage invalide', 400);
    }
    const date = new Date(until);
    if (Number.isNaN(date.getTime())) throw new ErrorResponse('Date de déblocage invalide', 400);
    if (date <= new Date()) throw new ErrorResponse('La date de déblocage doit être dans le futur', 400);
    update = { $set: { unlockedUntil: date } };
  }

  const updated = await Idea.findOneAndUpdate({ _id: req.params.id }, update, { new: true });
  if (!updated) throw ideaNotFound();
  res.json({ success: true, data: toDetail(updated, req.user) });
});

// DELETE /api/ideas/admin/:id : document puis dossier de stockage
exports.deleteIdea = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Idée introuvable');
  const idea = await Idea.findOneAndDelete({ _id: req.params.id });
  if (!idea) throw ideaNotFound();

  // Dossier reconstruit depuis l'_id du document, jamais depuis l'URL
  await fs.promises.rm(storageDirFor(idea._id.toString()), { recursive: true, force: true });
  res.json({ success: true });
});

// PUT /api/ideas/admin/:id : titre et/ou description (mêmes règles que côté étudiant)
exports.moderateIdea = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Idée introuvable');
  const { title, description } = req.body || {};
  const set = {};

  if (title === undefined && description === undefined) {
    throw new ErrorResponse('Titre ou description requis', 400);
  }
  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) throw new ErrorResponse('Le titre est requis', 400);
    const clean = title.trim();
    if ([...clean].length > TITLE_MAX) {
      throw new ErrorResponse(`Le titre ne doit pas dépasser ${TITLE_MAX} caractères`, 400);
    }
    set.title = clean;
  }
  if (description !== undefined) {
    if (typeof description !== 'string' || !description.trim()) {
      throw new ErrorResponse('La description est requise', 400);
    }
    if (countWords(description) > DESCRIPTION_MAX_WORDS) {
      throw new ErrorResponse(`La description ne doit pas dépasser ${DESCRIPTION_MAX_WORDS} mots`, 400);
    }
    set.description = description.trim();
  }
  set.lastActivityAt = new Date();

  let updated;
  try {
    updated = await Idea.findOneAndUpdate({ _id: req.params.id }, { $set: set }, { new: true, runValidators: true });
  } catch (err) {
    // Le plafond du modèle compte en unités UTF-16 : plus strict que la règle en caractères
    if (err.name === 'ValidationError') throw new ErrorResponse('Titre ou description invalide', 400);
    throw err;
  }
  if (!updated) throw ideaNotFound();
  res.json({ success: true, data: toDetail(updated, req.user) });
});

// DELETE /api/ideas/admin/:id/(logo|deck) : retire toutes les versions et leurs fichiers
const clearFiles = (kind) =>
  asyncHandler(async (req, res) => {
    assertId(req.params.id, 'Idée introuvable');
    // new: false renvoie l'état précédent, d'où l'on tire les fichiers à effacer
    const before = await Idea.findOneAndUpdate(
      { _id: req.params.id },
      { $set: { [`${kind}.versions`]: [], lastActivityAt: new Date() } },
      { new: false }
    );
    if (!before) throw ideaNotFound();

    await removeStoredFiles(before._id.toString(), before[kind].versions);

    const fresh = await Idea.findById(before._id);
    res.json({ success: true, data: toDetail(fresh || before, req.user) });
  });

exports.clearLogo = clearFiles('logo');
exports.clearDeck = clearFiles('deck');

// DELETE /api/ideas/admin/:id/links/:linkId
exports.removeLink = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Idée introuvable');
  assertId(req.params.linkId, 'Lien introuvable');

  const updated = await Idea.findOneAndUpdate(
    { _id: req.params.id, 'day2Links._id': req.params.linkId },
    { $pull: { day2Links: { _id: req.params.linkId } }, $set: { lastActivityAt: new Date() } },
    { new: true }
  );
  if (!updated) throw new ErrorResponse('Lien introuvable', 404);
  res.json({ success: true, data: toDetail(updated, req.user) });
});

// PUT /api/ideas/admin/:id/links/:linkId : libellé uniquement
exports.updateLink = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Idée introuvable');
  assertId(req.params.linkId, 'Lien introuvable');

  const { label } = req.body || {};
  if (typeof label !== 'string' || !label.trim()) throw new ErrorResponse('Le libellé est requis', 400);
  const clean = label.trim();
  if ([...clean].length > LABEL_MAX) {
    throw new ErrorResponse(`Le libellé ne doit pas dépasser ${LABEL_MAX} caractères`, 400);
  }

  const updated = await Idea.findOneAndUpdate(
    { _id: req.params.id, 'day2Links._id': req.params.linkId },
    { $set: { 'day2Links.$.label': clean, lastActivityAt: new Date() } },
    { new: true, runValidators: true }
  );
  if (!updated) throw new ErrorResponse('Lien introuvable', 404);
  res.json({ success: true, data: toDetail(updated, req.user) });
});
