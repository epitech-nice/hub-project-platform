# Signalement de problème inventaire — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre aux étudiants de signaler un problème sur un outil depuis la page de scan, notifier les admins par email, et donner aux admins une vue des signalements ouverts avec possibilité de les résoudre.

**Architecture:** Nouveau modèle Mongoose `ToolReport` avec 3 endpoints REST ajoutés au router `tools.js` existant. `getAllTools` est enrichi d'un `openReportCount` par agrégation. Le frontend étudiant ajoute un formulaire inline sur la page de scan ; le panel admin ajoute un badge + modal de résolution.

**Tech Stack:** Node.js + Express + Mongoose · express-validator · Resend (email) · Next.js pages router + React hooks · supertest + mongodb-memory-server (tests)

---

## File Map

| Action | Fichier | Responsabilité |
|---|---|---|
| Modify | `server/src/utils/constants.js` | Ajouter REPORT_CATEGORIES et REPORT_STATUS |
| Create | `server/src/models/ToolReport.js` | Schéma signalement |
| Modify | `server/src/middleware/validators.js` | Règles de validation pour create/resolve |
| Modify | `server/src/services/emailService.js` | Ajouter sendToolReportEmail |
| Create | `server/src/controllers/toolReportController.js` | createReport, getReports, resolveReport |
| Modify | `server/src/controllers/toolController.js` | Enrichir getAllTools avec openReportCount |
| Modify | `server/src/routes/tools.js` | Enregistrer les 3 nouvelles routes |
| Create | `server/src/tests/functional/toolReports.test.js` | Tests fonctionnels |
| Modify | `client/src/pages/inventory/scan/[id].js` | Formulaire signalement étudiant |
| Modify | `client/src/pages/admin/inventory.js` | Badge + modal admin |
| Modify | `docs/inventory.md` | Documenter la feature |

---

## Task 1 — Constants + modèle ToolReport

**Files:**
- Modify: `server/src/utils/constants.js`
- Create: `server/src/models/ToolReport.js`

- [ ] **Step 1 : Ajouter les constantes dans `constants.js`**

Ajouter avant `module.exports` :

```js
const REPORT_CATEGORIES = {
  BROKEN:     'broken',
  MISSING:    'missing',
  INCOMPLETE: 'incomplete',
  DEFECTIVE:  'defective',
  OTHER:      'other',
};

const REPORT_STATUS = {
  OPEN:     'open',
  RESOLVED: 'resolved',
};
```

Ajouter `REPORT_CATEGORIES` et `REPORT_STATUS` à `module.exports` :

```js
module.exports = {
  PROJECT_STATUSES,
  WORKSHOP_STATUSES,
  SIMULATED_STATUSES,
  TOOL_STATUS,
  LOAN_STATUS,
  REPORT_CATEGORIES,
  REPORT_STATUS,
};
```

- [ ] **Step 2 : Créer `server/src/models/ToolReport.js`**

```js
const mongoose = require('mongoose');
const { REPORT_CATEGORIES, REPORT_STATUS } = require('../utils/constants');

const toolReportSchema = new mongoose.Schema(
  {
    tool: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tool',
      required: true,
    },
    student: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      name:   { type: String, required: true },
      email:  { type: String, required: true },
    },
    category: {
      type: String,
      enum: Object.values(REPORT_CATEGORIES),
      required: true,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    status: {
      type: String,
      enum: Object.values(REPORT_STATUS),
      default: REPORT_STATUS.OPEN,
    },
    resolvedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name:   { type: String },
    },
    resolvedAt:     { type: Date },
    resolveMessage: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

toolReportSchema.index({ tool: 1, status: 1 });

module.exports = mongoose.model('ToolReport', toolReportSchema);
```

- [ ] **Step 3 : Vérifier la syntaxe**

```bash
cd server && node -e "require('./src/models/ToolReport'); require('./src/utils/constants'); console.log('OK')"
```

Attendu : `OK`

- [ ] **Step 4 : Commit**

```bash
git add server/src/utils/constants.js server/src/models/ToolReport.js
git commit -m "feat(reports): add ToolReport model and constants"
```

---

## Task 2 — Règles de validation

**Files:**
- Modify: `server/src/middleware/validators.js`

- [ ] **Step 1 : Ajouter les règles à la fin de `validators.js`**

