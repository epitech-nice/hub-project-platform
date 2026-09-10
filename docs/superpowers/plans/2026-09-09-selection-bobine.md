# Sélection de bobine (ACE) à la soumission — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a student either force a specific ACE bobine/gate for a mono-material gcode job, or see a live comparison of what a multi-color gcode expects versus what's actually loaded — using a two-step upload→confirm flow, with the printer-agent reporting live gate contents and injecting the gate selection into the gcode it uploads to Moonraker.

**Architecture:** The agent reports the ACE's 4-gate state (material/color/empty) to the Hub on every tick, alongside the existing heartbeat — via a new, separate endpoint rather than extending the heartbeat again. `POST /jobs/analyze` parses the uploaded gcode (presence of `Tx` commands decides mono vs multi-color) and stores a short-lived `PendingPrintUpload` (TTL 15 min); `POST /jobs/:pendingUploadId/confirm` is where the atomic printer lock and the real `PrintJob` happen, exactly like today's single-step `submitJob` just moved one step later. At dispatch, the agent prefixes the downloaded gcode with a bare `Tn` line when a gate was selected — the same channel Moonraker/ACE already uses natively for multi-color files, never the manual `MMU_SELECT`/`MMU_LOAD` commands.

**Tech Stack:** Node.js/Express/Mongoose (backend), Python/`requests` (printer-agent), Next.js pages router + Tailwind (frontend). Backend tests: Jest + Supertest. Agent tests: pytest + `requests_mock`.

**Spec:** `docs/superpowers/specs/2026-09-09-selection-bobine-design.md` — this plan implements it section by section; read both together.

## Global Constraints

- No new communication channel to the printer: gate state is discovered via the existing pull-only heartbeat tick (~60s), reported through a **new, separate** endpoint (`POST /agent/spool-status`) rather than a second breaking change to the just-modified heartbeat endpoint.
- Gate selection is injected into the gcode as a bare `Tn` line before upload — never via the manual `MMU_SELECT`/`MMU_LOAD` gcode commands, which are documented (in the on-printer `mmu_ace.py` source read during the design spike) as manual/maintenance-only, not the print-time channel.
- `Tx` detection rule: **presence** of at least one `Tx` (`T0`-`T3`) line in the gcode → multi-material mode (display/validate only, no injection). **Absence** of any `Tx` line → mono-material mode (gate selection mandatory). The count of distinct `Tx` values is irrelevant — even a single `T0` routes to multi-material mode.
- No age/staleness threshold anywhere: mismatch comparison (multi-material) always uses the last known `Printer.spoolSlots`, regardless of age. The mono-material block on "no spool data" triggers only when `Printer.spoolSlotsUpdatedAt` has **never** been set — not on a staleness window.
- `TICK_INTERVAL_SECONDS` (60) is unchanged — explicit user decision, this constant is shared with the cancellation feature's latency.
- Gate choice is locked at confirmation time, never revalidated at dispatch — explicit user decision (the queue window between confirm and dispatch is short, single-job-per-printer).
- The `Tn`-injection mechanism has **not** been tested live on real hardware (the design spike was source-code reading only, no commands executed on the production printer). This is a known, accepted residual risk — flag it again at the end of Task 9, do not attempt to silently "fix" it by testing on production hardware from within this plan's execution.

---

### Task 1: Data model — `Printer`/`PrintJob` fields, `PendingPrintUpload` model, constants

**Files:**
- Modify: `server/src/utils/constants.js`
- Modify: `server/src/models/Printer.js`
- Modify: `server/src/models/PrintJob.js`
- Create: `server/src/models/PendingPrintUpload.js`
- Test: `server/src/tests/unit/printerModel.test.js`, `server/src/tests/unit/printJobModel.test.js`, create `server/src/tests/unit/pendingPrintUploadModel.test.js`

**Interfaces:**
- Produces: `PRINT_JOB_GCODE_MODES.SINGLE === 'single'`, `PRINT_JOB_GCODE_MODES.MULTI_MATERIAL === 'multi-material'`; `Printer.spoolSlots`/`spoolSlotsUpdatedAt`; `PrintJob.selectedGate`/`slotSelectionOverridden`/`gcodeMode`/`slotMismatchWarnings`; the `PendingPrintUpload` model. Every later task in this plan reads/writes these exact names.

- [ ] **Step 1: Write the failing tests**

Add to `server/src/tests/unit/printerModel.test.js` (read the file first to match its existing `describe`/import style):

```js
  it('defaults spoolSlots to an empty array and spoolSlotsUpdatedAt to null', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    expect(printer.spoolSlots).toEqual([]);
    expect(printer.spoolSlotsUpdatedAt).toBeNull();
  });

  it('accepts a populated spoolSlots array', async () => {
    const printer = await Printer.create({
      name: 'P1',
      model: 'kobra3',
      apiKeyHash: 'x'.repeat(64),
      spoolSlots: [
        { gate: 0, material: 'PLA', color: '212721FF', empty: false },
        { gate: 1, material: '', color: '', empty: true },
        { gate: 2, material: 'PETG', color: 'F40031FF', empty: false },
        { gate: 3, material: 'PLA', color: 'FED141FF', empty: false },
      ],
      spoolSlotsUpdatedAt: new Date(),
    });
    expect(printer.spoolSlots).toHaveLength(4);
    expect(printer.spoolSlots[1].empty).toBe(true);
  });
```

Add to `server/src/tests/unit/printJobModel.test.js`:

```js
  it('defaults the spool-selection fields to null/false/empty', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'Student' },
      printer: printer._id,
      fileName: 'part.gcode',
      filePath: '/x',
    });
    expect(job.selectedGate).toBeNull();
    expect(job.slotSelectionOverridden).toBe(false);
    expect(job.gcodeMode).toBeNull();
    expect(job.slotMismatchWarnings).toEqual([]);
  });

  it('accepts a populated selectedGate and slotMismatchWarnings', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'Student' },
      printer: printer._id,
      fileName: 'part.gcode',
      filePath: '/x',
      selectedGate: 2,
      gcodeMode: PRINT_JOB_GCODE_MODES.SINGLE,
      slotMismatchWarnings: [
        { tool: 'T0', expectedMaterial: 'PETG', expectedColor: 'F40031', actualGate: 0, actualMaterial: 'PLA', actualColor: '212721' },
      ],
    });
    expect(job.selectedGate).toBe(2);
    expect(job.gcodeMode).toBe('single');
    expect(job.slotMismatchWarnings).toHaveLength(1);
  });
```

Add `PRINT_JOB_GCODE_MODES` to the existing `const { PRINT_JOB_STATUSES } = require(...)` import line in that test file.

Create `server/src/tests/unit/pendingPrintUploadModel.test.js`:

```js
const mongoose = require('mongoose');
const PendingPrintUpload = require('../../models/PendingPrintUpload');
const Printer = require('../../models/Printer');

describe('PendingPrintUpload model', () => {
  it('creates a document with the required fields and TTL defaults', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const pending = await PendingPrintUpload.create({
      student: { email: 's@epitech.eu', name: 'Student' },
      printer: printer._id,
      fileName: 'part.gcode',
      filePath: '/tmp/x.gcode',
      gcodeMode: 'single',
    });
    expect(pending.expectedTools).toEqual([]);
    expect(pending.mismatches).toEqual([]);
    expect(pending.createdAt).toBeInstanceOf(Date);
  });

  it('rejects an invalid gcodeMode', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    await expect(
      PendingPrintUpload.create({
        student: { email: 's@epitech.eu', name: 'Student' },
        printer: printer._id,
        fileName: 'part.gcode',
        filePath: '/tmp/x.gcode',
        gcodeMode: 'nonsense',
      })
    ).rejects.toThrow();
  });

  it('declares a TTL index on createdAt at 900 seconds', () => {
    const ttlIndex = PendingPrintUpload.schema.indexes().find(([, opts]) => opts.expireAfterSeconds !== undefined);
    expect(ttlIndex).toBeDefined();
    const [fields, opts] = ttlIndex;
    expect(fields).toEqual({ createdAt: 1 });
    expect(opts.expireAfterSeconds).toBe(900);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/tests/unit/printerModel.test.js src/tests/unit/printJobModel.test.js src/tests/unit/pendingPrintUploadModel.test.js`
Expected: FAIL — `spoolSlots`/`spoolSlotsUpdatedAt` don't exist on `Printer` yet, `selectedGate`/etc. don't exist on `PrintJob`, `PendingPrintUpload` module doesn't exist (`Cannot find module`), `PRINT_JOB_GCODE_MODES` is `undefined`.

- [ ] **Step 3: Add the constants**

In `server/src/utils/constants.js`, add after `PRINT_JOB_STATUSES`:

```js
// Mode d'un gcode vis-à-vis de la sélection de bobine ACE
const PRINT_JOB_GCODE_MODES = {
  SINGLE: 'single',
  MULTI_MATERIAL: 'multi-material',
};
```

Add `PRINT_JOB_GCODE_MODES` to the `module.exports` object at the bottom of the file.

- [ ] **Step 4: Add the `Printer` fields**

In `server/src/models/Printer.js`, add after the `statusHistory` field (before `createdAt`):

```js
  spoolSlots: {
    type: [
      {
        gate: { type: Number, required: true },
        material: { type: String, default: '' },
        color: { type: String, default: '' },
        empty: { type: Boolean, default: true },
      },
    ],
    default: [],
  },
  spoolSlotsUpdatedAt: { type: Date, default: null },
```

- [ ] **Step 5: Add the `PrintJob` fields**

In `server/src/models/PrintJob.js`, first extend the import line:

```js
const { PRINT_JOB_STATUSES, PRINT_REJECTION_REASONS, PRINT_JOB_GCODE_MODES } = require('../utils/constants');
```

Then add after the `cancelledBy` block (before `submittedAt`):

