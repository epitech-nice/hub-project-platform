# API — Impression 3D

Base URL : `http://localhost:5000/api/print`

Toutes les routes admin/étudiant nécessitent `Authorization: Bearer <JWT>`. Les routes `/agent/*`
sont appelées uniquement par `printer-agent` (Python, tourne sur chaque imprimante) et utilisent
une authentification séparée (voir section Agent).

---

## Gestion des erreurs globales

Pas d'express-validator sur ces routes. Les erreurs (via `ErrorResponse` + `errorHandler.js`)
retournent le format suivant :

```json
{
  "success": false,
  "error": "Message d'erreur"
}
```

---

## Imprimantes (admin)

Base : `/api/print/printers`

| Route | Méthode | Auth | Description |
|-------|---------|------|-------------|
| `/` | GET | Authentifié | Liste toutes les imprimantes (`apiKeyHash` exclu de la réponse) |
| `/` | POST | Admin | Créer une imprimante |
| `/:id/regenerate-key` | POST | Admin | Régénérer la clé API d'une imprimante |
| `/:id/disabled` | PATCH | Admin | Activer / désactiver une imprimante |
| `/:id/qr` | GET | Admin | Générer le QR code de libération de plateau (PNG) |
| `/:id/confirm-clearance` | POST | Authentifié | Confirmer la libération du plateau (scan QR) |
| `/:id/confirm-clearance/override` | POST | Admin | Forcer la confirmation sans scan QR |

### `POST /` — Créer une imprimante

**Body** :
```json
{ "name": "Kobra 3 #1", "model": "kobra3" }
```

`model` : `"kobra3"` | `"kobra3max"`.

**Réponse (201)** — la clé API en clair n'est renvoyée qu'à la création, jamais stockée :
```json
{
  "success": true,
  "data": {
    "printer": { "_id": "...", "name": "Kobra 3 #1", "model": "kobra3", "status": "idle", "..." : "..." },
    "apiKey": "a1b2c3...(clé brute, à copier dans la config de l'agent)"
  }
}
```

### `POST /:id/regenerate-key`

Invalide l'ancienne clé et en génère une nouvelle (même principe : seule la réponse contient la clé brute).

**Réponse (200)** :
```json
{ "success": true, "data": { "apiKey": "nouvelle-cle-brute" } }
```

### `PATCH /:id/disabled`

**Body** :
```json
{ "disabled": true, "note": "Maintenance buse" }
```

`disabled` (booléen) et `note` sont requis. Passe le statut à `disabled` (ou `idle` si `disabled: false`), vide `currentJob`, et ajoute une entrée dans `statusHistory` (`source: "admin_action"`).

### `GET /:id/qr`

Retourne directement une image `image/png` (pas de JSON) encodant l'URL
`{FRONTEND_URL}/print/printers/:id/confirm-clearance`. Échoue en 500 si `FRONTEND_URL` n'est pas configuré côté serveur.

### `POST /:id/confirm-clearance` et `/:id/confirm-clearance/override`

