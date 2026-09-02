# Intégration imprimantes 3D — Backend + Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Hub-side API, data model, and web UI for submitting 3D print jobs to whitelisted students, with automatic per-user authorization, printer state tracking (busy/offline/error/disabled), and physical plate-clearance confirmation via QR code.

**Architecture:** Express/Mongoose backend under `/api/print/*` (printer + whitelist + job CRUD for students/admins, plus a printer-API-key-authenticated surface for the future printer agent) and Next.js pages for students, admins, and the QR clearance flow. The printer agent itself (the script that will actually run on each Kobra 3 via Rinkhals) is **out of scope for this plan** — it is a separate, hardware-dependent plan written after a spike confirms the Rinkhals runtime. This plan builds and tests the full API surface the agent will eventually call, using the same functional-test harness (supertest + mongodb-memory-server) already in the repo, so the agent's future plan only has to consume a working, tested API.

**Tech Stack:** Node/Express/Mongoose (existing), Jest + Supertest + mongodb-memory-server (existing test harness), Next.js 12 pages router + Tailwind (existing), new dependency `qrcode` (npm, MIT) for server-side QR PNG generation. No new frontend test framework — this repo has none for `client/`; frontend tasks are verified by running the dev server and checking the browser, per project convention.

**Spec:** `docs/superpowers/specs/2026-09-02-integration-imprimantes-3d-design.md` — this plan implements the "Modèle de données", "Workflow détaillé", "Libération du plateau", "Journalisation des états imprimante", and "Gestion des erreurs et cas limites" sections. The printer-agent side of "Dispatch"/"Exécution" (the actual script running on the Kobra 3) is deferred to a follow-up plan.

## Global Constraints

- Response shape for all new endpoints follows the existing convention: `{ success: true, data: ... }` / `{ success: true, count, data: [...] }` on success, and errors are raised via `ErrorResponse(message, statusCode)` caught by the existing global `errorHandler` middleware (never hand-roll `res.status().json({error...})` in a controller — always `next(new ErrorResponse(...))`).
- All new async controller functions are wrapped in the existing `asyncHandler` from `server/src/middleware/asyncHandler.js`.
- All new Mongoose enums live in `server/src/utils/constants.js`, matching the existing `PROJECT_STATUSES`/`SIMULATED_STATUSES` pattern (plain object exported, referenced via `Object.values(...)` in schemas).
- All new functional tests use `supertest` against the exported `app` from `server/src/app.js`, `mongodb-memory-server` via the existing `server/src/tests/setup.js` (already wired into `jest.config.js`, nothing to change there), and the existing `createUser`/`createAdmin`/`authHeader` helpers from `server/src/tests/helpers/auth.js`.
- Whitelist policy is default-deny: an email with no `PrintAuthorization` document, or `authorized: false`, is rejected. Never invert this.
- A printer becomes unavailable for new submissions in exactly four cases, each with its own `rejectionReason`: `printer_busy` (`status !== 'idle'` because it's actively holding a job), `printer_offline` (heartbeat timeout), `printer_error` (agent-reported hardware error), `printer_disabled` (admin action). Never collapse these into one generic "unavailable" reason — the whole point of this feature is precise logging.
- Never expose the raw gcode file publicly/statically — unlike `/uploads/simulated-subjects` (public PDFs), print job files are only ever streamed through an authenticated endpoint.

---

## File Structure

**Backend — new files:**
- `server/src/models/Printer.js` — printer state machine + status/clearance history
- `server/src/models/PrintAuthorization.js` — nominative whitelist
- `server/src/models/PrintJob.js` — one print job per submission
- `server/src/utils/apiKey.js` — random key generation + SHA-256 hashing (shared by printer creation and the auth middleware)
- `server/src/middleware/printerAuth.js` — authenticates the (future) printer agent via API key, also records heartbeat + handles offline→reconnection transition
- `server/src/middleware/printJobUpload.js` — multer config for `.gcode` uploads (separate from the existing PDF-only `upload.js`)
- `server/src/controllers/print/printerController.js` — printer CRUD, disable/enable, QR generation, clearance confirmation
- `server/src/controllers/print/whitelistController.js` — whitelist CRUD
- `server/src/controllers/print/jobController.js` — student submission + job listing
- `server/src/controllers/print/agentController.js` — next-job dispatch, file download, status updates (consumed by the future agent, but fully built and tested now)
- `server/src/routes/printPrinters.js`, `server/src/routes/printWhitelist.js`, `server/src/routes/printJobs.js`, `server/src/routes/printAgent.js`
- `server/src/utils/printerScheduler.js` — periodic offline/staleness detection

**Backend — modified files:**
- `server/src/utils/constants.js` — add `PRINTER_STATUSES`, `PRINT_JOB_STATUSES`, `PRINT_REJECTION_REASONS`, `PRINTER_STATUS_SOURCES`, `CLEARANCE_METHODS`
- `server/src/app.js` — mount the four new routers
- `server/src/index.js` — start the printer scheduler after `connectDB()`

**Backend — new test files:**
- `server/src/tests/helpers/print.js` — `createPrinter`, `whitelistEmail`, `printerAuthHeader` fixtures
- `server/src/tests/functional/print/printers.test.js`
- `server/src/tests/functional/print/whitelist.test.js`
- `server/src/tests/functional/print/jobs.test.js`
- `server/src/tests/functional/print/agent.test.js`
- `server/src/tests/functional/print/clearance.test.js`
- `server/src/tests/unit/printerScheduler.test.js`

**Frontend — new files:**
- `client/src/pages/print/index.js` — student page: pick a printer, submit a job, see own history
- `client/src/pages/print/printers/[id]/confirm-clearance.js` — QR landing page
- `client/src/pages/admin/print/index.js` — admin dashboard: printers, whitelist, job log
- `client/src/pages/admin/print/printers/[id]/qr.js` — printable QR view for one printer

---

## Task 1: `Printer` model

**Files:**
- Modify: `server/src/utils/constants.js`
- Create: `server/src/models/Printer.js`
- Test: `server/src/tests/unit/printerModel.test.js`

**Interfaces:**
- Produces: `Printer` mongoose model with fields `name, model, apiKeyHash, status, currentJob, lastSeenAt, lastKnownStatus, clearanceHistory[], statusHistory[]`; `PRINTER_STATUSES`, `PRINTER_STATUS_SOURCES`, `CLEARANCE_METHODS` constants.

- [ ] **Step 1: Add the new constants**

Append to `server/src/utils/constants.js` (after the existing `LOAN_STATUS` block, before `module.exports`):

```js
// Statuts pour les imprimantes 3D
const PRINTER_STATUSES = {
  IDLE: 'idle',
  PRINTING: 'printing',
  AWAITING_CLEARANCE: 'awaiting_clearance',
  OFFLINE: 'offline',
  ERROR: 'error',
  DISABLED: 'disabled',
};

// Source d'une entrée de statusHistory imprimante
const PRINTER_STATUS_SOURCES = {
  AGENT_REPORT: 'agent_report',
  ADMIN_ACTION: 'admin_action',
  HEARTBEAT_TIMEOUT: 'heartbeat_timeout',
};

// Méthode de validation de la libération du plateau
const CLEARANCE_METHODS = {
  QR: 'qr',
  ADMIN_OVERRIDE: 'admin_override',
};
```

Add them to the `module.exports` object at the bottom of the file (keep every existing key, just add these three).

- [ ] **Step 2: Write the failing model test**

```js
// server/src/tests/unit/printerModel.test.js
const Printer = require('../../models/Printer');
const { PRINTER_STATUSES } = require('../../utils/constants');

describe('Printer model', () => {
  it('defaults to idle status and empty history arrays', async () => {
    const printer = await Printer.create({
      name: 'Kobra 3 - Atelier A',
      model: 'kobra3',
      apiKeyHash: 'x'.repeat(64),
    });

    expect(printer.status).toBe(PRINTER_STATUSES.IDLE);
    expect(printer.currentJob).toBeNull();
    expect(printer.clearanceHistory).toEqual([]);
    expect(printer.statusHistory).toEqual([]);
  });

  it('rejects an invalid model value', async () => {
    await expect(
      Printer.create({ name: 'X', model: 'not-a-real-model', apiKeyHash: 'x'.repeat(64) })
    ).rejects.toThrow();
  });

  it('rejects an invalid status value', async () => {
    await expect(
      Printer.create({ name: 'X', model: 'kobra3', apiKeyHash: 'x'.repeat(64), status: 'nonsense' })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd server && npx jest tests/unit/printerModel.test.js`
Expected: FAIL — `Cannot find module '../../models/Printer'`

- [ ] **Step 4: Create the model**

```js
// server/src/models/Printer.js
const mongoose = require('mongoose');
const { PRINTER_STATUSES, PRINTER_STATUS_SOURCES, CLEARANCE_METHODS } = require('../utils/constants');

const PrinterSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  model: { type: String, required: true, enum: ['kobra3', 'kobra3max'] },
  apiKeyHash: { type: String, required: true },
  status: {
    type: String,
    enum: Object.values(PRINTER_STATUSES),
    default: PRINTER_STATUSES.IDLE,
  },
  currentJob: { type: mongoose.Schema.Types.ObjectId, ref: 'PrintJob', default: null },
  lastSeenAt: { type: Date, default: null },
  lastKnownStatus: {
    type: String,
    enum: Object.values(PRINTER_STATUSES),
    default: PRINTER_STATUSES.IDLE,
  },
  clearanceHistory: {
    type: [
      {
        method: { type: String, enum: Object.values(CLEARANCE_METHODS) },
        byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        byEmail: String,
        byName: String,
        date: { type: Date, default: Date.now },
      },
    ],
    default: [],
  },
  statusHistory: {
    type: [
      {
        status: { type: String, enum: Object.values(PRINTER_STATUSES) },
        source: { type: String, enum: Object.values(PRINTER_STATUS_SOURCES) },
        detail: String,
        byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        byName: String,
        date: { type: Date, default: Date.now },
      },
    ],
    default: [],
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Printer', PrinterSchema);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx jest tests/unit/printerModel.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add server/src/utils/constants.js server/src/models/Printer.js server/src/tests/unit/printerModel.test.js
git commit -m "feat(print): add Printer model with status/clearance history"
```

---

## Task 2: `PrintAuthorization` model (whitelist)

**Files:**
- Create: `server/src/models/PrintAuthorization.js`
- Test: `server/src/tests/unit/printAuthorizationModel.test.js`

**Interfaces:**
- Produces: `PrintAuthorization` model, unique index on lowercased `email`, `authorized: Boolean`, `history[]`.

- [ ] **Step 1: Write the failing test**

```js
// server/src/tests/unit/printAuthorizationModel.test.js
const PrintAuthorization = require('../../models/PrintAuthorization');

describe('PrintAuthorization model', () => {
  it('lowercases and trims the email on save', async () => {
    const doc = await PrintAuthorization.create({ email: '  Foo@Epitech.EU  ', authorized: true });
    expect(doc.email).toBe('foo@epitech.eu');
  });

  it('enforces a unique email', async () => {
    await PrintAuthorization.create({ email: 'dup@epitech.eu', authorized: true });
    await expect(
      PrintAuthorization.create({ email: 'dup@epitech.eu', authorized: false })
    ).rejects.toThrow();
  });

  it('defaults authorized to false', async () => {
    const doc = await PrintAuthorization.create({ email: 'x@epitech.eu' });
    expect(doc.authorized).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx jest tests/unit/printAuthorizationModel.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Create the model**

```js
// server/src/models/PrintAuthorization.js
const mongoose = require('mongoose');

const PrintAuthorizationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  authorized: { type: Boolean, default: false },
  history: {
    type: [
      {
        authorized: Boolean,
        byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        byName: String,
        date: { type: Date, default: Date.now },
        note: String,
      },
    ],
    default: [],
  },
});

