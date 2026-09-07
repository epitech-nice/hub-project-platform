# Mise à jour de la documentation générale (mars → septembre 2026) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ramener `docs/*.md` au niveau de l'état réel du code — la plupart des fichiers n'ont pas été substantiellement mis à jour depuis le 2026-03-13, alors que 113 commits (design system, dashboard, RFID, impression 3D...) ont atterri sur `master` depuis.

**Architecture:** Documentation pure, aucun changement de code. Chaque tâche lit le code source réel (routes, contrôleurs, modèles, pages) pour extraire les détails exacts plutôt que de faire confiance à ce plan pour les noms précis de champs/paramètres — ce plan donne la portée et la structure, pas nécessairement chaque nom de champ.

**Tech Stack:** Markdown uniquement.

**Spec:** Pas de spec dédiée — ce plan s'appuie sur un audit produit en session le 2026-09-07 (git log complet depuis 2026-03-13 croisé avec le contenu actuel de `docs/`). Les findings de cet audit sont reproduits dans les tâches ci-dessous ; en cas de doute, le code source fait autorité, pas ce plan.

## Global Constraints

- Convention de style à respecter : tableaux `| Route | Méthode | Auth | Description |` pour lister des endpoints (voir `docs/api-simulated.md` ou `docs/api-projects-workshops.md` comme référence), sections `##`/`###` par domaine fonctionnel.
- Versions déjà vérifiées comme exactes et **ne nécessitant aucune correction** : Next.js `12.2.3`, Mongoose `^6.5.0`, Express `^4.18.1`, React `18.2.0` (confirmé contre `client/package.json`/`server/package.json` le 2026-09-07).
- Routes d'impression montées dans `server/src/app.js:219-223` :
  - `/api/print/printers` → `server/src/routes/printPrinters.js`
  - `/api/print/whitelist` → `server/src/routes/printWhitelist.js`
  - `/api/print/jobs` → `server/src/routes/printJobs.js`
  - `/api/print/agent` → `server/src/routes/printAgent.js`
  - `/api/print/access-requests` → `server/src/routes/printAccessRequests.js`
  - Contrôleurs associés dans `server/src/controllers/print/` : `printerController.js`, `whitelistController.js`, `jobController.js`, `agentController.js`, `accessRequestController.js`
- Modèles d'impression : `server/src/models/Printer.js`, `PrintAuthorization.js`, `PrintJob.js`, `PrintAccessRequest.js`
- Pages frontend d'impression : `client/src/pages/print/index.js`, `client/src/pages/print/printers/[id]/confirm-clearance.js`, `client/src/pages/admin/print/index.js`, `client/src/pages/admin/print/printers/[id]/qr.js`
- Ne pas dupliquer le contenu opérationnel déjà écrit dans `printer-agent/README.md` et `docs/printer-onboarding.md` (déploiement agent/Rinkhals) — y renvoyer depuis la doc générale plutôt que de le répéter.
- Chaque tâche doit lire le code source qu'elle documente avant d'écrire quoi que ce soit — ne jamais inventer un nom de route/champ/paramètre.

---

### Task 1 : Créer `docs/api-print.md`

**Files:**
- Create: `docs/api-print.md`

**Interfaces:**
- Consumes: routes/contrôleurs listés dans Global Constraints ci-dessus.
- Produces: nouveau fichier de référence API, à lier depuis `docs/architecture.md` (Task 2) si celle-ci a une liste de docs API existante à compléter.

- [ ] **Step 1 : Lire le code source**

Lire dans l'ordre : `server/src/app.js:219-223` (mount points), puis chacun des 5 fichiers de routes (`server/src/routes/print*.js`) et leurs contrôleurs correspondants dans `server/src/controllers/print/`, puis les 4 modèles (`server/src/models/Print*.js`). Noter pour chaque route : méthode HTTP, chemin complet, middleware d'auth utilisé (`authenticateToken`, `isAdmin`, `authenticatePrinter`, etc.), body/params attendus, réponse de succès.

- [ ] **Step 2 : Écrire le fichier**

Structure attendue (suivre le style de `docs/api-simulated.md` : tableaux de routes, sections par domaine) :

```markdown
# API — Impression 3D

Base URL : `http://localhost:5000/api/print`

[Section erreurs globales si le format est identique aux autres API — vérifier dans agentController.js/printerController.js]

---

## Imprimantes (admin)

