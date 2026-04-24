# Design — Dashboard improvements

Date: 2026-04-24

## Scope

Four improvements to the admin dashboards (projects + workshops):

1. Swap year selector and search bar layout
2. Bulk email resend for `pending_changes` projects
3. Individual email resend on project detail page
4. Stats cards filtered by selected school year

---

## 1. Swap year selector / search bar

### Affected files
- `client/src/pages/admin/dashboard.js`
- `client/src/pages/admin/workshops/dashboard.js`

### Behavior
Currently: year selector is wide (left, flex-1), search input is narrow (right, w-48).
After: search input is wide (left, flex-1), year selector is narrow (right, w-44).

### Implementation
Stop using `TableToolbar`'s built-in `search`/`onSearch` props. Pass a custom flex row as `children` instead:

```jsx
<TableToolbar className="mb-4" actions={/* CSV button if applicable */}>
  <div className="flex gap-2 w-full items-center">
    {/* search input — flex-1, same styling as current TableToolbar search */}
    <div className="relative flex-1">
      <span className="search icon" />
      <input type="search" className="w-full h-9 ..." />
    </div>
    {/* year select — fixed width */}
    <Select className="w-44 shrink-0">...</Select>
  </div>
</TableToolbar>
```

`TableToolbar` component itself is NOT modified.

---

## 2. Bulk email resend (project dashboard)

### New backend endpoint
`POST /api/projects/notify-pending-changes`
- Auth: admin only
- Fetches all projects with `status: "pending_changes"` (no pagination)
- Calls `emailService.sendStatusChangeEmail(project, 'pending_changes')` for each
- Returns `{ success: true, sent: N, failed: M, total: N+M }`
- Route must be declared before `/:id` routes to avoid conflict

### Frontend — dashboard.js
- Button "Relancer les notifications" added to `PageHead actions` when `filter === "pending_changes"` (same pattern as CSV button on "Terminés")
- Clicking opens a confirmation `Modal` displaying: "Vous êtes sur le point d'envoyer X emails aux projets en attente de modifications. Confirmer ?"  (X = `stats.pending_changes`)
- On confirm: POST to endpoint, show toast with result (`N emails envoyés`)
- Button has `loading` state during request

### State additions
```js
const [showResendModal, setShowResendModal] = useState(false);
const [isResending, setIsResending] = useState(false);
```

---

## 3. Individual email resend (project detail page)

### New backend endpoint
`POST /api/projects/:id/resend-notification`
- Auth: admin only
- Fetches project by ID, returns 400 if `status !== "pending_changes"`
- Calls `emailService.sendStatusChangeEmail(project, 'pending_changes')`
- Returns `{ success: true }`

### Frontend — admin/projects/[id].js
- New `Card` in the right sidebar, visible only when `project.status === "pending_changes"`
- Contains: section title + short description + button "Relancer la notification email"
- Button has `loading` state, calls `POST /api/projects/${id}/resend-notification`
- Toast success on resolve, toast error on reject

---

## 4. Stats filtered by school year

### Backend changes
Both `getProjectStats` (projectController) and `getWorkshopStats` (workshopController) accept `?schoolYear=YYYY-YYYY`.

When present, prepend a `$match` stage to the aggregate:
```js
const schoolYear = req.query.schoolYear; // e.g. "2025-2026"
const matchStage = {};
if (schoolYear) {
  const startYear = parseInt(schoolYear.split('-')[0], 10);
  matchStage.createdAt = {
    $gte: new Date(startYear, 8, 1),       // Sept 1
    $lte: new Date(startYear + 1, 7, 31, 23, 59, 59), // Aug 31
  };
}
// aggregate: [{ $match: matchStage }, { $group: ... }]
```

Without `schoolYear` param → no `$match` → all-time behavior preserved.

### Frontend changes — both dashboards
- Move stats fetch into a `useEffect` that depends on `[isAuthenticated, isAdmin, schoolYear]`
- Pass `schoolYear` as query param: `get('/api/projects/stats', { schoolYear })`
- Stats cards now update whenever year selector changes

---

## Branch

Work on a new dedicated branch (e.g. `feature/dashboard-improvements`).

## Files touched

### Backend
- `server/src/controllers/projectController.js` — getProjectStats, + 2 new exports
- `server/src/controllers/workshopController.js` — getWorkshopStats
- `server/src/routes/projects.js` — 2 new routes

### Frontend
- `client/src/pages/admin/dashboard.js`
- `client/src/pages/admin/workshops/dashboard.js`
- `client/src/pages/admin/projects/[id].js`
