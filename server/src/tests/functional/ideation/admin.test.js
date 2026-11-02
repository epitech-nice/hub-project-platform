const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../../../app');
const Idea = require('../../../models/Idea');
const IdeationSettings = require('../../../models/IdeationSettings');
const { storageDirFor } = require('../../../utils/fileSignature');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');
const { createIdea, setDeadline } = require('../../helpers/ideation');

const dirs = new Set();
const putFile = (idea, name, content = 'x') => {
  const dir = storageDirFor(idea._id.toString());
  dirs.add(dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);
};
const exists = (idea, name) =>
  fs.existsSync(path.join(storageDirFor(idea._id.toString()), name));
const version = (u, n, storedName, ext = 'pdf') => ({
  number: n,
  storedName,
  originalName: `f${n}.${ext}`,
  size: 10,
  author: { userId: u._id, name: u.name },
});

afterEach(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  dirs.clear();
});

const get = (user, url) => request(app).get(url).set(authHeader(user));
const send = (method, user, url, body) => {
  const r = request(app)[method](url).set(authHeader(user));
  return body === undefined ? r : r.send(body);
};

describe('acces reserve aux admins', () => {
  it('un etudiant recoit 403 sur chaque route admin', async () => {
    const s = await createUser();
    const idea = await createIdea(s);
    const id = idea._id;
    const l = '507f1f77bcf86cd799439011';
    const calls = [
      ['get', '/api/ideas/admin'],
      ['put', '/api/ideas/admin/deadline', { deadlineDate: null }],
      ['patch', `/api/ideas/admin/${id}/hide`, { hidden: true }],
      ['patch', `/api/ideas/admin/${id}/unlock`, { until: null }],
      ['put', `/api/ideas/admin/${id}`, { title: 'x' }],
      ['delete', `/api/ideas/admin/${id}/logo`],
      ['delete', `/api/ideas/admin/${id}/deck`],
      ['delete', `/api/ideas/admin/${id}/links/${l}`],
      ['put', `/api/ideas/admin/${id}/links/${l}`, { label: 'x' }],
      ['delete', `/api/ideas/admin/${id}`],
    ];
    for (const [method, url, body] of calls) {
      const res = await send(method, s, url, body);
      expect([method, url, res.status]).toEqual([method, url, 403]);
    }
    expect(await Idea.countDocuments({ _id: id })).toBe(1);
  });

  it('sans jeton : 401', async () => {
    const res = await request(app).get('/api/ideas/admin');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/ideas/admin', () => {
  it('liste idees masquees et sans deck, avec la forme de ligne attendue', async () => {
    const admin = await createAdmin();
    const a = await createUser();
    const b = await createUser();
    const hidden = await createIdea(a, { title: 'Masquee', hidden: true });
    const noDeck = await createIdea(b, {
      title: 'Sans deck',
      deck: { versions: [] },
      day2Links: [
        { label: 'a', url: 'https://example.com/a' },
        { label: 'b', url: 'https://docs.example.org/b' },
      ],
    });
    const res = await get(admin, '/api/ideas/admin');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    const ids = res.body.data.map((r) => r._id);
    expect(ids).toEqual(expect.arrayContaining([String(hidden._id), String(noDeck._id)]));
    const row = res.body.data.find((r) => r._id === String(noDeck._id));
    expect(Object.keys(row).sort()).toEqual(
      ['_id', 'creator', 'hasDeck', 'hidden', 'incomplete', 'lastActivityAt', 'linkCount', 'linkDomains', 'memberCount', 'title'].sort()
    );
    expect(row.creator).toEqual({ name: b.name, email: b.email });
    expect(row.hasDeck).toBe(false);
    expect(row.linkCount).toBe(2);
    expect(row.linkDomains.sort()).toEqual(['docs.example.org', 'example.com']);
    expect(row.incomplete).toBe(true);
    expect(row.memberCount).toBe(1);
    const h = res.body.data.find((r) => r._id === String(hidden._id));
    expect(h.hidden).toBe(true);
  });

  it('q retrouve par titre, nom ou email de membre', async () => {
    const admin = await createAdmin();
    const a = await createUser({ name: 'Zorglub Alpha', email: 'zorglub@epitech.eu' });
    const b = await createUser();
    const guest = await createUser({ name: 'Invite Beta', email: 'invite.beta@epitech.eu' });
    const i1 = await createIdea(a, { title: 'Premiere' });
    const i2 = await createIdea(b, { title: 'Robot (v2)' });
    i2.members.push({ userId: guest._id, name: guest.name, email: guest.email, status: 'pending' });
    await i2.save();

    const byName = await get(admin, '/api/ideas/admin?q=zorglub');
    expect(byName.body.data.map((r) => r._id)).toEqual([String(i1._id)]);
    const byEmail = await get(admin, '/api/ideas/admin?q=invite.beta@');
    expect(byEmail.body.data.map((r) => r._id)).toEqual([String(i2._id)]);
    const byTitle = await get(admin, `/api/ideas/admin?q=${encodeURIComponent('robot (v2)')}`);
    expect(byTitle.body.data.map((r) => r._id)).toEqual([String(i2._id)]);
    const meta = await get(admin, `/api/ideas/admin?q=${encodeURIComponent('.*')}`);
    expect(meta.body.data).toHaveLength(0);
  });

  it('hasDeck et hasLinks filtrent', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    const withDeck = await createIdea(u, { title: 'avec' });
    const noDeck = await createIdea(u, {
      title: 'sans',
      deck: { versions: [] },
      day2Links: [{ label: 'a', url: 'https://example.com/a' }],
    });
    const f = await get(admin, '/api/ideas/admin?hasDeck=false');
    expect(f.body.data.map((r) => r._id)).toEqual([String(noDeck._id)]);
    const t = await get(admin, '/api/ideas/admin?hasDeck=true');
    expect(t.body.data.map((r) => r._id)).toEqual([String(withDeck._id)]);
    const l = await get(admin, '/api/ideas/admin?hasLinks=true');
    expect(l.body.data.map((r) => r._id)).toEqual([String(noDeck._id)]);
    const nl = await get(admin, '/api/ideas/admin?hasLinks=false');
    expect(nl.body.data.map((r) => r._id)).toEqual([String(withDeck._id)]);
  });

  it('valeurs invalides ou non chaines : 400', async () => {
    const admin = await createAdmin();
    for (const qs of ['hasDeck=maybe', 'hasLinks=1', 'q[$ne]=x', 'q=a&q=b', 'hasDeck[]=true', 'page[$gt]=1']) {
      const res = await get(admin, `/api/ideas/admin?${qs}`);
      expect([qs, res.status]).toEqual([qs, 400]);
    }
  });

  it('pagination : limit plafonne a 200, page et total', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    for (let i = 0; i < 3; i += 1) await createIdea(u, { title: `T${i}` });
    const p1 = await get(admin, '/api/ideas/admin?limit=2&page=1');
    const p2 = await get(admin, '/api/ideas/admin?limit=2&page=2');
    expect(p1.body.data).toHaveLength(2);
    expect(p2.body.data).toHaveLength(1);
    expect(p1.body.total).toBe(3);
  });
});

