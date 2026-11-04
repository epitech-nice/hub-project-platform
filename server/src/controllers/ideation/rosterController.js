// server/src/controllers/ideation/rosterController.js
// Liste de la promotion (CSV) et suivi « sans projet ». Aucun email n'est écrit dans les journaux.
const { parse } = require('csv-parse/sync');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');
const RosterEntry = require('../../models/RosterEntry');
const User = require('../../models/User');
const Idea = require('../../models/Idea');
const { escapeRegex } = require('../../utils/ideation');

const MAX_ROWS = 2000;
const NAME_MAX = 100;
const EMAIL_MAX = 254;
const INVALID_VALUE_MAX = 80;
const PREVIEW_INVALID_MAX = 50;
const PREVIEW_SAMPLE = 5;

const EMAIL_HEADERS = ['email', 'mail', 'e-mail', 'courriel', 'adresse mail', 'adresse email'];
// Colonne login : partie locale de l'adresse (avant le @), complétée avec le domaine de l'école
const LOGIN_HEADERS = ['login', 'identifiant', 'username', 'user'];
const LOGIN_DOMAIN = 'epitech.eu';
const LAST_NAME_HEADERS =['nom', 'lastname', 'last name', 'family name', 'surname'];
const FIRST_NAME_HEADERS = ['prenom', 'firstname', 'first name', 'given name'];
const FULL_NAME_HEADERS = ['name', 'nom complet', 'full name'];

// Insensible à la casse et aux accents
const normalizeHeader = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// Un seul @, un point dans le domaine, pas d'espace ; un début en = + - @ n'est jamais accepté
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const isValidEmail = (e) => e.length <= EMAIL_MAX && !/^[=+\-@]/.test(e) && EMAIL_RE.test(e);

// Séparateur déterminé sur la ligne d'en-tête, hors guillemets ; égalité -> ';'
const detectDelimiter = (headerLine) => {
  let commas = 0;
  let semis = 0;
  let inQuotes = false;
  for (const ch of headerLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === ',') commas += 1;
    else if (!inQuotes && ch === ';') semis += 1;
  }
  return commas > semis ? ',' : ';';
};

const findColumn = (headers, names) => headers.findIndex((h) => names.includes(h));
const cell = (row, i) => (i >= 0 && row[i] !== undefined ? String(row[i]).trim().slice(0, NAME_MAX) : '');

const fail = (error) => ({ entries: [], duplicates: 0, invalid: [], error });

// Analyse pure d'un CSV : ne lève jamais, n'évalue jamais le contenu des cellules
const parseRosterCsv = (buf) => {
  let text;
  try {
    text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '');
  } catch (e) {
    return fail('UNREADABLE');
  }
  text = text.replace(/^﻿/, '');
  const headerLine = text.split(/\r\n|\n|\r/).find((l) => l.trim() !== '');
  if (headerLine === undefined) return fail('EMPTY');

  let records;
  try {
    records = parse(text, {
      delimiter: detectDelimiter(headerLine),
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      info: true,
    });
  } catch (e) {
    return fail('UNREADABLE');
  }
  if (records.length === 0) return fail('EMPTY');

  const headers = records[0].record.map(normalizeHeader);
  const emailCol = findColumn(headers, EMAIL_HEADERS);
  const loginCol = findColumn(headers, LOGIN_HEADERS);
  if (emailCol < 0 && loginCol < 0) return fail('NO_EMAIL_COLUMN');
  const rows = records.slice(1);
  if (rows.length === 0) return fail('EMPTY');
  if (rows.length > MAX_ROWS) return fail('TOO_LARGE');

  let lastCol = findColumn(headers, LAST_NAME_HEADERS);
  const firstCol = findColumn(headers, FIRST_NAME_HEADERS);
  // Une colonne « name » n'est jamais découpée : elle sert de nom seulement s'il n'y a pas d'autre colonne de nom
  if (lastCol < 0 && firstCol < 0) lastCol = findColumn(headers, FULL_NAME_HEADERS);

  const seen = new Set();
  const entries = [];
  const invalid = [];
  let duplicates = 0;

  for (const { record, info } of rows) {
    if (record.every((c) => String(c).trim() === '')) continue;
    // info.lines est la ligne de fin de l'enregistrement : on retire les retours à la ligne internes
    const embedded = record.reduce((n, c) => n + (String(c).match(/\n/g) || []).length, 0);
    const line = info.lines - embedded;

    // Colonne email d'abord ; à défaut de valeur, la colonne login (un login seul reçoit le domaine de l'école)
    const colValue = (i) => (i >= 0 && i < record.length ? String(record[i]).trim() : '');
    let raw = colValue(emailCol);
    let candidate = raw;
    if (raw === '') {
      raw = colValue(loginCol);
      candidate = raw;
      if (raw !== '' && !raw.includes('@') && !/^[=+\-]/.test(raw)) candidate = `${raw}@${LOGIN_DOMAIN}`;
    }
    const email = candidate.toLowerCase();
    if (!isValidEmail(email)) {
      // La valeur d'origine du fichier est affichée, pas l'adresse complétée
      invalid.push({ line, value: raw.slice(0, INVALID_VALUE_MAX) });
      continue;
    }
    if (seen.has(email)) {
      duplicates += 1;
      continue;
    }
    seen.add(email);
    entries.push({ email, lastName: cell(record, lastCol), firstName: cell(record, firstCol) });
  }

  // Des lignes existent mais aucune adresse exploitable : refusé (jamais de liste vide à importer)
  if (entries.length === 0) return { entries, duplicates, invalid, error: 'NO_VALID_ENTRY' };

  return { entries, duplicates, invalid };
};

