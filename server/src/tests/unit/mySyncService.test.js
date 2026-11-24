const mongoose = require('mongoose');
const Project = require('../../models/Project');
const fixture = require('../fixtures/mySessionResponse.json');
const {
  MarkOverflowError,
  computeTargetMark,
  extractExistingAssessment,
  buildActivityPayload,
  runSync,
} = require('../../services/my/mySyncService');

const ACHIEVEMENT_ID = 5833;
const CONFIRMED_MESSAGE = "Session d'évaluation déjà confirmée sur my : la rouvrir sur my puis relancer";

class FakeApiError extends Error {
  constructor(message, { status = 0, step = '' } = {}) {
    super(message);
    this.name = 'MyApiError';
    this.status = status;
    this.step = step;
  }
}

function sessionBody(login, mark, { confirmed = false, individualComment = '', groupComment = '' } = {}) {
  return {
    session: { id: 1, confirmedAt: confirmed ? '2026-11-23T14:03:54.759Z' : null },
    assessments: {
      [login]: [
        { achievementId: 5835, mark: 3, individualComment: 'other', groupComment: 'other' },
        {
          achievementId: ACHIEVEMENT_ID,
          mark,
          individualComment,
          groupComment,
          achievement: { id: ACHIEVEMENT_ID, markValues: [0, 2, 4, 6, 8, 10, 12, 14, 16] },
        },
      ],
    },
  };
}

// Fake my: one mark per login, read by getAssessmentSession, written by saveAssessment.
function makeClient({ marks = {}, comments = {}, confirmed = {}, unknown = [] } = {}) {
  const state = { marks: { ...marks } };
  const sessionLogin = {};
  let nextSession = 100;
  const client = {
    MyApiError: FakeApiError,
    getConfig: jest.fn(() => ({ maxMark: 16, achievementId: ACHIEVEMENT_ID, schoolYear: 2026 })),
    createActivity: jest.fn(async () => ({ id: 4242 })),
    createEvent: jest.fn(async () => ({ id: 5353 })),
    registerStudent: jest.fn(async () => {}),
    setPresent: jest.fn(async () => {}),
    findEngagementRegistrationId: jest.fn(async (login) => (unknown.includes(login) ? null : `reg-${login}`)),
    openAssessmentSession: jest.fn(async (registrationId) => {
      const id = nextSession++;
      sessionLogin[id] = registrationId.replace(/^reg-/, '');
      return id;
    }),
    getAssessmentSession: jest.fn(async (sessionId) => {
      const login = sessionLogin[sessionId];
      const c = comments[login] || {};
      return sessionBody(login, state.marks[login] || 0, {
        confirmed: !!confirmed[login],
        individualComment: c.individualComment || '',
        groupComment: c.groupComment || '',
      });
    }),
    saveAssessment: jest.fn(async (sessionId, { login, mark }) => {
      state.marks[login] = mark;
    }),
  };
  return { client, state };
}

// Records every property read on the client, to prove no confirm/reopen function is ever touched.
function spyAccess(client) {
  const accessed = new Set();
  const proxy = new Proxy(client, {
    get(target, prop) {
      if (typeof prop === 'string') accessed.add(prop);
      return target[prop];
    },
  });
  return { proxy, accessed };
}

async function makeProject(overrides = {}) {
  return Project.create({
    name: 'Chartscope',
    description: 'desc',
    objectives: 'obj',
    technologies: ['js'],
    studentCount: 2,
    links: { github: 'https://github.com/a', projectGithub: 'https://github.com/a/b' },
    status: 'completed',
    credits: 2,
    members: [{ email: 'Alice.Martin@epitech.eu', isCreator: true }, { email: 'bob.durand@epitech.eu' }],
    submittedBy: { userId: new mongoose.Types.ObjectId(), name: 'Alice', email: 'alice.martin@epitech.eu' },
    defenseDate: new Date('2026-11-20T12:00:00.000Z'),
    ...overrides,
  });
}

const studentOf = (project, email) => project.mySync.students.find((s) => s.email === email);
const ALICE = 'alice.martin@epitech.eu';
const BOB = 'bob.durand@epitech.eu';