describe('PATCH /api/ideas/admin/:id/hide', () => {
  it('masque puis restitue dans le catalogue etudiant', async () => {
    const admin = await createAdmin();
    const s = await createUser();
    const idea = await createIdea(s, { title: 'Visible' });
    const viewer = await createUser();
    const inCatalog = async () =>
      (await get(viewer, '/api/ideas')).body.data.some((c) => c._id === String(idea._id));

    expect(await inCatalog()).toBe(true);
    const hide = await send('patch', admin, `/api/ideas/admin/${idea._id}/hide`, { hidden: true });
    expect(hide.status).toBe(200);
    expect(hide.body.data.hidden).toBe(true);
    expect(await inCatalog()).toBe(false);
    const show = await send('patch', admin, `/api/ideas/admin/${idea._id}/hide`, { hidden: false });
    expect(show.status).toBe(200);
    expect(await inCatalog()).toBe(true);
  });

  it('booleen strict, sinon 400 ; id invalide ou absent : 404', async () => {
    const admin = await createAdmin();
    const s = await createUser();
    const idea = await createIdea(s);
    for (const hidden of ['true', 1, null, undefined, {}]) {
      const res = await send('patch', admin, `/api/ideas/admin/${idea._id}/hide`, { hidden });
      expect(res.status).toBe(400);
    }
    expect((await send('patch', admin, '/api/ideas/admin/nope/hide', { hidden: true })).status).toBe(404);
    expect((await send('patch', admin, '/api/ideas/admin/507f1f77bcf86cd799439011/hide', { hidden: true })).status).toBe(404);
    expect((await Idea.findById(idea._id)).hidden).toBe(false);
  });
});

