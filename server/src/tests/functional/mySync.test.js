jest.mock('../../utils/backgroundJobs');
jest.mock('../../services/externalService');
jest.mock('../../services/my/myClient', () => {
  const actual = jest.requireActual('../../services/my/myClient');
  return {
    MyApiError: actual.MyApiError,
    MyConfigError: actual.MyConfigError,
    getConfig: jest.fn(),
    createActivity: jest.fn(),
    createEvent: jest.fn(),
    registerStudent: jest.fn(),
    setPresent: jest.fn(),
    findEngagementRegistrationId: jest.fn(),
    openAssessmentSession: jest.fn(),
    getAssessmentSession: jest.fn(),
    saveAssessment: jest.fn(),
  };
});

const request = require('supertest');
const app = require('../../app');
const Project = require('../../models/Project');
const my = require('../../services/my/myClient');
const { createUser, createAdmin, authHeader } = require('../helpers/auth');

const CONFIG = { achievementId: 7, maxMark: 20 };

async function createProject(student, overrides = {}) {
  return Project.create({
    name: 'Projet termine',
    description: 'Une description',
    objectives: 'Des objectifs',
    technologies: ['Node.js'],
    studentCount: 1,
    links: {
      github: 'https://github.com/user/personal-repo',
      projectGithub: 'https://github.com/user/project-repo',
    },
    status: 'completed',
    credits: 2,
    defenseDate: new Date('2026-11-20T10:00:00Z'),
    members: [{ email: student.email, userId: student._id, isCreator: true }],
    submittedBy: { userId: student._id, name: student.name, email: student.email },
    ...overrides,
  });
}

function mockHappyPath() {
  my.getConfig.mockReturnValue(CONFIG);
  my.createActivity.mockResolvedValue({ id: 11 });
  my.createEvent.mockResolvedValue({ id: 22 });
  my.registerStudent.mockResolvedValue();
  my.setPresent.mockResolvedValue();
  my.findEngagementRegistrationId.mockResolvedValue(33);
  my.openAssessmentSession.mockResolvedValue(44);
  my.getAssessmentSession.mockResolvedValue({ session: { confirmedAt: null }, assessments: {} });
  my.saveAssessment.mockResolvedValue();
}

const sync = (admin, project) =>
  request(app).post(`/api/projects/${project._id}/sync-my`).set(authHeader(admin));

beforeEach(() => {
  jest.resetAllMocks();
  mockHappyPath();
});