describe('mySyncService helpers', () => {
  test('computeTargetMark adds credits x 4', () => {
    expect(computeTargetMark(0, 2, 16)).toBe(8);
  });

  test('computeTargetMark throws MarkOverflowError above the max', () => {
    expect(() => computeTargetMark(12, 2, 16)).toThrow(MarkOverflowError);
  });

  test('extractExistingAssessment reads mark and comments from the real fixture', () => {
    expect(extractExistingAssessment(fixture, 'Student.Example@epitech.eu', ACHIEVEMENT_ID)).toEqual({
      mark: 12,
      individualComment: 'Projet A + Projet B',
      groupComment: '',
      confirmed: true,
    });
  });

  test('extractExistingAssessment returns zeros and confirmed false for a session without the achievement row', () => {
    const body = {
      session: { confirmedAt: null },
      assessments: { 'student.example@epitech.eu': [{ achievementId: 5835, mark: 4, individualComment: 'x', groupComment: 'y' }] },
    };
    expect(extractExistingAssessment(body, 'student.example@epitech.eu', ACHIEVEMENT_ID)).toEqual({
      mark: 0,
      individualComment: '',
      groupComment: '',
      confirmed: false,
    });
  });

  test('buildActivityPayload names the activity "Projet HUB - <nom>" and links the admin page', async () => {
    const project = await makeProject();
    const payload = buildActivityPayload(project, 'https://hub.example');
    expect(payload.name).toBe('Projet HUB - Chartscope');
    expect(payload.description).toBe(
      `${ALICE}, ${BOB} : https://hub.example/admin/projects/${project._id}`
    );
    expect(payload.duration).toBe(30);
    const start = new Date(payload.startDate).getTime();
    const end = new Date(payload.endDate).getTime();
    const defense = project.defenseDate.getTime();
    expect(start).toBeLessThanOrEqual(defense);
    expect(end).toBeGreaterThanOrEqual(defense + 30 * 60 * 1000);
  });
});

