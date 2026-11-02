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

describe('detectFileType SVG durci', () => {
  const legit = {
    'avec BOM': '\uFEFF<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>',
    'avec declaration XML': '<?xml version="1.0" encoding="UTF-8"?>\n<svg viewBox="0 0 10 10"><g><rect width="5" height="5"/></g></svg>',
    'avec commentaires': '<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg"><!-- x --><circle r="3"/></svg>',
    'avec style': '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:red}</style><rect class="a" width="2" height="2"/></svg>',
    'avec degrades et defs': '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect fill="url(#g)" width="4" height="4"/></svg>',
    'avec DOCTYPE sans sous-ensemble': '<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg"></svg>',
    'avec href interne': '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><path id="p" d="M0 0"/></defs><use xlink:href="#p"/></svg>',
  };
  it.each(Object.entries(legit))('accepte un SVG legitime %s', (_n, svg) => {
    expect(detectFileType(Buffer.from(svg))).toBe('svg');
  });

  const bad = {
    'lien javascript:': '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a></svg>',
    'foreignObject iframe': '<svg><foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject></svg>',
    'animate href': '<svg><a><animate attributeName="href" values="javascript:alert(1)"/><text>x</text></a></svg>',
    'animate xlink:href sans javascript': '<svg><a><set attributeName="xlink:href" to="x"/></a></svg>',
    'svg/onload': '<svg/onload=alert(1)>',
    'handler apres guillemet': '<svg xmlns="x"onload="alert(1)"></svg>',
    'document HTML contenant svg': '<html><body><svg xmlns="http://www.w3.org/2000/svg"></svg></body></html>',
    'embed': '<svg><embed src="x"/></svg>',
    'object': '<svg><object data="x"></object></svg>',
    'entite': '<svg><!ENTITY x "y"></svg>',
    'DOCTYPE avec sous-ensemble': '<!DOCTYPE svg [ <!ENTITY a "b"> ]><svg></svg>',
    'href data:': '<svg><image href="data:text/html;base64,AAAA"/></svg>',
    'xlink:href data:': '<svg><image xlink:href=" data:image/svg+xml,x"/></svg>',
    'majuscules': '<SVG><SCRIPT>1</SCRIPT></SVG>',
  };
  it.each(Object.entries(bad))('refuse le SVG piege %s', (_n, svg) => {
    expect(detectFileType(Buffer.from(svg))).toBeNull();
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
