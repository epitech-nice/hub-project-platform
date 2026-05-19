# Vérification d'inventaire RFID — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un endpoint `POST /api/tools/verify-inventory` et une modal "Vérifier inventaire" côté admin qui compare un scan RFID avec l'inventaire DB et présente les écarts (présents / manquants / inconnus).

**Architecture:** Nouvel endpoint admin-only qui prend une liste de RFIDs + tags optionnels, requête MongoDB sur les outils avec RFID (filtrés par tag si fourni), et retourne trois listes classifiées. Le frontend ajoute une modal indépendante de l'Import RFID existant, réutilisant les helpers `parseRfidText` et `readFile` déjà en place.

**Tech Stack:** Node.js + Express + Mongoose (backend) · Next.js pages router + React hooks (frontend) · express-validator (validation) · supertest + mongodb-memory-server (tests)

---

## File Map

| Action | Fichier |
|---|---|
| Modify | `server/src/middleware/validators.js` |
| Modify | `server/src/controllers/toolController.js` |
| Modify | `server/src/routes/tools.js` |
| Create | `server/src/tests/functional/tools.verify.test.js` |
| Modify | `client/src/pages/admin/inventory.js` |

---

## Task 1 — Validation rules

**Files:**
- Modify: `server/src/middleware/validators.js`

- [ ] **Step 1 : Ajouter `verifyInventoryValidationRules` dans validators.js**

Ajouter après `exports.bulkImportValidationRules` (fin du fichier) :

```js
exports.verifyInventoryValidationRules = () => [
  check('rfids')
    .isArray({ min: 1 }).withMessage('Un tableau de codes RFID est requis')
    .custom((rfids) => {
      if (!Array.isArray(rfids)) return true;
      for (const rfid of rfids) {
        if (typeof rfid !== 'string' || !rfid.trim()) {
          throw new Error('Chaque code RFID doit être une chaîne non vide');
        }
      }
      return true;
    }),
  check('tags')
    .optional()
    .isArray().withMessage('tags doit être un tableau de chaînes'),
];
```

- [ ] **Step 2 : Commit**

```bash
git add server/src/middleware/validators.js
git commit -m "feat(inventory): add verifyInventoryValidationRules"
```

---

## Task 2 — Controller

**Files:**
- Modify: `server/src/controllers/toolController.js`

- [ ] **Step 1 : Ajouter `exports.verifyInventory` après `exports.bulkImport`**

```js
// POST /api/tools/verify-inventory — admin uniquement
exports.verifyInventory = asyncHandler(async (req, res) => {
  let { rfids, tags } = req.body;
  rfids = [...new Set(rfids.map((r) => r.trim().toUpperCase()).filter(Boolean))];

  const query = { rfid: { $exists: true, $ne: null } };
  if (Array.isArray(tags) && tags.length > 0) {
    query.tags = { $in: tags };
  }

  const expected = await Tool.find(query).lean();
  const scannedSet = new Set(rfids);
  const expectedRfidSet = new Set(expected.map((t) => t.rfid));

  const present = expected.filter((t) => scannedSet.has(t.rfid));
  const missing = expected.filter((t) => !scannedSet.has(t.rfid));
  const unknown = rfids.filter((r) => !expectedRfidSet.has(r));

  res.status(200).json({
    success: true,
    data: {
      stats: {
        expected: expected.length,
        scanned: rfids.length,
        presentCount: present.length,
        missingCount: missing.length,
        unknownCount: unknown.length,
      },
      present,
      missing,
      unknown,
    },
  });
});
```

- [ ] **Step 2 : Commit**

```bash
git add server/src/controllers/toolController.js
git commit -m "feat(inventory): add verifyInventory controller"
```

---

## Task 3 — Route

**Files:**
- Modify: `server/src/routes/tools.js`

- [ ] **Step 1 : Importer `verifyInventory` et `verifyInventoryValidationRules`**

Remplacer les deux lignes d'import existantes :

```js
// Avant
const { toolValidationRules, bulkImportValidationRules, validate } = require('../middleware/validators');
const {
  getAllTools,
  getAllTags,
  getToolById,
  createTool,
  updateTool,
  deleteTool,
  bulkImport,
  exportInventoryCSV,
  borrowTool,
  returnTool,
  getLoanHistory,
} = require('../controllers/toolController');
```

