# Intégration imprimantes 3D Anycubic au Hub

## Contexte et objectif

Trois imprimantes Anycubic (deux Kobra 3, une Kobra 3 Max) sont utilisées par les étudiants. Les ports USB de ces machines vont être bloqués physiquement (hors périmètre de cette spec) pour forcer toute soumission de fichier à passer par le Hub. Objectifs de cette fonctionnalité :

- Permettre à un étudiant autorisé de soumettre un fichier d'impression depuis le Hub et de le voir se lancer automatiquement sur l'imprimante choisie.
- N'autoriser que les étudiants explicitement whitelistés (par email), refus par défaut.
- Empêcher qu'une nouvelle impression soit lancée tant que le plateau de la machine précédente n'a pas été physiquement vidé.
- Logger systématiquement : qui soumet quoi, sur quelle imprimante, refus et raisons, transitions d'état, qui valide la libération d'une imprimante.

Contrainte réseau : le serveur Hub est sur le réseau local de l'école, les imprimantes seront sur un réseau "national" séparé, sans route ni VPN garantis entre les deux.

## Hors périmètre

- Blocage physique des ports USB (matériel, géré séparément).
- Contrôle temps réel avancé (webcam, pause/annulation à distance, réglages fins d'impression) — non demandé pour cette version.
- Gestion de groupes/promos pour l'autorisation — whitelist nominative uniquement pour l'instant.
- Affichage d'un code de vérification rotatif sur l'écran de l'imprimante — **backlog**, voir section dédiée.

## Architecture générale

Trois composants :

1. **Hub backend** (Node/Express/Mongoose existant) — nouvelle API `/api/print/*`, avec deux surfaces d'authentification distinctes :
   - étudiants/admins : middleware `authenticateToken` / `isAdmin` existants ;
   - agents imprimante : clé API dédiée par imprimante (pas un compte utilisateur).
2. **Agent imprimante** : script tournant sur chaque Kobra 3, via l'accès SSH root fourni par le firmware [Rinkhals](https://github.com/jbatonnet/Rinkhals) (Klipper + Moonraker, modèles Kobra 3 et Kobra 3 Max explicitement supportés, garde l'UI stock Anycubic). L'agent interroge le Hub en polling (~15-30s) et communique avec l'API Moonraker locale (`localhost:7125`) pour lancer les impressions.
3. **Frontend Hub** : page étudiant (choix imprimante + upload, historique de ses jobs) et page admin (gestion whitelist, vue de tous les jobs/logs, état des 3 imprimantes).

Le flux réseau est **toujours initié par l'imprimante vers le Hub**, jamais l'inverse (polling sortant uniquement). Cela évite toute ouverture de port ou VPN entre les deux réseaux — même principe directionnel que l'app mobile Anycubic officielle, mais auto-hébergé (pas de dépendance à leur cloud propriétaire, dont l'API n'est pas publique et n'est accessible que via du reverse-engineering communautaire non officiel).

## Modèle de données

### `Printer`
| Champ | Type | Description |
|---|---|---|
| `name` | String | ex: "Kobra 3 - Atelier A" |
| `model` | String | `kobra3` \| `kobra3max` |
| `apiKeyHash` | String | clé API de l'agent, hashée |
| `status` | Enum | `idle` \| `printing` \| `awaiting_clearance` \| `offline` \| `error` \| `disabled` |
| `currentJob` | ObjectId (ref `PrintJob`) | nullable |
| `lastSeenAt` | Date | mis à jour à chaque poll de l'agent |
| `lastKnownStatus` | Enum | dernier statut connu avant une éventuelle perte de contact (`idle`/`printing`/...), conservé même une fois passé `offline` |
| `clearanceHistory` | Array | `{ status: 'confirmed', method: 'qr' \| 'admin_override', byUserId, byEmail, byName, date }` |
| `statusHistory` | Array | `{ status, reason, source, detail, byUserId, byName, date }` — voir section dédiée ci-dessous |

### Journalisation des états imprimante (pourquoi `offline`/`error`/`disabled`)

Avec une architecture 100% pull (l'imprimante contacte le Hub, jamais l'inverse), le Hub ne peut pas interroger une machine injoignable pour savoir pourquoi elle l'est devenue. Trois catégories de causes, bien distinguées dans `statusHistory` :

