# API — Projets, Workshops, Users

Base URL : `http://localhost:5000`

Toutes les routes (sauf auth et health) nécessitent le header :
```
Authorization: Bearer <JWT>
```

---

## Authentification

| Route | Méthode | Auth | Description |
|-------|---------|------|-------------|
| `/api/auth/microsoft` | GET | Non | Lance le flux OAuth Microsoft |
| `/api/auth/microsoft/callback` | GET | Non | Callback OAuth — génère JWT et redirige vers le frontend |

**Redirect après connexion** : `{FRONTEND_URL}/auth/callback?token=<JWT>&redirectTo=/dashboard`

---

## Projets

### Étudiant

#### `POST /api/projects`
Créer un nouveau projet.

**Body** :
```json
{
  "name": "Mon Projet",
  "description": "Description",
  "objectives": "Objectifs",
  "technologies": ["React", "Node.js"],
  "studentCount": 3,
  "studentEmails": ["student1@epitech.eu", "student2@epitech.eu"],
  "links": {
    "github": "https://github.com/user/repo",
    "projectGithub": "https://github.com/team/project",
    "other": []
  }
}
```

---

#### `GET /api/projects/me`
Récupérer les projets de l'utilisateur connecté.

---

#### `GET /api/projects/:id`
Détails d'un projet. Accessible au créateur, aux membres, et aux admins.

---

#### `PUT /api/projects/:id`
Modifier un projet. Réservé au créateur. Uniquement si `status === 'pending'` ou `'pending_changes'`.

---

#### `PATCH /api/projects/:id/additional-info`
Ajouter des informations post-approbation (liens finaux, documents).

**Body** :
```json
{
  "personalGithub": "https://github.com/user",
  "projectGithub": "https://github.com/team/project",
  "documents": ["https://doc1.com"]
}
```

---

#### `DELETE /api/projects/:id`
Supprimer un projet. Réservé au créateur ou à un admin.

---

#### `POST /api/projects/:id/leave`
Quitter un projet (membres non-créateurs uniquement).

---

### Admin

#### `GET /api/projects`
Récupérer tous les projets.

**Query params** :
- `status=pending` (optionnel)
- `page=1` (optionnel, défaut: 1)
- `limit=20` (optionnel, défaut: 20)
- `search=` (optionnel) — recherche insensible à la casse sur le nom du projet, le nom/email du créateur et l'email des membres. Si présent, ignore la pagination et renvoie tous les résultats.
- `schoolYear=YYYY-YYYY` (optionnel) — filtre sur `createdAt` entre le 1er septembre de l'année de début et le 31 août de l'année suivante (ex : `schoolYear=2025-2026` → `[2025-09-01, 2026-09-01[`)

---

#### `GET /api/projects/stats`
Statistiques des projets par statut (admin).

**Query params** :
- `schoolYear=YYYY-YYYY` (optionnel, même filtre que ci-dessus)

**Réponse** :
```json
{
  "success": true,
  "data": {
    "pending": 3,
    "pending_changes": 1,
    "approved": 12,
    "rejected": 2,
    "completed": 8,
    "total": 26
  }
}
```

---

#### `PATCH /api/projects/:id/review`
Approuver ou rejeter un projet.

**Body** :
```json
{
  "status": "approved",
  "comments": "Bon travail !",
  "credits": 5
}
```

Si `approved` : envoie les données à l'API Intra Epitech + email de notification.

---

#### `PATCH /api/projects/:id/request-changes`
Demander des modifications. Passe le statut à `pending_changes`.

**Body** :
```json
{ "comments": "Veuillez détailler les objectifs." }
```

---

#### `POST /api/projects/notify-pending-changes`
Relance email en masse : met en file d'attente l'envoi de l'email de notification (job `sendStatusEmail` via `backgroundJobs`) pour tous les projets actuellement en statut `pending_changes`. L'envoi n'est pas synchrone : la réponse confirme la mise en file, pas la livraison.

**Réponse** :
```json
{ "success": true, "total": 4 }
```
(`total` = nombre d'emails mis en file d'attente, pas nécessairement déjà délivrés)

---

#### `POST /api/projects/:id/resend-notification`
Relance email unitaire pour un projet en statut `pending_changes` : met en file d'attente le même job `sendStatusEmail` que ci-dessus (envoi asynchrone, non synchrone).

**Erreurs** :
- `404` si le projet n'existe pas
- `400` si le projet n'est pas en statut `pending_changes`

**Réponse** :
```json
{ "success": true }
```

---

#### `PATCH /api/projects/:id/complete`
Marquer un projet comme terminé (`status → completed`).

**Body** :
```json
{ "defenseDate": "2026-11-20T14:00:00.000Z", "comments": "..." }
```

- `defenseDate` : obligatoire, date et heure de la soutenance (ISO 8601). Elle sert à créer la session et les présences sur my (voir `sync-my`)
- `comments` : optionnel, enregistré dans `reviewedBy.comments`

**Erreurs** :
- `404` si le projet n'existe pas
- `400` si le projet n'est pas en statut `approved`
- `400` si `defenseDate` est absente ou invalide

---

#### `POST /api/projects/:id/sync-my`
Envoie un projet terminé sur my.epitech.eu (admin uniquement) : création de l'activité et de la session, inscription et présence de chaque membre, puis ajout des points sur le critère Student Engagement. L'envoi est reprenable : une relance ne refait jamais une étape déjà faite.

**Conditions** (sinon `400`) :
- le projet est en statut `completed`
- `credits > 0`
- `defenseDate` est renseignée
- le projet n'est pas déjà synchronisé (`mySync.status = done`)