```js
// Après
const { toolValidationRules, bulkImportValidationRules, verifyInventoryValidationRules, validate } = require('../middleware/validators');
const {
  getAllTools,
  getAllTags,
  getToolById,
  createTool,
  updateTool,
  deleteTool,
  bulkImport,
  verifyInventory,
  exportInventoryCSV,
  borrowTool,
  returnTool,
  getLoanHistory,
} = require('../controllers/toolController');
```

- [ ] **Step 2 : Enregistrer la route**

Ajouter après la ligne `bulk-import` :

```js
router.post('/verify-inventory', authenticateToken, isAdmin, verifyInventoryValidationRules(), validate, verifyInventory);
```

- [ ] **Step 3 : Vérifier que le serveur démarre sans erreur**

```bash
cd server && node -e "require('./src/app')" && echo OK
```

Attendu : `OK` (ou un message de connexion Mongo sans stack trace).

- [ ] **Step 4 : Commit**

```bash
git add server/src/routes/tools.js
git commit -m "feat(inventory): register POST /api/tools/verify-inventory route"
```

---

## Task 4 — Tests backend

**Files:**
- Create: `server/src/tests/functional/tools.verify.test.js`

> Note : `afterEach` dans `setup.js` nettoie déjà toutes les collections — pas besoin de `beforeEach` de nettoyage dans ce fichier.

- [ ] **Step 1 : Créer le fichier de test**

```js
const request = require('supertest');
const app = require('../../app');
const Tool = require('../../models/Tool');
const { createAdmin, createUser, authHeader } = require('../helpers/auth');

describe('POST /api/tools/verify-inventory', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/tools/verify-inventory')
      .send({ rfids: ['AAAA0001'] });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const student = await createUser();
    const res = await request(app)
      .post('/api/tools/verify-inventory')
      .set(authHeader(student))
      .send({ rfids: ['AAAA0001'] });
    expect(res.status).toBe(403);
  });

  it('returns 400 when rfids array is empty', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .post('/api/tools/verify-inventory')
      .set(authHeader(admin))
      .send({ rfids: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when rfids is missing', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .post('/api/tools/verify-inventory')
      .set(authHeader(admin))
      .send({});
    expect(res.status).toBe(400);
  });

  it('classifies present, missing, and unknown correctly', async () => {
    const admin = await createAdmin();
    await Tool.create([
      { name: 'Outil A', rfid: 'AAAA0001' },
      { name: 'Outil B', rfid: 'BBBB0002' },
    ]);

    // AAAA0001 → present, BBBB0002 → missing, CCCC0003 → unknown
    const res = await request(app)
      .post('/api/tools/verify-inventory')
      .set(authHeader(admin))
      .send({ rfids: ['AAAA0001', 'CCCC0003'] });

    expect(res.status).toBe(200);
    expect(res.body.data.stats.expected).toBe(2);
    expect(res.body.data.stats.scanned).toBe(2);
    expect(res.body.data.stats.presentCount).toBe(1);
    expect(res.body.data.stats.missingCount).toBe(1);
    expect(res.body.data.stats.unknownCount).toBe(1);
    expect(res.body.data.present[0].rfid).toBe('AAAA0001');
    expect(res.body.data.missing[0].rfid).toBe('BBBB0002');
    expect(res.body.data.unknown).toEqual(['CCCC0003']);
  });

  it('filters expected tools by tag when tags param is provided', async () => {
    const admin = await createAdmin();
    await Tool.create([
      { name: 'Outil A', rfid: 'AAAA0001', tags: ['électronique'] },
      { name: 'Outil B', rfid: 'BBBB0002', tags: ['mécanique'] },
    ]);

    // tag filter = électronique → only AAAA0001 is in scope
    const res = await request(app)
      .post('/api/tools/verify-inventory')
      .set(authHeader(admin))
      .send({ rfids: ['AAAA0001'], tags: ['électronique'] });

    expect(res.status).toBe(200);
    expect(res.body.data.stats.expected).toBe(1);
    expect(res.body.data.present).toHaveLength(1);
    expect(res.body.data.missing).toHaveLength(0);
    expect(res.body.data.unknown).toHaveLength(0);
  });

  it('excludes tools without rfid from expected list', async () => {
    const admin = await createAdmin();
    await Tool.create([
      { name: 'Outil sans RFID' },
      { name: 'Outil avec RFID', rfid: 'AAAA0001' },
    ]);

    const res = await request(app)
      .post('/api/tools/verify-inventory')
      .set(authHeader(admin))
      .send({ rfids: ['AAAA0001'] });

    expect(res.status).toBe(200);
    expect(res.body.data.stats.expected).toBe(1);
    expect(res.body.data.present).toHaveLength(1);
    expect(res.body.data.missing).toHaveLength(0);
  });

  it('normalises rfids to uppercase before comparison', async () => {
    const admin = await createAdmin();
    await Tool.create({ name: 'Outil A', rfid: 'AAAA0001' });

    const res = await request(app)
      .post('/api/tools/verify-inventory')
      .set(authHeader(admin))
      .send({ rfids: ['aaaa0001'] }); // lowercase input

    expect(res.status).toBe(200);
    expect(res.body.data.present).toHaveLength(1);
  });
});
```

