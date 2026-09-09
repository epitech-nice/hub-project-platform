# Sélection de bobine (ACE) à la soumission — Design

## Contexte

Les 3 imprimantes du Hub (Kobra 3 / Kobra 3 Combo) sont équipées d'un ACE Pro (Anycubic Color Engine), un système multi-bobines à 4 emplacements physiques ("gates"). Aujourd'hui, un étudiant qui soumet un fichier `.gcode` n'a aucun moyen de choisir ou de vérifier quelle bobine sera utilisée — l'ACE gère les changements de bobine de façon opaque, avec pour seule source de vérité le fichier gcode lui-même.

Un spike SSH sur le Kobra 3 en production (2026-09-09, lecture de code uniquement, aucune commande exécutée sur l'imprimante) a établi les faits techniques suivants :

- Moonraker expose un objet `mmu` en lecture (via `printer/objects/query?mmu`) : par gate (0-3), matériau, couleur (hex RGBA), température recommandée, occupé/vide — alimenté par lecture RFID des bobines côté firmware Anycubic.
- Le composant Moonraker responsable (`mmu_ace.py`, fourni par Rinkhals) enregistre des commandes gcode manuelles (`MMU_SELECT`, `MMU_LOAD`, `MMU_UNLOAD`, etc.) réservées au panneau Fluidd — **le changement de bobine pendant une impression réelle est entièrement automatique côté ACE**, déclenché par les commandes `Tx` déjà présentes dans le fichier gcode (le composant le documente explicitement : "ACE handles filament changes automatically during print").
- Un fichier gcode multi-couleur exporté par OrcaSlicer contient déjà les commandes `T0`-`T3` dans son corps, plus des commentaires d'en-tête standards (`; filament_colour = ...`, `; filament_type = ...`) donnant la matière/couleur attendue par tool.

Conséquence directe sur le design : il n'existe pas de "sélectionner une bobine" générique côté API — il y a deux cas d'usage distincts avec deux mécanismes différents.

## Objectif

- **Cas (a) — gcode mono-matériau** (aucune commande `Tx` dans le fichier) : l'étudiant choisit explicitement quel gate physique utiliser, à partir de l'état réel connu des 4 slots. Le Hub force ce choix en injectant une commande `Tn` en tête du fichier avant dispatch — via le même canal que celui utilisé nativement par un gcode multi-couleur, jamais via les commandes manuelles `MMU_SELECT`/`MMU_LOAD`.
- **Cas (b) — gcode déjà multi-couleur** (au moins une commande `Tx` présente) : le fichier a déjà son mapping tool→gate décidé par le slicer. Le Hub se contente d'afficher/comparer ce que le fichier attend (matière/couleur par tool, extrait des commentaires d'en-tête) contre l'état réel des slots, et avertit en cas de mismatch — jamais bloquant.

## Architecture

### Remontée de l'état des bobines (agent → Hub)

Le réseau imprimantes reste isolé du réseau Hub — aucune requête directe possible depuis le Hub vers Moonraker. L'état des bobines est donc connu avec un décalage identique à celui du reste du système (jusqu'à ~60s, `TICK_INTERVAL_SECONDS` inchangé — cette constante est aussi utilisée pour la latence d'annulation, décision déjà actée de ne pas y toucher).

Nouvel endpoint dédié plutôt que d'étendre encore le heartbeat (déjà modifié 204→200 pour l'annulation deux jours plus tôt — un deuxième changement de contrat sur le même endpoint en si peu de temps aurait ajouté du risque de désynchro agent/hub pour rien) :

```
Agent (chaque tick, dispatch ou monitor) --GET /printer/objects/query?mmu--> Moonraker
     |
     v
Agent --POST /agent/spool-status {gates: [...]}--> Hub
     |
     v
Printer.spoolSlots mis à jour, Printer.spoolSlotsUpdatedAt = now
```

### Cas (a) — mono-matériau, sélection forcée