module.exports = mongoose.model('PrintAuthorization', PrintAuthorizationSchema);
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npx jest tests/unit/printAuthorizationModel.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/models/PrintAuthorization.js server/src/tests/unit/printAuthorizationModel.test.js
git commit -m "feat(print): add PrintAuthorization (whitelist) model"
```

---

## Task 3: `PrintJob` model

**Files:**
- Modify: `server/src/utils/constants.js`
- Create: `server/src/models/PrintJob.js`
- Test: `server/src/tests/unit/printJobModel.test.js`

**Interfaces:**
- Consumes: `Printer` model (Task 1) for the `printer` ref.
- Produces: `PrintJob` model with `student, printer, fileName, filePath, status, rejectionReason, errorMessage, submittedAt, startedAt, completedAt, history[]`; `PRINT_JOB_STATUSES`, `PRINT_REJECTION_REASONS` constants.

- [ ] **Step 1: Add the new constants**

Append to `server/src/utils/constants.js`, next to the `PRINTER_*` block from Task 1:

```js
// Statuts d'un job d'impression
const PRINT_JOB_STATUSES = {
  REJECTED: 'rejected',
  QUEUED: 'queued',
  SENT: 'sent',
  PRINTING: 'printing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

// Raison de refus d'une soumission
const PRINT_REJECTION_REASONS = {
  NOT_AUTHORIZED: 'not_authorized',
  PRINTER_BUSY: 'printer_busy',
  PRINTER_OFFLINE: 'printer_offline',
  PRINTER_ERROR: 'printer_error',
  PRINTER_DISABLED: 'printer_disabled',
};
```

Add both to `module.exports`.

- [ ] **Step 2: Write the failing test**

```js
// server/src/tests/unit/printJobModel.test.js
const mongoose = require('mongoose');
const PrintJob = require('../../models/PrintJob');
const Printer = require('../../models/Printer');
const { PRINT_JOB_STATUSES } = require('../../utils/constants');

describe('PrintJob model', () => {
  it('defaults to queued status', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'Student' },
      printer: printer._id,
      fileName: 'part.gcode',
      filePath: '/uploads/print-jobs/1-part.gcode',
    });
    expect(job.status).toBe(PRINT_JOB_STATUSES.QUEUED);
    expect(job.history).toEqual([]);
  });

  it('rejects an invalid status', async () => {
    await expect(
      PrintJob.create({
        student: { email: 's@epitech.eu', name: 'Student' },
        printer: new mongoose.Types.ObjectId(),
        fileName: 'part.gcode',
        filePath: '/x',
        status: 'nonsense',
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd server && npx jest tests/unit/printJobModel.test.js`
Expected: FAIL — module not found

- [ ] **Step 4: Create the model**

```js
// server/src/models/PrintJob.js
const mongoose = require('mongoose');
const { PRINT_JOB_STATUSES, PRINT_REJECTION_REASONS } = require('../utils/constants');

const PrintJobSchema = new mongoose.Schema({
  student: {
    email: { type: String, required: true },
    name: { type: String, required: true },
  },
  printer: { type: mongoose.Schema.Types.ObjectId, ref: 'Printer', required: true },
  fileName: { type: String, required: true },
  filePath: { type: String, required: true },
  status: {
    type: String,
    enum: Object.values(PRINT_JOB_STATUSES),
    default: PRINT_JOB_STATUSES.QUEUED,
  },
  rejectionReason: {
    type: String,
    enum: Object.values(PRINT_REJECTION_REASONS),
    default: null,
  },
  errorMessage: { type: String, default: null },
  submittedAt: { type: Date, default: Date.now },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  history: {
    type: [
      {
        status: { type: String, enum: Object.values(PRINT_JOB_STATUSES) },
        date: { type: Date, default: Date.now },
        detail: String,
      },
    ],
    default: [],
  },
});

PrintJobSchema.index({ 'student.email': 1, submittedAt: -1 });
PrintJobSchema.index({ printer: 1, status: 1 });

module.exports = mongoose.model('PrintJob', PrintJobSchema);
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd server && npx jest tests/unit/printJobModel.test.js`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add server/src/utils/constants.js server/src/models/PrintJob.js server/src/tests/unit/printJobModel.test.js
git commit -m "feat(print): add PrintJob model"
```

---

## Task 4: API key utility + printer auth middleware

**Files:**
- Create: `server/src/utils/apiKey.js`
- Create: `server/src/middleware/printerAuth.js`
- Test: `server/src/tests/unit/printerAuth.test.js`

**Interfaces:**
- Consumes: `Printer` model (Task 1), `PrintJob` model (Task 3), `PRINTER_STATUSES`/`PRINTER_STATUS_SOURCES` constants.
- Produces: `generateApiKey()` → `{ rawKey, hash }`; `hashApiKey(rawKey)` → `string`; Express middleware `authenticatePrinter(req, res, next)` that sets `req.printer` (a live Mongoose document, already saved with updated heartbeat/reconnection state) or calls `next(new ErrorResponse(...))`.

This middleware is the single place that records a heartbeat and reverses an `offline` status on reconnection — every future agent endpoint (Task 11/12, and the not-yet-written agent script) gets this for free just by being mounted behind it.

- [ ] **Step 1: Write the failing test**

```js
// server/src/tests/unit/printerAuth.test.js
const httpMocks = require('node-mocks-http'); // see note below step 3
```

Note: `node-mocks-http` is not installed. Rather than adding a new dependency for one middleware test, test `authenticatePrinter` through a **real Express app** (matches how the rest of the middleware in this repo — `auth.js` — is only exercised via functional/supertest tests, not unit-mocked). Replace the file with:

```js
// server/src/tests/unit/printerAuth.test.js
const express = require('express');
const request = require('supertest');
const Printer = require('../../models/Printer');
const PrintJob = require('../../models/PrintJob');
const { authenticatePrinter } = require('../../middleware/printerAuth');
const { generateApiKey } = require('../../utils/apiKey');
const { PRINTER_STATUSES } = require('../../utils/constants');
const errorHandler = require('../../middleware/errorHandler');

const buildApp = () => {
  const app = express();
  app.get('/whoami', authenticatePrinter, (req, res) => {
    res.status(200).json({ success: true, data: { id: req.printer._id.toString(), status: req.printer.status } });
  });
  app.use(errorHandler);
  return app;
};

describe('authenticatePrinter', () => {
  it('rejects a request with no headers', async () => {
    const res = await request(buildApp()).get('/whoami');
    expect(res.status).toBe(401);
  });

  it('rejects a wrong api key', async () => {
    const { hash } = generateApiKey();
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: hash });
    const res = await request(buildApp())
      .get('/whoami')
      .set('x-printer-id', printer._id.toString())
      .set('x-api-key', 'wrong-key');
    expect(res.status).toBe(401);
  });

  it('accepts the right api key and updates lastSeenAt', async () => {
    const { rawKey, hash } = generateApiKey();
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: hash });
    const res = await request(buildApp())
      .get('/whoami')
      .set('x-printer-id', printer._id.toString())
      .set('x-api-key', rawKey);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(PRINTER_STATUSES.IDLE);
    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.lastSeenAt).not.toBeNull();
  });

  it('reconnects a printer that was offline with no failed job back to lastKnownStatus', async () => {
    const { rawKey, hash } = generateApiKey();
    const printer = await Printer.create({
      name: 'P1', model: 'kobra3', apiKeyHash: hash,
      status: PRINTER_STATUSES.OFFLINE, lastKnownStatus: PRINTER_STATUSES.IDLE,
    });
    const res = await request(buildApp())
      .get('/whoami')
      .set('x-printer-id', printer._id.toString())
      .set('x-api-key', rawKey);
    expect(res.body.data.status).toBe(PRINTER_STATUSES.IDLE);
  });

  it('reconnects a printer whose current job was auto-failed into awaiting_clearance', async () => {
    const { rawKey, hash } = generateApiKey();
    const printer = await Printer.create({
      name: 'P1', model: 'kobra3', apiKeyHash: hash,
      status: PRINTER_STATUSES.OFFLINE, lastKnownStatus: PRINTER_STATUSES.PRINTING,
    });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'S' },
      printer: printer._id, fileName: 'a.gcode', filePath: '/x', status: 'failed',
    });
    printer.currentJob = job._id;
    await printer.save();

    const res = await request(buildApp())
      .get('/whoami')
      .set('x-printer-id', printer._id.toString())
      .set('x-api-key', rawKey);
    expect(res.body.data.status).toBe(PRINTER_STATUSES.AWAITING_CLEARANCE);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx jest tests/unit/printerAuth.test.js`
Expected: FAIL — `authenticatePrinter`/`generateApiKey` not found

- [ ] **Step 3: Create `apiKey.js`**

```js
// server/src/utils/apiKey.js
const crypto = require('crypto');

const generateApiKey = () => {
  const rawKey = crypto.randomBytes(32).toString('hex');
  return { rawKey, hash: hashApiKey(rawKey) };
};

const hashApiKey = (rawKey) => crypto.createHash('sha256').update(rawKey).digest('hex');

module.exports = { generateApiKey, hashApiKey };
```

- [ ] **Step 4: Create `printerAuth.js`**

```js
// server/src/middleware/printerAuth.js
const Printer = require('../models/Printer');
const PrintJob = require('../models/PrintJob');
const { hashApiKey } = require('../utils/apiKey');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('./asyncHandler');
const { PRINTER_STATUSES, PRINTER_STATUS_SOURCES } = require('../utils/constants');

exports.authenticatePrinter = asyncHandler(async (req, res, next) => {
  const printerId = req.headers['x-printer-id'];
  const apiKey = req.headers['x-api-key'];

  if (!printerId || !apiKey) {
    return next(new ErrorResponse('Authentification imprimante requise', 401));
  }

  const printer = await Printer.findById(printerId).catch(() => null);
  if (!printer || printer.apiKeyHash !== hashApiKey(apiKey)) {
    return next(new ErrorResponse('Clé API imprimante invalide', 401));
  }

  if (printer.status === PRINTER_STATUSES.OFFLINE) {
    let nextStatus = printer.lastKnownStatus || PRINTER_STATUSES.IDLE;

    if (printer.currentJob) {
      const job = await PrintJob.findById(printer.currentJob);
      if (job && job.status === 'failed') {
        nextStatus = PRINTER_STATUSES.AWAITING_CLEARANCE;
      }
    }

    printer.status = nextStatus;
    printer.statusHistory.push({
      status: nextStatus,
      source: PRINTER_STATUS_SOURCES.AGENT_REPORT,
      detail: 'Reconnexion après perte de contact',
      date: new Date(),
    });
  }

  printer.lastSeenAt = new Date();
  await printer.save();

  req.printer = printer;
  next();
});
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd server && npx jest tests/unit/printerAuth.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add server/src/utils/apiKey.js server/src/middleware/printerAuth.js server/src/tests/unit/printerAuth.test.js
git commit -m "feat(print): add printer API-key auth middleware with reconnection handling"
```

---

## Task 5: gcode upload middleware

**Files:**
- Create: `server/src/middleware/printJobUpload.js`

**Interfaces:**
- Produces: multer instance, `.single('file')` usage in Task 8, storing to `server/uploads/print-jobs/`, `.gcode` extension only, 200 MB max.

- [ ] **Step 1: Create the middleware**

No dedicated test file — this is multer configuration exercised end-to-end by the functional test in Task 8 (same approach the existing `upload.js` takes: no standalone test, covered via `simulatedProjects` functional tests).

```js
// server/src/middleware/printJobUpload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/print-jobs');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
    cb(null, `${Date.now()}-${sanitized}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (path.extname(file.originalname).toLowerCase() === '.gcode') {
    cb(null, true);
  } else {
    cb(new Error('Seuls les fichiers .gcode sont acceptés'), false);
  }
};

const printJobUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 200 * 1024 * 1024 },
});

module.exports = printJobUpload;
```

- [ ] **Step 2: Commit**

```bash
git add server/src/middleware/printJobUpload.js
git commit -m "feat(print): add gcode upload middleware"
```

---

## Task 6: Print test helpers + admin printer CRUD (create, regenerate key, list)

**Files:**
- Create: `server/src/tests/helpers/print.js`
- Create: `server/src/controllers/print/printerController.js`
- Create: `server/src/routes/printPrinters.js`
- Modify: `server/src/app.js`
- Test: `server/src/tests/functional/print/printers.test.js`

**Interfaces:**
- Consumes: `Printer` model, `generateApiKey`, `authenticateToken`/`isAdmin`.
- Produces: `GET /api/print/printers`, `POST /api/print/printers`, `POST /api/print/printers/:id/regenerate-key`. Test helper `createPrinter(overrides)` and `printerAuthHeader(rawKey, printerId)` for later tasks.

- [ ] **Step 1: Create the test helper**

```js
// server/src/tests/helpers/print.js
const Printer = require('../../models/Printer');
const PrintAuthorization = require('../../models/PrintAuthorization');
const { generateApiKey } = require('../../utils/apiKey');

const createPrinter = async (overrides = {}) => {
  const { rawKey, hash } = generateApiKey();
  const printer = await Printer.create({
    name: 'Kobra 3 - Test',
    model: 'kobra3',
    apiKeyHash: hash,
    ...overrides,
  });
  return { printer, rawKey };
};

const whitelistEmail = async (email, authorized = true) =>
  PrintAuthorization.create({ email, authorized });

const printerAuthHeader = (printerId, rawKey) => ({
  'x-printer-id': printerId.toString(),
  'x-api-key': rawKey,
});

module.exports = { createPrinter, whitelistEmail, printerAuthHeader };
```

- [ ] **Step 2: Write the failing functional test**

```js
// server/src/tests/functional/print/printers.test.js
const request = require('supertest');
const app = require('../../../app');
const Printer = require('../../../models/Printer');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');

describe('GET /api/print/printers', () => {
  it('returns 401 with no auth', async () => {
    const res = await request(app).get('/api/print/printers');
    expect(res.status).toBe(401);
  });

  it('lists printers for an authenticated student', async () => {
    const student = await createUser();
    await Printer.create({ name: 'Kobra 3 - A', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });

    const res = await request(app).get('/api/print/printers').set(authHeader(student));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Kobra 3 - A');
    expect(res.body.data[0].apiKeyHash).toBeUndefined();
  });
});

describe('POST /api/print/printers', () => {
  it('returns 403 for a non-admin', async () => {
    const student = await createUser();
    const res = await request(app)
      .post('/api/print/printers')
      .set(authHeader(student))
      .send({ name: 'Kobra 3 - B', model: 'kobra3' });
    expect(res.status).toBe(403);
  });

  it('creates a printer and returns the raw API key exactly once', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .post('/api/print/printers')
      .set(authHeader(admin))
      .send({ name: 'Kobra 3 Max - C', model: 'kobra3max' });

    expect(res.status).toBe(201);
    expect(res.body.data.printer.name).toBe('Kobra 3 Max - C');
    expect(typeof res.body.data.apiKey).toBe('string');
    expect(res.body.data.apiKey.length).toBeGreaterThan(20);

    const stored = await Printer.findById(res.body.data.printer._id);
    expect(stored.apiKeyHash).not.toBe(res.body.data.apiKey);
  });
});

