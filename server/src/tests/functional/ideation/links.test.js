const request = require('supertest');
const app = require('../../../app');
const Idea = require('../../../models/Idea');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');
const { createIdea, setDeadline } = require('../../helpers/ideation');

const post = (idea, user, body) =>
  request(app).post(`/api/ideas/${idea._id}/links`).set(authHeader(user)).send(body);

const link = (n) => ({ label: `Lien ${n}`, url: `https://example.com/p${n}` });

const addPending = async (idea, guest) => {
  idea.members.push({ userId: guest._id, name: guest.name, email: guest.email, status: 'pending' });
  await idea.save();
};

describe('POST /api/ideas/:id/links', () => {
  it('ajout valide renvoie le lien normalise (hote en minuscules)', async () => {
    const u = await createUser();
    const idea = await createIdea(u);
    const res = await post(idea, u, { label: '  Maquette  ', url: 'https://EXAMPLE.com/Path' });
    expect(res.status).toBe(200);
    const links = res.body.data.day2Links;
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe('https://example.com/Path');
    expect(links[0].label).toBe('Maquette');
    expect(links[0].author).toEqual({ name: u.name });
    expect(JSON.stringify(res.body)).not.toMatch(/"email"/);
    const fresh = await Idea.findById(idea._id);
    expect(fresh.lastActivityAt).toBeInstanceOf(Date);
  });

  it('refuse http://', async () => {
    const u = await createUser();
    const idea = await createIdea(u);
    const res = await post(idea, u, { label: 'a', url: 'http://example.com' });
    expect(res.status).toBe(400);
  });

  it('refuse javascript:', async () => {
    const u = await createUser();
    const idea = await createIdea(u);
    const res = await post(idea, u, { label: 'a', url: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });

  it('refuse un doublon (URL normalisee)', async () => {
    const u = await createUser();
    const idea = await createIdea(u);
    await post(idea, u, { label: 'a', url: 'https://example.com/x' });
    const res = await post(idea, u, { label: 'b', url: 'https://EXAMPLE.com/x' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/déjà ajouté/);
  });

  it('refuse le 11e lien', async () => {
    const u = await createUser();
    const idea = await createIdea(u, { day2Links: Array.from({ length: 10 }, (_, i) => link(i)) });
    const res = await post(idea, u, link(99));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/10 liens maximum/);
  });

  it('deux ajouts simultanes sur 9 liens donnent exactement 10', async () => {
    const u = await createUser();
    const idea = await createIdea(u, { day2Links: Array.from({ length: 9 }, (_, i) => link(i)) });
    const results = await Promise.all([post(idea, u, link(100)), post(idea, u, link(101))]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const fresh = await Idea.findById(idea._id);
    expect(fresh.day2Links).toHaveLength(10);
  });

  it('refuse un libelle de 81 caracteres, accepte 80 (points de code)', async () => {
    const u = await createUser();
    const idea = await createIdea(u);
    expect((await post(idea, u, { label: 'a'.repeat(81), url: 'https://example.com/a' })).status).toBe(400);
    expect((await post(idea, u, { label: '😀'.repeat(80), url: 'https://example.com/b' })).status).toBe(200);
    expect((await post(idea, u, { label: '😀'.repeat(81), url: 'https://example.com/c' })).status).toBe(400);
  });

  it('refuse un libelle vide ou blanc', async () => {
    const u = await createUser();
    const idea = await createIdea(u);
    expect((await post(idea, u, { label: '   ', url: 'https://example.com/a' })).status).toBe(400);
    expect((await post(idea, u, { url: 'https://example.com/a' })).status).toBe(400);
  });

  it('refuse label/url non chaines avec 400', async () => {
    const u = await createUser();
    const idea = await createIdea(u);
    const bad = [{ $ne: 'x' }, ['a'], 12, null, true];
    for (const v of bad) {
      expect((await post(idea, u, { label: v, url: 'https://example.com/a' })).status).toBe(400);
      expect((await post(idea, u, { label: 'a', url: v })).status).toBe(400);
    }
    const fresh = await Idea.findById(idea._id);
    expect(fresh.day2Links).toHaveLength(0);
  });

  it('membre en attente : 403', async () => {
    const u = await createUser();
    const guest = await createUser();
    const idea = await createIdea(u);
    await addPending(idea, guest);
    const res = await post(idea, guest, link(1));
    expect(res.status).toBe(403);
  });

  it('non-membre et admin : 403', async () => {
    const u = await createUser();
    const other = await createUser();
    const admin = await createAdmin();
    const idea = await createIdea(u);
    expect((await post(idea, other, link(1))).status).toBe(403);
    expect((await post(idea, admin, link(1))).status).toBe(403);
  });

  it('apres la date limite : 403', async () => {
    const u = await createUser();
    const idea = await createIdea(u);
    await setDeadline('2020-01-01');
    const res = await post(idea, u, link(1));
    await setDeadline(null);
    expect(res.status).toBe(403);
  });

  it('sans token : 401 ; idee inconnue ou id invalide : 404', async () => {
    const u = await createUser();
    const idea = await createIdea(u);
    expect((await request(app).post(`/api/ideas/${idea._id}/links`).send(link(1))).status).toBe(401);
    expect((await request(app).post('/api/ideas/000000000000000000000000/links').set(authHeader(u)).send(link(1))).status).toBe(404);
    expect((await request(app).post('/api/ideas/abc/links').set(authHeader(u)).send(link(1))).status).toBe(404);
  });
});

describe('DELETE /api/ideas/:id/links/:linkId', () => {
  const del = (idea, user, linkId) =>
    request(app).delete(`/api/ideas/${idea._id}/links/${linkId}`).set(authHeader(user));

  it('un membre supprime un lien', async () => {
    const u = await createUser();
    const idea = await createIdea(u, { day2Links: [link(1), link(2)] });
    const target = idea.day2Links[0]._id;
    const res = await del(idea, u, target);
    expect(res.status).toBe(200);
    expect(res.body.data.day2Links).toHaveLength(1);
    expect(res.body.data.day2Links[0].url).toBe('https://example.com/p2');
    expect(JSON.stringify(res.body)).not.toMatch(/"email"/);
    const fresh = await Idea.findById(idea._id);
    expect(fresh.day2Links).toHaveLength(1);
    expect(fresh.lastActivityAt).toBeInstanceOf(Date);
  });

  it('lien inexistant : 404 ; linkId invalide : 404', async () => {
    const u = await createUser();
    const idea = await createIdea(u, { day2Links: [link(1)] });
    expect((await del(idea, u, '000000000000000000000000')).status).toBe(404);
    expect((await del(idea, u, 'pas-un-id')).status).toBe(404);
  });

  it('membre en attente 403 ; apres la date limite 403', async () => {
    const u = await createUser();
    const guest = await createUser();
    const idea = await createIdea(u, { day2Links: [link(1)] });
    await addPending(idea, guest);
    const id = idea.day2Links[0]._id;
    expect((await del(idea, guest, id)).status).toBe(403);
    await setDeadline('2020-01-01');
    const late = await del(idea, u, id);
    await setDeadline(null);
    expect(late.status).toBe(403);
    expect((await Idea.findById(idea._id)).day2Links).toHaveLength(1);
  });
});
