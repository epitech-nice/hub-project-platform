# Annulation d'une impression en cours — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owning student or an admin cancel a `queued`/`sent`/`printing` print job from the Hub UI, with the agent discovering and executing the cancellation on its next tick (pull-only, no new channel to the printer).

**Architecture:** `POST /api/print/jobs/:id/cancel` resolves synchronously for `queued` jobs (never physically started — printer freed immediately) and asynchronously for `sent`/`printing` jobs (sets `cancelRequestedAt`, printer stays locked). The agent's existing heartbeat call is extended to carry `cancelRequested`; when true and Moonraker still reports an active print, the agent calls Moonraker's cancel endpoint and reports `cancelled` back to the hub through the existing status-update endpoint, which already routes any non-`printing` terminal status to `awaiting_clearance`.

**Tech Stack:** Node.js/Express/Mongoose (backend), Python/`requests` (printer-agent), Next.js pages router + Tailwind (frontend). Backend tests: Jest + Supertest. Agent tests: pytest + `requests_mock`.

**Spec:** `docs/superpowers/specs/2026-09-08-annulation-impression-design.md` — this plan implements it section by section; read both together.

## Global Constraints

- No new communication channel to the printer: the agent stays strictly pull-only (heartbeat/tick every ~60s). Do not add a faster polling path or a push mechanism.
- No new intermediate job status (e.g. `cancelling`): use the existing `status` field plus a separate `cancelRequestedAt` timestamp, exactly as the spec specifies.
- `GET /api/print/agent/heartbeat` currently returns bare `204 No Content` — it must become `200` with a JSON body (`{ success: true, cancelRequested }`) since a 204 cannot carry a payload. This is a deliberate breaking change to that one endpoint's contract; update every test that asserts `204` on it.
- A real Moonraker terminal state (`complete`/`error`/`cancelled`) discovered at the same tick as a cancellation request always wins — never overwrite a legitimate `completed`/`failed` report with `cancelled`.
- Out of scope (do not touch): bobine/ACE selection, `job.errorMessage` display gaps, faster-than-60s cancellation, pause/resume.

---

### Task 1: `cancelled` status + cancellation fields on `PrintJob`

**Files:**
- Modify: `server/src/utils/constants.js`
- Modify: `server/src/models/PrintJob.js`
- Test: `server/src/tests/unit/printJobModel.test.js`

**Interfaces:**
- Produces: `PRINT_JOB_STATUSES.CANCELLED === 'cancelled'`; `PrintJob.cancelRequestedAt: Date | null`; `PrintJob.cancelledBy: { email: string|null, role: string|null }`. Every later task reads/writes these exact names.

- [ ] **Step 1: Write the failing test**

Add to `server/src/tests/unit/printJobModel.test.js`:

```js
  it('accepts a cancelled status with cancelRequestedAt and cancelledBy', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'Student' },
      printer: printer._id,
      fileName: 'part.gcode',
      filePath: '/uploads/print-jobs/1-part.gcode',
      status: PRINT_JOB_STATUSES.CANCELLED,
      cancelRequestedAt: new Date(),
      cancelledBy: { email: 'admin@epitech.eu', role: 'admin' },
    });
    expect(job.status).toBe('cancelled');
    expect(job.cancelledBy.email).toBe('admin@epitech.eu');
  });

  it('defaults cancelRequestedAt and cancelledBy to null/empty when not set', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'Student' },
      printer: printer._id,
      fileName: 'part.gcode',
      filePath: '/x',
    });
    expect(job.cancelRequestedAt).toBeNull();
    expect(job.cancelledBy.email).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/tests/unit/printJobModel.test.js -v`
Expected: FAIL — `PRINT_JOB_STATUSES.CANCELLED` is `undefined`, so `status: undefined` fails the required-ish path or the first assertion (`job.status`) doesn't equal `'cancelled'`; the second test fails because `cancelledBy` is `undefined`, not an object.

- [ ] **Step 3: Add the status and fields**

In `server/src/utils/constants.js`, extend the enum (keep spec order):

```js
// Statuts d'un job d'impression
const PRINT_JOB_STATUSES = {
  REJECTED: 'rejected',
  QUEUED: 'queued',
  SENT: 'sent',
  PRINTING: 'printing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};
```

In `server/src/models/PrintJob.js`, add after `errorMessage`:

```js
  cancelRequestedAt: { type: Date, default: null },
  cancelledBy: {
    email: { type: String, default: null },
    role: { type: String, default: null },
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest src/tests/unit/printJobModel.test.js -v`
Expected: PASS (all 4 tests in the file, including the 2 pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add server/src/utils/constants.js server/src/models/PrintJob.js server/src/tests/unit/printJobModel.test.js
git commit -m "feat(print): add cancelled status and cancellation fields to PrintJob"
```

---

### Task 2: `POST /api/print/jobs/:id/cancel`

**Files:**
- Modify: `server/src/controllers/print/jobController.js`
- Modify: `server/src/routes/printJobs.js`
- Test: Create `server/src/tests/functional/print/jobCancel.test.js`

**Interfaces:**
- Consumes: `PRINT_JOB_STATUSES`, `PRINTER_STATUSES` from Task 1/existing constants; `PrintJob.cancelRequestedAt`/`cancelledBy` from Task 1.
- Produces: `jobController.cancelJob` (exported), route `POST /api/print/jobs/:id/cancel`. Later tasks (frontend) call this exact path with an empty JSON body.

- [ ] **Step 1: Write the failing tests**

Create `server/src/tests/functional/print/jobCancel.test.js`:

```js
const request = require('supertest');
const app = require('../../../app');
const PrintJob = require('../../../models/PrintJob');
const Printer = require('../../../models/Printer');
const { createUser, createAdmin, authHeader } = require('../../helpers/auth');
const { createPrinter, whitelistEmail, printerAuthHeader } = require('../../helpers/print');
const { PRINTER_STATUSES } = require('../../../utils/constants');

const submitAcceptedJob = async (printer, student) => {
  const res = await request(app)
    .post('/api/print/jobs')
    .set(authHeader(student))
    .field('printerId', printer._id.toString())
    .attach('file', Buffer.from('G1 X10\n'), 'part.gcode');
  return res.body.data;
};

describe('POST /api/print/jobs/:id/cancel', () => {
  it('returns 401 without auth', async () => {
    const { printer } = await createPrinter();
    const job = await PrintJob.create({
      student: { email: 'a@epitech.eu', name: 'A' },
      printer: printer._id,
      fileName: 'a.gcode',
      filePath: '/a',
    });
    const res = await request(app).post(`/api/print/jobs/${job._id}/cancel`);
    expect(res.status).toBe(401);
  });

  it("returns 403 when a student tries to cancel another student's job", async () => {
    const owner = await createUser({ email: 'owner@epitech.eu' });
    const intruder = await createUser({ email: 'intruder@epitech.eu' });
    const { printer } = await createPrinter();
    const job = await PrintJob.create({
      student: { email: owner.email, name: owner.name },
      printer: printer._id,
      fileName: 'a.gcode',
      filePath: '/a',
      status: 'queued',
    });

    const res = await request(app).post(`/api/print/jobs/${job._id}/cancel`).set(authHeader(intruder));
    expect(res.status).toBe(403);
  });

  it('cancels a queued job synchronously and frees the printer', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer } = await createPrinter();
    const job = await submitAcceptedJob(printer, student);

    const res = await request(app).post(`/api/print/jobs/${job._id}/cancel`).set(authHeader(student));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.cancelledBy.email).toBe(student.email);

    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.status).toBe(PRINTER_STATUSES.IDLE);
    expect(reloadedPrinter.currentJob).toBeNull();
  });

  it('lets an admin cancel any queued job', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const admin = await createAdmin();
    const { printer } = await createPrinter();
    const job = await submitAcceptedJob(printer, student);

    const res = await request(app).post(`/api/print/jobs/${job._id}/cancel`).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });

  it('requests cancellation asynchronously for a sent job without changing its status yet', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer, student);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const res = await request(app).post(`/api/print/jobs/${job._id}/cancel`).set(authHeader(student));
    expect(res.status).toBe(202);
    expect(res.body.data.status).toBe('sent');

    const reloaded = await PrintJob.findById(job._id);
    expect(reloaded.status).toBe('sent');
    expect(reloaded.cancelRequestedAt).not.toBeNull();
    expect(reloaded.cancelledBy.email).toBe(student.email);
  });

  it('is a no-op on a second cancel request for the same in-progress job', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    await whitelistEmail(student.email);
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer, student);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const first = await request(app).post(`/api/print/jobs/${job._id}/cancel`).set(authHeader(student));
    expect(first.status).toBe(202);
    const firstReload = await PrintJob.findById(job._id);

    const second = await request(app).post(`/api/print/jobs/${job._id}/cancel`).set(authHeader(student));
    expect(second.status).toBe(202);

    const secondReload = await PrintJob.findById(job._id);
    expect(secondReload.cancelRequestedAt.getTime()).toBe(firstReload.cancelRequestedAt.getTime());
    expect(secondReload.history.length).toBe(firstReload.history.length);
  });

  it('rejects cancelling a job already in a terminal state', async () => {
    const student = await createUser({ email: 'ok@epitech.eu' });
    const { printer } = await createPrinter();
    const job = await PrintJob.create({
      student: { email: student.email, name: student.name },
      printer: printer._id,
      fileName: 'a.gcode',
      filePath: '/a',
      status: 'completed',
    });

    const res = await request(app).post(`/api/print/jobs/${job._id}/cancel`).set(authHeader(student));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/tests/functional/print/jobCancel.test.js -v`
Expected: FAIL — `404` on every request (no `/cancel` route registered, and `jobController.cancelJob` doesn't exist).

- [ ] **Step 3: Implement `cancelJob`**

In `server/src/controllers/print/jobController.js`, add at the end of the file (constants `PRINTER_STATUSES` and `PRINT_JOB_STATUSES` are already imported on line 7):

```js
// POST /api/print/jobs/:id/cancel
exports.cancelJob = asyncHandler(async (req, res, next) => {
  const job = await PrintJob.findById(req.params.id);
  if (!job) return next(new ErrorResponse('Job non trouvé', 404));

  const isOwner = job.student.email === req.user.email.toLowerCase();
  if (req.user.role !== 'admin' && !isOwner) {
    return next(new ErrorResponse('Vous ne pouvez annuler que vos propres impressions', 403));
  }

  const cancelledBy = { email: req.user.email.toLowerCase(), role: req.user.role };

  if (job.status === PRINT_JOB_STATUSES.QUEUED) {
    job.status = PRINT_JOB_STATUSES.CANCELLED;
    job.cancelledBy = cancelledBy;
    job.history.push({ status: PRINT_JOB_STATUSES.CANCELLED, date: new Date(), detail: 'Annulée avant impression' });
    await job.save();

    await Printer.findByIdAndUpdate(job.printer, { status: PRINTER_STATUSES.IDLE, currentJob: null });

    return res.status(200).json({ success: true, data: job });
  }

  if ([PRINT_JOB_STATUSES.SENT, PRINT_JOB_STATUSES.PRINTING].includes(job.status)) {
    if (job.cancelRequestedAt) {
      return res.status(202).json({ success: true, data: job });
    }
    job.cancelRequestedAt = new Date();
    job.cancelledBy = cancelledBy;
    job.history.push({ status: job.status, date: new Date(), detail: 'Annulation demandée' });
    await job.save();
    return res.status(202).json({ success: true, data: job });
  }

  return next(new ErrorResponse('Ce job ne peut plus être annulé', 400));
});
```

In `server/src/routes/printJobs.js`, add the route (after the `/me` route, before `/:id` so it reads naturally — order doesn't affect matching since the methods differ):

```js
router.post('/:id/cancel', authenticateToken, jobController.cancelJob);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest src/tests/functional/print/jobCancel.test.js -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Run the full print test suite to check for regressions**

Run: `cd server && npx jest src/tests/functional/print src/tests/unit -v`
Expected: PASS (no regressions in submitJob/getJobs/etc.)

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/print/jobController.js server/src/routes/printJobs.js server/src/tests/functional/print/jobCancel.test.js
git commit -m "feat(print): add POST /api/print/jobs/:id/cancel endpoint"
```

---

### Task 3: Extend agent heartbeat with `cancelRequested`

**Files:**
- Modify: `server/src/controllers/print/agentController.js`
- Modify: `server/src/tests/functional/print/agentHeartbeat.test.js`

**Interfaces:**
- Consumes: `Printer.currentJob`, `PrintJob.cancelRequestedAt`/`status` (Task 1).
- Produces: `GET /api/print/agent/heartbeat` now returns `200` with `{ success: true, cancelRequested: boolean }` instead of bare `204`. Task 6 (Python `HubClient.heartbeat`) depends on this exact shape.

- [ ] **Step 1: Write the failing tests**

Replace the single existing test in `server/src/tests/functional/print/agentHeartbeat.test.js` (the `it('returns 204 ...')` one) and add new ones — full new file content:

```js
const request = require('supertest');
const app = require('../../../app');
const Printer = require('../../../models/Printer');
const PrintJob = require('../../../models/PrintJob');
const { generateApiKey } = require('../../../utils/apiKey');

describe('GET /api/print/agent/heartbeat', () => {
  it('returns 401 with no auth headers', async () => {
    const res = await request(app).get('/api/print/agent/heartbeat');
    expect(res.status).toBe(401);
  });

  it('returns 200 with a valid printer and updates lastSeenAt', async () => {
    const { rawKey, hash } = generateApiKey();
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: hash });
    const before = printer.lastSeenAt;

    const res = await request(app)
      .get('/api/print/agent/heartbeat')
      .set('x-printer-id', printer._id.toString())
      .set('x-api-key', rawKey);

    expect(res.status).toBe(200);
    expect(res.body.cancelRequested).toBe(false);

    const reloaded = await Printer.findById(printer._id);
    expect(reloaded.lastSeenAt).not.toBeNull();
    expect(reloaded.lastSeenAt).not.toEqual(before);
    expect(Date.now() - reloaded.lastSeenAt.getTime()).toBeLessThan(5000);
  });

  it('reports cancelRequested false when there is no current job', async () => {
    const { rawKey, hash } = generateApiKey();
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: hash });

    const res = await request(app)
      .get('/api/print/agent/heartbeat')
      .set('x-printer-id', printer._id.toString())
      .set('x-api-key', rawKey);

    expect(res.body.cancelRequested).toBe(false);
  });

  it('reports cancelRequested true when the current job has a pending cancellation', async () => {
    const { rawKey, hash } = generateApiKey();
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: hash });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'S' },
      printer: printer._id,
      fileName: 'a.gcode',
      filePath: '/a',
      status: 'printing',
      cancelRequestedAt: new Date(),
    });
    printer.currentJob = job._id;
    await printer.save();

    const res = await request(app)
      .get('/api/print/agent/heartbeat')
      .set('x-printer-id', printer._id.toString())
      .set('x-api-key', rawKey);

    expect(res.body.cancelRequested).toBe(true);
  });

  it('reports cancelRequested false once the job is already cancelled', async () => {
    const { rawKey, hash } = generateApiKey();
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: hash });
    const job = await PrintJob.create({
      student: { email: 's@epitech.eu', name: 'S' },
      printer: printer._id,
      fileName: 'a.gcode',
      filePath: '/a',
      status: 'cancelled',
      cancelRequestedAt: new Date(),
    });
    printer.currentJob = job._id;
    await printer.save();

    const res = await request(app)
      .get('/api/print/agent/heartbeat')
      .set('x-printer-id', printer._id.toString())
      .set('x-api-key', rawKey);

    expect(res.body.cancelRequested).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/tests/functional/print/agentHeartbeat.test.js -v`
Expected: FAIL — current handler always returns `204` with no body, so `res.body.cancelRequested` is `undefined`, not `false`/`true`.

- [ ] **Step 3: Implement the extended heartbeat**

In `server/src/controllers/print/agentController.js`, update the import line and the `heartbeat` handler:

```js
const { PRINTER_STATUSES, PRINTER_STATUS_SOURCES, PRINT_JOB_STATUSES } = require('../../utils/constants');

