const mongoose = require('mongoose');
const PrintAccessRequest = require('../../models/PrintAccessRequest');

describe('PrintAccessRequest model', () => {
  it('defaults to pending status with requestedAt set', async () => {
    const request = await PrintAccessRequest.create({
      student: { userId: new mongoose.Types.ObjectId(), name: 'Alice', email: 'alice@epitech.eu' },
    });
    expect(request.status).toBe('pending');
    expect(request.requestedAt).toBeInstanceOf(Date);
    expect(request.resolvedAt).toBeNull();
  });

  it('rejects an invalid status', async () => {
    await expect(
      PrintAccessRequest.create({
        student: { userId: new mongoose.Types.ObjectId(), name: 'Alice', email: 'alice@epitech.eu' },
        status: 'nonsense',
      })
    ).rejects.toThrow();
  });
});