```js
  selectedGate: { type: Number, default: null },
  slotSelectionOverridden: { type: Boolean, default: false },
  gcodeMode: {
    type: String,
    enum: [...Object.values(PRINT_JOB_GCODE_MODES), null],
    default: null,
  },
  slotMismatchWarnings: {
    type: [
      {
        tool: String,
        expectedMaterial: String,
        expectedColor: String,
        actualGate: Number,
        actualMaterial: String,
        actualColor: String,
      },
    ],
    default: [],
  },
```

- [ ] **Step 6: Create `PendingPrintUpload`**

Create `server/src/models/PendingPrintUpload.js`:

```js
const mongoose = require('mongoose');
const { PRINT_JOB_GCODE_MODES } = require('../utils/constants');

const PendingPrintUploadSchema = new mongoose.Schema({
  student: {
    email: { type: String, required: true },
    name: { type: String, required: true },
  },
  printer: { type: mongoose.Schema.Types.ObjectId, ref: 'Printer', required: true },
  fileName: { type: String, required: true },
  filePath: { type: String, required: true },
  gcodeMode: {
    type: String,
    enum: Object.values(PRINT_JOB_GCODE_MODES),
    required: true,
  },
  expectedTools: {
    type: [
      {
        tool: String,
        material: String,
        color: String,
      },
    ],
    default: [],
  },
  mismatches: {
    type: [
      {
        tool: String,
        expectedMaterial: String,
        expectedColor: String,
        actualGate: Number,
        actualMaterial: String,
        actualColor: String,
      },
    ],
    default: [],
  },
  createdAt: { type: Date, default: Date.now },
});

// TTL : un upload en attente non confirmé (étudiant qui ferme l'onglet, etc.) est nettoyé
// automatiquement après 15 minutes — pas de scheduler custom à écrire.
PendingPrintUploadSchema.index({ createdAt: 1 }, { expireAfterSeconds: 900 });

module.exports = mongoose.model('PendingPrintUpload', PendingPrintUploadSchema);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd server && npx jest src/tests/unit/printerModel.test.js src/tests/unit/printJobModel.test.js src/tests/unit/pendingPrintUploadModel.test.js`
Expected: PASS (all tests in the three files, including pre-existing ones)

- [ ] **Step 8: Commit**

```bash
git add server/src/utils/constants.js server/src/models/Printer.js server/src/models/PrintJob.js server/src/models/PendingPrintUpload.js server/src/tests/unit/printerModel.test.js server/src/tests/unit/printJobModel.test.js server/src/tests/unit/pendingPrintUploadModel.test.js
git commit -m "feat(print): add data model for ACE spool selection"
```

---

### Task 2: Utility — gcode `Tx` detection, slicer metadata extraction, mismatch computation

**Files:**
- Create: `server/src/utils/spoolAnalysis.js`
- Test: Create `server/src/tests/unit/spoolAnalysis.test.js`

**Interfaces:**
- Produces: `parseGcodeSpoolInfo(gcodeText) -> { mode, expectedTools }` and `computeSlotMismatches(expectedTools, spoolSlots) -> mismatches[]`. Task 3 calls both directly with these exact signatures.
- Consumes: `PRINT_JOB_GCODE_MODES` from Task 1.

**Background for the implementer:** a design spike (SSH, read-only) on the production printer captured a real Moonraker `mmu` object; `gate_color` values look like `"212721FF"` — 8 hex chars, no `#`, alpha channel last (RGBA). Slicer-side (OrcaSlicer gcode header comments) colors are `#RRGGBB` (6 hex chars, `#`-prefixed). `computeSlotMismatches` must normalize both to the same 6-hex-char lowercase form before comparing — this is not a hypothetical edge case, it is the actual format mismatch between the two real data sources.

- [ ] **Step 1: Write the failing tests**

Create `server/src/tests/unit/spoolAnalysis.test.js`:

```js
const { parseGcodeSpoolInfo, computeSlotMismatches } = require('../../utils/spoolAnalysis');

describe('parseGcodeSpoolInfo', () => {
  it('returns mode single when no Tx line is present', () => {
    const gcode = 'G28\nG1 X10 Y10\nM104 S200\n';
    expect(parseGcodeSpoolInfo(gcode)).toEqual({ mode: 'single', expectedTools: [] });
  });

  it('returns mode multi-material on a single standalone T0 line, with no slicer metadata', () => {
    const gcode = 'G28\nT0\nG1 X10 Y10\n';
    const result = parseGcodeSpoolInfo(gcode);
    expect(result.mode).toBe('multi-material');
    expect(result.expectedTools).toEqual([{ tool: 'T0', material: null, color: null }]);
  });

  it('extracts filament_type and filament_colour header comments for each used tool', () => {
    const gcode = [
      '; filament_colour = #FF6A14;#FED141;#F40031;#212721',
      '; filament_type = PLA;PLA;PETG;PLA',
      'G28',
      'T0',
      'G1 X10',
      'T2',
      'G1 X20',
    ].join('\n');
    const result = parseGcodeSpoolInfo(gcode);
    expect(result.mode).toBe('multi-material');
    expect(result.expectedTools).toEqual([
      { tool: 'T0', material: 'PLA', color: '#FF6A14' },
      { tool: 'T2', material: 'PETG', color: '#F40031' },
    ]);
  });

  it('does not treat a T0 that is part of a longer token (e.g. a comment) as a tool change', () => {
    const gcode = 'G28\n; T0 is the default tool per the slicer profile\nG1 X10\n';
    expect(parseGcodeSpoolInfo(gcode)).toEqual({ mode: 'single', expectedTools: [] });
  });

  it('ignores Tx values outside 0-3', () => {
    // Un gcode généré pour une autre config MMU pourrait référencer T4+ — hors périmètre ACE 4 slots.
    const gcode = 'G28\nT4\nG1 X10\n';
    expect(parseGcodeSpoolInfo(gcode)).toEqual({ mode: 'single', expectedTools: [] });
  });
});

describe('computeSlotMismatches', () => {
  const spoolSlots = [
    { gate: 0, material: 'PLA', color: '212721FF', empty: false },
    { gate: 1, material: '', color: '', empty: true },
    { gate: 2, material: 'PLA', color: 'F40031FF', empty: false },
    { gate: 3, material: 'PLA', color: 'FED141FF', empty: false },
  ];

  it('returns no mismatch when material and color match (case/format-insensitive)', () => {
    const expectedTools = [{ tool: 'T0', material: 'pla', color: '#212721' }];
    expect(computeSlotMismatches(expectedTools, spoolSlots)).toEqual([]);
  });

  it('flags a material mismatch', () => {
    const expectedTools = [{ tool: 'T2', material: 'PETG', color: '#F40031' }];
    const result = computeSlotMismatches(expectedTools, spoolSlots);
    expect(result).toEqual([
      { tool: 'T2', expectedMaterial: 'PETG', expectedColor: '#F40031', actualGate: 2, actualMaterial: 'PLA', actualColor: 'F40031FF' },
    ]);
  });

  it('flags a color mismatch even when material matches', () => {
    const expectedTools = [{ tool: 'T3', material: 'PLA', color: '#000000' }];
    const result = computeSlotMismatches(expectedTools, spoolSlots);
    expect(result).toHaveLength(1);
    expect(result[0].tool).toBe('T3');
  });

  it('flags a gate that is empty', () => {
    const expectedTools = [{ tool: 'T1', material: 'PLA', color: '#212721' }];
    const result = computeSlotMismatches(expectedTools, spoolSlots);
    expect(result).toHaveLength(1);
    expect(result[0].actualMaterial).toBeNull();
  });

  it('flags a gate with no known material/color as unable to verify, without crashing', () => {
    const expectedTools = [{ tool: 'T0', material: null, color: null }];
    expect(computeSlotMismatches(expectedTools, spoolSlots)).toEqual([]);
  });

  it('flags a tool referencing a gate not present in spoolSlots', () => {
    const expectedTools = [{ tool: 'T2', material: 'PLA', color: '#212721' }];
    const result = computeSlotMismatches(expectedTools, []);
    expect(result).toEqual([
      { tool: 'T2', expectedMaterial: 'PLA', expectedColor: '#212721', actualGate: 2, actualMaterial: null, actualColor: null },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/tests/unit/spoolAnalysis.test.js`
Expected: FAIL — `Cannot find module '../../utils/spoolAnalysis'`

- [ ] **Step 3: Implement**

Create `server/src/utils/spoolAnalysis.js`:

