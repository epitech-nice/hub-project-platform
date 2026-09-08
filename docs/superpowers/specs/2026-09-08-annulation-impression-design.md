# Annulation d'une impression en cours — Design

## Contexte

Le 2026-09-08, une impression de 6h a démarré sur le premier Kobra 3 déployé alors que l'agent avait rapporté un échec d'upload (timeout côté agent, l'upload avait en fait réussi côté Moonraker — corrigé séparément, voir `printer-agent/agent/moonraker_client.py`). Pendant cet incident, il s'est avéré qu'il n'existe aucun moyen d'annuler une impression en cours depuis le site du Hub, et que l'écran tactile de l'imprimante n'affiche rien sur l'impression en cours (l'app officielle Anycubic — utilisée normalement en dehors du Hub — montre bien ces informations, mais l'écran de l'imprimante lui-même ne les expose pas une fois le port USB neutralisé par le dispositif du Hub). Sans accès physique ni annulation à distance, une impression indésirable ne peut être arrêtée qu'en coupant l'alimentation de la machine.

Ce document couvre uniquement l'annulation. La sélection de bobine (1 à 4, système ACE multi-matériaux) est un sujet distinct, brainstormé séparément.

## Objectif

Permettre à l'étudiant propriétaire d'un job ou à un admin d'annuler une impression `queued`, `sent` ou `printing`, avec libération de l'imprimante cohérente avec le reste du système (vérification physique du plateau requise si une impression a réellement démarré, libération immédiate sinon).

## Architecture

Aucun canal de communication direct vers l'imprimante n'est introduit — l'agent reste strictement pull-only (contrainte du réseau "national" séparé, voir la spec d'intégration du 2026-09-02). Une annulation est un drapeau que l'agent découvre à son prochain tick (~60s max), au même titre que la découverte d'un nouveau job.

```
Étudiant/Admin --POST /jobs/:id/cancel--> Hub
                                            |
                    queued? -----------> annulé immédiatement, printer -> idle
                                            |
                    sent/printing? ----> cancelRequestedAt posé, réponse 202
                                            |
                                    (jusqu'à 60s plus tard)
                                            |
Agent (tick) --GET /agent/heartbeat--> Hub renvoie cancelRequested: true
     |
     v
MoonrakerClient.cancel_print() --POST /printer/print/cancel--> Moonraker
     |
     v
Agent --POST /agent/jobs/:id/status {status: cancelled}--> Hub
     |
     v
Printer -> awaiting_clearance (comme completed/failed) -> confirmation QR requise
```

## Modèle de données

### `PrintJob`

- `status` : ajout de `cancelled` à l'enum existant (`PRINT_JOB_STATUSES` dans `server/src/utils/constants.js`) : `rejected | queued | sent | printing | completed | failed | cancelled`
- `cancelRequestedAt` (Date, optionnel) : posé au moment de la demande d'annulation d'un job `sent`/`printing`. Distinct du statut lui-même — évite d'introduire un statut intermédiaire (`cancelling`) qui ne durerait qu'un tick et complexifierait toutes les vues (dashboard, stats) pour un état transitoire. `null`/absent tant qu'aucune annulation n'a été demandée ; reste posé une fois le job résolu en `cancelled`, comme enregistrement permanent de la date de demande (utile pour l'audit admin). Rien ne dépend de son effacement : c'est `job.status`, ainsi que le contrôle de statut terminal du heartbeat (`GET /agent/heartbeat`) et le filtre des statuts annulables côté frontend, qui déterminent indépendamment si une annulation est encore en cours.
- `cancelledBy` ({ email, role }, optionnel) : qui a demandé l'annulation, pour le journal admin. Posé en même temps que `cancelRequestedAt` (cas `sent`/`printing`) ou directement au moment de l'annulation synchrone (cas `queued`).

Pas de nouveau champ sur `Printer` — le passage à `awaiting_clearance` réutilise le mécanisme existant (`statusHistory`, source `agent_report`).

## Endpoint backend

`POST /api/print/jobs/:id/cancel`

- Auth : `authenticateToken`. Le contrôleur vérifie ensuite que le requérant est admin **ou** que son email correspond à `job.student.email` — sinon `403`. Un étudiant ne peut jamais annuler le job d'un autre étudiant.
- `job.status === 'queued'` : annulation **synchrone**.
  - `job.status = 'cancelled'`, `cancelledBy` posé, entrée `history` ajoutée
  - `Printer` correspondant repasse directement à `idle` (`currentJob: null`) — **pas** de passage par `awaiting_clearance` : rien n'a été physiquement imprimé, la vérification de plateau n'a pas de sens ici
  - Symétrique à la logique déjà existante pour un rejet à la soumission (`jobController.js`, section `REJECTED`)
  - Réponse `200`
- `job.status` dans `['sent', 'printing']` : annulation **asynchrone**.
  - Si `cancelRequestedAt` est déjà posé (double clic, requête dupliquée) : no-op, renvoie `202` à nouveau sans rien modifier de plus
  - Sinon : pose `cancelRequestedAt` + `cancelledBy`, entrée `history` ("Annulation demandée"). Le `status` du job ne change **pas** encore — l'agent doit encore confirmer que l'impression physique s'est bien arrêtée
  - Réponse `202 Accepted` (annulation acceptée mais pas encore effective)
- `job.status` déjà terminal (`completed`, `failed`, `cancelled`, `rejected`) : `400`, rien à annuler.

### `GET /api/print/agent/heartbeat`

Réponse existante étendue avec `cancelRequested: boolean` — `true` si le job actuellement assigné à cette imprimante (`Printer.currentJob`) a un `cancelRequestedAt` posé et n'est pas encore dans un statut terminal.

### `POST /api/print/agent/jobs/:id/status`

- `VALID_STATUS_UPDATES` étendu avec `'cancelled'`
- Le bypass d'idempotence (actuellement `if (['completed', 'failed'].includes(job.status)) return`) étendu pour inclure `'cancelled'`
- Quand `status === 'cancelled'` est reçu : même traitement que `completed`/`failed` pour le passage de l'imprimante en `awaiting_clearance` (`agentController.js`, la logique existante par statut terminal s'applique telle quelle)