describe('POST /api/print/printers/:id/regenerate-key', () => {
  it('invalidates the old key hash', async () => {
    const admin = await createAdmin();
    const created = await request(app)
      .post('/api/print/printers')
      .set(authHeader(admin))
      .send({ name: 'Kobra 3 - D', model: 'kobra3' });
    const printerId = created.body.data.printer._id;
    const oldHash = (await Printer.findById(printerId)).apiKeyHash;

    const res = await request(app)
      .post(`/api/print/printers/${printerId}/regenerate-key`)
      .set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(typeof res.body.data.apiKey).toBe('string');
    const reloaded = await Printer.findById(printerId);
    expect(reloaded.apiKeyHash).not.toBe(oldHash);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd server && npx jest tests/functional/print/printers.test.js`
Expected: FAIL — 404s (route not mounted)

- [ ] **Step 4: Create the controller**

```js
// server/src/controllers/print/printerController.js
const Printer = require('../../models/Printer');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');
const { generateApiKey } = require('../../utils/apiKey');

// GET /api/print/printers
exports.listPrinters = asyncHandler(async (req, res) => {
  const printers = await Printer.find().select('-apiKeyHash').sort({ name: 1 });
  res.status(200).json({ success: true, count: printers.length, data: printers });
});

// POST /api/print/printers
exports.createPrinter = asyncHandler(async (req, res, next) => {
  const { name, model } = req.body;
  if (!name || !model) {
    return next(new ErrorResponse('Le nom et le modèle sont requis', 400));
  }

  const { rawKey, hash } = generateApiKey();
  const printer = await Printer.create({ name, model, apiKeyHash: hash });
  const printerObj = printer.toObject();
  delete printerObj.apiKeyHash;

  res.status(201).json({ success: true, data: { printer: printerObj, apiKey: rawKey } });
});

// POST /api/print/printers/:id/regenerate-key
exports.regenerateKey = asyncHandler(async (req, res, next) => {
  const printer = await Printer.findById(req.params.id);
  if (!printer) return next(new ErrorResponse('Imprimante non trouvée', 404));

  const { rawKey, hash } = generateApiKey();
  printer.apiKeyHash = hash;
  await printer.save();

  res.status(200).json({ success: true, data: { apiKey: rawKey } });
});
```

- [ ] **Step 5: Create the routes**

```js
// server/src/routes/printPrinters.js
const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middleware/auth');
const printerController = require('../controllers/print/printerController');

router.get('/', authenticateToken, printerController.listPrinters);
router.post('/', authenticateToken, isAdmin, printerController.createPrinter);
router.post('/:id/regenerate-key', authenticateToken, isAdmin, printerController.regenerateKey);

module.exports = router;
```

- [ ] **Step 6: Mount the router**

In `server/src/app.js`, add next to the other `/api/print*`-style mounts (place it right after the `/api/simulated` block):

```js
app.use("/api/print/printers", require("./routes/printPrinters"));
```

- [ ] **Step 7: Run to verify it passes**

Run: `cd server && npx jest tests/functional/print/printers.test.js`
Expected: PASS (5 tests)

- [ ] **Step 8: Commit**

```bash
git add server/src/tests/helpers/print.js server/src/controllers/print/printerController.js server/src/routes/printPrinters.js server/src/app.js server/src/tests/functional/print/printers.test.js
git commit -m "feat(print): admin printer CRUD (create/list/regenerate-key)"
```

---

## Task 7: Admin disable/enable printer + QR generation

**Files:**
- Modify: `server/src/controllers/print/printerController.js`
- Modify: `server/src/routes/printPrinters.js`
- Modify: `server/src/tests/functional/print/printers.test.js`
- New dependency: `qrcode` (npm)

**Interfaces:**
- Consumes: `Printer` model, `PRINTER_STATUSES`, `PRINTER_STATUS_SOURCES`.
- Produces: `PATCH /api/print/printers/:id/disabled`, `GET /api/print/printers/:id/qr` (PNG image). Frontend Task 19 consumes the QR endpoint directly as an `<img src>`.

- [ ] **Step 1: Install `qrcode`**

Run: `cd server && npm install qrcode`

- [ ] **Step 2: Add the failing tests**

Append to `server/src/tests/functional/print/printers.test.js`:

```js
const Printer = require('../../../models/Printer'); // already imported above, keep single import
const { PRINTER_STATUSES } = require('../../../utils/constants');

describe('PATCH /api/print/printers/:id/disabled', () => {
  it('requires a note when disabling', async () => {
    const admin = await createAdmin();
    const printer = await Printer.create({ name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const res = await request(app)
      .patch(`/api/print/printers/${printer._id}/disabled`)
      .set(authHeader(admin))
      .send({ disabled: true });
    expect(res.status).toBe(400);
  });

  it('disables with a note, logs statusHistory, and re-enables back to idle', async () => {
    const admin = await createAdmin();
    const printer = await Printer.create({ name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });

    const disableRes = await request(app)
      .patch(`/api/print/printers/${printer._id}/disabled`)
      .set(authHeader(admin))
      .send({ disabled: true, note: 'Buse bouchée, en réparation' });
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.data.status).toBe(PRINTER_STATUSES.DISABLED);

    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.statusHistory).toHaveLength(1);
    expect(reloaded.statusHistory[0].source).toBe('admin_action');
    expect(reloaded.statusHistory[0].detail).toBe('Buse bouchée, en réparation');

    const enableRes = await request(app)
      .patch(`/api/print/printers/${printer._id}/disabled`)
      .set(authHeader(admin))
      .send({ disabled: false, note: 'Réparée' });
    expect(enableRes.body.data.status).toBe(PRINTER_STATUSES.IDLE);
  });
});

describe('GET /api/print/printers/:id/qr', () => {
  it('returns a PNG image for an admin', async () => {
    const admin = await createAdmin();
    const printer = await Printer.create({ name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const res = await request(app)
      .get(`/api/print/printers/${printer._id}/qr`)
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd server && npx jest tests/functional/print/printers.test.js`
Expected: FAIL — 404s on the two new routes

- [ ] **Step 4: Add the controller functions**

Append to `server/src/controllers/print/printerController.js` (add the two new requires at the top alongside the existing ones):

```js
const QRCode = require('qrcode');
const { PRINTER_STATUSES, PRINTER_STATUS_SOURCES } = require('../../utils/constants');
```

```js
// PATCH /api/print/printers/:id/disabled
exports.setDisabled = asyncHandler(async (req, res, next) => {
  const { disabled, note } = req.body;
  if (typeof disabled !== 'boolean' || !note) {
    return next(new ErrorResponse('disabled (booléen) et note sont requis', 400));
  }

  const printer = await Printer.findById(req.params.id);
  if (!printer) return next(new ErrorResponse('Imprimante non trouvée', 404));

  printer.status = disabled ? PRINTER_STATUSES.DISABLED : PRINTER_STATUSES.IDLE;
  printer.statusHistory.push({
    status: printer.status,
    source: PRINTER_STATUS_SOURCES.ADMIN_ACTION,
    detail: note,
    byUserId: req.user._id,
    byName: req.user.name,
    date: new Date(),
  });
  await printer.save();

  res.status(200).json({ success: true, data: { status: printer.status } });
});

// GET /api/print/printers/:id/qr
exports.getQrCode = asyncHandler(async (req, res, next) => {
  const printer = await Printer.findById(req.params.id);
  if (!printer) return next(new ErrorResponse('Imprimante non trouvée', 404));

  const url = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/print/printers/${printer._id}/confirm-clearance`;
  const buffer = await QRCode.toBuffer(url, { type: 'png', width: 400 });

  res.set('Content-Type', 'image/png');
  res.status(200).send(buffer);
});
```

- [ ] **Step 5: Add the routes**

Append to `server/src/routes/printPrinters.js`, before `module.exports`:

```js
router.patch('/:id/disabled', authenticateToken, isAdmin, printerController.setDisabled);
router.get('/:id/qr', authenticateToken, isAdmin, printerController.getQrCode);
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd server && npx jest tests/functional/print/printers.test.js`
Expected: PASS (8 tests)

- [ ] **Step 7: Commit**

```bash
git add server/package.json server/package-lock.json server/src/controllers/print/printerController.js server/src/routes/printPrinters.js server/src/tests/functional/print/printers.test.js
git commit -m "feat(print): admin printer disable/enable + QR code generation"
```

---

## Task 8: Whitelist management

**Files:**
- Create: `server/src/controllers/print/whitelistController.js`
- Create: `server/src/routes/printWhitelist.js`
- Modify: `server/src/app.js`
- Test: `server/src/tests/functional/print/whitelist.test.js`

**Interfaces:**
- Consumes: `PrintAuthorization` model (Task 2).
- Produces: `GET /api/print/whitelist`, `POST /api/print/whitelist` (upsert by email, records history).

- [ ] **Step 1: Write the failing test**

```js
// server/src/tests/functional/print/whitelist.test.js
const request = require('supertest');
const app = require('../../../app');
const PrintAuthorization = require('../../../models/PrintAuthorization');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');

describe('POST /api/print/whitelist', () => {
  it('returns 403 for a non-admin', async () => {
    const student = await createUser();
    const res = await request(app)
      .post('/api/print/whitelist')
      .set(authHeader(student))
      .send({ email: 'x@epitech.eu', authorized: true });
    expect(res.status).toBe(403);
  });

  it('whitelists a new email and records who did it', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .post('/api/print/whitelist')
      .set(authHeader(admin))
      .send({ email: 'Student@Epitech.eu', authorized: true, note: 'Autorisé pour le projet X' });

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('student@epitech.eu');
    expect(res.body.data.authorized).toBe(true);
    expect(res.body.data.history).toHaveLength(1);
    expect(res.body.data.history[0].byName).toBe(admin.name);
  });

  it('revokes (blacklists) an already-whitelisted email and keeps history', async () => {
    const admin = await createAdmin();
    await PrintAuthorization.create({ email: 'student@epitech.eu', authorized: true });

    const res = await request(app)
      .post('/api/print/whitelist')
      .set(authHeader(admin))
      .send({ email: 'student@epitech.eu', authorized: false, note: 'Abus signalé' });

    expect(res.body.data.authorized).toBe(false);
    const reloaded = await PrintAuthorization.findOne({ email: 'student@epitech.eu' });
    expect(reloaded.history).toHaveLength(1);
  });
});

describe('GET /api/print/whitelist', () => {
  it('lists all entries for an admin', async () => {
    const admin = await createAdmin();
    await PrintAuthorization.create({ email: 'a@epitech.eu', authorized: true });
    await PrintAuthorization.create({ email: 'b@epitech.eu', authorized: false });

    const res = await request(app).get('/api/print/whitelist').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx jest tests/functional/print/whitelist.test.js`
Expected: FAIL — 404s

- [ ] **Step 3: Create the controller**

```js
// server/src/controllers/print/whitelistController.js
const PrintAuthorization = require('../../models/PrintAuthorization');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');

// GET /api/print/whitelist
exports.listWhitelist = asyncHandler(async (req, res) => {
  const entries = await PrintAuthorization.find().sort({ email: 1 });
  res.status(200).json({ success: true, count: entries.length, data: entries });
});

// POST /api/print/whitelist
// Body: { email, authorized, note }
exports.setAuthorization = asyncHandler(async (req, res, next) => {
  const { email, authorized, note } = req.body;
  if (!email || typeof authorized !== 'boolean') {
    return next(new ErrorResponse('email et authorized (booléen) sont requis', 400));
  }

  const normalizedEmail = email.trim().toLowerCase();
  let entry = await PrintAuthorization.findOne({ email: normalizedEmail });
  if (!entry) {
    entry = new PrintAuthorization({ email: normalizedEmail });
  }

  entry.authorized = authorized;
  entry.history.push({
    authorized,
    byUserId: req.user._id,
    byName: req.user.name,
    date: new Date(),
    note: note || '',
  });
  await entry.save();

  res.status(200).json({ success: true, data: entry });
});
```

- [ ] **Step 4: Create the routes**

```js
// server/src/routes/printWhitelist.js
const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middleware/auth');
const whitelistController = require('../controllers/print/whitelistController');

router.get('/', authenticateToken, isAdmin, whitelistController.listWhitelist);
router.post('/', authenticateToken, isAdmin, whitelistController.setAuthorization);

module.exports = router;
```

- [ ] **Step 5: Mount the router**

In `server/src/app.js`, next to the `printPrinters` mount:

```js
app.use("/api/print/whitelist", require("./routes/printWhitelist"));
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd server && npx jest tests/functional/print/whitelist.test.js`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/print/whitelistController.js server/src/routes/printWhitelist.js server/src/app.js server/src/tests/functional/print/whitelist.test.js
git commit -m "feat(print): whitelist management endpoints"
```

---

## Task 9: Student job submission (the core authorization + state-machine logic)

**Files:**
- Create: `server/src/controllers/print/jobController.js`
- Create: `server/src/routes/printJobs.js`
- Modify: `server/src/app.js`
- Test: `server/src/tests/functional/print/jobs.test.js`

**Interfaces:**
- Consumes: `PrintJob`, `Printer`, `PrintAuthorization` models; `printJobUpload` middleware (Task 5); `whitelistEmail`/`createPrinter` test helpers (Task 6).
- Produces: `POST /api/print/jobs` — this is where the atomic `idle → printing` lock happens (see Global Constraints). Also `GET /api/print/jobs/me`.

This is the most important task in the plan — it implements the whitelist check, the four rejection reasons, and the atomic race-condition guard described in the spec's "Gestion des erreurs et cas limites".

- [ ] **Step 1: Write the failing test**

```js
// server/src/tests/functional/print/jobs.test.js
const request = require('supertest');
const app = require('../../../app');
const Printer = require('../../../models/Printer');
const PrintJob = require('../../../models/PrintJob');
const { createUser, authHeader } = require('../../helpers/auth');
const { createPrinter, whitelistEmail } = require('../../helpers/print');
const { PRINTER_STATUSES } = require('../../../utils/constants');

describe('POST /api/print/jobs', () => {
  it('rejects a non-whitelisted student with 403 and logs the attempt', async () => {
    const student = await createUser({ email: 'not-whitelisted@epitech.eu' });
    const { printer } = await createPrinter();

    const res = await request(app)
      .post('/api/print/jobs')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from('G1 X10\n'), 'part.gcode');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/autoris/i);

    const jobs = await PrintJob.find({ 'student.email': student.email });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('rejected');
    expect(jobs[0].rejectionReason).toBe('not_authorized');
  });

  it('accepts a whitelisted student on an idle printer and locks the printer atomically', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter();

    const res = await request(app)
      .post('/api/print/jobs')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from('G1 X10\n'), 'part.gcode');

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('queued');

    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.status).toBe(PRINTER_STATUSES.PRINTING);
    expect(reloadedPrinter.currentJob.toString()).toBe(res.body.data._id);
  });

  it('rejects with printer_busy when the printer is already printing', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({ status: PRINTER_STATUSES.PRINTING });

    const res = await request(app)
      .post('/api/print/jobs')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from('G1 X10\n'), 'part.gcode');

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/occup/i);
    const job = await PrintJob.findOne({ 'student.email': student.email });
    expect(job.rejectionReason).toBe('printer_busy');
  });

  it('rejects with printer_offline when the printer is offline', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({ status: PRINTER_STATUSES.OFFLINE });

    const res = await request(app)
      .post('/api/print/jobs')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from('G1 X10\n'), 'part.gcode');

    expect(res.status).toBe(409);
    const job = await PrintJob.findOne({ 'student.email': student.email });
    expect(job.rejectionReason).toBe('printer_offline');
  });

  it('rejects with printer_disabled when the printer is disabled', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter({ status: PRINTER_STATUSES.DISABLED });

    const res = await request(app)
      .post('/api/print/jobs')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from('G1 X10\n'), 'part.gcode');

    const job = await PrintJob.findOne({ 'student.email': student.email });
    expect(job.rejectionReason).toBe('printer_disabled');
  });

  it('rejects a non-.gcode file', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter();

    const res = await request(app)
      .post('/api/print/jobs')
      .set(authHeader(student))
      .field('printerId', printer._id.toString())
      .attach('file', Buffer.from('not gcode'), 'part.txt');

    expect(res.status).toBe(400);
  });
});

