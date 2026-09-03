# Agent d'impression 3D — script embarqué par imprimante

Complète [`2026-09-02-integration-imprimantes-3d-design.md`](./2026-09-02-integration-imprimantes-3d-design.md), qui spécifie le backend/frontend Hub (déjà mergés sur `master`) et pose déjà l'architecture réseau de l'agent. Cette spec détaille uniquement l'agent lui-même : son fonctionnement interne, sa configuration, sa gestion d'erreurs et son déploiement.

## Contexte et objectif

Le spec d'intégration a tranché : un agent tourne **sur chaque imprimante** (Kobra 3 / Kobra 3 Max), dans l'environnement Linux embarqué fourni par le firmware [Rinkhals](https://github.com/jbatonnet/Rinkhals) (accès SSH root, Klipper + Moonraker, UI stock Anycubic conservée). Le réseau des imprimantes n'a **aucune route garantie** vers le réseau du Hub — l'agent doit donc **toujours initier** la connexion vers le Hub (pull uniquement), jamais l'inverse.

Décidé lors du brainstorming précédent : l'agent est écrit en **Python**, déclenché par **cron toutes les minutes** — pas de démon long-running, pour rester léger sur un environnement embarqué à ressources limitées.

Objectif de cette spec : définir précisément ce que fait l'agent à chaque tick, comment il gère les erreurs (réseau, imprimante, Moonraker), comment il persiste son état entre deux exécutions, et comment il s'installe sur chaque machine.

## Hors périmètre

- Flashage de Rinkhals sur les imprimantes (prérequis, hors code applicatif).
- Toute modification du backend Hub — l'API `/api/print/agent/*` existante (déjà mergée) est utilisée telle quelle, sans changement.
- Contrôle temps réel avancé (webcam, pause/annulation à distance) — cf. hors périmètre du spec d'intégration.
- Installation via l'écosystème `Rinkhals.apps` — non validé pour cette version (cf. Backlog du spec d'intégration), l'agent est déployé comme un cron classique sur le filesystem persistant fourni par l'accès SSH root.

## Architecture générale

Un script Python unique par imprimante, invoqué par cron toutes les minutes. Une exécution = un tick = un aller-retour complet :

```
cron (1x/min)
  └─ agent/main.py
       ├─ hub_client   → GET/POST https://<hub>/api/print/agent/*   (auth: x-printer-id / x-api-key)
       └─ moonraker_client → HTTP http://localhost:7125/...          (API Moonraker locale)
```

Contrairement à la première ébauche discutée en session (agent central multi-imprimantes), **chaque installation ne connaît qu'une seule imprimante** — la sienne. Pas de liste de printers en config, pas de boucle sur plusieurs machines.

## Composants

Nouveau répertoire `printer-agent/` à la racine du repo (même niveau que `client/` et `server/`) :

