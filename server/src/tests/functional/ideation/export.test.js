const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../../../app');
const { storageDirFor } = require('../../../utils/fileSignature');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');
const { createIdea } = require('../../helpers/ideation');

const dirs = new Set();
const putFile = (idea, name, content) => {
  const dir = storageDirFor(idea._id.toString());
  dirs.add(dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);
  return name;
};

afterEach(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  dirs.clear();
});

const binaryParser = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const download = (query, headers) =>
  request(app).get(`/api/ideas/admin/export${query}`).set(headers).buffer(true).parse(binaryParser);

// Noms d'entrées lus dans le répertoire central (signature PK\x01\x02, nom à l'offset 46)
const entryNames = (buf) => {
  const names = [];
  let pos = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  while (pos !== -1 && pos + 46 <= buf.length) {
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    names.push(buf.slice(pos + 46, pos + 46 + nameLen).toString('utf8'));
    pos = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), pos + 46 + nameLen + extraLen + commentLen);
  }
  return names;
};

const withDeck = async (admin, overrides, files) => {
  const idea = await createIdea(admin, overrides);
  files.forEach(([name, content]) => putFile(idea, name, content));
  return idea;
};

const version = (number, storedName) => ({
  number,
  storedName,
  originalName: storedName,
  size: 10,
});