```js
// Validateur pour la création d'un signalement
exports.toolReportValidationRules = () => [
  check('category')
    .notEmpty().withMessage('La catégorie est requise')
    .isIn(['broken', 'missing', 'incomplete', 'defective', 'other'])
    .withMessage('Catégorie invalide'),
  check('message')
    .optional()
    .isString().withMessage('Le message doit être une chaîne')
    .isLength({ max: 100 }).withMessage('Le message ne peut pas dépasser 100 caractères'),
];

// Validateur pour la résolution d'un signalement
exports.resolveReportValidationRules = () => [
  check('resolveMessage')
    .optional()
    .isString().withMessage('Le commentaire doit être une chaîne')
    .isLength({ max: 500 }).withMessage('Le commentaire ne peut pas dépasser 500 caractères'),
];
```

- [ ] **Step 2 : Commit**

```bash
git add server/src/middleware/validators.js
git commit -m "feat(reports): add toolReport and resolveReport validation rules"
```

---

## Task 3 — Fonction email

**Files:**
- Modify: `server/src/services/emailService.js`

- [ ] **Step 1 : Ajouter `sendToolReportEmail` à la fin de `emailService.js`**

```js
/**
 * Envoie un email aux admins lors d'un signalement de problème sur un outil
 * @param {Object} tool - L'outil concerné { name }
 * @param {Object} report - Le signalement { category, message }
 * @param {Object} student - L'étudiant { name, email }
 * @param {string[]} adminEmails - Liste des emails admins (fournie par le controller)
 */
exports.sendToolReportEmail = async (tool, report, student, adminEmails) => {
  try {
    if (!adminEmails || adminEmails.length === 0) {
      console.log('sendToolReportEmail : aucun destinataire, envoi annulé');
      return { success: false, reason: 'No recipients' };
    }

    const categoryLabels = {
      broken:     'Cassé / Endommagé',
      missing:    'Manquant / Introuvable',
      incomplete: 'Incomplet — pièces manquantes',
      defective:  'Défectueux — fonctionne mais problème',
      other:      'Autre',
    };

    const subject = `⚠️ Signalement inventaire : ${tool.name}`;
    const categoryLabel = categoryLabels[report.category] || report.category;
    const adminUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/inventory`;

    const messageRow = report.message
      ? `<tr style="background:#f8f9fa;"><td style="padding:8px;font-weight:bold;width:40%;">Message</td><td style="padding:8px;">${report.message}</td></tr>`
      : '';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0;padding:0;font-family:Arial,sans-serif;line-height:1.6;color:#333;">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;border-collapse:collapse;">
            <tr>
              <td style="background-color:#FF9800;padding:20px;text-align:center;color:white;">
                <h1 style="margin:0;font-size:24px;">⚠️ Signalement de problème</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:20px;">
                <p>Un étudiant a signalé un problème sur un outil de l'inventaire.</p>
                <table style="width:100%;border-collapse:collapse;">
                  <tr><td style="padding:8px;font-weight:bold;width:40%;">Outil</td><td style="padding:8px;">${tool.name}</td></tr>
                  <tr style="background:#f8f9fa;"><td style="padding:8px;font-weight:bold;">Catégorie</td><td style="padding:8px;">${categoryLabel}</td></tr>
                  <tr><td style="padding:8px;font-weight:bold;">Étudiant</td><td style="padding:8px;">${student.name} (${student.email})</td></tr>
                  ${messageRow}
                </table>
                <p style="margin-top:25px;">
                  <a href="${adminUrl}" style="display:inline-block;padding:10px 20px;background-color:#2196F3;color:white;text-decoration:none;border-radius:4px;font-weight:bold;">
                    Voir l'inventaire
                  </a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px;text-align:center;color:#888;font-size:12px;border-top:1px solid #eee;">
                {EPITECH} Nice — 131 Boulevard René Cassin — 06200 Nice, France
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const textContent = [
      `Signalement de problème — ${tool.name}`,
      `Catégorie : ${categoryLabel}`,
      `Étudiant : ${student.name} (${student.email})`,
      report.message ? `Message : ${report.message}` : '',
      `Voir l'inventaire : ${adminUrl}`,
    ].filter(Boolean).join('\n');

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Hub Projets <notifications@votredomaine.com>',
      to: adminEmails,
      subject,
      html: htmlContent,
      text: textContent,
    });

    if (error) {
      console.error('Erreur Resend signalement:', error);
      throw error;
    }

    return { success: true, messageId: data.id };
  } catch (error) {
    console.error('Erreur sendToolReportEmail:', error);
    throw error;
  }
};
```

- [ ] **Step 2 : Commit**

```bash
git add server/src/services/emailService.js
git commit -m "feat(reports): add sendToolReportEmail to emailService"
```

---

## Task 4 — Controller

**Files:**
- Create: `server/src/controllers/toolReportController.js`

- [ ] **Step 1 : Créer `server/src/controllers/toolReportController.js`**

```js
const ToolReport = require('../models/ToolReport');
const Tool = require('../models/Tool');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/asyncHandler');
const { REPORT_STATUS } = require('../utils/constants');
const emailService = require('../services/emailService');

