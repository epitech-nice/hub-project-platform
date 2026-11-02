const {
  normalizeHashtag,
  normalizeHashtags,
  countWords,
  validateLink,
  getCutoff,
  assertWritable,
  escapeRegex,
} = require('../../utils/ideation');

describe('normalizeHashtag', () => {
  it('normalise "#IA" en "ia"', () => expect(normalizeHashtag('#IA')).toBe('ia'));
  it('normalise " ia " en "ia"', () => expect(normalizeHashtag(' ia ')).toBe('ia'));
  it('normalise "#ia" en "ia"', () => expect(normalizeHashtag('#ia')).toBe('ia'));
  it('refuse une chaine vide', () => expect(normalizeHashtag('')).toBeNull());
  it('refuse "#" seul', () => expect(normalizeHashtag('#')).toBeNull());
  it('refuse un espace interne', () => expect(normalizeHashtag('a b')).toBeNull());
  it('refuse les caracteres speciaux', () => expect(normalizeHashtag('<x>')).toBeNull());
  it('refuse plus de 30 caracteres', () => expect(normalizeHashtag('a'.repeat(31))).toBeNull());
  it('accepte 30 caracteres', () => expect(normalizeHashtag('a'.repeat(30))).toBe('a'.repeat(30)));
});

describe('normalizeHashtags', () => {
  it('dedoublonne apres normalisation', () => {
    expect(normalizeHashtags(['#IA', 'ia', '#Web'])).toEqual({ tags: ['ia', 'web'] });
  });
  it('renvoie une erreur si un element est invalide', () => {
    expect(normalizeHashtags(['ia', 'a b']).error).toEqual(expect.any(String));
  });
});

describe('countWords', () => {
  it('compte 0 pour une chaine vide', () => expect(countWords('')).toBe(0));
  it('compte les mots separes par espaces et retours a la ligne', () => {
    expect(countWords('  un  deux\ntrois ')).toBe(3);
  });
});

describe('validateLink', () => {
  it('accepte une URL https', () => {
    expect(validateLink('https://drive.google.com/x')).toEqual({ ok: true, url: 'https://drive.google.com/x' });
  });
  it.each([
    'http://a.fr',
    'javascript:alert(1)',
    'https://u:p@a.fr',
    'https://127.0.0.1/x',
    'https://localhost/x',
    'https://[::1]/x',
    'n importe quoi',
  ])('refuse %s', (raw) => {
    expect(validateLink(raw).ok).toBe(false);
  });
  it('refuse une URL de 2049 caracteres', () => {
    const url = 'https://a.fr/' + 'x'.repeat(2049 - 13);
    expect(url.length).toBe(2049);
    expect(validateLink(url).ok).toBe(false);
  });
  it('met l hote en minuscules', () => {
    expect(validateLink('https://DRIVE.google.com/A')).toEqual({ ok: true, url: 'https://drive.google.com/A' });
  });
});

describe('getCutoff', () => {
  it('2027-03-31 (CEST) donne 22:00Z', () => {
    expect(getCutoff('2027-03-31').toISOString()).toBe('2027-03-31T22:00:00.000Z');
  });
  it('2027-03-27 (CET) donne 23:00Z', () => {
    expect(getCutoff('2027-03-27').toISOString()).toBe('2027-03-27T23:00:00.000Z');
  });
});

describe('assertWritable', () => {
  const settings = { deadlineDate: '2027-03-31' };
  it('ne leve pas sans deadlineDate', () => {
    expect(() => assertWritable({}, {})).not.toThrow();
  });
  it('ne leve pas juste avant la limite', () => {
    expect(() => assertWritable({}, settings, new Date('2027-03-31T21:59:59Z'))).not.toThrow();
  });
  it('leve 403 a la limite', () => {
    let err;
    try { assertWritable({}, settings, new Date('2027-03-31T22:00:00Z')); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('La date limite de dépôt est dépassée');
  });
  it('ne leve pas si unlockedUntil est dans le futur', () => {
    const now = new Date('2027-04-02T00:00:00Z');
    const idea = { unlockedUntil: new Date('2027-04-03T00:00:00Z') };
    expect(() => assertWritable(idea, settings, now)).not.toThrow();
  });
});

describe('escapeRegex', () => {
  it('echappe les metacaracteres', () => {
    expect(escapeRegex('a.b*c(d)')).toBe('a\\.b\\*c\\(d\\)');
  });
});
