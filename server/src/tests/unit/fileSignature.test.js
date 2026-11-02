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
    'avec PNG embarque en data URI': '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,iVBORw0KGgo="/></svg>',
    'avec JPEG embarque (xlink:href)': '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="data:image/jpeg;base64,/9j/4AAQ"/></svg>',
    'avec &amp; dans une URL et un texte': '<svg xmlns="http://www.w3.org/2000/svg"><a href="https://x.fr/?a=1&amp;b=2"><text>R&amp;D &lt;3 &quot;x&quot; &apos;y&apos; &gt;</text></a></svg>',
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
    'javascript: encode decimal': '<svg><a href="&#106;avascript:alert(1)"><text>x</text></a></svg>',
    'javascript: decimal zero-padde': '<svg><a href="&#00000106;avascript:alert(1)"/></svg>',
    'javascript: hexa zero-padde': '<svg><a href="&#x0000006a;avascript:alert(1)"/></svg>',
    'reference numerique legitime (&#169;, faux positif documente)': '<svg><text>&#169; 2026</text></svg>',
    'esperluette sans point-virgule': '<svg><text>a &b c</text></svg>',
    'entite nommee inconnue': '<svg><text>&nbsp;</text></svg>',
    'javascript: encode hexa': '<svg><a href="&#x6a;avascript:alert(1)"><text>x</text></a></svg>',
    'javascript: avec tabulation': '<svg><a href="java&#9;script:alert(1)"><text>x</text></a></svg>',
    'javascript: avec Tab nomme': '<svg><a href="java&Tab;script:alert(1)"><text>x</text></a></svg>',
    'javascript: avec saut de ligne litteral': '<svg><a href="java\nscript:alert(1)"><text>x</text></a></svg>',
    'javascript: avec deux-points nomme': '<svg><a href="javascript&colon;alert(1)"><text>x</text></a></svg>',
    'data: encode': '<svg><image href="&#100;ata:text/html,x"/></svg>',
    'attributeName encode': '<svg><a><animate attributeName="hr&#101;f" values="x"/></a></svg>',
    'handler encode': '<svg &#111;nload="alert(1)"></svg>',
    'script prefixe': '<svg><s:script xmlns:s="http://www.w3.org/2000/svg">alert(1)</s:script></svg>',
    'foreignObject prefixe': '<svg><x:foreignObject><div/></x:foreignObject></svg>',
    'data: text/html': '<svg><image href="data:text/html,<script>alert(1)</script>"/></svg>',
    'data: image/svg+xml': '<svg><image href="data:image/svg+xml;base64,AAAA"/></svg>',
    'data: image/png non base64': '<svg><image href="data:image/png,AAAA"/></svg>',
    'set href avec > dans un attribut': '<svg><set a=">" attributeName="href" to="x"/></svg>',
  };
  it.each(Object.entries(bad))('refuse le SVG piege %s', (_n, svg) => {
    expect(detectFileType(Buffer.from(svg))).toBeNull();
  });
});

describe('detectFileType SVG: temps borne sur 2 Mo hostiles', () => {
  const TWO_MB = 2 * 1024 * 1024;
  const fill = (unit) => unit.repeat(Math.ceil(TWO_MB / unit.length)).slice(0, TWO_MB);
  const cases = {
    'doctype repete': ['<svg>' + fill('<!DOCTYPE '), null],
    'set repete': ['<svg>' + fill('<set '), 'svg'],
    'animate repete': ['<svg>' + fill('<animate '), 'svg'],
    'commentaires ouvrants': [fill('<!--'), null],
    'espaces en tete': [fill(' ') + '<svg></svg>', 'svg'],
    'xml ouvrant repete': [fill('<?xml '), null],
    'references &# repetees': ['<svg>' + fill('&#'), null],
    'references &#9; repetees': ['<svg>' + fill('&#9;'), null],
    'references &a sans point-virgule': ['<svg>' + fill('&a'), null],
    'references &amp; repetees': ['<svg>' + '&amp;'.repeat(Math.floor(TWO_MB / 5)), 'svg'],
    'doctype vide repete': [fill('<!DOCTYPE >'), null],
    'doctype svg repete puis svg': ['<!DOCTYPE svg>'.repeat(Math.floor(TWO_MB / 14)) + '<svg/>', 'svg'],
    'prefixes <a- repetes': ['<svg>' + fill('<a-'), 'svg'],
    'handlers on repetes': ['<svg>' + fill(' on'), 'svg'],
    'commentaires fermes en tete': ['<!---->'.repeat(Math.floor(TWO_MB / 7)) + '<svg></svg>', 'svg'],
  };
  it.each(Object.entries(cases))('%s', (_n, [payload, expected]) => {
    const buf = Buffer.from(payload);
    const start = Date.now();
    const result = detectFileType(buf);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(result).toBe(expected);
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
