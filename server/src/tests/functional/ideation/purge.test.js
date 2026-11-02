const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const app = require('../../../app');
const Idea = require('../../../models/Idea');
const IdeationSettings = require('../../../models/IdeationSettings');
const { storageDirFor, IDEA_STORAGE_ROOT } = require('../../../utils/fileSignature');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');
const { createIdea, setDeadline } = require('../../helpers/ideation');

const cleanup = new Set();
const trackedDirs = new Set();

const putFile = (idea, name, content = 'contenu') => {
  const dir = storageDirFor(idea._id.toString());
  trackedDirs.add(dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);
  return path.join(dir, name);
};

// Dossier orphelin (sans idée en base) directement sous la racine de stockage
const putOrphan = (name = crypto.randomBytes(12).toString('hex')) => {
  const dir = path.join(IDEA_STORAGE_ROOT, name);
  trackedDirs.add(dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'orphan.pdf'), 'x');
  return dir;
};

afterEach(() => {
  for (const d of trackedDirs) fs.rmSync(d, { recursive: true, force: true });
  trackedDirs.clear();
  for (const d of cleanup) fs.rmSync(d, { recursive: true, force: true });
  cleanup.clear();
});

const purge = (headers, body) => {
  const r = request(app).delete('/api/ideas/admin/purge').set(headers);
  return body === undefined ? r : r.send(body);
};

const setup = async () => {
  const admin = await createAdmin();
  const idea1 = await createIdea(admin, { title: 'Une' });
  const idea2 = await createIdea(admin, { title: 'Deux' });
  const f1 = putFile(idea1, 'deck-1.pdf');
  putFile(idea1, 'logo-1.png');
  const f2 = putFile(idea2, 'deck-1.pdf');
  await setDeadline('2027-03-20');
  return { admin, headers: authHeader(admin), idea1, idea2, f1, f2 };
};

