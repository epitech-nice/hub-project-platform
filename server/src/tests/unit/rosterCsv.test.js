const { parseRosterCsv } = require('../../controllers/ideation/rosterController');

const parse = (text) => parseRosterCsv(Buffer.from(text, 'utf8'));

describe('parseRosterCsv', () => {
  it('lit un fichier avec BOM, séparateur ; et en-têtes accentués (Prénom, Mail)', () => {
    const r = parse('﻿Nom;Prénom;Mail\nDupont;Élise;elise@epitech.eu\nMartin;Paul;paul@epitech.eu\n');
    expect(r.error).toBeUndefined();
    expect(r.entries).toEqual([
      { email: 'elise@epitech.eu', lastName: 'Dupont', firstName: 'Élise' },
      { email: 'paul@epitech.eu', lastName: 'Martin', firstName: 'Paul' },
    ]);
  });

  it('lit un fichier séparé par des virgules (fins de ligne CRLF)', () => {
    const r = parse('email,lastname,firstname\r\na@x.fr,Doe,Jane\r\n');
    expect(r.entries).toEqual([{ email: 'a@x.fr', lastName: 'Doe', firstName: 'Jane' }]);
  });

  it('gère les cellules entre guillemets contenant le séparateur', () => {
    const r = parse('nom;prenom;email\n"Dupont; Jr";Jean;j@x.fr\n');
    expect(r.entries[0].lastName).toBe('Dupont; Jr');
    expect(r.entries[0].email).toBe('j@x.fr');
  });

  it("choisit ; en cas d'égalité et ignore les séparateurs entre guillemets dans l'en-tête", () => {
    const r = parse('"a,b";email\nx;y@x.fr\n');
    expect(r.entries[0].email).toBe('y@x.fr');
  });

  it("accepte les variantes d'en-têtes (courriel, adresse mail, surname, given name)", () => {
    expect(parse('Courriel\na@x.fr\n').entries[0].email).toBe('a@x.fr');
    const r = parse('Adresse Mail,Surname,Given Name\na@x.fr,Doe,Jane\n');
    expect(r.entries[0]).toEqual({ email: 'a@x.fr', lastName: 'Doe', firstName: 'Jane' });
  });

  it('une colonne name seule va dans lastName, sans être découpée', () => {
    const r = parse('name,email\nJane Doe,a@x.fr\n');
    expect(r.entries[0]).toEqual({ email: 'a@x.fr', lastName: 'Jane Doe', firstName: '' });
  });

  it('ignore la colonne name si une colonne nom existe', () => {
    const r = parse('name,nom,email\nJane Doe,Doe,a@x.fr\n');
    expect(r.entries[0].lastName).toBe('Doe');
  });

  it("sans colonne email : NO_EMAIL_COLUMN et rien d'autre", () => {
    const r = parse('nom,prenom\nDoe,Jane\n');
    expect(r.error).toBe('NO_EMAIL_COLUMN');
    expect(r.entries).toEqual([]);
  });

  it('liste les emails invalides avec leur numéro de ligne (en-tête = ligne 1)', () => {
    const r = parse('email\na@x.fr\n\nnope\nb@x\nc@x.fr\n');
    expect(r.invalid).toEqual([
      { line: 4, value: 'nope' },
      { line: 5, value: 'b@x' },
    ]);
    expect(r.entries.map((e) => e.email)).toEqual(['a@x.fr', 'c@x.fr']);
  });

  it("numérote la ligne de début d'une cellule sur plusieurs lignes", () => {
    const r = parse('nom,email\n"a\nb",bad\n');
    expect(r.invalid).toEqual([{ line: 2, value: 'bad' }]);
  });

  it('tronque la valeur invalide à 80 caractères', () => {
    const r = parse(`email\n${'z'.repeat(200)}\n`);
    expect(r.invalid[0].value).toHaveLength(80);
  });

  it('compte un doublon une seule fois (emails normalisés)', () => {
    const r = parse('email\nA@X.fr\na@x.fr\n a@x.FR \n');
    expect(r.entries).toHaveLength(1);
    expect(r.duplicates).toBe(2);
  });

  it('met les emails en minuscules', () => {
    expect(parse('email\nJean.DUPONT@Epitech.EU\n').entries[0].email).toBe('jean.dupont@epitech.eu');
  });

  it('plus de 2000 lignes de données : TOO_LARGE', () => {
    const rows = Array.from({ length: 2001 }, (_, i) => `u${i}@x.fr`).join('\n');
    expect(parse(`email\n${rows}\n`).error).toBe('TOO_LARGE');
    const ok = Array.from({ length: 2000 }, (_, i) => `u${i}@x.fr`).join('\n');
    const r = parse(`email\n${ok}\n`);
    expect(r.error).toBeUndefined();
    expect(r.entries).toHaveLength(2000);
  });

  it('fichier vide ou sans ligne de données : EMPTY', () => {
    expect(parse('').error).toBe('EMPTY');
    expect(parse('﻿\n\n').error).toBe('EMPTY');
    expect(parse('email\n').error).toBe('EMPTY');
  });

  it('guillemets non fermés : UNREADABLE sans exception', () => {
    let r;
    expect(() => {
      r = parse('email,nom\n"a@x.fr,Doe\nb@x.fr,Roe\n');
    }).not.toThrow();
    expect(r.error).toBe('UNREADABLE');
  });

  it('une formule dans un nom est conservée telle quelle, dans un email elle est invalide', () => {
    const formula = "=cmd|' /C calc'!A0";
    const r = parse(`email,nom\na@x.fr,"${formula}"\n=b@x.fr,Roe\n+c@x.fr,Roe\n-d@x.fr,Roe\n@e@x.fr,Roe\n`);
    expect(r.entries).toEqual([{ email: 'a@x.fr', lastName: formula, firstName: '' }]);
    expect(r.invalid.map((i) => i.value)).toEqual(['=b@x.fr', '+c@x.fr', '-d@x.fr', '@e@x.fr']);
  });

  it('tronque les noms à 100 caractères et rejette un email de plus de 254', () => {
    const r = parse(`email,nom\na@x.fr,${'n'.repeat(150)}\n${'a'.repeat(250)}@x.fr,Roe\n`);
    expect(r.entries[0].lastName).toHaveLength(100);
    expect(r.invalid).toHaveLength(1);
  });

  it("tolère des lignes plus courtes ou plus longues que l'en-tête", () => {
    const r = parse('nom,email\nDoe\nRoe,r@x.fr,extra\n');
    expect(r.entries).toEqual([{ email: 'r@x.fr', lastName: 'Roe', firstName: '' }]);
    expect(r.invalid).toEqual([{ line: 2, value: '' }]);
  });
});
