const axios = require('axios');

const DEFAULT_BASE_URL = 'https://my.epitech.eu/api';
const REQUEST_TIMEOUT_MS = 20000;
const UNEXPECTED_RESPONSE_MESSAGE = 'Réponse my inattendue, vérifier sur my avant de relancer';

class MyConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MyConfigError';
  }
}

class MyApiError extends Error {
  constructor(message, { status = 0, step = '' } = {}) {
    super(message);
    this.name = 'MyApiError';
    this.status = status;
    this.step = step;
  }
}

function isAllowedBaseUrl(baseUrl, nodeEnv) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch (err) {
    return false;
  }
  if (url.protocol === 'https:') return true;
  if (url.protocol !== 'http:') return false;
  return nodeEnv === 'test' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

// Lu a chaque appel (et non au chargement du module) pour suivre l'environnement courant.
function getConfig() {
  const env = process.env;
  const required = [
    'MY_API_TOKEN',
    'MY_HUB_UNIT_INSTANCE_ID',
    'MY_ENGAGEMENT_PROJECT_ID',
    'MY_ENGAGEMENT_ACHIEVEMENT_ID',
    'MY_SCHOOL_YEAR',
    'MY_MAX_ENGAGEMENT_MARK',
  ];
  const missing = required.filter((name) => !env[name] || !String(env[name]).trim());
  if (missing.length) {
    throw new MyConfigError(`Configuration my incomplete, variables manquantes : ${missing.join(', ')}`);
  }
  const numeric = {
    unitInstanceId: 'MY_HUB_UNIT_INSTANCE_ID',
    engagementProjectId: 'MY_ENGAGEMENT_PROJECT_ID',
    achievementId: 'MY_ENGAGEMENT_ACHIEVEMENT_ID',
    schoolYear: 'MY_SCHOOL_YEAR',
    maxMark: 'MY_MAX_ENGAGEMENT_MARK',
  };
  const config = {
    baseUrl: (env.MY_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    token: env.MY_API_TOKEN,
  };
  // Le jeton part dans chaque requete : jamais en clair, sauf en test ou vers localhost.
  if (!isAllowedBaseUrl(config.baseUrl, env.NODE_ENV)) {
    throw new MyConfigError('Configuration my invalide : MY_API_URL doit etre en https');
  }
  const invalid = [];
  Object.entries(numeric).forEach(([key, name]) => {
    const value = Number(env[name]);
    if (Number.isNaN(value)) invalid.push(name);
    config[key] = value;
  });
  if (invalid.length) {
    throw new MyConfigError(`Configuration my invalide, valeurs non numeriques : ${invalid.join(', ')}`);
  }
  return config;
}

function describeError(err, status) {
  if (status === 401 || status === 403) return 'Clé API my invalide ou expirée';
  const body = err.response && err.response.data;
  const detail = body && typeof body.message === 'string' ? body.message : null;
  if (status) return `Erreur my (HTTP ${status})${detail ? ` : ${detail}` : ''}`;
  return 'my injoignable ou sans réponse';
}

// Les messages ne reprennent jamais err.message ni la config axios, qui peuvent contenir le jeton.
async function call(step, { method, path, data, params }) {
  const config = getConfig();
  try {
    const res = await axios.request({
      method,
      url: `${config.baseUrl}${path}`,
      data,
      params,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json' },
    });
    return res.data;
  } catch (err) {
    const status = (err && err.response && err.response.status) || 0;
    throw new MyApiError(describeError(err || {}, status), { status, step });
  }
}

// Un id absent ou non numerique ne doit jamais etre pris pour un echec sans effet :
// my a peut-etre cree l'objet, d'ou le message qui demande de verifier avant de relancer.
function requireId(data, step) {
  const id = data && typeof data === 'object' ? Number(data.id) : NaN;
  if (data == null || data.id == null || data.id === '' || !Number.isFinite(id)) {
    throw new MyApiError(UNEXPECTED_RESPONSE_MESSAGE, { step });
  }
  return id;
}

async function createActivity({ name, description, startDate, endDate, duration }) {
  const { unitInstanceId } = getConfig();
  const data = await call('createActivity', {
    method: 'POST',
    path: `/units/instances/${unitInstanceId}/activities`,
    data: {
      name,
      description,
      startDate,
      endDate,
      duration,
      slots: false,
      mandatory: false,
      forceRegistration: false,
      plannableSessions: 1,
    },
  });
  return { id: requireId(data, 'createActivity') };
}

async function createEvent({ activityInstanceId, title, startDate, endDate }) {
  const data = await call('createEvent', {
    method: 'POST',
    path: '/events',
    data: { activityInstanceId, title, startDate, endDate },
  });
  return { id: requireId(data, 'createEvent') };
}

// Activites de l'instance d'unite portant exactement ce nom, avec leur description
// (le resume de l'instance ne la donne pas : une lecture par activite candidate).
async function findActivitiesByName(name) {
  const { unitInstanceId } = getConfig();
  const summary = await call('findActivitiesByName', {
    method: 'GET',
    path: `/units/instances/${unitInstanceId}/summary`,
  });
  if (!summary || !Array.isArray(summary.activities)) {
    throw new MyApiError(UNEXPECTED_RESPONSE_MESSAGE, { step: 'findActivitiesByName' });
  }
  const candidates = summary.activities.filter((a) => a && a.name === name);
  const result = [];
  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const detail = await call('findActivitiesByName', {
      method: 'GET',
      path: `/units/instances/${unitInstanceId}/activities/${requireId(candidate, 'findActivitiesByName')}`,
    });
    result.push({
      id: requireId(detail, 'findActivitiesByName'),
      name: detail.name,
      description: typeof detail.description === 'string' ? detail.description : '',
    });
  }
  return result;
}