describe('DELETE /api/ideas/admin/purge', () => {
  it('le stockage de test est isolé : sous le dossier temporaire, pas dans server/storage/ideas', () => {
    const real = path.resolve(__dirname, '../../../../storage/ideas');
    expect(IDEA_STORAGE_ROOT).not.toBe(real);
    expect(IDEA_STORAGE_ROOT.startsWith(fs.realpathSync(os.tmpdir())) || IDEA_STORAGE_ROOT.startsWith(os.tmpdir())).toBe(true);
    expect(IDEA_STORAGE_ROOT.startsWith(real)).toBe(false);
  });

  it('purge partielle : 500 avec le nombre d\'échecs, les autres entrées sont quand même supprimées', async () => {
    const { headers, idea1, idea2 } = await setup();
    const realRm = fs.promises.rm;
    let calls = 0;
    const spy = jest.spyOn(fs.promises, 'rm').mockImplementation((...args) => {
      calls += 1;
      if (calls === 1) return Promise.reject(Object.assign(new Error('boom'), { code: 'EBUSY' }));
      return realRm(...args);
    });
    let res;
    try {
      res = await purge(headers, { confirm: 'PURGER' });
    } finally {
      spy.mockRestore();
    }
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Purge partielle/);
    expect(res.body.error).toMatch(/1 élément/);
    expect(await Idea.countDocuments()).toBe(0);
    // Un seul des deux dossiers reste (celui dont la suppression a échoué)
    const left = [idea1, idea2].filter((i) => fs.existsSync(storageDirFor(i._id.toString())));
    expect(left).toHaveLength(1);
    // La relance termine le nettoyage
    const again = await purge(headers, { confirm: 'PURGER' });
    expect(again.status).toBe(200);
    expect(fs.readdirSync(IDEA_STORAGE_ROOT)).toEqual([]);
  });

  describe('confirmation refusée', () => {
    const cases = [
      ['sans corps', undefined],
      ['corps vide', {}],
      ['confirm incorrect', { confirm: 'NON' }],
      ['casse différente', { confirm: 'purger' }],
      ['espaces autour', { confirm: ' PURGER ' }],
      ['tableau', { confirm: ['PURGER'] }],
      ['objet', { confirm: { $ne: 'x' } }],
      ['nombre', { confirm: 1 }],
    ];
    it.each(cases)("%s : 400 et rien n'est supprimé", async (label, body) => {
      const { headers, idea1, f1, f2 } = await setup();
      const res = await purge(headers, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/PURGER/);
      expect(await Idea.countDocuments()).toBe(2);
      expect(fs.existsSync(f1)).toBe(true);
      expect(fs.existsSync(f2)).toBe(true);
      expect(fs.existsSync(storageDirFor(idea1._id.toString()))).toBe(true);
      const s = await IdeationSettings.findOne({ key: 'singleton' });
      expect(s.deadlineDate).toBe('2027-03-20');
    });
  });

  it('purge les idées, les dossiers, remet la date limite à null et renvoie les compteurs', async () => {
    const { headers, idea1, idea2 } = await setup();
    const res = await purge(headers, { confirm: 'PURGER' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { ideas: 2, files: 3 } });
    expect(await Idea.countDocuments()).toBe(0);
    expect(fs.existsSync(storageDirFor(idea1._id.toString()))).toBe(false);
    expect(fs.existsSync(storageDirFor(idea2._id.toString()))).toBe(false);
    const s = await IdeationSettings.findOne({ key: 'singleton' });
    expect(s.deadlineDate == null).toBe(true);
  });

  it('conserve le dossier racine et ne touche pas aux autres dossiers de storage', async () => {
    const { headers } = await setup();
    const sibling = path.join(path.dirname(IDEA_STORAGE_ROOT), `print-jobs-test-${crypto.randomBytes(6).toString('hex')}`);
    cleanup.add(sibling);
    fs.mkdirSync(sibling, { recursive: true });
    fs.writeFileSync(path.join(sibling, 'job.gcode'), 'G1');
    const res = await purge(headers, { confirm: 'PURGER' });
    expect(res.status).toBe(200);
    expect(fs.existsSync(IDEA_STORAGE_ROOT)).toBe(true);
    expect(fs.readdirSync(IDEA_STORAGE_ROOT)).toEqual([]);
    expect(fs.readFileSync(path.join(sibling, 'job.gcode'), 'utf8')).toBe('G1');
  });

  it('refuse un étudiant (403) et une requête sans jeton (401), sans rien supprimer', async () => {
    const { f1 } = await setup();
    const student = await createUser();
    const r403 = await purge(authHeader(student), { confirm: 'PURGER' });
    expect(r403.status).toBe(403);
    const r401 = await request(app).delete('/api/ideas/admin/purge').send({ confirm: 'PURGER' });
    expect(r401.status).toBe(401);
    expect(await Idea.countDocuments()).toBe(2);
    expect(fs.existsSync(f1)).toBe(true);
  });

  it("/admin/purge n'est pas pris pour /admin/:id (ordre des routes)", async () => {
    const { headers } = await setup();
    const res = await purge(headers, { confirm: 'PURGER' });
    expect(res.status).toBe(200);
    expect(res.body.data.ideas).toBe(2);
  });

  it('un second passage sans idée nettoie quand même les dossiers orphelins', async () => {
    const { headers } = await setup();
    await purge(headers, { confirm: 'PURGER' });
    const orphan = putOrphan();
    const res = await purge(headers, { confirm: 'PURGER' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ideas: 0, files: 1 });
    expect(fs.existsSync(orphan)).toBe(false);
  });

  it('recrée la racine si elle est absente (0 fichier)', async () => {
    const { headers } = await setup();
    await purge(headers, { confirm: 'PURGER' });
    fs.rmSync(IDEA_STORAGE_ROOT, { recursive: true, force: true });
    const res = await purge(headers, { confirm: 'PURGER' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ideas: 0, files: 0 });
    expect(fs.existsSync(IDEA_STORAGE_ROOT)).toBe(true);
  });

  it('ne suit pas un lien symbolique pointant hors de la racine', async () => {
    const { headers, idea1 } = await setup();
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'purge-outside-'));
    cleanup.add(outsideDir);
    const outsideFile = path.join(outsideDir, 'secret.txt');
    fs.writeFileSync(outsideFile, 'garder');
    const link = path.join(storageDirFor(idea1._id.toString()), 'lien');
    const linkDir = path.join(IDEA_STORAGE_ROOT, 'lien-dossier');
    try {
      fs.symlinkSync(outsideFile, link);
      trackedDirs.add(linkDir);
      fs.symlinkSync(outsideDir, linkDir);
    } catch (e) {
      console.warn('Symlink non permis sur cette plateforme : test ignoré');
      return;
    }
    const res = await purge(headers, { confirm: 'PURGER' });
    expect(res.status).toBe(200);
    expect(fs.existsSync(outsideFile)).toBe(true);
    expect(fs.readFileSync(outsideFile, 'utf8')).toBe('garder');
    expect(fs.existsSync(link)).toBe(false);
    expect(fs.existsSync(linkDir)).toBe(false);
  });

  it('deux purges simultanées ne plantent pas', async () => {
    const { headers } = await setup();
    const results = await Promise.all([
      purge(headers, { confirm: 'PURGER' }),
      purge(headers, { confirm: 'PURGER' }),
    ]);
    for (const r of results) expect([200, 500]).toContain(r.status);
    expect(results.some((r) => r.status === 200)).toBe(true);
    expect(await Idea.countDocuments()).toBe(0);
    expect(fs.readdirSync(IDEA_STORAGE_ROOT)).toEqual([]);
  });
});
