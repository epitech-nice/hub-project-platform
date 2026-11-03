const request = require('supertest');
const app = require('../../../app');
const Idea = require('../../../models/Idea');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');
const { createIdea, setDeadline } = require('../../helpers/ideation');

const entry = (u, status = 'accepted') => ({
  userId: u._id,
  name: u.name,
  email: u.email,
  status,
});

const invite = (idea, as, userId) =>
  request(app).post(`/api/ideas/${idea._id}/members`).set(authHeader(as)).send({ userId: String(userId) });
const accept = (idea, as) =>
  request(app).post(`/api/ideas/${idea._id}/invitation/accept`).set(authHeader(as));
const decline = (idea, as) =>
  request(app).post(`/api/ideas/${idea._id}/invitation/decline`).set(authHeader(as));
const remove = (idea, as, userId) =>
  request(app).delete(`/api/ideas/${idea._id}/members/${userId}`).set(authHeader(as));
const getIdea = (idea, as) => request(app).get(`/api/ideas/${idea._id}`).set(authHeader(as));
const put = (idea, as) =>
  request(app)
    .put(`/api/ideas/${idea._id}`)
    .set(authHeader(as))
    .send({ title: 'Titre', description: 'Desc', hashtags: ['a', 'b', 'c'] });

describe('GET /api/users/search', () => {
  it('un compte admin n apparait pas, un etudiant oui', async () => {
    const me = await createUser({ name: 'Moi' });
    await createAdmin({ name: 'Staffie Zorro', email: 'staffie.zorro@epitech.eu' });
    const st = await createUser({ name: 'Staffie Etudiant', email: 'staffie.etu@epitech.eu' });
    const res = await request(app).get('/api/users/search?q=staffie').set(authHeader(me));
    expect(res.status).toBe(200);
    expect(res.body.data.map((u) => u._id)).toEqual([String(st._id)]);
  });

  it('2 caractères donne 400', async () => {
    const me = await createUser();
    const res = await request(app).get('/api/users/search?q=ab').set(authHeader(me));
    expect(res.status).toBe(400);
  });

  it('q absent, tableau ou objet donne 400', async () => {
    const me = await createUser();
    const s = (qs) => request(app).get(`/api/users/search${qs}`).set(authHeader(me));
    expect((await s('')).status).toBe(400);
    expect((await s('?q=abc&q=def')).status).toBe(400);
    expect((await s('?q[$ne]=x')).status).toBe(400);
    expect((await s('?q=%20%20ab%20')).status).toBe(400);
  });

  it('sans authentification donne 401', async () => {
    const res = await request(app).get('/api/users/search?q=abc');
    expect(res.status).toBe(401);
  });

  it('renvoie _id, name, login seulement (ni email, ni domaine, ni microsoftId, ni role)', async () => {
    const me = await createUser({ name: 'Zed Chercheur' });
    const target = await createUser({ name: 'Marcel Dupont', email: 'marcel.dupont@epitech.eu', microsoftId: 'ms-secret-123' });
    const res = await request(app).get('/api/users/search?q=marcel').set(authHeader(me));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ _id: String(target._id), name: 'Marcel Dupont', login: 'marcel.dupont' }]);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/epitech\.eu/);
    expect(raw).not.toMatch(/microsoftId|ms-secret-123|"email"|"role"/);
  });

  it('trouve par partie locale de l\'email, exclut le demandeur', async () => {
    const me = await createUser({ name: 'Moi', email: 'jeanne.durand@epitech.eu' });
    await createUser({ name: 'Autre', email: 'jeanne.martin@epitech.eu' });
    const res = await request(app).get('/api/users/search?q=jeanne').set(authHeader(me));
    expect(res.body.data.map((u) => u.login)).toEqual(['jeanne.martin']);
  });

  it('ne cherche pas dans le domaine', async () => {
    const me = await createUser();
    await createUser({ name: 'Quelqu un', email: 'quelqu.un@epitech.eu' });
    const res = await request(app).get('/api/users/search?q=epitech').set(authHeader(me));
    expect(res.body.data).toEqual([]);
  });

  it('la saisie est échappée (pas de regex) et 10 résultats maximum', async () => {
    const me = await createUser();
    for (let i = 0; i < 12; i += 1) await createUser({ name: `Lot Groupe ${i}` });
    const res = await request(app).get('/api/users/search?q=lot%20gro').set(authHeader(me));
    expect(res.body.data).toHaveLength(10);
    const rx = await request(app).get('/api/users/search?q=.*.*.*').set(authHeader(me));
    expect(rx.status).toBe(200);
    expect(rx.body.data).toEqual([]);
  });

  it('limiteur dédié : 30 requêtes par minute et par utilisateur', async () => {
    const me = await createUser();
    const other = await createUser();
    let last;
    for (let i = 0; i < 30; i += 1) {
      last = await request(app).get('/api/users/search?q=abc').set(authHeader(me));
      expect(last.status).toBe(200);
    }
    last = await request(app).get('/api/users/search?q=abc').set(authHeader(me));
    expect(last.status).toBe(429);
    const ok = await request(app).get('/api/users/search?q=abc').set(authHeader(other));
    expect(ok.status).toBe(200);
  });
});

