jest.mock('../../../utils/backgroundJobs');

const request = require('supertest');
const app = require('../../../app');
const SimulatedCycle = require('../../../models/SimulatedCycle');
const SimulatedProject = require('../../../models/SimulatedProject');
const SimulatedEnrollment = require('../../../models/SimulatedEnrollment');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');

// ─── Helpers ────────────────────────────────────────────────────────────────

const createOpenCycle = async (admin, overrides = {}) => {
  const now = new Date();
  const startDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);       // hier
  const firstSubmissionDeadline = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000); // dans 4 jours
  const firstDefenseDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const secondSubmissionDeadline = new Date(now.getTime() + 19 * 24 * 60 * 60 * 1000);
  const secondDefenseDate = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);

  return SimulatedCycle.create({
    name: 'Cycle Test',
    startDate,
    firstSubmissionDeadline,
    firstDefenseDate,
    secondSubmissionDeadline,
    secondDefenseDate,
    isDoubleCycle: false,
    createdBy: { userId: admin._id, name: admin.name },
    ...overrides,
  });
};

const createClosedCycle = async (admin) => {
  const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return SimulatedCycle.create({
    name: 'Cycle Passé',
    startDate: new Date(past.getTime() - 28 * 24 * 60 * 60 * 1000),
    firstSubmissionDeadline: new Date(past.getTime() - 23 * 24 * 60 * 60 * 1000),
    firstDefenseDate: new Date(past.getTime() - 14 * 24 * 60 * 60 * 1000),
    secondSubmissionDeadline: new Date(past.getTime() - 9 * 24 * 60 * 60 * 1000),
    secondDefenseDate: past,
    isDoubleCycle: false,
    createdBy: { userId: admin._id, name: admin.name },
  });
};

const createCatalogProject = async (admin, overrides = {}) => {
  return SimulatedProject.create({
    title: 'Projet Catalogue Test',
    isActive: true,
    createdBy: { userId: admin._id, name: admin.name },
    ...overrides,
  });
};