Voir la section [Clearance (QR code)](#clearance-qr-code) plus bas.

---

## Whitelist

Base : `/api/print/whitelist`

| Route | Méthode | Auth | Description |
|-------|---------|------|-------------|
| `/me` | GET | Authentifié | Statut d'autorisation de l'utilisateur connecté |
| `/` | GET | Admin | Liste complète de la whitelist |
| `/` | POST | Admin | Autoriser ou révoquer un email |

### `GET /me`

**Réponse (200)** :
```json
{
  "success": true,
  "data": { "authorized": true, "hasPendingRequest": false }
}
```

`authorized` vaut `null` si l'email n'a jamais eu d'entrée en base (ni autorisé, ni blacklisté explicitement).

### `POST /`

**Body** :
```json
{ "email": "etudiant@epitech.eu", "authorized": true, "note": "Whitelisté pour le projet X" }
```

`email` et `authorized` (booléen) sont requis. `note` est optionnelle.

**Effets** :
- Crée l'entrée `PrintAuthorization` si elle n'existe pas, sinon la met à jour
- Ajoute une entrée dans `history` (`authorized`, auteur, date, note)
- Résout implicitement (`status: "resolved"`) toute demande d'accès `pending` de cet email — autoriser **ou** blacklister répond à la demande

---

## Demandes d'accès (étudiant non whitelisté)

Base : `/api/print/access-requests`

| Route | Méthode | Auth | Description |
|-------|---------|------|-------------|
| `/` | POST | Authentifié | Créer une demande d'accès |
| `/` | GET | Admin | Liste des demandes en attente |

### `POST /`

Idempotent : si une demande `pending` existe déjà pour cet email, elle est renvoyée telle quelle plutôt que d'en recréer une (statut 200 au lieu de 201).

**Réponse (201)** :
```json
{
  "success": true,
  "data": {
    "student": { "userId": "...", "name": "...", "email": "etudiant@epitech.eu" },
    "status": "pending",
    "requestedAt": "..."
  }
}
```

Envoie un email de notification à tous les admins (`emailService.sendPrintAccessRequestEmail`) — non bloquant, une erreur d'envoi n'empêche pas la création de la demande.

### `GET /`

Retourne uniquement les demandes `status: "pending"`, triées par `requestedAt` croissant.

---

## Jobs d'impression (étudiant)

Base : `/api/print/jobs`

| Route | Méthode | Auth | Description |
|-------|---------|------|-------------|
| `/` | POST | Authentifié | Soumettre un job d'impression (`multipart/form-data`) |
| `/me` | GET | Authentifié | Mes jobs |
| `/` | GET | Admin | Tous les jobs (filtrable) |
| `/:id` | GET | Admin | Détails d'un job |

### `POST /` — Soumettre un job

**Body** : `multipart/form-data`
- `printerId` : ObjectId de l'imprimante ciblée
- `file` : fichier `.gcode` (extension vérifiée, 200 MB max)

**Conditions, dans l'ordre** :
1. Fichier `.gcode` présent (sinon 400)
2. Imprimante trouvée (sinon 404)
3. L'email de l'étudiant doit avoir une entrée `PrintAuthorization` avec `authorized: true` (sinon rejet, voir ci-dessous)
4. L'imprimante doit être `idle` (sinon rejet)

**Rejets** : si une condition 3-4 échoue, le job est quand même créé en base avec `status: "rejected"` (pour traçabilité) et le fichier uploadé est supprimé. Codes et raisons (`rejectionReason`) :

| `rejectionReason` | Code HTTP | Message |
|---|---|---|
| `not_authorized` | 403 | Vous n'êtes pas autorisé à soumettre une impression |
| `printer_busy` | 409 | Cette imprimante est occupée |
| `printer_offline` | 409 | Cette imprimante est injoignable |
| `printer_error` | 409 | Cette imprimante signale une erreur |
| `printer_disabled` | 409 | Cette imprimante est désactivée |

**Verrouillage atomique** : après création du job en `queued`, un `findOneAndUpdate` conditionné sur `status: 'idle'` réserve l'imprimante (`status: 'printing'`, `currentJob`). Si ce verrou échoue (deux soumissions concurrentes), le job déjà créé repasse en `rejected` / `printer_busy` plutôt que de rester `queued` sans imprimante réservée.

**Réponse (201)** si acceptée : `{ "success": true, "data": <PrintJob> }`, avec `status: "queued"`.

### `GET /me`

Jobs de l'étudiant connecté, triés par `submittedAt` décroissant.

### `GET /` *(admin)*

**Query params** : `status` (optionnel), `printerId` (optionnel).

### `GET /:id` *(admin)*

Détails complets d'un job (404 si non trouvé).

---

## Agent (pull-only, appelé par printer-agent tournant sur chaque imprimante)

Base : `/api/print/agent`

Authentification par **clé API imprimante**, pas de JWT : headers `X-Printer-Id` et `X-Api-Key`.
La clé est hashée (SHA-256) et comparée à `apiKeyHash` en base ; échec → 401.

| Route | Méthode | Auth | Description |
|-------|---------|------|-------------|
| `/next-job` | GET | Imprimante | Récupérer le prochain job à imprimer |
| `/jobs/:id/file` | GET | Imprimante | Télécharger le fichier `.gcode` d'un job |
| `/jobs/:id/status` | POST | Imprimante | Rapporter un changement de statut du job |
| `/heartbeat` | GET | Imprimante | Signal de vie |

Voir `printer-agent/README.md` et `docs/printer-onboarding.md` pour le déploiement réel de l'agent (flash Rinkhals, configuration, boucle de polling) — non dupliqué ici.

### `GET /next-job`

Si l'imprimante n'a pas de `currentJob`, renvoie `{ "success": true, "data": null }`.

Sinon, tente de passer le job `currentJob` de `queued` à `sent` de façon atomique (`findOneAndUpdate` conditionné sur `status: 'queued'`) — si deux polls se chevauchent, un seul récupère le job.

**Réponse (200)**, job trouvé :
```json
{
  "success": true,
  "data": {
    "jobId": "...",
    "fileName": "piece.gcode",
    "downloadUrl": "/api/print/agent/jobs/<id>/file"
  }
}
```

### `GET /jobs/:id/file`

Télécharge le fichier (`res.download`, `Content-Type: text/plain`). 404 si le job n'existe pas, 403 si le job n'appartient pas à l'imprimante authentifiée.

### `POST /jobs/:id/status`

**Body** :
```json
{ "status": "printing", "errorMessage": null }
```

`status` : `"printing"` | `"completed"` | `"failed"` (`errorMessage` optionnel, utilisé si `"failed"`).

**Conditions** : le job doit appartenir à l'imprimante authentifiée (403 sinon), doit être le `currentJob` courant de l'imprimante (409 sinon — "n'est plus le job courant"), et ne doit pas déjà être dans un état terminal `completed`/`failed` (409 sinon).

**Effets** :
- `printing` → `job.startedAt` renseigné
- `completed` / `failed` → `job.completedAt` renseigné (+ `errorMessage` si `failed`), et l'imprimante passe en `awaiting_clearance` (entrée `statusHistory`, `source: "agent_report"`)

### `GET /heartbeat`

Renvoie `204 No Content`. `authenticatePrinter` met à jour `lastSeenAt` sur chaque appel authentifié (donc sur toute route `/agent/*`, pas seulement `/heartbeat`). Si l'imprimante était `offline`, la reconnexion la fait automatiquement repasser à son `lastKnownStatus` (ou `awaiting_clearance` si le job en cours a échoué pendant la coupure).

---

## Modèle de statut d'une imprimante

Statuts (`Printer.status`) : `idle` (état normal / disponible), `printing`, `awaiting_clearance`, `offline`, `error`, `disabled`.

Chaque changement de statut ajoute une entrée dans `statusHistory[]` (`status`, `source`, `detail`, auteur éventuel, `date`). `source` (`PRINTER_STATUS_SOURCES`) vaut `agent_report`, `admin_action` ou `heartbeat_timeout`.

**Détection de coupure** : `server/src/utils/printerScheduler.js` tourne toutes les 30s (`checkStalePrinters`) et bascule en `offline` toute imprimante non `offline`/`disabled` dont `lastSeenAt` date de plus de 240s (~4x le tick de polling de l'agent, marge incluant le heartbeat pendant une impression en cours). Le statut précédent est conservé dans `lastKnownStatus`. Si l'imprimante était `printing`, son job courant est basculé `failed` automatiquement ("Perte de contact avec l'imprimante").

**Limite connue — architecture 100% pull** : le Hub ne peut jamais savoir *pourquoi* une imprimante silencieuse (`offline`) l'est devenue — coupure réseau, coupure électrique, plantage du firmware/agent. Seuls `lastSeenAt` et le dernier statut connu (`lastKnownStatus`) sont observables ; aucun mécanisme ne permet de distinguer ces causes côté serveur.

---

## Clearance (QR code)

Une imprimante qui termine un job (`completed` ou `failed`) passe en `awaiting_clearance` : le plateau doit être physiquement libéré avant de pouvoir accepter un nouveau job (`submitJob` refuse toute soumission tant que le statut n'est pas `idle`).

Double validation avant de pouvoir relancer une impression :

1. **Fin de job côté agent** : `POST /agent/jobs/:id/status` avec `status: "completed"` ou `"failed"` fait passer l'imprimante en `awaiting_clearance`.
2. **Confirmation physique** : un QR code (`GET /printers/:id/qr`, affiché à côté de l'imprimante) pointe vers `{FRONTEND_URL}/print/printers/:id/confirm-clearance`. Le scanner authentifié appelle `POST /printers/:id/confirm-clearance`, qui vérifie que l'imprimante est bien `awaiting_clearance` (400 sinon), la repasse `idle`, vide `currentJob`, et logue l'entrée dans `clearanceHistory` (`method: "qr"`).

Un admin peut court-circuiter l'étape 2 via `POST /printers/:id/confirm-clearance/override` (mêmes effets, `method: "admin_override"` dans `clearanceHistory`) — utile si le QR est physiquement inaccessible ou l'imprimante déplacée.