[Tableau des routes /printers — création, désactivation, régénération de clé, QR code]

## Whitelist

[Tableau des routes /whitelist — autorisation par email, révocation]

## Demandes d'accès (étudiant non whitelisté)

[Tableau des routes /access-requests]

## Jobs d'impression (étudiant)

[Tableau des routes /jobs — soumission]

## Agent (pull-only, appelé par printer-agent tournant sur chaque imprimante)

[Tableau des routes /agent — next-job, jobs/:id/file, jobs/:id/status, heartbeat]
Voir `printer-agent/README.md` et `docs/printer-onboarding.md` pour le déploiement réel de l'agent — ne pas dupliquer ici.

## Modèle de statut d'une imprimante

Décrire les statuts (`offline`/`error`/`disabled`/état normal — vérifier le nom exact du statut "normal" dans Printer.js) et `statusHistory[]`. Mentionner la limite connue : architecture 100% pull, le Hub ne peut jamais savoir *pourquoi* une imprimante silencieuse (`offline`) l'est devenue (coupure réseau vs électrique vs plantage) — seuls `lastSeenAt` et le dernier statut connu sont loggables.

## Clearance (QR code)

Décrire le flux de double validation avant de pouvoir relancer une impression (fin de job API + confirmation physique QR).
```

- [ ] **Step 3 : Auto-vérification**

Relire le fichier produit et vérifier que chaque route mentionnée existe bien dans le code lu à l'étape 1 (pas de route inventée), et qu'aucune route réelle des 5 fichiers de routes n'a été oubliée.

- [ ] **Step 4 : Commit**

```bash
git add docs/api-print.md
git commit -m "$(cat <<'EOF'
docs: add docs/api-print.md for the 3D printing API