// ─────────────────────────────────────────────
// POST /api/simulated/enroll
// ─────────────────────────────────────────────
describe('POST /api/simulated/enroll', () => {
  let admin, student, cycle, catalogProject;

  beforeEach(async () => {
    admin = await createAdmin();
    student = await createUser();
    cycle = await createOpenCycle(admin);
    catalogProject = await createCatalogProject(admin);
  });

  it('student enrolls successfully during open window → 201', async () => {
    const res = await request(app)
      .post('/api/simulated/enroll')
      .set(authHeader(student))
      .send({
        projectId: catalogProject._id.toString(),
        githubProjectLink: 'https://github.com/user/project',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.cycleNumber).toBe(1);
    expect(res.body.data.phase).toBe(1);
    expect(res.body.data.simulatedProject.title).toBe('Projet Catalogue Test');
  });

  it('returns 400 if no cycle window is open', async () => {
    await SimulatedCycle.deleteMany({});
    await createClosedCycle(admin);

    const res = await request(app)
      .post('/api/simulated/enroll')
      .set(authHeader(student))
      .send({
        projectId: catalogProject._id.toString(),
        githubProjectLink: 'https://github.com/user/project',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/fenêtre/i);
  });

  it('returns 400 if project is inactive', async () => {
    const inactiveProject = await createCatalogProject(admin, { isActive: false });

    const res = await request(app)
      .post('/api/simulated/enroll')
      .set(authHeader(student))
      .send({
        projectId: inactiveProject._id.toString(),
        githubProjectLink: 'https://github.com/user/project',
      });

    expect(res.status).toBe(404);
  });

  it('returns 400 if student already has an active enrollment', async () => {
    await request(app)
      .post('/api/simulated/enroll')
      .set(authHeader(student))
      .send({
        projectId: catalogProject._id.toString(),
        githubProjectLink: 'https://github.com/user/project',
      });

    const anotherProject = await createCatalogProject(admin, { title: 'Autre Projet' });
    const res = await request(app)
      .post('/api/simulated/enroll')
      .set(authHeader(student))
      .send({
        projectId: anotherProject._id.toString(),
        githubProjectLink: 'https://github.com/user/project',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/en cours/i);
  });

  it('returns 400 if student already completed this project (phase 2 approved)', async () => {
    await SimulatedEnrollment.create({
      student: { userId: student._id, name: student.name, email: student.email },
      simulatedProject: { projectId: catalogProject._id, title: catalogProject.title },
      cycleNumber: 1,
      phase: 2,
      // completed : passe le check activeEnrollment (qui bloque pending/pending_changes/approved)
      // mais est bloqué par alreadyDone (phase 2 + approved|completed)
      status: 'completed',
      githubProjectLink: 'https://github.com/user/project',
    });

    const res = await request(app)
      .post('/api/simulated/enroll')
      .set(authHeader(student))
      .send({
        projectId: catalogProject._id.toString(),
        githubProjectLink: 'https://github.com/user/project',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/déjà effectué/i);
  });

  it('returns 400 if githubProjectLink is missing', async () => {
    const res = await request(app)
      .post('/api/simulated/enroll')
      .set(authHeader(student))
      .send({ projectId: catalogProject._id.toString() });

    expect(res.status).toBe(400);
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/simulated/enroll')
      .send({ projectId: catalogProject._id.toString(), githubProjectLink: 'https://github.com/u/p' });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────
// GET /api/simulated/me
// ─────────────────────────────────────────────
describe('GET /api/simulated/me', () => {
  it('returns active enrollment for the student', async () => {
    const admin = await createAdmin();
    const student = await createUser();
    const catalogProject = await createCatalogProject(admin);
    await createOpenCycle(admin);

    await request(app)
      .post('/api/simulated/enroll')
      .set(authHeader(student))
      .send({ projectId: catalogProject._id.toString(), githubProjectLink: 'https://github.com/u/p' });

    const res = await request(app)
      .get('/api/simulated/me')
      .set(authHeader(student));

    expect(res.status).toBe(200);
    expect(res.body.data).not.toBeNull();
    expect(res.body.data.status).toBe('pending');
  });

  it('returns null if no active enrollment', async () => {
    const student = await createUser();
    const res = await request(app).get('/api/simulated/me').set(authHeader(student));
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });
});

// ─────────────────────────────────────────────
// PUT /api/simulated/enrollments/:id — mise à jour GitHub
// ─────────────────────────────────────────────
describe('PUT /api/simulated/enrollments/:id', () => {
  let admin, student, enrollment;

  beforeEach(async () => {
    admin = await createAdmin();
    student = await createUser();
    const catalogProject = await createCatalogProject(admin);
    await createOpenCycle(admin);

    const res = await request(app)
      .post('/api/simulated/enroll')
      .set(authHeader(student))
      .send({ projectId: catalogProject._id.toString(), githubProjectLink: 'https://github.com/u/v1' });
    enrollment = res.body.data;
  });

  it('student can update their github link', async () => {
    const res = await request(app)
      .put(`/api/simulated/enrollments/${enrollment._id}`)
      .set(authHeader(student))
      .send({ githubProjectLink: 'https://github.com/u/v2' });

    expect(res.status).toBe(200);
    expect(res.body.data.githubProjectLink).toBe('https://github.com/u/v2');
  });

  it('status goes back to pending if it was pending_changes', async () => {
    await SimulatedEnrollment.findByIdAndUpdate(enrollment._id, { status: 'pending_changes' });

    const res = await request(app)
      .put(`/api/simulated/enrollments/${enrollment._id}`)
      .set(authHeader(student))
      .send({ githubProjectLink: 'https://github.com/u/v3' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('pending');
  });

  it('returns 403 if another student tries to update', async () => {
    const otherStudent = await createUser();
    const res = await request(app)
      .put(`/api/simulated/enrollments/${enrollment._id}`)
      .set(authHeader(otherStudent))
      .send({ githubProjectLink: 'https://github.com/u/hack' });
    expect(res.status).toBe(403);
  });

  it('returns 400 if lockedByAdmin', async () => {
    await SimulatedEnrollment.findByIdAndUpdate(enrollment._id, { lockedByAdmin: true });

    const res = await request(app)
      .put(`/api/simulated/enrollments/${enrollment._id}`)
      .set(authHeader(student))
      .send({ githubProjectLink: 'https://github.com/u/v4' });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────
// PATCH /api/simulated/enrollments/:id/review — validation admin
// ─────────────────────────────────────────────
describe('PATCH /api/simulated/enrollments/:id/review', () => {
  let admin, student, enrollmentId;

  beforeEach(async () => {
    admin = await createAdmin();
    student = await createUser();
    const catalogProject = await createCatalogProject(admin);
    await createOpenCycle(admin);

    const res = await request(app)
      .post('/api/simulated/enroll')
      .set(authHeader(student))
      .send({ projectId: catalogProject._id.toString(), githubProjectLink: 'https://github.com/u/p' });
    enrollmentId = res.body.data._id;
  });

  it('admin approves → lockedByAdmin=true', async () => {
    const res = await request(app)
      .patch(`/api/simulated/enrollments/${enrollmentId}/review`)
      .set(authHeader(admin))
      .send({ status: 'approved', comments: 'OK' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    expect(res.body.data.lockedByAdmin).toBe(true);
  });

  it('admin requests changes → lockedByAdmin=false', async () => {
    const res = await request(app)
      .patch(`/api/simulated/enrollments/${enrollmentId}/review`)
      .set(authHeader(admin))
      .send({ status: 'pending_changes', comments: 'Améliorer le README' });

    expect(res.status).toBe(200);
    expect(res.body.data.lockedByAdmin).toBe(false);
  });

  it('student cannot review → 403', async () => {
    const res = await request(app)
      .patch(`/api/simulated/enrollments/${enrollmentId}/review`)
      .set(authHeader(student))
      .send({ status: 'approved' });
    expect(res.status).toBe(403);
  });

  it('returns 400 for an invalid status', async () => {
    const res = await request(app)
      .patch(`/api/simulated/enrollments/${enrollmentId}/review`)
      .set(authHeader(admin))
      .send({ status: 'invalid' });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────
// PATCH /api/simulated/enrollments/:id/defend
// ─────────────────────────────────────────────
describe('PATCH /api/simulated/enrollments/:id/defend', () => {
  let admin, student, enrollmentId;

  beforeEach(async () => {
    admin = await createAdmin();
    student = await createUser();
    const catalogProject = await createCatalogProject(admin);
    await createOpenCycle(admin);

    const enrollRes = await request(app)
      .post('/api/simulated/enroll')
      .set(authHeader(student))
      .send({ projectId: catalogProject._id.toString(), githubProjectLink: 'https://github.com/u/p' });
    enrollmentId = enrollRes.body.data._id;

    // Approuver d'abord (requis avant de défendre)
    await request(app)
      .patch(`/api/simulated/enrollments/${enrollmentId}/review`)
      .set(authHeader(admin))
      .send({ status: 'approved' });
  });

  it('admin defends phase 1 → transitions to phase 2 pending_changes', async () => {
    const res = await request(app)
      .patch(`/api/simulated/enrollments/${enrollmentId}/defend`)
      .set(authHeader(admin))
      .send({ credits: 1, comments: 'Bonne présentation' });

    expect(res.status).toBe(200);
    expect(res.body.data.phase).toBe(2);
    expect(res.body.data.status).toBe('pending_changes');
    expect(res.body.data.phase1Credits).toBe(1);
    expect(res.body.data.lockedByAdmin).toBe(false);
    expect(res.body.data.totalCredits).toBe(1);
  });

  it('returns 400 for invalid credits value', async () => {
    const res = await request(app)
      .patch(`/api/simulated/enrollments/${enrollmentId}/defend`)
      .set(authHeader(admin))
      .send({ credits: 0.7 }); // non dans VALID_CREDITS_NORMAL

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalide/i);
  });

  it('returns 400 if enrollment is not approved', async () => {
    await SimulatedEnrollment.findByIdAndUpdate(enrollmentId, { status: 'pending_changes' });

    const res = await request(app)
      .patch(`/api/simulated/enrollments/${enrollmentId}/defend`)
      .set(authHeader(admin))
      .send({ credits: 1 });

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────
// POST /api/simulated/enrollments/:id/relaunch
// ─────────────────────────────────────────────
describe('POST /api/simulated/enrollments/:id/relaunch', () => {
  it('admin can relaunch a phase 2 approved enrollment', async () => {
    const admin = await createAdmin();
    const student = await createUser();
    const enrollment = await SimulatedEnrollment.create({
      student: { userId: student._id, name: student.name, email: student.email },
      simulatedProject: { projectId: new SimulatedProject({ title: 'P', createdBy: { userId: admin._id } })._id, title: 'Projet Test' },
      cycleNumber: 1,
      phase: 2,
      status: 'approved',
      credits: 1,
      phase1Credits: 1,
      totalCredits: 2,
      githubProjectLink: 'https://github.com/u/p',
    });

    const res = await request(app)
      .post(`/api/simulated/enrollments/${enrollment._id}/relaunch`)
      .set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.data.phase).toBe(1);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.cycleNumber).toBe(2);
    expect(res.body.data.credits).toBeNull();
    expect(res.body.data.phase1Credits).toBeNull();
    expect(res.body.data.lockedByAdmin).toBe(false);
  });

  it('returns 400 if enrollment is phase 1', async () => {
    const admin = await createAdmin();
    const student = await createUser();
    const enrollment = await SimulatedEnrollment.create({
      student: { userId: student._id, name: student.name, email: student.email },
      simulatedProject: { projectId: new SimulatedProject({ title: 'P', createdBy: { userId: admin._id } })._id, title: 'Projet Test' },
      cycleNumber: 1,
      phase: 1,
      status: 'approved',
      githubProjectLink: 'https://github.com/u/p',
    });

    const res = await request(app)
      .post(`/api/simulated/enrollments/${enrollment._id}/relaunch`)
      .set(authHeader(admin));

    expect(res.status).toBe(400);
  });
});