1. **`error`** (`source: 'agent_report'`) — l'agent est encore joignable et relaie une erreur explicite remontée par Klipper/Moonraker (ex: thermal runaway, capteur filament). `detail` contient le message d'erreur exact. Entièrement connu.
2. **`disabled`** (`source: 'admin_action'`) — un admin désactive l'imprimante depuis le dashboard (maintenance, réparation...). Toujours connu : `byUserId`, `byName`, et une note obligatoire expliquant pourquoi. Remplace l'ancien champ `isActive` : c'est maintenant un statut à part entière plutôt qu'un booléen séparé, pour que la raison soit toujours tracée.
3. **`offline`** (`source: 'heartbeat_timeout'`) — silence complet du polling au-delà du seuil (~3x l'intervalle, soit 1-2 min). **La cause réelle (coupure réseau, coupure électrique, plantage, câble débranché) n'est pas distinguable depuis le Hub** — c'est une limite technique inhérente à l'architecture pull, pas un manque de logging. Ce qui est loggé honnêtement : l'horodatage de la dernière prise de contact (`lastSeenAt`) et le dernier statut connu avant la coupure (`lastKnownStatus` — utile pour savoir si la machine était en train d'imprimer ou simplement inactive au moment du silence).

Un job de vérification léger (cron, ex: toutes les minutes) détecte le franchissement du seuil de silence pour chaque imprimante active et écrit l'entrée `statusHistory` correspondante une seule fois (pas à chaque lecture), afin que l'horodatage de détection soit fiable pour l'audit.

Dans tous les cas, `offline`, `error` et `disabled` bloquent les nouvelles soumissions.

### `PrintAuthorization`
| Champ | Type | Description |
|---|---|---|
| `email` | String | unique, lowercase |
| `authorized` | Boolean | whitelister = `true`, blacklister = `false` (jamais de suppression, on garde la trace) |
| `history` | Array | `{ authorized, byUserId, byName, date, note }` — même pattern que `Project.changeHistory` |

Politique : refus par défaut. Un email absent de la collection = refusé.

### `PrintJob`
| Champ | Type | Description |
|---|---|---|
| `student` | `{ email, name }` | dénormalisé, comme `SimulatedEnrollment` |
| `printer` | ObjectId (ref `Printer`) | |
| `fileName`, `filePath` | String | fichier stocké côté serveur (`/uploads/print-jobs/`) |
| `status` | Enum | `rejected` \| `queued` \| `sent` \| `printing` \| `completed` \| `failed` |
| `rejectionReason` | Enum | `not_authorized` \| `printer_busy` \| `printer_offline` \| `printer_error` \| `printer_disabled` (si `rejected`) |
| `errorMessage` | String | nullable, si `failed` |
| `submittedAt`, `startedAt`, `completedAt` | Date | |
| `history` | Array | `{ status, date, detail }` — chaque transition |

## Workflow détaillé

1. **Soumission** (étudiant, `POST /api/print/jobs`) — vérifications en cascade :
   - email whitelisté (`PrintAuthorization.authorized === true`) ;
   - imprimante `status === 'idle'` — sinon raison de refus précise selon le statut courant : `printer_busy` (`printing`/`awaiting_clearance`), `printer_offline` (silence réseau), `printer_error` (erreur remontée), `printer_disabled` (désactivée par un admin).

   Si une vérification échoue : rejet immédiat (`rejected` + raison), toujours loggé. Sinon : fichier sauvegardé, `PrintJob` créé en `queued`, imprimante verrouillée atomiquement (`findOneAndUpdate` conditionnel sur `idle`) pour éviter qu'une deuxième soumission simultanée passe entre deux vérifications.

   Le frontend désactive aussi le bouton de soumission si l'imprimante affichée n'est pas `idle` — le contrôle backend reste le filet de sécurité en cas de contournement.

2. **Dispatch** (agent, `GET /api/print/agent/next-job`, auth par clé API imprimante) — le Hub cherche un job `queued` pour cette imprimante et le fait passer atomiquement à `sent` pour éviter une double prise en charge si deux polls se chevauchent.

3. **Exécution** (agent) — télécharge le gcode (`GET /api/print/agent/jobs/:id/file`), l'envoie à Moonraker local, lance l'impression, notifie `POST /api/print/agent/jobs/:id/status` avec `status: 'printing'`. Le Hub met à jour `printer.status = 'printing'` et `printer.currentJob`.

4. **Fin d'impression** (agent) — notifie `completed` ou `failed`. Dans les deux cas, `printer.status` passe à `awaiting_clearance` (un échec laisse probablement de la matière sur le plateau).

5. **Libération** (voir section dédiée ci-dessous) — repasse l'imprimante à `idle`.

## Libération du plateau (clearance)

Décision : QR code physique **statique** (imprimé une fois, collé sur chaque machine), pointant vers une URL fixe par imprimante (`/print/printers/:id/confirm-clearance`).