## Côté agent (`printer-agent/`)

- `run_tick` (`agent/main.py`) vérifie `cancelRequested` en tout début de tick, **avant** la branche dispatch/monitor existante — via le `job_id` déjà suivi localement dans `state.json`, pas besoin d'endpoint séparé pour savoir "quel job" (l'agent ne suit jamais qu'un seul job à la fois)
- Si `cancelRequested` est vrai et qu'un job est en cours de suivi (`_try_monitor`) :
  1. Vérifier d'abord l'état réel via `moonraker.get_print_stats()` (logique déjà existante) — si l'impression s'est terminée ou a échoué **naturellement** au même moment, cet état prime : ne jamais écraser un `completed`/`failed` légitime en `cancelled` après coup
  2. Sinon, appeler la nouvelle méthode `MoonrakerClient.cancel_print()` → `POST /printer/print/cancel`
  3. Rapporter `POST /agent/jobs/:id/status {status: "cancelled"}` au Hub
- Si l'appel à Moonraker échoue (timeout, erreur réseau) : pas de nouveau mécanisme — retry au tick suivant, `cancelRequested` restera `true` côté Hub tant que l'agent n'a pas confirmé, donc l'agent retentera automatiquement
- Nouvelle méthode `MoonrakerClient.cancel_print()` : suit le même patron que `get_print_stats()`/`upload_and_start_print()` (timeout `self.timeout`, lève `MoonrakerClientError` sur erreur HTTP/réseau)

## Frontend

- **`client/src/pages/print/index.js`** ("Mes impressions") : bouton "Annuler" sur les jobs de l'utilisateur en `queued`/`sent`/`printing`. Clic → modale de confirmation (action irréversible, plateau à vérifier physiquement pour les jobs déjà imprimés) → `POST /jobs/:id/cancel`. Si `cancelRequestedAt` posé mais statut pas encore `cancelled` : affiche "Annulation en cours..." à la place du bouton (pas de nouveau bouton "annuler l'annulation").
- **`client/src/pages/admin/print/index.js`** (journal des impressions) : même bouton/modale, sur n'importe quel job dans ces statuts, pas seulement ceux de l'admin.
- Nouveau badge "Annulé" (couleur neutre, distinct du rouge "Échec" et du vert "Terminé").

## Hors périmètre (explicitement écarté)

- Sélection de bobine (1-4) : sujet séparé, pas traité ici.
- Affichage de `job.errorMessage` sur les pages (gap déjà connu, documenté séparément dans la spec d'intégration du 2026-09-02) : pas ajouté par cette feature, même si l'UI d'annulation touche les mêmes pages. Pourrait être fait dans la même passe d'implémentation si l'utilisateur le demande, mais n'est pas un prérequis de l'annulation.
- Annulation plus rapide que ~60s (canal séparé, polling plus fréquent) : le délai du tick existant est jugé acceptable (décision utilisateur), pas de changement à `TICK_INTERVAL_SECONDS`.
- Pause/reprise d'impression (`/printer/print/pause`, `/printer/print/resume`, endpoints Moonraker existants mais non exposés ici) : non demandé, non traité.
