const ErrorResponse = require('./errorResponse');

const HASHTAG_MAX_LENGTH = 30;
const LINK_MAX_LENGTH = 2048;

// Minuscules, sans espaces, "#" initial retiré ; null si invalide
const normalizeHashtag = (raw) => {
  if (typeof raw !== 'string') return null;
  const tag = raw.trim().replace(/^#/, '').toLowerCase();
  if (!tag || tag.length > HASHTAG_MAX_LENGTH) return null;
  if (!/^[\p{L}\p{N}_-]+$/u.test(tag)) return null;
  return tag;
};

// Dédoublonne après normalisation ; error si un élément est invalide
const normalizeHashtags = (raw) => {
  if (!Array.isArray(raw)) return { tags: [], error: 'Les hashtags doivent être une liste' };
  const tags = [];
  for (const item of raw) {
    const tag = normalizeHashtag(item);
    if (!tag) return { tags: [], error: `Hashtag invalide : ${item}` };
    if (!tags.includes(tag)) tags.push(tag);
  }
  return { tags };
};

const countWords = (text) => {
  if (typeof text !== 'string') return 0;
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

// https seulement, sans identifiants, hôte public (ni IP, ni localhost, ni sans point)
const validateLink = (raw) => {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'Lien invalide' };
  const value = raw.trim();
  if (value.length > LINK_MAX_LENGTH) return { ok: false, error: 'Lien trop long' };

  let parsed;
  try {
    parsed = new URL(value);
  } catch (e) {
    return { ok: false, error: 'Lien invalide' };
  }

  if (parsed.protocol !== 'https:') return { ok: false, error: 'Le lien doit commencer par https://' };
  if (parsed.username || parsed.password) return { ok: false, error: 'Le lien ne doit pas contenir d\'identifiants' };

  const host = parsed.hostname.toLowerCase();
  const isIp = host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host);
  if (isIp || host === 'localhost' || !host.includes('.')) {
    return { ok: false, error: 'Hôte du lien non autorisé' };
  }

  // parsed.href met déjà l'hôte en minuscules
  return { ok: true, url: parsed.href };
};

// Décalage (ms) d'Europe/Paris par rapport à UTC à l'instant donné
const parisOffsetMs = (date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(date).reduce((acc, p) => {
    acc[p.type] = Number(p.value);
    return acc;
  }, {});
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
};

// Lendemain 00:00 Europe/Paris du jour donné (YYYY-MM-DD) : borne exclusive
const getCutoff = (deadlineDate) => {
  const [y, m, d] = deadlineDate.split('-').map(Number);
  const wallClock = Date.UTC(y, m - 1, d + 1, 0, 0, 0);
  let instant = wallClock - parisOffsetMs(new Date(wallClock));
  instant = wallClock - parisOffsetMs(new Date(instant));
  return new Date(instant);
};

// Lève 403 si la date limite est passée (sauf réouverture de cette idée)
const assertWritable = (idea, settings, now = new Date()) => {
  if (idea && idea.unlockedUntil && new Date(idea.unlockedUntil) > now) return;
  if (!settings || !settings.deadlineDate) return;
  if (now >= getCutoff(settings.deadlineDate)) {
    throw new ErrorResponse('La date limite de dépôt est dépassée', 403);
  }
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = {
  normalizeHashtag,
  normalizeHashtags,
  countWords,
  validateLink,
  getCutoff,
  assertWritable,
  escapeRegex,
};
