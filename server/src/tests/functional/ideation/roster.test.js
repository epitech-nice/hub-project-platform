const request = require('supertest');
const fs = require('fs');
const app = require('../../../app');
const RosterEntry = require('../../../models/RosterEntry');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');
const { createIdea } = require('../../helpers/ideation');
const { IDEA_STORAGE_ROOT } = require('../../../utils/fileSignature');

const csv = (text, name = 'promo.csv', type = 'text/csv') => ({ buffer: Buffer.from(text, 'utf8'), name, type });

const send = (method, url, headers, file) => {
  const r = request(app)[method](`/api/ideas/admin/roster${url}`).set(headers);
  return file ? r.attach('file', file.buffer, { filename: file.name, contentType: file.type }) : r;
};
const preview = (headers, file) => send('post', '/preview', headers, file);
const importCsv = (headers, file) => send('post', '', headers, file);

let admin;
let headers;
beforeEach(async () => {
  admin = await createAdmin();
  headers = authHeader(admin);
});

describe('POST /admin/roster/preview', () => {
  it('analyse un CSV BOM + ; avec en-têtes accentués et ne sauvegarde rien', async () => {
    const res = await preview(
      headers,
      csv('﻿Nom;Prénom;Mail\nDupont;Élise;Elise@Epitech.eu\nMartin;Paul;paul@epitech.eu\nBad;Row;nope\nDup;Dup;paul@epitech.eu\n')
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      valid: 2,
      duplicates: 1,
      invalid: [{ line: 4, value: 'nope' }],
      invalidCount: 1,
      hasEmailColumn: true,
      sample: [
        { email: 'elise@epitech.eu', lastName: 'Dupont', firstName: 'Élise' },
        { email: 'paul@epitech.eu', lastName: 'Martin', firstName: 'Paul' },
      ],
    });
    expect(await RosterEntry.countDocuments()).toBe(0);
  });

  it("limite la liste des invalides à 50 et l'échantillon à 5", async () => {
    const rows = [];
    for (let i = 0; i < 60; i += 1) rows.push(`bad${i}`);
    for (let i = 0; i < 8; i += 1) rows.push(`u${i}@x.fr`);
    const res = await preview(headers, csv(`email\n${rows.join('\n')}\n`));
    expect(res.body.data.invalid).toHaveLength(50);
    expect(res.body.data.invalidCount).toBe(60);
    expect(res.body.data.sample).toHaveLength(5);
    expect(res.body.data.valid).toBe(8);
  });

  it('sans colonne email : 400 avec le message clair', async () => {
    const res = await preview(headers, csv('nom,prenom\nDoe,Jane\n'));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      'Le fichier ne contient pas de colonne email ou login (en-têtes acceptés : email, mail, e-mail, courriel, login)'
    );
  });

  it.each([
    ['', /vide|aucune/i],
    ['email,nom\n"a@x.fr,Doe\n', /lire|illisible/i],
  ])('erreur de parsing %#: 400 en français', async (text, rx) => {
    const res = await preview(headers, csv(text));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(rx);
  });

  it('plus de 2000 lignes : 400', async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => `u${i}@x.fr`).join('\n');
    const res = await preview(headers, csv(`email\n${rows}\n`));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2000/);
  });

  it('fichier de 1,1 Mo : 400 mentionnant 1 Mo', async () => {
    const big = `email\n${'a@x.fr\n'.repeat(Math.ceil((1.1 * 1024 * 1024) / 7))}`;
    const res = await preview(headers, csv(big));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/1 Mo/);
  });

  it('type non csv : 400', async () => {
    const res = await preview(headers, csv('%PDF-1.4', 'promo.pdf', 'application/pdf'));
    expect(res.status).toBe(400);
  });

  it('accepte un .csv envoyé en application/vnd.ms-excel', async () => {
    const res = await preview(headers, csv('email\na@x.fr\n', 'promo.csv', 'application/vnd.ms-excel'));
    expect(res.status).toBe(200);
  });

  it('sans fichier : 400', async () => {
    const res = await request(app).post('/api/ideas/admin/roster/preview').set(headers);
    expect(res.status).toBe(400);
  });
});