```js
// Détecte si un gcode est déjà "conscient" de l'ACE (au moins une commande Tx isolée sur sa
// propre ligne) et, le cas échéant, extrait les métadonnées matière/couleur par tool à partir
// des commentaires d'en-tête standards OrcaSlicer/PrusaSlicer.
//
// Règle de détection (voir spec 2026-09-09) : présence d'AU MOINS une commande Tx → mode
// multi-material, quel que soit le nombre de Tx distincts. Aucune Tx → mode single.

const TOOL_LINE_REGEX = /^[ \t]*T([0-3])[ \t]*(;.*)?$/gm;
const FILAMENT_COLOUR_REGEX = /^;\s*filament_colour\s*=\s*(.+)$/m;
const FILAMENT_TYPE_REGEX = /^;\s*filament_type\s*=\s*(.+)$/m;

function parseGcodeSpoolInfo(gcodeText) {
  const usedTools = new Set();
  let match;
  TOOL_LINE_REGEX.lastIndex = 0;
  while ((match = TOOL_LINE_REGEX.exec(gcodeText)) !== null) {
    usedTools.add(Number(match[1]));
  }

  if (usedTools.size === 0) {
    return { mode: 'single', expectedTools: [] };
  }

  const colourMatch = FILAMENT_COLOUR_REGEX.exec(gcodeText);
  const typeMatch = FILAMENT_TYPE_REGEX.exec(gcodeText);
  const colours = colourMatch ? colourMatch[1].split(';').map((s) => s.trim()) : null;
  const types = typeMatch ? typeMatch[1].split(';').map((s) => s.trim()) : null;

  const expectedTools = [...usedTools]
    .sort((a, b) => a - b)
    .map((toolIndex) => ({
      tool: `T${toolIndex}`,
      material: types?.[toolIndex] || null,
      color: colours?.[toolIndex] || null,
    }));

  return { mode: 'multi-material', expectedTools };
}

// Normalise un hex couleur venant de deux sources au format différent (slicer: "#RRGGBB",
// Moonraker/ACE: "RRGGBBAA" sans '#') vers une forme comparable : 6 caractères hex, minuscules,
// sans '#', sans canal alpha.
function normalizeColor(hex) {
  if (!hex) return null;
  return hex.replace('#', '').toLowerCase().slice(0, 6);
}

function computeSlotMismatches(expectedTools, spoolSlots) {
  const mismatches = [];

  for (const expected of expectedTools) {
    if (!expected.material && !expected.color) continue; // rien à comparer, pas un mismatch

    const gate = Number(expected.tool.slice(1));
    const actual = spoolSlots.find((slot) => slot.gate === gate);

    const materialMismatch =
      !!expected.material && (!actual || (actual.material || '').toLowerCase() !== expected.material.toLowerCase());
    const colorMismatch =
      !!expected.color && (!actual || normalizeColor(actual.color) !== normalizeColor(expected.color));
    const isEmpty = !actual || actual.empty;

    if (isEmpty || materialMismatch || colorMismatch) {
      mismatches.push({
        tool: expected.tool,
        expectedMaterial: expected.material,
        expectedColor: expected.color,
        actualGate: gate,
        actualMaterial: actual && !actual.empty ? actual.material || null : null,
        actualColor: actual && !actual.empty ? actual.color || null : null,
      });
    }
  }

  return mismatches;
}

module.exports = { parseGcodeSpoolInfo, computeSlotMismatches };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest src/tests/unit/spoolAnalysis.test.js`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/utils/spoolAnalysis.js server/src/tests/unit/spoolAnalysis.test.js
git commit -m "feat(print): add gcode spool-selection parsing and mismatch detection"
```

---

### Task 3: Backend — `POST /api/print/jobs/analyze`

**Files:**
- Modify: `server/src/middleware/printJobUpload.js` (refactor into a shared factory, add a second upload instance for pending uploads)
- Modify: `server/src/routes/printJobs.js`
- Modify: `server/src/controllers/print/jobController.js`
- Test: Create `server/src/tests/functional/print/jobAnalyze.test.js`

**Interfaces:**
- Consumes: `parseGcodeSpoolInfo`/`computeSlotMismatches` (Task 2), `PendingPrintUpload` (Task 1).
- Produces: `jobController.analyzeJob`, route `POST /api/print/jobs/analyze`. Response shape `{ success: true, data: { pendingUploadId, mode, slots, spoolSlotsUpdatedAt, expectedTools, mismatches } }`. Task 4 reads `pendingUploadId` to build the confirm request; Task 10 (frontend) consumes this exact response shape.

- [ ] **Step 1: Write the failing tests**

Create `server/src/tests/functional/print/jobAnalyze.test.js`:

```js
const request = require('supertest');
const app = require('../../../app');
const PendingPrintUpload = require('../../../models/PendingPrintUpload');
const { createUser, authHeader } = require('../../helpers/auth');
const { createPrinter, whitelistEmail } = require('../../helpers/print');

const MONO_GCODE = 'G28\nG1 X10 Y10\nM104 S200\n';
const MULTI_GCODE = [
  '; filament_colour = #FF6A14;#FED141;#F40031;#212721',
  '; filament_type = PLA;PLA;PETG;PLA',
  'G28',
  'T0',
  'G1 X10',
  'T2',
  'G1 X20',
].join('\n');

describe('POST /api/print/jobs/analyze', () => {
  it('returns 401 without auth', async () => {
    const { printer } = await createPrinter();
    const res = await request(app)
      .post('/api/print/jobs/analyze')
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from(MONO_GCODE), 'part.gcode');
    expect(res.status).toBe(401);
  });

  it('rejects a non-whitelisted student with 403 and creates no PendingPrintUpload', async () => {
    const student = await createUser({ email: 'not-whitelisted@epitech.eu' });
    const { printer } = await createPrinter();

    const res = await request(app)
      .post('/api/print/jobs/analyze')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from(MONO_GCODE), 'part.gcode');

    expect(res.status).toBe(403);
    expect(await PendingPrintUpload.countDocuments()).toBe(0);
  });

  it('detects mono-material mode and returns the printer current slots', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [
        { gate: 0, material: 'PLA', color: '212721FF', empty: false },
        { gate: 1, material: '', color: '', empty: true },
      ],
      spoolSlotsUpdatedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/print/jobs/analyze')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from(MONO_GCODE), 'part.gcode');

    expect(res.status).toBe(201);
    expect(res.body.data.mode).toBe('single');
    expect(res.body.data.slots).toHaveLength(2);
    expect(res.body.data.pendingUploadId).toBeDefined();

    const pending = await PendingPrintUpload.findById(res.body.data.pendingUploadId);
    expect(pending.gcodeMode).toBe('single');
    expect(pending.student.email).toBe(student.email);
  });

  it('detects multi-material mode, extracts expected tools, and computes mismatches', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [
        { gate: 0, material: 'PLA', color: 'FF6A14FF', empty: false }, // matche T0 exactement (PLA, #FF6A14)
        { gate: 2, material: 'PLA', color: 'F40031FF', empty: false }, // matière attendue: PETG -> mismatch
      ],
      spoolSlotsUpdatedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/print/jobs/analyze')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from(MULTI_GCODE), 'part.gcode');

    expect(res.status).toBe(201);
    expect(res.body.data.mode).toBe('multi-material');
    expect(res.body.data.expectedTools).toEqual([
      { tool: 'T0', material: 'PLA', color: '#FF6A14' },
      { tool: 'T2', material: 'PETG', color: '#F40031' },
    ]);
    expect(res.body.data.mismatches).toHaveLength(1);
    expect(res.body.data.mismatches[0].tool).toBe('T2');
  });

  it('rejects a non-.gcode file', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter();

    const res = await request(app)
      .post('/api/print/jobs/analyze')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from('not gcode'), 'part.txt');

    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown printer', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);

    const res = await request(app)
      .post('/api/print/jobs/analyze')
      .set(authHeader(student))
      .field('printerId', '000000000000000000000000')
      .attach('file', Buffer.from(MONO_GCODE), 'part.gcode');

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/tests/functional/print/jobAnalyze.test.js`
Expected: FAIL — `404` on every request (no `/analyze` route registered yet).

- [ ] **Step 3: Refactor the upload middleware into a shared factory**

Replace the full content of `server/src/middleware/printJobUpload.js`:

```js
// server/src/middleware/printJobUpload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const fileFilter = (req, file, cb) => {
  if (path.extname(file.originalname).toLowerCase() === '.gcode') {
    cb(null, true);
  } else {
    cb(new Error('Seuls les fichiers .gcode sont acceptés'), false);
  }
};

// Fabrique un multer dédié à un sous-répertoire de storage/ — utilisé pour les jobs définitifs
// (print-jobs/) et pour les uploads en attente de confirmation (pending-print-jobs/), qui
// partagent exactement les mêmes règles de validation (extension, taille max).
const createGcodeUpload = (dirName) => {
  const uploadDir = path.join(__dirname, '../../storage', dirName);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
      cb(null, `${Date.now()}-${sanitized}`);
    },
  });

  return multer({ storage, fileFilter, limits: { fileSize: 200 * 1024 * 1024 } });
};

module.exports = {
  printJobUpload: createGcodeUpload('print-jobs'),
  pendingPrintUpload: createGcodeUpload('pending-print-jobs'),
};
```

- [ ] **Step 4: Update the route file's existing import to match the new export shape**

In `server/src/routes/printJobs.js`, replace:

```js
const printJobUpload = require('../middleware/printJobUpload');
```

with:

```js
const { printJobUpload, pendingPrintUpload } = require('../middleware/printJobUpload');
```

And replace the existing `handleUpload` wrapper with two wrappers:

```js
// multer (fileFilter / limits) errors arrive via the upload middleware's own callback rather
// than through next(err) automatically — wrap it so a bad extension surfaces as a normal 400.
const handleUpload = (req, res, next) => {
  printJobUpload.single('file')(req, res, (err) => {
    if (err) return next(new ErrorResponse(err.message, 400));
    next();
  });
};