**Étapes** (chaque appel réussi est enregistré avant de passer au suivant) :
1. Activité `Projet HUB - <nom du projet>` sur l'unité Hub de my. Si aucune n'est enregistrée sur le projet, le Hub cherche d'abord sur my une activité de ce nom dont la description contient l'URL admin du projet (cas d'une création réussie sur my mais dont la réponse n'est pas arrivée) : une seule trouvée = réutilisée, plusieurs = arrêt en erreur sans rien créer
2. Session de 30 minutes à `defenseDate` (même principe : une session déjà présente dans l'activité est réutilisée, plusieurs = arrêt en erreur)
3. Pour chaque membre : inscription à la session, puis présence
4. Pour chaque membre : points = `credits × 4`, ajoutés à la note actuelle du critère Student Engagement. Si la note obtenue dépasserait le maximum `MY_MAX_ENGAGEMENT_MARK` (16 en 2026) ou n'est pas une valeur autorisée de la grille, les points sont refusés pour cet étudiant : rien n'est écrit sur my, la note n'est jamais écrêtée. Après l'écriture, le Hub relit la note sur my et n'enregistre `pointsApplied` que si elle vaut la note visée. La note est laissée non confirmée : le Hub ne confirme ni ne rouvre jamais une évaluation sur my

Les erreurs sont gérées par étudiant : un étudiant en erreur n'empêche pas les autres d'être traités. Les points ne sont jamais ajoutés deux fois : `markBefore` et `markTarget` sont réservés en base de façon atomique avant l'écriture sur my (un envoi concurrent qui a déjà réservé l'étudiant bloque l'écriture), une reprise compare la note lue sur my à ces valeurs, et les envois de deux projets d'un même étudiant sont traités l'un après l'autre. Un projet sans membre se termine en `partial` avec `lastError` « Aucun membre à synchroniser ».

**Verrou** : un envoi à la fois par projet (`mySync.inProgressUntil`, expiration automatique après 2 minutes, prolongé à chaque étape tant que l'envoi progresse).

**Codes de réponse** :
- `200` : envoi terminé, `data.mySync.status` vaut `done` ou `partial` (au moins un étudiant ou une étape en erreur : relancer après correction)
- `404` si le projet n'existe pas
- `400` si une condition ci-dessus n'est pas remplie
- `409` « Une synchronisation est déjà en cours pour ce projet »
- `500` si la configuration my est incomplète ou invalide (variables d'environnement `MY_*`)

**Réponse** : le projet mis à jour, avec le détail dans `data.mySync` (`status`, `activityId`, `eventId`, `lastAttemptAt`, `lastError`, `students[]` avec `registered`, `present`, `markBefore`, `markTarget`, `pointsApplied`, `error`).

Un `401` ou `403` renvoyé par my est présenté comme `Clé API my invalide ou expirée` dans `mySync.lastError` ou dans l'erreur de l'étudiant.

---

#### `GET /api/projects/export/completed-csv`
Exporter les projets terminés en CSV.

**Query params** :
- `startDate` : YYYY-MM-DD (optionnel)
- `endDate` : YYYY-MM-DD (optionnel)

**Format CSV** (séparateur `;`) :
```
login;grade;credits;number project
student1@epitech.eu;Acquis;15;3
student2@epitech.eu;Acquis;10;2
```

- `grade` : "Acquis" si `credits > 0`, sinon "-"
- Crédits et nombre de projets agrégés par email

---

## Workshops

Les workshops suivent la même structure que les projets, sans crédits ni intégration API externe.

| Route | Méthode | Auth | Description |
|-------|---------|------|-------------|
| `/api/workshops` | POST | Student | Créer un workshop |
| `/api/workshops/me` | GET | Student | Mes workshops |
| `/api/workshops/:id` | GET | Owner/Admin | Détails workshop |
| `/api/workshops/:id` | PUT | Owner | Modifier workshop |
| `/api/workshops/:id` | DELETE | Owner/Admin | Supprimer workshop |
| `/api/workshops/:id/leave` | POST | Instructor | Quitter workshop |
| `/api/workshops` | GET | Admin | Tous les workshops (avec pagination `page`, `limit`, filtre `status` et `schoolYear=YYYY-YYYY`) |
| `/api/workshops/stats` | GET | Admin | Statistiques par statut (`pending`, `pending_changes`, `approved`, `rejected`, `completed`, `total`), avec filtre optionnel `schoolYear=YYYY-YYYY` |
| `/api/workshops/:id/review` | PATCH | Admin | Approuver/rejeter |
| `/api/workshops/:id/request-changes` | PATCH | Admin | Demander modifications |
| `/api/workshops/:id/complete` | PATCH | Admin | Marquer terminé |

`schoolYear` filtre sur `createdAt` entre le 1er septembre de l'année de début et le 31 août de l'année suivante (même logique que pour `/api/projects`).

**Pas d'équivalent workshops** pour `notify-pending-changes` / `resend-notification` : ces deux routes de relance email n'existent que pour les projets (`server/src/routes/projects.js`).

---

## Users

#### `GET /api/users/me`
Récupérer le profil de l'utilisateur connecté.

**Réponse** :
```json
{
  "success": true,
  "user": {
    "id": "...",
    "name": "Prénom Nom",
    "email": "user@epitech.eu",
    "role": "student",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "lastLogin": "2026-03-12T10:30:00.000Z"
  }
}
```

---

## Health Check

#### `GET /api/health`
Vérifier que le serveur répond. Pas d'authentification requise.

**Réponse** :
```json
{ "status": "OK", "timestamp": "2026-03-12T10:30:00.000Z" }
```
