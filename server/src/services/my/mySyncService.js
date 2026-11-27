// Orchestration reprenable de l'envoi d'un projet Hub termine vers my.
// Chaque appel reussi est suivi d'un project.save() : une relance ne refait jamais une etape faite.
// Le Hub ne confirme ni ne rouvre jamais une evaluation sur my.

const Project = require('../../models/Project');

const EVENT_DURATION_MINUTES = 30;
const POINTS_PER_CREDIT = 4;
const DEFAULT_FRONTEND_URL = 'http://localhost:3000';
const LOCK_DURATION_MS = 2 * 60 * 1000;

const CONFIRMED_SESSION_MESSAGE =
  "Session d'évaluation déjà confirmée sur my : la rouvrir sur my puis relancer";
const NOT_REGISTERED_MESSAGE =
  "Étudiant introuvable dans le projet Student Engagement sur my (hors cursus ou autre promotion)";
const CONCURRENT_CLAIM_MESSAGE =
  'Points non appliqués : envoi concurrent détecté pour cet étudiant, relancer pour vérifier';

function markChangedMessage(read, before, target) {
  return (
    `Points non appliqués : note modifiée entre-temps sur my (lue ${read}, ` +
    `${before} avant l'envoi, ${target} attendue après), vérifier sur my avant de relancer`
  );
}

class MarkOverflowError extends Error {
  constructor(current, target, maxMark) {
    super(
      `Points non appliqués : la note passerait de ${current} à ${target}, au-delà du maximum ${maxMark}`
    );
    this.name = 'MarkOverflowError';
  }
}

function computeTargetMark(current, credits, maxMark) {
  const target = current + credits * POINTS_PER_CREDIT;
  if (target > maxMark) throw new MarkOverflowError(current, target, maxMark);
  return target;
}

