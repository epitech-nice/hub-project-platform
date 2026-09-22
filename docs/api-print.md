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
| `/:id/spool-slots/:gate/manual` | PUT | Whitelisté ou Admin | Déclarer manuellement le contenu d'une bobine (sans puce RFID) |

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

`disabled` (booléen) et `note` sont requis. Ajoute toujours une entrée dans `statusHistory` (`source: "admin_action"`) avec `note` en `detail`.

**Désactivation (`disabled: true`)** — le comportement dépend du job en cours (`currentJob`) au moment de l'appel :
- Job encore `queued` (jamais dispatché à l'agent) : annulé immédiatement (`status: "cancelled"`, même verrou atomique que `POST /jobs/:id/cancel`), `currentJob` vidé.
- Job `sent`/`printing` (impression physiquement en cours) : **`currentJob` n'est pas vidé.** Une annulation asynchrone est demandée (`cancelRequestedAt`, même mécanisme que `POST /jobs/:id/cancel` sur un job en cours) — l'agent la découvre à son prochain `GET /agent/heartbeat` (`cancelRequested: true`, qui ne fonctionne qu'à travers `Printer.currentJob`) et rapporte un statut final via `POST /agent/jobs/:id/status`. Vider `currentJob` immédiatement orphelinerait ce job pour de bon.
- Pas de job actif (jamais fixé, ou référence vers un job déjà terminal) : `currentJob` vidé, rien d'autre à faire.

Dans tous les cas, `Printer.status` passe à `disabled`.

**Réactivation (`disabled: false`)** — refusée avec **409** si `currentJob` pointe encore vers un job non-terminal (`queued`/`sent`/`printing` — c'est-à-dire une annulation encore en cours de confirmation par l'agent) : *"Une impression est encore en cours d'annulation sur cette imprimante, réessayez une fois le plateau libéré"*. Sinon, passe à `idle` et vide `currentJob`.

**Après résolution d'un job pendant que l'imprimante est `disabled`** : `POST /agent/jobs/:id/status` (rapport final de l'agent) accepte toujours le rapport, mais l'imprimante **reste `disabled`** plutôt que de passer par `awaiting_clearance` comme dans le cas normal — la libération du plateau se fait alors hors ligne, quand l'admin réactive l'imprimante après vérification physique.

**Job bloqué si l'agent ne répond plus** : si l'imprimante ne redonne jamais signe de vie après une désactivation en cours d'impression (éteinte pour de bon), `server/src/utils/printerScheduler.js` (staleness, ~4 min sans contact) résout quand même le job en `failed` pour ne pas bloquer indéfiniment la réactivation — sans jamais rebasculer le statut de l'imprimante hors de `disabled`.

### `GET /:id/qr`

Retourne directement une image `image/png` (pas de JSON) encodant l'URL
`{FRONTEND_URL}/print/printers/:id/confirm-clearance`. Échoue en 500 si `FRONTEND_URL` n'est pas configuré côté serveur.

### `POST /:id/confirm-clearance` et `/:id/confirm-clearance/override`

Voir la section [Clearance (QR code)](#clearance-qr-code) plus bas.

### `PUT /:id/spool-slots/:gate/manual` — Déclarer manuellement une bobine

Pour les bobines sans puce RFID (l'ACE/MMU ne peut alors pas détecter automatiquement leur matière/couleur) : permet à un utilisateur autorisé de renseigner ces informations à la main.

**Body** :
```json
{ "material": "PLA", "color": "212721" }
```

`material` et `color` sont requis (400 sinon). `material` est limité à 64 caractères (400 si dépassé). `color` doit correspondre à une couleur hexadécimale sur 6 chiffres, avec ou sans `#` (`/^#?[0-9a-fA-F]{6}$/`) — 400 sinon.

**Auth** : authentifié, et soit whitelisté (`PrintAuthorization.authorized: true`), soit admin (403 sinon) — même posture que la soumission d'un job, cohérente avec le fait que déclarer une bobine influence directement le prochain job imprimé sur cette imprimante.

**Conditions** : imprimante trouvée (404 sinon), gate existant dans `Printer.spoolSlots` pour cette imprimante (404 sinon — `"Gate inconnu pour cette imprimante"`). Pour une **déclaration initiale** (le slot n'est pas déjà `source: 'manual'`) : **409** si le dernier rapport de l'agent dit ce gate vide (`slot.empty === true`) — le capteur de présence physique de l'ACE est fiable indépendamment du RFID (seules matière/couleur nécessitent une puce), donc un étudiant whitelisté ne peut pas déclarer une bobine sur un gate que l'imprimante rapporte vide (empêche de faire échouer le job d'un autre étudiant en mentant sur l'état d'un gate). Cette vérification ne s'applique **pas** à la correction d'une déclaration manuelle déjà acceptée (aucun signal auto frais à comparer dans ce cas).

**Effets** : pose `material`, `color`, `empty: false`, `source: 'manual'`, `manualSetBy` (`{ email, name }` de l'auteur) et `manualSetAt` sur le slot ciblé. Capture aussi la valeur auto-rapportée courante du slot (`autoMaterialAtSet`/`autoColorAtSet`/`autoEmptyAtSet`) comme référence pour la détection de dérive (voir `docs/models.md`, `Printer.spoolSlots`) — **sauf** si le slot était déjà `source: 'manual'`, auquel cas cette référence d'origine est préservée (une correction successive d'une déclaration manuelle ne déplace pas le point de comparaison utilisé pour détecter une future vraie lecture RFID).

**Réponse (200)** : `{ "success": true, "data": <spoolSlot mis à jour> }`.

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
| `/analyze` | POST | Authentifié | Analyser un fichier `.gcode` avant confirmation (`multipart/form-data`) — flux avec sélection de bobine ACE |
| `/:pendingUploadId/confirm` | POST | Authentifié (propriétaire de l'analyse) | Confirmer la soumission d'une analyse (`POST /analyze`) |
| `/me` | GET | Authentifié | Mes jobs |
| `/` | GET | Admin | Tous les jobs (filtrable) |
| `/:id` | GET | Admin | Détails d'un job |
| `/:id/cancel` | POST | Authentifié (propriétaire ou admin) | Annuler un job `queued`/`sent`/`printing` |

**Flux de soumission en deux étapes** : `POST /analyze` puis `POST /:pendingUploadId/confirm` — c'est le seul flux de soumission, il permet de choisir/vérifier la bobine ACE chargée avant de lancer réellement l'impression. C'est celui utilisé par la page `/print` du frontend.

> L'ancien endpoint `POST /` (soumission en une étape, sans sélection de bobine) a été retiré — il n'avait plus aucun appelant côté frontend et laissait la sélection de bobine contournable via un appel API direct.

### `GET /me`

Jobs de l'étudiant connecté, triés par `submittedAt` décroissant.

### `POST /analyze` — Analyser un fichier avant soumission (sélection de bobine ACE)

**Body** : `multipart/form-data`
- `printerId` : ObjectId de l'imprimante ciblée
- `file` : fichier `.gcode` (extension vérifiée, 200 MB max) — stocké temporairement dans `storage/pending-print-jobs/`

**Conditions, dans l'ordre** : fichier présent (sinon 400), imprimante trouvée (sinon 404), whitelist `authorized: true` (sinon 403). Contrairement à `POST /`, aucun `PrintJob` de traçabilité n'est créé en cas de rejet à cette étape — seul le fichier temporaire est supprimé.

**Détection du mode** : le fichier est scanné à la recherche de commandes `Tx` isolées sur leur propre ligne (`server/src/utils/spoolAnalysis.js`) — au moins une commande `Tx` trouvée → `mode: "multi-material"`, aucune → `mode: "single"`. En mode `multi-material`, les métadonnées matière/couleur attendues par tool sont extraites des commentaires d'en-tête `filament_type`/`filament_colour` du slicer (OrcaSlicer/PrusaSlicer) quand ils sont présents ; sinon `material`/`color` valent `null` pour ce tool (non déterminable, pas comparé).

**Réponse (201)** :
```json
{
  "success": true,
  "data": {
    "pendingUploadId": "...",
    "mode": "single",
    "slots": [{ "gate": 0, "material": "PLA", "color": "212721FF", "empty": false }],
    "spoolSlotsUpdatedAt": "2026-09-09T12:00:00.000Z",
    "expectedTools": []
  }
}
```

`slots` et `spoolSlotsUpdatedAt` sont une copie de l'état courant de `Printer.spoolSlots`/`Printer.spoolSlotsUpdatedAt` (dernier rapport de l'agent via `POST /agent/spool-status`, voir plus bas). `spoolSlotsUpdatedAt: null` signifie qu'aucune donnée bobine n'a *jamais* été reçue pour cette imprimante — état distinct d'un tableau `slots` vide avec `spoolSlotsUpdatedAt` posé (l'agent a bien répondu, mais l'imprimante ne détecte aucun gate). La comparaison entre bobine chargée et matière/couleur attendue par tool (`expectedTools`) se fait désormais côté client, au moment où l'étudiant choisit interactivement un gate par tool — l'analyse ne calcule plus elle-même de liste d'écarts.

Le document `PendingPrintUpload` créé expire automatiquement après 15 minutes (TTL Mongo) si jamais confirmé ; le fichier temporaire correspondant est nettoyé séparément par un sweeper applicatif (`server/src/utils/pendingUploadCleanup.js`, toutes les 5 min) puisqu'une expiration TTL Mongo ne peut pas déclencher de code applicatif — voir `docs/models.md`.

### `POST /:pendingUploadId/confirm` — Confirmer la soumission

**Body** :
```json
{ "gateAssignments": [{ "tool": null, "gate": 0 }], "overrideNoSpoolData": false }
```

`gateAssignments` contient exactement une entrée par tool détecté à l'analyse (`PendingPrintUpload.expectedTools`, ou un fichier mono zéro-Tx) : `[{ "tool": null, "gate": 0 }]` pour un fichier mono, `[{ "tool": "T0", "gate": 2 }, { "tool": "T2", "gate": 1 }]` pour un fichier multi-outils avec deux tools détectés.

Conditions (indépendantes du `gcodeMode` de l'analyse — mono et multi-outils suivent désormais exactement la même logique) :
- `hasSpoolData = !!Printer.spoolSlotsUpdatedAt && Printer.spoolSlots.length > 0` : si `false` — soit aucune donnée bobine jamais reçue pour cette imprimante, soit l'agent a bien répondu mais l'imprimante ne détecte aucun gate (`spoolSlots: []`, ex: `num_gates: 0` côté Moonraker) — `overrideNoSpoolData: true` est requis pour soumettre quand même (`gateAssignments` ignoré dans ce cas) — sinon 400 (`"Données bobines indisponibles..."`). Ces deux cas sont traités de façon identique côté étudiant : sans gate détecté, il n'y a de toute façon rien à choisir dans l'interface.
- Si `hasSpoolData` est `true` : `gateAssignments` doit contenir une entrée pour **chaque** tool attendu (mono : une seule entrée `tool: null` ; multi-outils : une entrée par `expectedTools[].tool`) — aucune assignation partielle n'est acceptée, sinon 400 (`"Une bobine doit être assignée à chaque tool détecté"`). Chaque `gate` assigné doit être un entier 0-3 désignant un slot existant et non vide, sinon 400 (`"Sélection de bobine requise pour chaque tool"` ou `"Ce slot est vide, choisissez-en un autre"`)

**Conditions re-vérifiées à la confirmation** (l'analyse a pu dater) : le `PendingPrintUpload` doit encore exister (410 si expiré via TTL ou déjà confirmé — re-uploader), le requérant doit être l'auteur de l'analyse (403 sinon), la whitelist doit toujours autoriser l'email (403 sinon), l'imprimante doit toujours être `idle` (409 sinon). Un rejet sur whitelist/statut imprimante crée un `PrintJob` `rejected` de traçabilité (mêmes `rejectionReason`/messages que ci-dessous) ; un 410 (analyse expirée) ne crée rien.

**Effets en cas de succès** : le fichier est déplacé de `storage/pending-print-jobs/` vers `storage/print-jobs/`, un `PrintJob` est créé avec `gateAssignments`, `slotMismatches`, `slotSelectionOverridden` et `gcodeMode`, l'imprimante est verrouillée atomiquement (`findOneAndUpdate` conditionné sur `status: 'idle'` → `printing`, `currentJob` posé), et le `PendingPrintUpload` est supprimé. Si ce verrou échoue (deux confirmations concurrentes sur la même imprimante), le job déjà créé repasse en `rejected` / `printer_busy` plutôt que de rester `queued` sans imprimante réellement réservée.

`slotMismatches` (`server/src/utils/spoolAnalysis.js::computeConfirmedSlotMismatches`) est recalculé côté serveur à la confirmation, en comparant `PendingPrintUpload.expectedTools` à l'état réel des gates assignés — persisté même si l'étudiant a choisi de soumettre malgré l'avertissement affiché côté client (`computeGateMismatch`), pour qu'un admin puisse retrouver après coup qu'un mismatch avait été signalé à la soumission (badge "Bobine non conforme" sur `/admin/print`). Vide (`[]`) si aucune métadonnée slicer n'était disponible pour comparer, ou si la sélection a été outrepassée (`overrideNoSpoolData`).

**Réponse (201)** : `{ "success": true, "data": <PrintJob> }`.

### `GET /` *(admin)*

**Query params** : `status` (optionnel), `printerId` (optionnel).

### `GET /:id` *(admin)*

Détails complets d'un job (404 si non trouvé).

### `POST /:id/cancel`

**Auth** : le requérant doit être admin **ou** propriétaire du job (`job.student.email`), sinon 403.

**Comportement selon `job.status`** :

| `job.status` au moment de l'appel | Effet | Code HTTP |
|---|---|---|
| `queued` | Annulation **synchrone** : `status → cancelled`, `cancelledBy` posé, entrée `history`. L'imprimante repasse directement `idle` (`currentJob: null`, entrée `statusHistory`) — mais seulement si elle pointe encore réellement sur ce job (un admin a pu la désactiver entre-temps, auquel cas son statut n'est pas touché) | 200 |
| `sent` / `printing` | Annulation **asynchrone** : pose `cancelRequestedAt` + `cancelledBy`, entrée `history` ("Annulation demandée"), `status` inchangé. Si `cancelRequestedAt` est déjà posé (double appel), no-op, renvoie à nouveau 202 | 202 |
| déjà terminal (`completed`, `failed`, `cancelled`, `rejected`) | Rien à annuler | 400 |

**Verrouillage atomique (branche `queued`)** : l'annulation utilise un `findOneAndUpdate` conditionné sur `status: 'queued'`, symétrique au verrou posé à la confirmation (`POST /:pendingUploadId/confirm`). Si l'agent a déjà récupéré le job via `GET /agent/next-job` entre la lecture initiale et cette écriture (job passé `sent`), le verrou échoue et l'endpoint renvoie 409 plutôt que d'annuler un job que l'agent croit devoir imprimer.

**Effet côté agent (cas asynchrone)** : le prochain `GET /agent/heartbeat` de l'imprimante concernée renvoie `cancelRequested: true`, ce qui déclenche l'annulation physique via Moonraker (voir plus bas).

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
| `/spool-status` | POST | Imprimante | Rapporter l'état des bobines ACE/MMU (matière, couleur, vide) |

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
    "downloadUrl": "/api/print/agent/jobs/<id>/file",
    "gateAssignments": [{ "tool": null, "gate": 0 }]
  }
}
```

`gateAssignments` est une copie telle quelle de `PrintJob.gateAssignments`, posé à la confirmation (`POST /jobs/:pendingUploadId/confirm`) et jamais revalidé au dispatch : `[]` si la sélection a été outrepassée (`slotSelectionOverridden`, aucune donnée bobine disponible), une entrée `{ tool: null, gate }` pour un fichier mono (zéro `Tx`), une entrée par tool distinct détecté (`{ tool: "T0", gate }`, `{ tool: "T2", gate }`, ...) pour un fichier multi-outils.

`printer-agent` (voir `agent/main.py::_resolve_gate_assignments`) traduit ce tableau en l'un de ces mécanismes de dispatch :
- **Mono** (une entrée `tool: null`) : le gate est injecté en tête du fichier `.gcode` sous forme d'une commande `Tn` brute (`_inject_gate_selection`) — le même canal que celui utilisé nativement par un gcode multi-couleur pour changer de bobine.
- **Multi-outils** (au moins une entrée à `tool` non-null) : l'agent construit la table tool→gate complète (`_build_acm_mapping`) à partir de l'état courant des gates renvoyé par `moonraker.get_mmu_status()` — chaque gate assigné est validé comme existant (et non vide, avec matière/couleur déclarées) avant même le téléchargement du fichier.
- **Vide/absent** (`overrideNoSpoolData`, ou un vieux hub qui n'envoie pas encore ce champ) : rien n'est injecté dans le fichier `.gcode` et aucun `.acm` n'est écrit — mais `MMU_TTG_MAP` est quand même envoyé avec un mapping identité (voir plus bas), pour réinitialiser un `ttg_map` firmware potentiellement laissé non-identité par un job multi-outils précédent.

Le dispatch effectif se déroule ensuite dans cet ordre strict, chaque étape conditionnant la suivante (le fichier n'est jamais imprimé si une étape précédente a échoué) : téléchargement du `.gcode` depuis le hub → upload vers Moonraker (`print=false`) → pour un job multi-outils, upload du sidecar `<basename>.acm` (écrase celui auto-généré par Moonraker depuis les métadonnées slicer) → `MMU_TTG_MAP` (systématique, y compris en mono/override — voir plus bas) → `POST /printer/print/start`.

Depuis le 2026-09-17, `printer-agent` envoie systématiquement `MMU_TTG_MAP` juste avant `POST /printer/print/start`, en complément du `.acm` (voir spec `2026-09-17-ttg-map-mqtt-path-design.md`) : le chemin de dispatch MQTT (`kobra.py::mqtt_print_file`, le chemin normal en usage réel avec le mode LAN activé) construit son `print_data` à partir de rien et ne lit jamais le sidecar `.acm` sur disque — `mmu_ace.py::patch_print_data` y calcule le mapping tool→gate exclusivement depuis l'état firmware `ttg_map`. Les deux mécanismes sont donc nécessaires et non redondants : `.acm` couvre le chemin non-MQTT (dégradé/transitoire), `ttg_map`/`MMU_TTG_MAP` couvre le chemin MQTT. `MMU_TTG_MAP` est envoyé à chaque dispatch avec une table complète (un gate par tool, identité par défaut) — jamais seulement pour le cas multi-outils — car un `ttg_map` laissé non-identité par un job précédent ferait aussi résoudre le `Tn` du cas mono vers le mauvais gate physique.

### `GET /jobs/:id/file`

Télécharge le fichier (`res.download`, `Content-Type: text/plain`). 404 si le job n'existe pas, 403 si le job n'appartient pas à l'imprimante authentifiée.

### `POST /jobs/:id/status`

**Body** :
```json
{ "status": "printing", "errorMessage": null }
```

`status` : `"printing"` | `"completed"` | `"failed"` | `"cancelled"` (`errorMessage` optionnel, utilisé si `"failed"`).

**Conditions** : le job doit appartenir à l'imprimante authentifiée (403 sinon), doit être le `currentJob` courant de l'imprimante (409 sinon — "n'est plus le job courant"), et ne doit pas déjà être dans un état terminal `completed`/`failed`/`cancelled` (409 sinon).

**Effets** :
- `printing` → `job.startedAt` renseigné
- `completed` / `failed` / `cancelled` → `job.completedAt` renseigné (+ `errorMessage` si `failed`), et l'imprimante passe en `awaiting_clearance` (entrée `statusHistory`, `source: "agent_report"`) — un job `cancelled` rapporté par l'agent est traité exactement comme `completed`/`failed` pour ce passage (le plateau doit être vérifié physiquement, l'impression ayant réellement démarré)

### `GET /heartbeat`

**Réponse (200)** :
```json
{ "success": true, "cancelRequested": false }
```

`cancelRequested` vaut `true` si le job actuellement assigné à cette imprimante (`Printer.currentJob`) a un `cancelRequestedAt` posé et n'est pas encore dans un statut terminal (`completed`/`failed`/`cancelled`/`rejected`) — c'est le signal que l'agent doit annuler l'impression physique au prochain tick.

`authenticatePrinter` met à jour `lastSeenAt` sur chaque appel authentifié (donc sur toute route `/agent/*`, pas seulement `/heartbeat`). Si l'imprimante était `offline`, la reconnexion la fait automatiquement repasser à son `lastKnownStatus` (ou `awaiting_clearance` si le job en cours a échoué pendant la coupure).

### `POST /spool-status`

**Body** :
```json
{ "gates": [{ "gate": 0, "material": "PLA", "color": "212721FF", "empty": false }] }
```

`gates` (tableau, requis — 400 sinon). Chaque entrée est validée individuellement (`gate` entier 0-3, `material`/`color` chaînes bornées en longueur, `empty` booléen) ; une entrée invalide ou un numéro de gate en double est **ignorée et loguée côté serveur**, pas fatale au reste du rapport — un firmware qui se met à rapporter une forme inattendue ne doit pas geler `spoolSlotsUpdatedAt` en permanence. Les entrées valides fusionnent avec `Printer.spoolSlots` (un gate absent du rapport — glitch ponctuel, ou filtré comme invalide — est préservé tel quel, pas supprimé) et posent `Printer.spoolSlotsUpdatedAt` à la date courante — **sauf si aucune entrée n'était valide**, auquel cas `spoolSlotsUpdatedAt` n'est pas touché (rien n'a réellement été mis à jour). Un tableau **vide** en revanche (`num_gates: 0` côté agent, imprimante sans ACE/MMU détecté ou MMU sans gate configuré) est un rapport valide et pose bien `spoolSlotsUpdatedAt` (aucune entrée à valider, mais un rapport reçu) : `spoolSlotsUpdatedAt` posé + `spoolSlots: []` est donc un état valide, distinct de `spoolSlotsUpdatedAt: null` (jamais reçu) — voir `POST /jobs/:pendingUploadId/confirm` plus haut, qui distingue explicitement ces deux cas.

**Réponse (200)** : `{ "success": true }`.

Appelé par `printer-agent` à chaque tick (`agent/main.py::_report_spool_status`), en best-effort : un échec de lecture Moonraker (`MoonrakerClient.get_mmu_status`) ou d'appel au hub (`HubClient.report_spool_status`) est loggé et n'interrompt jamais le reste du tick (dispatch/monitoring du job en cours).

---

## Modèle de statut d'une imprimante

Statuts (`Printer.status`) : `idle` (état normal / disponible), `printing`, `awaiting_clearance`, `offline`, `error`, `disabled`.

Chaque changement de statut ajoute une entrée dans `statusHistory[]` (`status`, `source`, `detail`, auteur éventuel, `date`). `source` (`PRINTER_STATUS_SOURCES`) vaut `agent_report`, `admin_action` ou `heartbeat_timeout`.

**Détection de coupure** : `server/src/utils/printerScheduler.js` tourne toutes les 30s (`checkStalePrinters`) et bascule en `offline` toute imprimante non `offline`/`disabled` dont `lastSeenAt` date de plus de 240s (~4x le tick de polling de l'agent, marge incluant le heartbeat pendant une impression en cours). Le statut précédent est conservé dans `lastKnownStatus`. Si `Printer.currentJob` pointe vers un job encore `sent`/`printing`, il est basculé `failed` automatiquement ("Perte de contact avec l'imprimante").

Une imprimante `disabled` avec un `currentJob` encore actif (voir `PATCH /:id/disabled` — annulation asynchrone en cours) reste elle aussi surveillée pour ce seul job : si l'agent ne répond plus, le job est basculé `failed` de la même façon, **mais le statut de l'imprimante n'est jamais rebasculé `offline`** — sans ça, un job resté bloqué sur une imprimante désactivée éteinte pour de bon empêcherait indéfiniment la réactivation. Une imprimante `disabled` sans job actif n'est plus jamais re-sélectionnée par ce mécanisme.

**Limite connue — architecture 100% pull** : le Hub ne peut jamais savoir *pourquoi* une imprimante silencieuse (`offline`) l'est devenue — coupure réseau, coupure électrique, plantage du firmware/agent. Seuls `lastSeenAt` et le dernier statut connu (`lastKnownStatus`) sont observables ; aucun mécanisme ne permet de distinguer ces causes côté serveur.

---

## Clearance (QR code)

Une imprimante qui termine un job (`completed`, `failed` ou `cancelled` — une annulation rapportée par l'agent, l'impression ayant réellement démarré) passe en `awaiting_clearance` : le plateau doit être physiquement libéré avant de pouvoir accepter un nouveau job (`POST /jobs/:pendingUploadId/confirm` refuse toute soumission tant que le statut n'est pas `idle`).

Une annulation d'un job encore `queued` (jamais imprimé) ne passe **pas** par `awaiting_clearance` : l'imprimante repasse directement `idle` (voir `POST /jobs/:id/cancel` plus haut).

Double validation avant de pouvoir relancer une impression après un job réellement imprimé :

1. **Fin de job côté agent** : `POST /agent/jobs/:id/status` avec `status: "completed"`, `"failed"` ou `"cancelled"` fait passer l'imprimante en `awaiting_clearance` — **sauf si elle est `disabled`** (job résolu pendant une désactivation en cours d'impression, voir `PATCH /:id/disabled`), auquel cas elle reste `disabled` : la libération du plateau se fait alors hors ligne, quand l'admin réactive l'imprimante après vérification physique.
2. **Confirmation physique** : un QR code (`GET /printers/:id/qr`, affiché à côté de l'imprimante) pointe vers `{FRONTEND_URL}/print/printers/:id/confirm-clearance`. Le scanner authentifié appelle `POST /printers/:id/confirm-clearance`, qui vérifie que l'imprimante est bien `awaiting_clearance` (400 sinon), la repasse `idle`, vide `currentJob`, et logue l'entrée dans `clearanceHistory` (`method: "qr"`).

Un admin peut court-circuiter l'étape 2 via `POST /printers/:id/confirm-clearance/override` (mêmes effets, `method: "admin_override"` dans `clearanceHistory`) — utile si le QR est physiquement inaccessible ou l'imprimante déplacée.
