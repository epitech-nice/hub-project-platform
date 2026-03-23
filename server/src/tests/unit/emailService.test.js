// Variables préfixées "mock" : Jest les autorise dans les factories jest.mock (hoisting exception)
const mockSend = jest.fn().mockResolvedValue({ data: { id: 'mock-email-id' }, error: null });

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

const { sendStatusChangeEmail } = require('../../services/emailService');

beforeEach(() => {
  mockSend.mockClear();
  mockSend.mockResolvedValue({ data: { id: 'mock-email-id' }, error: null });
});

// ─── Helpers ───────────────────────────────────────────────────────────────

const makeProject = (overrides = {}) => ({
  _id: 'proj-1',
  name: 'Mon Projet',
  description: 'Description',
  objectives: 'Objectifs',
  technologies: ['Node.js', 'React'],
  studentCount: 2,
  credits: 1.5,
  members: [{ email: 'alice@epitech.eu' }],
  studentEmails: [],
  submittedBy: { email: 'alice@epitech.eu', name: 'Alice' },
  reviewedBy: { comments: '' },
  links: { github: 'https://github.com/user/repo', projectGithub: 'https://github.com/user/proj' },
  ...overrides,
});

const makeWorkshop = (overrides = {}) => ({
  _id: 'ws-1',
  title: 'Mon Workshop',
  details: 'Détails du workshop',
  instructorCount: 1,
  instructors: [{ email: 'bob@epitech.eu' }],
  instructorEmails: [],
  submittedBy: { email: 'bob@epitech.eu', name: 'Bob' },
  reviewedBy: { comments: '' },
  links: { github: 'https://github.com/user/repo', presentation: 'https://slides.com/deck' },
  ...overrides,
});

const makeEnrollment = (overrides = {}) => ({
  _id: 'enr-1',
  student: { userId: 'u1', name: 'Charlie', email: 'charlie@epitech.eu' },
  simulatedProject: { projectId: 'sp-1', title: 'Projet Simulé' },
  cycleNumber: 1,
  phase: 1,
  isDoubleCycle: false,
  githubProjectLink: 'https://github.com/user/project',
  credits: null,
  defenseDate: null,
  reviewedBy: { comments: '' },
  ...overrides,
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('emailService.sendStatusChangeEmail', () => {
  describe('recipients — project', () => {
    it('sends to members and submitter (deduplicated)', async () => {
      const project = makeProject({
        members: [{ email: 'alice@epitech.eu' }, { email: 'bob@epitech.eu' }],
        submittedBy: { email: 'alice@epitech.eu' },
      });
      await sendStatusChangeEmail(project, 'approved');
      const call = mockSend.mock.calls[0][0];
      expect(call.to).toEqual(expect.arrayContaining(['alice@epitech.eu', 'bob@epitech.eu']));
      expect(call.to).toHaveLength(2); // alice n'est pas dupliquée
    });

    it('returns early without sending if no recipients', async () => {
      const project = makeProject({ members: [], studentEmails: [], submittedBy: {} });
      const result = await sendStatusChangeEmail(project, 'approved');
      expect(result).toMatchObject({ success: false, reason: 'No recipients' });
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('recipients — workshop', () => {
    it('sends to instructors and submitter', async () => {
      const workshop = makeWorkshop({
        instructors: [{ email: 'bob@epitech.eu' }],
        submittedBy: { email: 'carol@epitech.eu' },
      });
      await sendStatusChangeEmail(workshop, 'approved', true);
      const call = mockSend.mock.calls[0][0];
      expect(call.to).toContain('bob@epitech.eu');
      expect(call.to).toContain('carol@epitech.eu');
    });
  });

  describe('recipients — simulated enrollment', () => {
    it('sends only to the student', async () => {
      await sendStatusChangeEmail(makeEnrollment(), 'approved', false, true);
      const call = mockSend.mock.calls[0][0];
      expect(call.to).toEqual(['charlie@epitech.eu']);
    });
  });

  describe('email subject — correct emoji per status', () => {
    it.each([
      ['approved',        '✅'],
      ['rejected',        '⛔'],
      ['pending_changes', '🔄'],
      ['completed',       '🏆'],
    ])('status "%s" uses emoji %s', async (status, emoji) => {
      await sendStatusChangeEmail(makeProject(), status);
      const call = mockSend.mock.calls[0][0];
      expect(call.subject).toContain(emoji);
    });
  });

  describe('email subject — correct type label', () => {
    it('uses "Projet" for a project', async () => {
      await sendStatusChangeEmail(makeProject(), 'approved');
      expect(mockSend.mock.calls[0][0].subject).toContain('Projet');
    });

    it('uses "Workshop" for a workshop', async () => {
      await sendStatusChangeEmail(makeWorkshop(), 'approved', true);
      expect(mockSend.mock.calls[0][0].subject).toContain('Workshop');
    });

    it('uses "Cycle Simulated" for an enrollment', async () => {
      await sendStatusChangeEmail(makeEnrollment(), 'approved', false, true);
      expect(mockSend.mock.calls[0][0].subject).toContain('Cycle Simulated');
    });
  });

  describe('Resend error handling', () => {
    it('throws if Resend returns an error object', async () => {
      mockSend.mockResolvedValueOnce({ data: null, error: { message: 'API error' } });
      await expect(sendStatusChangeEmail(makeProject(), 'approved')).rejects.toMatchObject({
        message: 'API error',
      });
    });
  });
});
