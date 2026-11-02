const express = require('express');
const request = require('supertest');
const fs = require('fs');
const mongoose = require('mongoose');
const ideaUpload = require('../../../middleware/ideaUpload');
const errorHandler = require('../../../middleware/errorHandler');
const { storageDirFor } = require('../../../utils/fileSignature');

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(1024, 0x20)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(512)]);
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(512)]);

const buildApp = () => {
  const app = express();
  app.post('/:id/logo', ideaUpload('logo'), (req, res) => res.json({ ok: true, file: req.file }));
  app.post('/:id/deck', ideaUpload('deck'), (req, res) => res.json({ ok: true, file: req.file }));
  app.use(errorHandler);
  return app;
};

describe('ideaUpload', () => {
  const app = buildApp();
  let ideaId;
  let dir;
  const left = () => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);

  beforeEach(() => {
    ideaId = new mongoose.Types.ObjectId().toString();
    dir = storageDirFor(ideaId);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('accepte un vrai PDF et le range dans le dossier de l idee', async () => {
    const res = await request(app).post(`/${ideaId}/deck`).attach('file', PDF, 'deck.pdf');
    expect(res.status).toBe(200);
    expect(left()).toHaveLength(1);
    expect(res.body.file.path.startsWith(dir)).toBe(true);
  });

  it('accepte un pptx (conteneur zip)', async () => {
    const res = await request(app).post(`/${ideaId}/deck`).attach('file', ZIP, 'deck.pptx');
    expect(res.status).toBe(200);
  });

  it('refuse un fichier texte nomme a.pdf et ne laisse rien sur le disque', async () => {
    const res = await request(app).post(`/${ideaId}/deck`).attach('file', Buffer.from('juste du texte'), 'a.pdf');
    expect(res.status).toBe(400);
    expect(left()).toEqual([]);
  });

  it('refuse un pdf renomme en .pptx (extension et signature divergent)', async () => {
    const res = await request(app).post(`/${ideaId}/deck`).attach('file', PDF, 'a.pptx');
    expect(res.status).toBe(400);
    expect(left()).toEqual([]);
  });

  it('refuse un zip renomme en .pdf', async () => {
    const res = await request(app).post(`/${ideaId}/deck`).attach('file', ZIP, 'a.pdf');
    expect(res.status).toBe(400);
    expect(left()).toEqual([]);
  });

  it('refuse un PDF de 21 Mo avec un message citant 20 Mo (400, pas 500)', async () => {
    const big = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(21 * 1024 * 1024)]);
    const res = await request(app).post(`/${ideaId}/deck`).attach('file', big, 'big.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('20 Mo');
    expect(left()).toEqual([]);
  });

  it('refuse un .exe', async () => {
    const res = await request(app).post(`/${ideaId}/deck`).attach('file', Buffer.from('MZ....'), 'a.exe');
    expect(res.status).toBe(400);
    expect(left()).toEqual([]);
  });

  it('accepte un logo PNG', async () => {
    const res = await request(app).post(`/${ideaId}/logo`).attach('file', PNG, 'logo.png');
    expect(res.status).toBe(200);
  });

  it('refuse un logo SVG contenant <script', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const res = await request(app).post(`/${ideaId}/logo`).attach('file', svg, 'logo.svg');
    expect(res.status).toBe(400);
    expect(left()).toEqual([]);
  });

  it('refuse un logo SVG avec gestionnaire onload=', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
    const res = await request(app).post(`/${ideaId}/logo`).attach('file', svg, 'logo.svg');
    expect(res.status).toBe(400);
    expect(left()).toEqual([]);
  });

  it('refuse un logo PNG de 3 Mo avec un message citant 2 Mo', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);
    const res = await request(app).post(`/${ideaId}/logo`).attach('file', big, 'logo.png');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('2 Mo');
    expect(left()).toEqual([]);
  });

  it('refuse un logo dont le contenu n est pas une image', async () => {
    const res = await request(app).post(`/${ideaId}/logo`).attach('file', Buffer.from('<html></html>'), 'logo.png');
    expect(res.status).toBe(400);
    expect(left()).toEqual([]);
  });

  it('refuse un identifiant d idee invalide sans rien ecrire', async () => {
    const res = await request(app).post('/..%2Fx/deck').attach('file', PDF, 'deck.pdf');
    expect(res.status).toBe(400);
  });

  it('refuse une requete sans fichier', async () => {
    const res = await request(app).post(`/${ideaId}/deck`).field('x', 'y');
    expect(res.status).toBe(400);
  });

  it('nettoie le nom d origine comme les uploads existants', async () => {
    const res = await request(app).post(`/${ideaId}/deck`).attach('file', PDF, 'Mon Deck (v2)é.PDF');
    expect(res.status).toBe(200);
    expect(res.body.file.filename).toMatch(/^\d+-[a-f0-9]+-mon_deck_+v2_+\.pdf$/);
  });
});
