jest.mock('../../services/emailService', () => ({
  sendStatusChangeEmail: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('../../services/externalService', () => ({
  sendExternalRequest: jest.fn().mockResolvedValue({ ok: true }),
}));

const emailService = require('../../services/emailService');
const { addJob } = require('../../utils/backgroundJobs');

const flushImmediate = () => new Promise((resolve) => setImmediate(resolve));

describe('backgroundJobs.addJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    emailService.sendStatusChangeEmail.mockResolvedValue({ success: true });
  });

  describe('sendStatusEmail — project (default)', () => {
    it('calls sendStatusChangeEmail with isWorkshop=false, isSimulated=false by default', async () => {
      const project = { _id: '111', name: 'Mon Projet' };
      addJob('sendStatusEmail', { project, status: 'approved' });
      await flushImmediate();
      expect(emailService.sendStatusChangeEmail).toHaveBeenCalledTimes(1);
      expect(emailService.sendStatusChangeEmail).toHaveBeenCalledWith(
        project, 'approved', false, false
      );
    });

    it('passes isWorkshop=true for workshops', async () => {
      const workshop = { _id: '222', title: 'Mon Workshop' };
      addJob('sendStatusEmail', { project: workshop, status: 'rejected', isWorkshop: true });
      await flushImmediate();
      expect(emailService.sendStatusChangeEmail).toHaveBeenCalledWith(
        workshop, 'rejected', true, false
      );
    });

    it('passes isSimulated=true for simulated enrollments', async () => {
      const enrollment = { _id: '333', simulatedProject: { title: 'Projet Test' } };
      addJob('sendStatusEmail', { project: enrollment, status: 'pending_changes', isSimulated: true });
      await flushImmediate();
      expect(emailService.sendStatusChangeEmail).toHaveBeenCalledWith(
        enrollment, 'pending_changes', false, true
      );
    });
  });

  describe('error handling', () => {
    it('does not throw if emailService rejects', async () => {
      emailService.sendStatusChangeEmail.mockRejectedValue(new Error('SMTP error'));
      expect(() => addJob('sendStatusEmail', { project: {}, status: 'approved' })).not.toThrow();
      await flushImmediate();
    });

    it('logs error to console if emailService rejects', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      emailService.sendStatusChangeEmail.mockRejectedValue(new Error('timeout'));
      addJob('sendStatusEmail', { project: { _id: 'x' }, status: 'approved' });
      await flushImmediate();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Background Job Error]')
      );
      consoleSpy.mockRestore();
    });

    it('does nothing for an unknown job name', async () => {
      addJob('unknownJob', { foo: 'bar' });
      await flushImmediate();
      expect(emailService.sendStatusChangeEmail).not.toHaveBeenCalled();
    });
  });
});