describe('GET /api/print/jobs/me', () => {
  it("returns only the requesting student's jobs, newest first", async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const other = await createUser({ email: 'other@epitech.eu' });
    const { printer } = await createPrinter();

    await PrintJob.create({ student: { email: other.email, name: other.name }, printer: printer._id, fileName: 'x.gcode', filePath: '/x' });
    await PrintJob.create({ student: { email: student.email, name: student.name }, printer: printer._id, fileName: 'y.gcode', filePath: '/y' });

    const res = await request(app).get('/api/print/jobs/me').set(authHeader(student));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].fileName).toBe('y.gcode');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx jest tests/functional/print/jobs.test.js`
Expected: FAIL — 404s

- [ ] **Step 3: Create the controller**

```js
// server/src/controllers/print/jobController.js
const fs = require('fs');
const Printer = require('../../models/Printer');
const PrintJob = require('../../models/PrintJob');
const PrintAuthorization = require('../../models/PrintAuthorization');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');
const { PRINTER_STATUSES, PRINT_REJECTION_REASONS } = require('../../utils/constants');

const REJECTION_MESSAGES = {
  [PRINT_REJECTION_REASONS.NOT_AUTHORIZED]: "Vous n'êtes pas autorisé à soumettre une impression",
  [PRINT_REJECTION_REASONS.PRINTER_BUSY]: 'Cette imprimante est occupée',
  [PRINT_REJECTION_REASONS.PRINTER_OFFLINE]: 'Cette imprimante est injoignable',
  [PRINT_REJECTION_REASONS.PRINTER_ERROR]: 'Cette imprimante signale une erreur',
  [PRINT_REJECTION_REASONS.PRINTER_DISABLED]: 'Cette imprimante est désactivée',
};

const STATUS_TO_REJECTION_REASON = {
  [PRINTER_STATUSES.PRINTING]: PRINT_REJECTION_REASONS.PRINTER_BUSY,
  [PRINTER_STATUSES.AWAITING_CLEARANCE]: PRINT_REJECTION_REASONS.PRINTER_BUSY,
  [PRINTER_STATUSES.OFFLINE]: PRINT_REJECTION_REASONS.PRINTER_OFFLINE,
  [PRINTER_STATUSES.ERROR]: PRINT_REJECTION_REASONS.PRINTER_ERROR,
  [PRINTER_STATUSES.DISABLED]: PRINT_REJECTION_REASONS.PRINTER_DISABLED,
};

const rejectSubmission = async (req, res, printer, reason) => {
  fs.unlink(req.file.path, () => {});
  await PrintJob.create({
    student: { email: req.user.email, name: req.user.name },
    printer: printer._id,
    fileName: req.file.originalname,
    filePath: req.file.path,
    status: 'rejected',
    rejectionReason: reason,
    history: [{ status: 'rejected', date: new Date(), detail: REJECTION_MESSAGES[reason] }],
  });
  const statusCode = reason === PRINT_REJECTION_REASONS.NOT_AUTHORIZED ? 403 : 409;
  res.status(statusCode).json({ success: false, error: REJECTION_MESSAGES[reason] });
};

// POST /api/print/jobs
// multipart form: printerId, file
exports.submitJob = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new ErrorResponse('Fichier .gcode requis', 400));

  const { printerId } = req.body;
  const printer = await Printer.findById(printerId);
  if (!printer) {
    fs.unlink(req.file.path, () => {});
    return next(new ErrorResponse('Imprimante non trouvée', 404));
  }

  const authorization = await PrintAuthorization.findOne({ email: req.user.email.toLowerCase() });
  if (!authorization || !authorization.authorized) {
    return rejectSubmission(req, res, printer, PRINT_REJECTION_REASONS.NOT_AUTHORIZED);
  }

  if (printer.status !== PRINTER_STATUSES.IDLE) {
    const reason = STATUS_TO_REJECTION_REASON[printer.status] || PRINT_REJECTION_REASONS.PRINTER_OFFLINE;
    return rejectSubmission(req, res, printer, reason);
  }

  const job = await PrintJob.create({
    student: { email: req.user.email, name: req.user.name },
    printer: printer._id,
    fileName: req.file.originalname,
    filePath: req.file.path,
    history: [{ status: 'queued', date: new Date(), detail: 'Soumission acceptée' }],
  });

  // Verrou atomique : ne réussit que si le statut est encore 'idle' au moment de l'écriture,
  // ce qui empêche deux soumissions simultanées de passer toutes les deux la vérification ci-dessus.
  const locked = await Printer.findOneAndUpdate(
    { _id: printer._id, status: PRINTER_STATUSES.IDLE },
    { status: PRINTER_STATUSES.PRINTING, currentJob: job._id }
  );

  if (!locked) {
    job.status = 'rejected';
    job.rejectionReason = PRINT_REJECTION_REASONS.PRINTER_BUSY;
    job.history.push({ status: 'rejected', date: new Date(), detail: REJECTION_MESSAGES[PRINT_REJECTION_REASONS.PRINTER_BUSY] });
    await job.save();
    return res.status(409).json({ success: false, error: REJECTION_MESSAGES[PRINT_REJECTION_REASONS.PRINTER_BUSY] });
  }

  res.status(201).json({ success: true, data: job });
});