The printing feature (Printer/PrintAuthorization/PrintJob/PrintAccessRequest,
routes under /api/print/*) shipped without ever getting a general-docs
entry, unlike every other API surface in this repo.
EOF
)"
```

---

### Task 2 : Mettre à jour `docs/architecture.md`

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1 : Lire l'arborescence réelle actuelle**

`ls server/src/models/`, `ls server/src/controllers/`, `ls server/src/routes/`, et la racine du repo (`ls`) pour confirmer que `printer-agent/` existe au même niveau que `client/`/`server/`.

- [ ] **Step 2 : Mettre à jour l'arborescence documentée**

Ajouter à l'arborescence actuelle de `docs/architecture.md` (sans réécrire ce qui est déjà correct) :
- `printer-agent/` au même niveau que `client/`/`server/` à la racine
- Les modèles manquants : `Printer.js`, `PrintJob.js`, `PrintAuthorization.js`, `PrintAccessRequest.js`, et `ToolReport.js` (cette dernière est en prod depuis mai, jamais ajoutée)
- Les routes/contrôleurs `print*` listés dans les Global Constraints ci-dessus
- Le contrôleur `toolReportController.js` s'il existe (vérifier `server/src/controllers/`)

- [ ] **Step 3 : Ajouter Rinkhals comme dépendance/intégration externe**

Chercher si une section "dépendances externes" ou "intégrations tierces" existe déjà dans le fichier. Si oui, y ajouter une ligne sur Rinkhals (firmware custom pour Anycubic Kobra, permet l'accès SSH/Moonraker aux 3 imprimantes 3D — lien vers https://github.com/rinkhals-community/Rinkhals). Si cette section n'existe pas, en créer une courte (Resend, Rinkhals, et toute autre dépendance externe déjà mentionnée ailleurs dans le fichier type OAuth Microsoft).

- [ ] **Step 4 : Vérifier les versions listées**

Confirmer que le fichier ne liste pas de version différente de Next `12.2.3` / Mongoose `^6.5.0` / Express `^4.18.1` / React `18.2.0` (déjà vérifiées exactes, voir Global Constraints) — si une version différente est actuellement écrite, la corriger pour matcher `package.json`.

- [ ] **Step 5 : Commit**

```bash
git add docs/architecture.md
git commit -m "docs: update architecture.md with printer-agent, print/ToolReport models, and Rinkhals dependency"
```

---

### Task 3 : Mettre à jour `docs/models.md`

**Files:**
- Modify: `docs/models.md`

- [ ] **Step 1 : Lire les modèles source**

Lire en entier `server/src/models/Printer.js`, `PrintAuthorization.js`, `PrintJob.js`, `PrintAccessRequest.js`, `ToolReport.js`.

- [ ] **Step 2 : Ajouter les sections manquantes**

Suivre le format déjà utilisé dans `docs/models.md` pour les modèles existants (probablement : nom du modèle, champs avec types, relations, notes). Ajouter :
- `Printer` : statuts (`offline`/`error`/`disabled`/normal), `statusHistory[]` (source: `agent_report`/`admin_action`/`heartbeat_timeout`), `currentJob`
- `PrintAuthorization` : whitelist par email, historique des révocations
- `PrintJob`
- `PrintAccessRequest` : demande d'accès étudiant non whitelisté, résolution auto à l'autorisation/blacklist
- `ToolReport` : uniquement si absent de `docs/inventory.md` — lire `docs/inventory.md` d'abord pour éviter un doublon (Task 6 traite aussi ce fichier, mais peut être exécutée dans n'importe quel ordre par rapport à celle-ci ; si les deux tâches ajoutent `ToolReport` au même endroit ce n'est pas grave, le review final le détectera)

- [ ] **Step 3 : Commit**

```bash
git add docs/models.md
git commit -m "docs: document Printer/PrintAuthorization/PrintJob/PrintAccessRequest models"
```

---

### Task 4 : Mettre à jour `docs/frontend.md`

**Files:**
- Modify: `docs/frontend.md`

- [ ] **Step 1 : Lire les pages source**

Lire `client/src/pages/print/index.js`, `client/src/pages/print/printers/[id]/confirm-clearance.js`, `client/src/pages/admin/print/index.js`, `client/src/pages/admin/print/printers/[id]/qr.js` pour comprendre ce que fait chaque page (assez pour une description d'une ou deux phrases par page, pas un résumé exhaustif du code).

- [ ] **Step 2 : Ajouter la section pages d'impression**

Suivre le format existant du fichier pour lister une page (route, description, rôle requis). Ajouter les 4 pages ci-dessus.

- [ ] **Step 3 : Ajouter une section Design System**

Lire `client/src/pages/_document.js` et chercher les tokens CSS (`--bg`, `--surface`) dans les fichiers de style globaux (`client/src/styles/` ou équivalent — chercher avec `grep -rn "\-\-bg:\|\-\-surface:" client/src`). Documenter dans une nouvelle section "Design System" :
- Dark mode par défaut (`defaultTheme="dark"` dans le ThemeProvider — vérifier l'emplacement exact avec `grep -rn "defaultTheme" client/src`)
- Tokens CSS `--bg`/`--surface` et leurs valeurs
- Police : Plus Jakarta Sans + JetBrains Mono, chargées via Google Fonts dans `_document.js`
- Composant `BentoCard` : effet hover (`-translate-y-1` + `shadow-lg` + `border-primary/40`) — localiser le composant avec `grep -rln "BentoCard" client/src/components`
- Navigation desktop en 3 colonnes (header)

- [ ] **Step 4 : Commit**

```bash
git add docs/frontend.md
git commit -m "docs: document print pages and PR #6 design system in frontend.md"
```

---

### Task 5 : Mettre à jour `docs/api-projects-workshops.md`

**Files:**
- Modify: `docs/api-projects-workshops.md`

- [ ] **Step 1 : Lire le contrôleur source**

Lire `server/src/controllers/projectController.js` (et l'équivalent workshops si distinct) pour trouver : le paramètre `schoolYear` sur les endpoints de liste/stats, `getProjectStats`/`getWorkshopStats`, et les deux routes de relance email (`notify-pending-changes` en masse, `resend-notification` unitaire — chercher les noms exacts de route avec `grep -rn "notify-pending-changes\|resend-notification" server/src/routes`).

- [ ] **Step 2 : Ajouter les endpoints manquants**

Suivre le format tableau existant du fichier. Ajouter :
- Le paramètre `?schoolYear=YYYY-YYYY` sur les endpoints de liste et de stats existants (ne pas dupliquer la ligne du endpoint, juste noter le paramètre optionnel)
- Les endpoints stats s'ils ne sont pas déjà documentés
- `POST /api/projects/notify-pending-changes` (relance email masse, filtre "Modifs requises")
- `POST /api/projects/:id/resend-notification` (relance unitaire, 400 si le projet n'est pas en statut `pending_changes`)

- [ ] **Step 3 : Commit**

```bash
git add docs/api-projects-workshops.md
git commit -m "docs: document schoolYear filter and notification-resend endpoints"
```

---

### Task 6 : Mettre à jour `docs/inventory.md`

**Files:**
- Modify: `docs/inventory.md`

- [ ] **Step 1 : Lire le contrôleur source**

Chercher la route de vérification RFID : `grep -rn "verify-inventory" server/src/routes server/src/controllers`. Lire le contrôleur associé pour comprendre le comportement (comparaison scan vs attendu).

- [ ] **Step 2 : Ajouter la route manquante**

Ajouter `POST /api/tools/verify-inventory` au tableau de routes existant du fichier, dans le même style que les routes déjà listées (`GET /api/tools`, `POST /api/tools/:id/borrow`, `POST /api/tools/:id/return`).

- [ ] **Step 3 : Vérifier la section modèles**

Si le fichier a une section "Modèles de Base de Données" listant `Tool`/`Loan` mais pas `ToolReport`, et que Task 3 n'a pas déjà couvert `ToolReport` dans `docs/models.md`, ajouter `ToolReport` ici (lire `server/src/models/ToolReport.js` d'abord). Si `ToolReport` est déjà documenté quelque part (ici ou dans `models.md`), ne rien dupliquer.

- [ ] **Step 4 : Commit**

```bash
git add docs/inventory.md
git commit -m "docs: document POST /api/tools/verify-inventory"
```

---

### Task 7 : Note sur le sous-domaine API de prod (`installation.md` + `docker.md`)

**Files:**
- Modify: `docs/installation.md`
- Modify: `docs/docker.md`

**Interfaces:** aucune — ajout de documentation pure, pas de dépendance avec les autres tâches.

- [ ] **Step 1 : Ajouter la note dans `docs/installation.md`**

Là où `NEXT_PUBLIC_API_URL` est documenté pour le dev local (`http://localhost:5000`), ajouter une note du type :

```markdown
> **Prod** : le frontend (`hub.nice-tek.eu`) et l'API backend (`api-hub.nice-tek.eu`) sont
> servis sur deux sous-domaines distincts, contrairement au dev local où ils partagent la
> même origine. La valeur réelle de `NEXT_PUBLIC_API_URL` en prod vit dans `client/.env`
> sur le VPS (non versionné) — à vérifier là-bas avant de déboguer un appel API qui échoue
> en prod, plutôt que de supposer la même origine que le frontend.
```

- [ ] **Step 2 : Ajouter un renvoi léger dans `docs/docker.md`**

Une ligne suffit si le fichier mentionne `NEXT_PUBLIC_API_URL` ou le déploiement prod : renvoyer vers la note de `docs/installation.md` plutôt que de la dupliquer.

- [ ] **Step 3 : Commit**

```bash
git add docs/installation.md docs/docker.md
git commit -m "docs: note that prod frontend and API live on separate subdomains"
```

---

## Self-Review

**Couverture** : les 7 gaps identifiés dans l'audit (nouveau fichier api-print.md, architecture.md, models.md, frontend.md, api-projects-workshops.md, inventory.md, installation.md/docker.md) ont chacun une tâche. Les 3 fichiers jugés à jour par l'audit (`auth.md`, `workflows.md`, `api-simulated.md`) n'ont volontairement aucune tâche — pas de gap identifié, pas de churn inutile.

**Placeholders** : les tâches documentent la structure et les points de départ exacts (fichiers à lire, routes déjà confirmées dans Global Constraints), pas le texte final — inhérent à une tâche de documentation qui doit refléter le code réel plutôt qu'un contenu pré-écrit. Chaque tâche a une étape explicite de lecture du code source avant écriture, pour éviter l'invention de détails.

**Cohérence** : Task 3 et Task 6 peuvent toutes deux toucher `ToolReport` — signalé explicitement dans les deux tâches avec instruction de vérifier l'autre fichier d'abord pour éviter un doublon ; le risque résiduel (les deux l'ajoutent quand même) est bénin et détectable en revue finale.

**Hors scope assumé** : la sécurité (PR #3) et le rate-limiting (PR #10) n'ont pas de tâche — durcissement sans nouvelle surface API/modèle, jugé non documentable de façon utile. Le whitelabel (abandonné) n'a pas de tâche. La feature "Simulated Professional Work" n'a pas de tâche — aucun changement de code détecté dans l'audit depuis mars au-delà d'un fix mineur.