// POST /api/tools/:id/report — tout utilisateur authentifié
exports.createReport = asyncHandler(async (req, res, next) => {
  const tool = await Tool.findById(req.params.id).lean();
  if (!tool) return next(new ErrorResponse('Outil non trouvé', 404));

  const { category, message } = req.body;

  const report = await ToolReport.create({
    tool: tool._id,
    student: {
      userId: req.user._id,
      name:   req.user.name,
      email:  req.user.email,
    },
    category,
    message: message || undefined,
  });

  // Email non-bloquant : on ne fait pas échouer la requête si l'email plante
  try {
    const admins = await User.find({ role: 'admin' }, 'email').lean();
    const adminEmails = admins.map((a) => a.email).filter(Boolean);
    if (adminEmails.length > 0) {
      await emailService.sendToolReportEmail(tool, report, req.user, adminEmails);
    }
  } catch (err) {
    console.error('Erreur envoi email signalement (non-bloquant):', err);
  }

  res.status(201).json({ success: true, data: report });
});

// GET /api/tools/:id/reports — admin uniquement
exports.getReports = asyncHandler(async (req, res, next) => {
  const tool = await Tool.findById(req.params.id).lean();
  if (!tool) return next(new ErrorResponse('Outil non trouvé', 404));

  const reports = await ToolReport.find({ tool: req.params.id })
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({ success: true, data: reports });
});

// PATCH /api/tools/:id/reports/:reportId/resolve — admin uniquement
exports.resolveReport = asyncHandler(async (req, res, next) => {
  const report = await ToolReport.findOne({
    _id:  req.params.reportId,
    tool: req.params.id,
  });

  if (!report) return next(new ErrorResponse('Signalement non trouvé', 404));

  if (report.status === REPORT_STATUS.RESOLVED) {
    return next(new ErrorResponse('Ce signalement est déjà résolu', 400));
  }

  report.status      = REPORT_STATUS.RESOLVED;
  report.resolvedBy  = { userId: req.user._id, name: req.user.name };
  report.resolvedAt  = new Date();
  if (req.body.resolveMessage) report.resolveMessage = req.body.resolveMessage;

  await report.save();

  res.status(200).json({ success: true, data: report });
});
```

- [ ] **Step 2 : Commit**

```bash
git add server/src/controllers/toolReportController.js
git commit -m "feat(reports): add toolReportController (create/get/resolve)"
```

---

## Task 5 — Routes + enrichissement getAllTools

**Files:**
- Modify: `server/src/routes/tools.js`
- Modify: `server/src/controllers/toolController.js`

- [ ] **Step 1 : Ajouter les imports dans `tools.js`**

Ajouter dans les imports validators :
```js
const {
  toolValidationRules,
  bulkImportValidationRules,
  verifyInventoryValidationRules,
  toolReportValidationRules,
  resolveReportValidationRules,
  validate,
} = require('../middleware/validators');
```

Ajouter dans les imports controller :
```js
const {
  createReport,
  getReports,
  resolveReport,
} = require('../controllers/toolReportController');
```

- [ ] **Step 2 : Enregistrer les routes dans `tools.js`**

Ajouter AVANT les routes `/:id` (pour éviter les collisions) — après la ligne `verify-inventory` :

```js
// Routes signalements — spécifiques avant /:id
router.post('/:id/report', authenticateToken, toolReportValidationRules(), validate, createReport);
router.get('/:id/reports', authenticateToken, isAdmin, getReports);
router.patch('/:id/reports/:reportId/resolve', authenticateToken, isAdmin, resolveReportValidationRules(), validate, resolveReport);
```

- [ ] **Step 3 : Ajouter `ToolReport` en import dans `toolController.js`**

En haut du fichier, après les autres imports :

```js
const ToolReport = require('../models/ToolReport');
```

- [ ] **Step 4 : Enrichir `getAllTools` avec `openReportCount`**

Dans `getAllTools`, après la ligne `await enrichWithUserLoans(tools, req.user?.id);` :

```js
// Enrichissement openReportCount pour le panel admin
const openReportAgg = await ToolReport.aggregate([
  { $match: { status: 'open' } },
  { $group: { _id: '$tool', count: { $sum: 1 } } },
]);
const reportCountMap = openReportAgg.reduce((acc, r) => {
  acc[r._id.toString()] = r.count;
  return acc;
}, {});
tools.forEach((t) => { t.openReportCount = reportCountMap[t._id.toString()] || 0; });
```

- [ ] **Step 5 : Vérifier que le serveur démarre sans erreur**

```bash
cd server && node -e "require('./src/app'); console.log('OK')"
```

Attendu : `OK` (warnings OAuth attendus, pas de stack trace)

- [ ] **Step 6 : Commit**

```bash
git add server/src/routes/tools.js server/src/controllers/toolController.js
git commit -m "feat(reports): register report routes and enrich getAllTools with openReportCount"
```

---

## Task 6 — Tests backend

**Files:**
- Create: `server/src/tests/functional/toolReports.test.js`

> `setup.js` nettoie toutes les collections via `afterEach` — pas besoin de cleanup manuel. Le `beforeEach` ci-dessous crée uniquement le fixture `tool` partagé par tous les tests.

- [ ] **Step 1 : Créer le fichier de test**

```js
const request = require('supertest');
const app = require('../../app');
const Tool = require('../../models/Tool');
const ToolReport = require('../../models/ToolReport');
const { createAdmin, createUser, authHeader } = require('../helpers/auth');