function sameLogin(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

function findAssessmentRow(sessionBody, login, achievementId) {
  const assessments = (sessionBody && sessionBody.assessments) || {};
  const key = Object.keys(assessments).find((k) => sameLogin(k, login));
  const rows = key && Array.isArray(assessments[key]) ? assessments[key] : [];
  return rows.find((a) => Number(a.achievementId) === Number(achievementId)) || null;
}

// Lecture stricte : on n'ecrit jamais une note deduite d'une session qui ne concerne pas
// l'etudiant ou d'une note illisible. Seule une ligne absente pour un etudiant present vaut 0.
function extractExistingAssessment(sessionBody, login, achievementId) {
  const session = (sessionBody && sessionBody.session) || {};
  const students = Array.isArray(session.students) ? session.students : [];
  if (!students.some((s) => s && sameLogin(s.login, login))) {
    throw new Error(
      "Points non appliqués : étudiant absent de la session d'évaluation my, rien n'a été écrit"
    );
  }
  const row = findAssessmentRow(sessionBody, login, achievementId);
  let mark = 0;
  if (row) {
    mark = typeof row.mark === 'number' ? row.mark : NaN;
    if (!Number.isFinite(mark)) {
      throw new Error("Points non appliqués : note illisible sur my, rien n'a été écrit");
    }
  }
  return {
    mark,
    individualComment: row && row.individualComment ? row.individualComment : '',
    groupComment: row && row.groupComment ? row.groupComment : '',
    confirmed: session.confirmedAt != null,
  };
}

function isAllowedMark(target, row) {
  const allowed = row && row.achievement && row.achievement.markValues;
  if (Array.isArray(allowed) && allowed.length) return allowed.map(Number).includes(target);
  // Grille inconnue : la grille Projets Hub n'a que des valeurs paires de 0 a 16.
  return Number.isInteger(target) && target >= 0 && target % 2 === 0;
}

function activityName(project) {
  return `Projet HUB - ${project.name}`;
}

function adminPath(project) {
  return `/admin/projects/${project._id}`;
}

function memberLogins(project) {
  const logins = (project.members || [])
    .map((m) => (m && m.email ? String(m.email).trim().toLowerCase() : ''))
    .filter(Boolean);
  return [...new Set(logins)];
}

function eventWindow(project) {
  const start = new Date(project.defenseDate);
  const end = new Date(start.getTime() + EVENT_DURATION_MINUTES * 60 * 1000);
  return { start, end };
}

// Fenetre de l'activite : la journee (UTC) de la soutenance, etendue si la session deborde minuit.
function buildActivityPayload(project, frontendUrl) {
  const { start, end } = eventWindow(project);
  const dayStart = new Date(start);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(end);
  dayEnd.setUTCHours(23, 59, 59, 999);
  const base = String(frontendUrl || '').replace(/\/+$/, '');
  return {
    name: activityName(project),
    description: `${memberLogins(project).join(', ')} : ${base}${adminPath(project)}`,
    startDate: dayStart.toISOString(),
    endDate: dayEnd.toISOString(),
    duration: EVENT_DURATION_MINUTES,
  };
}

function ensureStudents(project) {
  const students = project.mySync.students;
  memberLogins(project).forEach((login) => {
    if (!students.some((s) => s.email === login)) students.push({ email: login });
  });
}

function isStudentDone(st) {
  return st.registered && st.present && st.pointsApplied != null && !st.error;
}

function errorMessage(err) {
  return (err && err.message) || 'Erreur inconnue';
}

// Prolonge le verrou pose par le controleur pour qu'une synchro longue le garde.
// Sans verrou pose (appel direct), rien n'est cree.
async function renewLock(project) {
  await Project.updateOne(
    { _id: project._id, 'mySync.inProgressUntil': { $ne: null } },
    { $set: { 'mySync.inProgressUntil': new Date(Date.now() + LOCK_DURATION_MS) } }
  );
}

// Verrou en memoire par login : deux projets d'un meme etudiant ne lisent-ecrivent jamais
// la note en meme temps (un seul processus serveur).
const loginQueues = new Map();

function withLoginLock(login, fn) {
  const previous = loginQueues.get(login) || Promise.resolve();
  const run = previous.then(fn);
  const tail = run.catch(() => {});
  loginQueues.set(login, tail);
  tail.then(() => {
    if (loginQueues.get(login) === tail) loginQueues.delete(login);
  });
  return run;
}

// Reserve l'etudiant en base avant le PUT : echoue si un autre envoi a deja ecrit un markTarget.
async function claimStudent(project, st, markBefore, markTarget) {
  const res = await Project.updateOne(
    { _id: project._id, 'mySync.students': { $elemMatch: { email: st.email, markTarget: null } } },
    {
      $set: {
        'mySync.students.$.markBefore': markBefore,
        'mySync.students.$.markTarget': markTarget,
      },
    }
  );
  return res.matchedCount === 1;
}

async function putAndVerify(project, st, client, config, sessionId, existing) {
  // Le PUT remplace note et commentaires : on renvoie les commentaires relus juste avant.
  await client.saveAssessment(sessionId, {
    login: st.email,
    mark: st.markTarget,
    individualComment: existing.individualComment,
    groupComment: existing.groupComment,
  });
  // L'endpoint est en masse et peut ignorer une ligne : on relit avant de conclure.
  const after = extractExistingAssessment(
    await client.getAssessmentSession(sessionId),
    st.email,
    config.achievementId
  );
  if (after.mark !== st.markTarget) {
    // markTarget est conserve : la regle de reprise s'appliquera a la relance.
    st.error = `Points non appliqués : écriture non confirmée par my (note lue ${after.mark}, attendue ${st.markTarget}), relancer`;
    return;
  }
  st.pointsApplied = st.markTarget - st.markBefore;
  await project.save();
}

function findOtherUnfinishedClaim(project, email) {
  return Project.findOne({
    _id: { $ne: project._id },
    'mySync.students': { $elemMatch: { email, markTarget: { $ne: null }, pointsApplied: null } },
  })
    .select('name')
    .lean();
}

function otherProjectMessage(other) {
  return (
    `Points non appliqués : un autre projet (« ${other.name} », n° ${other._id}) a un envoi de points ` +
    `non terminé pour cet étudiant, le relancer d'abord`
  );
}

async function applyPoints(project, st, client, config) {
  const registrationId = await client.findEngagementRegistrationId(st.email);
  if (registrationId == null) {
    st.error = NOT_REGISTERED_MESSAGE;
    return;
  }
  const sessionId = await client.openAssessmentSession(registrationId);
  const body = await client.getAssessmentSession(sessionId);
  const existing = extractExistingAssessment(body, st.email, config.achievementId);

  if (st.markTarget != null) {
    // Reprise apres un PUT dont le resultat n'a pas ete enregistre : jamais d'ajout a l'aveugle.
    if (existing.mark === st.markTarget) {
      st.pointsApplied = st.markTarget - st.markBefore;
      await project.save();
      return;
    }
    if (existing.mark !== st.markBefore) {
      st.error = markChangedMessage(existing.mark, st.markBefore, st.markTarget);
      return;
    }
    if (existing.confirmed) {
      st.error = CONFIRMED_SESSION_MESSAGE;
      return;
    }
    await putAndVerify(project, st, client, config, sessionId, existing);
    return;
  }

  if (existing.confirmed) {
    st.error = CONFIRMED_SESSION_MESSAGE;
    return;
  }
  // La note est cumulative et partagee entre les projets : si un autre projet a reserve une cible
  // sans la terminer, la note lue ici peut deja contenir (ou non) ses points. On ne calcule rien
  // tant qu'il n'est pas termine, sinon la reprise de l'un se confondrait avec l'ecriture de l'autre.
  const blocking = await findOtherUnfinishedClaim(project, st.email);
  if (blocking) {
    st.error = otherProjectMessage(blocking);
    return;
  }
  let target;
  try {
    target = computeTargetMark(existing.mark, project.credits, config.maxMark);
  } catch (err) {
    if (err instanceof MarkOverflowError) {
      st.error = err.message;
      return;
    }
    throw err;
  }
  if (!isAllowedMark(target, findAssessmentRow(body, st.email, config.achievementId))) {
    st.error = `Points non appliqués : la note ${target} n'est pas une valeur autorisée sur my`;
    return;
  }
  if (!(await claimStudent(project, st, existing.mark, target))) {
    st.error = CONCURRENT_CLAIM_MESSAGE;
    return;
  }
  // Deja ecrit en base par la reservation : l'etat en memoire est aligne.
  st.markBefore = existing.mark;
  st.markTarget = target;
  await putAndVerify(project, st, client, config, sessionId, existing);
}

async function syncStudent(project, st, client, config) {
  st.error = null;
  try {
    await renewLock(project);
    if (!st.registered) {
      await client.registerStudent(project.mySync.eventId, st.email);
      st.registered = true;
      await project.save();
    }
    if (!st.present) {
      await client.setPresent(project.mySync.eventId, st.email);
      st.present = true;
      await project.save();
    }
    if (st.pointsApplied == null) {
      await withLoginLock(st.email, () => applyPoints(project, st, client, config));
    }
  } catch (err) {
    st.error = errorMessage(err);
  }
  // Un envoi concurrent a pu ecrire markBefore/markTarget : ne jamais les ecraser depuis la memoire.
  if (st.markTarget == null) {
    st.unmarkModified('markBefore');
    st.unmarkModified('markTarget');
  }
  await project.save();
}

function ambiguityError(kind, ids) {
  return new Error(
    `Plusieurs ${kind} my correspondent à ce projet (n° ${ids.join(', ')}) : vérifier sur my avant de relancer`
  );
}

// Avant de creer, on cherche ce que my a peut-etre deja cree (timeout ou 5xx apres ecriture).
async function ensureActivity(project, client, frontendUrl) {
  if (project.mySync.activityId != null) return;
  const name = activityName(project);
  const matches = (await client.findActivitiesByName(name)).filter(
    (a) => typeof a.description === 'string' && a.description.includes(adminPath(project))
  );
  if (matches.length > 1) throw ambiguityError('activités', matches.map((a) => a.id));
  const id = matches.length === 1
    ? matches[0].id
    : (await client.createActivity(buildActivityPayload(project, frontendUrl))).id;
  project.mySync.activityId = id;
  await project.save();
}

async function ensureEvent(project, client) {
  if (project.mySync.eventId != null) return;
  // L'activite est propre au projet (une seule session) : toute session existante est la sienne.
  const events = await client.listActivityEvents(project.mySync.activityId);
  if (events.length > 1) throw ambiguityError('sessions', events.map((e) => e.id));
  let id;
  if (events.length === 1) {
    id = events[0].id;
  } else {
    const { start, end } = eventWindow(project);
    id = (await client.createEvent({
      activityInstanceId: project.mySync.activityId,
      title: activityName(project),
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    })).id;
  }
  project.mySync.eventId = id;
  await project.save();
}

async function runSync(project, client = require('./myClient')) {
  // Une configuration absente remonte telle quelle (MyConfigError) : rien n'est appele sur my.
  const config = client.getConfig();
  const frontendUrl = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL;

  project.mySync.lastAttemptAt = new Date();
  project.mySync.lastError = null;
  ensureStudents(project);
  await project.save();

  try {
    await renewLock(project);
    await ensureActivity(project, client, frontendUrl);
    await ensureEvent(project, client);
  } catch (err) {
    project.mySync.status = 'partial';
    project.mySync.lastError = errorMessage(err);
    await project.save();
    return project;
  }

  for (const st of project.mySync.students) {
    // eslint-disable-next-line no-await-in-loop
    await syncStudent(project, st, client, config);
  }

  const students = project.mySync.students;
  const failed = students.filter((st) => !isStudentDone(st));
  if (students.length && !failed.length) {
    project.mySync.status = 'done';
    project.mySync.lastError = null;
  } else {
    project.mySync.status = 'partial';
    project.mySync.lastError = students.length
      ? `${failed.length} étudiant(s) non synchronisé(s) sur my`
      : 'Aucun membre à synchroniser';
  }
  await project.save();
  return project;
}

module.exports = {
  MarkOverflowError,
  computeTargetMark,
  extractExistingAssessment,
  buildActivityPayload,
  runSync,
  CONFIRMED_SESSION_MESSAGE,
  LOCK_DURATION_MS,
};
