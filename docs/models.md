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

  status: String,             // 'pending' | 'pending_changes' | 'approved' | 'rejected' | 'completed'
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

  status: String,             // 'pending' | 'pending_changes' | 'approved' | 'rejected' | 'completed'

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
  status: String,                   // 'pending' | 'pending_changes' | 'approved' | 'rejected'
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