const handleAnalyzeUpload = (req, res, next) => {
  pendingPrintUpload.single('file')(req, res, (err) => {
    if (err) return next(new ErrorResponse(err.message, 400));
    next();
  });
};
```

Add the route, right after the existing `router.post('/', ...)` line:

```js
router.post('/analyze', authenticateToken, handleAnalyzeUpload, jobController.analyzeJob);
```

- [ ] **Step 5: Implement `analyzeJob`**

In `server/src/controllers/print/jobController.js`, extend the top imports:

```js
const { parseGcodeSpoolInfo, computeSlotMismatches } = require('../../utils/spoolAnalysis');
const PendingPrintUpload = require('../../models/PendingPrintUpload');
```

And extend the destructured constants import to include `PRINT_JOB_GCODE_MODES`:

```js
const {
  PRINTER_STATUSES,
  PRINTER_STATUS_SOURCES,
  PRINT_JOB_STATUSES,
  PRINT_REJECTION_REASONS,
  PRINT_JOB_GCODE_MODES,
} = require('../../utils/constants');
```

Add the new handler at the end of the file:

```js
// POST /api/print/jobs/analyze
// multipart form: printerId, file
exports.analyzeJob = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new ErrorResponse('Fichier .gcode requis', 400));

  const { printerId } = req.body;
  const printer = await Printer.findById(printerId);
  if (!printer) {
    fs.unlink(req.file.path, () => {});
    return next(new ErrorResponse('Imprimante non trouvée', 404));
  }

  const authorization = await PrintAuthorization.findOne({ email: req.user.email.toLowerCase() });
  if (!authorization || !authorization.authorized) {
    fs.unlink(req.file.path, () => {});
    return next(new ErrorResponse(REJECTION_MESSAGES[PRINT_REJECTION_REASONS.NOT_AUTHORIZED], 403));
  }

  const gcodeText = await fs.promises.readFile(req.file.path, 'utf8');
  const { mode, expectedTools } = parseGcodeSpoolInfo(gcodeText);

  const mismatches =
    mode === PRINT_JOB_GCODE_MODES.MULTI_MATERIAL ? computeSlotMismatches(expectedTools, printer.spoolSlots) : [];

  const pending = await PendingPrintUpload.create({
    student: { email: req.user.email.toLowerCase(), name: req.user.name },
    printer: printer._id,
    fileName: req.file.originalname,
    filePath: req.file.path,
    gcodeMode: mode,
    expectedTools,
    mismatches,
  });

  res.status(201).json({
    success: true,
    data: {
      pendingUploadId: pending._id,
      mode,
      slots: printer.spoolSlots,
      spoolSlotsUpdatedAt: printer.spoolSlotsUpdatedAt,
      expectedTools,
      mismatches,
    },
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd server && npx jest src/tests/functional/print/jobAnalyze.test.js`
Expected: PASS (all 6 tests)

- [ ] **Step 7: Run the full print test suite to check for regressions**

Run: `cd server && npx jest src/tests/functional/print src/tests/unit`
Expected: PASS — in particular, `jobs.test.js`'s existing `submitJob` tests must still pass unchanged, since `printJobUpload` is still exported (just from a different shape) and `handleUpload` behaves identically.

- [ ] **Step 8: Commit**

```bash
git add server/src/middleware/printJobUpload.js server/src/routes/printJobs.js server/src/controllers/print/jobController.js server/src/tests/functional/print/jobAnalyze.test.js
git commit -m "feat(print): add POST /api/print/jobs/analyze"
```

---

### Task 4: Backend — `POST /api/print/jobs/:pendingUploadId/confirm`

**Files:**
- Modify: `server/src/routes/printJobs.js`
- Modify: `server/src/controllers/print/jobController.js`
- Test: Create `server/src/tests/functional/print/jobConfirm.test.js`

**Interfaces:**
- Consumes: `PendingPrintUpload` (Task 1), the response shape of `analyzeJob` (Task 3) — the frontend (Task 10) will chain `pendingUploadId` from analyze's response into this endpoint.
- Produces: `jobController.confirmJob`, route `POST /api/print/jobs/:pendingUploadId/confirm`. Task 6 (agent-facing `GET /next-job`) reads `PrintJob.selectedGate` this endpoint writes.

- [ ] **Step 1: Write the failing tests**

Create `server/src/tests/functional/print/jobConfirm.test.js`:

```js
const request = require('supertest');
const fs = require('fs');
const app = require('../../../app');
const PrintJob = require('../../../models/PrintJob');
const Printer = require('../../../models/Printer');
const PendingPrintUpload = require('../../../models/PendingPrintUpload');
const { createUser, authHeader } = require('../../helpers/auth');
const { createPrinter, whitelistEmail } = require('../../helpers/print');
const { PRINTER_STATUSES } = require('../../../utils/constants');

const MONO_GCODE = 'G28\nG1 X10 Y10\nM104 S200\n';
const MULTI_GCODE = [
  '; filament_colour = #FF6A14;#FED141;#F40031;#212721',
  '; filament_type = PLA;PLA;PETG;PLA',
  'G28',
  'T0',
  'G1 X10',
].join('\n');

const analyze = (student, printer, gcode = MONO_GCODE, filename = 'part.gcode') =>
  request(app)
    .post('/api/print/jobs/analyze')
    .set(authHeader(student))
    .field('printerId', printer._id.toString())
    .attach('file', Buffer.from(gcode), filename);

describe('POST /api/print/jobs/:pendingUploadId/confirm', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/print/jobs/000000000000000000000000/confirm').send({});
    expect(res.status).toBe(401);
  });

  it('returns 410 for an unknown/expired pendingUploadId', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    const res = await request(app)
      .post('/api/print/jobs/000000000000000000000000/confirm')
      .set(authHeader(student))
      .send({});
    expect(res.status).toBe(410);
  });

  it("returns 403 when confirming another student's pending upload", async () => {
    const owner = await createUser({ email: 'owner@epitech.eu' });
    const intruder = await createUser({ email: 'intruder@epitech.eu' });
    await whitelistEmail(owner.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }],
      spoolSlotsUpdatedAt: new Date(),
    });
    const analyzeRes = await analyze(owner, printer);

    const res = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(intruder))
      .send({ selectedGate: 0 });
    expect(res.status).toBe(403);
  });

  it('creates a queued PrintJob with the selected gate and locks the printer (mono-material)', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [
        { gate: 0, material: 'PLA', color: '212721FF', empty: false },
        { gate: 1, material: '', color: '', empty: true },
      ],
      spoolSlotsUpdatedAt: new Date(),
    });
    const analyzeRes = await analyze(student, printer);

    const res = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({ selectedGate: 0 });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('queued');
    expect(res.body.data.selectedGate).toBe(0);
    expect(res.body.data.gcodeMode).toBe('single');
    expect(fs.existsSync(res.body.data.filePath)).toBe(true);

    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.status).toBe(PRINTER_STATUSES.PRINTING);
    expect(reloadedPrinter.currentJob.toString()).toBe(res.body.data._id);

    expect(await PendingPrintUpload.findById(analyzeRes.body.data.pendingUploadId)).toBeNull();
  });

  it('rejects a mono-material confirm without selectedGate when spool data exists', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }],
      spoolSlotsUpdatedAt: new Date(),
    });
    const analyzeRes = await analyze(student, printer);

    const res = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects selecting an empty gate', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 1, material: '', color: '', empty: true }],
      spoolSlotsUpdatedAt: new Date(),
    });
    const analyzeRes = await analyze(student, printer);

    const res = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({ selectedGate: 1 });
    expect(res.status).toBe(400);
  });

  it('blocks confirm when no spool data has ever been received, unless overridden', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter(); // spoolSlotsUpdatedAt reste null par défaut
    const analyzeRes = await analyze(student, printer);

    const blocked = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({});
    expect(blocked.status).toBe(400);

    const overridden = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({ overrideNoSpoolData: true });
    expect(overridden.status).toBe(201);
    expect(overridden.body.data.selectedGate).toBeNull();
    expect(overridden.body.data.slotSelectionOverridden).toBe(true);
  });

  it('confirms a multi-material upload without requiring selectedGate, carrying over mismatches', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 0, material: 'PETG', color: '000000FF', empty: false }],
      spoolSlotsUpdatedAt: new Date(),
    });
    const analyzeRes = await analyze(student, printer, MULTI_GCODE);
    expect(analyzeRes.body.data.mismatches).toHaveLength(1); // T0 attend PLA, slot 0 a du PETG

    const res = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.data.selectedGate).toBeNull();
    expect(res.body.data.slotMismatchWarnings).toHaveLength(1);
  });

  it('creates a rejected PrintJob when the printer is busy at confirm time', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }],
      spoolSlotsUpdatedAt: new Date(),
    });
    const analyzeRes = await analyze(student, printer);

    // L'imprimante devient occupée entre l'analyse et la confirmation.
    await Printer.findByIdAndUpdate(printer._id, { status: PRINTER_STATUSES.PRINTING });

    const res = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({ selectedGate: 0 });

    expect(res.status).toBe(409);
    const jobs = await PrintJob.find({ 'student.email': student.email });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('rejected');
    expect(jobs[0].rejectionReason).toBe('printer_busy');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/tests/functional/print/jobConfirm.test.js`
Expected: FAIL — `404` on every request (no `/:pendingUploadId/confirm` route yet).

- [ ] **Step 3: Add the route**

In `server/src/routes/printJobs.js`, add after the `/:id/cancel` route:

```js
router.post('/:pendingUploadId/confirm', authenticateToken, jobController.confirmJob);
```

- [ ] **Step 4: Implement `confirmJob`**

Add to `server/src/controllers/print/jobController.js`, a helper right after `rejectSubmission` and the new `confirmJob` handler at the end of the file:

```js
// Symétrique à rejectSubmission, mais pour un rejet au moment de la confirmation : le
// PendingPrintUpload est déjà connu à cette étape (contrairement à /analyze), donc on
// applique le même traitement d'audit que submitJob aujourd'hui plutôt que de s'en écarter.
const rejectPendingSubmission = async (next, pending, printer, reason) => {
  fs.unlink(pending.filePath, () => {});
  await PrintJob.create({
    student: pending.student,
    printer: printer._id,
    fileName: pending.fileName,
    filePath: pending.filePath,
    status: PRINT_JOB_STATUSES.REJECTED,
    rejectionReason: reason,
    gcodeMode: pending.gcodeMode,
    history: [{ status: PRINT_JOB_STATUSES.REJECTED, date: new Date(), detail: REJECTION_MESSAGES[reason] }],
  });
  await pending.deleteOne();
  const statusCode = reason === PRINT_REJECTION_REASONS.NOT_AUTHORIZED ? 403 : 409;
  return next(new ErrorResponse(REJECTION_MESSAGES[reason], statusCode));
};
```

```js
// POST /api/print/jobs/:pendingUploadId/confirm
// body: { selectedGate?, overrideNoSpoolData? }
exports.confirmJob = asyncHandler(async (req, res, next) => {
  const pending = await PendingPrintUpload.findById(req.params.pendingUploadId);
  if (!pending) {
    return next(
      new ErrorResponse('Cette analyse a expiré ou a déjà été confirmée, veuillez re-uploader le fichier', 410)
    );
  }

  if (pending.student.email !== req.user.email.toLowerCase()) {
    return next(new ErrorResponse('Vous ne pouvez confirmer que vos propres analyses', 403));
  }

  const printer = await Printer.findById(pending.printer);
  if (!printer) {
    fs.unlink(pending.filePath, () => {});
    await pending.deleteOne();
    return next(new ErrorResponse('Imprimante non trouvée', 404));
  }

  const authorization = await PrintAuthorization.findOne({ email: req.user.email.toLowerCase() });
  if (!authorization || !authorization.authorized) {
    return rejectPendingSubmission(next, pending, printer, PRINT_REJECTION_REASONS.NOT_AUTHORIZED);
  }

  if (printer.status !== PRINTER_STATUSES.IDLE) {
    const reason = STATUS_TO_REJECTION_REASON[printer.status] || PRINT_REJECTION_REASONS.PRINTER_OFFLINE;
    return rejectPendingSubmission(next, pending, printer, reason);
  }

  let selectedGate = null;
  let slotSelectionOverridden = false;

  if (pending.gcodeMode === PRINT_JOB_GCODE_MODES.SINGLE) {
    const { selectedGate: requestedGate, overrideNoSpoolData } = req.body;
    const hasSpoolData = !!printer.spoolSlotsUpdatedAt;

    if (!hasSpoolData) {
      if (!overrideNoSpoolData) {
        return next(
          new ErrorResponse(
            "Données bobines indisponibles pour cette imprimante — utilisez l'option de contournement si vous souhaitez continuer quand même",
            400
          )
        );
      }
      slotSelectionOverridden = true;
    } else {
      if (typeof requestedGate !== 'number' || requestedGate < 0 || requestedGate > 3) {
        return next(new ErrorResponse('Sélection de bobine requise', 400));
      }
      const slot = printer.spoolSlots.find((s) => s.gate === requestedGate);
      if (!slot || slot.empty) {
        return next(new ErrorResponse('Ce slot est vide, choisissez-en un autre', 400));
      }
      selectedGate = requestedGate;
    }
  }

  // Déplace le fichier de son emplacement temporaire (pending-print-jobs/) vers l'emplacement
  // définitif (print-jobs/) — les deux répertoires partagent le même parent (storage/), donc un
  // simple remplacement de segment de chemin suffit, pas besoin de reconstruire le chemin.
  const finalPath = pending.filePath.replace('pending-print-jobs', 'print-jobs');
  try {
    await fs.promises.rename(pending.filePath, finalPath);
  } catch (err) {
    return next(new ErrorResponse('Cette analyse a déjà été confirmée', 410));
  }

  const job = await PrintJob.create({
    student: pending.student,
    printer: printer._id,
    fileName: pending.fileName,
    filePath: finalPath,
    selectedGate,
    slotSelectionOverridden,
    gcodeMode: pending.gcodeMode,
    slotMismatchWarnings: pending.mismatches,
    history: [{ status: PRINT_JOB_STATUSES.QUEUED, date: new Date(), detail: 'Soumission acceptée' }],
  });

  // Verrou atomique identique à submitJob.
  const locked = await Printer.findOneAndUpdate(
    { _id: printer._id, status: PRINTER_STATUSES.IDLE },
    { status: PRINTER_STATUSES.PRINTING, currentJob: job._id }
  );

  if (!locked) {
    fs.unlink(job.filePath, () => {});
    job.status = PRINT_JOB_STATUSES.REJECTED;
    job.rejectionReason = PRINT_REJECTION_REASONS.PRINTER_BUSY;
    job.history.push({
      status: PRINT_JOB_STATUSES.REJECTED,
      date: new Date(),
      detail: REJECTION_MESSAGES[PRINT_REJECTION_REASONS.PRINTER_BUSY],
    });
    await job.save();
    await pending.deleteOne();
    return next(new ErrorResponse(REJECTION_MESSAGES[PRINT_REJECTION_REASONS.PRINTER_BUSY], 409));
  }

  await pending.deleteOne();
  res.status(201).json({ success: true, data: job });
});
```

Note: the "printer busy at confirm time" test above expects a `409` with a `rejected` `PrintJob` created — this happens through the *pre-lock* `printer.status !== IDLE` check (`rejectPendingSubmission`), not the post-creation atomic-lock-failure path, since the printer was flipped to `PRINTING` (not raced concurrently) before `confirmJob` even runs its checks. Both paths produce the same observable outcome (409, rejected job, printer_busy reason) — this is intentional and matches `submitJob`'s existing two-layer defense (non-atomic pre-check + atomic lock as the real guarantee).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx jest src/tests/functional/print/jobConfirm.test.js`
Expected: PASS (all 9 tests)

