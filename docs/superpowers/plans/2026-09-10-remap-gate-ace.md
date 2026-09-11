# Remapping bobine→gate ACE (v2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a student assign a physical ACE gate to every tool actually used in a gcode file — whether the file has zero, one, or several `Tx` commands — replacing the current "mono forces a gate / multi is display-only" split that turned out to defeat the feature for most real-world files.

**Architecture:** `PrintJob.gateAssignments: [{tool, gate}]` replaces `selectedGate`/`slotMismatchWarnings`, one entry per tool detected by the already-shipped `parseGcodeSpoolInfo` (`tool: null` for a file with zero `Tx`). At dispatch, the agent either injects a bare `Tn` line (unchanged, zero-Tx case) or sends `MMU_TTG_MAP` as a **separate Moonraker call issued before `upload_and_start_print`** (never embedded in the gcode file — the firmware's auto-feed pre-load reads `ttg_map` at print-start time, before any gcode line executes). `Printer.spoolSlots` gains a manual-declaration mechanism for non-RFID spools, with a change-detection heuristic that lets a genuine auto-detection always win. The frontend replaces the `<Select>` gate picker with a `GatePicker` card component showing real color swatches, used once per detected tool, and polls printer state every ~12s while the picker is open.

**Tech Stack:** Node.js/Express/Mongoose (backend), Python/`requests` (printer-agent), Next.js pages router + Tailwind (frontend, no test framework — self-review only). Backend tests: Jest + Supertest. Agent tests: pytest + `requests_mock`.

**Spec:** `docs/superpowers/specs/2026-09-10-remap-gate-ace-design.md` — this plan implements it section by section; read both together. In particular, re-read the "Spike technique" section before touching the agent's dispatch code — it explains *why* `MMU_TTG_MAP` must be a separate call, not a file injection.

## Global Constraints

- `MMU_TTG_MAP` is sent as a **separate Moonraker API call**, issued before `hub.download_job_file`/`moonraker.upload_and_start_print` — never as a line inside the uploaded gcode file. This is the opposite mechanism from the zero-Tx case, which keeps injecting `Tn` into the file exactly as before.
- A file with **zero** detected tools (no `Tx` at all) is unaffected by this plan: same bare-`Tn`-injection behavior as already shipped. Only files with **one or more** detected tools change behavior (from display-only to a real per-tool gate picker).
- A gate assignment is **mandatory for every detected tool** before `/confirm` succeeds — no partial assignment, no silent fallback to the printer's default `ttg_map`.
- Manual gate-content declaration is open to **any authorized student, and admins** (not admin-only). A genuine auto-detected change **always** wins over a manual declaration — detected via a value-drift heuristic (the Moonraker API exposes no direct "this came from a real RFID read" signal, see spec's spike section).
- `gateAssignments` is locked at confirmation, never revalidated at dispatch — same precedent as the already-shipped `selectedGate`.
- ACE hardware is hardcoded as 4 gates (`MIN_ACE_GATE = 0`, `MAX_ACE_GATE = 3`) throughout this codebase already — this plan does not change that assumption.
- The `MMU_TTG_MAP`-as-separate-call mechanism has **not** been tested live on real hardware (the design spike was source-code reading only). This is a known, accepted residual risk, same category as the original `Tn` injection — flag it again at the end of Task 7, do not attempt to silently "verify" it on production hardware from within this plan's execution.

---

### Task 1: Data model — `PrintJob`/`PendingPrintUpload`/`Printer` field changes

**Files:**
- Modify: `server/src/models/PrintJob.js`
- Modify: `server/src/models/PendingPrintUpload.js`
- Modify: `server/src/models/Printer.js`
- Test: `server/src/tests/unit/printJobModel.test.js`, `server/src/tests/unit/pendingPrintUploadModel.test.js`, `server/src/tests/unit/printerModel.test.js`

**Interfaces:**
- Produces: `PrintJob.gateAssignments: [{tool: String|null, gate: Number}]` (default `[]`), `PrintJob.slotSelectionOverridden` unchanged, `PrintJob.gcodeMode` unchanged. `PrintJob.selectedGate` and `PrintJob.slotMismatchWarnings` no longer exist. `PendingPrintUpload.mismatches` no longer exists. `Printer.spoolSlots[]` entries gain `source: 'auto'|'manual'` (default `'auto'`), `manualSetBy: {email, name}|null`, `manualSetAt: Date|null`, `autoMaterialAtSet/autoColorAtSet/autoEmptyAtSet` (default `null`). Every later task in this plan reads/writes these exact names.

- [ ] **Step 1: Write the failing tests**

Replace the last two `it(...)` blocks in `server/src/tests/unit/printJobModel.test.js` (currently `'defaults the spool-selection fields to null/false/empty'` and `'accepts a populated selectedGate and slotMismatchWarnings'`) with:

```js
  it('defaults the spool-selection fields to false/null/empty', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'Student' },
      printer: printer._id,
      fileName: 'part.gcode',
      filePath: '/x',
    });
    expect(job.gateAssignments).toEqual([]);
    expect(job.slotSelectionOverridden).toBe(false);
    expect(job.gcodeMode).toBeNull();
  });

  it('accepts a populated gateAssignments array', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'Student' },
      printer: printer._id,
      fileName: 'part.gcode',
      filePath: '/x',
      gcodeMode: PRINT_JOB_GCODE_MODES.MULTI_MATERIAL,
      gateAssignments: [
        { tool: 'T0', gate: 2 },
        { tool: 'T2', gate: 1 },
      ],
    });
    expect(job.gcodeMode).toBe('multi-material');
    expect(job.gateAssignments).toHaveLength(2);
    expect(job.gateAssignments[0].tool).toBe('T0');
    expect(job.gateAssignments[0].gate).toBe(2);
  });

  it('accepts a null tool in gateAssignments for the zero-Tx case', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'Student' },
      printer: printer._id,
      fileName: 'part.gcode',
      filePath: '/x',
      gcodeMode: PRINT_JOB_GCODE_MODES.SINGLE,
      gateAssignments: [{ tool: null, gate: 3 }],
    });
    expect(job.gateAssignments[0].tool).toBeNull();
    expect(job.gateAssignments[0].gate).toBe(3);
  });
```

Replace the `'creates a document with the required fields and TTL defaults'` test in `server/src/tests/unit/pendingPrintUploadModel.test.js` — remove the `expect(pending.mismatches).toEqual([]);` line (the rest of that test is unchanged):

```js
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
    expect(pending.createdAt).toBeInstanceOf(Date);
  });
```

Add to `server/src/tests/unit/printerModel.test.js`, after the existing `'accepts a populated spoolSlots array'` test:

```js
  it('defaults spoolSlots manual-declaration fields to auto/null', async () => {
    const printer = await Printer.create({
      name: 'P1',
      model: 'kobra3',
      apiKeyHash: 'x'.repeat(64),
      spoolSlots: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }],
    });
    expect(printer.spoolSlots[0].source).toBe('auto');
    expect(printer.spoolSlots[0].manualSetBy).toBeNull();
    expect(printer.spoolSlots[0].manualSetAt).toBeNull();
    expect(printer.spoolSlots[0].autoMaterialAtSet).toBeNull();
    expect(printer.spoolSlots[0].autoColorAtSet).toBeNull();
    expect(printer.spoolSlots[0].autoEmptyAtSet).toBeNull();
  });

  it('accepts a manually-declared spoolSlot with its drift-detection snapshot', async () => {
    const printer = await Printer.create({
      name: 'P1',
      model: 'kobra3',
      apiKeyHash: 'x'.repeat(64),
      spoolSlots: [
        {
          gate: 0,
          material: 'PLA',
          color: 'FFFFFF',
          empty: false,
          source: 'manual',
          manualSetBy: { email: 's@epitech.eu', name: 'Student' },
          manualSetAt: new Date(),
          autoMaterialAtSet: '',
          autoColorAtSet: '',
          autoEmptyAtSet: false,
        },
      ],
    });
    expect(printer.spoolSlots[0].source).toBe('manual');
    expect(printer.spoolSlots[0].manualSetBy.email).toBe('s@epitech.eu');
    expect(printer.spoolSlots[0].autoEmptyAtSet).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/tests/unit/printJobModel.test.js src/tests/unit/pendingPrintUploadModel.test.js src/tests/unit/printerModel.test.js`
Expected: FAIL — `job.gateAssignments` is `undefined` (field doesn't exist yet), `printer.spoolSlots[0].source` is `undefined`.

- [ ] **Step 3: Update `PrintJob.js`**

In `server/src/models/PrintJob.js`, replace:

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

with:

```js
  gateAssignments: {
    type: [
      {
        tool: { type: String, default: null },
        gate: { type: Number, required: true },
      },
    ],
    default: [],
  },
  slotSelectionOverridden: { type: Boolean, default: false },
  gcodeMode: {
    type: String,
    enum: [...Object.values(PRINT_JOB_GCODE_MODES), null],
    default: null,
  },
```

- [ ] **Step 4: Update `PendingPrintUpload.js`**

In `server/src/models/PendingPrintUpload.js`, remove the entire `mismatches` field block:

```js
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
```

- [ ] **Step 5: Update `Printer.js`**

In `server/src/models/Printer.js`, replace the `spoolSlots` field definition:

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
```

with:

```js
  spoolSlots: {
    type: [
      {
        gate: { type: Number, required: true },
        material: { type: String, default: '' },
        color: { type: String, default: '' },
        empty: { type: Boolean, default: true },
        // Déclaration manuelle (bobines sans puce RFID, voir spec 2026-09-10) : source vaut
        // 'manual' tant que la valeur auto-rapportée par l'agent n'a pas dérivé de ce qui était
        // vrai au moment de la déclaration (autoXAtSet) — voir server/src/utils/spoolSlotMerge.js.
        source: { type: String, enum: ['auto', 'manual'], default: 'auto' },
        manualSetBy: {
          email: { type: String, default: null },
          name: { type: String, default: null },
        },
        manualSetAt: { type: Date, default: null },
        autoMaterialAtSet: { type: String, default: null },
        autoColorAtSet: { type: String, default: null },
        autoEmptyAtSet: { type: Boolean, default: null },
      },
    ],
    default: [],
  },
```

Note: `manualSetBy` uses a nested object with its own `default: null`-per-field shape (matching the existing `cancelledBy` pattern elsewhere in this codebase) rather than `default: null` on the whole subdocument, since Mongoose subdocuments don't support a top-level `null` default cleanly inside an array item.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd server && npx jest src/tests/unit/printJobModel.test.js src/tests/unit/pendingPrintUploadModel.test.js src/tests/unit/printerModel.test.js`
Expected: PASS (all tests in the three files)

- [ ] **Step 7: Commit**

```bash
git add server/src/models/PrintJob.js server/src/models/PendingPrintUpload.js server/src/models/Printer.js server/src/tests/unit/printJobModel.test.js server/src/tests/unit/pendingPrintUploadModel.test.js server/src/tests/unit/printerModel.test.js
git commit -m "feat(print): add gateAssignments and manual spool-slot declaration fields"
```

---

### Task 2: Backend — spool-status merge algorithm (preserve manual declarations across ticks)

**Files:**
- Create: `server/src/utils/spoolSlotMerge.js`
- Modify: `server/src/controllers/print/agentController.js`
- Test: Create `server/src/tests/unit/spoolSlotMerge.test.js`, modify `server/src/tests/functional/print/agentSpoolStatus.test.js`

**Interfaces:**
- Produces: `mergeSpoolSlots(existingSlots, reportedGates) -> newSlots[]` — pure function, no I/O. `reportedGates` is the raw `{gate, material, color, empty}[]` from the agent's `POST /agent/spool-status` body (Task 5 of the original plan, already shipped). `existingSlots` is `Printer.spoolSlots` (Mongoose subdocument array or plain objects, read via property access only — see Step 3 for why). Task 3 (manual endpoint) writes the same `source`/`manualSetBy`/`manualSetAt`/`autoXAtSet` shape this function reads.
- Consumes: `Printer.spoolSlots` shape from Task 1.

- [ ] **Step 1: Write the failing tests**

Create `server/src/tests/unit/spoolSlotMerge.test.js`:

```js
const { mergeSpoolSlots } = require('../../utils/spoolSlotMerge');

describe('mergeSpoolSlots', () => {
  it('adopts a reported gate with no prior slot as auto', () => {
    const result = mergeSpoolSlots([], [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }]);
    expect(result).toEqual([
      {
        gate: 0,
        material: 'PLA',
        color: '212721FF',
        empty: false,
        source: 'auto',
        manualSetBy: null,
        manualSetAt: null,
        autoMaterialAtSet: null,
        autoColorAtSet: null,
        autoEmptyAtSet: null,
      },
    ]);
  });

  it('adopts a new reported value when the existing slot was already auto, regardless of change', () => {
    const existing = [
      {
        gate: 0,
        material: 'PLA',
        color: '212721FF',
        empty: false,
        source: 'auto',
        manualSetBy: null,
        manualSetAt: null,
        autoMaterialAtSet: null,
        autoColorAtSet: null,
        autoEmptyAtSet: null,
      },
    ];
    const result = mergeSpoolSlots(existing, [{ gate: 0, material: 'PETG', color: 'F40031FF', empty: false }]);
    expect(result[0].material).toBe('PETG');
    expect(result[0].source).toBe('auto');
  });

  it('preserves a manual declaration when the auto-reported value has not changed', () => {
    const existing = [
      {
        gate: 0,
        material: 'Blanc générique',
        color: 'ffffff',
        empty: false,
        source: 'manual',
        manualSetBy: { email: 's@epitech.eu', name: 'Student' },
        manualSetAt: new Date('2026-09-10T10:00:00Z'),
        autoMaterialAtSet: 'PLA',
        autoColorAtSet: '212721FF',
        autoEmptyAtSet: false,
      },
    ];
    // Le rapport entrant est identique à ce qui était vrai au moment de la déclaration manuelle.
    const result = mergeSpoolSlots(existing, [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }]);
    expect(result[0].source).toBe('manual');
    expect(result[0].material).toBe('Blanc générique');
    expect(result[0].color).toBe('ffffff');
  });

  it('clears a manual declaration and adopts the fresh value when the auto-reported value has changed', () => {
    const existing = [
      {
        gate: 0,
        material: 'Blanc générique',
        color: 'ffffff',
        empty: false,
        source: 'manual',
        manualSetBy: { email: 's@epitech.eu', name: 'Student' },
        manualSetAt: new Date('2026-09-10T10:00:00Z'),
        autoMaterialAtSet: 'PLA',
        autoColorAtSet: '212721FF',
        autoEmptyAtSet: false,
      },
    ];
    // Une vraie puce RFID vient d'être lue : la valeur auto a changé par rapport à autoXAtSet.
    const result = mergeSpoolSlots(existing, [{ gate: 0, material: 'PETG', color: 'AABBCCFF', empty: false }]);
    expect(result[0]).toEqual({
      gate: 0,
      material: 'PETG',
      color: 'AABBCCFF',
      empty: false,
      source: 'auto',
      manualSetBy: null,
      manualSetAt: null,
      autoMaterialAtSet: null,
      autoColorAtSet: null,
      autoEmptyAtSet: null,
    });
  });

  it('treats a gate becoming empty as a drift, clearing the manual declaration', () => {
    const existing = [
      {
        gate: 0,
        material: 'Blanc générique',
        color: 'ffffff',
        empty: false,
        source: 'manual',
        manualSetBy: { email: 's@epitech.eu', name: 'Student' },
        manualSetAt: new Date('2026-09-10T10:00:00Z'),
        autoMaterialAtSet: 'PLA',
        autoColorAtSet: '212721FF',
        autoEmptyAtSet: false,
      },
    ];
    const result = mergeSpoolSlots(existing, [{ gate: 0, material: 'PLA', color: '212721FF', empty: true }]);
    expect(result[0].source).toBe('auto');
    expect(result[0].empty).toBe(true);
  });

  it('handles a reported gate missing material/color/empty by defaulting them', () => {
    const result = mergeSpoolSlots([], [{ gate: 1 }]);
    expect(result[0].material).toBe('');
    expect(result[0].color).toBe('');
    expect(result[0].empty).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/tests/unit/spoolSlotMerge.test.js`
Expected: FAIL — `Cannot find module '../../utils/spoolSlotMerge'`

- [ ] **Step 3: Implement**

Create `server/src/utils/spoolSlotMerge.js`:

```js
// Fusionne le rapport brut de l'agent (POST /agent/spool-status) avec les slots existants, en
// préservant une déclaration manuelle tant que la valeur auto-détectée n'a pas dérivé depuis
// qu'elle a été posée. L'API Moonraker n'expose aucun signal direct "ceci vient d'une lecture
// RFID" (voir spec 2026-09-10, section spike) — un changement de valeur auto-rapportée est donc
// traité comme une nouvelle détection faisant autorité : une heuristique, pas une certitude.
//
// Prend des slots existants sous forme de tableau d'objets à accès par propriété (fonctionne
// aussi bien avec des sous-documents Mongoose qu'avec des objets JS simples) et retourne
// toujours de NOUVEAUX objets simples — jamais les sous-documents existants eux-mêmes, pour
// éviter tout problème de ré-attachement de sous-document Mongoose au moment de la réaffectation
// de `printer.spoolSlots`.
function mergeSpoolSlots(existingSlots, reportedGates) {
  return reportedGates.map((g) => {
    const reported = {
      gate: g.gate,
      material: g.material || '',
      color: g.color || '',
      empty: !!g.empty,
    };

    const existing = existingSlots.find((s) => s.gate === g.gate);

    if (existing && existing.source === 'manual') {
      const unchanged =
        reported.material === existing.autoMaterialAtSet &&
        reported.color === existing.autoColorAtSet &&
        reported.empty === existing.autoEmptyAtSet;

      if (unchanged) {
        return {
          gate: existing.gate,
          material: existing.material,
          color: existing.color,
          empty: existing.empty,
          source: existing.source,
          manualSetBy: existing.manualSetBy,
          manualSetAt: existing.manualSetAt,
          autoMaterialAtSet: existing.autoMaterialAtSet,
          autoColorAtSet: existing.autoColorAtSet,
          autoEmptyAtSet: existing.autoEmptyAtSet,
        };
      }
    }

    return {
      ...reported,
      source: 'auto',
      manualSetBy: null,
      manualSetAt: null,
      autoMaterialAtSet: null,
      autoColorAtSet: null,
      autoEmptyAtSet: null,
    };
  });
}

module.exports = { mergeSpoolSlots };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest src/tests/unit/spoolSlotMerge.test.js`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Wire it into `reportSpoolStatus`**

In `server/src/controllers/print/agentController.js`, add the import at the top:

```js
const { mergeSpoolSlots } = require('../../utils/spoolSlotMerge');
```

Replace the body of `exports.reportSpoolStatus`:

```js
exports.reportSpoolStatus = asyncHandler(async (req, res, next) => {
  const { gates } = req.body;
  if (!Array.isArray(gates)) {
    return next(new ErrorResponse('gates (tableau) requis', 400));
  }

  req.printer.spoolSlots = mergeSpoolSlots(req.printer.spoolSlots, gates);
  req.printer.spoolSlotsUpdatedAt = new Date();
  await req.printer.save();

  res.status(200).json({ success: true });
});
```

- [ ] **Step 6: Add a functional test for the merge wiring**

Add to `server/src/tests/functional/print/agentSpoolStatus.test.js`, inside the existing `describe('POST /api/print/agent/spool-status', ...)` block:

```js
  it('preserves a manual declaration across a tick when the auto-reported value is unchanged', async () => {
    const { printer, rawKey } = await createPrinter({
      spoolSlots: [
        {
          gate: 0,
          material: 'Blanc générique',
          color: 'ffffff',
          empty: false,
          source: 'manual',
          manualSetBy: { email: 's@epitech.eu', name: 'Student' },
          manualSetAt: new Date(),
          autoMaterialAtSet: 'PLA',
          autoColorAtSet: '212721FF',
          autoEmptyAtSet: false,
        },
      ],
    });

    const res = await request(app)
      .post('/api/print/agent/spool-status')
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ gates: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }] });

    expect(res.status).toBe(200);
    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.spoolSlots[0].source).toBe('manual');
    expect(reloaded.spoolSlots[0].material).toBe('Blanc générique');
  });

  it('clears a manual declaration when a new auto-detection reports a different value', async () => {
    const { printer, rawKey } = await createPrinter({
      spoolSlots: [
        {
          gate: 0,
          material: 'Blanc générique',
          color: 'ffffff',
          empty: false,
          source: 'manual',
          manualSetBy: { email: 's@epitech.eu', name: 'Student' },
          manualSetAt: new Date(),
          autoMaterialAtSet: 'PLA',
          autoColorAtSet: '212721FF',
          autoEmptyAtSet: false,
        },
      ],
    });

    const res = await request(app)
      .post('/api/print/agent/spool-status')
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ gates: [{ gate: 0, material: 'PETG', color: 'AABBCCFF', empty: false }] });

    expect(res.status).toBe(200);
    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.spoolSlots[0].source).toBe('auto');
    expect(reloaded.spoolSlots[0].material).toBe('PETG');
  });
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd server && npx jest src/tests/functional/print/agentSpoolStatus.test.js`
Expected: PASS (existing 3 tests plus the 2 new ones)

- [ ] **Step 8: Run the full backend suite to check for regressions**

Run: `cd server && npx jest`
Expected: PASS — note `server/src/tests/functional/print/agent.test.js`'s existing next-job tests referencing `job.selectedGate` will FAIL at this point since `PrintJob.selectedGate` no longer exists; this is expected and fixed in Task 5. Confirm no OTHER unrelated suite regressed.

- [ ] **Step 9: Commit**

```bash
git add server/src/utils/spoolSlotMerge.js server/src/controllers/print/agentController.js server/src/tests/unit/spoolSlotMerge.test.js server/src/tests/functional/print/agentSpoolStatus.test.js
git commit -m "feat(print): preserve manual spool-slot declarations across agent ticks unless auto-detection drifts"
```

---

### Task 3: Backend — manual gate-content declaration endpoint

**Files:**
- Modify: `server/src/routes/printPrinters.js`
- Modify: `server/src/controllers/print/printerController.js`
- Test: Create `server/src/tests/functional/print/printerManualSpoolSlot.test.js`

**Interfaces:**
- Produces: `printerController.setManualSpoolSlot`, route `PUT /api/print/printers/:id/spool-slots/:gate/manual`. Body `{material, color}`. Response `{success: true, data: <updated spoolSlot>}`.
- Consumes: `Printer.spoolSlots[]` shape from Task 1, `PrintAuthorization` model (already exists).

- [ ] **Step 1: Write the failing tests**

Create `server/src/tests/functional/print/printerManualSpoolSlot.test.js`:

```js
const request = require('supertest');
const app = require('../../../app');
const Printer = require('../../../models/Printer');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');
const { createPrinter, whitelistEmail } = require('../../helpers/print');

describe('PUT /api/print/printers/:id/spool-slots/:gate/manual', () => {
  it('returns 401 without auth', async () => {
    const { printer } = await createPrinter({ spoolSlots: [{ gate: 0, material: '', color: '', empty: true }] });
    const res = await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/0/manual`)
      .send({ material: 'PLA', color: '#ffffff' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for a student who is not whitelisted and not an admin', async () => {
    const student = await createUser({ email: 'not-whitelisted@epitech.eu' });
    const { printer } = await createPrinter({ spoolSlots: [{ gate: 0, material: '', color: '', empty: true }] });

    const res = await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/0/manual`)
      .set(authHeader(student))
      .send({ material: 'PLA', color: '#ffffff' });

    expect(res.status).toBe(403);
  });

  it('lets a whitelisted student declare a gate manually', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }],
      spoolSlotsUpdatedAt: new Date(),
    });

    const res = await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/0/manual`)
      .set(authHeader(student))
      .send({ material: 'Blanc générique', color: '#ffffff' });

    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('manual');
    expect(res.body.data.material).toBe('Blanc générique');

    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.spoolSlots[0].source).toBe('manual');
    expect(reloaded.spoolSlots[0].autoMaterialAtSet).toBe('PLA');
    expect(reloaded.spoolSlots[0].autoColorAtSet).toBe('212721FF');
    expect(reloaded.spoolSlots[0].manualSetBy.email).toBe('ok@epitech.eu');
  });

  it('lets an admin declare a gate manually even when not whitelisted', async () => {
    const admin = await createAdmin();
    const { printer } = await createPrinter({ spoolSlots: [{ gate: 0, material: '', color: '', empty: true }] });

    const res = await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/0/manual`)
      .set(authHeader(admin))
      .send({ material: 'PETG', color: '#ff0000' });

    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('manual');
  });

  it('preserves the original drift-detection snapshot when correcting an existing manual declaration', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }],
    });

    await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/0/manual`)
      .set(authHeader(student))
      .send({ material: 'Blanc générique', color: '#ffffff' });

    // Correction : ne doit PAS re-capturer la valeur manuelle précédente comme référence de dérive.
    const res = await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/0/manual`)
      .set(authHeader(student))
      .send({ material: 'Blanc mat', color: '#f5f5f5' });

    expect(res.status).toBe(200);
    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.spoolSlots[0].material).toBe('Blanc mat');
    expect(reloaded.spoolSlots[0].autoMaterialAtSet).toBe('PLA');
    expect(reloaded.spoolSlots[0].autoColorAtSet).toBe('212721FF');
  });

  it('returns 400 when material or color is missing', async () => {
    const admin = await createAdmin();
    const { printer } = await createPrinter({ spoolSlots: [{ gate: 0, material: '', color: '', empty: true }] });

    const res = await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/0/manual`)
      .set(authHeader(admin))
      .send({ material: 'PLA' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown printer', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .put('/api/print/printers/000000000000000000000000/spool-slots/0/manual')
      .set(authHeader(admin))
      .send({ material: 'PLA', color: '#ffffff' });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a gate not present in spoolSlots', async () => {
    const admin = await createAdmin();
    const { printer } = await createPrinter({ spoolSlots: [{ gate: 0, material: '', color: '', empty: true }] });

    const res = await request(app)
      .put(`/api/print/printers/${printer._id}/spool-slots/2/manual`)
      .set(authHeader(admin))
      .send({ material: 'PLA', color: '#ffffff' });

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/tests/functional/print/printerManualSpoolSlot.test.js`
Expected: FAIL — `404` on every request (no route registered yet).

- [ ] **Step 3: Add the route**

In `server/src/routes/printPrinters.js`, add after the existing `router.post('/:id/confirm-clearance/override', ...)` line:

```js
router.put('/:id/spool-slots/:gate/manual', authenticateToken, printerController.setManualSpoolSlot);
```

- [ ] **Step 4: Implement the controller**

In `server/src/controllers/print/printerController.js`, add the import at the top:

```js
const PrintAuthorization = require('../../models/PrintAuthorization');
```

Add the new handler at the end of the file:

```js
// PUT /api/print/printers/:id/spool-slots/:gate/manual
// body: { material, color }
exports.setManualSpoolSlot = asyncHandler(async (req, res, next) => {
  const { material, color } = req.body;
  if (!material || !color) {
    return next(new ErrorResponse('material et color sont requis', 400));
  }

  const printer = await Printer.findById(req.params.id);
  if (!printer) return next(new ErrorResponse('Imprimante non trouvée', 404));

  // Permission avant existence du gate — cohérent avec confirmJob, qui vérifie déjà la
  // propriété/l'autorisation avant l'existence de la ressource ciblée.
  if (req.user.role !== 'admin') {
    const authorization = await PrintAuthorization.findOne({ email: req.user.email.toLowerCase() });
    if (!authorization || !authorization.authorized) {
      return next(new ErrorResponse("Vous n'êtes pas autorisé à déclarer le contenu d'une bobine", 403));
    }
  }

  const gate = Number(req.params.gate);
  const slotIndex = printer.spoolSlots.findIndex((s) => s.gate === gate);
  if (slotIndex === -1) {
    return next(new ErrorResponse('Gate inconnu pour cette imprimante', 404));
  }

  const slot = printer.spoolSlots[slotIndex];
  // Ne capture le snapshot de dérive que si ce n'était pas déjà une déclaration manuelle —
  // corriger une déclaration existante ne doit pas déplacer la référence utilisée pour détecter
  // une future vraie lecture RFID (voir spec 2026-09-10).
  if (slot.source !== 'manual') {
    slot.autoMaterialAtSet = slot.material;
    slot.autoColorAtSet = slot.color;
    slot.autoEmptyAtSet = slot.empty;
  }
  slot.material = material;
  slot.color = color;
  slot.empty = false;
  slot.source = 'manual';
  slot.manualSetBy = { email: req.user.email.toLowerCase(), name: req.user.name };
  slot.manualSetAt = new Date();

  await printer.save();
  res.status(200).json({ success: true, data: printer.spoolSlots[slotIndex] });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx jest src/tests/functional/print/printerManualSpoolSlot.test.js`
Expected: PASS (all 8 tests)

- [ ] **Step 6: Run the full backend suite to check for regressions**

Run: `cd server && npx jest`
Expected: PASS except the still-known `agent.test.js` `selectedGate` failures from Task 2 (fixed in Task 5) — confirm nothing else regressed.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/printPrinters.js server/src/controllers/print/printerController.js server/src/tests/functional/print/printerManualSpoolSlot.test.js
git commit -m "feat(print): let authorized students and admins manually declare a gate's contents"
```

---

### Task 4: Backend — simplify `analyzeJob` (remove server-side mismatch computation)

**Files:**
- Modify: `server/src/controllers/print/jobController.js`
- Modify: `server/src/utils/spoolAnalysis.js`
- Test: Modify `server/src/tests/functional/print/jobAnalyze.test.js`, `server/src/tests/unit/spoolAnalysis.test.js`

**Interfaces:**
- Removes: `computeSlotMismatches`/`normalizeColor` exports from `spoolAnalysis.js` (dead code — nothing calls them after this task; the equivalent logic moves client-side in Task 8, ported independently since the client can't `require()` server code).
- Produces: `analyzeJob`'s response drops the `mismatches` key. `slots` now includes the `source`/`manualSetBy`/`manualSetAt` fields from Task 1 automatically (it's the same `printer.spoolSlots` array, unchanged access pattern).

**Background:** the gate is no longer fixed before confirmation — the student picks it interactively via `GatePicker` (Task 9-10) — so a server-computed "here's the one mismatch for the gate you'll end up choosing" doesn't make sense anymore: it would need recomputing on every click. The frontend already receives everything it needs (`expectedTools` + `slots`) to compute this itself.

- [ ] **Step 1: Remove `computeSlotMismatches`/`normalizeColor` and their tests**

In `server/src/utils/spoolAnalysis.js`, remove the `normalizeColor` and `computeSlotMismatches` functions entirely, and change the final export line to:

```js
module.exports = { parseGcodeSpoolInfo };
```

In `server/src/tests/unit/spoolAnalysis.test.js`, remove the entire `describe('computeSlotMismatches', ...)` block (everything from `describe('computeSlotMismatches', () => {` to its closing `});`), and remove `computeSlotMismatches` from the top import line:

```js
const { parseGcodeSpoolInfo } = require('../../utils/spoolAnalysis');
```

- [ ] **Step 2: Run tests to verify the file still passes (no failing step here — this is a removal, not new behavior)**

Run: `cd server && npx jest src/tests/unit/spoolAnalysis.test.js`
Expected: PASS — only the 5 `parseGcodeSpoolInfo` tests remain, all still passing.

- [ ] **Step 3: Update `analyzeJob`**

In `server/src/controllers/print/jobController.js`, remove `computeSlotMismatches` from the top import line:

```js
const { parseGcodeSpoolInfo } = require('../../utils/spoolAnalysis');
```

Replace the body of `exports.analyzeJob` from the `parseGcodeSpoolInfo` call onward:

```js
  const gcodeText = await fs.promises.readFile(req.file.path, 'utf8');
  const { mode, expectedTools } = parseGcodeSpoolInfo(gcodeText);

  const pending = await PendingPrintUpload.create({
    student: { email: req.user.email.toLowerCase(), name: req.user.name },
    printer: printer._id,
    fileName: req.file.originalname,
    filePath: req.file.path,
    gcodeMode: mode,
    expectedTools,
  });

  res.status(201).json({
    success: true,
    data: {
      pendingUploadId: pending._id,
      mode,
      slots: printer.spoolSlots,
      spoolSlotsUpdatedAt: printer.spoolSlotsUpdatedAt,
      expectedTools,
    },
  });
});
```

- [ ] **Step 4: Update the analyze test file**

In `server/src/tests/functional/print/jobAnalyze.test.js`, replace the test `'detects multi-material mode, extracts expected tools, and computes mismatches'` with:

```js
  it('detects multi-material mode and extracts expected tools', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [
        { gate: 0, material: 'PLA', color: 'FF6A14FF', empty: false },
        { gate: 2, material: 'PLA', color: 'F40031FF', empty: false },
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
    expect(res.body.data.mismatches).toBeUndefined();
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx jest src/tests/functional/print/jobAnalyze.test.js`
Expected: PASS (all 6 tests)

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/print/jobController.js server/src/utils/spoolAnalysis.js server/src/tests/functional/print/jobAnalyze.test.js server/src/tests/unit/spoolAnalysis.test.js
git commit -m "refactor(print): drop server-side mismatch computation from analyzeJob"
```

---

### Task 5: Backend — `confirmJob` accepts `gateAssignments`

**Files:**
- Modify: `server/src/controllers/print/jobController.js`
- Modify: `server/src/controllers/print/agentController.js`
- Test: Replace `server/src/tests/functional/print/jobConfirm.test.js`, modify `server/src/tests/functional/print/agent.test.js`

**Interfaces:**
- Consumes: `PendingPrintUpload.expectedTools` (Task 1, unchanged shape), `Printer.spoolSlots` (Task 1).
- Produces: `confirmJob` accepts body `{gateAssignments?: [{tool, gate}], overrideNoSpoolData?}`, writes `PrintJob.gateAssignments` (Task 1). `GET /agent/next-job`'s response now includes `gateAssignments` instead of `selectedGate` — Task 7 (agent dispatch) reads this exact field.

- [ ] **Step 1: Rewrite the confirm test file**

Replace the entire content of `server/src/tests/functional/print/jobConfirm.test.js`:

```js
const request = require('supertest');
const fs = require('fs');
const app = require('../../../app');
const PrintJob = require('../../../models/PrintJob');
const Printer = require('../../../models/Printer');
const PendingPrintUpload = require('../../../models/PendingPrintUpload');
const { createUser, authHeader } = require('../../helpers/auth');
const { createPrinter, whitelistEmail } = require('../../helpers/print');
const PrintAuthorization = require('../../../models/PrintAuthorization');
const { PRINTER_STATUSES } = require('../../../utils/constants');

const MONO_GCODE = 'G28\nG1 X10 Y10\nM104 S200\n';
const MULTI_GCODE_ONE_TOOL = [
  '; filament_colour = #FF6A14;#FED141;#F40031;#212721',
  '; filament_type = PLA;PLA;PETG;PLA',
  'G28',
  'T0',
  'G1 X10',
].join('\n');
const MULTI_GCODE_TWO_TOOLS = [
  '; filament_colour = #FF6A14;#FED141;#F40031;#212721',
  '; filament_type = PLA;PLA;PETG;PLA',
  'G28',
  'T0',
  'G1 X10',
  'T2',
  'G1 X20',
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
      .send({ gateAssignments: [{ tool: null, gate: 0 }] });
    expect(res.status).toBe(403);
  });

  it('creates a queued PrintJob with the mono gate assignment and locks the printer', async () => {
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
      .send({ gateAssignments: [{ tool: null, gate: 0 }] });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('queued');
    expect(res.body.data.gateAssignments).toEqual([{ tool: null, gate: 0 }]);
    expect(res.body.data.gcodeMode).toBe('single');
    expect(fs.existsSync(res.body.data.filePath)).toBe(true);

    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.status).toBe(PRINTER_STATUSES.PRINTING);
    expect(reloadedPrinter.currentJob.toString()).toBe(res.body.data._id);

    expect(await PendingPrintUpload.findById(analyzeRes.body.data.pendingUploadId)).toBeNull();
  });

  it('rejects a confirm with no gateAssignments when spool data exists', async () => {
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
      .send({ gateAssignments: [{ tool: null, gate: 1 }] });
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
    expect(overridden.body.data.gateAssignments).toEqual([]);
    expect(overridden.body.data.slotSelectionOverridden).toBe(true);
  });

  it('confirms a single-tool multi-material upload with one gate assignment', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 0, material: 'PETG', color: '000000FF', empty: false }],
      spoolSlotsUpdatedAt: new Date(),
    });
    const analyzeRes = await analyze(student, printer, MULTI_GCODE_ONE_TOOL);

    const res = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({ gateAssignments: [{ tool: 'T0', gate: 0 }] });

    expect(res.status).toBe(201);
    expect(res.body.data.gateAssignments).toEqual([{ tool: 'T0', gate: 0 }]);
  });

  it('requires an assignment for every detected tool in a multi-tool file', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [
        { gate: 0, material: 'PLA', color: 'FF6A14FF', empty: false },
        { gate: 2, material: 'PETG', color: 'F40031FF', empty: false },
      ],
      spoolSlotsUpdatedAt: new Date(),
    });
    const analyzeRes = await analyze(student, printer, MULTI_GCODE_TWO_TOOLS);

    const partial = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({ gateAssignments: [{ tool: 'T0', gate: 0 }] });
    expect(partial.status).toBe(400);

    const complete = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({
        gateAssignments: [
          { tool: 'T0', gate: 0 },
          { tool: 'T2', gate: 2 },
        ],
      });
    expect(complete.status).toBe(201);
    expect(complete.body.data.gateAssignments).toEqual([
      { tool: 'T0', gate: 0 },
      { tool: 'T2', gate: 2 },
    ]);
  });

  it('creates a rejected PrintJob when the printer is busy at confirm time', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }],
      spoolSlotsUpdatedAt: new Date(),
    });
    const analyzeRes = await analyze(student, printer);

    await Printer.findByIdAndUpdate(printer._id, { status: PRINTER_STATUSES.PRINTING });

    const res = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({ gateAssignments: [{ tool: null, gate: 0 }] });

    expect(res.status).toBe(409);
    const jobs = await PrintJob.find({ 'student.email': student.email });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('rejected');
    expect(jobs[0].rejectionReason).toBe('printer_busy');
  });

  it('creates a rejected PrintJob when whitelist authorization is revoked between analyze and confirm', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }],
      spoolSlotsUpdatedAt: new Date(),
    });
    const analyzeRes = await analyze(student, printer);

    await PrintAuthorization.findOneAndUpdate({ email: student.email }, { authorized: false });

    const res = await request(app)
      .post(`/api/print/jobs/${analyzeRes.body.data.pendingUploadId}/confirm`)
      .set(authHeader(student))
      .send({ gateAssignments: [{ tool: null, gate: 0 }] });

    expect(res.status).toBe(403);
    const jobs = await PrintJob.find({ 'student.email': student.email });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('rejected');
    expect(jobs[0].rejectionReason).toBe('not_authorized');

    expect(await PendingPrintUpload.findById(analyzeRes.body.data.pendingUploadId)).toBeNull();
  });

  it('lets only one of two concurrent confirms on the same idle printer win the atomic lock', async () => {
    const studentA = await createUser({ email: 'racer-a@epitech.eu' });
    const studentB = await createUser({ email: 'racer-b@epitech.eu' });
    await whitelistEmail(studentA.email);
    await whitelistEmail(studentB.email);
    const { printer } = await createPrinter({
      spoolSlots: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }],
      spoolSlotsUpdatedAt: new Date(),
    });

    const analyzeResA = await analyze(studentA, printer, MONO_GCODE, 'a.gcode');
    const analyzeResB = await analyze(studentB, printer, MONO_GCODE, 'b.gcode');

    const confirm = (student, pendingUploadId) =>
      request(app)
        .post(`/api/print/jobs/${pendingUploadId}/confirm`)
        .set(authHeader(student))
        .send({ gateAssignments: [{ tool: null, gate: 0 }] });

    const [resA, resB] = await Promise.all([
      confirm(studentA, analyzeResA.body.data.pendingUploadId),
      confirm(studentB, analyzeResB.body.data.pendingUploadId),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const winner = resA.status === 201 ? resA : resB;
    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.status).toBe(PRINTER_STATUSES.PRINTING);
    expect(reloadedPrinter.currentJob.toString()).toBe(winner.body.data._id);

    const jobs = await PrintJob.find({ printer: printer._id }).sort({ submittedAt: 1 });
    expect(jobs).toHaveLength(2);
    const statusesInDb = jobs.map((j) => j.status).sort();
    expect(statusesInDb).toEqual(['queued', 'rejected']);
    const rejectedJob = jobs.find((j) => j.status === 'rejected');
    expect(rejectedJob.rejectionReason).toBe('printer_busy');

    expect(await PendingPrintUpload.findById(analyzeResA.body.data.pendingUploadId)).toBeNull();
    expect(await PendingPrintUpload.findById(analyzeResB.body.data.pendingUploadId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/tests/functional/print/jobConfirm.test.js`
Expected: FAIL — `confirmJob` still reads `req.body.selectedGate`, so every gate-assignment test gets a `400`/wrong shape.

- [ ] **Step 3: Rewrite `confirmJob`**

In `server/src/controllers/print/jobController.js`, replace the body of `exports.confirmJob` from the `let selectedGate = null;` line down through the `PrintJob.create({...})` call:

```js
  let gateAssignments = [];
  let slotSelectionOverridden = false;
  const hasSpoolData = !!printer.spoolSlotsUpdatedAt;

  if (!hasSpoolData) {
    if (!req.body.overrideNoSpoolData) {
      return next(
        new ErrorResponse(
          "Données bobines indisponibles pour cette imprimante — utilisez l'option de contournement si vous souhaitez continuer quand même",
          400
        )
      );
    }
    slotSelectionOverridden = true;
  } else {
    // Un tool attendu par entrée d'expectedTools (multi-couleur), ou une seule entrée à tool
    // null pour un fichier sans aucune commande Tx (mono-matériau) — voir spec 2026-09-10.
    const expectedToolKeys =
      pending.gcodeMode === PRINT_JOB_GCODE_MODES.SINGLE ? [null] : pending.expectedTools.map((t) => t.tool);
    const provided = Array.isArray(req.body.gateAssignments) ? req.body.gateAssignments : [];

    const everyToolCovered = expectedToolKeys.every((tool) => provided.some((a) => a.tool === tool));
    if (provided.length !== expectedToolKeys.length || !everyToolCovered) {
      return next(new ErrorResponse('Une bobine doit être assignée à chaque tool détecté', 400));
    }

    for (const assignment of provided) {
      const gate = assignment.gate;
      if (typeof gate !== 'number' || gate < 0 || gate > 3) {
        return next(new ErrorResponse('Sélection de bobine requise pour chaque tool', 400));
      }
      const slot = printer.spoolSlots.find((s) => s.gate === gate);
      if (!slot || slot.empty) {
        return next(new ErrorResponse('Ce slot est vide, choisissez-en un autre', 400));
      }
    }

    gateAssignments = provided.map((a) => ({ tool: a.tool, gate: a.gate }));
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
    gateAssignments,
    slotSelectionOverridden,
    gcodeMode: pending.gcodeMode,
    history: [{ status: PRINT_JOB_STATUSES.QUEUED, date: new Date(), detail: 'Soumission acceptée' }],
  });
```

(the code from `// Verrou atomique : ...` onward, through the end of the function, is unchanged)

- [ ] **Step 4: Update `getNextJob`'s response**

In `server/src/controllers/print/agentController.js`, in `exports.getNextJob`, replace:

```js
      selectedGate: job.selectedGate,
```

with:

```js
      gateAssignments: job.gateAssignments,
```

- [ ] **Step 5: Update the agent-facing next-job test**

In `server/src/tests/functional/print/agent.test.js`, replace the two tests referencing `selectedGate`:

```js
  it('includes gateAssignments in the dispatched job payload when set on the job', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);
    await PrintJob.findByIdAndUpdate(job._id, { gateAssignments: [{ tool: null, gate: 2 }] });

    const res = await request(app)
      .get('/api/print/agent/next-job')
      .set(printerAuthHeader(printer._id, rawKey));

    expect(res.body.data.gateAssignments).toEqual([{ tool: null, gate: 2 }]);
  });

  it('reports gateAssignments as an empty array when not set on the job', async () => {
    const { printer, rawKey } = await createPrinter();
    await submitAcceptedJob(printer);

    const res = await request(app)
      .get('/api/print/agent/next-job')
      .set(printerAuthHeader(printer._id, rawKey));

    expect(res.body.data.gateAssignments).toEqual([]);
  });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd server && npx jest src/tests/functional/print/jobConfirm.test.js src/tests/functional/print/agent.test.js`
Expected: PASS (all tests in both files)

- [ ] **Step 7: Run the full backend suite**

Run: `cd server && npx jest`
Expected: PASS, no regressions anywhere.

- [ ] **Step 8: Commit**

```bash
git add server/src/controllers/print/jobController.js server/src/controllers/print/agentController.js server/src/tests/functional/print/jobConfirm.test.js server/src/tests/functional/print/agent.test.js
git commit -m "feat(print): confirmJob accepts per-tool gateAssignments instead of a single selectedGate"
```

---

### Task 6: Agent — `MoonrakerClient.set_ttg_map()`

**Files:**
- Modify: `printer-agent/agent/moonraker_client.py`
- Test: `printer-agent/tests/test_moonraker_client.py`

**Interfaces:**
- Produces: `MoonrakerClient.set_ttg_map(mapping: list[int]) -> None` — `POST /printer/gcode/script?script=MMU_TTG_MAP MAP=g0,g1,g2,g3`, raises `MoonrakerClientError` on any HTTP error or network failure. Task 7 calls this with a 4-length list built from `job["gateAssignments"]`.

- [ ] **Step 1: Write the failing tests**

Add to `printer-agent/tests/test_moonraker_client.py`, at the top of the file add the import:

```python
import urllib.parse
```

Then add the tests:

```python
def test_set_ttg_map_sends_mmu_ttg_map_script():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/printer/gcode/script", json={"result": "ok"})
        client.set_ttg_map([3, 1, 2, 3])
    query = urllib.parse.parse_qs(urllib.parse.urlparse(m.last_request.url).query)
    assert query["script"] == ["MMU_TTG_MAP MAP=3,1,2,3"]


def test_set_ttg_map_raises_on_network_error():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/printer/gcode/script", exc=requests.exceptions.ConnectTimeout)
        with pytest.raises(MoonrakerClientError):
            client.set_ttg_map([0, 1, 2, 3])


def test_set_ttg_map_raises_on_http_error():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/printer/gcode/script", status_code=500, text="internal error")
        with pytest.raises(MoonrakerClientError):
            client.set_ttg_map([0, 1, 2, 3])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd printer-agent && .venv/bin/pytest tests/test_moonraker_client.py -v -k set_ttg_map`
Expected: FAIL — `AttributeError: 'MoonrakerClient' object has no attribute 'set_ttg_map'`

- [ ] **Step 3: Implement**

In `printer-agent/agent/moonraker_client.py`, add after `get_mmu_status`:

```python
    def set_ttg_map(self, mapping):
        """Assigne la table tool→gate (MMU_TTG_MAP MAP=g0,g1,g2,g3) — appel séparé, envoyé
        AVANT upload_and_start_print, jamais comme contenu du fichier gcode : le pré-chargement
        automatique du firmware (patch_print_data/_auto_feed_at_print_start, voir spec
        2026-09-10, section spike) consulte l'état courant de ttg_map au moment de l'appel qui
        démarre l'impression, pas en lisant le gcode ligne par ligne — une commande MMU_TTG_MAP
        injectée en tête de fichier arriverait trop tard."""
        url = f"{self.base_url}/printer/gcode/script"
        script = f"MMU_TTG_MAP MAP={','.join(str(g) for g in mapping)}"
        try:
            response = requests.post(url, params={"script": script}, timeout=self.timeout)
        except requests.RequestException as exc:
            raise MoonrakerClientError(f"Moonraker injoignable (MMU_TTG_MAP): {exc}") from exc

        if response.status_code >= 400:
            raise MoonrakerClientError(
                f"Erreur Moonraker (MMU_TTG_MAP, HTTP {response.status_code}): {response.text}"
            )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd printer-agent && .venv/bin/pytest tests/test_moonraker_client.py -v`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add printer-agent/agent/moonraker_client.py printer-agent/tests/test_moonraker_client.py
git commit -m "feat(agent): add MoonrakerClient.set_ttg_map()"
```

---

### Task 7: Agent — dispatch reads `gateAssignments` instead of `selectedGate`

**Files:**
- Modify: `printer-agent/agent/main.py`
- Test: `printer-agent/tests/test_run_tick.py`

**Interfaces:**
- Consumes: `job["gateAssignments"]` from `hub.get_next_job()`'s return value (Task 5 changed this field's name and shape), `MoonrakerClient.set_ttg_map()` (Task 6).
- Produces: when dispatching a job whose `gateAssignments` has a single `{tool: null, gate}` entry, the downloaded gcode file gets a `Tn\n` line prepended (unchanged mechanism). When `gateAssignments` has one or more entries with a non-null `tool`, the agent calls `moonraker.set_ttg_map(mapping)` **before** `hub.download_job_file`/`moonraker.upload_and_start_print` — no file mutation in this case.

**Reminder (Global Constraints):** the `MMU_TTG_MAP`-as-separate-call mechanism is a new, unverified-on-real-hardware residual risk, same category as the original `Tn` injection. Implement and test it exactly as specified with mocks — do not attempt to validate it against real hardware as part of this task.

- [ ] **Step 1: Write the failing tests**

In `printer-agent/tests/test_run_tick.py`, replace the 5 existing tests `test_dispatch_injects_gate_selection_when_present`, `test_dispatch_does_not_inject_gate_when_absent`, `test_dispatch_fails_job_when_selected_gate_out_of_range`, `test_dispatch_fails_job_when_selected_gate_is_not_an_integer`, and `test_dispatch_does_not_inject_gate_when_explicitly_null` with:

```python
def test_dispatch_injects_gate_selection_for_a_mono_gate_assignment(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {
        "jobId": "job-1",
        "fileName": "a.gcode",
        "downloadUrl": "/x",
        "gateAssignments": [{"tool": None, "gate": 2}],
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
    moonraker.set_ttg_map.assert_not_called()


def test_dispatch_does_not_inject_or_map_when_gate_assignments_absent(tmp_path, logger):
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
    moonraker.set_ttg_map.assert_not_called()


def test_dispatch_does_not_inject_or_map_when_gate_assignments_empty(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {
        "jobId": "job-1",
        "fileName": "a.gcode",
        "downloadUrl": "/x",
        "gateAssignments": [],
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
    moonraker.set_ttg_map.assert_not_called()


def test_dispatch_calls_set_ttg_map_before_download_and_upload_for_multi_tool_assignment(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {
        "jobId": "job-1",
        "fileName": "a.gcode",
        "downloadUrl": "/x",
        "gateAssignments": [{"tool": "T0", "gate": 3}, {"tool": "T2", "gate": 1}],
    }

    call_order = []

    def fake_set_ttg_map(mapping):
        call_order.append(("set_ttg_map", mapping))

    def fake_download(job_id, dest_path):
        call_order.append(("download", None))
        with open(dest_path, "w") as f:
            f.write("G28\nT0\nG1 X10\nT2\nG1 X20\n")

    captured = {}

    def fake_upload(file_path, filename):
        call_order.append(("upload", None))
        with open(file_path, "r") as f:
            captured["content"] = f.read()

    moonraker = make_moonraker()
    moonraker.set_ttg_map.side_effect = fake_set_ttg_map
    hub.download_job_file.side_effect = fake_download
    moonraker.upload_and_start_print.side_effect = fake_upload

    run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    # ttg_map par défaut [0,1,2,3] ; T0 (index 0) -> gate 3, T2 (index 2) -> gate 1 : [3,1,1,3]
    assert call_order[0] == ("set_ttg_map", [3, 1, 1, 3])
    assert [c[0] for c in call_order[1:]] == ["download", "upload"]
    assert captured["content"] == "G28\nT0\nG1 X10\nT2\nG1 X20\n"


def test_dispatch_fails_job_when_gate_assignment_out_of_range(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {
        "jobId": "job-1",
        "fileName": "a.gcode",
        "downloadUrl": "/x",
        "gateAssignments": [{"tool": None, "gate": 4}],
    }
    moonraker = make_moonraker()

    run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    hub.download_job_file.assert_not_called()
    moonraker.upload_and_start_print.assert_not_called()
    hub.update_job_status.assert_called_once()
    args, kwargs = hub.update_job_status.call_args
    assert args[0] == "job-1"
    assert args[1] == "failed"
    assert "gate" in kwargs.get("error_message", "").lower()


def test_dispatch_fails_job_when_gate_assignment_gate_is_not_an_integer(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {
        "jobId": "job-1",
        "fileName": "a.gcode",
        "downloadUrl": "/x",
        "gateAssignments": [{"tool": None, "gate": "2\nM106 S255"}],
    }
    moonraker = make_moonraker()

    run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    hub.download_job_file.assert_not_called()
    moonraker.upload_and_start_print.assert_not_called()
    hub.update_job_status.assert_called_once()
    args, kwargs = hub.update_job_status.call_args
    assert args[1] == "failed"


def test_dispatch_fails_job_when_tool_is_invalid_in_a_multi_tool_assignment(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {
        "jobId": "job-1",
        "fileName": "a.gcode",
        "downloadUrl": "/x",
        "gateAssignments": [{"tool": "T9", "gate": 1}],
    }
    moonraker = make_moonraker()

    run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    hub.download_job_file.assert_not_called()
    moonraker.set_ttg_map.assert_not_called()
    moonraker.upload_and_start_print.assert_not_called()
    hub.update_job_status.assert_called_once()
    args, kwargs = hub.update_job_status.call_args
    assert args[1] == "failed"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd printer-agent && .venv/bin/pytest tests/test_run_tick.py -v -k "gate_assignment or gate_assignments"`
Expected: FAIL — `job.get("gateAssignments")` doesn't exist yet in `_try_dispatch`, `KeyError` on `job["selectedGate"]` no longer applies but the old code path doesn't know about `gateAssignments` at all yet, so behavior doesn't match any of the new assertions.

- [ ] **Step 3: Implement**

In `printer-agent/agent/main.py`, add `import re` to the top imports (alongside the existing `import os` etc.).

`_validate_selected_gate` is renamed to `_validate_gate` and its error messages generalized — it now validates a gate value both for the mono case AND for each entry while building a `ttg_map`, so "selectedGate" in its own error text would be stale/misleading. Replace the whole function:

```python
def _validate_selected_gate(gate):
    """Revalide selectedGate reçu du hub : un entier dans [MIN_ACE_GATE, MAX_ACE_GATE]. Même
    posture que file_name plus haut — ne jamais faire confiance à ce payload JSON avant de
    l'interpoler dans un fichier gcode exécuté par une vraie imprimante (borne alignée sur
    confirmJob côté hub, Task 4, qui restreint déjà selectedGate à un Number 0-3 avant
    persistance ; cette validation est une deuxième ligne de défense côté agent)."""
    if isinstance(gate, bool) or not isinstance(gate, int):
        raise ValueError(f"selectedGate doit être un entier, reçu: {gate!r}")
    if not (MIN_ACE_GATE <= gate <= MAX_ACE_GATE):
        raise ValueError(f"selectedGate hors plage [{MIN_ACE_GATE}-{MAX_ACE_GATE}]: {gate!r}")
    return gate
```

with:

```python
def _validate_gate(gate):
    """Valide un gate physique reçu du hub (via gateAssignments) : un entier dans
    [MIN_ACE_GATE, MAX_ACE_GATE]. Ne jamais faire confiance à ce payload JSON avant de
    l'interpoler dans un fichier gcode ou une commande Moonraker exécutée par une vraie
    imprimante (borne alignée sur confirmJob côté hub, qui restreint déjà chaque gate assigné à
    un Number 0-3 avant persistance ; cette validation est une deuxième ligne de défense côté
    agent)."""
    if isinstance(gate, bool) or not isinstance(gate, int):
        raise ValueError(f"gate doit être un entier, reçu: {gate!r}")
    if not (MIN_ACE_GATE <= gate <= MAX_ACE_GATE):
        raise ValueError(f"gate hors plage [{MIN_ACE_GATE}-{MAX_ACE_GATE}]: {gate!r}")
    return gate


def _validate_tool_index(tool):
    """Valide qu'un tool de gateAssignments est bien une chaîne 'T0'-'T3' — même posture que
    _validate_gate : ne jamais faire confiance à ce payload JSON avant de construire la table
    ttg_map envoyée à Moonraker."""
    if not isinstance(tool, str) or not re.fullmatch(r"T[0-3]", tool):
        raise ValueError(f"tool invalide dans gateAssignments: {tool!r}")
    return int(tool[1:])


def _resolve_gate_assignments(gate_assignments):
    """Traduit gateAssignments (reçu du hub, voir spec 2026-09-10) en soit un gate unique à
    injecter en tête de fichier (Tn, cas mono-matériau : une seule entrée à tool=null), soit une
    table complète tool→gate pour MMU_TTG_MAP (cas multi-couleur : au moins une entrée à tool
    non-null). Retourne (single_gate, ttg_map) où au plus un des deux est non-None. Une liste
    vide retourne (None, None) : rien à assigner (cas "soumis sans données bobines")."""
    if not gate_assignments:
        return None, None

    has_null_tool = any(a.get("tool") is None for a in gate_assignments)
    if has_null_tool:
        if len(gate_assignments) != 1:
            raise ValueError(f"gateAssignments avec tool=null doit contenir une seule entrée: {gate_assignments!r}")
        gate = _validate_gate(gate_assignments[0].get("gate"))
        return gate, None

    ttg_map = list(range(MAX_ACE_GATE + 1))
    for assignment in gate_assignments:
        tool_index = _validate_tool_index(assignment.get("tool"))
        gate = _validate_gate(assignment.get("gate"))
        ttg_map[tool_index] = gate
    return None, ttg_map
```

Also update the one remaining call site in `_inject_gate_selection` (unchanged otherwise), replacing:

```python
    gate = _validate_selected_gate(gate)
```

with:

```python
    gate = _validate_gate(gate)
```

In `_try_dispatch`, replace:

```python
    selected_gate = job.get("selectedGate")
    logger.info("Nouveau job détecté: %s (%s)", job_id, file_name)

    if selected_gate is not None:
        try:
            selected_gate = _validate_selected_gate(selected_gate)
        except ValueError as exc:
            logger.error("selectedGate invalide reçu du hub pour le job %s: %s", job_id, exc)
            try:
                hub.update_job_status(job_id, "failed", error_message=str(exc)[:500])
            except HubClientError as report_exc:
                logger.error(
                    "Échec du signalement de selectedGate invalide pour le job %s: %s",
                    job_id,
                    report_exc,
                )
            return state
```

with:

```python
    gate_assignments = job.get("gateAssignments") or []
    logger.info("Nouveau job détecté: %s (%s)", job_id, file_name)

    try:
        single_gate, ttg_map = _resolve_gate_assignments(gate_assignments)
    except ValueError as exc:
        logger.error("gateAssignments invalide reçu du hub pour le job %s: %s", job_id, exc)
        try:
            hub.update_job_status(job_id, "failed", error_message=str(exc)[:500])
        except HubClientError as report_exc:
            logger.error(
                "Échec du signalement de gateAssignments invalide pour le job %s: %s",
                job_id,
                report_exc,
            )
        return state
```

Then replace the dispatch try block:

```python
    dest_path = os.path.join(download_dir, file_name)
    try:
        hub.download_job_file(job_id, dest_path)
        if selected_gate is not None:
            _inject_gate_selection(dest_path, selected_gate)
        moonraker.upload_and_start_print(dest_path, file_name)
    except Exception as exc:
```

with:

```python
    dest_path = os.path.join(download_dir, file_name)
    try:
        if ttg_map is not None:
            moonraker.set_ttg_map(ttg_map)
        hub.download_job_file(job_id, dest_path)
        if single_gate is not None:
            _inject_gate_selection(dest_path, single_gate)
        moonraker.upload_and_start_print(dest_path, file_name)
    except Exception as exc:
```

(everything else in `_try_dispatch` — the `except`/`finally` blocks and beyond — is unchanged)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd printer-agent && .venv/bin/pytest tests/test_run_tick.py -v`
Expected: PASS (all tests, including the 7 new ones plus every pre-existing test)

- [ ] **Step 5: Run the full agent suite**

Run: `cd printer-agent && .venv/bin/pytest -v`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add printer-agent/agent/main.py printer-agent/tests/test_run_tick.py
git commit -m "feat(agent): dispatch per-tool gateAssignments via Tn injection or MMU_TTG_MAP"
```

**Residual risk reminder (Global Constraints):** the `MMU_TTG_MAP`-as-separate-call mechanism implemented in this task has not been validated against real ACE hardware — only unit-tested with mocks. Do not attempt to close this gap by testing against the production printer as part of this plan; that is a separate, supervised step.

---

### Task 8: Frontend — client-side spool-match utility

**Files:**
- Create: `client/src/utils/spoolMatch.js`

**Interfaces:**
- Produces: `normalizeColor(hex) -> string|null`, `computeGateMismatch(tool, slot) -> {expectedMaterial, expectedColor, actualMaterial, actualColor}|null`. Task 10 calls `computeGateMismatch` once per tool row, with the currently-selected slot for that tool.

**No automated test framework exists for the frontend.** Verify by careful self-review (trace every branch by hand against the test cases this ports from `server/src/tests/unit/spoolAnalysis.test.js`'s now-removed `computeSlotMismatches` suite, Task 4).

- [ ] **Step 1: Implement**

Create `client/src/utils/spoolMatch.js`:

```js
// Port client-side de la logique de comparaison qui vivait dans
// server/src/utils/spoolAnalysis.js (computeSlotMismatches/normalizeColor, retirée en Task 4 de
// ce plan) — nécessaire car le mismatch dépend maintenant du gate choisi interactivement par
// l'étudiant, recalculé à chaque clic, plutôt que figé une fois côté serveur à l'analyse. Pas de
// module partagé entre client/ et server/ dans ce repo, d'où la duplication assumée.

// Normalise un hex couleur venant de deux sources au format différent (slicer: "#RRGGBB",
// Moonraker/ACE: "RRGGBBAA" sans '#') vers une forme comparable : 6 caractères hex, minuscules,
// sans '#', sans canal alpha.
export function normalizeColor(hex) {
  if (!hex) return null;
  return hex.replace('#', '').toLowerCase().slice(0, 6);
}

// Compare la matière/couleur attendue par le slicer pour un tool à ce qui est réellement chargé
// dans le slot choisi pour ce tool. Retourne null si rien à comparer (ni matière ni couleur
// attendue — fichier multi-couleur sans commentaires slicer) ou si tout correspond ; sinon un
// objet décrivant l'écart pour affichage d'avertissement non-bloquant.
export function computeGateMismatch(tool, slot) {
  if (!tool.material && !tool.color) return null;

  const materialMismatch =
    !!tool.material && (!slot || (slot.material || '').toLowerCase() !== tool.material.toLowerCase());
  const colorMismatch = !!tool.color && (!slot || normalizeColor(slot.color) !== normalizeColor(tool.color));
  const isEmpty = !slot || slot.empty;

  if (!isEmpty && !materialMismatch && !colorMismatch) return null;

  return {
    expectedMaterial: tool.material,
    expectedColor: tool.color,
    actualMaterial: slot && !slot.empty ? slot.material || null : null,
    actualColor: slot && !slot.empty ? slot.color || null : null,
  };
}
```

- [ ] **Step 2: Self-review**

Trace by hand against these cases (ported from the removed server-side test suite):
- `computeGateMismatch({material: 'pla', color: '#212721'}, {material: 'PLA', color: '212721FF', empty: false})` → `null` (case/format-insensitive match).
- `computeGateMismatch({material: 'PETG', color: '#F40031'}, {material: 'PLA', color: 'F40031FF', empty: false})` → non-null, `actualMaterial: 'PLA'` (material mismatch, color matches).
- `computeGateMismatch({material: 'PLA', color: '#212721'}, undefined)` → non-null, `actualMaterial: null` (no slot / empty gate).
- `computeGateMismatch({material: null, color: null}, {material: 'PLA', color: '212721FF', empty: false})` → `null` (nothing to compare, per the `!tool.material && !tool.color` guard).

Confirm no import of anything from `server/` — this file must be fully standalone (the client and server are separate deployable bundles in this repo, `require`/`import` across that boundary doesn't work).

- [ ] **Step 3: Commit**

```bash
git add client/src/utils/spoolMatch.js
git commit -m "feat(print): add client-side spool color/material match utility"
```

---

### Task 9: Frontend — `GatePicker` component

**Files:**
- Create: `client/src/components/ui/GatePicker.js`

**Interfaces:**
- Produces: `<GatePicker slots={printer.spoolSlots} value={selectedGateOrUndefined} onChange={(gate) => ...} onManualDeclare={async (gate, {material, color}) => ...} />`. Task 10 renders one instance per detected tool.
- Consumes: `Button`, `Modal`, `Input` (already exist, `client/src/components/ui/`), `cn` (`client/src/lib/cn.js`).

**No automated test framework exists for the frontend.** Verify by careful self-review.

- [ ] **Step 1: Implement**

Create `client/src/components/ui/GatePicker.js`:

```jsx
// Cartes cliquables pour choisir un gate ACE physique — remplace le <Select> natif utilisé
// jusqu'ici : affiche une vraie pastille de couleur (à partir du hex rapporté par l'agent) pour
// que l'étudiant repère visuellement la bonne bobine plutôt que par nom de matière seul. Voir
// spec 2026-09-10.
import { useState } from 'react';
import Button from './Button';
import Modal from './Modal';
import Input from './Input';
import { cn } from '../../lib/cn';

const GATE_LABELS = ['Slot 1', 'Slot 2', 'Slot 3', 'Slot 4'];

const swatchColor = (hex) => (hex ? `#${hex.replace('#', '').slice(0, 6)}` : 'transparent');

export default function GatePicker({ slots, value, onChange, onManualDeclare }) {
  const [editingGate, setEditingGate] = useState(null);
  const [editMaterial, setEditMaterial] = useState('');
  const [editColor, setEditColor] = useState('#808080');
  const [saving, setSaving] = useState(false);

  const openEdit = (slot) => {
    setEditingGate(slot.gate);
    setEditMaterial(slot.material || '');
    setEditColor(slot.color ? swatchColor(slot.color) : '#808080');
  };

  const closeEdit = () => setEditingGate(null);

  const handleSave = async () => {
    if (!editMaterial.trim()) return;
    setSaving(true);
    try {
      await onManualDeclare(editingGate, { material: editMaterial.trim(), color: editColor });
      closeEdit();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {slots.map((slot) => (
          <div
            key={slot.gate}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-md border px-2 py-3',
              value === slot.gate ? 'border-primary ring-2 ring-primary/30' : 'border-border'
            )}
          >
            <button
              type="button"
              onClick={() => onChange(slot.gate)}
              disabled={slot.empty}
              className="flex flex-col items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span
                className="h-6 w-6 rounded-full border border-border"
                style={{ backgroundColor: swatchColor(slot.color) }}
                aria-hidden="true"
              />
              <span className="text-xs font-medium text-text">
                {GATE_LABELS[slot.gate] || `Slot ${slot.gate + 1}`}
              </span>
              <span className="text-xs text-text-muted">
                {slot.empty ? 'Vide' : slot.material || 'Matière inconnue'}
              </span>
            </button>
            {slot.source === 'manual' && (
              <span className="text-[10px] text-text-dim">déclaré manuellement</span>
            )}
            <button type="button" onClick={() => openEdit(slot)} className="text-[10px] text-primary underline">
              Déclarer manuellement
            </button>
          </div>
        ))}
      </div>

      <Modal
        open={editingGate !== null}
        onClose={closeEdit}
        title={`Déclarer le contenu — ${GATE_LABELS[editingGate] || `Slot ${(editingGate ?? 0) + 1}`}`}
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="subtle" onClick={closeEdit} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={saving || !editMaterial.trim()}>
              Enregistrer
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block mb-2 font-medium text-text">Matière</label>
            <Input value={editMaterial} onChange={(e) => setEditMaterial(e.target.value)} placeholder="PLA, PETG..." />
          </div>
          <div>
            <label className="block mb-2 font-medium text-text">Couleur</label>
            <input
              type="color"
              value={editColor}
              onChange={(e) => setEditColor(e.target.value)}
              className="h-10 w-full rounded-md border border-border cursor-pointer"
            />
          </div>
          <p className="text-xs text-text-muted">
            Utile pour une bobine générique sans puce RFID, que l&apos;imprimante ne peut pas détecter
            automatiquement. Cette déclaration sera automatiquement remplacée dès qu&apos;une détection
            automatique différente est rapportée.
          </p>
        </div>
      </Modal>
    </>
  );
}
```

- [ ] **Step 2: Self-review**

- Confirm no `<button>` is nested inside another `<button>` (invalid HTML) — the card is a `<div>`, with two sibling `<button>` elements inside it (select, declare-manually), never one inside the other.
- Confirm `onChange` is never called for an `empty` slot (the `disabled` attribute on the select button already prevents the click handler from firing — no separate guard needed in `onChange` itself).
- Confirm `Modal`'s `open` prop correctly closes when `editingGate` is `null` (gate `0` is falsy-but-valid in JS — the code uses `editingGate !== null`, not a truthiness check, so gate 0 opens the modal correctly).
- Confirm `Input`/`Modal`/`Button` props used here (`value`, `onChange`, `placeholder`, `open`, `onClose`, `title`, `size`, `footer`, `variant`, `loading`, `disabled`) all match their actual component signatures (cross-checked against `client/src/components/ui/Input.js`, `Modal.js`, `Button.js` while writing this plan).

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ui/GatePicker.js
git commit -m "feat(print): add GatePicker component with real color swatches"
```

---

### Task 10: Frontend — `client/src/pages/print/index.js` rework

**Files:**
- Modify: `client/src/pages/print/index.js`

**Interfaces:**
- Consumes: `POST /jobs/analyze`, `POST /jobs/:pendingUploadId/confirm` (Tasks 4-5, body now `{gateAssignments}`), `PUT /printers/:id/spool-slots/:gate/manual` (Task 3), `GatePicker` (Task 9), `computeGateMismatch` (Task 8).

**No automated test framework exists for this file.** Verify by careful self-review, same approach as the original spool-selection feature's frontend task.

- [ ] **Step 1: Update imports and remove the now-unused `GATE_LABELS` constant**

Remove the `Select` import is NOT needed — `Select` stays (still used for the printer-choice dropdown at the top of the form). Remove the `GATE_LABELS` constant (moved into `GatePicker`, Task 9):

```js
const GATE_LABELS = ['Slot 1', 'Slot 2', 'Slot 3', 'Slot 4'];
```

Add imports:

```js
import GatePicker from '../../components/ui/GatePicker';
import { computeGateMismatch } from '../../utils/spoolMatch';
```

- [ ] **Step 2: Replace state**

Replace:

```js
  const [selectedGate, setSelectedGate] = useState('');
```

with:

```js
  const [gateAssignments, setGateAssignments] = useState({});
```

Update `const { get, post } = useApi();` to also destructure `put`:

```js
  const { get, post, put } = useApi();
```

- [ ] **Step 3: Update `handleAnalyze`, `resetPendingUpload`, add `gateKey`/`setGateForTool`/`handleManualDeclare`/`refreshPendingSlots`**

Replace:

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
```

with:

```js
  // Une seule entrée à tool=null pour un fichier sans aucune commande Tx (cas "toute
  // l'impression"), sinon une entrée par tool détecté par le backend (expectedTools).
  const gateKey = (tool) => tool ?? '_single';

  const toolsToAssign = pendingUpload
    ? pendingUpload.mode === 'single'
      ? [{ tool: null, material: null, color: null }]
      : pendingUpload.expectedTools
    : [];

  const allToolsAssigned = toolsToAssign.every((t) => gateAssignments[gateKey(t.tool)] !== undefined);

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
      setGateAssignments({});
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const resetPendingUpload = () => {
    setPendingUpload(null);
    setGateAssignments({});
    setFile(null);
    setFileInputKey((k) => k + 1);
  };

  const setGateForTool = (tool, gate) =>
    setGateAssignments((prev) => ({ ...prev, [gateKey(tool)]: gate }));

  const refreshPendingSlots = async () => {
    if (!pendingUpload) return;
    try {
      const res = await get('/api/print/printers');
      const printer = res.data.find((p) => p._id === selectedPrinterId);
      if (printer) {
        setPendingUpload((prev) =>
          prev ? { ...prev, slots: printer.spoolSlots, spoolSlotsUpdatedAt: printer.spoolSlotsUpdatedAt } : prev
        );
      }
    } catch {
      // Un rafraîchissement périodique raté n'est pas une erreur à signaler à l'étudiant.
    }
  };

  const handleManualDeclare = async (gate, { material, color }) => {
    try {
      await put(`/api/print/printers/${selectedPrinterId}/spool-slots/${gate}/manual`, { material, color });
      await refreshPendingSlots();
      toast.success('Bobine déclarée');
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  };

  useEffect(() => {
    if (!pendingUpload) return undefined;
    const interval = setInterval(refreshPendingSlots, 12000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUpload?.pendingUploadId]);
```

- [ ] **Step 4: Update `handleConfirm`**

Replace:

```js
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
```

with:

```js
  const handleConfirm = () => {
    if (!allToolsAssigned) {
      toast.error('Choisissez une bobine pour chaque tool détecté');
      return;
    }
    const assignments = toolsToAssign.map((t) => ({ tool: t.tool, gate: gateAssignments[gateKey(t.tool)] }));
    confirmPendingUpload({ gateAssignments: assignments });
  };
```

- [ ] **Step 5: Replace the pending-upload JSX**

Replace the entire block from `) : pendingUpload.mode === 'single' ? (` through the matching `)}` that closes the `!pendingUpload` ternary (i.e. everything between the upload `<form>` and the closing of the outer `{accessStatus?.authorized === true && (...)}` `<Card>`) with:

```jsx
            ) : !pendingUpload.spoolSlotsUpdatedAt ? (
              <div className="space-y-4">
                <p className="text-sm text-danger">
                  Données bobines indisponibles pour cette imprimante — impossible de savoir ce qui est
                  chargé dans chaque slot.
                </p>
                <Button variant="danger" size="sm" onClick={() => setShowOverrideModal(true)}>
                  Soumettre quand même
                </Button>
                <div>
                  <Button variant="subtle" onClick={resetPendingUpload} disabled={confirming}>
                    Retour
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <p className="text-sm text-text-muted">
                  {pendingUpload.mode === 'single'
                    ? 'Choisissez la bobine à utiliser pour cette impression.'
                    : 'Assignez une bobine à chaque couleur détectée dans le fichier.'}
                </p>

                {pendingUpload.slots.length > 0 && pendingUpload.slots.every((s) => s.empty) && (
                  <p className="text-sm text-danger">
                    Toutes les bobines sont signalées vides — vérifiez physiquement l&apos;imprimante.
                  </p>
                )}

                {toolsToAssign.map((tool) => {
                  const chosenGate = gateAssignments[gateKey(tool.tool)];
                  const chosenSlot = pendingUpload.slots.find((s) => s.gate === chosenGate);
                  const mismatch = chosenGate !== undefined ? computeGateMismatch(tool, chosenSlot) : null;

                  return (
                    <div key={gateKey(tool.tool)} className="space-y-2">
                      {tool.tool && (
                        <p className="text-sm font-medium text-text">
                          {tool.tool}
                          {tool.material && ` — attendu : ${tool.material}`}
                          {tool.color && (
                            <span
                              className="inline-block h-3 w-3 rounded-full align-middle ml-2 border border-border"
                              style={{ backgroundColor: `#${tool.color.replace('#', '')}` }}
                            />
                          )}
                        </p>
                      )}
                      <GatePicker
                        slots={pendingUpload.slots}
                        value={chosenGate}
                        onChange={(gate) => setGateForTool(tool.tool, gate)}
                        onManualDeclare={handleManualDeclare}
                      />
                      {mismatch && (
                        <p className="text-sm text-danger">
                          Attention : la bobine choisie ({mismatch.actualMaterial || 'inconnue'}) ne correspond
                          pas à ce que le fichier attend ({mismatch.expectedMaterial || '?'}).
                        </p>
                      )}
                    </div>
                  );
                })}

                <div className="flex gap-3">
                  <Button variant="subtle" onClick={resetPendingUpload} disabled={confirming}>
                    Retour
                  </Button>
                  <Button onClick={handleConfirm} loading={confirming} disabled={confirming || !allToolsAssigned}>
                    Confirmer et soumettre
                  </Button>
                </div>
              </div>
            )}
```

- [ ] **Step 6: Self-review**

- Confirm the three-way conditional (`!pendingUpload` / `!pendingUpload.spoolSlotsUpdatedAt` / the assignment view) is exhaustive and non-overlapping, tracing each branch by hand.
- Confirm `resetPendingUpload` clears `gateAssignments`, `file`, and `fileInputKey` — a fresh upload after "Retour" starts from a clean slate.
- Confirm `handleManualDeclare` re-throws after showing the toast (so `GatePicker`'s `handleSave` doesn't close its modal on a failed save — check `GatePicker.js`'s `handleSave`: it calls `closeEdit()` only after `await onManualDeclare(...)` resolves without throwing, so the re-throw here is required for that error path to work).
- Confirm the polling `useEffect`'s cleanup (`clearInterval`) fires when `pendingUpload` becomes `null` (component re-renders, effect dependency `pendingUpload?.pendingUploadId` changes to `undefined`, effect cleanup runs, no interval leaks after "Retour" or after a successful confirm).
- Confirm `allToolsAssigned` is recomputed on every render from `gateAssignments` state (not memoized/stale) — it's a plain `const` computed inline in the function body, so this is automatic.
- Confirm the override modal (`showOverrideModal`) and its handlers are untouched by this task — they still work exactly as before, since `overrideNoSpoolData` confirms with `gateAssignments: []` implicitly (the backend sets it, not the frontend — `handleConfirmOverride` still calls `confirmPendingUpload({ overrideNoSpoolData: true })` unchanged).
- Confirm no remaining reference to `selectedGate`, `pendingUpload.mismatches`, or `pendingUpload.expectedTools.find(...)`-style old multi-material-only logic remains anywhere in the file.

Do NOT run `npm run dev`/`next build`/`next lint` on this machine (Node 25 breaks Next.js 12 outside Docker).

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/print/index.js
git commit -m "feat(print): unify gate assignment UI across mono and multi-color gcode files"
```

---

### Task 11: Frontend — admin print log displays `gateAssignments`

**Files:**
- Modify: `client/src/pages/admin/print/index.js`

**Interfaces:**
- Consumes: `PrintJob.gateAssignments`/`slotSelectionOverridden`/`gcodeMode` (Tasks 1 and 5). `slotMismatchWarnings` no longer exists.

**No automated test framework exists for this file.** Verify by careful self-review.

- [ ] **Step 1: Replace the spool-selection display block**

Replace:

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

with:

```jsx
                      {job.gcodeMode && (
                        <p className="text-xs text-text-muted">
                          {job.slotSelectionOverridden
                            ? 'Bobine : non spécifiée (soumis sans données bobines)'
                            : job.gateAssignments?.length > 0
                            ? `Bobine${job.gateAssignments.length > 1 ? 's' : ''} : ${job.gateAssignments
                                .map(
                                  (a) =>
                                    `${a.tool ? `${a.tool}→` : ''}${GATE_LABELS[a.gate] ?? `Slot ${a.gate + 1}`}`
                                )
                                .join(', ')}`
                            : null}
                        </p>
                      )}
```

- [ ] **Step 2: Self-review**

- Confirm this still reads directly from the `jobs` array already fetched by `refresh()` (`GET /api/print/jobs`) — no new API call needed.
- Confirm the conditional never crashes on an older job created before this v2 (`gcodeMode: null`, `gateAssignments: undefined` on a job predating Task 1's migration — though since this feature was never deployed to production, per the spec, there should be no such legacy documents in practice; the `job.gateAssignments?.length > 0` optional-chaining guard handles it defensively regardless).
- Confirm `GATE_LABELS` (already defined earlier in this file, unchanged) still resolves gate numbers to `Slot N` labels correctly.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/admin/print/index.js
git commit -m "feat(print): show per-tool gate assignments in the admin print job log"
```

---

## Self-Review

**Spec coverage:**
- `gateAssignments` unifying mono/multi data model → Task 1.
- `MMU_TTG_MAP` as a separate pre-print Moonraker call, never file-embedded → Tasks 6-7.
- Zero-Tx case unchanged (`Tn` injection) → Task 7 (explicitly preserves the existing path).
- Mandatory per-tool assignment before confirm → Task 5.
- Manual gate declaration (any authorized student + admin), drift-detection heuristic → Tasks 2-3.
- Visual `GatePicker` with real color swatches, used for both mono and multi cases → Tasks 9-10.
- Client-side mismatch computation (server-side removed) → Tasks 4, 8, 10.
- Periodic refresh (~10-15s, chose 12s) while the picker is open → Task 10.
- Admin log reflects `gateAssignments` → Task 11.
- Residual risk (untested `MMU_TTG_MAP` mechanism) flagged in Global Constraints and re-flagged at the end of Task 7.

**Placeholder scan:** none — every step has literal code; self-review steps ask concrete yes/no questions rather than "test it".

**Type/name consistency checked across tasks:**
- `gateAssignments: [{tool, gate}]` — identical shape in `PrintJob` schema (Task 1), `confirmJob`'s validation/construction (Task 5), `getNextJob`'s response (Task 5), the Python agent's `_resolve_gate_assignments` (Task 7), and the frontend's confirm body (Task 10).
- `Printer.spoolSlots[]` shape `{gate, material, color, empty, source, manualSetBy, manualSetAt, autoMaterialAtSet, autoColorAtSet, autoEmptyAtSet}` — identical across Task 1 (schema), Task 2 (`mergeSpoolSlots`), Task 3 (manual endpoint), Task 9-10 (frontend `GatePicker` reads `source`/`material`/`color`/`empty`/`gate`).
- `mergeSpoolSlots(existingSlots, reportedGates)` (Task 2) signature matches its only call site in Task 2's own `reportSpoolStatus` update.
- `set_ttg_map(mapping)` (Task 6) signature matches its call site in Task 7's `_try_dispatch`.
- `computeGateMismatch(tool, slot)` (Task 8) signature matches its call site in Task 10.
- `MAX_ACE_GATE` (already defined in `printer-agent/agent/main.py`, unchanged) reused by Task 7's `_resolve_gate_assignments` for the default `ttg_map` length — not redefined.
- `_validate_selected_gate` renamed to `_validate_gate` in Task 7 (its error text said "selectedGate" even though it's now called from `_resolve_gate_assignments` for arbitrary per-tool gate values, not just the mono `selectedGate` field) — all three call sites (`_inject_gate_selection`, and the two new ones in `_resolve_gate_assignments`) use the new name consistently.

**Self-review catches fixed while drafting this plan:**
- Task 7's `test_dispatch_calls_set_ttg_map_before_download_and_upload_for_multi_tool_assignment` originally asserted the wrong `ttg_map` array (`[3, 1, 2, 3]`); hand-traced the construction (`[0,1,2,3]` identity, then `T0→3` and `T2→1` applied in order) and corrected it to `[3, 1, 1, 3]`.
- Task 3's `setManualSpoolSlot` originally checked gate-existence (404) before the whitelist/admin permission check (403); reordered to check permission first, matching `confirmJob`'s existing precedent of checking ownership/permission before resource-existence.