describe('ToolReport API', () => {
  let tool;

  beforeEach(async () => {
    tool = await Tool.create({ name: 'Test Tool', quantity: 2 });
  });

  // ── POST /api/tools/:id/report ─────────────────────────────────────────────
  describe('POST /api/tools/:id/report', () => {
    it('creates a report — 201', async () => {
      const student = await createUser();
      const res = await request(app)
        .post(`/api/tools/${tool._id}/report`)
        .set(authHeader(student))
        .send({ category: 'broken' });

      expect(res.status).toBe(201);
      expect(res.body.data.category).toBe('broken');
      expect(res.body.data.status).toBe('open');
    });

    it('creates a report with optional message — 201', async () => {
      const student = await createUser();
      const res = await request(app)
        .post(`/api/tools/${tool._id}/report`)
        .set(authHeader(student))
        .send({ category: 'missing', message: 'Il manque 2 câbles' });

      expect(res.status).toBe(201);
      expect(res.body.data.message).toBe('Il manque 2 câbles');
    });

    it('returns 401 without token', async () => {
      const res = await request(app)
        .post(`/api/tools/${tool._id}/report`)
        .send({ category: 'broken' });
      expect(res.status).toBe(401);
    });

    it('returns 404 for unknown tool', async () => {
      const student = await createUser();
      const res = await request(app)
        .post('/api/tools/000000000000000000000001/report')
        .set(authHeader(student))
        .send({ category: 'broken' });
      expect(res.status).toBe(404);
    });

    it('returns 400 for missing category', async () => {
      const student = await createUser();
      const res = await request(app)
        .post(`/api/tools/${tool._id}/report`)
        .set(authHeader(student))
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid category', async () => {
      const student = await createUser();
      const res = await request(app)
        .post(`/api/tools/${tool._id}/report`)
        .set(authHeader(student))
        .send({ category: 'exploded' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when message exceeds 100 chars', async () => {
      const student = await createUser();
      const res = await request(app)
        .post(`/api/tools/${tool._id}/report`)
        .set(authHeader(student))
        .send({ category: 'broken', message: 'a'.repeat(101) });
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/tools/:id/reports ─────────────────────────────────────────────
  describe('GET /api/tools/:id/reports', () => {
    it('returns reports for admin — 200', async () => {
      const admin = await createAdmin();
      await ToolReport.create({
        tool:     tool._id,
        student:  { userId: admin._id, name: admin.name, email: admin.email },
        category: 'broken',
      });

      const res = await request(app)
        .get(`/api/tools/${tool._id}/reports`)
        .set(authHeader(admin));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].category).toBe('broken');
    });

    it('returns 403 for non-admin', async () => {
      const student = await createUser();
      const res = await request(app)
        .get(`/api/tools/${tool._id}/reports`)
        .set(authHeader(student));
      expect(res.status).toBe(403);
    });

    it('returns 404 for unknown tool', async () => {
      const admin = await createAdmin();
      const res = await request(app)
        .get('/api/tools/000000000000000000000001/reports')
        .set(authHeader(admin));
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /api/tools/:id/reports/:reportId/resolve ────────────────────────
  describe('PATCH /api/tools/:id/reports/:reportId/resolve', () => {
    it('resolves a report with message — 200', async () => {
      const admin = await createAdmin();
      const report = await ToolReport.create({
        tool:     tool._id,
        student:  { userId: admin._id, name: admin.name, email: admin.email },
        category: 'broken',
      });

      const res = await request(app)
        .patch(`/api/tools/${tool._id}/reports/${report._id}/resolve`)
        .set(authHeader(admin))
        .send({ resolveMessage: 'Pièce remplacée' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('resolved');
      expect(res.body.data.resolveMessage).toBe('Pièce remplacée');
      expect(res.body.data.resolvedBy.name).toBe(admin.name);
      expect(res.body.data.resolvedAt).toBeDefined();
    });

    it('resolves a report without message — 200', async () => {
      const admin = await createAdmin();
      const report = await ToolReport.create({
        tool:     tool._id,
        student:  { userId: admin._id, name: admin.name, email: admin.email },
        category: 'missing',
      });

      const res = await request(app)
        .patch(`/api/tools/${tool._id}/reports/${report._id}/resolve`)
        .set(authHeader(admin))
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('resolved');
    });

    it('returns 400 when report is already resolved', async () => {
      const admin = await createAdmin();
      const report = await ToolReport.create({
        tool:       tool._id,
        student:    { userId: admin._id, name: admin.name, email: admin.email },
        category:   'broken',
        status:     'resolved',
        resolvedBy: { userId: admin._id, name: admin.name },
        resolvedAt: new Date(),
      });

      const res = await request(app)
        .patch(`/api/tools/${tool._id}/reports/${report._id}/resolve`)
        .set(authHeader(admin))
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown report', async () => {
      const admin = await createAdmin();
      const res = await request(app)
        .patch(`/api/tools/${tool._id}/reports/000000000000000000000001/resolve`)
        .set(authHeader(admin))
        .send({});
      expect(res.status).toBe(404);
    });

    it('returns 403 for non-admin', async () => {
      const student = await createUser();
      const admin = await createAdmin();
      const report = await ToolReport.create({
        tool:     tool._id,
        student:  { userId: admin._id, name: admin.name, email: admin.email },
        category: 'broken',
      });

      const res = await request(app)
        .patch(`/api/tools/${tool._id}/reports/${report._id}/resolve`)
        .set(authHeader(student))
        .send({});

      expect(res.status).toBe(403);
    });
  });
});
```

- [ ] **Step 2 : Lancer uniquement ce fichier de tests**

```bash
cd server && npx jest src/tests/functional/toolReports.test.js --verbose
```

Attendu : 13 tests PASS.

- [ ] **Step 3 : Lancer la suite complète pour vérifier les régressions**

```bash
cd server && npx jest --verbose
```

Attendu : tous les tests passent (88 existants + 13 nouveaux = 101 total).

- [ ] **Step 4 : Commit**

```bash
git add server/src/tests/functional/toolReports.test.js
git commit -m "test(reports): functional tests for ToolReport API (13 tests)"
```

---

## Task 7 — Frontend étudiant (page scan)

**Files:**
- Modify: `client/src/pages/inventory/scan/[id].js`

- [ ] **Step 1 : Ajouter les états pour le formulaire de signalement**

Après `const [quantity, setQuantity] = useState(1);`, ajouter :

```js
const [showReportForm, setShowReportForm]   = useState(false);
const [reportCategory, setReportCategory]   = useState('');
const [reportMessage, setReportMessage]     = useState('');
const [reportLoading, setReportLoading]     = useState(false);
const [reportSuccess, setReportSuccess]     = useState('');
const [reportError, setReportError]         = useState('');
```

- [ ] **Step 2 : Ajouter le handler `handleReport`**

Après `handleReturn`, ajouter :

```js
const handleReport = async () => {
  if (!reportCategory) return;
  setReportLoading(true);
  setReportError('');
  try {
    const body = { category: reportCategory };
    if (reportMessage.trim()) body.message = reportMessage.trim();
    await post(`/api/tools/${id}/report`, body);
    setReportSuccess('Signalement envoyé, merci !');
    setShowReportForm(false);
    setReportCategory('');
    setReportMessage('');
  } catch (err) {
    setReportError(err.message || 'Erreur lors du signalement');
  } finally {
    setReportLoading(false);
  }
};
```

- [ ] **Step 3 : Ajouter le bouton et le formulaire dans le JSX**

Ajouter `Select` aux imports depuis `'../../../components/ui/Select'` si ce composant existe, sinon utiliser un `<select>` natif stylisé. Vérifier avec :

```bash
ls /Users/juliani/Desktop/Dev/hub-project-platform/client/src/components/ui/Select.js 2>/dev/null && echo "EXISTS" || echo "USE_NATIVE"
```

Dans le JSX, à la fin de `<Card>`, après le bloc `isMaintenance ? ... : (...)` et avant la fermeture de `</Card>`, ajouter :

```jsx
{/* ── Signalement de problème ──────────────────────────── */}
<div className="mt-6 pt-4 border-t border-border">
  {reportSuccess && (
    <div
      className="mb-3 rounded-md border px-4 py-3 text-sm text-center"
      style={{
        backgroundColor: 'rgb(var(--status-approved-bg))',
        borderColor: 'rgb(var(--status-approved-text))',
        color: 'rgb(var(--status-approved-text))',
      }}
    >
      {reportSuccess}
    </div>
  )}

  {!showReportForm && !reportSuccess && (
    <button
      type="button"
      onClick={() => { setShowReportForm(true); setReportError(''); }}
      className="w-full text-sm text-text-muted hover:text-danger transition-colors text-center py-2"
    >
      Signaler un problème
    </button>
  )}

  {showReportForm && (
    <div className="space-y-3">
      <p className="text-sm font-medium text-text">Signaler un problème</p>

      <select
        value={reportCategory}
        onChange={(e) => setReportCategory(e.target.value)}
        className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="" disabled>Choisir une catégorie...</option>
        <option value="broken">Cassé / Endommagé</option>
        <option value="missing">Manquant / Introuvable</option>
        <option value="incomplete">Incomplet — pièces manquantes</option>
        <option value="defective">Défectueux — fonctionne mais problème</option>
        <option value="other">Autre</option>
      </select>

      <div>
        <textarea
          value={reportMessage}
          onChange={(e) => setReportMessage(e.target.value.slice(0, 100))}
          placeholder="Détails supplémentaires (optionnel)..."
          rows={2}
          maxLength={100}
          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <p className="text-xs text-text-dim text-right mt-0.5">{reportMessage.length}/100</p>
      </div>

      {reportError && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {reportError}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleReport}
          disabled={!reportCategory || reportLoading}
          className="flex-1 py-2 px-4 rounded-md text-sm font-medium bg-danger text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-danger/90 transition-colors"
        >
          {reportLoading ? 'Envoi...' : 'Envoyer'}
        </button>
        <button
          type="button"
          onClick={() => { setShowReportForm(false); setReportCategory(''); setReportMessage(''); setReportError(''); }}
          className="flex-1 py-2 px-4 rounded-md text-sm font-medium border border-border text-text-muted hover:text-text transition-colors"
        >
          Annuler
        </button>
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 4 : Commit**

```bash
git add client/src/pages/inventory/scan/[id].js
git commit -m "feat(reports): add report form to scan page"
```

---

## Task 8 — Frontend admin + documentation

**Files:**
- Modify: `client/src/pages/admin/inventory.js`
- Modify: `docs/inventory.md`

### Partie A — Panel admin

- [ ] **Step 1 : Ajouter les états pour la modal de signalements**

S'assurer que `patch` est destructuré depuis `useApi` en plus de `get` et `post` :

```js
const { get, post, patch } = useApi();
```

Après le bloc `// ── State vérification inventaire`, ajouter :

```js
// ── State signalements ────────────────────────────────────────────────
const [showReports, setShowReports]           = useState(false);
const [reportsToolId, setReportsToolId]       = useState(null);
const [reportsToolName, setReportsToolName]   = useState('');
const [reports, setReports]                   = useState([]);
const [reportsLoading, setReportsLoading]     = useState(false);
const [resolvingId, setResolvingId]           = useState(null);
const [resolveMsg, setResolveMsg]             = useState('');
const [resolveLoading, setResolveLoading]     = useState(false);
```

- [ ] **Step 2 : Ajouter les handlers `fetchReports` et `handleResolve`**

Après le bloc `// ── Vérification inventaire`, ajouter :

```js
// ── Signalements ──────────────────────────────────────────────────────
const openReportsModal = async (tool) => {
  setReportsToolId(tool._id);
  setReportsToolName(tool.name);
  setResolvingId(null);
  setResolveMsg('');
  setReports([]);
  setShowReports(true);
  setReportsLoading(true);
  try {
    const res = await get(`/api/tools/${tool._id}/reports`);
    setReports(res.data);
  } catch (err) {
    console.error('Erreur chargement signalements:', err);
  } finally {
    setReportsLoading(false);
  }
};

const handleResolve = async (reportId) => {
  setResolveLoading(true);
  try {
    const body = resolveMsg.trim() ? { resolveMessage: resolveMsg.trim() } : {};
    await patch(`/api/tools/${reportsToolId}/reports/${reportId}/resolve`, body);
    // Mettre à jour localement
    setReports((prev) =>
      prev.map((r) =>
        r._id === reportId
          ? { ...r, status: 'resolved', resolveMessage: resolveMsg.trim() || undefined, resolvedAt: new Date().toISOString() }
          : r
      )
    );
    setResolvingId(null);
    setResolveMsg('');
    // Rafraîchir la liste des outils pour mettre à jour les badges
    await fetchTools();
  } catch (err) {
    console.error('Erreur résolution signalement:', err);
  } finally {
    setResolveLoading(false);
  }
};
```

- [ ] **Step 3 : Ajouter le badge `openReportCount` dans la colonne "Outil" du DataTable**

Dans `COLUMNS`, modifier le render de la colonne `name` :

```js
{
  key: 'name',
  label: 'Outil',
  render: (v, row) => (
    <div>
      <div className="flex items-center gap-2">
        <p className="font-medium text-text">{v}</p>
        {row.openReportCount > 0 && (
          <Badge variant="rejected" size="sm">{row.openReportCount}</Badge>
        )}
      </div>
      {row.description && (
        <p className="text-xs text-text-muted truncate max-w-xs">{row.description}</p>
      )}
    </div>
  ),
},
```

- [ ] **Step 4 : Ajouter le bouton "Rapports" dans la colonne Actions**

Dans `COLUMNS`, dans le render de la colonne `_id`, ajouter le bouton "Rapports" avant "Modifier" (visible uniquement si `openReportCount > 0`) :

```jsx
{row.openReportCount > 0 && (
  <Button variant="outline" size="sm" onClick={() => openReportsModal(row)}>
    Rapports ({row.openReportCount})
  </Button>
)}
```

- [ ] **Step 5 : Ajouter la modal de signalements dans le JSX**

Ajouter après la modal "Vérifier l'inventaire", avant la modal "Ajout / Modification" :

```jsx
{/* ── Modal : Signalements ─────────────────────────────────────────────── */}
<Modal
  open={showReports}
  onClose={() => { setShowReports(false); setResolvingId(null); setResolveMsg(''); }}
  title={`Signalements — ${reportsToolName}`}
  size="lg"
  footer={
    <div className="flex justify-end">
      <Button variant="outline" onClick={() => { setShowReports(false); setResolvingId(null); setResolveMsg(''); }}>
        Fermer
      </Button>
    </div>
  }
>
  {reportsLoading ? (
    <p className="text-sm text-text-muted text-center py-6">Chargement...</p>
  ) : (
    <div className="space-y-6">
      {/* Section ouverts */}
      {(() => {
        const open = reports.filter((r) => r.status === 'open');
        const categoryLabels = {
          broken:     'Cassé / Endommagé',
          missing:    'Manquant / Introuvable',
          incomplete: 'Incomplet — pièces manquantes',
          defective:  'Défectueux — fonctionne mais problème',
          other:      'Autre',
        };
        if (open.length === 0) return (
          <div className="rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success font-medium text-center">
            Aucun signalement ouvert.
          </div>
        );
        return (
          <div>
            <p className="text-sm font-semibold text-text mb-2">Ouverts ({open.length})</p>
            <div className="space-y-3">
              {open.map((r) => (
                <div key={r._id} className="border border-border rounded-md p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge variant="rejected" size="sm">{categoryLabels[r.category] || r.category}</Badge>
                      <span className="ml-2 text-xs text-text-muted">
                        {r.student.name} · {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                    {resolvingId !== r._id && (
                      <Button variant="outline" size="sm" onClick={() => { setResolvingId(r._id); setResolveMsg(''); }}>
                        Résoudre
                      </Button>
                    )}
                  </div>
                  {r.message && (
                    <p className="text-sm text-text-muted italic">"{r.message}"</p>
                  )}
                  {resolvingId === r._id && (
                    <div className="space-y-2 pt-2 border-t border-border">
                      <textarea
                        value={resolveMsg}
                        onChange={(e) => setResolveMsg(e.target.value.slice(0, 500))}
                        placeholder="Commentaire de résolution (optionnel)..."
                        rows={2}
                        className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <p className="text-xs text-text-dim text-right">{resolveMsg.length}/500</p>
                      <div className="flex gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleResolve(r._id)}
                          loading={resolveLoading}
                        >
                          Confirmer
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setResolvingId(null); setResolveMsg(''); }}
                          disabled={resolveLoading}
                        >
                          Annuler
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Section résolus */}
      {(() => {
        const resolved = reports.filter((r) => r.status === 'resolved');
        const categoryLabels = {
          broken:     'Cassé / Endommagé',
          missing:    'Manquant / Introuvable',
          incomplete: 'Incomplet — pièces manquantes',
          defective:  'Défectueux — fonctionne mais problème',
          other:      'Autre',
        };
        if (resolved.length === 0) return null;
        return (
          <div>
            <p className="text-sm font-semibold text-text-muted mb-2">Résolus ({resolved.length})</p>
            <div className="space-y-2">
              {resolved.map((r) => (
                <div key={r._id} className="border border-border rounded-md p-3 opacity-60">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="approved" size="sm">{categoryLabels[r.category] || r.category}</Badge>
                    <span className="text-xs text-text-muted">
                      {r.student.name} · {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                    </span>
                    {r.resolvedBy && (
                      <span className="text-xs text-text-dim">
                        · Résolu par {r.resolvedBy.name} le {new Date(r.resolvedAt).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                  </div>
                  {r.resolveMessage && (
                    <p className="text-xs text-text-muted mt-1 italic">"{r.resolveMessage}"</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  )}
</Modal>
```

- [ ] **Step 6 : Commit frontend admin**

```bash
git add client/src/pages/admin/inventory.js
git commit -m "feat(reports): add report badge and resolution modal to admin inventory"
```

### Partie B — Documentation

- [ ] **Step 7 : Mettre à jour `docs/inventory.md`**

Dans la section "Routes API (Admin Uniquement)", ajouter après `verify-inventory` :

```
- `POST /api/tools/:id/report` : (tout utilisateur authentifié) Crée un signalement de problème sur un outil. Accepte `category` (obligatoire : `broken` | `missing` | `incomplete` | `defective` | `other`) et `message` (optionnel, max 100 chars). Envoie un email aux admins (non-bloquant).
- `GET /api/tools/:id/reports` : (admin) Liste tous les signalements d'un outil (ouverts + résolus), triés du plus récent au plus ancien.
- `PATCH /api/tools/:id/reports/:reportId/resolve` : (admin) Marque un signalement comme résolu. Accepte `resolveMessage` (optionnel, max 500 chars).
```

Dans la section "Le Flux Gestionnaire", mettre à jour le point 5 existant (ou en ajouter un 6e) :

```
6. Il peut consulter les **signalements de problèmes** sur chaque outil via un badge rouge visible dans la liste (nombre de signalements ouverts). Au clic, une modal liste les signalements avec la possibilité de les résoudre en ajoutant un commentaire.
```

- [ ] **Step 8 : Commit documentation**

```bash
git add docs/inventory.md
git commit -m "docs: document ToolReport endpoints and admin workflow"
```