- [ ] **Step 6: Run the full print test suite to check for regressions**

Run: `cd server && npx jest src/tests/functional/print src/tests/unit`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/printJobs.js server/src/controllers/print/jobController.js server/src/tests/functional/print/jobConfirm.test.js
git commit -m "feat(print): add POST /api/print/jobs/:pendingUploadId/confirm"
```

---

### Task 5: Backend — agent-facing: `POST /agent/spool-status` + `selectedGate` in `GET /agent/next-job`

**Files:**
- Modify: `server/src/routes/printAgent.js`
- Modify: `server/src/controllers/print/agentController.js`
- Test: `server/src/tests/functional/print/agent.test.js`, create `server/src/tests/functional/print/agentSpoolStatus.test.js`

**Interfaces:**
- Consumes: `Printer.spoolSlots`/`spoolSlotsUpdatedAt` (Task 1), `PrintJob.selectedGate` (Task 1, written by Task 4).
- Produces: `POST /api/print/agent/spool-status` (body `{ gates: [...] }`); `GET /api/print/agent/next-job`'s response `data` now includes `selectedGate`. Task 7-9 (Python agent) consume both exactly as shaped here.

- [ ] **Step 1: Write the failing tests**

Create `server/src/tests/functional/print/agentSpoolStatus.test.js`:

```js
const request = require('supertest');
const app = require('../../../app');
const Printer = require('../../../models/Printer');
const { createPrinter, printerAuthHeader } = require('../../helpers/print');