describe('runSync', () => {
  test('runSync happy path: one activity, one event, each member registered, present, points added, status done', async () => {
    const project = await makeProject();
    const { client } = makeClient({
      comments: { [ALICE]: { individualComment: 'Projet X', groupComment: 'Groupe Y' } },
    });

    await runSync(project, client);

    expect(client.createActivity).toHaveBeenCalledTimes(1);
    expect(client.createActivity.mock.calls[0][0].name).toBe('Projet HUB - Chartscope');
    expect(client.createEvent).toHaveBeenCalledTimes(1);
    expect(client.createEvent).toHaveBeenCalledWith(expect.objectContaining({
      activityInstanceId: 4242,
      title: 'Projet HUB - Chartscope',
      startDate: '2026-11-20T12:00:00.000Z',
      endDate: '2026-11-20T12:30:00.000Z',
    }));
    expect(client.registerStudent).toHaveBeenCalledWith(5353, ALICE);
    expect(client.registerStudent).toHaveBeenCalledWith(5353, BOB);
    expect(client.setPresent).toHaveBeenCalledWith(5353, ALICE);
    expect(client.setPresent).toHaveBeenCalledWith(5353, BOB);
    expect(client.saveAssessment).toHaveBeenCalledTimes(2);
    expect(client.saveAssessment).toHaveBeenCalledWith(expect.any(Number), {
      login: ALICE, mark: 8, individualComment: 'Projet X', groupComment: 'Groupe Y',
    });
    expect(client.saveAssessment).toHaveBeenCalledWith(expect.any(Number), {
      login: BOB, mark: 8, individualComment: '', groupComment: '',
    });

    const saved = await Project.findById(project._id);
    expect(saved.mySync.status).toBe('done');
    expect(saved.mySync.activityId).toBe(4242);
    expect(saved.mySync.eventId).toBe(5353);
    expect(saved.mySync.lastError).toBeFalsy();
    expect(saved.mySync.lastAttemptAt).toBeInstanceOf(Date);
    expect(saved.mySync.students).toHaveLength(2);
    for (const email of [ALICE, BOB]) {
      const st = studentOf(saved, email);
      expect(st).toMatchObject({
        registered: true, present: true, markBefore: 0, markTarget: 8, pointsApplied: 8, error: null,
      });
    }
  });

  test('runSync resumes: with activityId already stored, createActivity is not called again', async () => {
    const project = await makeProject({ mySync: { activityId: 777, status: 'partial' } });
    const { client } = makeClient();

    await runSync(project, client);

    expect(client.createActivity).not.toHaveBeenCalled();
    expect(client.createEvent).toHaveBeenCalledWith(expect.objectContaining({ activityInstanceId: 777 }));
    const saved = await Project.findById(project._id);
    expect(saved.mySync.activityId).toBe(777);
    expect(saved.mySync.status).toBe('done');
  });

  test('runSync skips registration, presence and points already done', async () => {
    const project = await makeProject({
      mySync: {
        activityId: 1, eventId: 2, status: 'partial',
        students: [
          { email: ALICE, registered: true, present: true, markBefore: 0, markTarget: 8, pointsApplied: 8 },
          { email: BOB, registered: true, present: false },
        ],
      },
    });
    const { client } = makeClient();

    await runSync(project, client);

    expect(client.registerStudent).not.toHaveBeenCalled();
    expect(client.setPresent).toHaveBeenCalledTimes(1);
    expect(client.setPresent).toHaveBeenCalledWith(2, BOB);
    expect(client.findEngagementRegistrationId).toHaveBeenCalledTimes(1);
    expect(client.saveAssessment).toHaveBeenCalledTimes(1);
    expect((await Project.findById(project._id)).mySync.status).toBe('done');
  });

  test('runSync does not add points twice when markTarget is set and the mark already equals markTarget', async () => {
    const project = await makeProject({
      members: [{ email: ALICE }],
      mySync: {
        activityId: 1, eventId: 2, status: 'partial',
        students: [{ email: ALICE, registered: true, present: true, markBefore: 4, markTarget: 12, pointsApplied: null }],
      },
    });
    const { client, state } = makeClient({ marks: { [ALICE]: 12 } });

    await runSync(project, client);

    expect(client.saveAssessment).not.toHaveBeenCalled();
    expect(state.marks[ALICE]).toBe(12);
    const saved = await Project.findById(project._id);
    expect(studentOf(saved, ALICE)).toMatchObject({ markBefore: 4, markTarget: 12, pointsApplied: 8, error: null });
    expect(saved.mySync.status).toBe('done');
  });

  test('runSync redoes the PUT when markTarget is set and the mark still equals markBefore', async () => {
    const project = await makeProject({
      members: [{ email: ALICE }],
      mySync: {
        activityId: 1, eventId: 2, status: 'partial',
        students: [{ email: ALICE, registered: true, present: true, markBefore: 4, markTarget: 12, pointsApplied: null }],
      },
    });
    const { client, state } = makeClient({
      marks: { [ALICE]: 4 },
      comments: { [ALICE]: { individualComment: 'Projet A' } },
    });

    await runSync(project, client);

    expect(client.saveAssessment).toHaveBeenCalledTimes(1);
    expect(client.saveAssessment).toHaveBeenCalledWith(expect.any(Number), {
      login: ALICE, mark: 12, individualComment: 'Projet A', groupComment: '',
    });
    expect(state.marks[ALICE]).toBe(12);
    const saved = await Project.findById(project._id);
    expect(studentOf(saved, ALICE)).toMatchObject({ markBefore: 4, markTarget: 12, pointsApplied: 8, error: null });
    expect(saved.mySync.status).toBe('done');
  });

  test('runSync marks the student in error when the mark changed to another value in between', async () => {
    const project = await makeProject({
      members: [{ email: ALICE }],
      mySync: {
        activityId: 1, eventId: 2, status: 'partial',
        students: [{ email: ALICE, registered: true, present: true, markBefore: 4, markTarget: 12, pointsApplied: null }],
      },
    });
    const { client } = makeClient({ marks: { [ALICE]: 6 } });

    await runSync(project, client);

    expect(client.saveAssessment).not.toHaveBeenCalled();
    const saved = await Project.findById(project._id);
    const st = studentOf(saved, ALICE);
    expect(st.pointsApplied).toBeNull();
    expect(st.error).toMatch(/note modifiée entre-temps/);
    expect(saved.mySync.status).toBe('partial');
  });

  test('runSync: a confirmed session puts the student in error with the confirmed-session message and never calls saveAssessment', async () => {
    const project = await makeProject({ members: [{ email: ALICE }] });
    const { client } = makeClient({ confirmed: { [ALICE]: true } });

    await runSync(project, client);

    expect(client.saveAssessment).not.toHaveBeenCalled();
    const saved = await Project.findById(project._id);
    const st = studentOf(saved, ALICE);
    expect(st.error).toBe(CONFIRMED_MESSAGE);
    expect(st.registered).toBe(true);
    expect(st.present).toBe(true);
    expect(st.pointsApplied).toBeNull();
    expect(st.markTarget).toBeNull();
    expect(saved.mySync.status).toBe('partial');
  });

  test('overflow: member at 12 points with a 2-credit project is in error, saveAssessment not called for him, other members done, status partial', async () => {
    const project = await makeProject();
    const { client, state } = makeClient({ marks: { [ALICE]: 12 } });

    await runSync(project, client);

    expect(client.saveAssessment).toHaveBeenCalledTimes(1);
    expect(client.saveAssessment.mock.calls[0][1].login).toBe(BOB);
    expect(state.marks[ALICE]).toBe(12);
    const saved = await Project.findById(project._id);
    const alice = studentOf(saved, ALICE);
    expect(alice.error).toMatch(/16/);
    expect(alice.markTarget).toBeNull();
    expect(alice.pointsApplied).toBeNull();
    expect(studentOf(saved, BOB)).toMatchObject({ pointsApplied: 8, error: null });
    expect(saved.mySync.status).toBe('partial');
  });

  test('unknown member (findEngagementRegistrationId returns null) is in error, others processed, status partial', async () => {
    const project = await makeProject();
    const { client } = makeClient({ unknown: [ALICE] });

    await runSync(project, client);

    expect(client.openAssessmentSession).toHaveBeenCalledTimes(1);
    const saved = await Project.findById(project._id);
    expect(studentOf(saved, ALICE).error).toMatch(/Student Engagement/);
    expect(studentOf(saved, ALICE).pointsApplied).toBeNull();
    expect(studentOf(saved, BOB)).toMatchObject({ pointsApplied: 8, error: null });
    expect(saved.mySync.status).toBe('partial');
  });

  test('a student-level my error (registration refused) does not stop other students', async () => {
    const project = await makeProject();
    const { client } = makeClient();
    client.registerStudent.mockImplementation(async (eventId, login) => {
      if (login === ALICE) throw new FakeApiError('Erreur my (HTTP 404)', { status: 404, step: 'registerStudent' });
    });

    await runSync(project, client);

    const saved = await Project.findById(project._id);
    expect(studentOf(saved, ALICE)).toMatchObject({ registered: false, present: false, error: 'Erreur my (HTTP 404)' });
    expect(client.setPresent).not.toHaveBeenCalledWith(5353, ALICE);
    expect(studentOf(saved, BOB)).toMatchObject({ registered: true, present: true, pointsApplied: 8 });
    expect(saved.mySync.status).toBe('partial');
  });

  test('an error creating the activity stops everything and leaves status partial with lastError set', async () => {
    const project = await makeProject();
    const { client } = makeClient();
    client.createActivity.mockRejectedValue(
      new FakeApiError('Clé API my invalide ou expirée', { status: 401, step: 'createActivity' })
    );

    await expect(runSync(project, client)).resolves.toBeDefined();

    expect(client.createEvent).not.toHaveBeenCalled();
    expect(client.registerStudent).not.toHaveBeenCalled();
    expect(client.saveAssessment).not.toHaveBeenCalled();
    const saved = await Project.findById(project._id);
    expect(saved.mySync.status).toBe('partial');
    expect(saved.mySync.lastError).toBe('Clé API my invalide ou expirée');
    expect(saved.mySync.activityId).toBeUndefined();
  });

  test('an error creating the event keeps the stored activityId and stops everything', async () => {
    const project = await makeProject();
    const { client } = makeClient();
    client.createEvent.mockRejectedValue(new FakeApiError('Erreur my (HTTP 500)', { status: 500 }));

    await runSync(project, client);

    expect(client.registerStudent).not.toHaveBeenCalled();
    const saved = await Project.findById(project._id);
    expect(saved.mySync.activityId).toBe(4242);
    expect(saved.mySync.eventId).toBeUndefined();
    expect(saved.mySync.status).toBe('partial');
    expect(saved.mySync.lastError).toBe('Erreur my (HTTP 500)');
  });

  test('a failed PUT keeps markBefore/markTarget written and pointsApplied empty', async () => {
    const project = await makeProject({ members: [{ email: ALICE }] });
    const { client } = makeClient({ marks: { [ALICE]: 2 } });
    client.saveAssessment.mockRejectedValue(new FakeApiError('my injoignable ou sans réponse'));

    await runSync(project, client);

    const saved = await Project.findById(project._id);
    expect(studentOf(saved, ALICE)).toMatchObject({
      markBefore: 2, markTarget: 10, pointsApplied: null, error: 'my injoignable ou sans réponse',
    });
    expect(saved.mySync.status).toBe('partial');
  });

  test('never calls anything that confirms the assessment', async () => {
    const project = await makeProject();
    const { client } = makeClient();
    const { proxy, accessed } = spyAccess(client);

    await runSync(project, proxy);

    const touched = [...accessed];
    expect(touched.filter((name) => /confirm|reopen|publish/i.test(name))).toEqual([]);
    const allowed = [
      'MyApiError', 'MyConfigError', 'getConfig', 'createActivity', 'createEvent', 'registerStudent',
      'setPresent', 'findEngagementRegistrationId', 'openAssessmentSession', 'getAssessmentSession',
      'saveAssessment',
    ];
    expect(touched.filter((name) => !allowed.includes(name))).toEqual([]);
  });
});
