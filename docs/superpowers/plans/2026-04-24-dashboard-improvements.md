# Dashboard Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add school-year-aware stats, swap toolbar layout on both admin dashboards, add bulk and individual email resend for `pending_changes` projects.

**Architecture:** Backend-first (new controller exports + routes), then frontend page changes. Each backend task is independently testable. Frontend tasks build on the backend endpoints.

**Tech Stack:** Node.js/Express/Mongoose, Next.js 12 (pages router), Tailwind CSS, Jest/Supertest for backend tests.

---

## Files touched

### Backend
- `server/src/controllers/projectController.js` — modify `getProjectStats`, add `notifyPendingChanges`, add `resendNotification`
- `server/src/controllers/workshopController.js` — modify `getWorkshopStats`
- `server/src/routes/projects.js` — add 2 new routes (before and after `/:id`)
- `server/src/tests/functional/projects.test.js` — add test blocks for 3 new/modified endpoints

### Frontend
- `client/src/pages/admin/dashboard.js` — toolbar swap, stats by year, bulk resend modal
- `client/src/pages/admin/workshops/dashboard.js` — toolbar swap, stats by year
- `client/src/pages/admin/projects/[id].js` — individual resend card

---

## Task 1: Create feature branch

- [ ] **Step 1: Create and checkout branch**

```bash
git checkout -b feature/dashboard-improvements
```

Expected: `Switched to a new branch 'feature/dashboard-improvements'`

---

## Task 2: Backend — getProjectStats with schoolYear filter

**Files:**
- Modify: `server/src/controllers/projectController.js` (function `getProjectStats` around line 606)
- Modify: `server/src/tests/functional/projects.test.js` (add describe block at end)

- [ ] **Step 1: Write the failing test**

Add at the end of `server/src/tests/functional/projects.test.js`:

```js
// ─────────────────────────────────────────────
// GET /api/projects/stats
// ─────────────────────────────────────────────
describe('GET /api/projects/stats', () => {
  it('returns all-time stats when no schoolYear param → 200', async () => {
    const admin = await createAdmin();
    const student = await createUser();
    await request(app)
      .post('/api/projects')
      .set(authHeader(student))
      .send({
        name: 'Projet Stats',
        description: 'desc',
        objectives: 'obj',
        technologies: ['Node.js'],
        studentCount: 1,
        links: { github: 'https://github.com/a/b', projectGithub: 'https://github.com/a/c' },
      });
    const res = await request(app)
      .get('/api/projects/stats')
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
  });

  it('returns 0 total for a future school year with no projects → 200', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .get('/api/projects/stats?schoolYear=2099-2100')
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
  });

  it('student cannot access stats → 403', async () => {
    const student = await createUser();
    const res = await request(app)
      .get('/api/projects/stats')
      .set(authHeader(student));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server && npx jest --testPathPattern="projects.test" --verbose 2>&1 | tail -20
```

Expected: the new tests FAIL (getProjectStats currently ignores `schoolYear`).

- [ ] **Step 3: Implement schoolYear filtering in getProjectStats**

In `server/src/controllers/projectController.js`, replace the `getProjectStats` function (around line 606):

```js
exports.getProjectStats = asyncHandler(async (req, res) => {
  const { schoolYear } = req.query;
  const pipeline = [];
  if (schoolYear) {
    const startYear = parseInt(schoolYear.split('-')[0], 10);
    pipeline.push({
      $match: {
        createdAt: {
          $gte: new Date(startYear, 8, 1),
          $lte: new Date(startYear + 1, 7, 31, 23, 59, 59),
        },
      },
    });
  }
  pipeline.push({ $group: { _id: '$status', count: { $sum: 1 } } });
  const rows = await Project.aggregate(pipeline);
  const stats = { pending: 0, pending_changes: 0, approved: 0, rejected: 0, completed: 0, total: 0 };
  rows.forEach(({ _id, count }) => {
    if (_id in stats) stats[_id] = count;
    stats.total += count;
  });
  res.status(200).json({ success: true, data: stats });
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd server && npx jest --testPathPattern="projects.test" --verbose 2>&1 | tail -20
```