describe('POST /admin/roster (import)', () => {
  it('importe, normalise les emails en minuscules et signale les invalides sans abandonner', async () => {
    const res = await importCsv(headers, csv('email,nom,prenom\nA@X.fr,Doe,Jane\nbad,Roe,Rick\n'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ imported: 1, removed: 0, duplicates: 0, invalidCount: 1 });
    const entries = await RosterEntry.find().lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ email: 'a@x.fr', lastName: 'Doe', firstName: 'Jane' });
    expect(entries[0].importedAt).toBeInstanceOf(Date);
  });

  it("remplace la liste : l'ancienne entrée absente disparaît, celle conservée n'est pas dupliquée", async () => {
    await importCsv(headers, csv('email,nom\nold@x.fr,Old\nkeep@x.fr,Keep\n'));
    const res = await importCsv(headers, csv('email,nom\nkeep@x.fr,Keep2\nnew@x.fr,New\n'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ imported: 2, removed: 1 });
    const emails = (await RosterEntry.find().lean()).map((e) => e.email).sort();
    expect(emails).toEqual(['keep@x.fr', 'new@x.fr']);
    expect((await RosterEntry.findOne({ email: 'keep@x.fr' })).lastName).toBe('Keep2');
  });

  it('conserve la liste existante quand le fichier est refusé', async () => {
    await importCsv(headers, csv('email\nold@x.fr\n'));
    const res = await importCsv(headers, csv('nom\nDoe\n'));
    expect(res.status).toBe(400);
    expect(await RosterEntry.countDocuments()).toBe(1);
  });

  it('stocke une formule dans un nom comme texte', async () => {
    const formula = "=cmd|' /C calc'!A0";
    await importCsv(headers, csv(`email,nom\na@x.fr,"${formula}"\n`));
    expect((await RosterEntry.findOne({ email: 'a@x.fr' })).lastName).toBe(formula);
  });

  it('fichier trop gros ou absent : 400', async () => {
    const big = `email\n${'a@x.fr\n'.repeat(Math.ceil((1.1 * 1024 * 1024) / 7))}`;
    expect((await importCsv(headers, csv(big))).status).toBe(400);
    expect((await request(app).post('/api/ideas/admin/roster').set(headers)).status).toBe(400);
  });
});

describe('fichier sans aucune adresse valide', () => {
  const MSG = "Aucune adresse email valide dans le fichier : la liste actuelle n'a pas été modifiée";
  const inputs = [
    ['toutes invalides', 'email\nfoo\nbar\n'],
    ['lignes vides', 'email;nom\n;\n;\n'],
    ['colonne email vide', 'nom,email\nDoe,\nRoe,\n'],
  ];

  it.each(inputs)('import (%s) : 400 et la liste existante est intacte', async (label, text) => {
    await RosterEntry.create([{ email: 'a@x.fr' }, { email: 'b@x.fr' }]);
    const res = await importCsv(headers, csv(text));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(MSG);
    const emails = (await RosterEntry.find().lean()).map((e) => e.email).sort();
    expect(emails).toEqual(['a@x.fr', 'b@x.fr']);
  });

  it.each(inputs)('aperçu (%s) : 400 avec le même message', async (label, text) => {
    const res = await preview(headers, csv(text));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(MSG);
  });

  it('exactement 2000 lignes valides : importées', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => `u${i}@x.fr`).join('\n');
    const res = await importCsv(headers, csv(`email\n${rows}\n`));
    expect(res.status).toBe(200);
    expect(res.body.data.imported).toBe(2000);
    expect(await RosterEntry.countDocuments()).toBe(2000);
  });
});

describe('DELETE /admin/roster', () => {
  it('vide la liste et renvoie le nombre supprimé', async () => {
    await importCsv(headers, csv('email\na@x.fr\nb@x.fr\n'));
    const res = await send('delete', '', headers);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { removed: 2 } });
    expect(await RosterEntry.countDocuments()).toBe(0);
  });
});