async function listActivityEvents(activityInstanceId) {
  const rows = await call('listActivityEvents', {
    method: 'GET',
    path: `/events/by-activity/${activityInstanceId}`,
  });
  if (!Array.isArray(rows)) {
    throw new MyApiError(UNEXPECTED_RESPONSE_MESSAGE, { step: 'listActivityEvents' });
  }
  return rows.map((e) => ({
    id: requireId(e, 'listActivityEvents'),
    title: e.title,
    startDate: e.startDate,
  }));
}

async function registerStudent(eventId, login) {
  try {
    await call('registerStudent', {
      method: 'POST',
      path: `/events/${eventId}/registrations/${encodeURIComponent(login)}`,
    });
  } catch (err) {
    if (err instanceof MyApiError && err.status === 409) return;
    throw err;
  }
}

async function setPresent(eventId, login) {
  await call('setPresent', {
    method: 'POST',
    path: `/events/${eventId}/attendance/set`,
    data: { records: [{ login, status: 'present' }] },
  });
}

async function findEngagementRegistrationId(login) {
  const { schoolYear, engagementProjectId } = getConfig();
  const rows = await call('findEngagementRegistrationId', {
    method: 'GET',
    path: `/students/${encodeURIComponent(login)}/projects`,
    params: { schoolYear },
  });
  const row = (Array.isArray(rows) ? rows : []).find(
    (r) => Number(r.projectInstanceId) === engagementProjectId
  );
  return row && row.registrationId != null ? row.registrationId : null;
}

async function openAssessmentSession(registrationId) {
  const data = await call('openAssessmentSession', {
    method: 'POST',
    path: `/evaluations/assessments/session/from-project-registration/${registrationId}`,
  });
  return data.assessmentSessionId;
}

async function getAssessmentSession(sessionId) {
  return call('getAssessmentSession', {
    method: 'GET',
    path: `/evaluations/assessments/session/${sessionId}`,
  });
}

async function saveAssessment(sessionId, { login, mark, individualComment, groupComment }) {
  const { achievementId } = getConfig();
  await call('saveAssessment', {
    method: 'PUT',
    path: `/evaluations/assessments/session/${sessionId}/assessments`,
    data: { assessments: [{ login, achievementId, mark, individualComment, groupComment }] },
  });
}

module.exports = {
  MyConfigError,
  MyApiError,
  getConfig,
  createActivity,
  createEvent,
  findActivitiesByName,
  listActivityEvents,
  registerStudent,
  setPresent,
  findEngagementRegistrationId,
  openAssessmentSession,
  getAssessmentSession,
  saveAssessment,
};
