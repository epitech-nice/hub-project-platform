const PrintAuthorization = require('../../models/PrintAuthorization');

describe('PrintAuthorization model', () => {
  it('lowercases and trims the email on save', async () => {
    const doc = await PrintAuthorization.create({ email: '  Foo@Epitech.EU  ', authorized: true });
    expect(doc.email).toBe('foo@epitech.eu');
  });

  it('enforces a unique email', async () => {
    await PrintAuthorization.create({ email: 'dup@epitech.eu', authorized: true });
    await expect(
      PrintAuthorization.create({ email: 'dup@epitech.eu', authorized: false })
    ).rejects.toThrow();
  });

  it('defaults authorized to false', async () => {
    const doc = await PrintAuthorization.create({ email: 'x@epitech.eu' });
    expect(doc.authorized).toBe(false);
  });
});