const ERROR_MESSAGES = {
  NO_VALID_ENTRY: "Aucune adresse email valide dans le fichier : la liste actuelle n'a pas été modifiée",
  NO_EMAIL_COLUMN: 'Le fichier ne contient pas de colonne email ou login (en-têtes acceptés : email, mail, e-mail, courriel, login)',
  TOO_LARGE: `Le fichier contient trop de lignes (${MAX_ROWS} maximum)`,
  EMPTY: 'Le fichier est vide ou ne contient aucune ligne de données',
  UNREADABLE: 'Le fichier est illisible (guillemets non fermés ou format CSV invalide)',
};

// Analyse le fichier du champ `file` ; 400 si absent ou en erreur
const parseUpload = (req) => {
  if (!req.file) throw new ErrorResponse('Aucun fichier envoyé (champ « file »)', 400);
  const result = parseRosterCsv(req.file.buffer);
  if (result.error) throw new ErrorResponse(ERROR_MESSAGES[result.error], 400);
  return result;
};

// POST /api/ideas/admin/roster/preview : analyse sans rien enregistrer
exports.preview = asyncHandler(async (req, res) => {
  const { entries, duplicates, invalid } = parseUpload(req);
  res.json({
    success: true,
    data: {
      valid: entries.length,
      duplicates,
      invalid: invalid.slice(0, PREVIEW_INVALID_MAX),
      invalidCount: invalid.length,
      hasEmailColumn: true,
      sample: entries.slice(0, PREVIEW_SAMPLE),
    },
  });
});

// POST /api/ideas/admin/roster : remplace la liste (upsert, puis suppression des absents :
// la liste n'est jamais vide pendant le remplacement)
exports.importRoster = asyncHandler(async (req, res) => {
  const { entries, duplicates, invalid } = parseUpload(req);
  // Garde-fou : $nin: [] correspond à tous les documents, une liste vide ne doit jamais supprimer
  if (entries.length === 0) throw new ErrorResponse(ERROR_MESSAGES.NO_VALID_ENTRY, 400);
  const now = new Date();

  await RosterEntry.bulkWrite(
    entries.map((e) => ({
      updateOne: {
        filter: { email: e.email },
        update: {
          $set: { lastName: e.lastName, firstName: e.firstName, importedAt: now },
          $setOnInsert: { email: e.email },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  );
  const { deletedCount } = await RosterEntry.deleteMany({ email: { $nin: entries.map((e) => e.email) } });

  res.json({
    success: true,
    data: { imported: entries.length, removed: deletedCount, duplicates, invalidCount: invalid.length },
  });
});

// DELETE /api/ideas/admin/roster
exports.clearRoster = asyncHandler(async (req, res) => {
  const { deletedCount } = await RosterEntry.deleteMany({});
  res.json({ success: true, data: { removed: deletedCount } });
});

const byName = (a, b) =>
  (a.lastName || '').localeCompare(b.lastName || '', 'fr', { sensitivity: 'base' }) ||
  (a.firstName || '').localeCompare(b.firstName || '', 'fr', { sensitivity: 'base' }) ||
  a.email.localeCompare(b.email);

// GET /api/ideas/admin/roster/without-project?q= : trois requêtes au plus, quelle que soit la taille de la liste
exports.withoutProject = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (q !== undefined && typeof q !== 'string') throw new ErrorResponse('Paramètre invalide : q', 400);

  const filter = {};
  if (q && q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    filter.$or = [{ email: rx }, { lastName: rx }, { firstName: rx }];
  }
  const entries = await RosterEntry.find(filter).select('email lastName firstName').lean();
  const emails = entries.map((e) => e.email);

  // User.email peut être stocké en casse mixte : comparaison sans casse (collation), puis clé en minuscules
  const users = emails.length
    ? await User.find({ email: { $in: emails } })
        .collation({ locale: 'en', strength: 2 })
        .select('email')
        .lean()
    : [];
  const idsByEmail = new Map();
  for (const u of users) {
    const key = u.email.toLowerCase();
    if (!idsByEmail.has(key)) idsByEmail.set(key, []);
    idsByEmail.get(key).push(String(u._id));
  }

  // Appartenances de ces comptes, toutes idées confondues (masquées comprises)
  const state = new Map(); // userId -> { accepted, pending }
  if (users.length) {
    const ideas = await Idea.find({ 'members.userId': { $in: users.map((u) => u._id) } })
      .select('members')
      .lean();
    for (const idea of ideas) {
      for (const m of idea.members) {
        if (!m.userId) continue;
        const id = String(m.userId);
        const s = state.get(id) || { accepted: false, pending: false };
        if (m.status === 'accepted') s.accepted = true;
        if (m.status === 'pending') s.pending = true;
        state.set(id, s);
      }
    }
  }

  const counts = { never_connected: 0, no_project: 0, invited_only: 0, total: 0 };
  const data = [];
  for (const e of entries) {
    const ids = idsByEmail.get(e.email);
    let status;
    if (!ids) {
      status = 'never_connected';
    } else {
      const states = ids.map((id) => state.get(id) || { accepted: false, pending: false });
      if (states.some((s) => s.accepted)) continue;
      status = states.some((s) => s.pending) ? 'invited_only' : 'no_project';
    }
    counts[status] += 1;
    counts.total += 1;
    data.push({ email: e.email, lastName: e.lastName || '', firstName: e.firstName || '', status });
  }
  data.sort(byName);

  res.json({ success: true, data, counts });
});

exports.parseRosterCsv = parseRosterCsv;