```
Étudiant --POST /jobs/analyze (printerId, file)--> Hub
                                                      |
                                        détecte : aucune commande Tx dans le fichier
                                                      |
                                    PendingPrintUpload créé, réponse: { mode: 'single', slots }
                                                      |
Étudiant choisit un gate (slot vide grisé) --POST /jobs/:pendingId/confirm (selectedGate)--> Hub
                                                      |
                                    verrou atomique imprimante (comme aujourd'hui), PrintJob créé
                                                      |
                                                      v
Agent (dispatch) --préfixe le gcode téléchargé d'une ligne "Tn"--> upload_and_start_print (Moonraker)
```

Si `Printer.spoolSlotsUpdatedAt` est absent (jamais reçu de données bobines pour cette imprimante) : `/confirm` refuse avec `400` sauf si `overrideNoSpoolData: true` est passé — dans ce cas le job est créé avec `selectedGate: null`, `slotSelectionOverridden: true`, et l'agent n'injecte rien (comportement identique à avant cette feature). Le frontend affiche une modale de confirmation avec avertissement de gravité avant de permettre cet override — accessible à n'importe quel étudiant autorisé, pas réservé aux admins.

### Cas (b) — multi-couleur, affichage/validation

```
Étudiant --POST /jobs/analyze (printerId, file)--> Hub
                                                      |
                                    détecte : au moins une commande Tx présente
                                                      |
                          extrait les commentaires slicer (filament_colour/filament_type par tool)
                                                      |
                          compare aux Printer.spoolSlots actuels (pas de seuil d'âge — on compare
                          toujours avec la dernière valeur connue, ce n'est qu'un avertissement)
                                                      |
                          PendingPrintUpload créé, réponse: { mode: 'multi-material', expectedTools, mismatches }
                                                      |
Étudiant confirme (aucun champ requis) --POST /jobs/:pendingId/confirm--> Hub
                                                      |
                          PrintJob créé avec slotMismatchWarnings copié depuis le PendingPrintUpload
```

Si les commentaires slicer sont absents du fichier (gcode multi-couleur généré autrement qu'OrcaSlicer) : aucun mismatch n'est calculé, le panneau affiche juste "matières attendues non déterminables" — jamais bloquant, jamais une erreur.

### Détection du mode

Règle unique, sur le corps du fichier gcode uploadé : présence d'au moins une commande `Tx` (regex sur les lignes de la forme `^\s*T[0-3]\s*(;.*)?$`) → cas (b). Aucune occurrence → cas (a). Le nombre de `Tx` distincts n'entre pas en compte — même un unique `T0` explicite signale que le fichier est déjà "conscient" de l'ACE et route vers (b), pour ne jamais risquer d'empiler une injection sur une commande déjà présente.

### Flux d'upload en deux temps et nettoyage

`POST /jobs/analyze` stocke le fichier dans un répertoire temporaire (`uploads/pending-print-jobs/`) et crée un document `PendingPrintUpload` — **aucun verrou imprimante n'est posé à ce stade**, le verrou atomique existant (`Printer.findOneAndUpdate` conditionné sur `status: idle`) se déplace à `/confirm`, exactement comme aujourd'hui à la soumission classique. Deux étudiants peuvent donc analyser un fichier sur la même imprimante idle en parallèle ; seul le premier à confirmer obtient le verrou, l'autre reçoit `409 printer_busy` à la confirmation (comportement identique au verrou actuel, juste déplacé d'une étape).

Un `PendingPrintUpload` non confirmé dans les **15 minutes** est considéré abandonné et nettoyé automatiquement (index TTL Mongo `expireAfterSeconds: 900` sur `createdAt`, plus suppression du fichier temporaire associé) — pas de scheduler custom à écrire, le TTL Mongo natif suffit.

La vérification whitelist (étudiant autorisé) a lieu aux deux étapes : à `/analyze` (pas la peine de laisser un étudiant non autorisé uploader/analyser un fichier) et de nouveau à `/confirm` (au cas où le statut aurait changé entre-temps — vérification bon marché, cohérente avec le reste du système qui ne fait jamais confiance à un état vérifié il y a plusieurs minutes pour une action qui modifie des données).

## Modèle de données

### `Printer` (champs ajoutés)

- `spoolSlots` : tableau de 4 entrées `{ gate: Number, material: String, color: String, empty: Boolean }`, mis à jour à chaque tick agent via `/agent/spool-status`. `null`/tableau vide tant qu'aucune donnée n'a jamais été reçue.
- `spoolSlotsUpdatedAt` : Date, `null` tant qu'aucune donnée n'a été reçue — c'est ce champ (présence, pas fraîcheur) qui détermine si le blocage "données indisponibles" du cas (a) s'applique.