describe('GET /admin/roster/without-project', () => {
  const entry = (email, lastName = '', firstName = '') => RosterEntry.create({ email, lastName, firstName });
  const list = (q) =>
    request(app)
      .get('/api/ideas/admin/roster/without-project')
      .query(q === undefined ? {} : { q })
      .set(headers);

  it('classe les trois statuts, exclut les groupes acceptés (idée masquée comprise), rapproche un email en casse différente', async () => {
    await createUser({ email: 'noproject@x.fr' });
    const invited = await createUser({ email: 'invited@x.fr' });
    const accepted = await createUser({ email: 'accepted@x.fr' });
    const hiddenOnly = await createUser({ email: 'hidden@x.fr' });
    const mixed = await createUser({ email: 'MiXed.Case@X.fr' });
    const both = await createUser({ email: 'both@x.fr' });
    const rows = [
      ['never@x.fr', 'A'],
      ['noproject@x.fr', 'B'],
      ['invited@x.fr', 'C'],
      ['accepted@x.fr', 'D'],
      ['hidden@x.fr', 'E'],
      ['mixed.case@x.fr', 'F'],
      ['both@x.fr', 'G'],
    ];
    for (const [e, l] of rows) await entry(e, l);

    const owner = await createUser();
    await createIdea(owner, {
      title: 'Visible',
      members: [
        { userId: owner._id, name: owner.name, email: owner.email, status: 'accepted' },
        { userId: accepted._id, name: 'x', email: accepted.email, status: 'accepted' },
        { userId: invited._id, name: 'x', email: invited.email, status: 'pending' },
        { userId: mixed._id, name: 'x', email: mixed.email, status: 'pending' },
        { userId: both._id, name: 'x', email: both.email, status: 'pending' },
      ],
    });
    await createIdea(owner, {
      title: 'Cachée',
      hidden: true,
      members: [
        { userId: owner._id, name: owner.name, email: owner.email, status: 'accepted' },
        { userId: hiddenOnly._id, name: 'x', email: hiddenOnly.email, status: 'accepted' },
        { userId: both._id, name: 'x', email: both.email, status: 'accepted' },
      ],
    });

    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { email: 'never@x.fr', lastName: 'A', firstName: '', status: 'never_connected' },
      { email: 'noproject@x.fr', lastName: 'B', firstName: '', status: 'no_project' },
      { email: 'invited@x.fr', lastName: 'C', firstName: '', status: 'invited_only' },
      { email: 'mixed.case@x.fr', lastName: 'F', firstName: '', status: 'invited_only' },
    ]);
    expect(res.body.counts).toEqual({ never_connected: 1, no_project: 1, invited_only: 2, total: 4 });
  });

  it('un compte en casse mixte sans groupe est no_project (et non jamais connecté)', async () => {
    await createUser({ email: 'Mixed@X.fr' });
    await entry('mixed@x.fr', 'M');
    const res = await list();
    expect(res.body.data[0].status).toBe('no_project');
  });

  it("filtre par q sur le nom et sur l'email, compteurs sur la liste filtrée", async () => {
    await entry('alice@x.fr', 'Durand', 'Alice');
    await entry('bob@x.fr', 'Martin', 'Bob');
    await createUser({ email: 'bob@x.fr' });
    const byName = await list('dura');
    expect(byName.body.data.map((e) => e.email)).toEqual(['alice@x.fr']);
    expect(byName.body.counts).toEqual({ never_connected: 1, no_project: 0, invited_only: 0, total: 1 });
    const byMail = await list('BOB@');
    expect(byMail.body.data.map((e) => e.email)).toEqual(['bob@x.fr']);
    expect(byMail.body.counts.no_project).toBe(1);
  });

  it('q est traité comme du texte (regex échappée) et refuse tableaux et objets', async () => {
    await entry('alice@x.fr', 'Durand');
    expect((await list('.*')).body.data).toEqual([]);
    expect((await list('(')).status).toBe(200);
    const arr = await request(app).get('/api/ideas/admin/roster/without-project?q=a&q=b').set(headers);
    expect(arr.status).toBe(400);
    const obj = await request(app).get('/api/ideas/admin/roster/without-project?q[$ne]=x').set(headers);
    expect(obj.status).toBe(400);
  });

  it('trie par nom, prénom puis email', async () => {
    await entry('z@x.fr', 'Bernard', 'Zoe');
    await entry('y@x.fr', 'Bernard', 'Alain');
    await entry('x@x.fr', 'Adam', 'Zed');
    const res = await list();
    expect(res.body.data.map((e) => e.email)).toEqual(['x@x.fr', 'y@x.fr', 'z@x.fr']);
  });
});

describe('confidentialité', () => {
  it('un étudiant ne peut lire, importer ni supprimer la liste (403), sans jeton 401', async () => {
    const student = await createUser();
    await RosterEntry.create({ email: 'secret@x.fr' });
    const sh = authHeader(student);
    const calls = [
      ['get', '/without-project'],
      ['post', '/preview'],
      ['post', ''],
      ['delete', ''],
    ];
    for (const [m, u] of calls) {
      const file = m === 'post' ? csv('email\na@x.fr\n') : undefined;
      const forbidden = await send(m, u, sh, file);
      expect(forbidden.status).toBe(403);
      expect(JSON.stringify(forbidden.body)).not.toContain('secret@x.fr');
      const anon = await send(m, u, {}, file);
      expect(anon.status).toBe(401);
    }
    expect(await RosterEntry.countDocuments()).toBe(1);
  });

  it('le catalogue et la fiche étudiants ne contiennent jamais un email de la liste', async () => {
    const student = await createUser({ email: 'listed@x.fr' });
    await RosterEntry.create({ email: 'other@x.fr', lastName: 'Other' });
    const idea = await createIdea(student, { title: 'Projet' });
    const sh = authHeader(student);
    const cat = await request(app).get('/api/ideas').set(sh);
    const det = await request(app).get(`/api/ideas/${idea._id}`).set(sh);
    expect(cat.status).toBe(200);
    expect(det.status).toBe(200);
    expect(JSON.stringify(cat.body)).not.toContain('other@x.fr');
    expect(JSON.stringify(det.body)).not.toContain('other@x.fr');
    expect(JSON.stringify(cat.body)).not.toMatch(/importedAt/);
  });
});

describe('purge', () => {
  it('vide la liste et garde la forme de la réponse (roster en champ supplémentaire)', async () => {
    await RosterEntry.create([{ email: 'a@x.fr' }, { email: 'b@x.fr' }]);
    const res = await request(app).delete('/api/ideas/admin/purge').set(headers).send({ confirm: 'PURGER' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ideas: 0, files: 0, roster: 2 });
    expect(await RosterEntry.countDocuments()).toBe(0);
    expect(fs.existsSync(IDEA_STORAGE_ROOT)).toBe(true);
  });
});