- `printer-agent/agent/hub_client.py` — wrapper autour de l'API Hub (`GET next-job`, `GET jobs/:id/file`, `POST jobs/:id/status`), header `x-printer-id`/`x-api-key` injectés depuis la config
- `printer-agent/agent/moonraker_client.py` — wrapper autour de l'API Moonraker locale (`POST /server/files/upload`, `POST /printer/print/start`, `GET /printer/objects/query?print_stats`)
- `printer-agent/agent/state.py` — lecture/écriture atomique du fichier d'état local
- `printer-agent/agent/main.py` — orchestration d'un tick
- `printer-agent/config.example.yaml` — modèle de config (le fichier réel `config.yaml` n'est pas commité, `.gitignore`)
- `printer-agent/requirements.txt` — `requests`, `PyYAML`
- `printer-agent/tests/` — suite `pytest`

## Configuration & état local

`config.yaml` (déployé manuellement sur chaque imprimante lors du provisioning, non commité) :

```yaml
hub:
  base_url: https://<hub-domain>/api/print/agent
printer:
  id: "<mongo id de ce Printer>"
  api_key: "<clé api générée pour cette imprimante>"
moonraker:
  base_url: http://localhost:7125
```

`state.json` (même répertoire, écrit de façon atomique — fichier temporaire + `os.replace` — pour ne jamais laisser un état corrompu après une coupure d'alimentation en plein milieu de l'écriture) :

```json
{
  "job_id": null,
  "consecutive_moonraker_failures": 0
}
```

`job_id` est non-null uniquement pendant qu'un job est en cours de suivi (entre le `POST status: printing` et le `completed`/`failed`).

Un verrou fichier (`printer-agent/agent.lock`, via `flock`) empêche deux exécutions du script de se chevaucher si un tick dépasse exceptionnellement une minute (ex: upload lent). Si le verrou est déjà pris, le process sort immédiatement en loggant `INFO: tick précédent encore en cours, on saute celui-ci`.

## Workflow détaillé

### Cas nominal

1. **Nouveau job détecté** — si `state.json.job_id` est `null` : appel `GET next-job`.
   - Rien retourné → rien à faire ce tick, sortie.
   - Un job retourné (le Hub l'a atomiquement fait passer `queued` → `sent`) → téléchargement du gcode (`GET jobs/:id/file`), upload vers Moonraker (`POST /server/files/upload`), démarrage (`POST /printer/print/start?filename=...`), puis `POST jobs/:id/status {status: 'printing'}`. Écriture de `job_id` dans `state.json`, `consecutive_moonraker_failures` remis à 0.
2. **Suivi d'un job en cours** — si `state.json.job_id` n'est pas `null` : interroger `GET /printer/objects/query?print_stats` sur Moonraker local.
   - `state == 'printing'` ou `'paused'` → rien à faire, on attend le prochain tick.
   - `state == 'complete'` → `POST jobs/:id/status {status: 'completed'}`, `job_id` remis à `null` dans `state.json`.
   - `state == 'error'` ou `'cancelled'` → `POST jobs/:id/status {status: 'failed', errorMessage: <détail Moonraker>}`, `job_id` remis à `null`.

### Gestion des erreurs

Deux catégories, traitées différemment :

- **Échec pendant le dispatch** (téléchargement du gcode, upload Moonraker, ou démarrage d'impression échoue juste après un `next-job` réussi) → le job est déjà passé à `sent` côté Hub et n'a aucune re-tentative automatique prévue par l'API ; l'agent notifie donc **immédiatement** `POST status: 'failed'` avec le détail de l'erreur, plutôt que de laisser le job bloqué indéfiniment. Cohérent avec le comportement existant : un échec fait passer l'imprimante en `awaiting_clearance`, une inspection physique est de toute façon nécessaire.
- **Échec pendant le suivi d'un job en cours** (Moonraker local injoignable lors d'un poll de `print_stats` — service Klipper/Moonraker planté ou en cours de redémarrage) → transitoire par défaut : incrémente `consecutive_moonraker_failures` dans `state.json`, ne fait rien d'autre, réessaie au tick suivant. Escaladé en `POST status: 'failed'` (avec message explicite `"Moonraker injoignable après 5 tentatives"`) seulement après **5 échecs consécutifs** (~5 minutes), pour ne jamais déclarer un échec sur un simple redémarrage de service.
- **Hub injoignable** (`next-job` ou `status` en échec réseau/HTTP) → log, on passe simplement au tick suivant. Rien n'est perdu côté état : le Hub reste la source de vérité pour les jobs en attente, et `state.json` local ne change pas tant que la confirmation n'a pas été reçue.

## Logging

Fichier de log local avec rotation (`logging.handlers.RotatingFileHandler`) — tailles réduites vu le stockage flash limité de l'environnement embarqué Rinkhals (2 fichiers de 500 Ko max, contre un serveur classique où on serait plus généreux) :

- `INFO` : début/fin de tick, job détecté, dispatch réussi, statut transmis au Hub, transition d'état Moonraker détectée
- `WARNING` : échec transitoire Moonraker, avec compteur (`échec 3/5`) ; tick sauté car verrou déjà pris
- `ERROR` : passage en `failed` (dispatch cassé, seuil de 5 échecs atteint, ou erreur explicite Moonraker), avec le détail complet (code HTTP, message Moonraker, stacktrace le cas échéant)
- Chaque appel HTTP (Hub et Moonraker) logue méthode, URL, code retour, durée

Objectif explicite : pouvoir diagnostiquer rapidement un problème sur une imprimante physique sans devoir reproduire — le log doit suffire à comprendre ce qui s'est passé.

## Correctif frontend associé

`client/src/pages/print/index.js`, section "Mes impressions" : afficher `job.errorMessage` sous le badge de statut quand `job.status === 'failed'`, pour que la personne whitelistée ayant lancé l'impression (pas seulement un admin) voie directement la raison de l'échec — pas seulement un badge "Échouée" opaque.

## Tests

`pytest` avec `requests-mock` (ou `responses`), aucune dépendance à du matériel réel :

- `hub_client` : dispatch réussi, 401, 404, timeout
- `moonraker_client` : upload réussi, échec upload, lecture `print_stats` (idle/printing/complete/error)
- `main` (orchestration) : les 3 branches par tick (nouveau job → dispatch, job en cours → suivi, rien à faire) ; compteur d'échecs Moonraker 1→5 → transition `failed` ; verrou déjà pris → sortie propre sans erreur ; corruption/absence de `state.json` → réinitialisation propre plutôt que crash
- Frontend : test existant du composant "Mes impressions" étendu pour couvrir l'affichage de `errorMessage`

Une checklist de validation manuelle sur une imprimante réelle (hors suite automatisée) sera nécessaire avant mise en production, mais n'est pas dans le périmètre du code.

## Dépendances / prérequis avant implémentation

- Rinkhals flashé sur les 3 imprimantes, accès SSH root confirmé, Moonraker répondant sur `localhost:7125` (déjà listé dans le spec d'intégration).
- Confirmer que `python3` et `cron` (ou équivalent busybox) sont bien disponibles dans l'environnement Rinkhals — supposé (Klipper lui-même est en Python) mais pas vérifié à ce stade.
- `Printer._id` et clé API générés côté Hub pour chacune des 3 imprimantes avant de pouvoir renseigner `config.yaml`.
- Déploiement initial manuel (scp du répertoire `printer-agent/` + `config.yaml` + entrée crontab) sur chacune des 3 machines — pas d'automatisation de déploiement prévue pour cette version (3 machines seulement).

## Backlog (hors périmètre de cette version)

- Installation via l'écosystème `Rinkhals.apps` plutôt qu'un crontab brut, si sa faisabilité est validée (cf. backlog du spec d'intégration sur l'affichage à l'écran).
- Script/outil de déploiement automatisé si le nombre d'imprimantes augmente significativement au-delà de 3.