describe('POST /api/print/agent/spool-status', () => {
  it('returns 401 without printer auth headers', async () => {
    const res = await request(app).post('/api/print/agent/spool-status').send({ gates: [] });
    expect(res.status).toBe(401);
  });

  it('rejects a body without a gates array', async () => {
    const { printer, rawKey } = await createPrinter();
    const res = await request(app)
      .post('/api/print/agent/spool-status')
      .set(printerAuthHeader(printer._id, rawKey))
      .send({});
    expect(res.status).toBe(400);
  });

  it('stores the reported gates and sets spoolSlotsUpdatedAt', async () => {
    const { printer, rawKey } = await createPrinter();
    const gates = [
      { gate: 0, material: 'PLA', color: '212721FF', empty: false },
      { gate: 1, material: '', color: '', empty: true },
      { gate: 2, material: 'PETG', color: 'F40031FF', empty: false },
      { gate: 3, material: 'PLA', color: 'FED141FF', empty: false },
    ];

    const res = await request(app)
      .post('/api/print/agent/spool-status')
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ gates });

    expect(res.status).toBe(200);

    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.spoolSlots).toHaveLength(4);
    expect(reloaded.spoolSlots[1].empty).toBe(true);
    expect(reloaded.spoolSlotsUpdatedAt).not.toBeNull();
  });
});
```

Add to `server/src/tests/functional/print/agent.test.js`, inside `describe('GET /api/print/agent/next-job', ...)`:

```js
  it('includes selectedGate in the dispatched job payload when set on the job', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);
    await PrintJob.findByIdAndUpdate(job._id, { selectedGate: 2 });

    const res = await request(app)
      .get('/api/print/agent/next-job')
      .set(printerAuthHeader(printer._id, rawKey));

    expect(res.body.data.selectedGate).toBe(2);
  });

  it('reports selectedGate as null when not set on the job', async () => {
    const { printer, rawKey } = await createPrinter();
    await submitAcceptedJob(printer);

    const res = await request(app)
      .get('/api/print/agent/next-job')
      .set(printerAuthHeader(printer._id, rawKey));

    expect(res.body.data.selectedGate).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/tests/functional/print/agentSpoolStatus.test.js src/tests/functional/print/agent.test.js`
Expected: FAIL — `404` on `/spool-status` (no route yet); the two new `next-job` tests fail because `res.body.data.selectedGate` is `undefined`.

- [ ] **Step 3: Implement**

In `server/src/routes/printAgent.js`, add:

```js
router.post('/spool-status', authenticatePrinter, agentController.reportSpoolStatus);
```

In `server/src/controllers/print/agentController.js`, add the new handler (after `heartbeat`, before `getNextJob`):

```js
// POST /api/print/agent/spool-status
// Body: { gates: [{ gate, material, color, empty }] }
exports.reportSpoolStatus = asyncHandler(async (req, res, next) => {
  const { gates } = req.body;
  if (!Array.isArray(gates)) {
    return next(new ErrorResponse('gates (tableau) requis', 400));
  }

  req.printer.spoolSlots = gates.map((g) => ({
    gate: g.gate,
    material: g.material || '',
    color: g.color || '',
    empty: !!g.empty,
  }));
  req.printer.spoolSlotsUpdatedAt = new Date();
  await req.printer.save();

  res.status(200).json({ success: true });
});
```

In `getNextJob`, extend the response `data` object:

```js
  res.status(200).json({
    success: true,
    data: {
      jobId: job._id.toString(),
      fileName: job.fileName,
      downloadUrl: `/api/print/agent/jobs/${job._id}/file`,
      selectedGate: job.selectedGate,
    },
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest src/tests/functional/print/agentSpoolStatus.test.js src/tests/functional/print/agent.test.js`
Expected: PASS (all tests, including the 2 new ones in `agent.test.js`)

- [ ] **Step 5: Run the full backend suite**

Run: `cd server && npx jest`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/printAgent.js server/src/controllers/print/agentController.js server/src/tests/functional/print/agentSpoolStatus.test.js server/src/tests/functional/print/agent.test.js
git commit -m "feat(print): add agent-facing spool-status reporting and selectedGate dispatch"
```

---

### Task 6: Agent — `MoonrakerClient.get_mmu_status()`

**Files:**
- Modify: `printer-agent/agent/moonraker_client.py`
- Test: `printer-agent/tests/test_moonraker_client.py`

**Interfaces:**
- Produces: `MoonrakerClient.get_mmu_status() -> list[dict]` — `[{"gate": 0, "material": "PLA", "color": "212721FF", "empty": False}, ...]`, one entry per gate (`num_gates` from the Moonraker `mmu` object, 4 on this hardware), raises `MoonrakerClientError` on any HTTP error, network failure, or unexpected response shape. Task 8 calls this with no arguments.

**Background:** shape captured live from the production printer during the design spike (read-only `GET /printer/objects/query?mmu`): `{"result": {"status": {"mmu": {"num_gates": 4, "gate_status": [1, 0, 1, 1], "gate_material": ["PLA", "PLA", "PLA", "PLA"], "gate_color": ["212721FF", "F40031FF", "FED141FF", "FF6A14FF"], ...}}}}`. `gate_status` value `1` means the gate has filament (not empty), `0` means empty.

- [ ] **Step 1: Write the failing tests**

Add to `printer-agent/tests/test_moonraker_client.py`:

```python
def test_get_mmu_status_parses_gates():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(
            f"{BASE_URL}/printer/objects/query",
            json={
                "result": {
                    "status": {
                        "mmu": {
                            "num_gates": 4,
                            "gate_status": [1, 0, 1, 1],
                            "gate_material": ["PLA", "PLA", "PETG", "PLA"],
                            "gate_color": ["212721FF", "F40031FF", "FED141FF", "FF6A14FF"],
                        }
                    }
                }
            },
        )
        gates = client.get_mmu_status()
    assert gates == [
        {"gate": 0, "material": "PLA", "color": "212721FF", "empty": False},
        {"gate": 1, "material": "PLA", "color": "F40031FF", "empty": True},
        {"gate": 2, "material": "PETG", "color": "FED141FF", "empty": False},
        {"gate": 3, "material": "PLA", "color": "FF6A14FF", "empty": False},
    ]
    assert m.last_request.method == "GET"


def test_get_mmu_status_raises_on_network_error():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/printer/objects/query", exc=requests.exceptions.ConnectTimeout)
        with pytest.raises(MoonrakerClientError):
            client.get_mmu_status()


def test_get_mmu_status_raises_on_http_error():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/printer/objects/query", status_code=500, text="internal error")
        with pytest.raises(MoonrakerClientError):
            client.get_mmu_status()


def test_get_mmu_status_raises_on_unexpected_shape():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/printer/objects/query", json={"result": {"status": {}}})
        with pytest.raises(MoonrakerClientError):
            client.get_mmu_status()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd printer-agent && .venv/bin/pytest tests/test_moonraker_client.py -v -k get_mmu_status`
Expected: FAIL — `AttributeError: 'MoonrakerClient' object has no attribute 'get_mmu_status'`

- [ ] **Step 3: Implement**

In `printer-agent/agent/moonraker_client.py`, add after `cancel_print`:

```python
    def get_mmu_status(self):
        url = f"{self.base_url}/printer/objects/query"
        try:
            response = requests.get(url, params={"mmu": ""}, timeout=self.timeout)
        except requests.RequestException as exc:
            raise MoonrakerClientError(f"Moonraker injoignable (mmu): {exc}") from exc

        if response.status_code >= 400:
            raise MoonrakerClientError(f"Erreur Moonraker (mmu, HTTP {response.status_code}): {response.text}")

        try:
            mmu = response.json()["result"]["status"]["mmu"]
            num_gates = mmu["num_gates"]
            gate_status = mmu["gate_status"]
            gate_material = mmu["gate_material"]
            gate_color = mmu["gate_color"]
        except (KeyError, ValueError, TypeError) as exc:
            raise MoonrakerClientError(f"Réponse Moonraker inattendue (mmu): {exc}") from exc

        gates = []
        for i in range(num_gates):
            gates.append(
                {
                    "gate": i,
                    "material": gate_material[i] if i < len(gate_material) else "",
                    "color": gate_color[i] if i < len(gate_color) else "",
                    "empty": not bool(gate_status[i]) if i < len(gate_status) else True,
                }
            )
        return gates
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd printer-agent && .venv/bin/pytest tests/test_moonraker_client.py -v`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add printer-agent/agent/moonraker_client.py printer-agent/tests/test_moonraker_client.py
git commit -m "feat(agent): add MoonrakerClient.get_mmu_status()"
```

---

### Task 7: Agent — `HubClient.report_spool_status()`

**Files:**
- Modify: `printer-agent/agent/hub_client.py`
- Test: `printer-agent/tests/test_hub_client.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `HubClient.report_spool_status(gates)` — `POST {base_url}/spool-status` with body `{"gates": gates}`, raises `HubClientError` on failure. Task 8 calls this with the list `MoonrakerClient.get_mmu_status()` returns (Task 6).

- [ ] **Step 1: Write the failing tests**

Add to `printer-agent/tests/test_hub_client.py`:

```python
def test_report_spool_status_sends_gates():
    client = make_client()
    gates = [{"gate": 0, "material": "PLA", "color": "212721FF", "empty": False}]
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/spool-status", json={"success": True})
        client.report_spool_status(gates)
    assert m.last_request.json() == {"gates": gates}
    assert m.last_request.headers["x-printer-id"] == "printer-1"
    assert m.last_request.headers["x-api-key"] == "secret-key"


def test_report_spool_status_raises_on_failure():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/spool-status", status_code=400, json={"success": False, "error": "gates requis"})
        with pytest.raises(HubClientError):
            client.report_spool_status([])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd printer-agent && .venv/bin/pytest tests/test_hub_client.py -v -k report_spool_status`
Expected: FAIL — `AttributeError: 'HubClient' object has no attribute 'report_spool_status'`

- [ ] **Step 3: Implement**

In `printer-agent/agent/hub_client.py`, add after `update_job_status`:

```python
    def report_spool_status(self, gates):
        self._request("POST", "/spool-status", json={"gates": gates})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd printer-agent && .venv/bin/pytest tests/test_hub_client.py -v`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add printer-agent/agent/hub_client.py printer-agent/tests/test_hub_client.py
git commit -m "feat(agent): add HubClient.report_spool_status()"
```

---

### Task 8: Agent — report spool status on every tick

**Files:**
- Modify: `printer-agent/agent/main.py`
- Test: `printer-agent/tests/test_run_tick.py`

**Interfaces:**
- Consumes: `MoonrakerClient.get_mmu_status()` (Task 6), `HubClient.report_spool_status()` (Task 7).
- Produces: `run_tick` now calls `moonraker.get_mmu_status()` then `hub.report_spool_status(gates)` on every tick (dispatch or monitor), tolerant of failure on either side (logged, never blocks the rest of the tick — same tolerance pattern as the existing heartbeat call).

- [ ] **Step 1: Write the failing tests**

Add to `printer-agent/tests/test_run_tick.py`, after the heartbeat tests section:

```python
# --- Remontée du statut bobines (nouveau : appelé à chaque tick, comme le heartbeat) ---

def test_spool_status_reported_on_dispatch_tick(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = None
    moonraker = make_moonraker()
    moonraker.get_mmu_status.return_value = [{"gate": 0, "material": "PLA", "color": "212721FF", "empty": False}]

    run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    moonraker.get_mmu_status.assert_called_once()
    hub.report_spool_status.assert_called_once_with(moonraker.get_mmu_status.return_value)


def test_spool_status_reported_on_monitor_tick(tmp_path, logger):
    hub = make_hub()
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "printing", "message": ""}
    moonraker.get_mmu_status.return_value = [{"gate": 0, "material": "PLA", "color": "212721FF", "empty": False}]

    run_tick(hub, moonraker, in_progress_state(), str(tmp_path), logger)

    hub.report_spool_status.assert_called_once_with(moonraker.get_mmu_status.return_value)


def test_spool_status_moonraker_failure_does_not_block_the_rest_of_the_tick(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = None
    moonraker = make_moonraker()
    moonraker.get_mmu_status.side_effect = MoonrakerClientError("mmu injoignable")

    result = run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    hub.report_spool_status.assert_not_called()
    assert result == IDLE_STATE
    hub.get_next_job.assert_called_once()


def test_spool_status_hub_failure_does_not_block_the_rest_of_the_tick(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = None
    hub.report_spool_status.side_effect = HubClientError("hub down")
    moonraker = make_moonraker()
    moonraker.get_mmu_status.return_value = []

    result = run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    assert result == IDLE_STATE
    hub.get_next_job.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd printer-agent && .venv/bin/pytest tests/test_run_tick.py -v -k spool_status`
Expected: FAIL — `run_tick` never calls `moonraker.get_mmu_status`/`hub.report_spool_status` yet, so `assert_called_once()` fails and `assert_not_called()`-based negative tests pass vacuously but the positive ones don't.

- [ ] **Step 3: Implement**

In `printer-agent/agent/main.py`, update `run_tick` and add the new helper:

```python
def run_tick(hub, moonraker, state, download_dir, logger):
    cancel_requested = False
    try:
        cancel_requested = hub.heartbeat()
    except HubClientError as exc:
        logger.warning("Échec du heartbeat vers le hub: %s", exc)

    _report_spool_status(hub, moonraker, logger)

    if state.get("job_id") is None:
        return _try_dispatch(hub, moonraker, state, download_dir, logger)
    return _try_monitor(hub, moonraker, state, logger, cancel_requested)


def _report_spool_status(hub, moonraker, logger):
    try:
        gates = moonraker.get_mmu_status()
    except MoonrakerClientError as exc:
        logger.warning("Échec de la lecture du statut bobines Moonraker: %s", exc)
        return
    try:
        hub.report_spool_status(gates)
    except HubClientError as exc:
        logger.warning("Échec du signalement du statut bobines au hub: %s", exc)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd printer-agent && .venv/bin/pytest tests/test_run_tick.py -v`
Expected: PASS (all tests in the file — the 4 new ones plus every pre-existing test, since `make_moonraker()`/`make_hub()` are `MagicMock()`s and an unasserted extra call to `get_mmu_status`/`report_spool_status` doesn't break tests that don't reference them)

- [ ] **Step 5: Commit**

```bash
git add printer-agent/agent/main.py printer-agent/tests/test_run_tick.py
git commit -m "feat(agent): report ACE spool status to the hub on every tick"
```

---

### Task 9: Agent — inject the selected gate into the gcode at dispatch

**Files:**
- Modify: `printer-agent/agent/main.py`
- Test: `printer-agent/tests/test_run_tick.py`

**Interfaces:**
- Consumes: `job["selectedGate"]` from `hub.get_next_job()`'s return value (Task 5 adds this field to the Hub's response, which `HubClient.get_next_job()` already passes through unchanged).
- Produces: when dispatching a job with a non-null `selectedGate`, the downloaded gcode file gets a `Tn\n` line prepended before `moonraker.upload_and_start_print()` is called.

**Reminder (Global Constraints):** this is the mechanism flagged as an unverified residual risk in the spec — implement and test it exactly as specified, but do not attempt to "verify" it by running it against the real production printer as part of this task. That validation is a separate, supervised step outside this plan.

- [ ] **Step 1: Write the failing tests**

Add to `printer-agent/tests/test_run_tick.py`, in the dispatch section:

```python
def test_dispatch_injects_gate_selection_when_present(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {
        "jobId": "job-1",
        "fileName": "a.gcode",
        "downloadUrl": "/x",
        "selectedGate": 2,
    }

    def fake_download(job_id, dest_path):
        with open(dest_path, "w") as f:
            f.write("G28\nG1 X10\n")

    hub.download_job_file.side_effect = fake_download
    moonraker = make_moonraker()

    captured = {}

    def fake_upload(file_path, filename):
        with open(file_path, "r") as f:
            captured["content"] = f.read()

    moonraker.upload_and_start_print.side_effect = fake_upload

    run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    assert captured["content"] == "T2\nG28\nG1 X10\n"


def test_dispatch_does_not_inject_gate_when_absent(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {"jobId": "job-1", "fileName": "a.gcode", "downloadUrl": "/x"}

    def fake_download(job_id, dest_path):
        with open(dest_path, "w") as f:
            f.write("G28\nG1 X10\n")

    hub.download_job_file.side_effect = fake_download
    moonraker = make_moonraker()

    captured = {}

    def fake_upload(file_path, filename):
        with open(file_path, "r") as f:
            captured["content"] = f.read()

    moonraker.upload_and_start_print.side_effect = fake_upload

    run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    assert captured["content"] == "G28\nG1 X10\n"


def test_dispatch_does_not_inject_gate_when_explicitly_null(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {
        "jobId": "job-1",
        "fileName": "a.gcode",
        "downloadUrl": "/x",
        "selectedGate": None,
    }

    def fake_download(job_id, dest_path):
        with open(dest_path, "w") as f:
            f.write("G28\n")

    hub.download_job_file.side_effect = fake_download
    moonraker = make_moonraker()

    captured = {}

    def fake_upload(file_path, filename):
        with open(file_path, "r") as f:
            captured["content"] = f.read()

    moonraker.upload_and_start_print.side_effect = fake_upload

    run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    assert captured["content"] == "G28\n"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd printer-agent && .venv/bin/pytest tests/test_run_tick.py -v -k inject_gate`
Expected: FAIL — `_try_dispatch` never modifies the downloaded file, so `captured["content"]` lacks the `T2\n` prefix in the first test.

- [ ] **Step 3: Implement**

In `printer-agent/agent/main.py`, update `_try_dispatch` and add the new helper. The relevant slice of `_try_dispatch` (everything else in the function is unchanged):

```python
    job_id = job["jobId"]
    # os.path.basename : le hub renvoie fileName tel que soumis par l'étudiant (originalname
    # multer, non assaini côté hub) ; ne jamais faire confiance à ce payload comme chemin local.
    file_name = os.path.basename(job["fileName"]) or f"{job_id}.gcode"
    selected_gate = job.get("selectedGate")
    logger.info("Nouveau job détecté: %s (%s)", job_id, file_name)
```

```python
    dest_path = os.path.join(download_dir, file_name)
    try:
        hub.download_job_file(job_id, dest_path)
        if selected_gate is not None:
            _inject_gate_selection(dest_path, selected_gate)
        moonraker.upload_and_start_print(dest_path, file_name)
    except Exception as exc:
```

(the `except`/`finally` blocks and everything after are unchanged from the current file)

Add the new helper function, near `_has_enough_disk_space`:

```python
def _inject_gate_selection(file_path, gate):
    """Préfixe le fichier gcode d'une commande Tn — c'est le même canal que celui utilisé
    nativement par un gcode multi-couleur pour changer de bobine côté ACE (jamais les commandes
    manuelles MMU_SELECT/MMU_LOAD, réservées au panneau Fluidd — voir spec 2026-09-09)."""
    with open(file_path, "r") as f:
        original_content = f.read()
    with open(file_path, "w") as f:
        f.write(f"T{gate}\n")
        f.write(original_content)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd printer-agent && .venv/bin/pytest tests/test_run_tick.py -v`
Expected: PASS (all tests, including the 3 new ones plus every pre-existing dispatch test — none of them set `selectedGate` in their `get_next_job` payloads, so `job.get("selectedGate")` returns `None` for all of them and `_inject_gate_selection` is never called, leaving their behavior unchanged)

- [ ] **Step 5: Run the full agent suite**

Run: `cd printer-agent && .venv/bin/pytest -v`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add printer-agent/agent/main.py printer-agent/tests/test_run_tick.py
git commit -m "feat(agent): inject the selected ACE gate into the gcode before dispatch"
```

---

### Task 10: Frontend — two-step submission flow on "Mes impressions" (`client/src/pages/print/index.js`)

**Files:**
- Modify: `client/src/pages/print/index.js`

**Interfaces:**
- Consumes: `POST /api/print/jobs/analyze` and `POST /api/print/jobs/:pendingUploadId/confirm` (Tasks 3-4). Response shapes exactly as those tasks define them.

**No automated test framework exists for this frontend** — verify by careful self-review (trace the state machine and JSX by hand), same approach as the print-cancellation feature's frontend tasks. This machine's Node 25 breaks Next.js 12 outside Docker — never run `npm run dev`/`next build`/`next lint` on the host.

- [ ] **Step 1: Replace the submission form's state and handlers**

Add to the imports:

```js
const GATE_LABELS = ['Slot 1', 'Slot 2', 'Slot 3', 'Slot 4'];
```

Add new state, alongside the existing `useState` calls:

```js
  const [pendingUpload, setPendingUpload] = useState(null);
  const [selectedGate, setSelectedGate] = useState('');
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);
```

Replace `handleSubmit` with `handleAnalyze` and add `handleConfirm`/`resetPendingUpload`/`handleConfirmOverride`:

```js
  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!selectedPrinterId || !file) {
      toast.error('Choisissez une imprimante et un fichier .gcode');
      return;
    }

    const formData = new FormData();
    formData.append('printerId', selectedPrinterId);
    formData.append('file', file);

    setAnalyzing(true);
    try {
      const res = await post('/api/print/jobs/analyze', formData);
      setPendingUpload(res.data);
      setSelectedGate('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const resetPendingUpload = () => {
    setPendingUpload(null);
    setSelectedGate('');
    setFile(null);
    setFileInputKey((k) => k + 1);
  };

  const confirmPendingUpload = async (body) => {
    if (!pendingUpload) return;
    setConfirming(true);
    try {
      await post(`/api/print/jobs/${pendingUpload.pendingUploadId}/confirm`, body);
      toast.success('Impression soumise');
      resetPendingUpload();
      await refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setConfirming(false);
      setShowOverrideModal(false);
    }
  };

  const handleConfirm = () => {
    if (pendingUpload.mode === 'single') {
      if (selectedGate === '') {
        toast.error('Choisissez un slot');
        return;
      }
      confirmPendingUpload({ selectedGate: Number(selectedGate) });
      return;
    }
    confirmPendingUpload({});
  };

  const handleConfirmOverride = () => confirmPendingUpload({ overrideNoSpoolData: true });
```

Remove the now-unused `canSubmit`/`selectedPrinter` disable logic tied to the old single-step submit button — keep `selectedPrinter`/`canSubmit` as they still gate the printer `<Select>` and the "Analyser" button the same way the old "Soumettre" button was gated.

- [ ] **Step 2: Replace the submission form JSX**

Replace the `<form onSubmit={handleSubmit} ...>` block (from `<form onSubmit={handleSubmit}` down to its closing `</form>`) with:

```jsx
            {!pendingUpload ? (
              <form onSubmit={handleAnalyze} className="space-y-4">
                <div>
                  <label className="block mb-2 font-medium text-text">Imprimante</label>
                  <Select
                    value={selectedPrinterId}
                    onChange={(e) => setSelectedPrinterId(e.target.value)}
                  >
                    <option value="">— Choisir —</option>
                    {printers.map((p) => (
                      <option key={p._id} value={p._id} disabled={p.status !== 'idle'}>
                        {p.name} — {PRINTER_STATUS_LABELS[p.status] || p.status}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block mb-2 font-medium text-text">Fichier .gcode</label>
                  <FileInput key={fileInputKey} accept=".gcode" onChange={setFile} />
                </div>

                <Button type="submit" loading={analyzing} disabled={!canSubmit}>
                  Analyser le fichier
                </Button>

                {selectedPrinter && !canSubmit && (
                  <p className="text-sm text-danger">
                    Cette imprimante n&apos;est pas disponible (
                    {PRINTER_STATUS_LABELS[selectedPrinter.status] || selectedPrinter.status}).
                  </p>
                )}
              </form>
            ) : pendingUpload.mode === 'single' ? (
              <div className="space-y-4">
                <p className="text-sm text-text-muted">
                  Fichier mono-matériau — choisissez la bobine à utiliser.
                </p>

                {pendingUpload.slots.length === 0 ? (
                  <div>
                    <p className="text-sm text-danger">
                      Données bobines indisponibles pour cette imprimante — impossible de savoir ce qui est
                      chargé dans chaque slot.
                    </p>
                    <Button
                      variant="danger"
                      size="sm"
                      className="mt-3"
                      onClick={() => setShowOverrideModal(true)}
                    >
                      Soumettre quand même
                    </Button>
                  </div>
                ) : (
                  <Select value={selectedGate} onChange={(e) => setSelectedGate(e.target.value)}>
                    <option value="">— Choisir un slot —</option>
                    {pendingUpload.slots.map((slot) => (
                      <option key={slot.gate} value={slot.gate} disabled={slot.empty}>
                        {GATE_LABELS[slot.gate] || `Slot ${slot.gate + 1}`} —{' '}
                        {slot.empty ? 'Vide' : slot.material || 'Matière inconnue'}
                      </option>
                    ))}
                  </Select>
                )}

                <div className="flex gap-3">
                  <Button variant="subtle" onClick={resetPendingUpload} disabled={confirming}>
                    Retour
                  </Button>
                  {pendingUpload.slots.length > 0 && (
                    <Button onClick={handleConfirm} loading={confirming} disabled={confirming}>
                      Confirmer et soumettre
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-text-muted">
                  Fichier multi-couleur — comparaison avec le contenu actuel des slots.
                </p>

                <div className="space-y-2">
                  {pendingUpload.expectedTools.map((tool) => {
                    const mismatch = pendingUpload.mismatches.find((m) => m.tool === tool.tool);
                    return (
                      <div
                        key={tool.tool}
                        className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-text">{tool.tool}</span>
                        <span className="text-text-muted">
                          Attendu : {tool.material || '?'}
                          {tool.color && (
                            <span
                              className="inline-block h-3 w-3 rounded-full align-middle ml-2 border border-border"
                              style={{ backgroundColor: `#${tool.color.replace('#', '')}` }}
                            />
                          )}
                        </span>
                        <Badge variant={mismatch ? 'rejected' : 'approved'} size="sm">
                          {mismatch ? `Chargé : ${mismatch.actualMaterial || 'inconnu'}` : 'OK'}
                        </Badge>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-3">
                  <Button variant="subtle" onClick={resetPendingUpload} disabled={confirming}>
                    Retour
                  </Button>
                  <Button onClick={handleConfirm} loading={confirming} disabled={confirming}>
                    Confirmer et soumettre
                  </Button>
                </div>
              </div>
            )}
```

- [ ] **Step 3: Add the override confirmation modal**

Add next to the existing cancel `<Modal>`, before `</main>`:

```jsx
        <Modal
          open={showOverrideModal}
          onClose={() => setShowOverrideModal(false)}
          title="Soumettre sans données bobines ?"
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="subtle" onClick={() => setShowOverrideModal(false)} disabled={confirming}>
                Retour
              </Button>
              <Button variant="danger" onClick={handleConfirmOverride} loading={confirming} disabled={confirming}>
                Soumettre quand même
              </Button>
            </div>
          }
        >
          <p className="text-sm text-text">
            Aucune bobine ne sera sélectionnée automatiquement — le comportement dépendra entièrement du
            fichier gcode tel quel. Vérifiez physiquement l&apos;imprimante avant de continuer si vous n&apos;êtes
            pas sûr·e de ce qui est chargé.
          </p>
        </Modal>
```

- [ ] **Step 4: Self-review**

Trace the state machine by hand:
- Confirm every JSX prop/component used (`Modal`, `Button` variants, `Badge` variants `rejected`/`approved`, `Select`) exists in this codebase (cross-check `Modal.js`, `Button.js`, `Badge.js`, `Select.js` if in doubt).
- Confirm `resetPendingUpload` clears `file`/`fileInputKey` too, so going "Retour" from the pending-upload view leaves the form ready for a fresh upload, not stuck showing a stale filename.
- Confirm the override path (`pendingUpload.slots.length === 0`) never renders the `<Select>` (an empty `slots` array would render zero `<option>`s past the placeholder, which is confusing UI, not a bug — but the branch above avoids it entirely by short-circuiting to the override message instead).
- Confirm `handleConfirm` reads `pendingUpload.mode === 'single'` correctly (matches Task 3's response field name exactly).

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/print/index.js
git commit -m "feat(print): add gate selection / multi-color validation to job submission"
```

---

### Task 11: Frontend — display spool-selection info on the admin print log (`client/src/pages/admin/print/index.js`)

**Files:**
- Modify: `client/src/pages/admin/print/index.js`

**Interfaces:**
- Consumes: `PrintJob.selectedGate`/`slotSelectionOverridden`/`slotMismatchWarnings`/`gcodeMode` (Task 1, populated by Task 4), already returned by the existing `GET /api/print/jobs` the admin page already calls.

No automated test framework — verify by careful self-review, consistent with Task 10.

- [ ] **Step 1: Add a small label constant**

Add near the other label constants:

```js
const GATE_LABELS = ['Slot 1', 'Slot 2', 'Slot 3', 'Slot 4'];
```

- [ ] **Step 2: Render the spool-selection info in each job-log row**

In the job-log row's `<div className="min-w-0">` block (the one showing `job.fileName` and the student/printer/date line), add right after the existing `<p className="text-xs text-text-muted">...</p>` line:

```jsx
                      {job.gcodeMode === 'single' && (
                        <p className="text-xs text-text-muted">
                          {job.slotSelectionOverridden
                            ? 'Bobine : non spécifiée (soumis sans données bobines)'
                            : job.selectedGate !== null && job.selectedGate !== undefined
                            ? `Bobine : ${GATE_LABELS[job.selectedGate] || `Slot ${job.selectedGate + 1}`}`
                            : null}
                        </p>
                      )}
                      {job.slotMismatchWarnings?.length > 0 && (
                        <p className="text-xs text-danger">
                          {job.slotMismatchWarnings.length} avertissement
                          {job.slotMismatchWarnings.length > 1 ? 's' : ''} matière/couleur signalé
                          {job.slotMismatchWarnings.length > 1 ? 's' : ''} à la soumission
                        </p>
                      )}
```

- [ ] **Step 3: Self-review**

- Confirm this reads directly from the `jobs` array already fetched by `refresh()` (`GET /api/print/jobs`) — no new API call needed, since `PrintJob`'s full document (including the new fields) is already what that endpoint returns.
- Confirm the conditional rendering never crashes on an older job created before this feature shipped (`gcodeMode: null`, `slotMismatchWarnings: []`, `selectedGate: null` are all valid defaults from Task 1 and render nothing extra for those rows).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/print/index.js
git commit -m "feat(print): show spool-selection info in the admin print job log"
```

---

## Self-Review

**Spec coverage:**
- Remontée état bobines (agent→hub, endpoint séparé) → Tasks 5-8.
- Détection mono/multi (règle Tx présent/absent) → Task 2.
- Flux 2 temps analyze→confirm, verrou déplacé au confirm, TTL 15 min → Tasks 1, 3-4.
- Cas (a) sélection obligatoire + blocage/override si pas de données → Tasks 4, 10.
- Cas (b) affichage/validation, jamais bloquant, pas de seuil d'âge → Tasks 2-3, 10.
- Injection `Tn` au dispatch, jamais `MMU_SELECT`/`MMU_LOAD` → Task 9.
- Modèle de données complet (`Printer.spoolSlots`, `PendingPrintUpload`, champs `PrintJob`) → Task 1.
- Journal admin affichant slot/override/mismatchs → Task 11.
- Risque non vérifié (injection Tn en conditions réelles) → noté dans les Global Constraints et rappelé dans Task 9, jamais testé "silencieusement" dans le plan.

**Placeholder scan:** none — every step has literal code; the two frontend tasks specify exact JSX/handlers rather than "add the appropriate UI", and self-review steps ask concrete yes/no questions rather than "test it".

**Type/name consistency checked across tasks:**
- `PRINT_JOB_GCODE_MODES.SINGLE === 'single'` / `.MULTI_MATERIAL === 'multi-material'` (Task 1) used identically in Tasks 2-4, 10-11.
- `parseGcodeSpoolInfo`/`computeSlotMismatches` (Task 2) signatures match their call sites in Task 3 exactly.
- `PendingPrintUpload` field names (`gcodeMode`, `expectedTools`, `mismatches`, `filePath`) match between Task 1's schema, Task 3's `analyzeJob`, and Task 4's `confirmJob`.
- `Printer.spoolSlots` entry shape `{gate, material, color, empty}` identical across Task 1 (schema), Task 3/4 (backend read), Task 5 (agent-facing write), Task 6 (Python `get_mmu_status()` return shape), Task 10 (frontend read).
- `selectedGate` present with this exact name in `PrintJob` (Task 1), `getNextJob`'s response (Task 5), the Python dispatch payload (Task 9), and the frontend confirm request body (Task 10).
- Analyze response shape `{ pendingUploadId, mode, slots, spoolSlotsUpdatedAt, expectedTools, mismatches }` (Task 3) matches exactly what Task 10's `pendingUpload` state expects to read (`pendingUpload.mode`, `.slots`, `.expectedTools`, `.mismatches`, `.pendingUploadId`).