- Scan → redirection vers le login Hub si nécessaire, puis affichage d'une page dédiée avec un message de certification explicite : **"Vous certifiez que le plateau d'impression est vide"**, incluant une mention des conséquences en cas de fausse déclaration.
- Validation → `POST /api/print/printers/:id/confirm-clearance` (n'importe quel utilisateur connecté), vérifie que `printer.status === 'awaiting_clearance'`, repasse à `idle`, log dans `clearanceHistory` (`method: 'qr'`, identité complète, date).
- Cette action n'est pas exposée comme un bouton générique dans le dashboard — seule la route liée au QR y donne accès, pour préserver l'incitation à se déplacer physiquement.
- **Override admin** : en secours (étiquette QR abîmée/perdue), un admin peut valider manuellement depuis le dashboard. Loggé séparément (`method: 'admin_override'`) pour ne pas mélanger les deux niveaux de garantie.

Limite connue et acceptée : l'URL n'étant pas un token à usage unique, quelqu'un qui la mémorise pourrait valider sans être physiquement présent. L'arbitrage retenu pour cette version : le message de certification (avec mention explicite des conséquences en cas de mensonge) et la traçabilité nominative par email suffisent comme dissuasion, le risque étant jugé faible au regard de la complexité d'une vraie preuve de présence.

## Backlog (améliorations futures)

- **Code de vérification rotatif affiché sur l'écran de l'imprimante**, en complément du QR, pour transformer la dissuasion actuelle en preuve de présence physique réelle (empêcher la validation à distance par mémorisation de l'URL). Non retenu pour cette version car la faisabilité technique n'est pas confirmée : Rinkhals conserve l'UI stock Anycubic (pas KlipperScreen) et ne documente pas d'API simple pour afficher du texte arbitraire sur cet écran ; un écosystème d'apps custom (`Rinkhals.apps`) existe et suggère que c'est possible, mais nécessiterait un développement dédié à valider par un test sur une machine avant de l'intégrer. Coût matériel nul (écran déjà piloté par le même Linux embarqué que Rinkhals contrôle), le risque est uniquement sur l'effort de développement.
- Gestion de whitelist par groupe/promo plutôt que nominative uniquement.
- Passage à une architecture push directe (VPN mesh + appel direct à l'API Moonraker) si un jour une liaison réseau fiable entre les deux réseaux est mise en place — permettrait du statut temps réel et un flux webcam.

## Gestion des erreurs et cas limites

- **Race condition sur soumission simultanée** : verrou atomique Mongo (`findOneAndUpdate` conditionnel) sur le passage `idle → verrouillé` avant création du job.
- **Agent qui perd la connexion en plein print** : détection de staleness — si aucun heartbeat depuis un seuil (~1-2 min) alors qu'un job est `printing`, le job est automatiquement basculé `failed`, l'imprimante passe `offline` (`statusHistory` : `source: 'heartbeat_timeout'`, `lastKnownStatus: 'printing'`) plutôt que directement `awaiting_clearance` — la libération du plateau ne redevient possible qu'une fois l'imprimante de nouveau joignable (le job échoué passe alors en `awaiting_clearance`), pour ne jamais bloquer une imprimante indéfiniment sur un silence tout en évitant de proposer une clearance sur une machine qu'on ne voit plus.
- **Reconnexion après un `offline`** : dès que l'agent reprend contact (premier poll réussi), si le job en cours au moment de la coupure avait été basculé `failed` par staleness, l'imprimante passe alors à `awaiting_clearance` (on découvre l'imprimante à nouveau joignable, mais on ne peut toujours pas garantir que le plateau est vide) ; sinon elle repasse simplement à son `lastKnownStatus` (`idle`).
- **Clé API imprimante compromise** : régénérable par un admin (invalide l'ancienne immédiatement).
- **Fichier invalide** : validation d'extension (gcode) et de taille max à la soumission.
- **Tentatives de soumission par un email non whitelisté** : toujours loggées avec email, date, imprimante visée — permet de repérer des tentatives suspectes répétées.

## Tests

Suivre le pattern Jest déjà en place côté backend (voir suite existante de ~80 tests) :
- application de la whitelist (autorisé / refusé / historique de révocation) ;
- transitions d'état de l'imprimante (`idle → printing → awaiting_clearance → idle`) et rejets associés (`printer_busy`, `printer_offline`, `printer_error`, `printer_disabled`) ;
- atomicité du dispatch (pas de double prise en charge d'un job par deux polls simultanés) ;
- bascule automatique en `offline`/`failed` sur staleness, avec `statusHistory` correctement rempli (`source: 'heartbeat_timeout'`, `lastKnownStatus`) ;
- reconnexion après `offline` : transition vers `awaiting_clearance` ou `lastKnownStatus` selon le cas ;
- passage `disabled` par un admin : refus des soumissions, note obligatoire, log avec identité ;
- clearance : refus si l'imprimante n'est pas en `awaiting_clearance`, log correct de l'identité et de la méthode (`qr` vs `admin_override`).

## Dépendances / prérequis avant implémentation

- Flasher Rinkhals sur les 3 imprimantes (confirmé compatible Kobra 3 / Kobra 3 Max) et vérifier l'accès SSH root + Moonraker fonctionnel.
- Décider du langage/runtime de l'agent en fonction de ce qui est disponible dans l'environnement embarqué de Rinkhals (Python probable, déjà présent pour Klipper).
- Générer et imprimer les 3 QR codes une fois les identifiants `Printer` créés en base.
