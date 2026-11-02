const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../../../app');
const Idea = require('../../../models/Idea');
const { storageDirFor } = require('../../../utils/fileSignature');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');
const { createIdea, setDeadline } = require('../../helpers/ideation');

const PDF = (tag = '') => Buffer.concat([Buffer.from(`%PDF-1.7\n${tag}`), Buffer.alloc(1024, 0x20)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(512)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');

const dirs = new Set();
// Dépose un fichier dans le stockage de l'idée et renvoie son nom stocké
const putFile = (idea, name, content) => {
  const dir = storageDirFor(idea._id.toString());
  dirs.add(dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);
  return name;
};
const track = (idea) => dirs.add(storageDirFor(idea._id.toString()));
const listDir = (idea) => {
  const dir = storageDirFor(idea._id.toString());
  return fs.existsSync(dir) ? fs.readdirSync(dir) : null;
};

const addVersion = async (idea, kind, version) => {
  idea[kind].versions.push(version);
  await idea.save();
};

afterEach(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  dirs.clear();
});

describe('POST /api/ideas/:id/deck et /logo', () => {
  it('un membre depose un deck puis un second : versions 1 et 2, courante = 2', async () => {
    const u = await createUser();
    const idea = await createIdea(u, { deck: { versions: [] } });
    track(idea);

    const r1 = await request(app).post(`/api/ideas/${idea._id}/deck`).set(authHeader(u)).attach('file', PDF('a'), 'deck.pdf');
    expect(r1.status).toBe(200);
    expect(r1.body.data.deck.current.number).toBe(1);
    const r2 = await request(app).post(`/api/ideas/${idea._id}/deck`).set(authHeader(u)).attach('file', PDF('b'), 'deck2.pdf');
    expect(r2.status).toBe(200);
    expect(r2.body.data.deck.current.number).toBe(2);
    expect(r2.body.data.deck.versions.map((v) => v.number)).toEqual([2, 1]);

    const json = JSON.stringify(r2.body);
    expect(json).not.toMatch(/storedName/);
    expect(json).not.toMatch(/"email"/);
    expect(json).not.toMatch(/storage/);

    const v1 = await request(app).get(`/api/ideas/${idea._id}/deck/1`).set(authHeader(u));
    expect(v1.status).toBe(200);
    const cur = await request(app).get(`/api/ideas/${idea._id}/deck`).set(authHeader(u));
    expect(cur.status).toBe(200);
    expect(cur.body.toString()).toContain('%PDF-1.7\nb');

    const fresh = await Idea.findById(idea._id);
    expect(fresh.lastActivityAt).toBeInstanceOf(Date);
  });

  it('un membre depose un logo PNG', async () => {
    const u = await createUser();
    const idea = await createIdea(u);
    track(idea);
    const res = await request(app).post(`/api/ideas/${idea._id}/logo`).set(authHeader(u)).attach('file', PNG, 'logo.png');
    expect(res.status).toBe(200);
    expect(res.body.data.logo.current.number).toBe(1);
  });

  it('sans token donne 401', async () => {
    const u = await createUser();
    const idea = await createIdea(u);
    const res = await request(app).post(`/api/ideas/${idea._id}/deck`).attach('file', PDF(), 'deck.pdf');
    expect(res.status).toBe(401);
  });

  it('un non-membre recoit 403 et rien n est ecrit sur le disque', async () => {
    const u = await createUser();
    const other = await createUser();
    const idea = await createIdea(u);
    track(idea);
    const res = await request(app).post(`/api/ideas/${idea._id}/deck`).set(authHeader(other)).attach('file', PDF(), 'deck.pdf');
    expect(res.status).toBe(403);
    expect(listDir(idea)).toBeNull();
  });

  it('un invite en attente recoit 403 et rien n est ecrit', async () => {
    const u = await createUser();
    const guest = await createUser();
    const idea = await createIdea(u);
    idea.members.push({ userId: guest._id, name: guest.name, email: guest.email, status: 'pending' });
    await idea.save();
    track(idea);
    const res = await request(app).post(`/api/ideas/${idea._id}/deck`).set(authHeader(guest)).attach('file', PDF(), 'deck.pdf');
    expect(res.status).toBe(403);
    expect(listDir(idea)).toBeNull();
  });

  it('apres la date limite donne 403 et rien n est ecrit', async () => {
    const u = await createUser();
    const idea = await createIdea(u);
    track(idea);
    await setDeadline('2020-01-01');
    const res = await request(app).post(`/api/ideas/${idea._id}/deck`).set(authHeader(u)).attach('file', PDF(), 'deck.pdf');
    expect(res.status).toBe(403);
    expect(listDir(idea)).toBeNull();
  });

  it('un fichier invalide donne 400 et ne cree pas de version', async () => {
    const u = await createUser();
    const idea = await createIdea(u);
    track(idea);
    const res = await request(app).post(`/api/ideas/${idea._id}/deck`).set(authHeader(u)).attach('file', Buffer.from('texte'), 'a.pdf');
    expect(res.status).toBe(400);
    const fresh = await Idea.findById(idea._id);
    expect(fresh.deck.versions).toHaveLength(1);
  });

  it('un echec en base supprime le fichier depose', async () => {
    const u = await createUser();
    const idea = await createIdea(u, { deck: { versions: [] } });
    track(idea);
    const spy = jest.spyOn(Idea, 'findOneAndUpdate').mockRejectedValueOnce(new Error('boom'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).post(`/api/ideas/${idea._id}/deck`).set(authHeader(u)).attach('file', PDF(), 'deck.pdf');
    spy.mockRestore();
    console.error.mockRestore();
    expect(res.status).toBe(500);
    expect(listDir(idea)).toEqual([]);
  });
});

describe('GET /api/ideas/:id/:kind/:version?', () => {
  const setup = async (over = {}) => {
    const u = await createUser();
    const idea = await createIdea(u, over);
    return { u, idea };
  };

  it('sans token donne 401', async () => {
    const { idea } = await setup();
    const res = await request(app).get(`/api/ideas/${idea._id}/deck`);
    expect(res.status).toBe(401);
  });

  it('un utilisateur connecte quelconque telecharge le deck (RG6) avec les en-tetes de securite', async () => {
    const { idea } = await setup();
    putFile(idea, 'deck-1.pdf', PDF('x'));
    const other = await createUser();
    const res = await request(app).get(`/api/ideas/${idea._id}/deck`).set(authHeader(other));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/pdf/);
    expect(res.headers['content-disposition']).toBe("attachment; filename*=UTF-8''deck.pdf");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
  });

  it('idee masquee : 404 pour un etudiant, 200 pour un admin', async () => {
    const { idea } = await setup({ hidden: true });
    putFile(idea, 'deck-1.pdf', PDF());
    const student = await createUser();
    const admin = await createAdmin();
    expect((await request(app).get(`/api/ideas/${idea._id}/deck`).set(authHeader(student))).status).toBe(404);
    expect((await request(app).get(`/api/ideas/${idea._id}/deck`).set(authHeader(admin))).status).toBe(200);
  });

  it('un storedName altere en base ne sort pas du dossier (404)', async () => {
    const { u, idea } = await setup();
    putFile(idea, 'deck-1.pdf', PDF());
    await Idea.updateOne({ _id: idea._id }, { $set: { 'deck.versions.0.storedName': '../../../../../../../etc/passwd' } });
    const res = await request(app).get(`/api/ideas/${idea._id}/deck`).set(authHeader(u));
    expect(res.status).toBe(404);
    expect(res.headers['content-disposition']).toBeUndefined();
  });

  it('un storedName absolu altere donne 404', async () => {
    const { u, idea } = await setup();
    await Idea.updateOne({ _id: idea._id }, { $set: { 'deck.versions.0.storedName': '/etc/passwd' } });
    const res = await request(app).get(`/api/ideas/${idea._id}/deck`).set(authHeader(u));
    expect(res.status).toBe(404);
  });

  it('un SVG est servi en attachment avec nosniff et CSP', async () => {
    const { u, idea } = await setup();
    putFile(idea, 'logo-1.svg', SVG);
    await addVersion(idea, 'logo', { number: 1, storedName: 'logo-1.svg', originalName: 'logo.svg', size: SVG.length });
    const res = await request(app).get(`/api/ideas/${idea._id}/logo`).set(authHeader(u));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(res.headers['content-type']).toMatch(/^image\/svg\+xml/);
  });

  it('un PNG est servi en inline', async () => {
    const { u, idea } = await setup();
    putFile(idea, 'logo-1.png', PNG);
    await addVersion(idea, 'logo', { number: 1, storedName: 'logo-1.png', originalName: 'logo.png', size: PNG.length });
    const res = await request(app).get(`/api/ideas/${idea._id}/logo`).set(authHeader(u));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^inline/);
    expect(res.headers['content-type']).toMatch(/^image\/png/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('version inexistante donne 404, version non numerique aussi', async () => {
    const { u, idea } = await setup();
    putFile(idea, 'deck-1.pdf', PDF());
    expect((await request(app).get(`/api/ideas/${idea._id}/deck/9`).set(authHeader(u))).status).toBe(404);
    expect((await request(app).get(`/api/ideas/${idea._id}/deck/abc`).set(authHeader(u))).status).toBe(404);
  });

  it('idee sans logo donne 404', async () => {
    const { u, idea } = await setup();
    const res = await request(app).get(`/api/ideas/${idea._id}/logo`).set(authHeader(u));
    expect(res.status).toBe(404);
  });

  it('fichier absent du disque donne 404 en francais', async () => {
    const { u, idea } = await setup();
    const res = await request(app).get(`/api/ideas/${idea._id}/deck`).set(authHeader(u));
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Fichier introuvable/);
  });

  it('idee sans deck : 404 pour un non-membre, 200 pour le createur', async () => {
    const { u, idea } = await setup({ deck: { versions: [] } });
    putFile(idea, 'logo-1.png', PNG);
    await addVersion(idea, 'logo', { number: 1, storedName: 'logo-1.png', originalName: 'logo.png', size: PNG.length });
    const other = await createUser();
    expect((await request(app).get(`/api/ideas/${idea._id}/logo`).set(authHeader(other))).status).toBe(404);
    expect((await request(app).get(`/api/ideas/${idea._id}/logo`).set(authHeader(u))).status).toBe(200);
  });

  it('le nom d origine est encode (pas d injection CR/LF ni de guillemet)', async () => {
    const { u, idea } = await setup();
    putFile(idea, 'deck-1.pdf', PDF());
    await Idea.updateOne(
      { _id: idea._id },
      { $set: { 'deck.versions.0.originalName': 'a"b\r\nX-Evil: 1é\'(1).pdf' } }
    );
    const res = await request(app).get(`/api/ideas/${idea._id}/deck`).set(authHeader(u));
    expect(res.status).toBe(200);
    const cd = res.headers['content-disposition'];
    expect(cd).toMatch(/^attachment; filename\*=UTF-8''[A-Za-z0-9%._-]+$/);
    expect(cd).toContain('%C3%A9');
    expect(res.headers['x-evil']).toBeUndefined();
  });

  it('un identifiant en majuscules ne lit pas un autre dossier', async () => {
    const { u, idea } = await setup();
    putFile(idea, 'deck-1.pdf', PDF());
    const res = await request(app).get(`/api/ideas/${idea._id.toString().toUpperCase()}/deck`).set(authHeader(u));
    expect([200, 404]).toContain(res.status);
  });
});

describe('noms de fichiers d origine (accents, longueur)', () => {
  const upload = (u, idea, buf, name) =>
    request(app).post(`/api/ideas/${idea._id}/deck`).set(authHeader(u)).attach('file', buf, name);

  it('un nom accentue est conserve et sert de nom de telechargement', async () => {
    const u = await createUser();
    const idea = await createIdea(u, { deck: { versions: [] } });
    track(idea);
    const res = await upload(u, idea, PDF(), 'présentation.pdf');
    expect(res.status).toBe(200);
    expect(res.body.data.deck.current.originalName).toBe('présentation.pdf');
    const dl = await request(app).get(`/api/ideas/${idea._id}/deck`).set(authHeader(u));
    expect(dl.headers['content-disposition']).toContain("filename*=UTF-8''pr%C3%A9sentation.pdf");
  });

  it('un nom emoji / CJK fait l aller-retour', async () => {
    const u = await createUser();
    const idea = await createIdea(u, { deck: { versions: [] } });
    track(idea);
    const res = await upload(u, idea, PDF(), '幻灯片-📊.pdf');
    expect(res.status).toBe(200);
    expect(res.body.data.deck.current.originalName).toBe('幻灯片-📊.pdf');
  });

  it('un nom ASCII est inchange', async () => {
    const u = await createUser();
    const idea = await createIdea(u, { deck: { versions: [] } });
    track(idea);
    const res = await upload(u, idea, PDF(), 'my deck-1.pdf');
    expect(res.status).toBe(200);
    expect(res.body.data.deck.current.originalName).toBe('my deck-1.pdf');
  });

  it('un nom de 300 caracteres ne donne pas de 500 et aucun chemin n est expose', async () => {
    const u = await createUser();
    const idea = await createIdea(u, { deck: { versions: [] } });
    track(idea);
    const res = await upload(u, idea, PDF(), `${'a'.repeat(296)}.pdf`);
    expect(res.status).toBe(200);
    const name = res.body.data.deck.current.originalName;
    expect(name.length).toBeLessThanOrEqual(255);
    expect(name.endsWith('.pdf')).toBe(true);
    const files = listDir(idea);
    expect(files).toHaveLength(1);
    expect(files[0].endsWith('.pdf')).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/storage|\/Users|\/tmp|\/var/);
  });

  it('un nom aux octets latin1 non reparables est laisse tel quel sans plantage', async () => {
    const u = await createUser();
    const idea = await createIdea(u, { deck: { versions: [] } });
    track(idea);
    const b = 'XXBOUNDARY';
    const body = Buffer.concat([
      Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="caf`),
      Buffer.from([0xe9]),
      Buffer.from(`.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      PDF(),
      Buffer.from(`\r\n--${b}--\r\n`),
    ]);
    const res = await request(app)
      .post(`/api/ideas/${idea._id}/deck`)
      .set(authHeader(u))
      .set('Content-Type', `multipart/form-data; boundary=${b}`)
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.data.deck.current.originalName).toBe('café.pdf');
  });
});

describe('plafond de versions par fichier', () => {
  const versions = (u, n) =>
    Array.from({ length: n }, (_, i) => ({
      number: i + 1,
      storedName: `v${i + 1}.pdf`,
      originalName: `v${i + 1}.pdf`,
      size: 10,
      author: { userId: u._id, name: u.name },
    }));
  const post = (u, idea, kind, buf, name) =>
    request(app).post(`/api/ideas/${idea._id}/${kind}`).set(authHeader(u)).attach('file', buf, name);

  it('50 versions : la 51e est refusee (400), rien sur le disque, versions intactes', async () => {
    const u = await createUser();
    const idea = await createIdea(u, { deck: { versions: versions(u, 50) } });
    track(idea);
    const res = await post(u, idea, 'deck', PDF('z'), 'deck.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Nombre maximum de versions atteint (50) pour ce fichier');
    expect(listDir(idea)).toEqual([]);
    const fresh = await Idea.findById(idea._id);
    expect(fresh.deck.versions).toHaveLength(50);
  });

  it('49 versions : une de plus est acceptee', async () => {
    const u = await createUser();
    const idea = await createIdea(u, { deck: { versions: versions(u, 49) } });
    track(idea);
    const res = await post(u, idea, 'deck', PDF('z'), 'deck.pdf');
    expect(res.status).toBe(200);
    expect(res.body.data.deck.current.number).toBe(50);
  });

  it('le logo a son propre compteur', async () => {
    const u = await createUser();
    const idea = await createIdea(u, { deck: { versions: versions(u, 50) } });
    track(idea);
    const res = await post(u, idea, 'logo', PNG, 'logo.png');
    expect(res.status).toBe(200);
    expect(res.body.data.logo.current.number).toBe(1);
  });
});