describe('POST /api/ideas/:id/members', () => {
  it('le créateur invite : entrée pending, invité en attente ne peut pas modifier', async () => {
    const creator = await createUser();
    const guest = await createUser();
    const idea = await createIdea(creator);
    const res = await invite(idea, creator, guest._id);
    expect(res.status).toBe(200);
    expect(res.body.data.members.find((m) => m.userId === String(guest._id)).status).toBe('pending');
    expect(JSON.stringify(res.body)).not.toMatch(/"email"/);
    expect((await put(idea, guest)).status).toBe(403);
  });

  it('accepter donne les droits', async () => {
    const creator = await createUser();
    const guest = await createUser();
    const idea = await createIdea(creator);
    await invite(idea, creator, guest._id);
    const res = await accept(idea, guest);
    expect(res.status).toBe(200);
    expect(res.body.data.myRole).toBe('member');
    expect((await put(idea, guest)).status).toBe(200);
  });

  it('un admin créateur garde son rôle de groupe, un admin extérieur reste admin', async () => {
    const admin = await createAdmin();
    const guest = await createUser();
    const own = await createIdea(admin);
    expect((await getIdea(own, admin)).body.data.myRole).toBe('creator');
    expect((await put(own, admin)).status).toBe(200);

    const other = await createIdea(guest);
    expect((await getIdea(other, admin)).body.data.myRole).toBe('admin');
  });

  it('refuser retire l\'entrée', async () => {
    const creator = await createUser();
    const guest = await createUser();
    const idea = await createIdea(creator);
    await invite(idea, creator, guest._id);
    const res = await decline(idea, guest);
    expect(res.status).toBe(200);
    const fresh = await Idea.findById(idea._id);
    expect(fresh.members).toHaveLength(1);
  });

  it('inviter deux fois le même étudiant est refusé', async () => {
    const creator = await createUser();
    const guest = await createUser();
    const idea = await createIdea(creator);
    expect((await invite(idea, creator, guest._id)).status).toBe(200);
    const again = await invite(idea, creator, guest._id);
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/déjà/);
    const self = await invite(idea, creator, creator._id);
    expect(self.status).toBe(400);
    expect((await Idea.findById(idea._id)).members).toHaveLength(2);
  });

  it('un non-créateur ne peut pas inviter (403), même membre accepté', async () => {
    const creator = await createUser();
    const member = await createUser();
    const guest = await createUser();
    const idea = await createIdea(creator, { members: [entry(creator), entry(member)] });
    expect((await invite(idea, member, guest._id)).status).toBe(403);
    expect((await invite(idea, guest, guest._id)).status).toBe(403);
  });

  it('utilisateur inconnu, id invalide ou absent', async () => {
    const creator = await createUser();
    const idea = await createIdea(creator);
    const unknown = await invite(idea, creator, '507f1f77bcf86cd799439011');
    expect(unknown.status).toBe(404);
    expect((await invite(idea, creator, 'nimporte')).status).toBe(400);
    const none = await request(app).post(`/api/ideas/${idea._id}/members`).set(authHeader(creator)).send({});
    expect(none.status).toBe(400);
    const obj = await request(app).post(`/api/ideas/${idea._id}/members`).set(authHeader(creator)).send({ userId: { $ne: null } });
    expect(obj.status).toBe(400);
  });

  it('inviter un admin est refuse comme un utilisateur inconnu', async () => {
    const creator = await createUser();
    const admin = await createAdmin();
    const idea = await createIdea(creator);
    const res = await invite(idea, creator, admin._id);
    const unknown = await invite(idea, creator, '507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
    expect(res.body).toEqual(unknown.body);
    const fresh = await Idea.findById(idea._id);
    expect(fresh.members).toHaveLength(1);
  });

  it('groupe de 6 (acceptés et en attente) refuse la 7e avec le message exact', async () => {
    const creator = await createUser();
    const others = [];
    for (let i = 0; i < 5; i += 1) others.push(await createUser());
    const members = [entry(creator), ...others.map((o, i) => entry(o, i < 2 ? 'accepted' : 'pending'))];
    const idea = await createIdea(creator, { members });
    const guest = await createUser();
    const res = await invite(idea, creator, guest._id);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Un groupe ne peut pas dépasser 6 membres');
  });

  it('deux invitations simultanées sur un groupe de 5 : un succès, un refus, taille 6 (5 itérations)', async () => {
    for (let i = 0; i < 5; i += 1) {
      const creator = await createUser();
      const four = [];
      for (let j = 0; j < 4; j += 1) four.push(await createUser());
      const idea = await createIdea(creator, { members: [entry(creator), ...four.map((u) => entry(u))] });
      const a = await createUser();
      const b = await createUser();
      const results = await Promise.all([invite(idea, creator, a._id), invite(idea, creator, b._id)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
      const refused = results.find((r) => r.status === 400);
      expect(refused.body.error).toBe('Un groupe ne peut pas dépasser 6 membres');
      expect((await Idea.findById(idea._id)).members).toHaveLength(6);
    }
  });

  it('deux invitations simultanées du même étudiant : une seule entrée', async () => {
    const creator = await createUser();
    const guest = await createUser();
    const idea = await createIdea(creator);
    const results = await Promise.all([invite(idea, creator, guest._id), invite(idea, creator, guest._id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await Idea.findById(idea._id)).members).toHaveLength(2);
  });

  it('après la date limite l\'invitation est refusée, sauf idée rouverte', async () => {
    await setDeadline('2000-01-01');
    const creator = await createUser();
    const guest = await createUser();
    const idea = await createIdea(creator);
    expect((await invite(idea, creator, guest._id)).status).toBe(403);
    await Idea.updateOne({ _id: idea._id }, { unlockedUntil: new Date(Date.now() + 3600000) });
    expect((await invite(idea, creator, guest._id)).status).toBe(200);
  });

  it('après la date limite accepter et refuser sont refusés', async () => {
    const creator = await createUser();
    const guest = await createUser();
    const idea = await createIdea(creator, { members: [entry(creator), entry(guest, 'pending')] });
    await setDeadline('2000-01-01');
    expect((await accept(idea, guest)).status).toBe(403);
    expect((await decline(idea, guest)).status).toBe(403);
    expect((await Idea.findById(idea._id)).members).toHaveLength(2);
  });
});

describe('invitation accept / decline', () => {
  it('accepter deux fois : pas de 500, pas de double compte', async () => {
    const creator = await createUser();
    const guest = await createUser();
    const idea = await createIdea(creator, { members: [entry(creator), entry(guest, 'pending')] });
    expect((await accept(idea, guest)).status).toBe(200);
    const again = await accept(idea, guest);
    expect(again.status).toBe(400);
    const fresh = await Idea.findById(idea._id);
    expect(fresh.members).toHaveLength(2);
    expect(fresh.acceptedCount()).toBe(2);
  });

  it('accepts simultanés : une seule entrée acceptée', async () => {
    const creator = await createUser();
    const guest = await createUser();
    const idea = await createIdea(creator, { members: [entry(creator), entry(guest, 'pending')] });
    const results = await Promise.all([accept(idea, guest), accept(idea, guest)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await Idea.findById(idea._id)).acceptedCount()).toBe(2);
  });

  it('seul l\'invité en attente peut répondre : créateur et membre accepté refusés', async () => {
    const creator = await createUser();
    const guest = await createUser();
    const idea = await createIdea(creator, { members: [entry(creator), entry(guest, 'pending')] });
    expect((await accept(idea, creator)).status).toBe(400);
    expect((await decline(idea, creator)).status).toBe(400);
    expect((await Idea.findById(idea._id)).members).toHaveLength(2);
  });

  it('refuser une invitation déjà acceptée ne retire pas le membre', async () => {
    const creator = await createUser();
    const member = await createUser();
    const idea = await createIdea(creator, { members: [entry(creator), entry(member)] });
    expect((await decline(idea, member)).status).toBe(400);
    expect((await Idea.findById(idea._id)).members).toHaveLength(2);
  });

  it('R10 : invité en attente d\'une idée sans deck peut la lire et accepter ; non listé 404', async () => {
    const creator = await createUser();
    const guest = await createUser();
    const stranger = await createUser();
    const idea = await createIdea(creator, { deck: { versions: [] } });
    expect((await invite(idea, creator, guest._id)).status).toBe(200);
    expect((await getIdea(idea, stranger)).status).toBe(404);
    expect((await accept(idea, stranger)).status).toBe(404);
    expect((await decline(idea, stranger)).status).toBe(404);
    const read = await getIdea(idea, guest);
    expect(read.status).toBe(200);
    expect(read.body.data.myRole).toBe('pending');
    expect((await put(idea, guest)).status).toBe(403);
    const acc = await accept(idea, guest);
    expect(acc.status).toBe(200);
    expect((await put(idea, guest)).status).toBe(200);
  });

  it('R10 : invité en attente peut refuser sur une idée sans deck', async () => {
    const creator = await createUser();
    const guest = await createUser();
    const idea = await createIdea(creator, { deck: { versions: [] }, members: [entry(creator), entry(guest, 'pending')] });
    expect((await decline(idea, guest)).status).toBe(200);
    expect((await getIdea(idea, guest)).status).toBe(404);
  });
});

describe('DELETE /api/ideas/:id/members/:userId', () => {
  it('le créateur retire un membre, qui perd ses droits immédiatement', async () => {
    const creator = await createUser();
    const member = await createUser();
    const idea = await createIdea(creator, { members: [entry(creator), entry(member)] });
    expect((await put(idea, member)).status).toBe(200);
    const res = await remove(idea, creator, member._id);
    expect(res.status).toBe(200);
    expect(res.body.data.members).toHaveLength(1);
    expect((await put(idea, member)).status).toBe(403);
  });

  it('le créateur retire un invité en attente', async () => {
    const creator = await createUser();
    const guest = await createUser();
    const idea = await createIdea(creator, { members: [entry(creator), entry(guest, 'pending')] });
    expect((await remove(idea, creator, guest._id)).status).toBe(200);
    expect((await Idea.findById(idea._id)).members).toHaveLength(1);
  });

  it('retirer le créateur donne 400, même par lui-même', async () => {
    const creator = await createUser();
    const member = await createUser();
    const idea = await createIdea(creator, { members: [entry(creator), entry(member)] });
    const res = await remove(idea, creator, creator._id);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Le créateur ne peut pas quitter son idée');
    expect((await remove(idea, member, creator._id)).status).toBe(400);
    expect((await Idea.findById(idea._id)).members).toHaveLength(2);
  });

  it('un membre se retire lui-même, un invité en attente aussi', async () => {
    const creator = await createUser();
    const member = await createUser();
    const guest = await createUser();
    const idea = await createIdea(creator, { members: [entry(creator), entry(member), entry(guest, 'pending')] });
    expect((await remove(idea, member, member._id)).status).toBe(200);
    expect((await remove(idea, guest, guest._id)).status).toBe(200);
    expect((await Idea.findById(idea._id)).members).toHaveLength(1);
  });

  it('un membre ne peut pas retirer un autre membre (403) ; non-membre 403', async () => {
    const creator = await createUser();
    const a = await createUser();
    const b = await createUser();
    const stranger = await createUser();
    const idea = await createIdea(creator, { members: [entry(creator), entry(a), entry(b)] });
    expect((await remove(idea, a, b._id)).status).toBe(403);
    expect((await remove(idea, stranger, b._id)).status).toBe(403);
    expect((await Idea.findById(idea._id)).members).toHaveLength(3);
  });

  it('membre introuvable 404, id invalide 400', async () => {
    const creator = await createUser();
    const idea = await createIdea(creator);
    expect((await remove(idea, creator, '507f1f77bcf86cd799439011')).status).toBe(404);
    expect((await remove(idea, creator, 'zzz')).status).toBe(400);
  });

  it('après la date limite le retrait est refusé', async () => {
    const creator = await createUser();
    const member = await createUser();
    const idea = await createIdea(creator, { members: [entry(creator), entry(member)] });
    await setDeadline('2000-01-01');
    expect((await remove(idea, creator, member._id)).status).toBe(403);
  });
});

describe('visibilité des membres dans la fiche', () => {
  const setup = async () => {
    const creator = await createUser({ name: 'Createur C' });
    const member = await createUser({ name: 'Membre M' });
    const guest = await createUser({ name: 'Invite I' });
    const other = await createUser({ name: 'Autre A' });
    const admin = await createAdmin();
    const idea = await createIdea(creator, { members: [entry(creator), entry(member), entry(guest, 'pending')] });
    return { creator, member, guest, other, admin, idea };
  };

  it('le créateur voit tous les membres (pending compris) avec userId, sans email', async () => {
    const { creator, member, guest, idea } = await setup();
    const res = await getIdea(idea, creator);
    expect(res.body.data.members.map((m) => m.userId).sort()).toEqual(
      [String(creator._id), String(member._id), String(guest._id)].sort()
    );
    expect(res.body.data.members.some((m) => m.status === 'pending')).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/"email"/);
  });

  it('l\'admin voit tout, emails compris', async () => {
    const { admin, idea, guest } = await setup();
    const res = await getIdea(idea, admin);
    expect(res.body.data.members).toHaveLength(3);
    expect(res.body.data.members.find((m) => m.status === 'pending').email).toBe(guest.email);
  });

  it('un autre étudiant ne voit que les noms des acceptés, sans userId ni pending', async () => {
    const { other, idea } = await setup();
    const res = await getIdea(idea, other);
    expect(res.status).toBe(200);
    const raw = JSON.stringify(res.body);
    expect(res.body.data.members.map((m) => m.name).sort()).toEqual(['Createur C', 'Membre M']);
    expect(res.body.data.members.every((m) => m.status === 'accepted' && m.userId === undefined)).toBe(true);
    expect(raw).not.toMatch(/Invite I|"email"/);
    expect(res.body.data.memberCount).toBe(2);
  });

  it('un membre accepté ne voit pas les pending ni les userId des autres, mais son propre', async () => {
    const { member, idea } = await setup();
    const res = await getIdea(idea, member);
    expect(res.body.data.members).toHaveLength(2);
    const mine = res.body.data.members.find((m) => m.name === 'Membre M');
    const theirs = res.body.data.members.find((m) => m.name === 'Createur C');
    expect(mine.userId).toBe(String(member._id));
    expect(theirs.userId).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/"email"/);
  });

  it('l\'invité voit sa propre entrée pending (avec son userId) mais pas celle des autres', async () => {
    const { guest, idea } = await setup();
    const res = await getIdea(idea, guest);
    const pend = res.body.data.members.filter((m) => m.status === 'pending');
    expect(pend).toHaveLength(1);
    expect(pend[0].userId).toBe(String(guest._id));
    expect(res.body.data.members.filter((m) => m.status === 'accepted').every((m) => m.userId === undefined)).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/"email"/);
  });

  it('idée soumise à 1 ou 2 acceptés : incomplete vrai', async () => {
    const creator = await createUser();
    const member = await createUser();
    const idea = await createIdea(creator);
    expect((await getIdea(idea, creator)).body.data.incomplete).toBe(true);
    await Idea.updateOne({ _id: idea._id }, { $push: { members: entry(member) } });
    expect((await getIdea(idea, creator)).body.data.incomplete).toBe(true);
    const third = await createUser();
    await Idea.updateOne({ _id: idea._id }, { $push: { members: entry(third) } });
    expect((await getIdea(idea, creator)).body.data.incomplete).toBe(false);
  });
});
