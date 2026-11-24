// Orchestration reprenable de l'envoi d'un projet Hub termine vers my.
// Chaque appel reussi est suivi d'un project.save() : une relance ne refait jamais une etape faite.
// Le Hub ne confirme ni ne rouvre jamais une evaluation sur my.

const EVENT_DURATION_MINUTES = 30;
const POINTS_PER_CREDIT = 4;
const DEFAULT_FRONTEND_URL = 'http://localhost:3000';

const CONFIRMED_SESSION_MESSAGE =
  "Session d'évaluation déjà confirmée sur my : la rouvrir sur my puis relancer";
const NOT_REGISTERED_MESSAGE =
  "Étudiant introuvable dans le projet Student Engagement sur my (hors cursus ou autre promotion)";
const MARK_CHANGED_MESSAGE =
  'Points non appliqués : note modifiée entre-temps sur my, vérifier sur my avant de relancer';

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

function findAssessmentRow(sessionBody, login, achievementId) {
  const assessments = (sessionBody && sessionBody.assessments) || {};
  const wanted = String(login).toLowerCase();
  const key = Object.keys(assessments).find((k) => k.toLowerCase() === wanted);
  const rows = key && Array.isArray(assessments[key]) ? assessments[key] : [];
  return rows.find((a) => Number(a.achievementId) === Number(achievementId)) || null;
}

function extractExistingAssessment(sessionBody, login, achievementId) {
  const row = findAssessmentRow(sessionBody, login, achievementId);
  const session = (sessionBody && sessionBody.session) || {};
  return {
    mark: row ? Number(row.mark) || 0 : 0,
    individualComment: row && row.individualComment ? row.individualComment : '',
    groupComment: row && row.groupComment ? row.groupComment : '',
    confirmed: session.confirmedAt != null,
  };
}

function activityName(project) {
  return `Projet HUB - ${project.name}`;
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
    description: `${memberLogins(project).join(', ')} : ${base}/admin/projects/${project._id}`,
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

async function applyPoints(project, st, client, config) {
  const registrationId = await client.findEngagementRegistrationId(st.email);
  if (registrationId == null) {
    st.error = NOT_REGISTERED_MESSAGE;
    return;
  }
  const sessionId = await client.openAssessmentSession(registrationId);
  const body = await client.getAssessmentSession(sessionId);
  const existing = extractExistingAssessment(body, st.email, config.achievementId);

  let target;
  if (st.markTarget != null) {
    // Reprise apres un PUT dont le resultat n'a pas ete enregistre : jamais d'ajout a l'aveugle.
    if (existing.mark === st.markTarget) {
      st.pointsApplied = st.markTarget - st.markBefore;
      await project.save();
      return;
    }
    if (existing.mark !== st.markBefore) {
      st.error = MARK_CHANGED_MESSAGE;
      return;
    }
    if (existing.confirmed) {
      st.error = CONFIRMED_SESSION_MESSAGE;
      return;
    }
    target = st.markTarget;
  } else {
    if (existing.confirmed) {
      st.error = CONFIRMED_SESSION_MESSAGE;
      return;
    }
    try {
      target = computeTargetMark(existing.mark, project.credits, config.maxMark);
    } catch (err) {
      if (err instanceof MarkOverflowError) {
        st.error = err.message;
        return;
      }
      throw err;
    }
    const row = findAssessmentRow(body, st.email, config.achievementId);
    const allowed = row && row.achievement && row.achievement.markValues;
    if (Array.isArray(allowed) && allowed.length && !allowed.map(Number).includes(target)) {
      st.error = `Points non appliqués : la note ${target} n'est pas une valeur autorisée sur my (${allowed.join(', ')})`;
      return;
    }
    st.markBefore = existing.mark;
    st.markTarget = target;
    await project.save();
  }

  // Le PUT remplace note et commentaires : on renvoie les commentaires relus juste avant.
  await client.saveAssessment(sessionId, {
    login: st.email,
    mark: target,
    individualComment: existing.individualComment,
    groupComment: existing.groupComment,
  });
  st.pointsApplied = st.markTarget - st.markBefore;
  await project.save();
}

async function syncStudent(project, st, client, config) {
  st.error = null;
  try {
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
      await applyPoints(project, st, client, config);
    }
  } catch (err) {
    st.error = errorMessage(err);
  }
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
    if (project.mySync.activityId == null) {
      const activity = await client.createActivity(buildActivityPayload(project, frontendUrl));
      project.mySync.activityId = activity.id;
      await project.save();
    }
    if (project.mySync.eventId == null) {
      const { start, end } = eventWindow(project);
      const event = await client.createEvent({
        activityInstanceId: project.mySync.activityId,
        title: activityName(project),
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
      project.mySync.eventId = event.id;
      await project.save();
    }
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
};
