jest.mock('../../utils/backgroundJobs');
jest.mock('../../services/externalService');

const request = require('supertest');
const app = require('../../app');
const Project = require('../../models/Project');
const { createUser, createAdmin, authHeader } = require('../helpers/auth');

const validProject = {
  name: 'Mon Super Projet',
  description: 'Une description complète du projet',
  objectives: 'Les objectifs du projet',
  technologies: ['Node.js', 'React'],
  studentCount: 1,
  links: {
    github: 'https://github.com/user/personal-repo',
    projectGithub: 'https://github.com/user/project-repo',
  },
};

// ─────────────────────────────────────────────
// POST /api/projects — création
// ─────────────────────────────────────────────
describe('POST /api/projects', () => {
  it('student can create a project → 201', async () => {
    const student = await createUser();
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(student))
      .send(validProject);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe(validProject.name);
    expect(res.body.data.status).toBe('pending');
  });

  it('sets the creator as a member with isCreator=true', async () => {
    const student = await createUser({ email: 'creator@epitech.eu' });
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(student))
      .send(validProject);

    expect(res.status).toBe(201);
    const creator = res.body.data.members.find((m) => m.isCreator);
    expect(creator).toBeDefined();
    expect(creator.email).toBe('creator@epitech.eu');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/projects').send(validProject);
    expect(res.status).toBe(401);
  });

  it('returns 400 if name is missing', async () => {
    const student = await createUser();
    const { name, ...withoutName } = validProject;
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(student))
      .send(withoutName);
    expect(res.status).toBe(400);
  });

  it('returns 400 if github URL is invalid', async () => {
    const student = await createUser();
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(student))
      .send({ ...validProject, links: { github: 'not-a-url', projectGithub: 'https://github.com/user/repo' } });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────
// GET /api/projects — liste admin
// ─────────────────────────────────────────────
describe('GET /api/projects (admin only)', () => {
  it('admin gets all projects → 200 with pagination', async () => {
    const admin = await createAdmin();
    const student = await createUser();

    await request(app).post('/api/projects').set(authHeader(student)).send(validProject);
    await request(app).post('/api/projects').set(authHeader(student)).send({ ...validProject, name: 'Projet 2' });

    const res = await request(app).get('/api/projects').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.data).toHaveLength(2);
  });

  it('student cannot access the full list → 403', async () => {
    const student = await createUser();
    const res = await request(app).get('/api/projects').set(authHeader(student));
    expect(res.status).toBe(403);
  });

  it('filters by status', async () => {
    const admin = await createAdmin();
    const student = await createUser();
    await request(app).post('/api/projects').set(authHeader(student)).send(validProject);

    const res = await request(app)
      .get('/api/projects?status=pending')
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.every((p) => p.status === 'pending')).toBe(true);
  });
});

// ─────────────────────────────────────────────
// GET /api/projects/me — projets de l'étudiant
// ─────────────────────────────────────────────
describe('GET /api/projects/me', () => {
  it('returns only the current student projects', async () => {
    const studentA = await createUser();
    const studentB = await createUser();

    await request(app).post('/api/projects').set(authHeader(studentA)).send(validProject);
    await request(app).post('/api/projects').set(authHeader(studentB)).send({ ...validProject, name: 'Projet B' });

    const res = await request(app).get('/api/projects/me').set(authHeader(studentA));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0].name).toBe(validProject.name);
  });
});

