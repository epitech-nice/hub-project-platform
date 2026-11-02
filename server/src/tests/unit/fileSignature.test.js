const path = require('path');
const { detectFileType, storageDirFor, IDEA_FILE_RULES } = require('../../utils/fileSignature');

describe('detectFileType', () => {
  it('reconnait PNG', () => {
    expect(detectFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
  });
  it('reconnait JPEG', () => {
    expect(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('jpeg');
  });
  it('reconnait PDF', () => {
    expect(detectFileType(Buffer.from('%PDF-1.7\n...'))).toBe('pdf');
  });
  it('reconnait ZIP (conteneur pptx)', () => {
    expect(detectFileType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]))).toBe('zip');
  });
  it('reconnait SVG', () => {
    expect(detectFileType(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('svg');
  });
  it('refuse HTML', () => {
    expect(detectFileType(Buffer.from('<html><body>x</body></html>'))).toBeNull();
  });
  it('refuse un SVG avec <script', () => {
    expect(detectFileType(Buffer.from('<svg><script>alert(1)</script></svg>'))).toBeNull();
  });
  it('refuse un SVG avec un gestionnaire on...=', () => {
    expect(detectFileType(Buffer.from('<svg onload="alert(1)"></svg>'))).toBeNull();
    expect(detectFileType(Buffer.from('<svg><rect\nonclick = "x"/></svg>'))).toBeNull();
  });
  it('refuse un buffer vide ou du texte quelconque', () => {
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
    expect(detectFileType(Buffer.from('hello'))).toBeNull();
  });
});

describe('storageDirFor', () => {
  it('renvoie un chemin absolu sous storage/ideas pour un ObjectId valide', () => {
    const dir = storageDirFor('507f1f77bcf86cd799439011');
    expect(path.isAbsolute(dir)).toBe(true);
    expect(dir.endsWith(path.join('storage', 'ideas', '507f1f77bcf86cd799439011'))).toBe(true);
  });
  it.each(['../x', '..', '', 'abc', '507f1f77bcf86cd79943901/../', '507f1f77bcf86cd79943901z', undefined, null, 42])(
    'leve pour %p',
    (bad) => {
      expect(() => storageDirFor(bad)).toThrow();
    }
  );
});

describe('IDEA_FILE_RULES', () => {
  it('expose les limites attendues', () => {
    expect(IDEA_FILE_RULES.logo.maxSize).toBe(2 * 1024 * 1024);
    expect(IDEA_FILE_RULES.deck.maxSize).toBe(20 * 1024 * 1024);
    expect(IDEA_FILE_RULES.deck.types).toEqual(['pdf', 'zip']);
  });
});