- [ ] **Step 2 : Lancer les tests et vérifier qu'ils passent**

```bash
cd server && npx jest src/tests/functional/tools.verify.test.js --verbose
```

Attendu : 7 tests PASS.

- [ ] **Step 3 : Vérifier que la suite complète ne régresse pas**

```bash
cd server && npx jest --verbose
```

Attendu : tous les tests passent (la suite existante ne doit pas avoir de rouge).

- [ ] **Step 4 : Commit**

```bash
git add server/src/tests/functional/tools.verify.test.js
git commit -m "test(inventory): functional tests for POST /api/tools/verify-inventory"
```

---

## Task 5 — Frontend : modal "Vérifier inventaire"

**Files:**
- Modify: `client/src/pages/admin/inventory.js`

Les fonctions `parseRfidText` et `readFile` existent déjà dans le fichier — ne pas les dupliquer.

- [ ] **Step 1 : Ajouter les états React pour la modal vérification**

Après le bloc `// ── State import RFID` (ligne ~90), ajouter :

```js
// ── State vérification inventaire ─────────────────────────────────────
const [showVerify, setShowVerify]         = useState(false);
const [verifyRaw, setVerifyRaw]           = useState('');
const [verifyTags, setVerifyTags]         = useState([]);
const [verifyDragOver, setVerifyDragOver] = useState(false);
const [verifyLoading, setVerifyLoading]   = useState(false);
const [verifyResults, setVerifyResults]   = useState(null);
const [verifyError, setVerifyError]       = useState('');
const verifyFileInputRef = useRef(null);
```

- [ ] **Step 2 : Ajouter le handler `handleVerify`**

Après le bloc `// ── Import RFID` (après `openAddFromImport`), ajouter :

```js
// ── Vérification inventaire ────────────────────────────────────────────
const handleVerify = async () => {
  const rfids = parseRfidText(verifyRaw);
  if (rfids.length === 0) return;
  setVerifyLoading(true);
  setVerifyResults(null);
  setVerifyError('');
  try {
    const body = { rfids };
    if (verifyTags.length > 0) body.tags = verifyTags;
    const res = await post('/api/tools/verify-inventory', body);
    setVerifyResults(res.data);
  } catch (err) {
    setVerifyError(err.message || 'Une erreur est survenue');
  } finally {
    setVerifyLoading(false);
  }
};

const toggleVerifyTag = (tag) =>
  setVerifyTags((prev) =>
    prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
  );
```

- [ ] **Step 3 : Ajouter le bouton dans PageHead**

Dans le bloc `actions` de `PageHead`, ajouter le bouton "Vérifier inventaire" entre "Exporter CSV" et "Import RFID" :

```jsx
<Button
  variant="ghost"
  onClick={() => {
    setVerifyRaw('');
    setVerifyTags([]);
    setVerifyResults(null);
    setVerifyError('');
    setShowVerify(true);
  }}
>
  Vérifier inventaire
</Button>
```