describe('GET /api/ideas/admin/export', () => {
  it('renvoie un ZIP en flux avec les bons en-tetes et la signature PK', async () => {
    const admin = await createAdmin();
    await withDeck(admin, { title: 'Alpha', deck: { versions: [version(1, 'a.pdf')] } }, [['a.pdf', 'AAAA']]);
    const res = await download('', authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/zip/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="decks-idees.zip"');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body.slice(0, 2).toString()).toBe('PK');
    expect(entryNames(res.body)).toEqual(['Alpha.pdf']);
  });

  it('contient la version courante uniquement, pdf et pptx', async () => {
    const admin = await createAdmin();
    await withDeck(
      admin,
      { title: 'Deux versions', deck: { versions: [version(1, 'v1.pdf'), version(2, 'v2.pdf')] } },
      [['v1.pdf', 'CONTENU-ANCIEN'], ['v2.pdf', 'CONTENU-COURANT']]
    );
    await withDeck(admin, { title: 'Slides', deck: { versions: [version(1, 's.pptx')] } }, [['s.pptx', 'PPTX-BYTES']]);
    const res = await download('', authHeader(admin));
    expect(entryNames(res.body).sort()).toEqual(['Deux versions.pdf', 'Slides.pptx']);
    // Archive en mode « store » (sans compression) : le contenu reste lisible dans le tampon
    expect(res.body.includes(Buffer.from('CONTENU-COURANT'))).toBe(true);
    expect(res.body.includes(Buffer.from('CONTENU-ANCIEN'))).toBe(false);
    expect(res.body.includes(Buffer.from('PPTX-BYTES'))).toBe(true);
  });

  it('exclut les idees masquees par defaut et les inclut avec includeHidden=true', async () => {
    const admin = await createAdmin();
    await withDeck(admin, { title: 'Visible', deck: { versions: [version(1, 'a.pdf')] } }, [['a.pdf', 'x']]);
    await withDeck(admin, { title: 'Cachee', hidden: true, deck: { versions: [version(1, 'b.pdf')] } }, [['b.pdf', 'y']]);
    const def = await download('', authHeader(admin));
    expect(entryNames(def.body)).toEqual(['Visible.pdf']);
    const off = await download('?includeHidden=false', authHeader(admin));
    expect(entryNames(off.body)).toEqual(['Visible.pdf']);
    const on = await download('?includeHidden=true', authHeader(admin));
    expect(entryNames(on.body).sort()).toEqual(['Cachee.pdf', 'Visible.pdf']);
  });

  it('ignore les idees sans deck', async () => {
    const admin = await createAdmin();
    await withDeck(admin, { title: 'Sans deck', deck: { versions: [] } }, []);
    await withDeck(admin, { title: 'Avec', deck: { versions: [version(1, 'a.pdf')] } }, [['a.pdf', 'x']]);
    const res = await download('', authHeader(admin));
    expect(entryNames(res.body)).toEqual(['Avec.pdf']);
  });

  it('distingue les titres identiques, y compris a la casse pres', async () => {
    const admin = await createAdmin();
    for (const [title, file] of [['Meme', 'a.pdf'], ['Meme', 'b.pdf'], ['MEME', 'c.pdf']]) {
      await withDeck(admin, { title, deck: { versions: [version(1, file)] } }, [[file, 'x']]);
    }
    const res = await download('', authHeader(admin));
    const names = entryNames(res.body);
    expect(names).toHaveLength(3);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(3);
    expect(names.map((n) => n.toLowerCase()).sort()).toEqual(['meme-2.pdf', 'meme-3.pdf', 'meme.pdf']);
  });

  it('assainit les titres avec separateurs, .. et caracteres de controle', async () => {
    const admin = await createAdmin();
    const titles = ['../../etc/passwd', 'a\\b:c*d?', 'nul\u0000ctrl\u0007x', '...', '.cache'];
    for (const [i, title] of titles.entries()) {
      await withDeck(admin, { title, deck: { versions: [version(1, `f${i}.pdf`)] } }, [[`f${i}.pdf`, 'x']]);
    }
    const res = await download('', authHeader(admin));
    const names = entryNames(res.body);
    expect(names).toHaveLength(titles.length);
    for (const n of names) {
      expect(n).not.toMatch(/[\\/:*?"<>|\u0000-\u001f]/);
      expect(n).not.toContain('..');
      expect(n.startsWith('.')).toBe(false);
      expect(n).toMatch(/\.pdf$/);
    }
    expect(names).toContain('idee.pdf');
  });

  it('tronque les titres tres longs a 100 caracteres', async () => {
    const admin = await createAdmin();
    await withDeck(admin, { title: 'é'.repeat(80), deck: { versions: [version(1, 'a.pdf')] } }, [['a.pdf', 'x']]);
    const res = await download('', authHeader(admin));
    expect(entryNames(res.body)).toEqual([`${'é'.repeat(80)}.pdf`]);
  });

  it('ignore un fichier absent du disque ou hors dossier et ajoute LISEZ-MOI.txt', async () => {
    const admin = await createAdmin();
    await withDeck(admin, { title: 'Ok', deck: { versions: [version(1, 'a.pdf')] } }, [['a.pdf', 'x']]);
    await withDeck(admin, { title: 'Perdu', deck: { versions: [version(1, 'gone.pdf')] } }, []);
    await withDeck(admin, { title: 'Evade', deck: { versions: [version(1, '../../../package.pdf')] } }, []);
    const res = await download('', authHeader(admin));
    expect(res.status).toBe(200);
    const names = entryNames(res.body);
    expect(names.sort()).toEqual(['LISEZ-MOI.txt', 'Ok.pdf']);
    expect(res.body.includes(Buffer.from('Perdu'))).toBe(true);
    expect(res.body.includes(Buffer.from('Evade'))).toBe(true);
  });

  it('ajoute pas LISEZ-MOI.txt quand rien n est ignore', async () => {
    const admin = await createAdmin();
    await withDeck(admin, { title: 'Ok', deck: { versions: [version(1, 'a.pdf')] } }, [['a.pdf', 'x']]);
    const res = await download('', authHeader(admin));
    expect(entryNames(res.body)).not.toContain('LISEZ-MOI.txt');
  });

  it('produit un ZIP valide meme sans aucune idee', async () => {
    const admin = await createAdmin();
    const res = await download('', authHeader(admin));
    expect(res.status).toBe(200);
    expect(entryNames(res.body)).toEqual([]);
  });

  it('refuse un etudiant (403)', async () => {
    const student = await createUser();
    const res = await request(app).get('/api/ideas/admin/export').set(authHeader(student));
    expect(res.status).toBe(403);
  });

  it('refuse includeHidden invalide (400)', async () => {
    const admin = await createAdmin();
    const res = await request(app).get('/api/ideas/admin/export?includeHidden=maybe').set(authHeader(admin));
    expect(res.status).toBe(400);
    const arr = await request(app).get('/api/ideas/admin/export?includeHidden=true&includeHidden=true').set(authHeader(admin));
    expect(arr.status).toBe(400);
  });

  it('refuse sans token (401)', async () => {
    const res = await request(app).get('/api/ideas/admin/export');
    expect(res.status).toBe(401);
  });
});
