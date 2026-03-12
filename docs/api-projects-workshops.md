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

**Query params** : `?status=pending` (optionnel)

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

#### `PATCH /api/projects/:id/complete`
Marquer un projet comme terminé (`status → completed`).

---

#### `GET /api/projects/export/csv`
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
| `/api/workshops` | GET | Admin | Tous les workshops |
| `/api/workshops/:id/review` | PATCH | Admin | Approuver/rejeter |
| `/api/workshops/:id/request-changes` | PATCH | Admin | Demander modifications |
| `/api/workshops/:id/complete` | PATCH | Admin | Marquer terminé |

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