- [ ] **Step 4 : Ajouter la variable `verifyRfidCount` juste avant le `return`**

Juste après `const rfidCount = parseRfidText(importRaw).length;` :

```js
const verifyRfidCount = parseRfidText(verifyRaw).length;
```

- [ ] **Step 5 : Adapter `readFile` pour accepter un setter en paramètre**

La fonction `readFile` actuelle est codée en dur avec `setImportRaw`. Il faut la rendre générique pour que la modal vérification puisse aussi l'utiliser. Faire ce changement AVANT d'ajouter la modal.

Remplacer la définition actuelle :

```js
// Avant
const readFile = (file) => {
  const reader = new FileReader();
  reader.onload = (ev) => setImportRaw(ev.target.result);
  reader.readAsText(file);
};
```

```js
// Après
const readFile = (file, setter) => {
  const reader = new FileReader();
  reader.onload = (ev) => setter(ev.target.result);
  reader.readAsText(file);
};
```

Mettre à jour les deux appels existants à `readFile` dans le bloc Import RFID :

```js
// handleFileDrop — dans le bloc Import RFID
const file = e.dataTransfer.files[0];
if (file) readFile(file, setImportRaw);

// handleFileInput — dans le bloc Import RFID
const file = e.target.files[0];
if (file) readFile(file, setImportRaw);
```

- [ ] **Step 6 : Ajouter la modal vérification dans le JSX**

Après le bloc `{/* ── Modal : Import RFID */}`, ajouter :