describe('POST /api/projects/:id/sync-my', () => {
  it('student -> 403', async () => {
    const student = await createUser();
    const project = await createProject(student);
    const res = await sync(student, project);
    expect(res.status).toBe(403);
    expect(my.createActivity).not.toHaveBeenCalled();
  });

  it('no token -> 401', async () => {
    const project = await createProject(await createUser());
    const res = await request(app).post(`/api/projects/${project._id}/sync-my`);
    expect(res.status).toBe(401);
  });

  it('unknown project -> 404', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .post('/api/projects/507f1f77bcf86cd799439011/sync-my')
      .set(authHeader(admin));
    expect(res.status).toBe(404);
  });

  it('not completed -> 400', async () => {
    const admin = await createAdmin();
    const project = await createProject(await createUser(), { status: 'approved' });
    const res = await sync(admin, project);
    expect(res.status).toBe(400);
    expect(my.createActivity).not.toHaveBeenCalled();
  });

  it.each([[0], [null]])('credits %p -> 400', async (credits) => {
    const admin = await createAdmin();
    const project = await createProject(await createUser(), { credits });
    const res = await sync(admin, project);
    expect(res.status).toBe(400);
    expect(my.createActivity).not.toHaveBeenCalled();
  });

  it('no defenseDate -> 400', async () => {
    const admin = await createAdmin();
    const project = await createProject(await createUser(), { defenseDate: undefined });
    const res = await sync(admin, project);
    expect(res.status).toBe(400);
    expect(my.createActivity).not.toHaveBeenCalled();
  });

  it('already done -> 400', async () => {
    const admin = await createAdmin();
    const project = await createProject(await createUser(), { mySync: { status: 'done' } });
    const res = await sync(admin, project);
    expect(res.status).toBe(400);
    expect(my.createActivity).not.toHaveBeenCalled();
  });

  it('completed project with the mocked client succeeds -> 200, mySync.status done, activityId stored', async () => {
    const admin = await createAdmin();
    const project = await createProject(await createUser());
    const res = await sync(admin, project);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.mySync.status).toBe('done');
    expect(res.body.data.mySync.activityId).toBe(11);
    const fresh = await Project.findById(project._id);
    expect(fresh.mySync.status).toBe('done');
    expect(fresh.mySync.activityId).toBe(11);
    expect(fresh.mySync.inProgressUntil == null).toBe(true);
  });

  it('missing env config -> 500 with the missing variable names, my client never called', async () => {
    const actual = jest.requireActual('../../services/my/myClient');
    my.getConfig.mockImplementation(actual.getConfig);
    const saved = { ...process.env };
    Object.keys(process.env)
      .filter((k) => k.startsWith('MY_'))
      .forEach((k) => delete process.env[k]);
    try {
      const admin = await createAdmin();
      const project = await createProject(await createUser());
      const res = await sync(admin, project);
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).toContain('MY_API_TOKEN');
      expect(my.createActivity).not.toHaveBeenCalled();
      const fresh = await Project.findById(project._id);
      expect(fresh.mySync.inProgressUntil == null).toBe(true);
    } finally {
      process.env = saved;
    }
  });

  it('my returns 401 -> 200 with status partial and the expired-key message', async () => {
    my.createActivity.mockRejectedValue(
      new my.MyApiError('Unauthorized', { status: 401, step: 'createActivity' })
    );
    const admin = await createAdmin();
    const project = await createProject(await createUser());
    const res = await sync(admin, project);
    expect(res.status).toBe(200);
    expect(res.body.data.mySync.status).toBe('partial');
    expect(res.body.data.mySync.lastError).toBe('Clé API my invalide ou expirée');
  });

  it('second call while the lock is active -> 409 and createActivity called once', async () => {
    my.createActivity.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ id: 11 }), 300))
    );
    const admin = await createAdmin();
    const project = await createProject(await createUser());
    const [a, b] = await Promise.all([sync(admin, project), sync(admin, project)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(my.createActivity).toHaveBeenCalledTimes(1);
  });

  it('active lock set beforehand -> 409, expired lock -> proceeds', async () => {
    const admin = await createAdmin();
    const locked = await createProject(await createUser(), {
      mySync: { inProgressUntil: new Date(Date.now() + 60000) },
    });
    const res = await sync(admin, locked);
    expect(res.status).toBe(409);
    expect(my.createActivity).not.toHaveBeenCalled();

    const expired = await createProject(await createUser(), {
      mySync: { inProgressUntil: new Date(Date.now() - 1000) },
    });
    const res2 = await sync(admin, expired);
    expect(res2.status).toBe(200);
  });

  it('lock is released after a failure so a retry works', async () => {
    my.createActivity.mockRejectedValueOnce(
      new my.MyApiError('boom', { status: 500, step: 'createActivity' })
    );
    const admin = await createAdmin();
    const project = await createProject(await createUser());
    const first = await sync(admin, project);
    expect(first.status).toBe(200);
    expect(first.body.data.mySync.status).toBe('partial');
    // Le verrou doit deja etre libere au moment ou la reponse arrive, sans attente.
    const afterFirst = await Project.findById(project._id);
    expect(afterFirst.mySync.inProgressUntil == null).toBe(true);
    const second = await sync(admin, project);
    expect(second.status).toBe(200);
    expect(second.body.data.mySync.status).toBe('done');
    expect(my.createActivity).toHaveBeenCalledTimes(2);
  });
});