### `PendingPrintUpload` (nouveau modèle)

- `student` : `{ email, name }`
- `printer` : ObjectId → `Printer`
- `fileName`, `filePath` : chemin temporaire dans `uploads/pending-print-jobs/`
- `gcodeMode` : `'single' | 'multi-material'`
- `expectedTools` : tableau `[{ tool: 'T0'..'T3', material, color }]` — uniquement pour `multi-material`, vide si les commentaires slicer sont absents du fichier
- `mismatches` : tableau `[{ tool, expectedMaterial, expectedColor, actualGate, actualMaterial, actualColor }]` — calculé à l'analyse, copié tel quel sur le `PrintJob` à la confirmation
- `createdAt` : Date, index TTL `expireAfterSeconds: 900`

### `PrintJob` (champs ajoutés)

- `selectedGate` : Number (0-3) ou `null` — slot verrouillé à la confirmation pour un gcode mono-matériau (cas a). `null` si multi-matériau ou si override sans données.
- `slotSelectionOverridden` : Boolean, défaut `false` — la sélection a été outrepassée faute de données bobines disponibles sur l'imprimante.
- `gcodeMode` : `'single' | 'multi-material'` — copié depuis le `PendingPrintUpload`, pour observabilité (journal admin).
- `slotMismatchWarnings` : tableau (même forme que `PendingPrintUpload.mismatches`) — copié tel quel à la confirmation, conservé pour consultation ultérieure dans le journal admin.

## Endpoints

### `POST /api/print/jobs/analyze`