```jsx
{/* ── Modal : Vérifier inventaire ────────────────────────────────────── */}
<Modal
  open={showVerify}
  onClose={() => setShowVerify(false)}
  title="Vérifier l'inventaire"
  size="lg"
  footer={
    <div className="flex justify-end">
      <Button variant="outline" onClick={() => setShowVerify(false)}>Fermer</Button>
    </div>
  }
>
  <div className="space-y-4">
    <p className="text-sm text-text-muted">
      Scannez ou collez les codes RFID relevés physiquement. Le résultat compare avec l&apos;inventaire en base.
    </p>

    {/* Filtre par tag */}
    {allTags.length > 0 && (
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
          Filtrer par tag <span className="font-normal normal-case">(aucun = tout l&apos;inventaire RFID)</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleVerifyTag(tag)}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                verifyTags.includes(tag)
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-text-muted hover:border-primary hover:text-primary'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
    )}

    {/* Drag & drop zone */}
    <div
      onDragOver={(e) => { e.preventDefault(); setVerifyDragOver(true); }}
      onDragLeave={() => setVerifyDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setVerifyDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) readFile(file, setVerifyRaw);
      }}
      onClick={() => verifyFileInputRef.current?.click()}
      className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
        verifyDragOver
          ? 'border-primary bg-primary-ghost'
          : 'border-border hover:border-primary hover:bg-primary-ghost'
      }`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto mb-1 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v8" />
      </svg>
      <p className="text-sm text-text-muted">
        Glissez un fichier ici, ou <span className="text-primary underline">parcourir</span>
      </p>
      <input ref={verifyFileInputRef} type="file" accept=".txt,.csv" className="hidden" onChange={(e) => {
        const file = e.target.files[0];
        if (file) readFile(file, setVerifyRaw);
      }} />
    </div>

    <Textarea
      value={verifyRaw}
      onChange={(e) => setVerifyRaw(e.target.value)}
      placeholder={"A3B4C5D6\n9F8E7D6C\n1A2B3C4D\n..."}
      rows={6}
      className="font-mono"
    />

    <div className="flex items-center justify-between">
      <span className="text-xs text-text-dim">
        {verifyRfidCount} code{verifyRfidCount > 1 ? 's' : ''} détecté{verifyRfidCount > 1 ? 's' : ''}
        {verifyTags.length > 0 && (
          <span className="ml-2 text-primary">· tags : {verifyTags.join(', ')}</span>
        )}
      </span>
      <Button
        variant="outline"
        onClick={handleVerify}
        disabled={verifyLoading || verifyRfidCount === 0}
        loading={verifyLoading}
      >
        Vérifier
      </Button>
    </div>

    {verifyError && (
      <div className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
        {verifyError}
      </div>
    )}

    {verifyResults && (
      <div className="space-y-4 pt-4 border-t border-border">
        {/* Stats */}
        <div className="flex gap-3 flex-wrap">
          <Badge variant="neutral">{verifyResults.stats.expected} attendu{verifyResults.stats.expected > 1 ? 's' : ''}</Badge>
          <Badge variant="neutral">{verifyResults.stats.scanned} scanné{verifyResults.stats.scanned > 1 ? 's' : ''}</Badge>
          <Badge variant="approved">{verifyResults.stats.presentCount} présent{verifyResults.stats.presentCount > 1 ? 's' : ''}</Badge>
          <Badge variant={verifyResults.stats.missingCount > 0 ? 'rejected' : 'neutral'}>
            {verifyResults.stats.missingCount} manquant{verifyResults.stats.missingCount > 1 ? 's' : ''}
          </Badge>
          <Badge variant={verifyResults.stats.unknownCount > 0 ? 'changes' : 'neutral'}>
            {verifyResults.stats.unknownCount} inconnu{verifyResults.stats.unknownCount > 1 ? 's' : ''}
          </Badge>
        </div>

        {verifyResults.stats.missingCount === 0 && verifyResults.stats.unknownCount === 0 && (
          <div className="rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success font-medium">
            Inventaire complet — tous les éléments sont présents.
          </div>
        )}

        {verifyResults.present.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-text mb-2">Présents</p>
            <div className="space-y-1.5">
              {verifyResults.present.map((tool) => (
                <div key={tool._id} className="flex items-center justify-between px-3 py-2 bg-surface-2 border border-border rounded-md">
                  <div>
                    <span className="text-sm font-medium text-text">{tool.name}</span>
                    <span className="ml-2 font-mono text-xs text-text-dim">{tool.rfid}</span>
                  </div>
                  <Badge variant="approved" size="sm">Présent</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {verifyResults.missing.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-text mb-2">Manquants — attendus mais non scannés</p>
            <div className="space-y-1.5">
              {verifyResults.missing.map((tool) => (
                <div key={tool._id} className="flex items-center justify-between px-3 py-2 bg-surface-2 border border-border rounded-md">
                  <div>
                    <span className="text-sm font-medium text-text">{tool.name}</span>
                    <span className="ml-2 font-mono text-xs text-text-dim">{tool.rfid}</span>
                  </div>
                  <Badge variant="rejected" size="sm">Manquant</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {verifyResults.unknown.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-text mb-2">Inconnus — scannés mais non enregistrés</p>
            <div className="space-y-1.5">
              {verifyResults.unknown.map((rfid) => (
                <div key={rfid} className="flex items-center justify-between px-3 py-2 border border-border rounded-md">
                  <span className="font-mono text-sm text-text">{rfid}</span>
                  <Button variant="primary" size="sm" onClick={() => openAddFromImport(rfid)}>
                    Créer l&apos;outil →
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )}
  </div>
</Modal>
```

- [ ] **Step 7 : Vérifier visuellement dans le navigateur**

```bash
cd client && npm run dev
```

Ouvrir `http://localhost:3000/admin/inventory` (connecté en admin).

Checklist :
- [ ] Le bouton "Vérifier inventaire" apparaît dans la barre d'actions
- [ ] La modal s'ouvre avec la zone de saisie et les chips de tags
- [ ] Coller des RFIDs dans la textarea → compteur se met à jour
- [ ] Cliquer "Vérifier" → les résultats s'affichent avec les 3 sections
- [ ] Les items manquants ont un badge rouge, les présents vert, les inconnus orange
- [ ] "Créer l'outil →" sur un inconnu ouvre la modal outil avec le RFID pré-rempli
- [ ] La modal Import RFID existante fonctionne toujours normalement

- [ ] **Step 8 : Commit final**

```bash
git add client/src/pages/admin/inventory.js
git commit -m "feat(inventory): add verify inventory modal with RFID scan comparison"
```