const TERMINAL_JOB_STATUSES = [
  PRINT_JOB_STATUSES.COMPLETED,
  PRINT_JOB_STATUSES.FAILED,
  PRINT_JOB_STATUSES.CANCELLED,
  PRINT_JOB_STATUSES.REJECTED,
];

// GET /api/print/agent/heartbeat
exports.heartbeat = asyncHandler(async (req, res) => {
  let cancelRequested = false;

  if (req.printer.currentJob) {
    const job = await PrintJob.findById(req.printer.currentJob);
    cancelRequested = !!(job && job.cancelRequestedAt && !TERMINAL_JOB_STATUSES.includes(job.status));
  }

  res.status(200).json({ success: true, cancelRequested });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest src/tests/functional/print/agentHeartbeat.test.js -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/print/agentController.js server/src/tests/functional/print/agentHeartbeat.test.js
git commit -m "feat(print): extend agent heartbeat with cancelRequested flag"
```

---

### Task 4: Accept `cancelled` in `POST /api/print/agent/jobs/:id/status`

**Files:**
- Modify: `server/src/controllers/print/agentController.js`
- Modify: `server/src/tests/functional/print/agent.test.js`

**Interfaces:**
- Consumes: `PRINT_JOB_STATUSES.CANCELLED` (Task 1).
- Produces: the status-update endpoint now accepts `status: 'cancelled'` and treats it exactly like `completed`/`failed` (moves the printer to `awaiting_clearance`, becomes idempotency-terminal). Task 7 (Python agent) reports this exact status string.

- [ ] **Step 1: Write the failing tests**

Add to `server/src/tests/functional/print/agent.test.js`, inside `describe('POST /api/print/agent/jobs/:id/status', ...)`:

```js
  it('cancelled: moves the printer to awaiting_clearance', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const res = await request(app)
      .post(`/api/print/agent/jobs/${job._id}/status`)
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    const reloadedPrinter = await Printer.findById(printer._id);
    expect(reloadedPrinter.status).toBe(PRINTER_STATUSES.AWAITING_CLEARANCE);
    const reloadedJob = await PrintJob.findById(job._id);
    expect(reloadedJob.status).toBe('cancelled');
  });

  it('rejects a second status update on an already-cancelled job (idempotency)', async () => {
    const { printer, rawKey } = await createPrinter();
    const job = await submitAcceptedJob(printer);
    await request(app).get('/api/print/agent/next-job').set(printerAuthHeader(printer._id, rawKey));

    const first = await request(app)
      .post(`/api/print/agent/jobs/${job._id}/status`)
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ status: 'cancelled' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/print/agent/jobs/${job._id}/status`)
      .set(printerAuthHeader(printer._id, rawKey))
      .send({ status: 'cancelled' });
    expect(second.status).toBe(409);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/tests/functional/print/agent.test.js -v`
Expected: FAIL — `'cancelled'` isn't in `VALID_STATUS_UPDATES`, so both requests return `400`.

- [ ] **Step 3: Implement**

In `server/src/controllers/print/agentController.js`:

```js
const VALID_STATUS_UPDATES = ['printing', 'completed', 'failed', 'cancelled'];
```

And in `updateJobStatus`, extend the idempotency guard:

```js
  if (['completed', 'failed', 'cancelled'].includes(job.status)) {
    return next(new ErrorResponse('Ce job est déjà dans un état terminal', 409));
  }
```

No other change needed: the existing `else` branch (anything that isn't `'printing'`) already sets `completedAt`, pushes history, and moves the printer to `awaiting_clearance` — the spec calls for `cancelled` to go through that exact same path unmodified.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest src/tests/functional/print/agent.test.js -v`
Expected: PASS (all tests in the file, including the 2 new ones)

- [ ] **Step 5: Run the full backend suite**

Run: `cd server && npx jest -v`
Expected: PASS, no regressions anywhere in the backend.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/print/agentController.js server/src/tests/functional/print/agent.test.js
git commit -m "feat(print): accept cancelled as a terminal agent-reported status"
```

---

### Task 5: `MoonrakerClient.cancel_print()`

**Files:**
- Modify: `printer-agent/agent/moonraker_client.py`
- Test: `printer-agent/tests/test_moonraker_client.py`

**Interfaces:**
- Produces: `MoonrakerClient.cancel_print()` — `POST {base_url}/printer/print/cancel`, no return value, raises `MoonrakerClientError` on any HTTP error or network failure. Task 7 calls this exact method with no arguments.

- [ ] **Step 1: Write the failing tests**

Add to `printer-agent/tests/test_moonraker_client.py`:

```python
def test_cancel_print_success():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/printer/print/cancel", json={"result": "ok"})
        client.cancel_print()
    assert m.last_request.method == "POST"


def test_cancel_print_raises_on_http_error():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/printer/print/cancel", status_code=500, text="internal error")
        with pytest.raises(MoonrakerClientError):
            client.cancel_print()


def test_cancel_print_raises_on_network_error():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/printer/print/cancel", exc=requests.exceptions.ConnectTimeout)
        with pytest.raises(MoonrakerClientError):
            client.cancel_print()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd printer-agent && .venv/bin/pytest tests/test_moonraker_client.py -v -k cancel_print`
Expected: FAIL — `AttributeError: 'MoonrakerClient' object has no attribute 'cancel_print'`

- [ ] **Step 3: Implement**

In `printer-agent/agent/moonraker_client.py`, add after `get_print_stats`:

```python
    def cancel_print(self):
        url = f"{self.base_url}/printer/print/cancel"
        try:
            response = requests.post(url, timeout=self.timeout)
        except requests.RequestException as exc:
            raise MoonrakerClientError(f"Moonraker injoignable lors de l'annulation: {exc}") from exc

        if response.status_code >= 400:
            raise MoonrakerClientError(
                f"Erreur Moonraker à l'annulation (HTTP {response.status_code}): {response.text}"
            )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd printer-agent && .venv/bin/pytest tests/test_moonraker_client.py -v`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add printer-agent/agent/moonraker_client.py printer-agent/tests/test_moonraker_client.py
git commit -m "feat(agent): add MoonrakerClient.cancel_print()"
```

---

### Task 6: `HubClient.heartbeat()` returns `cancelRequested`

**Files:**
- Modify: `printer-agent/agent/hub_client.py`
- Test: `printer-agent/tests/test_hub_client.py`

**Interfaces:**
- Consumes: the `{ success: true, cancelRequested: boolean }` body from Task 3.
- Produces: `HubClient.heartbeat() -> bool`. Task 7's `run_tick` calls `hub.heartbeat()` and uses the return value directly.

- [ ] **Step 1: Update the existing test and add new ones**

In `printer-agent/tests/test_hub_client.py`, replace `test_heartbeat_sends_auth_headers`:

```python
def test_heartbeat_sends_auth_headers():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/heartbeat", json={"success": True, "cancelRequested": False})
        result = client.heartbeat()
    assert result is False
    assert m.last_request.method == "GET"
    assert m.last_request.headers["x-printer-id"] == "printer-1"
    assert m.last_request.headers["x-api-key"] == "secret-key"


def test_heartbeat_returns_true_when_cancellation_requested():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/heartbeat", json={"success": True, "cancelRequested": True})
        assert client.heartbeat() is True
```

`test_heartbeat_raises_on_failure` stays unchanged — a `500` still raises regardless of body shape.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd printer-agent && .venv/bin/pytest tests/test_hub_client.py -v -k heartbeat`
Expected: FAIL — `client.heartbeat()` currently returns `None` (the method has no `return`), so `result is False` and `client.heartbeat() is True` both fail.

- [ ] **Step 3: Implement**

In `printer-agent/agent/hub_client.py`:

```python
    def heartbeat(self):
        response = self._request("GET", "/heartbeat")
        return response.json().get("cancelRequested", False)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd printer-agent && .venv/bin/pytest tests/test_hub_client.py -v`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add printer-agent/agent/hub_client.py printer-agent/tests/test_hub_client.py
git commit -m "feat(agent): HubClient.heartbeat() returns the cancelRequested flag"
```

---

### Task 7: `run_tick` acts on `cancelRequested`

**Files:**
- Modify: `printer-agent/agent/main.py`
- Test: `printer-agent/tests/test_run_tick.py`

**Interfaces:**
- Consumes: `hub.heartbeat() -> bool` (Task 6), `moonraker.cancel_print()` (Task 5).
- Produces: when `run_tick` is called with a tracked job and `hub.heartbeat()` returns `True`, and Moonraker still reports an active print, the agent calls `moonraker.cancel_print()` then reports `status="cancelled"` via `hub.update_job_status(job_id, "cancelled", error_message=None)`, clearing local state exactly like any other terminal report.

- [ ] **Step 1: Make the `make_hub()` test fixture heartbeat-safe, then write the failing tests**

`make_hub()` in `printer-agent/tests/test_run_tick.py` currently returns a bare `MagicMock()`. Once `run_tick` reads `hub.heartbeat()`'s return value, every existing test that doesn't set `hub.heartbeat.return_value` would otherwise get a truthy `MagicMock` back and silently take the new cancellation branch. Fix the fixture first so all ~25 existing tests keep their current (non-cancelling) behavior by default:

```python
def make_hub():
    hub = MagicMock()
    hub.heartbeat.return_value = False
    return hub
```

Then add these new tests (after the existing monitor tests, before the terminal-report-conflict tests):

```python
# --- Annulation (cancelRequested via heartbeat) ---

def test_monitor_cancel_requested_while_active_calls_moonraker_cancel_and_reports_cancelled(tmp_path, logger):
    hub = make_hub()
    hub.heartbeat.return_value = True
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "printing", "message": ""}

    result = run_tick(hub, moonraker, in_progress_state(), str(tmp_path), logger)

    moonraker.cancel_print.assert_called_once()
    hub.update_job_status.assert_called_once_with("job-1", "cancelled", error_message=None)
    assert result == {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


def test_monitor_cancel_requested_but_print_already_completed_reports_completed_not_cancelled(tmp_path, logger):
    # Un cancelRequested arrivé pile au moment où l'impression se termine naturellement ne doit
    # jamais écraser un état terminal légitime.
    hub = make_hub()
    hub.heartbeat.return_value = True
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "complete", "message": ""}

    result = run_tick(hub, moonraker, in_progress_state(), str(tmp_path), logger)

    moonraker.cancel_print.assert_not_called()
    hub.update_job_status.assert_called_once_with("job-1", "completed", error_message=None)
    assert result == {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


def test_monitor_cancel_requested_but_print_already_errored_reports_failed_not_cancelled(tmp_path, logger):
    hub = make_hub()
    hub.heartbeat.return_value = True
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "error", "message": "thermal runaway"}

    result = run_tick(hub, moonraker, in_progress_state(), str(tmp_path), logger)

    moonraker.cancel_print.assert_not_called()
    hub.update_job_status.assert_called_once_with("job-1", "failed", error_message="thermal runaway")
    assert result == {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


def test_monitor_cancel_requested_but_moonraker_cancel_call_fails_retries_next_tick(tmp_path, logger):
    hub = make_hub()
    hub.heartbeat.return_value = True
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "printing", "message": ""}
    moonraker.cancel_print.side_effect = MoonrakerClientError("timeout")

    result = run_tick(hub, moonraker, in_progress_state(), str(tmp_path), logger)

    hub.update_job_status.assert_not_called()
    assert result["job_id"] == "job-1"


def test_monitor_not_cancel_requested_ignores_active_print(tmp_path, logger):
    hub = make_hub()
    hub.heartbeat.return_value = False
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "printing", "message": ""}

    result = run_tick(hub, moonraker, in_progress_state(), str(tmp_path), logger)

    moonraker.cancel_print.assert_not_called()
    hub.update_job_status.assert_not_called()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd printer-agent && .venv/bin/pytest tests/test_run_tick.py -v`
Expected: FAIL on the 4 new cancellation tests (`run_tick` doesn't read `hub.heartbeat()`'s return value at all yet, so `moonraker.cancel_print` is never called and no `"cancelled"` report happens); the other ~25 pre-existing tests should already PASS once the `make_hub()` fixture change lands (that change alone doesn't alter `run_tick`'s behavior).

- [ ] **Step 3: Implement the cancellation branch**

In `printer-agent/agent/main.py`:

```python
def run_tick(hub, moonraker, state, download_dir, logger):
    cancel_requested = False
    try:
        cancel_requested = hub.heartbeat()
    except HubClientError as exc:
        logger.warning("Échec du heartbeat vers le hub: %s", exc)

    if state.get("job_id") is None:
        return _try_dispatch(hub, moonraker, state, download_dir, logger)
    return _try_monitor(hub, moonraker, state, logger, cancel_requested)
```

Update `_try_monitor`'s signature and its `ACTIVE_STATES` branch:

```python
def _try_monitor(hub, moonraker, state, logger, cancel_requested=False):
    job_id = state["job_id"]

    if _job_age_seconds(state) > MAX_JOB_AGE_SECONDS:
        logger.error(
            "Job %s suivi depuis plus de %ds, abandon (filet de sécurité absolu).", job_id, MAX_JOB_AGE_SECONDS
        )
        return _report_terminal(
            hub,
            job_id,
            "failed",
            f"Impression suivie depuis plus de {MAX_JOB_AGE_SECONDS // 3600}h, abandon",
            state,
            logger,
        )

    try:
        stats = moonraker.get_print_stats()
    except MoonrakerClientError as exc:
        return _handle_monitor_stall(hub, job_id, state, logger, "Moonraker injoignable", exc)

    print_state = stats["state"]
    logger.info("État Moonraker pour le job %s: %s", job_id, print_state)

    if print_state == "complete":
        return _report_terminal(hub, job_id, "completed", None, state, logger)

    if print_state in TERMINAL_ERROR_STATES:
        detail = stats.get("message") or f"Impression {print_state} sur l'imprimante"
        return _report_terminal(hub, job_id, "failed", detail, state, logger)

    if print_state in ACTIVE_STATES:
        if cancel_requested:
            return _try_cancel_active_print(hub, moonraker, job_id, state, logger)
        return {**state, "consecutive_moonraker_failures": 0}

    # État inattendu (ex: 'standby' après un redémarrage Klipper en plein print, ou 'state'
    # absent) : traité comme le cas "Moonraker injoignable" — tolérant à court terme, mais
    # escalade en failed après le même seuil pour ne jamais suivre indéfiniment un job dont
    # l'imprimante ne sait plus rien.
    return _handle_monitor_stall(
        hub, job_id, state, logger, f"État Moonraker inattendu ('{print_state}')", None
    )


def _try_cancel_active_print(hub, moonraker, job_id, state, logger):
    try:
        moonraker.cancel_print()
    except MoonrakerClientError as exc:
        logger.warning(
            "Échec de l'appel d'annulation à Moonraker pour le job %s, nouvelle tentative au prochain tick: %s",
            job_id,
            exc,
        )
        return {**state, "consecutive_moonraker_failures": 0}
    return _report_terminal(hub, job_id, "cancelled", None, state, logger)
```

(Only the `run_tick` body, the `_try_monitor` signature/`ACTIVE_STATES` branch, and the new `_try_cancel_active_print` function change — everything else in the file is untouched.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd printer-agent && .venv/bin/pytest tests/test_run_tick.py -v`
Expected: PASS (all tests, ~30 total)

- [ ] **Step 5: Run the full agent suite**

Run: `cd printer-agent && .venv/bin/pytest -v`
Expected: PASS, no regressions in `test_main_cli.py`, `test_state.py`, etc.

- [ ] **Step 6: Commit**

```bash
git add printer-agent/agent/main.py printer-agent/tests/test_run_tick.py
git commit -m "feat(agent): cancel the active print and report cancelled when the hub requests it"
```

---

### Task 8: Frontend — cancel button on "Mes impressions" (`client/src/pages/print/index.js`)

**Files:**
- Modify: `client/src/pages/print/index.js`

**Interfaces:**
- Consumes: `POST /api/print/jobs/:id/cancel` (Task 2), `job.status`, `job.cancelRequestedAt` on job objects already returned by `GET /api/print/jobs/me`.

- [ ] **Step 1: Add the `Modal` import and `cancelled` status labels**

```js
import Modal from '../../components/ui/Modal';
```

```js
const STATUS_LABELS = {
  queued: "En attente",
  sent: "Envoyé à l'imprimante",
  printing: 'Impression en cours',
  completed: 'Terminé',
  failed: 'Échec',
  rejected: 'Refusé',
  cancelled: 'Annulé',
};

const STATUS_BADGE_VARIANTS = {
  queued: 'pending',
  sent: 'pending',
  printing: 'pending',
  completed: 'approved',
  failed: 'rejected',
  rejected: 'rejected',
  cancelled: 'neutral',
};

const CANCELLABLE_STATUSES = ['queued', 'sent', 'printing'];
```

- [ ] **Step 2: Add cancel state and handler**

Inside `PrintPage`, alongside the other `useState` calls:

```js
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
```

Below `handleSubmit`:

```js
  const handleCancelJob = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await post(`/api/print/jobs/${cancelTarget._id}/cancel`, {});
      toast.success('Annulation demandée');
      setCancelTarget(null);
      await refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCancelling(false);
    }
  };
```

- [ ] **Step 3: Render the cancel control on each job card**

Replace the job card block:

```jsx
            {jobs.map((job) => (
              <Card key={job._id} padding="compact" className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-text truncate">{job.fileName}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={STATUS_BADGE_VARIANTS[job.status] || 'neutral'}>
                      {STATUS_LABELS[job.status] || job.status}
                    </Badge>
                    {CANCELLABLE_STATUSES.includes(job.status) &&
                      (job.cancelRequestedAt ? (
                        <span className="text-xs text-text-muted">Annulation en cours...</span>
                      ) : (
                        <Button variant="danger" size="sm" onClick={() => setCancelTarget(job)}>
                          Annuler
                        </Button>
                      ))}
                  </div>
                </div>
                {job.status === 'failed' && job.errorMessage && (
                  <p className="text-sm text-danger break-words">{job.errorMessage}</p>
                )}
              </Card>
            ))}
```

- [ ] **Step 4: Add the confirmation modal**

Just before `</main>`:

```jsx
        <Modal
          open={!!cancelTarget}
          onClose={() => setCancelTarget(null)}
          title="Annuler cette impression ?"
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="subtle" onClick={() => setCancelTarget(null)} disabled={cancelling}>
                Retour
              </Button>
              <Button variant="danger" onClick={handleCancelJob} loading={cancelling} disabled={cancelling}>
                Annuler l&apos;impression
              </Button>
            </div>
          }
        >
          <p className="text-sm text-text">
            Cette action est irréversible.{' '}
            {cancelTarget && ['sent', 'printing'].includes(cancelTarget.status)
              ? "L'impression est peut-être déjà en cours : elle s'arrêtera au prochain contact avec l'imprimante (jusqu'à 60 secondes), et le plateau devra être vérifié physiquement avant la prochaine impression."
              : "Le job n'a pas encore démarré, l'imprimante sera immédiatement libérée."}
          </p>
        </Modal>
```

- [ ] **Step 5: Manual verification via Docker**

This machine's Node 25 breaks Next.js 12 locally — do not run `npm run dev`/`next build` on the host. Instead:

Run: `docker compose up -d --build server client`

Then in the browser (student account, whitelisted for print access):
1. Submit a `.gcode` job to an idle printer → confirm it appears as "En attente" with an "Annuler" button.
2. Click "Annuler" → confirm the modal appears with the "not yet started" copy, confirm → job badge becomes "Annulé", the "Annuler" button disappears, and the printer becomes selectable again in the submit form (status "Disponible").
3. Manually flip a job to `sent` or `printing` in Mongo (or by exercising the agent-facing endpoints via curl with a test printer key) and reload → confirm the "Annuler" button and the "irreversible, in-progress" modal copy, and that after confirming, the button is replaced by "Annulation en cours..." and the job stays in its current status.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/print/index.js
git commit -m "feat(print): let students cancel their own queued/sent/printing jobs"
```

---

### Task 9: Frontend — cancel button on the admin print log (`client/src/pages/admin/print/index.js`)

**Files:**
- Modify: `client/src/pages/admin/print/index.js`

**Interfaces:**
- Consumes: `POST /api/print/jobs/:id/cancel` (Task 2, admin bypasses the ownership check), `job.status`, `job.cancelRequestedAt` from `GET /api/print/jobs`.

- [ ] **Step 1: Add `cancelled` status labels**

```js
const JOB_STATUS_LABELS = {
  queued: 'En attente',
  sent: "Envoyé à l'imprimante",
  printing: 'Impression en cours',
  completed: 'Terminé',
  failed: 'Échec',
  rejected: 'Refusé',
  cancelled: 'Annulé',
};

const JOB_STATUS_BADGE_VARIANTS = {
  queued: 'pending',
  sent: 'pending',
  printing: 'pending',
  completed: 'approved',
  failed: 'rejected',
  rejected: 'rejected',
  cancelled: 'neutral',
};

const CANCELLABLE_JOB_STATUSES = ['queued', 'sent', 'printing'];
```

- [ ] **Step 2: Add cancel state and handler**

Inside `AdminPrintPage`, alongside the other job-log state:

```js
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
```

Below the `// ── Job log ──` comment (or near `handleRevoke`):

```js
  const handleCancelJob = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await post(`/api/print/jobs/${cancelTarget._id}/cancel`, {});
      toast.success('Annulation demandée');
      setCancelTarget(null);
      await refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCancelling(false);
    }
  };
```

- [ ] **Step 3: Render the cancel control in each job-log row**

Replace the row's right-hand column:

```jsx
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={JOB_STATUS_BADGE_VARIANTS[job.status] || 'neutral'} size="sm">
                        {JOB_STATUS_LABELS[job.status] || job.status}
                      </Badge>
                      {job.rejectionReason && (
                        <span className="text-xs text-text-muted">
                          ({REJECTION_REASON_LABELS[job.rejectionReason] || job.rejectionReason})
                        </span>
                      )}
                      {CANCELLABLE_JOB_STATUSES.includes(job.status) &&
                        (job.cancelRequestedAt ? (
                          <span className="text-xs text-text-muted">Annulation en cours...</span>
                        ) : (
                          <Button variant="danger" size="sm" onClick={() => setCancelTarget(job)}>
                            Annuler
                          </Button>
                        ))}
                    </div>
```

- [ ] **Step 4: Add the confirmation modal**

Next to the existing QR `<Modal>`, before `<Footer />`:

```jsx
      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Annuler cette impression ?"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="subtle" onClick={() => setCancelTarget(null)} disabled={cancelling}>
              Retour
            </Button>
            <Button variant="danger" onClick={handleCancelJob} loading={cancelling} disabled={cancelling}>
              Annuler l&apos;impression
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text">
          Cette action est irréversible.{' '}
          {cancelTarget && ['sent', 'printing'].includes(cancelTarget.status)
            ? "L'impression est peut-être déjà en cours : elle s'arrêtera au prochain contact avec l'imprimante (jusqu'à 60 secondes), et le plateau devra être vérifié physiquement avant la prochaine impression."
            : "Le job n'a pas encore démarré, l'imprimante sera immédiatement libérée."}
        </p>
      </Modal>
```

- [ ] **Step 5: Manual verification via Docker**

Run: `docker compose up -d --build server client` (skip the rebuild if Task 8 already left it running).

In the browser (admin account):
1. Open "Administration — Impression 3D" → journal des impressions → confirm any `queued`/`sent`/`printing` job shows an "Annuler" button, regardless of which student submitted it.
2. Cancel a `queued` job as admin → confirm badge becomes "Annulé" and the corresponding printer's card above shows "Disponible" again.
3. Confirm a `completed`/`failed`/`rejected` job in the log shows no "Annuler" button.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/admin/print/index.js
git commit -m "feat(print): let admins cancel any queued/sent/printing job from the log"
```

---

## Self-Review

**Spec coverage:**
- Modèle de données (`status: cancelled`, `cancelRequestedAt`, `cancelledBy`) → Task 1.
- `POST /api/print/jobs/:id/cancel` (auth, sync `queued`, async `sent`/`printing`, no-op double-request, 400 on terminal) → Task 2.
- `GET /api/print/agent/heartbeat` extended with `cancelRequested` → Task 3.
- `POST /api/print/agent/jobs/:id/status` accepts `cancelled` → Task 4.
- `MoonrakerClient.cancel_print()` → Task 5.
- Agent tick: check `cancelRequested` at heartbeat, prefer a real terminal Moonraker state, call `cancel_print()`, report `cancelled`, retry on Moonraker failure → Tasks 6-7.
- Frontend: cancel button + confirmation modal + "Annulation en cours..." + "Annulé" badge on both `print/index.js` and `admin/print/index.js` → Tasks 8-9.
- Out-of-scope items (bobine selection, `errorMessage` display, faster cancellation, pause/resume) → deliberately untouched, listed in Global Constraints.

**Placeholder scan:** none — every step has literal code, and manual-verification steps (8/5, 9/5) spell out exact click-through sequences rather than "test it".

**Type/name consistency checked across tasks:**
- `PRINT_JOB_STATUSES.CANCELLED === 'cancelled'` (Task 1) used verbatim in Tasks 2-4, 7-9.
- `job.cancelRequestedAt` / `job.cancelledBy.email` (Task 1) read in Task 2 (controller), Task 3 (heartbeat), Task 8-9 (frontend).
- `cancelRequested` boolean field name identical across Task 3 (Express JSON body), Task 6 (`HubClient.heartbeat()` parsing), Task 7 (`run_tick`/`_try_monitor` parameter).
- `MoonrakerClient.cancel_print()` (Task 5) called with no arguments in Task 7, matching the signature defined there.
- `_try_monitor(hub, moonraker, state, logger, cancel_requested=False)` — the new parameter is keyword-defaulted so no other caller of `_try_monitor` needs updating (there are none besides `run_tick`).