// GET /api/print/jobs/me
exports.getMyJobs = asyncHandler(async (req, res) => {
  const jobs = await PrintJob.find({ 'student.email': req.user.email.toLowerCase() }).sort({ submittedAt: -1 });
  res.status(200).json({ success: true, count: jobs.length, data: jobs });
});
```

- [ ] **Step 4: Create the routes**

```js
// server/src/routes/printJobs.js
const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middleware/auth');
const printJobUpload = require('../middleware/printJobUpload');
const jobController = require('../controllers/print/jobController');

router.post('/', authenticateToken, printJobUpload.single('file'), jobController.submitJob);
router.get('/me', authenticateToken, jobController.getMyJobs);

module.exports = router;
```

- [ ] **Step 5: Mount the router**

In `server/src/app.js`:

```js
app.use("/api/print/jobs", require("./routes/printJobs"));
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd server && npx jest tests/functional/print/jobs.test.js`
Expected: PASS (8 tests)

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/print/jobController.js server/src/routes/printJobs.js server/src/app.js server/src/tests/functional/print/jobs.test.js
git commit -m "feat(print): student job submission with whitelist + atomic printer lock"
```

---

## Task 10: Admin job listing + detail

**Files:**
- Modify: `server/src/controllers/print/jobController.js`
- Modify: `server/src/routes/printJobs.js`
- Modify: `server/src/tests/functional/print/jobs.test.js`

**Interfaces:**
- Produces: `GET /api/print/jobs` (admin, optional `?status=` and `?printerId=` filters), `GET /api/print/jobs/:id` (admin).

- [ ] **Step 1: Add the failing tests**

Append to `server/src/tests/functional/print/jobs.test.js`:

```js
const { createAdmin } = require('../../helpers/auth'); // extend existing import line instead of duplicating

describe('GET /api/print/jobs (admin)', () => {
  it('returns 403 for a student', async () => {
    const student = await createUser();
    const res = await request(app).get('/api/print/jobs').set(authHeader(student));
    expect(res.status).toBe(403);
  });

  it('lists all jobs for an admin, filterable by status', async () => {
    const admin = await createAdmin();
    const { printer } = await createPrinter();
    await PrintJob.create({ student: { email: 'a@epitech.eu', name: 'A' }, printer: printer._id, fileName: 'a.gcode', filePath: '/a', status: 'queued' });
    await PrintJob.create({ student: { email: 'b@epitech.eu', name: 'B' }, printer: printer._id, fileName: 'b.gcode', filePath: '/b', status: 'rejected', rejectionReason: 'not_authorized' });

    const all = await request(app).get('/api/print/jobs').set(authHeader(admin));
    expect(all.body.count).toBe(2);

    const onlyRejected = await request(app).get('/api/print/jobs?status=rejected').set(authHeader(admin));
    expect(onlyRejected.body.count).toBe(1);
    expect(onlyRejected.body.data[0].rejectionReason).toBe('not_authorized');
  });
});

describe('GET /api/print/jobs/:id (admin)', () => {
  it('returns the job with its history', async () => {
    const admin = await createAdmin();
    const { printer } = await createPrinter();
    const job = await PrintJob.create({ student: { email: 'a@epitech.eu', name: 'A' }, printer: printer._id, fileName: 'a.gcode', filePath: '/a' });

    const res = await request(app).get(`/api/print/jobs/${job._id}`).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.fileName).toBe('a.gcode');
  });

  it('returns 404 for an unknown id', async () => {
    const admin = await createAdmin();
    const res = await request(app).get('/api/print/jobs/000000000000000000000000').set(authHeader(admin));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx jest tests/functional/print/jobs.test.js`
Expected: FAIL on the four new tests — 404 route not mounted

- [ ] **Step 3: Add the controller functions**

Append to `server/src/controllers/print/jobController.js`:

```js
// GET /api/print/jobs?status=&printerId=
exports.getAllJobs = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.printerId) filter.printer = req.query.printerId;

  const jobs = await PrintJob.find(filter).sort({ submittedAt: -1 });
  res.status(200).json({ success: true, count: jobs.length, data: jobs });
});

// GET /api/print/jobs/:id
exports.getJobById = asyncHandler(async (req, res, next) => {
  const job = await PrintJob.findById(req.params.id);
  if (!job) return next(new ErrorResponse('Job non trouvé', 404));
  res.status(200).json({ success: true, data: job });
});
```

- [ ] **Step 4: Add the routes**

