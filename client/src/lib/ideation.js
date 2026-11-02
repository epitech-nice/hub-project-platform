// lib/ideation.js
// Miroir client des règles de server/src/utils/ideation.js : retour immédiat dans
// les formulaires uniquement, le serveur reste l'autorité.

export const TITLE_MAX = 80;
export const DESCRIPTION_MAX_WORDS = 50;
export const MIN_HASHTAGS = 3;
export const HASHTAG_MAX_LENGTH = 30;
export const LINKS_MAX = 10;
export const LINK_LABEL_MAX = 80;
export const LINK_MAX_LENGTH = 2048;
export const GROUP_MAX = 6;
export const GROUP_MIN = 3;
export const CATALOGUE_PAGE_SIZE = 24;

// Mêmes extensions et tailles que server/src/utils/fileSignature.js
export const FILE_RULES = {
  logo: {
    exts: ['.png', '.jpg', '.jpeg', '.svg'],
    accept: '.png,.jpg,.jpeg,.svg',
    maxSize: 2 * 1024 * 1024,
    label: 'PNG, JPG ou SVG, 2 Mo maximum',
  },
  deck: {
    exts: ['.pptx', '.pdf'],
    accept: '.pptx,.pdf',
    maxSize: 20 * 1024 * 1024,
    label: 'PPTX ou PDF, 20 Mo maximum',
  },
};

// Minuscules, sans espaces, "#" initial retiré ; null si invalide
export const normalizeHashtag = (raw) => {
  if (typeof raw !== 'string') return null;
  const tag = raw.trim().replace(/^#/, '').toLowerCase();
  if (!tag || tag.length > HASHTAG_MAX_LENGTH) return null;
  if (!/^[\p{L}\p{N}_-]+$/u.test(tag)) return null;
  return tag;
};

export const countWords = (text) => {
  if (typeof text !== 'string') return 0;
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

// Longueur en caractères visibles (emoji compris), comme le serveur
export const charLength = (text) => [...String(text || '')].length;

const extensionOf = (name) => {
  const i = String(name || '').lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
};

// Message d'erreur pour un fichier choisi, ou null s'il est acceptable
export const checkFile = (file, kind) => {
  const rules = FILE_RULES[kind];
  if (!file || !rules) return null;
  if (!rules.exts.includes(extensionOf(file.name))) {
    return `Format non accepté. Formats autorisés : ${rules.label}.`;
  }
  if (file.size > rules.maxSize) {
    return `Fichier trop volumineux (${Math.round(rules.maxSize / (1024 * 1024))} Mo maximum).`;
  }
  return null;
};

export const isSvgName = (name) => extensionOf(name) === '.svg';

// https seulement, sans identifiants, hôte public : même logique que validateLink du serveur
export const validateLinkUrl = (raw) => {
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
  return { ok: true, url: parsed.href };
};

// Défensif : on ne rend un href que pour une URL https:// analysable
export const safeHttpsHref = (url) => {
  if (typeof url !== 'string' || !url.startsWith('https://')) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch (e) {
    return null;
  }
};

export const linkDomain = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return null;
  }
};

// Pastille purement cosmétique pour les services connus
const KNOWN_SERVICES = [
  { match: /(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/, label: 'Drive' },
  { match: /(^|\.)onedrive\.live\.com$|(^|\.)1drv\.ms$|sharepoint\.com$/, label: 'OneDrive' },
  { match: /(^|\.)canva\.com$/, label: 'Canva' },
  { match: /(^|\.)notion\.(so|site)$/, label: 'Notion' },
  { match: /(^|\.)figma\.com$/, label: 'Figma' },
  { match: /(^|\.)github\.com$/, label: 'GitHub' },
];

export const knownService = (domain) => {
  if (!domain) return null;
  const found = KNOWN_SERVICES.find((s) => s.match.test(domain));
  return found ? found.label : null;
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
export const deadlineCutoff = (deadlineDate) => {
  if (typeof deadlineDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(deadlineDate)) return null;
  const [y, m, d] = deadlineDate.split('-').map(Number);
  const wallClock = Date.UTC(y, m - 1, d + 1, 0, 0, 0);
  let instant = wallClock - parisOffsetMs(new Date(wallClock));
  instant = wallClock - parisOffsetMs(new Date(instant));
  return new Date(instant);
};

export const isDeadlinePassed = (deadlineDate, now = new Date()) => {
  const cutoff = deadlineCutoff(deadlineDate);
  return Boolean(cutoff) && now >= cutoff;
};

// "vendredi 12 mars 2027" (date de calendrier, sans décalage de fuseau)
export const formatDeadline = (deadlineDate) => {
  if (typeof deadlineDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(deadlineDate)) return null;
  const [y, m, d] = deadlineDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
};

export const formatDate = (value, withTime = false) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
};

export const formatBytes = (bytes) => {
  if (typeof bytes !== 'number' || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
};

// Message lisible depuis une erreur de useApi (err.message + err.errors éventuels)
export const errorText = (err, fallback = 'Une erreur est survenue') => {
  if (!err) return fallback;
  const details = Array.isArray(err.errors)
    ? err.errors
        .map((e) => (typeof e === 'string' ? e : e && (e.msg || e.message || Object.values(e)[0])))
        .filter((e) => typeof e === 'string')
    : [];
  const base = err.message || fallback;
  return details.length ? `${base} : ${details.join(', ')}` : base;
};

export const ROLE_LABELS = {
  creator: 'Créateur',
  member: 'Membre',
  pending: 'Invitation en attente',
  admin: 'Staff',
};