Expected: all tests PASS including new `GET /api/projects/stats` block.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/projectController.js server/src/tests/functional/projects.test.js
git commit -m "feat(api): filter project stats by school year"
```

---

## Task 3: Backend — getWorkshopStats with schoolYear filter

**Files:**
- Modify: `server/src/controllers/workshopController.js` (function `getWorkshopStats` around line 452)

- [ ] **Step 1: Implement schoolYear filtering in getWorkshopStats**

In `server/src/controllers/workshopController.js`, replace the `getWorkshopStats` function (around line 452):

```js
exports.getWorkshopStats = asyncHandler(async (req, res) => {
  const { schoolYear } = req.query;
  const pipeline = [];
  if (schoolYear) {
    const startYear = parseInt(schoolYear.split('-')[0], 10);
    pipeline.push({
      $match: {
        createdAt: {
          $gte: new Date(startYear, 8, 1),
          $lte: new Date(startYear + 1, 7, 31, 23, 59, 59),
        },
      },
    });
  }
  pipeline.push({ $group: { _id: '$status', count: { $sum: 1 } } });
  const rows = await Workshop.aggregate(pipeline);
  const stats = { pending: 0, pending_changes: 0, approved: 0, rejected: 0, completed: 0, total: 0 };
  rows.forEach(({ _id, count }) => {
    if (_id in stats) stats[_id] = count;
    stats.total += count;
  });
  res.status(200).json({ success: true, data: stats });
});
```

- [ ] **Step 2: Run full test suite to check no regressions**

```bash
cd server && npx jest --verbose 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/workshopController.js
git commit -m "feat(api): filter workshop stats by school year"
```

---

## Task 4: Backend — bulk resend endpoint

**Files:**
- Modify: `server/src/controllers/projectController.js` (add export at end)
- Modify: `server/src/routes/projects.js` (add route before `/:id` block)
- Modify: `server/src/tests/functional/projects.test.js` (add describe block)

- [ ] **Step 1: Write the failing test**

Add at the end of `server/src/tests/functional/projects.test.js`:

```js
// ─────────────────────────────────────────────
// POST /api/projects/notify-pending-changes
// ─────────────────────────────────────────────
describe('POST /api/projects/notify-pending-changes', () => {
  it('admin triggers bulk notification → 200 with total count', async () => {
    const admin = await createAdmin();
    const student = await createUser();
    // Create a project then manually set it to pending_changes
    const proj = await Project.create({
      name: 'Projet Notif',
      description: 'desc',
      objectives: 'obj',
      technologies: ['JS'],
      studentCount: 1,
      links: { github: 'https://github.com/a/b', projectGithub: 'https://github.com/a/c' },
      status: 'pending_changes',
      submittedBy: { userId: student._id, name: student.name, email: student.email },
    });
    const res = await request(app)
      .post('/api/projects/notify-pending-changes')
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it('student cannot access → 403', async () => {
    const student = await createUser();
    const res = await request(app)
      .post('/api/projects/notify-pending-changes')
      .set(authHeader(student));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && npx jest --testPathPattern="projects.test" --verbose 2>&1 | tail -20
```

Expected: FAIL — route does not exist yet (404).

- [ ] **Step 3: Add notifyPendingChanges to projectController**

Add at the end of `server/src/controllers/projectController.js`:

```js
// POST /api/projects/notify-pending-changes (admin)
// Relance les emails pour tous les projets en pending_changes
exports.notifyPendingChanges = asyncHandler(async (req, res) => {
  const projects = await Project.find({ status: 'pending_changes' });
  projects.forEach((project) => {
    backgroundJobs.addJob('sendStatusEmail', { project, status: 'pending_changes' });
  });
  res.status(200).json({ success: true, total: projects.length });
});
```

- [ ] **Step 4: Add route in projects.js**

In `server/src/routes/projects.js`, add the new route **before** the `router.get('/:id', ...)` line:

```js
router.post('/notify-pending-changes', authenticateToken, isAdmin, projectController.notifyPendingChanges);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd server && npx jest --testPathPattern="projects.test" --verbose 2>&1 | tail -20
```

Expected: all tests PASS including new `POST /api/projects/notify-pending-changes` block.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/projectController.js server/src/routes/projects.js server/src/tests/functional/projects.test.js
git commit -m "feat(api): add bulk pending_changes email resend endpoint"
```

---

## Task 5: Backend — individual resend endpoint

**Files:**
- Modify: `server/src/controllers/projectController.js` (add export at end)
- Modify: `server/src/routes/projects.js` (add route after `/:id` block)
- Modify: `server/src/tests/functional/projects.test.js` (add describe block)

- [ ] **Step 1: Write the failing test**

Add at the end of `server/src/tests/functional/projects.test.js`:

```js
// ─────────────────────────────────────────────
// POST /api/projects/:id/resend-notification
// ─────────────────────────────────────────────
describe('POST /api/projects/:id/resend-notification', () => {
  it('admin resends notification for a pending_changes project → 200', async () => {
    const admin = await createAdmin();
    const student = await createUser();
    const proj = await Project.create({
      name: 'Projet Resend',
      description: 'desc',
      objectives: 'obj',
      technologies: ['JS'],
      studentCount: 1,
      links: { github: 'https://github.com/a/b', projectGithub: 'https://github.com/a/c' },
      status: 'pending_changes',
      submittedBy: { userId: student._id, name: student.name, email: student.email },
    });
    const res = await request(app)
      .post(`/api/projects/${proj._id}/resend-notification`)
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 if project is not pending_changes', async () => {
    const admin = await createAdmin();
    const student = await createUser();
    const proj = await Project.create({
      name: 'Projet Approved',
      description: 'desc',
      objectives: 'obj',
      technologies: ['JS'],
      studentCount: 1,
      links: { github: 'https://github.com/a/b', projectGithub: 'https://github.com/a/c' },
      status: 'approved',
      submittedBy: { userId: student._id, name: student.name, email: student.email },
    });
    const res = await request(app)
      .post(`/api/projects/${proj._id}/resend-notification`)
      .set(authHeader(admin));
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown id', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .post('/api/projects/000000000000000000000000/resend-notification')
      .set(authHeader(admin));
    expect(res.status).toBe(404);
  });

  it('student cannot access → 403', async () => {
    const student = await createUser();
    const proj = await Project.create({
      name: 'Projet X',
      description: 'desc',
      objectives: 'obj',
      technologies: ['JS'],
      studentCount: 1,
      links: { github: 'https://github.com/a/b', projectGithub: 'https://github.com/a/c' },
      status: 'pending_changes',
      submittedBy: { userId: student._id, name: student.name, email: student.email },
    });
    const res = await request(app)
      .post(`/api/projects/${proj._id}/resend-notification`)
      .set(authHeader(student));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && npx jest --testPathPattern="projects.test" --verbose 2>&1 | tail -20
```

Expected: FAIL — route does not exist yet.

- [ ] **Step 3: Add resendNotification to projectController**

Add at the end of `server/src/controllers/projectController.js`:

```js
// POST /api/projects/:id/resend-notification (admin)
// Relance l'email pending_changes pour un projet spécifique
exports.resendNotification = asyncHandler(async (req, res, next) => {
  const project = await Project.findById(req.params.id);
  if (!project) {
    return next(new ErrorResponse('Projet non trouvé', 404));
  }
  if (project.status !== 'pending_changes') {
    return next(new ErrorResponse("Ce projet n'est pas en attente de modifications", 400));
  }
  backgroundJobs.addJob('sendStatusEmail', { project, status: 'pending_changes' });
  res.status(200).json({ success: true });
});
```

- [ ] **Step 4: Add route in projects.js**

In `server/src/routes/projects.js`, add after the existing `/:id` routes:

```js
router.post('/:id/resend-notification', authenticateToken, isAdmin, projectController.resendNotification);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd server && npx jest --testPathPattern="projects.test" --verbose 2>&1 | tail -20
```

Expected: all tests PASS including new `POST /api/projects/:id/resend-notification` block.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/projectController.js server/src/routes/projects.js server/src/tests/functional/projects.test.js
git commit -m "feat(api): add individual pending_changes email resend endpoint"
```

---

## Task 6: Frontend — projects dashboard

**Files:**
- Modify: `client/src/pages/admin/dashboard.js`

Three changes in one file: toolbar swap, stats by year, bulk resend modal.

- [ ] **Step 1: Add `post` and `isResending`/`showResendModal` state**

In `dashboard.js`, update the destructuring of `useApi` (line 57):

```js
const { get, post, loading: apiLoading } = useApi();
```

Add two new state variables after the existing state declarations:

```js
const [showResendModal, setShowResendModal] = useState(false);
const [isResending, setIsResending] = useState(false);
```

- [ ] **Step 2: Add schoolYear to stats useEffect deps**

Replace the stats `useEffect` (around line 79–84):

```js
useEffect(() => {
  if (!isAuthenticated || !isAdmin) return;
  get("/api/projects/stats", schoolYear ? { schoolYear } : {})
    .then((r) => setStats(r.data))
    .catch(() => {});
}, [isAuthenticated, isAdmin, schoolYear]);
```

- [ ] **Step 3: Add handleResendAll handler**

Add after `handlePageChange` function:

```js
const handleResendAll = async () => {
  try {
    setIsResending(true);
    const res = await post("/api/projects/notify-pending-changes", {});
    setShowResendModal(false);
    toast.success(
      `${res.total} notification${res.total !== 1 ? "s" : ""} relancée${res.total !== 1 ? "s" : ""}`
    );
  } catch (err) {
    toast.error(err.message || "Erreur lors de l'envoi");
  } finally {
    setIsResending(false);
  }
};
```

Note: `toast` is not yet imported in dashboard.js. Add this import at the top:

```js
import { toast } from "react-toastify";
```

- [ ] **Step 4: Add resend button to PageHead actions**

Replace the `PageHead` `actions` prop:

```jsx
<PageHead
  title="Administration des projets"
  sub="Gérez les soumissions de projets des étudiants"
  actions={
    filter === "pending_changes" ? (
      <Button
        variant="primary"
        size="sm"
        onClick={() => setShowResendModal(true)}
      >
        Relancer les notifications
      </Button>
    ) : filter === "completed" ? (
      <Button
        variant="primary"
        size="sm"
        onClick={() => setShowExportModal(true)}
      >
        Exporter en CSV
      </Button>
    ) : undefined
  }
/>
```

- [ ] **Step 5: Swap toolbar layout**

Replace the entire `<TableToolbar ...>` block (around line 251–269):

```jsx
<TableToolbar className="mb-4">
  <div className="flex w-full items-center gap-2">
    <div className="relative flex-1">
      <span
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-dim"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="h-4 w-4"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5l3 3" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="search"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Rechercher un projet..."
        aria-label="Rechercher un projet..."
        className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-text placeholder:text-text-dim transition-colors duration-150 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary/50"
      />
    </div>
    <Select
      value={schoolYear}
      onChange={(e) => setSchoolYear(e.target.value)}
      className="w-44 shrink-0"
    >
      <option value="">Toutes les années</option>
      {schoolYearOptions.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </Select>
  </div>
</TableToolbar>
```

- [ ] **Step 6: Add resend confirmation modal**

Add the following `<Modal>` block just before the closing `</div>` of the page (after the existing export Modal):

```jsx
<Modal
  open={showResendModal}
  onClose={() => setShowResendModal(false)}
  title="Relancer les notifications"
  footer={
    <div className="flex justify-end gap-3">
      <Button
        variant="subtle"
        onClick={() => setShowResendModal(false)}
        disabled={isResending}
      >
        Annuler
      </Button>
      <Button
        variant="primary"
        onClick={handleResendAll}
        loading={isResending}
        disabled={isResending}
      >
        Envoyer
      </Button>
    </div>
  }
>
  <p className="text-sm text-text">
    Vous êtes sur le point de relancer la notification email pour{" "}
    <span className="font-semibold text-accent">
      {stats?.pending_changes ?? 0} projet
      {(stats?.pending_changes ?? 0) !== 1 ? "s" : ""}
    </span>{" "}
    en attente de modifications.
  </p>
</Modal>
```

- [ ] **Step 7: Verify the page compiles**

```bash
cd client && npx next build 2>&1 | grep -E "error|warn|✓" | head -20
```

Expected: no TypeScript/compilation errors for dashboard.js.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/admin/dashboard.js
git commit -m "feat(ui): swap toolbar layout, year-aware stats, bulk resend on project dashboard"
```

---

## Task 7: Frontend — workshops dashboard

**Files:**
- Modify: `client/src/pages/admin/workshops/dashboard.js`

Two changes: toolbar swap + stats by year.

- [ ] **Step 1: Add schoolYear to stats useEffect deps**

In `workshops/dashboard.js`, replace the stats `useEffect` (around line 64–69):

```js
useEffect(() => {
  if (!isAuthenticated || !isAdmin) return;
  get("/api/workshops/stats", schoolYear ? { schoolYear } : {})
    .then((r) => setStats(r.data))
    .catch(() => {});
}, [isAuthenticated, isAdmin, schoolYear]);
```

- [ ] **Step 2: Swap toolbar layout**

Replace the entire `<TableToolbar ...>` block (around line 180–198):

```jsx
<TableToolbar className="mb-4">
  <div className="flex w-full items-center gap-2">
    <div className="relative flex-1">
      <span
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-dim"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="h-4 w-4"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5l3 3" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="search"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Rechercher un workshop..."
        aria-label="Rechercher un workshop..."
        className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-text placeholder:text-text-dim transition-colors duration-150 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary/50"
      />
    </div>
    <Select
      value={schoolYear}
      onChange={(e) => setSchoolYear(e.target.value)}
      className="w-44 shrink-0"
    >
      <option value="">Toutes les années</option>
      {schoolYearOptions.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </Select>
  </div>
</TableToolbar>
```

- [ ] **Step 3: Verify the page compiles**

```bash
cd client && npx next build 2>&1 | grep -E "error|warn|✓" | head -20
```

Expected: no errors for workshops/dashboard.js.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/workshops/dashboard.js
git commit -m "feat(ui): swap toolbar layout and year-aware stats on workshop dashboard"
```

---

## Task 8: Frontend — individual resend card on project detail

**Files:**
- Modify: `client/src/pages/admin/projects/[id].js`

- [ ] **Step 1: Add `post` to useApi destructuring**

In `[id].js`, update the `useApi` destructuring (line 27):

```js
const { get, patch, post, delete: deleteRequest, loading: apiLoading } = useApi();
```

- [ ] **Step 2: Add isResending state**

Add after the existing state declarations:

```js
const [isResending, setIsResending] = useState(false);
```

- [ ] **Step 3: Add handleResendNotification handler**

Add after `handleDeleteProject`:

```js
const handleResendNotification = async () => {
  try {
    setIsResending(true);
    await post(`/api/projects/${id}/resend-notification`, {});
    toast.success("Notification relancée avec succès");
  } catch (err) {
    toast.error(err.message || "Erreur lors de l'envoi");
  } finally {
    setIsResending(false);
  }
};
```

- [ ] **Step 4: Add resend card in sidebar**

In the right sidebar (`<div className="mt-6 lg:mt-0 space-y-4">`), add the following card after the "Clôturer le projet" card:

```jsx
{project.status === "pending_changes" && (
  <Card>
    <h3 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">
      Relancer la notification
    </h3>
    <p className="text-sm text-text-muted mb-4">
      Renvoyer l'email de demande de modifications à l'étudiant.
    </p>
    <Button
      variant="subtle"
      onClick={handleResendNotification}
      disabled={isResending}
      loading={isResending}
      className="w-full"
    >
      Relancer la notification email
    </Button>
  </Card>
)}
```

- [ ] **Step 5: Verify the page compiles**

```bash
cd client && npx next build 2>&1 | grep -E "error|warn|✓" | head -20
```

Expected: no errors for `admin/projects/[id].js`.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/admin/projects/[id].js
git commit -m "feat(ui): add individual email resend card on project detail page"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run full backend test suite**

```bash
cd server && npx jest --verbose 2>&1 | tail -30
```

Expected: all tests PASS, no regressions.

- [ ] **Step 2: Run full frontend build**

```bash
cd client && npx next build 2>&1 | tail -20
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Verify git log**

```bash
git log --oneline -8
```

Expected: 7 feature commits visible on `feature/dashboard-improvements`.