// ─────────────────────────────────────────────
// GET /api/projects/:id — accès par ID
// ─────────────────────────────────────────────
describe('GET /api/projects/:id', () => {
  it('creator can read their project', async () => {
    const student = await createUser();
    const createRes = await request(app)
      .post('/api/projects')
      .set(authHeader(student))
      .send(validProject);
    const projectId = createRes.body.data._id;

    const res = await request(app)
      .get(`/api/projects/${projectId}`)
      .set(authHeader(student));
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(projectId);
  });

  it('unrelated student gets 403', async () => {
    const owner = await createUser();
    const other = await createUser();
    const createRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner))
      .send(validProject);
    const projectId = createRes.body.data._id;

    const res = await request(app)
      .get(`/api/projects/${projectId}`)
      .set(authHeader(other));
    expect(res.status).toBe(403);
  });

  it('admin can read any project', async () => {
    const student = await createUser();
    const admin = await createAdmin();
    const createRes = await request(app)
      .post('/api/projects')
      .set(authHeader(student))
      .send(validProject);
    const projectId = createRes.body.data._id;

    const res = await request(app)
      .get(`/api/projects/${projectId}`)
      .set(authHeader(admin));
    expect(res.status).toBe(200);
  });

  it('returns 404 for an unknown id', async () => {
    const student = await createUser();
    const res = await request(app)
      .get('/api/projects/000000000000000000000000')
      .set(authHeader(student));
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────
// PATCH /api/projects/:id/review — validation admin
// ─────────────────────────────────────────────
describe('PATCH /api/projects/:id/review', () => {
  let admin, student, projectId;

  beforeEach(async () => {
    admin = await createAdmin();
    student = await createUser();
    const createRes = await request(app)
      .post('/api/projects')
      .set(authHeader(student))
      .send(validProject);
    projectId = createRes.body.data._id;
  });

  it('admin can approve a project with credits', async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectId}/review`)
      .set(authHeader(admin))
      .send({ status: 'approved', credits: 1, comments: 'Bon travail' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    expect(res.body.data.credits).toBe(1);
  });

  it('admin can reject a project', async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectId}/review`)
      .set(authHeader(admin))
      .send({ status: 'rejected', comments: 'Insuffisant' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
  });

  it('admin can request changes', async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectId}/review`)
      .set(authHeader(admin))
      .send({ status: 'pending_changes', comments: 'Merci de préciser les objectifs' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('pending_changes');
  });

  it('student cannot review → 403', async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectId}/review`)
      .set(authHeader(student))
      .send({ status: 'approved', credits: 1 });
    expect(res.status).toBe(403);
  });

  it('returns 400 for an invalid status', async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectId}/review`)
      .set(authHeader(admin))
      .send({ status: 'invalid_status' });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────
// GET /api/projects/stats
// ─────────────────────────────────────────────
describe('GET /api/projects/stats', () => {
  it('returns all-time stats when no schoolYear param → 200', async () => {
    const admin = await createAdmin();
    const student = await createUser();
    await request(app)
      .post('/api/projects')
      .set(authHeader(student))
      .send({
        name: 'Projet Stats',
        description: 'desc',
        objectives: 'obj',
        technologies: ['Node.js'],
        studentCount: 1,
        links: { github: 'https://github.com/a/b', projectGithub: 'https://github.com/a/c' },
      });
    const res = await request(app)
      .get('/api/projects/stats')
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
  });

  it('returns 0 total for a future school year with no projects → 200', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .get('/api/projects/stats?schoolYear=2099-2100')
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
  });

  it('student cannot access stats → 403', async () => {
    const student = await createUser();
    const res = await request(app)
      .get('/api/projects/stats')
      .set(authHeader(student));
    expect(res.status).toBe(403);
  });

  it('malformed schoolYear param falls back to all-time stats → 200', async () => {
    const admin = await createAdmin();
    const student = await createUser();
    await request(app)
      .post('/api/projects')
      .set(authHeader(student))
      .send({
        name: 'Projet Malformed',
        description: 'desc',
        objectives: 'obj',
        technologies: ['Node.js'],
        studentCount: 1,
        links: { github: 'https://github.com/a/b', projectGithub: 'https://github.com/a/c' },
      });
    const res = await request(app)
      .get('/api/projects/stats?schoolYear=invalid-year')
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
  });

  it('project created now is excluded from a different school year → total 0 or less', async () => {
    const admin = await createAdmin();
    const student = await createUser();
    // Create a project (will be in current year, not 2090-2091)
    await request(app)
      .post('/api/projects')
      .set(authHeader(student))
      .send({
        name: 'Projet Exclusion Test',
        description: 'desc',
        objectives: 'obj',
        technologies: ['Node.js'],
        studentCount: 1,
        links: { github: 'https://github.com/a/b', projectGithub: 'https://github.com/a/c' },
      });
    const res = await request(app)
      .get('/api/projects/stats?schoolYear=2090-2091')
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
  });
});

// ─────────────────────────────────────────────
// POST /api/projects/notify-pending-changes
// ─────────────────────────────────────────────
describe('POST /api/projects/notify-pending-changes', () => {
  it('admin triggers bulk notification → 200 with total count', async () => {
    const admin = await createAdmin();
    const student = await createUser();
    await Project.create({
      name: 'Projet Notif',
      description: 'desc',
      objectives: 'obj',
      technologies: ['JS'],
      studentCount: 1,
      links: { github: 'https://github.com/a/b', projectGithub: 'https://github.com/a/c' },
      status: 'pending_changes',
      submittedBy: { userId: student._id, name: student.name, email: student.email },
    });
    const res = await request(app)
      .post('/api/projects/notify-pending-changes')
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it('student cannot access → 403', async () => {
    const student = await createUser();
    const res = await request(app)
      .post('/api/projects/notify-pending-changes')
      .set(authHeader(student));
    expect(res.status).toBe(403);
  });
});
