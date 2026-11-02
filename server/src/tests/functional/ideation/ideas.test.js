const request = require('supertest');
const app = require('../../../app');
const Idea = require('../../../models/Idea');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');
const { createIdea, setDeadline } = require('../../helpers/ideation');

const validBody = (over = {}) => ({
  title: 'Mon idée',
  description: 'Une description courte',
  hashtags: ['ia', 'web', 'data'],
  ...over,
});

const words = (n) => Array.from({ length: n }, (_, i) => `mot${i}`).join(' ');

// Aucune réponse étudiante ne doit contenir d'email
const expectNoEmail = (body) => {
  const json = JSON.stringify(body);
  expect(json).not.toMatch(/"email"/);
  expect(json).not.toMatch(/@epitech\.eu/);
};

describe('POST /api/ideas', () => {
  it('sans token donne 401', async () => {
    const res = await request(app).post('/api/ideas').send(validBody());
    expect(res.status).toBe(401);
  });

  it('sans titre donne 400', async () => {
    const u = await createUser();
    const res = await request(app).post('/api/ideas').set(authHeader(u)).send(validBody({ title: '   ' }));
    expect(res.status).toBe(400);
  });

  it('titre de plus de 80 points de code donne 400', async () => {
    const u = await createUser();
    const res = await request(app).post('/api/ideas').set(authHeader(u)).send(validBody({ title: 'a'.repeat(81) }));
    expect(res.status).toBe(400);
  });

  it('titre de 40 emoji (80 unités UTF-16) est accepté', async () => {
    const u = await createUser();
    const res = await request(app).post('/api/ideas').set(authHeader(u)).send(validBody({ title: '😀'.repeat(40) }));
    expect(res.status).toBe(201);
  });

  it('titre non textuel donne 400', async () => {
    const u = await createUser();
    const res = await request(app).post('/api/ideas').set(authHeader(u)).send(validBody({ title: ['x'] }));
    expect(res.status).toBe(400);
  });

  it('sans description donne 400', async () => {
    const u = await createUser();
    const res = await request(app).post('/api/ideas').set(authHeader(u)).send(validBody({ description: '' }));
    expect(res.status).toBe(400);
  });

  it('avec 2 hashtags donne 400', async () => {
    const u = await createUser();
    const res = await request(app).post('/api/ideas').set(authHeader(u)).send(validBody({ hashtags: ['ia', 'web'] }));
    expect(res.status).toBe(400);
  });

  it('avec #IA, ia, web (2 distincts) donne 400', async () => {
    const u = await createUser();
    const res = await request(app).post('/api/ideas').set(authHeader(u)).send(validBody({ hashtags: ['#IA', 'ia', 'web'] }));
    expect(res.status).toBe(400);
  });

  it('description de 51 mots donne 400 avec le message attendu', async () => {
    const u = await createUser();
    const res = await request(app).post('/api/ideas').set(authHeader(u)).send(validBody({ description: words(51) }));
    expect(res.status).toBe(400);
    expect(res.body.error || res.body.message).toMatch(/50 mots/);
  });

  it('description de 50 mots est acceptée', async () => {
    const u = await createUser();
    const res = await request(app).post('/api/ideas').set(authHeader(u)).send(validBody({ description: words(50) }));
    expect(res.status).toBe(201);
  });

  it('création valide : 201, hashtags normalisés, créateur membre accepté', async () => {
    const u = await createUser();
    const res = await request(app)
      .post('/api/ideas')
      .set(authHeader(u))
      .send(validBody({ hashtags: ['#IA', 'Web', 'x'] }));
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.hashtags).toEqual(['ia', 'web', 'x']);
    const saved = await Idea.findById(res.body.data._id);
    expect(saved.members).toHaveLength(1);
    expect(saved.members[0].status).toBe('accepted');
    expect(saved.members[0].email).toBe(u.email);
    expect(saved.creator.userId.toString()).toBe(u._id.toString());
    expectNoEmail(res.body);
  });

  it('après la date limite donne 403', async () => {
    await setDeadline('2000-01-01');
    const u = await createUser();
    const res = await request(app).post('/api/ideas').set(authHeader(u)).send(validBody());
    expect(res.status).toBe(403);
  });
});

