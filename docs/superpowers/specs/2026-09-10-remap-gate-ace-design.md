# Remapping bobine→gate ACE (v2 de la sélection de bobine) — Design

## Contexte

La feature "sélection de bobine ACE à la soumission" (spec `2026-09-09-selection-bobine-design.md`, plan `2026-09-09-selection-bobine.md`, PR #16 mergée le 2026-09-10) a livré un flux à deux temps (`/jobs/analyze` puis `/jobs/:pendingUploadId/confirm`) qui distingue deux cas :

- **Cas (a) — mono-matériau** (aucune commande `Tx` dans le fichier) : l'étudiant choisit un gate, injecté en tête du fichier via une ligne `Tn`.
- **Cas (b) — multi-couleur** (au moins une commande `Tx`) : affichage/comparaison seulement, jamais de sélection forcée.

**Ce qui a cassé cette hypothèse en usage réel (2026-09-10)** : la plupart des exports OrcaSlicer, même pour un fichier strictement mono-matériau, contiennent quand même une commande `T0` par défaut (sélection d'outil, pas un vrai changement de couleur). Résultat : la quasi-totalité des fichiers tombent dans le cas (b) — affichage seul — et la fonctionnalité de sélection forcée qui était l'objectif principal de la feature ne s'applique presque jamais en pratique. L'utilisateur ne peut pas dire "pour cette impression, utilise la bobine à l'emplacement 3" dès que le fichier contient un `Tx`, quel qu'il soit.

**Second problème découvert en creusant** : le firmware Anycubic ACE (`mmu_ace.py`, exécuté sur l'imprimante via Rinkhals) ne détecte automatiquement la matière/couleur d'une bobine que si elle porte une puce RFID Anycubic officielle. Une bobine générique/non-Anycubic (ex: blanche, sans puce) ne peut jamais être auto-détectée — le Hub affiche alors "inconnu" indéfiniment, pas à cause d'un bug, mais parce que la donnée n'existe nulle part.

## Spike technique du 2026-09-10 (SSH root/rockchip, lecture seule, aucune commande exécutée)

Lecture de `mmu_ace.py` sur le Kobra 3 en prod (`/useremain/rinkhals/20260901_01/home/rinkhals/apps/40-moonraker/mmu_ace.py`), qui invalide/précise plusieurs hypothèses de la spec du 09-09 :

1. **`Tx` est un index logique de tool, pas un gate physique.** Le firmware résout `Tx` → gate physique via une table interne `ttg_map` (tool-to-gate map), exposée en lecture dans l'objet Moonraker `mmu` (`ttg_map: [0,1,2,3]` par défaut = identité). C'est exactement pourquoi un fichier avec un seul `T0` utilise toujours le gate 0 par défaut.

2. **`MMU_SELECT`/`MMU_TTG_MAP` ne sont PAS des commandes "manuelles dangereuses"** comme la spec du 09-09 le supposait à tort. Lecture du handler `_on_gcode_mmu_select` (ligne ~1675) : avec `GATE=X`, la commande ne fait que mettre à jour un état en mémoire (`self.ace.gate`, `filament.pos = UNLOADED`) — **aucun mouvement physique, aucun chargement**. C'est le même mécanisme que la fonctionnalité "Color Match" déjà présente sur l'écran tactile de l'imprimante (référencée dans le code, issue #443).

3. **`MMU_TTG_MAP MAP=g0,g1,g2,g3`** (handler `_on_gcode_mmu_ttg_map`, ligne ~2220) remplace intégralement la table tool→gate. C'est le mécanisme natif pour dire "le tool N doit utiliser le gate M" — exactement le besoin de cette v2. `RESET=1` restaure l'identité par défaut.

4. **Piège de timing découvert** : la logique de pré-chargement automatique du firmware (`patch_print_data`/`_auto_feed_at_print_start`, ligne ~2395) se déclenche **au moment de l'appel API de démarrage d'impression**, en lisant l'état courant de `ttg_map` à cet instant — PAS en exécutant le gcode ligne par ligne. Une commande `MMU_TTG_MAP` simplement injectée en tête du fichier gcode arriverait donc probablement trop tard pour influencer ce pré-chargement. **Conséquence directe sur le design** : la commande doit être envoyée comme **un appel Moonraker séparé** (`POST /printer/gcode/script`), avant l'appel qui démarre l'impression — jamais comme contenu du fichier gcode lui-même.

5. **Pour un fichier sans aucun `Tx`** (vrai mono-matériau), le firmware ne déclenche aucune logique de tool-change ni d'auto-feed basée sur `ttg_map` — le mécanisme actuel (injection `Tn` en tête de fichier) reste correct et nécessaire pour ce cas précis. **Aucun changement pour ce cas.**

6. **RFID** (`gate.rfid: int`, valeurs `1 = pas de puce`, `2 = puce présente`) : ce champ existe en interne mais **n'est jamais exposé** dans l'objet `mmu` retourné par `printer/objects/query?mmu` (vérifié en lisant `get_status()`, ligne ~1284 — la liste des champs sérialisés ne contient aucun `gate_rfid`). Le Hub n'a donc **aucun moyen direct de savoir si une valeur matière/couleur vient d'une vraie lecture RFID ou d'une donnée par défaut/jamais mise à jour**. Confirmé en direct : les 4 gates du Kobra 3 de prod rapportent actuellement les valeurs `212721FF`/`F40031FF`/`FED141FF`/`FF6A14FF` — qui correspondent verbatim aux exemples utilisés dans la spec du 09-09, donc très probablement des valeurs de test jamais mises à jour, alors qu'une bobine blanche sans puce est physiquement chargée en gate 0.

## Objectif

Remplacer le mécanisme actuel par une expérience unique, quel que soit le fichier :

- **Tout fichier** (avec ou sans `Tx`) : l'étudiant assigne explicitement un gate physique à chaque tool utilisé dans le fichier (un seul "tool implicite" si le fichier n'a aucun `Tx`, un par `Tx` distinct sinon). Choix **obligatoire** pour chaque tool détecté avant de pouvoir confirmer.
- Sélection via des **cartes visuelles avec pastille de couleur réelle** (pas un menu déroulant texte), pour que l'étudiant puisse repérer "la bobine rouge" visuellement plutôt que par nom de matière.
- Pour les bobines sans puce RFID (non auto-détectables), une **déclaration manuelle** matière/couleur, ouverte à tout étudiant autorisé et aux admins, écrasée automatiquement dès qu'une vraie détection change la donnée.
- Rafraîchissement automatique de l'état des gates pendant que l'écran de sélection est ouvert (10-15s), pour refléter une déclaration manuelle récente ou une vraie lecture RFID sans redémarrer tout le flux.

## Architecture

### Détection (inchangée, réutilisée)

`parseGcodeSpoolInfo` (déjà livré, `server/src/utils/spoolAnalysis.js`) continue de scanner le fichier pour les commandes `Tx` et d'extraire les métadonnées slicer (`filament_type`/`filament_colour`). `gcodeMode` (`single`/`multi-material`) reste un signal interne utile — il détermine désormais quel **mécanisme d'injection** utiliser côté agent (Tn vs MMU_TTG_MAP), plus une distinction UI mono/multi.

### Modèle de données — `gateAssignments` remplace `selectedGate`/`mismatches`

Comme cette feature n'a pas encore été déployée en production (mergée sur `master`, pas déployée), le remplacement de forme est acceptable sans migration de données réelles.

**`PendingPrintUpload`** (modifié) :
- Retire `mismatches`.
- `expectedTools` inchangé (toujours utilisé pour afficher matière/couleur attendue par tool, à titre informatif).

**`PrintJob`** (modifié) :
- Retire `selectedGate`, `slotSelectionOverridden`, `slotMismatchWarnings`.
- Ajoute `gateAssignments: [{ tool: String|null, gate: Number }]` — `tool: null` pour le cas sans `Tx` (une seule entrée), `tool: 'T0'`/`'T2'`/etc. sinon (une entrée par tool détecté). Verrouillé à la confirmation, jamais revalidé au dispatch (constante globale inchangée).
- Ajoute `slotSelectionOverridden: Boolean` (conservé, même sémantique : override "aucune donnée bobine jamais reçue").

### `Printer.spoolSlots` — ajout du tracking de déclaration manuelle

Chaque entrée de `spoolSlots` gagne :
- `source: 'auto' | 'manual'` (défaut `'auto'`)
- `manualSetBy: { email, name } | null`
- `manualSetAt: Date | null`
- `autoMaterialAtSet`, `autoColorAtSet`, `autoEmptyAtSet` : snapshot de la valeur auto-détectée **au moment où la déclaration manuelle a été posée** — sert de référence pour détecter un changement ultérieur (voir algorithme ci-dessous). `null` quand `source === 'auto'`.

`material`/`color`/`empty` restent les champs "effectifs" (ce qui est affiché et comparé) — auto par défaut, ou la valeur manuelle tant qu'aucune dérive n'est détectée.

**Algorithme de fusion dans `reportSpoolStatus`** (remplace le remplacement intégral actuel `req.printer.spoolSlots = gates.map(...)`), pour chaque gate du rapport entrant :

```
si un slot existant a source === 'manual' :
    si (rapport.material, rapport.color, rapport.empty) === (autoMaterialAtSet, autoColorAtSet, autoEmptyAtSet) :
        → rien n'a changé côté auto-détection depuis la déclaration manuelle : GARDER le slot manuel tel quel
    sinon :
        → l'auto-détection a produit une nouvelle valeur (heuristique : une vraie puce RFID vient probablement d'être lue) :
          ADOPTER le rapport comme nouveau slot, source='auto', tous les champs de snapshot à null
sinon (source === 'auto' ou gate inconnu) :
    → ADOPTER le rapport tel quel, source='auto'
```

C'est une heuristique, pas une certitude : l'API Moonraker n'expose pas de signal direct "ceci vient d'une lecture RFID" (voir spike, point 6). Un changement de valeur auto-détectée est traité comme une nouvelle lecture faisant autorité. Limite acceptée : si l'auto-détection ne change jamais (bobine sans puce en place durablement), la déclaration manuelle survit indéfiniment — c'est le comportement désiré.

**Nouvel endpoint** `PUT /api/print/printers/:id/spool-slots/:gate/manual` — body `{ material, color }`. Auth : `authenticateToken` + (whitelist `PrintAuthorization.authorized === true` OU `req.user.role === 'admin'`). Valide `gate` dans `[0, spoolSlots.length[`. Règle de snapshot : si le slot est actuellement `source === 'auto'`, capture ses valeurs courantes comme `autoXAtSet` ; si déjà `source === 'manual'`, **conserve** le snapshot existant (ne pas écraser la référence de dérive juste parce qu'on corrige une déclaration manuelle). `empty` est toujours posé à `false` par une déclaration manuelle (déclarer un contenu implique une bobine présente — déclarer "vide" n'a pas de cas d'usage, l'étudiant ne sélectionnerait simplement pas ce gate). Le format de couleur saisi manuellement (ex: via un `<input type="color">`, qui produit du `#RRGGBB`) n'a pas besoin de correspondre au format natif Moonraker (`RRGGBBAA` sans `#`) — `normalizeColor` (déjà écrit, `spoolAnalysis.js`) gère déjà la comparaison entre formats différents, aucune règle supplémentaire à écrire pour ce endpoint.

### Endpoints existants — évolution du contrat

**`POST /jobs/analyze`** : réponse étendue avec `expectedTools` (inchangé) et `slots` (inchangé, désormais avec `source`/`manualSetBy` en plus par gate, pour que le frontend puisse afficher "déclaré manuellement par untel" en info-bulle). Le calcul de `mismatches` est **retiré de la réponse** — puisque le gate n'est plus figé avant confirmation (l'étudiant le choisit interactivement), la comparaison matière/couleur attendue-vs-chargée devient une donnée qui change à chaque clic sur une carte différente. Le frontend a déjà tout ce qu'il faut pour la calculer lui-même (`expectedTools` + `slots`) au moment où l'étudiant sélectionne un gate, en réutilisant la même logique de normalisation de couleur (`normalizeColor`, déjà écrite côté backend dans `spoolAnalysis.js` — à porter en JS pur côté client, aucune nouvelle règle de comparaison à inventer). Pas de round-trip serveur nécessaire pour afficher l'avertissement.

**`POST /jobs/:pendingUploadId/confirm`** : body devient `{ gateAssignments?: [{tool, gate}], overrideNoSpoolData?: boolean }`.
- Si `Printer.spoolSlotsUpdatedAt` est `null` (jamais reçu de rapport agent) : comportement inchangé, `overrideNoSpoolData: true` requis, `gateAssignments: []` et `slotSelectionOverridden: true` sur le job créé.
- Sinon : `gateAssignments` doit contenir **exactement une entrée par tool détecté** dans le fichier (`expectedTools` du `PendingPrintUpload`, ou une entrée unique `{tool: null, gate}` si `gcodeMode === 'single'`), chaque `gate` désignant un slot existant et non vide (même validation qu'aujourd'hui, par entrée). Sinon 400.

### Côté agent (`printer-agent/`)

Nouvelle méthode `MoonrakerClient.set_ttg_map(mapping: list[int])` : `POST /printer/gcode/script` avec `script=MMU_TTG_MAP MAP=<mapping joint par virgules>`, même patron d'erreur (`MoonrakerClientError`) que les méthodes existantes.

`_try_dispatch` :
- `job["gateAssignments"]` vide ou absent → comportement inchangé, rien d'injecté.
- Une entrée avec `tool: null` → comportement inchangé, injection `Tn` en tête de fichier (mécanisme actuel, zéro changement).
- Une ou plusieurs entrées avec un `tool` non-null → construit le tableau `ttg_map` complet (longueur = nombre de gates rapportés par le dernier `get_mmu_status()`, valeurs par défaut identité pour les tools non concernés) et appelle `moonraker.set_ttg_map(mapping)` **avant** `hub.download_job_file`/`moonraker.upload_and_start_print` — jamais de modification du contenu du fichier dans ce cas.

**Risque résiduel, même précédent que l'injection `Tn` initiale** : ce mécanisme (`MMU_TTG_MAP` en appel séparé avant démarrage) n'a jamais été testé en conditions réelles — le timing exact vis-à-vis du pré-chargement automatique du firmware (point 4 du spike) est une déduction de lecture de code, pas une vérification live. À valider par un test supervisé (impression courte réelle) avant tout déploiement en production, comme pour l'injection `Tn` d'origine.

## Frontend

### `GatePicker` — nouveau composant partagé

Remplace le `<Select>` HTML natif partout où un gate est choisi. Rangée de cartes cliquables, une par gate physique (0 à 3) :
- Pastille de couleur (à partir de `slot.color`, hex)
- Nom de la matière
- Numéro de slot (`Slot 1`..`Slot 4`)
- Désactivée si `slot.empty`
- Icône crayon → ouvre un petit formulaire inline (matière + sélecteur de couleur) → appelle `PUT /spool-slots/:gate/manual`
- Si `slot.source === 'manual'`, indication visuelle discrète (ex: "déclaré manuellement")

### `client/src/pages/print/index.js`

- Après `/analyze`, la page affiche un `GatePicker` par tool détecté (1 seul si `gcodeMode === 'single'`, un par entrée de `expectedTools` sinon), chacun étiqueté avec le tool et — si disponible — la matière/couleur attendue par le slicer (repris de l'UI multi-couleur actuelle).
- En dessous de chaque `GatePicker`, si le gate choisi ne correspond pas à la matière/couleur attendue par le slicer pour ce tool, un badge d'avertissement non-bloquant (reprend l'esprit du panneau de comparaison actuel — jamais bloquant, juste informatif).
- Bouton de confirmation actif seulement quand chaque tool détecté a un gate assigné.
- Pendant que cet écran est affiché, poll toutes les 10-15s (`GET` léger sur l'état de l'imprimante) pour rafraîchir `slots` sans relancer `/analyze`.
- Cas "aucune donnée bobine jamais reçue" : inchangé (message de blocage + bouton "soumettre quand même" + modale d'avertissement).

### `client/src/pages/admin/print/index.js`

Affiche `gateAssignments` (liste tool→gate) à la place de l'actuel `selectedGate` unique, même esprit (lecture seule, informatif). `slotMismatchWarnings` disparaît de cet affichage (le champ est retiré de `PrintJob`) — l'étudiant ne pouvant plus confirmer sans avoir explicitement choisi un gate pour chaque tool, il n'y a plus de mismatch "subi" à tracer après coup pour audit.

## Hors périmètre

- Revalidation live entre confirmation et dispatch (inchangé — verrouillé à la confirmation, comme avant).
- Détection automatique fiable pour les bobines sans puce RFID : impossible matériellement, la déclaration manuelle est la seule solution disponible.
- Une véritable intégration Spoolman ou un signal RFID exposé côté Moonraker : dépend de changements côté firmware Rinkhals/ACE, hors de portée du Hub.
- Suppression du champ `source`/tracking manuel après un certain temps (auto-expiration d'une déclaration manuelle) : non demandé, l'heuristique de dérive suffit.
