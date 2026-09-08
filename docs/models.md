# Modèles de Base de Données

Base de données : **MongoDB** via **Mongoose**.

---

## User

```js
{
  microsoftId: String,       // ID Microsoft unique — requis, unique
  email: String,             // Email — requis, unique
  name: String,              // Nom complet — requis
  role: String,              // 'student' | 'admin' (défaut: 'student')
  createdAt: Date,
  lastLogin: Date
}
```

**Indexes** : `microsoftId`, `email`

---

## Project

```js
{
  name: String,
  description: String,
  objectives: String,
  technologies: [String],
  studentCount: Number,
  studentEmails: [String],

  links: {
    github: String,           // GitHub personnel
    projectGithub: String,    // GitHub du projet
    other: [String]
  },

  status: String,             // Enum via constants : 'pending' | 'pending_changes' | 'approved' | 'rejected' | 'completed'
  credits: Number,

  members: [{
    email: String,
    userId: ObjectId,
    isCreator: Boolean
  }],

  submittedBy: { userId: ObjectId, name: String, email: String },
  reviewedBy:  { userId: ObjectId, name: String, comments: String },

  additionalInfo: {
    personalGithub: String,
    projectGithub: String,
    documents: [String]
  },

  externalRequestStatus: {   // Intégration API Intra Epitech
    sent: Boolean,
    sentAt: Date,
    response: Object
  },

  changeHistory: [{
    status: String,
    comments: String,
    reviewer: { userId: ObjectId, name: String },
    date: Date
  }],

  createdAt: Date,
  updatedAt: Date
}
```

**Indexes** : `status`, `submittedBy.userId`, `members.userId`

---

## Workshop

```js
{
  title: String,
  details: String,
  instructorCount: Number,
  instructorEmails: [String],

  links: {
    github: String,
    presentation: String,
    other: [String]
  },

  status: String,             // Enum WORKSHOP_STATUSES : 'pending' | 'pending_changes' | 'approved' | 'rejected' | 'completed'

  instructors: [{
    email: String,
    userId: ObjectId,
    isMain: Boolean
  }],

  submittedBy: { userId: ObjectId, name: String, email: String },
  reviewedBy:  { userId: ObjectId, name: String, comments: String },

  changeHistory: [{
    status: String,
    comments: String,
    reviewer: { userId: ObjectId, name: String },
    date: Date
  }],

  createdAt: Date,
  updatedAt: Date
}
```

**Indexes** : `status`, `submittedBy.userId`, `instructors.userId`

**Note** : Les workshops n'ont pas de système de crédits ni d'intégration API externe.

---

## SimulatedProject *(catalogue admin)*

```js
{
  title: String,              // Requis
  subjectFile: String,        // Chemin relatif du PDF uploadé
                              // ex: "simulated-subjects/1234567890-sujet.pdf"
                              // Servi via GET /uploads/simulated-subjects/<filename>
  isActive: Boolean,          // Visible aux étudiants (défaut: true)
  createdBy: { userId: ObjectId, name: String },
  createdAt: Date,
  updatedAt: Date
}
```

---

## SimulatedEnrollment *(cycle d'un étudiant sur un projet)*

```js
{
  student: { userId: ObjectId, name: String, email: String },
  simulatedProject: { projectId: ObjectId, title: String },

  cycleNumber: Number,              // Numéro du cycle courant (incrémenté à chaque relance)
  phase: Number,                    // 1 ou 2
  isDoubleCycle: Boolean,           // Activé par admin — crédits étendus

  // Dates du cycle (null si enrollment forcé hors fenêtre)
  startDate: Date,
  firstSubmissionDeadline: Date,
  firstDefenseDate: Date,
  secondSubmissionDeadline: Date,
  secondDefenseDate: Date,

  githubProjectLink: String,        // Lien GitHub Project soumis par l'étudiant
  status: String,                   // Enum SIMULATED_STATUSES : 'pending' | 'pending_changes' | 'approved' | 'rejected'
  lockedByAdmin: Boolean,           // true : étudiant ne peut plus modifier

  // Crédits du cycle courant (remis à null à chaque relance)
  phase1Credits: Number,
  credits: Number,                  // Crédits phase 2

  // Historique des défenses — jamais réinitialisé, persiste à travers les relances
  defenseHistory: [{
    defenseNumber: Number,
    cycleNumber: Number,
    phase: Number,
    credits: Number,
    comments: String,
    reviewer: { userId: ObjectId, name: String },
    date: Date
  }],

  // Cumul total des crédits pour ce projet — jamais réinitialisé
  totalCredits: Number,

  changeHistory: [{
    status: String,
    comments: String,
    reviewer: { userId: ObjectId, name: String },
    date: Date
  }],

  isCompleted: Boolean,             // true après "Marquer comme terminé"
  submittedAt: Date,
  updatedAt: Date
}
```