describe('GET /api/ideas (catalogue)', () => {
  it('une idée sans deck n\'apparaît pas', async () => {
    const u = await createUser();
    await createIdea(u, { deck: { versions: [] } });
    const res = await request(app).get('/api/ideas').set(authHeader(u));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it('une idée masquée est absente pour un étudiant', async () => {
    const u = await createUser();
    const v = await createUser();
    await createIdea(u, { hidden: true });
    await createIdea(u, { title: 'Visible' });
    const res = await request(app).get('/api/ideas').set(authHeader(v));
    expect(res.body.data.map((i) => i.title)).toEqual(['Visible']);
  });

  it('renvoie la carte attendue', async () => {
    const u = await createUser();
    await createIdea(u);
    const res = await request(app).get('/api/ideas').set(authHeader(u));
    const card = res.body.data[0];
    expect(Object.keys(card).sort()).toEqual(
      ['_id', 'createdAt', 'description', 'hasLogo', 'hashtags', 'incomplete', 'memberCount', 'title'].sort()
    );
    expect(card.hasLogo).toBe(false);
    expect(card.memberCount).toBe(1);
    expect(card.incomplete).toBe(true);
  });

  it('q retrouve par titre (insensible à la casse)', async () => {
    const u = await createUser();
    await createIdea(u, { title: 'Robot Cuisinier' });
    await createIdea(u, { title: 'Autre' });
    const res = await request(app).get('/api/ideas?q=robot').set(authHeader(u));
    expect(res.body.data.map((i) => i.title)).toEqual(['Robot Cuisinier']);
  });

  it('q retrouve par nom d\'un membre accepté, pas d\'un invité en attente', async () => {
    const u = await createUser({ name: 'Alice Martin' });
    const pendingUser = await createUser({ name: 'Zorro Pending' });
    await createIdea(u, {
      title: 'Idée A',
      members: [
        { userId: u._id, name: u.name, email: u.email, status: 'accepted' },
        { userId: pendingUser._id, name: pendingUser.name, email: pendingUser.email, status: 'pending' },
      ],
    });
    const byMember = await request(app).get('/api/ideas?q=alice').set(authHeader(u));
    expect(byMember.body.data).toHaveLength(1);
    const byPending = await request(app).get('/api/ideas?q=zorro').set(authHeader(u));
    expect(byPending.body.data).toHaveLength(0);
  });

  it('q=.* ne renvoie pas tout (regex échappée)', async () => {
    const u = await createUser();
    await createIdea(u, { title: 'Alpha' });
    await createIdea(u, { title: 'Beta' });
    const res = await request(app).get('/api/ideas?q=.*').set(authHeader(u));
    expect(res.body.data).toHaveLength(0);
  });

  it('q sous forme d\'objet est rejeté ou neutralisé, jamais interprété par Mongo', async () => {
    const u = await createUser();
    await createIdea(u, { title: 'Alpha' });
    const res = await request(app).get('/api/ideas?q[$ne]=x').set(authHeader(u));
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) expect(res.body.data.length).toBeLessThanOrEqual(1);
    const res2 = await request(app).get('/api/ideas?q[a]=x').set(authHeader(u));
    expect(res2.status).toBe(400);
    const res3 = await request(app).get('/api/ideas?q=a&q=b').set(authHeader(u));
    expect(res3.status).toBe(400);
  });

  it('tags=ia,web exige les deux', async () => {
    const u = await createUser();
    await createIdea(u, { title: 'Les deux', hashtags: ['ia', 'web', 'x'] });
    await createIdea(u, { title: 'Un seul', hashtags: ['ia', 'y', 'z'] });
    const res = await request(app).get('/api/ideas?tags=ia,web').set(authHeader(u));
    expect(res.body.data.map((i) => i.title)).toEqual(['Les deux']);
    const norm = await request(app).get('/api/ideas?tags=%23IA,Web').set(authHeader(u));
    expect(norm.body.data).toHaveLength(1);
  });

  it('tags sous forme d\'objet donne 400', async () => {
    const u = await createUser();
    const res = await request(app).get('/api/ideas?tags[a]=x').set(authHeader(u));
    expect(res.status).toBe(400);
  });

  it('sort=title trie par titre, défaut par date décroissante', async () => {
    const u = await createUser();
    await createIdea(u, { title: 'Banane' });
    await createIdea(u, { title: 'abricot' });
    await createIdea(u, { title: 'Cerise' });
    const byTitle = await request(app).get('/api/ideas?sort=title').set(authHeader(u));
    expect(byTitle.body.data.map((i) => i.title)).toEqual(['abricot', 'Banane', 'Cerise']);
    const byDate = await request(app).get('/api/ideas').set(authHeader(u));
    expect(byDate.body.data.map((i) => i.title)).toEqual(['Cerise', 'abricot', 'Banane']);
  });

  it('sort invalide donne 400', async () => {
    const u = await createUser();
    const res = await request(app).get('/api/ideas?sort=hidden').set(authHeader(u));
    expect(res.status).toBe(400);
  });

  it('pagination : limit par défaut 24, max 50, total', async () => {
    const u = await createUser();
    await Idea.insertMany(
      Array.from({ length: 30 }, (_, i) => ({
        title: `Idée ${i}`,
        description: 'd',
        hashtags: ['a', 'b', 'c'],
        creator: { userId: u._id, name: u.name, email: u.email },
        members: [{ userId: u._id, name: u.name, email: u.email, status: 'accepted' }],
        deck: { versions: [{ number: 1, storedName: 's', originalName: 'o', size: 1 }] },
      }))
    );
    const def = await request(app).get('/api/ideas').set(authHeader(u));
    expect(def.body.data).toHaveLength(24);
    expect(def.body.total).toBe(30);
    const p2 = await request(app).get('/api/ideas?page=2').set(authHeader(u));
    expect(p2.body.data).toHaveLength(6);
    const big = await request(app).get('/api/ideas?limit=500').set(authHeader(u));
    expect(big.body.data).toHaveLength(30);
    const small = await request(app).get('/api/ideas?limit=5').set(authHeader(u));
    expect(small.body.data).toHaveLength(5);
  });

  it('la réponse n\'a jamais de champ email', async () => {
    const u = await createUser();
    const v = await createUser();
    await createIdea(u, {
      members: [
        { userId: u._id, name: u.name, email: u.email, status: 'accepted' },
        { userId: v._id, name: v.name, email: v.email, status: 'accepted' },
      ],
    });
    const res = await request(app).get('/api/ideas').set(authHeader(v));
    expect(res.body.data).toHaveLength(1);
    expectNoEmail(res.body);
  });
});

describe('GET /api/ideas/:id', () => {
  it('idée masquée : 404 pour un étudiant, visible pour un admin', async () => {
    const u = await createUser();
    const v = await createUser();
    const admin = await createAdmin();
    const idea = await createIdea(u, { hidden: true });
    expect((await request(app).get(`/api/ideas/${idea._id}`).set(authHeader(v))).status).toBe(404);
    expect((await request(app).get(`/api/ideas/${idea._id}`).set(authHeader(u))).status).toBe(404);
    expect((await request(app).get(`/api/ideas/${idea._id}`).set(authHeader(admin))).status).toBe(200);
  });

  it('id invalide donne 404', async () => {
    const u = await createUser();
    const res = await request(app).get('/api/ideas/pas-un-id').set(authHeader(u));
    expect(res.status).toBe(404);
  });

  it('R3 : sans deck, 404 pour un non-membre et un invité en attente, 200 pour créateur, membre accepté et admin', async () => {
    const creator = await createUser();
    const member = await createUser();
    const pending = await createUser();
    const other = await createUser();
    const admin = await createAdmin();
    const idea = await createIdea(creator, {
      deck: { versions: [] },
      members: [
        { userId: creator._id, name: creator.name, email: creator.email, status: 'accepted' },
        { userId: member._id, name: member.name, email: member.email, status: 'accepted' },
        { userId: pending._id, name: pending.name, email: pending.email, status: 'pending' },
      ],
    });
    const get = (u) => request(app).get(`/api/ideas/${idea._id}`).set(authHeader(u));
    expect((await get(other)).status).toBe(404);
    expect((await get(pending)).status).toBe(404);
    expect((await get(creator)).status).toBe(200);
    expect((await get(member)).status).toBe(200);
    expect((await get(admin)).status).toBe(200);
  });

  it('avec deck : visible par tout étudiant, sans email ni nom de fichier stocké', async () => {
    const creator = await createUser();
    const other = await createUser();
    const idea = await createIdea(creator);
    const res = await request(app).get(`/api/ideas/${idea._id}`).set(authHeader(other));
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Idée de test');
    expect(res.body.data.deck.current.number).toBe(1);
    expectNoEmail(res.body);
    expect(JSON.stringify(res.body)).not.toMatch(/storedName/);
  });

  it('l\'admin voit les emails', async () => {
    const creator = await createUser();
    const admin = await createAdmin();
    const idea = await createIdea(creator);
    const res = await request(app).get(`/api/ideas/${idea._id}`).set(authHeader(admin));
    expect(res.body.data.creator.email).toBe(creator.email);
    expect(res.body.data.members[0].email).toBe(creator.email);
  });
});

describe('PUT /api/ideas/:id', () => {
  it('membre accepté peut modifier, hashtags normalisés', async () => {
    const u = await createUser();
    const idea = await createIdea(u);
    const res = await request(app)
      .put(`/api/ideas/${idea._id}`)
      .set(authHeader(u))
      .send(validBody({ title: 'Nouveau titre', hashtags: ['#A', 'B', 'c'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Nouveau titre');
    expect(res.body.data.hashtags).toEqual(['a', 'b', 'c']);
    expectNoEmail(res.body);
  });

  it('étudiant non membre donne 403', async () => {
    const u = await createUser();
    const other = await createUser();
    const idea = await createIdea(u);
    const res = await request(app).put(`/api/ideas/${idea._id}`).set(authHeader(other)).send(validBody());
    expect(res.status).toBe(403);
  });

  it('membre en attente donne 403', async () => {
    const u = await createUser();
    const p = await createUser();
    const idea = await createIdea(u, {
      members: [
        { userId: u._id, name: u.name, email: u.email, status: 'accepted' },
        { userId: p._id, name: p.name, email: p.email, status: 'pending' },
      ],
    });
    const res = await request(app).put(`/api/ideas/${idea._id}`).set(authHeader(p)).send(validBody());
    expect(res.status).toBe(403);
  });

  it('mêmes validations que la création', async () => {
    const u = await createUser();
    const idea = await createIdea(u);
    const put = (b) => request(app).put(`/api/ideas/${idea._id}`).set(authHeader(u)).send(b);
    expect((await put(validBody({ title: '' }))).status).toBe(400);
    expect((await put(validBody({ hashtags: ['a', 'b'] }))).status).toBe(400);
    expect((await put(validBody({ description: words(51) }))).status).toBe(400);
  });

  it('idée masquée donne 404', async () => {
    const u = await createUser();
    const idea = await createIdea(u, { hidden: true });
    const res = await request(app).put(`/api/ideas/${idea._id}`).set(authHeader(u)).send(validBody());
    expect(res.status).toBe(404);
  });

  it('après la date limite donne 403', async () => {
    await setDeadline('2000-01-01');
    const u = await createUser();
    const idea = await createIdea(u);
    const res = await request(app).put(`/api/ideas/${idea._id}`).set(authHeader(u)).send(validBody());
    expect(res.status).toBe(403);
  });

  it('unlockedUntil futur rouvre cette idée seulement', async () => {
    await setDeadline('2000-01-01');
    const u = await createUser();
    const open = await createIdea(u, { unlockedUntil: new Date(Date.now() + 3600 * 1000) });
    const closed = await createIdea(u);
    const ok = await request(app).put(`/api/ideas/${open._id}`).set(authHeader(u)).send(validBody());
    expect(ok.status).toBe(200);
    const ko = await request(app).put(`/api/ideas/${closed._id}`).set(authHeader(u)).send(validBody());
    expect(ko.status).toBe(403);
  });
});

describe('GET /api/ideas/settings', () => {
  it('renvoie la date limite', async () => {
    const u = await createUser();
    await setDeadline('2099-12-31');
    const res = await request(app).get('/api/ideas/settings').set(authHeader(u));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deadlineDate: '2099-12-31' });
  });

  it('renvoie null sans date limite', async () => {
    const u = await createUser();
    const res = await request(app).get('/api/ideas/settings').set(authHeader(u));
    expect(res.body.data).toEqual({ deadlineDate: null });
  });
});

describe('GET /api/ideas/hashtags', () => {
  it('renvoie ia pour prefix=I, sans les hashtags des idées masquées', async () => {
    const u = await createUser();
    await createIdea(u, { hashtags: ['ia', 'web', 'x'] });
    await createIdea(u, { hashtags: ['ia', 'idee-cachee', 'y'], hidden: true });
    const res = await request(app).get('/api/ideas/hashtags?prefix=I').set(authHeader(u));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(['ia']);
  });

  it('limite à 10 résultats et échappe le préfixe', async () => {
    const u = await createUser();
    const tags = Array.from({ length: 15 }, (_, i) => `t${String(i).padStart(2, '0')}`);
    await createIdea(u, { hashtags: tags });
    const res = await request(app).get('/api/ideas/hashtags?prefix=t').set(authHeader(u));
    expect(res.body.data).toHaveLength(10);
    const rx = await request(app).get('/api/ideas/hashtags?prefix=.*').set(authHeader(u));
    expect(rx.body.data).toEqual([]);
  });

  it('prefix sous forme d\'objet donne 400', async () => {
    const u = await createUser();
    const res = await request(app).get('/api/ideas/hashtags?prefix[a]=x').set(authHeader(u));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/ideas/me', () => {
  it('liste mes idées avec rôle et mes invitations en attente, sans email', async () => {
    const me = await createUser();
    const other = await createUser();
    await createIdea(me, { title: 'Ma création' });
    await createIdea(other, {
      title: 'Rejointe',
      members: [
        { userId: other._id, name: other.name, email: other.email, status: 'accepted' },
        { userId: me._id, name: me.name, email: me.email, status: 'accepted' },
      ],
    });
    const invitedTo = await createIdea(other, {
      title: 'Invitation',
      members: [
        { userId: other._id, name: other.name, email: other.email, status: 'accepted' },
        { userId: me._id, name: me.name, email: me.email, status: 'pending' },
      ],
    });
    await createIdea(other, { title: 'Étrangère' });

    const res = await request(app).get('/api/ideas/me').set(authHeader(me));
    expect(res.status).toBe(200);
    const roles = Object.fromEntries(res.body.data.ideas.map((i) => [i.title, i.role]));
    expect(roles).toEqual({ 'Ma création': 'creator', Rejointe: 'member' });
    expect(res.body.data.invitations).toHaveLength(1);
    expect(res.body.data.invitations[0].ideaId).toBe(invitedTo._id.toString());
    expect(res.body.data.invitations[0].title).toBe('Invitation');
    expectNoEmail(res.body);
  });
});