Multipart : `printerId`, `file` (`.gcode`). Auth : `authenticateToken`, vérification whitelist (même logique que `submitJob` actuel — rejette avec le même mécanisme `rejectSubmission` si non autorisé, **mais sans créer de `PrintJob` rejeté** puisqu'aucun job n'existe encore à ce stade ; le fichier temporaire est simplement supprimé et l'erreur renvoyée directement).

- Stocke le fichier en temporaire, parse le gcode (détection `Tx`, extraction commentaires slicer si multi-couleur).
- Crée le `PendingPrintUpload`.
- Réponse `201` : `{ pendingUploadId, mode, slots (état actuel Printer.spoolSlots), expectedTools, mismatches }`.

Ne vérifie **pas** que l'imprimante est idle à ce stade (ce n'est qu'à `/confirm` que ça compte, et le vérifier deux fois créerait une fenêtre de race inutile entre les deux checks).

### `POST /api/print/jobs/:pendingUploadId/confirm`

Body JSON : `{ selectedGate? , overrideNoSpoolData? }`. Auth : `authenticateToken`, doit correspondre à l'email du `PendingPrintUpload` (un étudiant ne peut pas confirmer l'upload d'un autre).

- Re-vérifie whitelist + statut imprimante idle (verrou atomique identique à `submitJob` actuel). Un échec ici (whitelist révoquée entre l'analyse et la confirmation, ou imprimante devenue occupée/désactivée) crée un `PrintJob` `rejected` classique (mêmes `rejectionReason`, même logique que `rejectSubmission` aujourd'hui) — contrairement à `/analyze`, on a ici un contexte complet (fichier prêt à être déplacé, printer ciblé), donc pas de raison de s'écarter du comportement d'audit existant.
- Cas `single` : exige `selectedGate` sauf si `Printer.spoolSlotsUpdatedAt` est `null` et `overrideNoSpoolData: true`.
- Cas `multi-material` : aucun champ requis, `mismatches` copié tel quel.
- Déplace le fichier du répertoire temporaire vers le répertoire permanent des jobs, crée le `PrintJob`, supprime le `PendingPrintUpload`.
- Réponse `201` avec le job créé — mêmes codes d'erreur que `submitJob` aujourd'hui (`403` non whitelisté, `409` imprimante occupée) en plus d'un `400` si `selectedGate` manquant sans override valide, et `404`/`410` si le `PendingPrintUpload` n'existe plus (expiré ou déjà confirmé).

### `POST /api/print/agent/spool-status`

Auth : `authenticatePrinter`. Body : `{ gates: [{ gate, material, color, empty }] }` (4 entrées). Met à jour `Printer.spoolSlots` et `Printer.spoolSlotsUpdatedAt`. Réponse `200`, pas de corps significatif (symétrique à la simplicité du heartbeat).

## Côté agent (`printer-agent/`)

- Nouvelle méthode `MoonrakerClient.get_mmu_status()` : `GET /printer/objects/query?mmu`, parse `gate_status`/`gate_material`/`gate_color` en une liste de 4 dicts `{gate, material, color, empty}`. Suit le même patron que `get_print_stats()` (timeout `self.timeout`, lève `MoonrakerClientError`).
- `run_tick` : après le heartbeat existant, appelle `get_mmu_status()` puis `hub.report_spool_status(gates)` (nouvelle méthode `HubClient`) — à chaque tick, dispatch comme monitor, indépendamment de l'état d'un job en cours. Un échec de cet appel (Moonraker ou hub injoignable) est loggé et n'interrompt jamais le reste du tick (même logique de tolérance que le heartbeat).
- `_try_dispatch` : si le job renvoyé par `GET /next-job` porte un `selectedGate` non-null, l'agent lit le fichier téléchargé et écrit `f"T{selected_gate}\n"` + contenu original avant l'appel à `moonraker.upload_and_start_print()`. Nécessite d'étendre la réponse de `GET /agent/next-job` avec le champ `selectedGate`.

## Frontend

- **`client/src/pages/print/index.js`** : le formulaire de soumission passe en flux 2 temps — upload déclenche `/jobs/analyze`, puis affichage conditionnel :
  - **Cas `single`** : liste des 4 slots (matière/couleur actuelle, slot vide grisé/désactivé), sélection obligatoire avant de pouvoir confirmer. Si `slots` vide (aucune donnée jamais reçue) : message de blocage + bouton "Soumettre quand même" → modale de confirmation avec texte d'avertissement de gravité (action irréversible, aucune garantie sur la bobine utilisée).
  - **Cas `multi-material`** : tableau T0-T3 avec matière/couleur attendue vs slot actuel, badge d'avertissement sur les lignes en mismatch — bouton de confirmation toujours actif.
  - Bouton "Annuler" (retour au formulaire sans confirmer) : purement local au frontend (réinitialise l'état de la page, ré-affiche le formulaire d'upload) — pas d'appel réseau dédié à l'abandon. Le `PendingPrintUpload` orphelin correspondant est nettoyé par le TTL Mongo comme n'importe quel abandon silencieux (fermeture d'onglet, navigation ailleurs).
- **`client/src/pages/admin/print/index.js`** : le journal affiche, sur chaque job, le slot utilisé (`selectedGate`, ou "non spécifié (override)" si `slotSelectionOverridden`) et les mismatchs enregistrés le cas échéant (`slotMismatchWarnings`).

## Hors périmètre (explicitement écarté)

- Groupes "endless spool" (bascule automatique si une bobine se vide en cours d'impression) : fonctionnalité déjà native côté ACE (`endless_spool_groups` dans l'objet `mmu`), non exposée ni pilotée par le Hub.
- Intégration Spoolman : déjà émulée côté imprimante par `mmu_ace.py` (proxy `/server/spoolman/proxy`), pas de proxy supplémentaire côté Hub.
- Revalidation live du contenu d'un slot entre confirmation et dispatch réel : le choix est verrouillé à la confirmation, comme le choix d'imprimante l'est déjà à la soumission — fenêtre de risque jugée minime (un seul job peut être en file par imprimante, dispatch en quelques minutes maximum).
- Vérification en conditions réelles que l'injection d'une ligne `Tn` isolée déclenche effectivement un chargement complet de bobine côté ACE : **hypothèse non testée en live** pendant ce brainstorming (spike limité à la lecture de code source, aucune commande exécutée sur l'imprimante en production par précaution). À valider par un test supervisé (impression courte réelle) pendant l'implémentation, avant tout déploiement en production — même précédent que la découverte tardive de l'absence de cron sur le firmware Rinkhals.
- Pause/reprise ACE, changement de bobine en cours d'impression déclenché depuis le Hub : non demandé.
