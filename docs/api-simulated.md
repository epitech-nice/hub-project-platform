# API — Simulated Professional Work

Base URL : `http://localhost:5000/api/simulated`

Toutes les routes nécessitent `Authorization: Bearer <JWT>`.

Toutes les routes nécessitent `Authorization: Bearer <JWT>`.

---

## Gestion des Erreurs Globales
Toutes les validations (express-validator) échouées retournent le format standardisé suivant (géré par `validators.js` et le hook `useApi` côté frontend) :
```json
{
  "success": false,
  "message": "Le titre est requis | Le lien GitHub doit être une URL",
  "errors": [
    { "field": "title", "msg": "Le titre est requis" },
    { "field": "githubLink", "msg": "Le lien GitHub doit être une URL" }
  ]
}
```

---

## Catalogue de projets

| Route | Méthode | Auth | Description |
|-------|---------|------|-------------|
| `/catalog` | GET | Student/Admin | Liste des projets du catalogue |
| `/catalog/:id` | GET | Student/Admin | Détails d'un projet catalogue |
| `/catalog` | POST | Admin | Créer un projet (+ upload PDF) |
| `/catalog/:id` | PUT | Admin | Modifier un projet |
| `/catalog/:id` | DELETE | Admin | Supprimer un projet |

### Upload PDF

Route `POST /catalog` et `PUT /catalog/:id` acceptent `multipart/form-data` avec le champ `subjectFile`.

- **Format accepté** : PDF uniquement
- **Taille max** : 10 MB
- **Stockage** : `server/uploads/simulated-subjects/{timestamp}-{nom}.pdf`
- **Accès public** : `GET /uploads/simulated-subjects/<filename>`
- **Champ en base** : `subjectFile` stocke le chemin relatif `"simulated-subjects/{filename}"`

---

## Enrollments — Étudiant

### `GET /me`
Retourne l'enrollment actif de l'étudiant connecté (non terminé), ou `null`.

### `GET /my-history`
Retourne tous les enrollments de l'étudiant (actifs + terminés), triés par date.

### `POST /enroll`
S'inscrire à un projet du catalogue.

**Body** :
```json
{ "projectId": "..." }
```

**Conditions** :
- Une fenêtre de phase 1 doit être ouverte
- L'étudiant ne doit pas avoir d'enrollment actif
- Le projet ne doit pas avoir été complété par cet étudiant

**Crée** un enrollment avec `status: "pending"`, `phase: 1`, dates issues du cycle courant.

### `PUT /enrollments/:id`
Mettre à jour le lien GitHub Project.

**Body** :
```json
{ "githubProjectLink": "https://github.com/orgs/xxx/projects/1" }
```

**Conditions** : enrollment appartient à l'étudiant, `lockedByAdmin === false`.

Ajoute une entrée dans `changeHistory` à chaque mise à jour (que le statut soit `pending` ou `pending_changes`).

---

## Enrollments — Admin

### `POST /force-enroll`
Inscrire un étudiant manuellement, sans qu'une fenêtre de cycle soit ouverte.

**Body** :
```json
{
  "projectId": "...",
  "studentEmail": "etudiant@epitech.eu"
}
```

**Comportement** :
- Cherche l'utilisateur par email (doit exister en base)
- Vérifie qu'il n'a pas d'enrollment actif
- Crée l'enrollment avec `githubProjectLink: null` — l'étudiant dépose son lien depuis son espace
- Trace dans `changeHistory` : "Inscription forcée par l'administrateur {nom}"

---

### `GET /enrollments`
Tous les enrollments. Supporte filtrage par `?status=pending`.

### `GET /enrollments/export`
Export CSV des enrollments terminés (`isCompleted: true`).

**Format CSV** (séparateur `;`) :
```
login;projet;cycles_effectues;double_cycle;total_credits
etudiant@epitech.eu;Nom du projet;2;non;3
```

### `GET /enrollments/:id`
Détails complets d'un enrollment (toutes les données + `changeHistory` + `defenseHistory`).

