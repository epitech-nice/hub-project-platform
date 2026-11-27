jest.mock('../../utils/backgroundJobs');

const request = require('supertest');
const app = require('../../app');
const Project = require('../../models/Project');
const { createUser, createAdmin, authHeader } = require('../helpers/auth');

async function createApprovedProject(student) {
  return Project.create({
    name: 'Projet approuve',
    description: 'Une description',
    objectives: 'Des objectifs',
    technologies: ['Node.js'],
    studentCount: 1,
    links: {
      github: 'https://github.com/user/personal-repo',
      projectGithub: 'https://github.com/user/project-repo',
    },
    status: 'approved',
    members: [{ email: student.email, userId: student._id, isCreator: true }],
    submittedBy: { userId: student._id, name: student.name, email: student.email },
  });
}

describe('PATCH /api/projects/:id/complete', () => {
  it('complete without defenseDate -> 400', async () => {
    const admin = await createAdmin();
    const project = await createApprovedProject(await createUser());

    const res = await request(app)
      .patch(`/api/projects/${project._id}/complete`)
      .set(authHeader(admin))
      .send({});

    expect(res.status).toBe(400);
    const fresh = await Project.findById(project._id);
    expect(fresh.status).toBe('approved');
  });

  it('complete with invalid defenseDate -> 400', async () => {
    const admin = await createAdmin();
    const project = await createApprovedProject(await createUser());

    const res = await request(app)
      .patch(`/api/projects/${project._id}/complete`)
      .set(authHeader(admin))
      .send({ defenseDate: 'pas-une-date' });

    expect(res.status).toBe(400);
    const fresh = await Project.findById(project._id);
    expect(fresh.status).toBe('approved');
  });

  it('complete with valid defenseDate -> 200, status completed, defenseDate saved', async () => {
    const admin = await createAdmin();
    const project = await createApprovedProject(await createUser());

    const res = await request(app)
      .patch(`/api/projects/${project._id}/complete`)
      .set(authHeader(admin))
      .send({ defenseDate: '2026-11-20T14:00:00.000Z' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
    const fresh = await Project.findById(project._id);
    expect(fresh.defenseDate.toISOString()).toBe('2026-11-20T14:00:00.000Z');
  });

  it("new project has mySync.status 'idle' and empty students", async () => {
    const project = await createApprovedProject(await createUser());
    expect(project.mySync.status).toBe('idle');
    expect(project.mySync.students).toHaveLength(0);
  });
});