describe('DELETE /api/ideas/admin/:id', () => {
  it('efface le document et le dossier', async () => {
    const admin = await createAdmin();
    const s = await createUser();
    const idea = await createIdea(s);
    putFile(idea, 'deck-1.pdf');
    putFile(idea, 'logo-1.png');
    const res = await send('delete', admin, `/api/ideas/admin/${idea._id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(await Idea.findById(idea._id)).toBeNull();
    expect(fs.existsSync(storageDirFor(idea._id.toString()))).toBe(false);
  });

  it('200 meme sans dossier ; 404 si absente ou id invalide', async () => {
    const admin = await createAdmin();
    const s = await createUser();
    const idea = await createIdea(s);
    const res = await send('delete', admin, `/api/ideas/admin/${idea._id}`);
    expect(res.status).toBe(200);
    expect((await send('delete', admin, `/api/ideas/admin/${idea._id}`)).status).toBe(404);
    expect((await send('delete', admin, '/api/ideas/admin/..%2F..')).status).toBe(404);
  });

  it('ne touche pas au dossier des autres idees', async () => {
    const admin = await createAdmin();
    const s = await createUser();
    const a = await createIdea(s);
    const b = await createIdea(s);
    putFile(b, 'deck-1.pdf');
    await send('delete', admin, `/api/ideas/admin/${a._id}`);
    expect(exists(b, 'deck-1.pdf')).toBe(true);
  });
});

describe('PATCH /api/ideas/admin/:id/unlock', () => {
  it('une date future reouvre cette idee seulement, null reverrouille', async () => {
    await setDeadline('2020-01-01');
    const admin = await createAdmin();
    const s = await createUser();
    const a = await createIdea(s, { title: 'A' });
    const b = await createIdea(s, { title: 'B' });
    const edit = (idea) =>
      send('put', s, `/api/ideas/${idea._id}`, {
        title: 'Nouveau', description: 'd', hashtags: ['a', 'b', 'c'],
      });
    expect((await edit(a)).status).toBe(403);

    const until = new Date(Date.now() + 3600e3).toISOString();
    const un = await send('patch', admin, `/api/ideas/admin/${a._id}/unlock`, { until });
    expect(un.status).toBe(200);
    expect(new Date(un.body.data.unlockedUntil).toISOString()).toBe(until);
    expect((await edit(a)).status).toBe(200);
    expect((await edit(b)).status).toBe(403);

    const lock = await send('patch', admin, `/api/ideas/admin/${a._id}/unlock`, { until: null });
    expect(lock.status).toBe(200);
    expect(lock.body.data.unlockedUntil).toBeNull();
    expect((await edit(a)).status).toBe(403);
  });

  it('date passee, invalide ou non chaine : 400', async () => {
    const admin = await createAdmin();
    const s = await createUser();
    const idea = await createIdea(s);
    const past = new Date(Date.now() - 1000).toISOString();
    for (const until of [past, 'pas une date', 12345, {}, ['x'], undefined, '']) {
      const res = await send('patch', admin, `/api/ideas/admin/${idea._id}/unlock`, { until });
      expect([String(until), res.status]).toEqual([String(until), 400]);
    }
    expect((await Idea.findById(idea._id)).unlockedUntil).toBeUndefined();
  });
});

describe('PUT /api/ideas/admin/deadline', () => {
  it('fixe puis efface la date limite', async () => {
    const admin = await createAdmin();
    const res = await send('put', admin, '/api/ideas/admin/deadline', { deadlineDate: '2027-03-31' });
    expect(res.status).toBe(200);
    expect(res.body.data.deadlineDate).toBe('2027-03-31');
    const settings = await IdeationSettings.findOne({ key: 'singleton' });
    expect(settings.deadlineDate).toBe('2027-03-31');

    const clear = await send('put', admin, '/api/ideas/admin/deadline', { deadlineDate: null });
    expect(clear.status).toBe(200);
    expect(clear.body.data.deadlineDate).toBeNull();
  });

  it('refuse les formats et dates invalides', async () => {
    const admin = await createAdmin();
    await setDeadline('2027-03-31');
    for (const deadlineDate of ['2027-3-1', '2027-13-45', '2027-02-30', 'demain', '', 20270331, {}, undefined]) {
      const res = await send('put', admin, '/api/ideas/admin/deadline', { deadlineDate });
      expect([String(deadlineDate), res.status]).toEqual([String(deadlineDate), 400]);
    }
    const settings = await IdeationSettings.findOne({ key: 'singleton' });
    expect(settings.deadlineDate).toBe('2027-03-31');
  });
});

describe('moderation (non bloquee par la date limite)', () => {
  beforeEach(async () => {
    await setDeadline('2020-01-01');
  });

  it('PUT /admin/:id modifie titre et description', async () => {
    const admin = await createAdmin();
    const s = await createUser();
    const idea = await createIdea(s, { hashtags: ['ia', 'web', 'data'] });
    const res = await send('put', admin, `/api/ideas/admin/${idea._id}`, {
      title: '  Titre propre  ', description: 'Description propre',
    });
    expect(res.status).toBe(200);
    const fresh = await Idea.findById(idea._id);
    expect(fresh.title).toBe('Titre propre');
    expect(fresh.description).toBe('Description propre');
    expect(fresh.hashtags).toEqual(['ia', 'web', 'data']);
    expect(fresh.lastActivityAt).toBeInstanceOf(Date);
  });

  it('PUT /admin/:id valide comme cote etudiant', async () => {
    const admin = await createAdmin();
    const s = await createUser();
    const idea = await createIdea(s);
    const bad = [
      { title: 'a'.repeat(81) },
      { title: '   ' },
      { title: 42 },
      { description: Array.from({ length: 51 }, () => 'mot').join(' ') },
      { description: '' },
      { description: { $ne: 1 } },
      {},
    ];
    for (const body of bad) {
      const res = await send('put', admin, `/api/ideas/admin/${idea._id}`, body);
      expect([JSON.stringify(body).slice(0, 30), res.status]).toEqual([JSON.stringify(body).slice(0, 30), 400]);
    }
    const ok = await send('put', admin, `/api/ideas/admin/${idea._id}`, { title: '\u{1F600}'.repeat(40) });
    expect(ok.status).toBe(200);
    expect((await send('put', admin, '/api/ideas/admin/507f1f77bcf86cd799439011', { title: 'x' })).status).toBe(404);
  });

  it('DELETE deck supprime toutes les versions et les fichiers, pas le logo', async () => {
    const admin = await createAdmin();
    const s = await createUser();
    const idea = await createIdea(s, {
      deck: { versions: [version(s, 1, 'deck-1.pdf'), version(s, 2, 'deck-2.pdf')] },
      logo: { versions: [version(s, 1, 'logo-1.png', 'png')] },
    });
    putFile(idea, 'deck-1.pdf');
    putFile(idea, 'deck-2.pdf');
    putFile(idea, 'logo-1.png');
    const res = await send('delete', admin, `/api/ideas/admin/${idea._id}/deck`);
    expect(res.status).toBe(200);
    const fresh = await Idea.findById(idea._id);
    expect(fresh.deck.versions).toHaveLength(0);
    expect(fresh.logo.versions).toHaveLength(1);
    expect(fresh.lastActivityAt).toBeInstanceOf(Date);
    expect(exists(idea, 'deck-1.pdf')).toBe(false);
    expect(exists(idea, 'deck-2.pdf')).toBe(false);
    expect(exists(idea, 'logo-1.png')).toBe(true);
  });

  it('DELETE logo supprime toutes les versions et les fichiers, pas le deck', async () => {
    const admin = await createAdmin();
    const s = await createUser();
    const idea = await createIdea(s, {
      logo: { versions: [version(s, 1, 'logo-1.png', 'png'), version(s, 2, 'logo-2.png', 'png')] },
    });
    putFile(idea, 'deck-1.pdf');
    putFile(idea, 'logo-1.png');
    putFile(idea, 'logo-2.png');
    const res = await send('delete', admin, `/api/ideas/admin/${idea._id}/logo`);
    expect(res.status).toBe(200);
    expect(res.body.data.logo.versions).toEqual([]);
    expect(exists(idea, 'logo-1.png')).toBe(false);
    expect(exists(idea, 'logo-2.png')).toBe(false);
    expect(exists(idea, 'deck-1.pdf')).toBe(true);
    expect((await Idea.findById(idea._id)).deck.versions).toHaveLength(1);
  });

  it('suppression de fichiers : fichier manquant toleree, storedName malveillant ignore', async () => {
    const admin = await createAdmin();
    const s = await createUser();
    const outside = path.join(storageDirFor('0'.repeat(24)), '..', `escape-${Date.now()}.txt`);
    fs.mkdirSync(path.dirname(outside), { recursive: true });
    fs.writeFileSync(outside, 'secret');
    const idea = await createIdea(s, {
      deck: {
        versions: [
          version(s, 1, 'absent.pdf'),
          version(s, 2, `../${path.basename(outside)}`),
          version(s, 3, outside),
        ],
      },
    });
    putFile(idea, 'autre.txt');
    try {
      const res = await send('delete', admin, `/api/ideas/admin/${idea._id}/deck`);
      expect(res.status).toBe(200);
      expect(fs.existsSync(outside)).toBe(true);
      expect((await Idea.findById(idea._id)).deck.versions).toHaveLength(0);
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });

  it('DELETE logo sans fichier : 200', async () => {
    const admin = await createAdmin();
    const s = await createUser();
    const idea = await createIdea(s);
    const res = await send('delete', admin, `/api/ideas/admin/${idea._id}/logo`);
    expect(res.status).toBe(200);
  });

  it('DELETE et PUT d\'un lien', async () => {
    const admin = await createAdmin();
    const s = await createUser();
    const idea = await createIdea(s, {
      day2Links: [
        { label: 'un', url: 'https://example.com/1' },
        { label: 'deux', url: 'https://example.com/2' },
      ],
    });
    const [l1, l2] = idea.day2Links;

    const put = await send('put', admin, `/api/ideas/admin/${idea._id}/links/${l1._id}`, { label: '  Renomme  ' });
    expect(put.status).toBe(200);
    let fresh = await Idea.findById(idea._id);
    expect(fresh.day2Links[0].label).toBe('Renomme');
    expect(fresh.day2Links[0].url).toBe('https://example.com/1');

    for (const label of ['', '   ', 'a'.repeat(81), 5, { $ne: 1 }, undefined]) {
      const bad = await send('put', admin, `/api/ideas/admin/${idea._id}/links/${l1._id}`, { label });
      expect(bad.status).toBe(400);
    }
    const ok80 = await send('put', admin, `/api/ideas/admin/${idea._id}/links/${l1._id}`, { label: '\u{1F600}'.repeat(80) });
    expect(ok80.status).toBe(200);

    const del = await send('delete', admin, `/api/ideas/admin/${idea._id}/links/${l2._id}`);
    expect(del.status).toBe(200);
    fresh = await Idea.findById(idea._id);
    expect(fresh.day2Links).toHaveLength(1);
    expect(fresh.lastActivityAt).toBeInstanceOf(Date);

    const again = await send('delete', admin, `/api/ideas/admin/${idea._id}/links/${l2._id}`);
    expect(again.status).toBe(404);
    const missingPut = await send('put', admin, `/api/ideas/admin/${idea._id}/links/${l2._id}`, { label: 'x' });
    expect(missingPut.status).toBe(404);
    const badId = await send('delete', admin, `/api/ideas/admin/${idea._id}/links/zzz`);
    expect(badId.status).toBe(404);
  });
});