**Points clés** :
- `defenseHistory` et `totalCredits` **ne sont jamais réinitialisés** lors d'une relance — ils accumulent l'historique complet du projet.
- `phase1Credits` et `credits` sont remis à `null` à chaque relance.
- Un étudiant peut avoir plusieurs enrollments terminés (`isCompleted: true`) sur des projets différents, chacun avec son propre `totalCredits`.

---

## SimulatedCycle *(fenêtre de dépôt planifiée)*

```js
{
  name: String,                       // ex: "Cycle 3 — Printemps 2026"

  // Calendrier du cycle
  startDate: Date,                    // W0 vendredi — ouverture phase 1
  firstSubmissionDeadline: Date,      // W1 mercredi — deadline dépôt phase 1
  firstDefenseDate: Date,             // W2 vendredi — 1ère défense
  secondSubmissionDeadline: Date,     // W3 mercredi — deadline dépôt phase 2
  secondDefenseDate: Date,            // W4 vendredi — 2ème défense (fin du cycle)

  isDoubleCycle: Boolean,             // Plage de crédits étendue (ex: vacances)
  createdBy: { userId: ObjectId, name: String },
  createdAt: Date
}
```

**Phases ouvertes** (logique `getCurrentCycle`) :
- **Phase 1** : `startDate ≤ now ≤ firstSubmissionDeadline`
- **Phase 2** : `firstDefenseDate ≤ now ≤ secondSubmissionDeadline`

---

## Printer *(imprimante 3D)*

```js
{
  name: String,               // Requis
  model: String,               // Requis — 'kobra3' | 'kobra3max'
  apiKeyHash: String,          // Requis — hash de la clé API utilisée par l'agent Python

  status: String,              // Enum PRINTER_STATUSES (défaut 'idle') :
                                // 'idle' | 'printing' | 'awaiting_clearance' | 'offline' | 'error' | 'disabled'
  lastKnownStatus: String,     // Enum PRINTER_STATUSES (défaut 'idle') — dernier statut connu avant passage offline
  currentJob: ObjectId,        // → PrintJob, null si aucun job en cours
  lastSeenAt: Date,            // Dernier heartbeat reçu de l'agent (défaut : maintenant)

  clearanceHistory: [{         // Historique des libérations de plateau
    method: String,            // Enum CLEARANCE_METHODS : 'qr' | 'admin_override'
    byUserId: ObjectId,        // → User
    byEmail: String,
    byName: String,
    date: Date
  }],

  statusHistory: [{            // Historique des changements de statut
    status: String,            // Enum PRINTER_STATUSES
    source: String,            // Enum PRINTER_STATUS_SOURCES : 'agent_report' | 'admin_action' | 'heartbeat_timeout'
    detail: String,
    byUserId: ObjectId,        // → User (présent pour source 'admin_action')
    byName: String,
    date: Date
  }],

  createdAt: Date
}
```

**Note** : `status` passe à `offline` via `heartbeat_timeout` lorsque l'agent ne renvoie plus de heartbeat dans le délai attendu ; `disabled` est un statut manuel (`admin_action`) qui empêche l'envoi de nouveaux jobs.

---

## PrintAuthorization *(whitelist d'accès à l'impression 3D)*

