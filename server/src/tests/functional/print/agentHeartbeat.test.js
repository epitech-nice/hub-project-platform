const request = require('supertest');
const app = require('../../../app');
const Printer = require('../../../models/Printer');
const { generateApiKey } = require('../../../utils/apiKey');

describe('GET /api/print/agent/heartbeat', () => {
  it('returns 401 with no auth headers', async () => {
    const res = await request(app).get('/api/print/agent/heartbeat');
    expect(res.status).toBe(401);
  });

  it('returns 204 with a valid printer and updates lastSeenAt', async () => {
    const { rawKey, hash } = generateApiKey();
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: hash });
    const before = printer.lastSeenAt;

    const res = await request(app)
      .get('/api/print/agent/heartbeat')
      .set('x-printer-id', printer._id.toString())
      .set('x-api-key', rawKey);

    expect(res.status).toBe(204);

    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.lastSeenAt).not.toBeNull();
    expect(reloaded.lastSeenAt).not.toEqual(before);
    expect(Date.now() - reloaded.lastSeenAt.getTime()).toBeLessThan(5000);
  });
});