In `server/src/routes/printJobs.js`, add the `isAdmin` import usage and two routes **before** `module.exports` (order matters: `/me` must stay before `/:id`-style routes are added — but since `/me` and `/:id` live on different sub-paths here it's fine either order; still, add these after `/me` to keep the file readable):

```js
router.get('/', authenticateToken, isAdmin, jobController.getAllJobs);
router.get('/:id', authenticateToken, isAdmin, jobController.getJobById);
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd server && npx jest tests/functional/print/jobs.test.js`
Expected: PASS (12 tests)

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/print/jobController.js server/src/routes/printJobs.js server/src/tests/functional/print/jobs.test.js
git commit -m "feat(print): admin job listing and detail endpoints"
```

---

## Task 11: Agent — next-job dispatch

**Files:**
- Create: `server/src/controllers/print/agentController.js`
- Create: `server/src/routes/printAgent.js`
- Modify: `server/src/app.js`
- Test: `server/src/tests/functional/print/agent.test.js`

**Interfaces:**
- Consumes: `authenticatePrinter` middleware (Task 4), `PrintJob`/`Printer` models, `printerAuthHeader` test helper (Task 6).
- Produces: `GET /api/print/agent/next-job` → `{ jobId, fileName, downloadUrl } | null`. This and Task 12 are built and tested now so the future printer-agent plan only has to write an HTTP client against a working API — not touched by this plan.

- [ ] **Step 1: Write the failing test**

```js
// server/src/tests/functional/print/agent.test.js
const request = require('supertest');
const app = require('../../../app');
const PrintJob = require('../../../models/PrintJob');
const Printer = require('../../../models/Printer');
const { createUser } = require('../../helpers/auth');
const { createPrinter, whitelistEmail, printerAuthHeader } = require('../../helpers/print');
const { PRINTER_STATUSES } = require('../../../utils/constants');

const submitAcceptedJob = async (printer) => {
  const student = await createUser({ email: 'ok@epitech.eu' });
  await whitelistEmail(student.email);
  const { authHeader } = require('../../helpers/auth');
  const res = await request(app)
    .post('/api/print/jobs')
    .set(authHeader(student))
    .field('printerId', printer._id.toString())
    .attach('file', Buffer.from('G1 X10\n'), 'part.gcode');
  return res.body.data;
};

describe('GET /api/print/agent/next-job', () => {
  it('returns 401 without printer auth headers', async () => {
    const res = await request(app).get('/api/print/agent/next-job');
    expect(res.status).toBe(401);
  });

  it('returns null when there is no job for this printer', async () => {
    const { printer, rawKey } = await createPrinter();
    const res = await request(app)
      .get('/api/print/agent/next-job')
      .set(printerAuthHeader(printer._id, rawKey));
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('dispatches the queued job for this printer and marks it sent', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);

    const res = await request(app)
      .get('/api/print/agent/next-job')
      .set(printerAuthHeader(printer._id, rawKey));

    expect(res.status).toBe(200);
    expect(res.body.data.jobId).toBe(job._id);
    expect(res.body.data.fileName).toBe('part.gcode');
    expect(res.body.data.downloadUrl).toMatch(new RegExp(`/api/print/agent/jobs/${job._id}/file`));

    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.status).toBe('sent');
  });

  it('does not re-dispatch a job already sent', async () => {
    const { printer, rawKey } = await createPrinter();
    await submitAcceptedJob(printer);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const second = await request(app)
      .get('/api/print/agent/next-job')
      .set(printerAuthHeader(printer._id, rawKey));
    expect(second.body.data).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx jest tests/functional/print/agent.test.js`
Expected: FAIL — 404s

- [ ] **Step 3: Create the controller**

```js
// server/src/controllers/print/agentController.js
const path = require('path');
const PrintJob = require('../../models/PrintJob');
const asyncHandler = require('../../middleware/asyncHandler');

// GET /api/print/agent/next-job
// req.printer is set by authenticatePrinter
exports.getNextJob = asyncHandler(async (req, res) => {
  if (!req.printer.currentJob) {
    return res.status(200).json({ success: true, data: null });
  }

  // La condition status: 'queued' rend l'écriture atomique : si deux polls se chevauchent,
  // un seul obtiendra un document en retour.
  const job = await PrintJob.findOneAndUpdate(
    { _id: req.printer.currentJob, status: 'queued' },
    {
      status: 'sent',
      $push: { history: { status: 'sent', date: new Date(), detail: `Dispatché à l'imprimante ${req.printer.name}` } },
    }
  );

  if (!job) {
    return res.status(200).json({ success: true, data: null });
  }

  res.status(200).json({
    success: true,
    data: {
      jobId: job._id.toString(),
      fileName: job.fileName,
      downloadUrl: `/api/print/agent/jobs/${job._id}/file`,
    },
  });
});
```

- [ ] **Step 4: Create the routes**

```js
// server/src/routes/printAgent.js
const express = require('express');
const router = express.Router();
const { authenticatePrinter } = require('../middleware/printerAuth');
const agentController = require('../controllers/print/agentController');

router.get('/next-job', authenticatePrinter, agentController.getNextJob);

module.exports = router;
```

- [ ] **Step 5: Mount the router**

In `server/src/app.js`:

```js
app.use("/api/print/agent", require("./routes/printAgent"));
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd server && npx jest tests/functional/print/agent.test.js`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/print/agentController.js server/src/routes/printAgent.js server/src/app.js server/src/tests/functional/print/agent.test.js
git commit -m "feat(print): agent next-job dispatch endpoint"
```

---

## Task 12: Agent — file download + status update

**Files:**
- Modify: `server/src/controllers/print/agentController.js`
- Modify: `server/src/routes/printAgent.js`
- Modify: `server/src/tests/functional/print/agent.test.js`

**Interfaces:**
- Produces: `GET /api/print/agent/jobs/:id/file` (streams the gcode, scoped to `req.printer`), `POST /api/print/agent/jobs/:id/status` (body `{ status: 'printing'|'completed'|'failed', errorMessage? }`) — this closes the loop from "sent" through to `awaiting_clearance` on the printer.

- [ ] **Step 1: Add the failing tests**

Append to `server/src/tests/functional/print/agent.test.js`:

```js
describe('GET /api/print/agent/jobs/:id/file', () => {
  it('streams the file for the owning printer', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const res = await request(app)
      .get(`/api/print/agent/jobs/${job._id}/file`)
      .set(printerAuthHeader(printer._id, rawKey));
    expect(res.status).toBe(200);
    expect(res.text).toContain('G1 X10');
  });

  it('returns 403 if the job belongs to a different printer', async () => {
    const { printer: printerA } = await createPrinter({ name: 'A' });
    const { printer: printerB, rawKey: keyB } = await createPrinter({ name: 'B' });
    const job = await submitAcceptedJob(printerA);

    const res = await request(app)
      .get(`/api/print/agent/jobs/${job._id}/file`)
      .set(printerAuthHeader(printerB._id, keyB));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/print/agent/jobs/:id/status', () => {
  it('printing: keeps printer in printing status', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const res = await request(app)
      .post(`/api/print/agent/jobs/${job._id}/status`)
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ status: 'printing' });

    expect(res.status).toBe(200);
    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.status).toBe('printing');
    expect(reloadedJob.startedAt).not.toBeNull();
  });

  it('completed: moves the printer to awaiting_clearance', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const res = await request(app)
      .post(`/api/print/agent/jobs/${job._id}/status`)
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.status).toBe(PRINTER_STATUSES.AWAITING_CLEARANCE);
    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.status).toBe('completed');
    expect(reloadedJob.completedAt).not.toBeNull();
  });

  it('failed: moves the printer to awaiting_clearance and records errorMessage', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const res = await request(app)
      .post(`/api/print/agent/jobs/${job._id}/status`)
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ status: 'failed', errorMessage: 'Bourrage filament' });

    expect(res.status).toBe(200);
    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.status).toBe(PRINTER_STATUSES.AWAITING_CLEARANCE);
    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.status).toBe('failed');
    expect(reloadedJob.errorMessage).toBe('Bourrage filament');
  });

  it('rejects an invalid status value', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);

    const res = await request(app)
      .post(`/api/print/agent/jobs/${job._id}/status`)
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ status: 'nonsense' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx jest tests/functional/print/agent.test.js`
Expected: FAIL — 404s on the new routes

- [ ] **Step 3: Add the controller functions**

Append to `server/src/controllers/print/agentController.js` (add these requires at the top alongside the existing ones):

```js
const fs = require('fs');
const Printer = require('../../models/Printer');
const ErrorResponse = require('../../utils/errorResponse');
const { PRINTER_STATUSES } = require('../../utils/constants');

const VALID_STATUS_UPDATES = ['printing', 'completed', 'failed'];
```

```js
// GET /api/print/agent/jobs/:id/file
exports.downloadJobFile = asyncHandler(async (req, res, next) => {
  const job = await PrintJob.findById(req.params.id);
  if (!job) return next(new ErrorResponse('Job non trouvé', 404));
  if (job.printer.toString() !== req.printer._id.toString()) {
    return next(new ErrorResponse('Ce job ne correspond pas à cette imprimante', 403));
  }

  res.download(path.resolve(job.filePath), job.fileName);
});

// POST /api/print/agent/jobs/:id/status
// Body: { status: 'printing' | 'completed' | 'failed', errorMessage? }
exports.updateJobStatus = asyncHandler(async (req, res, next) => {
  const { status, errorMessage } = req.body;
  if (!VALID_STATUS_UPDATES.includes(status)) {
    return next(new ErrorResponse('Statut invalide', 400));
  }

  const job = await PrintJob.findById(req.params.id);
  if (!job) return next(new ErrorResponse('Job non trouvé', 404));
  if (job.printer.toString() !== req.printer._id.toString()) {
    return next(new ErrorResponse('Ce job ne correspond pas à cette imprimante', 403));
  }

  job.status = status;
  job.history.push({ status, date: new Date(), detail: errorMessage || `Rapporté par l'agent: ${status}` });

  if (status === 'printing') {
    job.startedAt = new Date();
  } else {
    job.completedAt = new Date();
    if (status === 'failed') job.errorMessage = errorMessage || null;

    req.printer.status = PRINTER_STATUSES.AWAITING_CLEARANCE;
    req.printer.statusHistory.push({
      status: PRINTER_STATUSES.AWAITING_CLEARANCE,
      source: 'agent_report',
      detail: status === 'failed' ? (errorMessage || 'Échec de l\'impression') : 'Impression terminée',
      date: new Date(),
    });
    await req.printer.save();
  }

  await job.save();
  res.status(200).json({ success: true, data: job });
});
```

- [ ] **Step 4: Add the routes**

Append to `server/src/routes/printAgent.js`, before `module.exports`:

```js
router.get('/jobs/:id/file', authenticatePrinter, agentController.downloadJobFile);
router.post('/jobs/:id/status', authenticatePrinter, agentController.updateJobStatus);
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd server && npx jest tests/functional/print/agent.test.js`
Expected: PASS (9 tests)

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/print/agentController.js server/src/routes/printAgent.js server/src/tests/functional/print/agent.test.js
git commit -m "feat(print): agent file download + job status reporting"
```

---

## Task 13: Clearance confirmation (QR + admin override)

**Files:**
- Modify: `server/src/controllers/print/printerController.js`
- Modify: `server/src/routes/printPrinters.js`
- Test: `server/src/tests/functional/print/clearance.test.js`

**Interfaces:**
- Consumes: `Printer` model, `CLEARANCE_METHODS`, `PRINTER_STATUSES`.
- Produces: `POST /api/print/printers/:id/confirm-clearance` (any authenticated user), `POST /api/print/printers/:id/confirm-clearance/override` (admin only).

- [ ] **Step 1: Write the failing test**

```js
// server/src/tests/functional/print/clearance.test.js
const request = require('supertest');
const app = require('../../../app');
const Printer = require('../../../models/Printer');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');
const { PRINTER_STATUSES } = require('../../../utils/constants');

describe('POST /api/print/printers/:id/confirm-clearance', () => {
  it('returns 400 if the printer is not awaiting_clearance', async () => {
    const student = await createUser();
    const printer = await Printer.create({ name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64), status: PRINTER_STATUSES.IDLE });

    const res = await request(app)
      .post(`/api/print/printers/${printer._id}/confirm-clearance`)
      .set(authHeader(student));
    expect(res.status).toBe(400);
  });

  it('confirms clearance for any authenticated user and logs identity', async () => {
    const student = await createUser({ name: 'Jean Dupont', email: 'jean@epitech.eu' });
    const printer = await Printer.create({ name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64), status: PRINTER_STATUSES.AWAITING_CLEARANCE });

    const res = await request(app)
      .post(`/api/print/printers/${printer._id}/confirm-clearance`)
      .set(authHeader(student));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(PRINTER_STATUSES.IDLE);

    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.status).toBe(PRINTER_STATUSES.IDLE);
    expect(reloaded.clearanceHistory).toHaveLength(1);
    expect(reloaded.clearanceHistory[0].method).toBe('qr');
    expect(reloaded.clearanceHistory[0].byEmail).toBe('jean@epitech.eu');
  });
});

describe('POST /api/print/printers/:id/confirm-clearance/override', () => {
  it('returns 403 for a non-admin', async () => {
    const student = await createUser();
    const printer = await Printer.create({ name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64), status: PRINTER_STATUSES.AWAITING_CLEARANCE });
    const res = await request(app)
      .post(`/api/print/printers/${printer._id}/confirm-clearance/override`)
      .set(authHeader(student));
    expect(res.status).toBe(403);
  });

  it('confirms clearance as admin_override', async () => {
    const admin = await createAdmin();
    const printer = await Printer.create({ name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64), status: PRINTER_STATUSES.AWAITING_CLEARANCE });

    const res = await request(app)
      .post(`/api/print/printers/${printer._id}/confirm-clearance/override`)
      .set(authHeader(admin));

    expect(res.status).toBe(200);
    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.clearanceHistory[0].method).toBe('admin_override');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx jest tests/functional/print/clearance.test.js`
Expected: FAIL — 404s

- [ ] **Step 3: Add the controller function**

Append to `server/src/controllers/print/printerController.js` (add `CLEARANCE_METHODS` to the existing constants import):

```js
const confirmClearanceInternal = async (req, res, next, method) => {
  const printer = await Printer.findById(req.params.id);
  if (!printer) return next(new ErrorResponse('Imprimante non trouvée', 404));
  if (printer.status !== PRINTER_STATUSES.AWAITING_CLEARANCE) {
    return next(new ErrorResponse("Cette imprimante n'attend pas de libération de plateau", 400));
  }

  printer.status = PRINTER_STATUSES.IDLE;
  printer.currentJob = null;
  printer.clearanceHistory.push({
    method,
    byUserId: req.user._id,
    byEmail: req.user.email,
    byName: req.user.name,
    date: new Date(),
  });
  await printer.save();

  res.status(200).json({ success: true, data: { status: printer.status } });
};

// POST /api/print/printers/:id/confirm-clearance
exports.confirmClearance = asyncHandler((req, res, next) => confirmClearanceInternal(req, res, next, CLEARANCE_METHODS.QR));

// POST /api/print/printers/:id/confirm-clearance/override
exports.confirmClearanceOverride = asyncHandler((req, res, next) => confirmClearanceInternal(req, res, next, CLEARANCE_METHODS.ADMIN_OVERRIDE));
```

- [ ] **Step 4: Add the routes**

Append to `server/src/routes/printPrinters.js`, before `module.exports`:

```js
router.post('/:id/confirm-clearance', authenticateToken, printerController.confirmClearance);
router.post('/:id/confirm-clearance/override', authenticateToken, isAdmin, printerController.confirmClearanceOverride);
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd server && npx jest tests/functional/print/clearance.test.js`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/print/printerController.js server/src/routes/printPrinters.js server/src/tests/functional/print/clearance.test.js
git commit -m "feat(print): plate clearance confirmation (QR + admin override)"
```

---

## Task 14: Offline/staleness scheduler

**Files:**
- Create: `server/src/utils/printerScheduler.js`
- Modify: `server/src/index.js`
- Test: `server/src/tests/unit/printerScheduler.test.js`

**Interfaces:**
- Consumes: `Printer`, `PrintJob` models, `PRINTER_STATUSES`, `PRINTER_STATUS_SOURCES`.
- Produces: `checkStalePrinters()` (exported separately from the interval wrapper so it's testable without fake timers), `startPrinterScheduler(intervalMs)`, `stopPrinterScheduler()`.

- [ ] **Step 1: Write the failing test**

```js
// server/src/tests/unit/printerScheduler.test.js
const Printer = require('../../models/Printer');
const PrintJob = require('../../models/PrintJob');
const { checkStalePrinters, OFFLINE_THRESHOLD_MS } = require('../../utils/printerScheduler');
const { PRINTER_STATUSES } = require('../../utils/constants');

describe('checkStalePrinters', () => {
  it('leaves a recently-seen printer untouched', async () => {
    const printer = await Printer.create({
      name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64),
      status: PRINTER_STATUSES.IDLE, lastSeenAt: new Date(),
    });
    await checkStalePrinters();
    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.status).toBe(PRINTER_STATUSES.IDLE);
  });

  it('marks a silent idle printer offline with lastKnownStatus recorded', async () => {
    const staleDate = new Date(Date.now() - OFFLINE_THRESHOLD_MS - 1000);
    const printer = await Printer.create({
      name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64),
      status: PRINTER_STATUSES.IDLE, lastSeenAt: staleDate,
    });

    await checkStalePrinters();

    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.status).toBe(PRINTER_STATUSES.OFFLINE);
    expect(reloaded.lastKnownStatus).toBe(PRINTER_STATUSES.IDLE);
    expect(reloaded.statusHistory).toHaveLength(1);
    expect(reloaded.statusHistory[0].source).toBe('heartbeat_timeout');
  });

  it('auto-fails the current job of a silent printer that was printing', async () => {
    const staleDate = new Date(Date.now() - OFFLINE_THRESHOLD_MS - 1000);
    const printer = await Printer.create({
      name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64),
      status: PRINTER_STATUSES.PRINTING, lastSeenAt: staleDate,
    });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'S' }, printer: printer._id,
      fileName: 'a.gcode', filePath: '/a', status: 'printing',
    });
    printer.currentJob = job._id;
    await printer.save();

    await checkStalePrinters();

    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.status).toBe('failed');
    expect(reloadedJob.errorMessage).toMatch(/contact/i);
  });

  it('never touches a disabled printer', async () => {
    const staleDate = new Date(Date.now() - OFFLINE_THRESHOLD_MS - 1000);
    const printer = await Printer.create({
      name: 'P', model: 'kobra3', apiKeyHash: 'x'.repeat(64),
      status: PRINTER_STATUSES.DISABLED, lastSeenAt: staleDate,
    });
    await checkStalePrinters();
    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.status).toBe(PRINTER_STATUSES.DISABLED);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx jest tests/unit/printerScheduler.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Create the scheduler**

```js
// server/src/utils/printerScheduler.js
const Printer = require('../models/Printer');
const PrintJob = require('../models/PrintJob');
const { PRINTER_STATUSES, PRINTER_STATUS_SOURCES } = require('../utils/constants');

const OFFLINE_THRESHOLD_MS = 90 * 1000; // ~3x l'intervalle de polling agent attendu (15-30s)
const DEFAULT_CHECK_INTERVAL_MS = 30 * 1000;

const NEVER_STALE_STATUSES = [PRINTER_STATUSES.OFFLINE, PRINTER_STATUSES.DISABLED];

const checkStalePrinters = async () => {
  const cutoff = new Date(Date.now() - OFFLINE_THRESHOLD_MS);
  const stalePrinters = await Printer.find({
    status: { $nin: NEVER_STALE_STATUSES },
    lastSeenAt: { $ne: null, $lt: cutoff },
  });

  for (const printer of stalePrinters) {
    const priorStatus = printer.status;
    printer.lastKnownStatus = priorStatus;
    printer.status = PRINTER_STATUSES.OFFLINE;
    printer.statusHistory.push({
      status: PRINTER_STATUSES.OFFLINE,
      source: PRINTER_STATUS_SOURCES.HEARTBEAT_TIMEOUT,
      detail: `Dernier statut connu avant coupure: ${priorStatus}`,
      date: new Date(),
    });
    await printer.save();

    if (priorStatus === PRINTER_STATUSES.PRINTING && printer.currentJob) {
      await PrintJob.findByIdAndUpdate(printer.currentJob, {
        status: 'failed',
        errorMessage: "Perte de contact avec l'imprimante",
        completedAt: new Date(),
        $push: { history: { status: 'failed', date: new Date(), detail: 'Job basculé failed automatiquement (staleness imprimante)' } },
      });
    }
  }
};

let intervalHandle = null;

const startPrinterScheduler = (intervalMs = DEFAULT_CHECK_INTERVAL_MS) => {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    checkStalePrinters().catch((err) => console.error('[printerScheduler] erreur:', err.message));
  }, intervalMs);
};

const stopPrinterScheduler = () => {
  clearInterval(intervalHandle);
  intervalHandle = null;
};

module.exports = { checkStalePrinters, startPrinterScheduler, stopPrinterScheduler, OFFLINE_THRESHOLD_MS };
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npx jest tests/unit/printerScheduler.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire it into `index.js`**

```js
// server/src/index.js
require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/database');
const { startPrinterScheduler } = require('./utils/printerScheduler');

connectDB();
startPrinterScheduler();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  const dateandtime = new Date();
  console.log(dateandtime.toString());
  console.log(`Serveur démarré sur le port ${PORT}`);
});
```

- [ ] **Step 6: Commit**

```bash
git add server/src/utils/printerScheduler.js server/src/index.js server/src/tests/unit/printerScheduler.test.js
git commit -m "feat(print): offline/staleness detection scheduler"
```

---

## Task 15: Full backend regression run

**Files:** none (verification only)

- [ ] **Step 1: Run the entire backend suite**

Run: `cd server && npx jest`
Expected: all suites PASS, including every pre-existing suite (this feature must not have broken `projects`, `workshops`, `simulated`, `tools`, etc.)

- [ ] **Step 2: If anything fails, fix before moving on**

Do not proceed to the frontend tasks with a red backend suite.

---

## Task 16: Student page — submit + own history

**Files:**
- Create: `client/src/pages/print/index.js`

**Interfaces:**
- Consumes: `useApi` hook (`get`, `post`), `useAuth` (existing `AuthContext`, same as other pages), backend endpoints `GET /api/print/printers`, `POST /api/print/jobs` (multipart), `GET /api/print/jobs/me`.

- [ ] **Step 1: Read one existing student-facing page for exact layout conventions**

Open `client/src/pages/submit-project.js` and `client/src/pages/simulated/index.js` before writing this file — match their header/container/Tailwind-token usage (`bg-surface`, `border-border`, dark-mode classes, `react-toastify` for feedback) exactly rather than inventing new patterns.

- [ ] **Step 2: Build the page**

```jsx
// client/src/pages/print/index.js
import { useEffect, useState } from "react";
import { useApi } from "../../hooks/useApi";
import { toast } from "react-toastify";