```js
{
  email: String,               // Requis, unique, lowercase, trim
  authorized: Boolean,         // Défaut : false

  history: [{                  // Historique des décisions d'autorisation/blacklist
    authorized: Boolean,
    byUserId: ObjectId,        // → User
    byName: String,
    date: Date,
    note: String
  }]
}
```

**Note** : chaque appel à `POST /api/print/whitelist` (autoriser ou blacklister) ajoute une entrée à `history` et résout automatiquement toute `PrintAccessRequest` en attente pour cet email (voir ci-dessous).

---

## PrintJob

```js
{
  student: { email: String, name: String },   // Requis

  printer: ObjectId,           // Requis — → Printer
  fileName: String,            // Requis — nom du fichier envoyé
  filePath: String,            // Requis — chemin de stockage local

  status: String,               // Enum PRINT_JOB_STATUSES (défaut 'queued') :
                                 // 'rejected' | 'queued' | 'sent' | 'printing' | 'completed' | 'failed' | 'cancelled'
  rejectionReason: String,      // Enum PRINT_REJECTION_REASONS | null (défaut null) :
                                 // 'not_authorized' | 'printer_busy' | 'printer_offline' | 'printer_error' | 'printer_disabled'
  errorMessage: String,         // Défaut null
  cancelRequestedAt: Date,      // Défaut null — posé au moment de la demande d'annulation d'un job
                                 // 'sent'/'printing' (annulation asynchrone). Reste posé une fois le
                                 // job résolu en 'cancelled' : enregistrement permanent de la date de
                                 // demande à des fins d'audit, pas un état transitoire — ce sont
                                 // `job.status` et le contrôle terminal du heartbeat qui déterminent
                                 // si une annulation est encore en cours, pas ce champ.
  cancelledBy: {                 // { email, role }, défaut { email: null, role: null } — qui a
    email: String,               // demandé l'annulation (étudiant propriétaire ou admin)
    role: String
  },

  submittedAt: Date,            // Défaut : maintenant
  startedAt: Date,              // Défaut null
  completedAt: Date,            // Défaut null

  history: [{                   // Historique des transitions de statut
    status: String,             // Enum PRINT_JOB_STATUSES
    date: Date,
    detail: String
  }]
}
```

**Indexes** : `{ 'student.email': 1, submittedAt: -1 }`, `{ printer: 1, status: 1 }`

---

## PrintAccessRequest *(demande d'accès à l'impression 3D)*

```js
{
  student: { userId: ObjectId, name: String, email: String },   // Requis (userId → User)

  status: String,               // Enum PRINT_ACCESS_REQUEST_STATUSES (défaut 'pending') :
                                 // 'pending' | 'resolved'
  requestedAt: Date,            // Défaut : maintenant
  resolvedAt: Date              // Défaut null
}
```

**Indexes** : `{ 'student.email': 1, status: 1 }`

**Note** : créée quand un étudiant non whitelisté tente d'accéder à l'impression 3D (un email est envoyé aux admins). Elle est résolue automatiquement — sans action dédiée — dès qu'un admin statue sur l'email du demandeur via `PrintAuthorization` (autorisation ou blacklist), qu'il s'agisse ou non de la demande d'origine.

---

## ToolReport *(signalement de problème sur un outil d'inventaire)*

```js
{
  tool: ObjectId,               // Requis — → Tool

  student: { userId: ObjectId, name: String, email: String },   // Requis (userId → User)

  category: String,             // Requis — Enum REPORT_CATEGORIES :
                                 // 'broken' | 'missing' | 'incomplete' | 'defective' | 'other'
  message: String,               // Optionnel, trim, maxlength 100

  status: String,                // Enum REPORT_STATUS (défaut 'open') : 'open' | 'resolved'
  resolvedBy: { userId: ObjectId, name: String },   // userId → User
  resolvedAt: Date,
  resolveMessage: String,        // Optionnel, trim, maxlength 500

  createdAt: Date,               // via timestamps
  updatedAt: Date                // via timestamps
}
```

**Indexes** : `{ tool: 1, status: 1 }`

**Note** : voir aussi `docs/inventory.md` pour le flux fonctionnel des signalements (badge sur la colonne "Outil", modal de résolution admin).