---

### `PATCH /enrollments/:id/review`
Valider ou rejeter le GitHub soumis par l'étudiant.

**Body** :
```json
{
  "status": "approved",
  "comments": "Lien valide, bon travail."
}
```

**Valeurs de `status`** : `"approved"` | `"rejected"` | `"pending_changes"`

**Effets** :
- `approved` → `lockedByAdmin = true` (étudiant ne peut plus modifier)
- `rejected` / `pending_changes` → `lockedByAdmin = false`
- Ajoute une entrée dans `changeHistory`
- Envoie un email de notification à l'étudiant

---

### `PATCH /enrollments/:id/defend`
Enregistrer une défense et attribuer des crédits.

**Body** :
```json
{ "credits": 1.5, "comments": "Bonne présentation." }
```

**Conditions** : `status === "approved"` et la phase courante n'a pas encore été défendue.

**Effets selon la phase** :

| Phase | Effet |
|-------|-------|
| **Phase 1** | `phase1Credits = credits`, `phase → 2`, `status → "pending_changes"`, `lockedByAdmin = false` |
| **Phase 2** | `credits = credits`, `status → "approved"`, `lockedByAdmin = true` |

Dans les deux cas :
- Entrée ajoutée dans `defenseHistory`
- `totalCredits` incrémenté

---

### `PATCH /enrollments/:id/toggle-double-cycle`
Activer ou désactiver le double cycle sur un enrollment.

---

### `PATCH /enrollments/:id/complete`
Marquer un enrollment comme terminé.

**Conditions** : `phase === 2`, `credits !== null`, `isCompleted === false`

**Effet** : `isCompleted = true`, email envoyé.

---

### `POST /enrollments/:id/relaunch`
Relancer un nouveau cycle sur le même projet.

**Conditions** : `phase === 2`, `credits !== null`

**Effets** :
- `cycleNumber++`
- `phase → 1`, `status → "pending"`, `lockedByAdmin = false`
- `phase1Credits = null`, `credits = null`
- `githubProjectLink = null`
- **`defenseHistory` et `totalCredits` sont conservés**

---

### `DELETE /enrollments/:id`
Supprimer définitivement un enrollment.

---

## Cycles

### `GET /cycles/current`
Retourne le cycle dont une fenêtre est actuellement ouverte, avec la phase active.

**Réponse** :
```json
{
  "success": true,
  "data": {
    "cycle": { /* SimulatedCycle */ },
    "currentPhase": 1
  }
}
```
`data: null` si aucune fenêtre n'est ouverte.

**Logique** :
- Phase 1 ouverte : `startDate ≤ now ≤ firstSubmissionDeadline`
- Phase 2 ouverte : `firstDefenseDate ≤ now ≤ secondSubmissionDeadline`

---

### `GET /cycles/upcoming`
Retourne **tous** les cycles triés par `startDate` (passés + futurs).
Accessible à tous les utilisateurs authentifiés — utilisé pour le modal calendrier côté étudiant.

---

### `GET /cycles` *(admin)*
Même contenu que `/cycles/upcoming`, route admin.

### `POST /cycles` *(admin)*
Créer un cycle manuellement.

**Body** :
```json
{
  "name": "Cycle 3 — Printemps 2026",
  "startDate": "2026-04-04",
  "firstSubmissionDeadline": "2026-04-08",
  "firstDefenseDate": "2026-04-18",
  "secondSubmissionDeadline": "2026-04-22",
  "secondDefenseDate": "2026-05-02",
  "isDoubleCycle": false
}
```

### `POST /cycles/import` *(admin)*
Importer plusieurs cycles en lot (CSV ou JSON).

### `POST /cycles/generate` *(admin)*
Générer automatiquement des cycles à partir d'une date de départ et d'un nombre de cycles.

### `PUT /cycles/:id` *(admin)*
Modifier un cycle existant.

### `DELETE /cycles/:id` *(admin)*
Supprimer un cycle.