const STATUS_LABELS = {
  queued: "En attente",
  sent: "Envoyé à l'imprimante",
  printing: "Impression en cours",
  completed: "Terminé",
  failed: "Échec",
  rejected: "Refusé",
};

const PRINTER_STATUS_LABELS = {
  idle: "Disponible",
  printing: "Occupée",
  awaiting_clearance: "En attente de libération",
  offline: "Hors ligne",
  error: "En erreur",
  disabled: "Désactivée",
};

export default function PrintPage() {
  const { get, post, loading } = useApi();
  const [printers, setPrinters] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState("");
  const [file, setFile] = useState(null);

  const refresh = async () => {
    const [printersRes, jobsRes] = await Promise.all([get("/api/print/printers"), get("/api/print/jobs/me")]);
    setPrinters(printersRes.data);
    setJobs(jobsRes.data);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPrinterId || !file) {
      toast.error("Choisissez une imprimante et un fichier .gcode");
      return;
    }

    const formData = new FormData();
    formData.append("printerId", selectedPrinterId);
    formData.append("file", file);

    try {
      await post("/api/print/jobs", formData);
      toast.success("Impression soumise");
      setFile(null);
      await refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const selectedPrinter = printers.find((p) => p._id === selectedPrinterId);
  const canSubmit = selectedPrinter?.status === "idle";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Impression 3D</h1>

      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-6 mb-8 space-y-4">
        <div>
          <label className="block mb-2 font-medium">Imprimante</label>
          <select
            className="w-full rounded-lg border border-border bg-surface px-3 py-2"
            value={selectedPrinterId}
            onChange={(e) => setSelectedPrinterId(e.target.value)}
          >
            <option value="">— Choisir —</option>
            {printers.map((p) => (
              <option key={p._id} value={p._id} disabled={p.status !== "idle"}>
                {p.name} — {PRINTER_STATUS_LABELS[p.status] || p.status}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block mb-2 font-medium">Fichier .gcode</label>
          <input
            type="file"
            accept=".gcode"
            onChange={(e) => setFile(e.target.files[0] || null)}
            className="w-full"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !canSubmit}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-50"
        >
          Soumettre l'impression
        </button>
        {selectedPrinter && !canSubmit && (
          <p className="text-sm text-red-500">
            Cette imprimante n'est pas disponible ({PRINTER_STATUS_LABELS[selectedPrinter.status]}).
          </p>
        )}
      </form>

      <h2 className="text-xl font-semibold mb-4">Mes impressions</h2>
      <div className="space-y-2">
        {jobs.map((job) => (
          <div key={job._id} className="bg-surface border border-border rounded-lg p-4 flex justify-between">
            <span>{job.fileName}</span>
            <span className="text-sm">{STATUS_LABELS[job.status] || job.status}</span>
          </div>
        ))}
        {jobs.length === 0 && <p className="text-sm opacity-70">Aucune impression pour le moment.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Manually verify in the browser**

Run: `cd client && npm run dev` (if not already running), and separately `cd server && npm run dev` (or existing dev script).

Checklist:
- Log in as a whitelisted student (add via `POST /api/print/whitelist` as an admin, or directly in Mongo for local testing), navigate to `/print`.
- Confirm the printer dropdown shows created printers with correct status labels, and non-idle printers are disabled in the `<select>`.
- Submit a `.gcode` file on an idle printer → toast success, job appears in "Mes impressions" as "En attente".
- Log in as a non-whitelisted student, attempt submission → toast shows the backend's 403 error message.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/print/index.js
git commit -m "feat(print): student print submission page"
```

---

## Task 17: Clearance QR landing page

**Files:**
- Create: `client/src/pages/print/printers/[id]/confirm-clearance.js`

**Interfaces:**
- Consumes: `useApi` (`get`, `post`), `GET /api/print/printers` (to fetch the printer's name for display — reuse the list endpoint and filter client-side, since there is no single-printer GET yet and adding one is unnecessary for a page that only needs the name), `POST /api/print/printers/:id/confirm-clearance`.

- [ ] **Step 1: Build the page**

```jsx
// client/src/pages/print/printers/[id]/confirm-clearance.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useApi } from "../../../../hooks/useApi";
import { useAuth } from "../../../../context/AuthContext";
import { toast } from "react-toastify";

export default function ConfirmClearancePage() {
  const router = useRouter();
  const { id } = router.query;
  const { isAuthenticated } = useAuth();
  const { get, post, loading } = useApi();
  const [printerName, setPrinterName] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!id || !isAuthenticated) return;
    get("/api/print/printers").then((res) => {
      const printer = res.data.find((p) => p._id === id);
      setPrinterName(printer ? printer.name : "");
    });
  }, [id, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p>Connectez-vous pour confirmer la libération de cette imprimante.</p>
      </div>
    );
  }

  const handleConfirm = async () => {
    try {
      await post(`/api/print/printers/${id}/confirm-clearance`, {});
      setConfirmed(true);
      toast.success("Merci, l'imprimante est de nouveau disponible.");
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <h1 className="text-xl font-bold mb-4">{printerName || "Imprimante"}</h1>

      {confirmed ? (
        <p className="text-green-600 font-medium">Libération confirmée, merci.</p>
      ) : (
        <>
          <p className="mb-6 font-medium">
            Vous certifiez que le plateau d'impression est vide. Toute fausse déclaration engage
            votre responsabilité et pourra entraîner une suspension d'accès aux imprimantes.
          </p>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg disabled:opacity-50"
          >
            Je confirme, le plateau est vide
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manually verify in the browser**

Checklist:
- Set a printer's status to `awaiting_clearance` directly in Mongo (or via a completed job, once Task 16 has produced one and it's marked `completed` through the agent endpoints via curl/Postman).
- Visit `/print/printers/<id>/confirm-clearance` while logged out → shows the "connectez-vous" message, not the certification button.
- Log in, revisit the same URL → shows printer name + certification message + button.
- Click confirm → success message, and re-visiting shows the printer back at `idle` if reloaded (or check via `/api/print/printers`).
- Attempt confirming a printer that's already `idle` → backend 400 surfaces as a toast error.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/print/printers/[id]/confirm-clearance.js
git commit -m "feat(print): QR clearance confirmation landing page"
```

---

## Task 18: Admin dashboard — printers, whitelist, job log

**Files:**
- Create: `client/src/pages/admin/print/index.js`

**Interfaces:**
- Consumes: `useApi`, all admin endpoints from Tasks 6-10 and 13 (`GET/POST /api/print/printers`, `PATCH /api/print/printers/:id/disabled`, `POST /api/print/printers/:id/regenerate-key`, `GET/POST /api/print/whitelist`, `GET /api/print/jobs`).

- [ ] **Step 1: Read `client/src/pages/admin/simulated/index.js` first**

This is the closest existing admin page (list + review pattern for a submission-based feature) — match its section/table/card layout and Tailwind tokens rather than inventing a new admin layout.

- [ ] **Step 2: Build the page**

```jsx
// client/src/pages/admin/print/index.js
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApi } from "../../../hooks/useApi";
import { toast } from "react-toastify";

export default function AdminPrintPage() {
  const { get, post, patch, loading } = useApi();
  const [printers, setPrinters] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [newPrinterName, setNewPrinterName] = useState("");
  const [newPrinterModel, setNewPrinterModel] = useState("kobra3");
  const [newEmail, setNewEmail] = useState("");
  const [newEmailNote, setNewEmailNote] = useState("");
  const [createdKey, setCreatedKey] = useState(null);

  const refresh = async () => {
    const [printersRes, whitelistRes, jobsRes] = await Promise.all([
      get("/api/print/printers"),
      get("/api/print/whitelist"),
      get("/api/print/jobs"),
    ]);
    setPrinters(printersRes.data);
    setWhitelist(whitelistRes.data);
    setJobs(jobsRes.data);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreatePrinter = async (e) => {
    e.preventDefault();
    try {
      const res = await post("/api/print/printers", { name: newPrinterName, model: newPrinterModel });
      setCreatedKey(res.data.apiKey);
      setNewPrinterName("");
      await refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleDisabled = async (printer) => {
    const disabling = printer.status !== "disabled";
    const note = window.prompt(
      disabling ? "Raison de la désactivation ?" : "Note de réactivation ?"
    );
    if (!note) return;
    try {
      await patch(`/api/print/printers/${printer._id}/disabled`, { disabled: disabling, note });
      await refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleWhitelistSubmit = async (e) => {
    e.preventDefault();
    try {
      await post("/api/print/whitelist", { email: newEmail, authorized: true, note: newEmailNote });
      setNewEmail("");
      setNewEmailNote("");
      await refresh();
      toast.success("Email autorisé");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRevoke = async (email) => {
    const note = window.prompt("Raison de la révocation ?");
    if (!note) return;
    try {
      await post("/api/print/whitelist", { email, authorized: false, note });
      await refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
      <h1 className="text-2xl font-bold">Administration — Impression 3D</h1>

      <section>
        <h2 className="text-xl font-semibold mb-4">Imprimantes</h2>
        <form onSubmit={handleCreatePrinter} className="flex gap-2 mb-4">
          <input
            className="rounded-lg border border-border px-3 py-2 flex-1"
            placeholder="Nom (ex: Kobra 3 - Atelier A)"
            value={newPrinterName}
            onChange={(e) => setNewPrinterName(e.target.value)}
          />
          <select
            className="rounded-lg border border-border px-3 py-2"
            value={newPrinterModel}
            onChange={(e) => setNewPrinterModel(e.target.value)}
          >
            <option value="kobra3">Kobra 3</option>
            <option value="kobra3max">Kobra 3 Max</option>
          </select>
          <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg">
            Ajouter
          </button>
        </form>

        {createdKey && (
          <div className="bg-yellow-100 text-yellow-900 border border-yellow-300 rounded-lg p-3 mb-4 text-sm">
            Clé API (à noter maintenant, elle ne sera plus jamais affichée) : <code>{createdKey}</code>
          </div>
        )}

        <div className="space-y-2">
          {printers.map((printer) => (
            <div key={printer._id} className="bg-surface border border-border rounded-lg p-4 flex justify-between items-center">
              <div>
                <p className="font-medium">{printer.name}</p>
                <p className="text-sm opacity-70">{printer.model} — {printer.status}</p>
              </div>
              <div className="flex gap-2">
                <Link href={`/admin/print/printers/${printer._id}/qr`} className="text-sm text-blue-600 underline">
                  QR code
                </Link>
                <button onClick={() => handleToggleDisabled(printer)} className="text-sm underline">
                  {printer.status === "disabled" ? "Réactiver" : "Désactiver"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Whitelist</h2>
        <form onSubmit={handleWhitelistSubmit} className="flex gap-2 mb-4">
          <input
            className="rounded-lg border border-border px-3 py-2 flex-1"
            placeholder="email@epitech.eu"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <input
            className="rounded-lg border border-border px-3 py-2 flex-1"
            placeholder="Note (obligatoire)"
            value={newEmailNote}
            onChange={(e) => setNewEmailNote(e.target.value)}
          />
          <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg">
            Autoriser
          </button>
        </form>
        <div className="space-y-1">
          {whitelist.map((entry) => (
            <div key={entry._id} className="flex justify-between text-sm py-1 border-b border-border">
              <span>{entry.email}</span>
              <span>{entry.authorized ? "Autorisé" : "Refusé"}</span>
              {entry.authorized && (
                <button onClick={() => handleRevoke(entry.email)} className="underline">Révoquer</button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Journal des impressions</h2>
        <div className="space-y-1">
          {jobs.map((job) => (
            <div key={job._id} className="flex justify-between text-sm py-1 border-b border-border">
              <span>{job.student.email}</span>
              <span>{job.fileName}</span>
              <span>{job.status}{job.rejectionReason ? ` (${job.rejectionReason})` : ""}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Manually verify in the browser**

Checklist:
- Log in as admin, go to `/admin/print`.
- Create a printer → the raw API key banner appears once; refresh the page and confirm it's gone (never re-shown).
- Disable a printer with a note → status updates in the list; re-enable it.
- Whitelist an email with a note, then revoke it → whitelist table reflects both states.
- Submit a job as a student from Task 16, confirm it shows up in "Journal des impressions" with the right status/reason.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/print/index.js
git commit -m "feat(print): admin dashboard for printers, whitelist, and job log"
```

---

## Task 19: Admin QR print/download page

**Files:**
- Create: `client/src/pages/admin/print/printers/[id]/qr.js`

**Interfaces:**
- Consumes: `GET /api/print/printers/:id/qr` (returns a PNG image directly — rendered as an `<img>` `src`, not fetched through `useApi`, since it's a binary image response, not JSON).

- [ ] **Step 1: Build the page**

```jsx
// client/src/pages/admin/print/printers/[id]/qr.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../../../../context/AuthContext";

// Le endpoint QR exige un Bearer token (admin), non transmissible via un simple <img src>.
// On charge donc l'image nous-mêmes puis on l'affiche en object URL.
function QrImage({ qrUrl, token }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    fetch(qrUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => setSrc(URL.createObjectURL(blob)));
  }, [qrUrl, token]);

  if (!src) return <p>Chargement…</p>;
  return <img src={src} alt="QR code de libération" className="mx-auto" />;
}

export default function PrinterQrPage() {
  const router = useRouter();
  const { id } = router.query;
  const { token } = useAuth();

  if (!id || !token) return null;

  const qrUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/print/printers/${id}/qr`;

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <h1 className="text-xl font-bold mb-6">QR code — à imprimer et coller sur l'imprimante</h1>
      <QrImage qrUrl={qrUrl} token={token} />
    </div>
  );
}
```

- [ ] **Step 2: Manually verify in the browser**

Checklist:
- From `/admin/print`, click "QR code" on a printer → image loads and visibly encodes a URL (scan it with a phone to confirm it points at `<FRONTEND_URL>/print/printers/<id>/confirm-clearance`).
- Right-click → save/print the image, confirm it's a clean, scannable QR (not corrupted by the blob/data-URL roundtrip).

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/admin/print/printers/[id]/qr.js
git commit -m "feat(print): admin printable QR code page"
```

---

## Self-Review Notes

- **Spec coverage:** whitelist default-deny (Task 9), printer_busy/offline/error/disabled rejection reasons (Task 9), atomic race lock (Task 9), dispatch/exécution/fin d'impression workflow (Tasks 11-12), awaiting_clearance + QR + admin override (Task 13), statusHistory with agent_report/admin_action/heartbeat_timeout sources (Tasks 7, 11 reconnection logic in Task 4, 14), offline staleness + auto-fail (Task 14), reconnection transition (Task 4). The agent script itself (the thing that will actually run on the Kobra 3 hardware) is explicitly out of scope, per the spec's own "Dépendances / prérequis" section flagging the runtime as unresolved.
- **Type consistency:** `PRINTER_STATUSES`, `PRINT_JOB_STATUSES`, `PRINT_REJECTION_REASONS`, `PRINTER_STATUS_SOURCES`, `CLEARANCE_METHODS` are defined once in Task 1/3 and referenced identically (never redefined) in every later task. `req.printer` is set exactly once, in Task 4's middleware, and consumed as-is in Tasks 11-12.
- **No placeholders:** every step has real, runnable code matching the repo's actual conventions (verified against `simulatedEnrollment`/`simulatedProject` controllers, `auth.js`, `upload.js`, `errorHandler.js`, and the existing functional test suite before writing this plan).
