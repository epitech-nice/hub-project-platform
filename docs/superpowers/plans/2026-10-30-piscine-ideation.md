# Module Piscine idéation Tech 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer les rendus par mail de la piscine idéation Tech 3 par un module du hub : dépôt d'idées en groupe, catalogue recherchable, fichiers versionnés, liens du jour 2, suivi et modération staff, purge de fin de saison.

**Architecture:** Nouvelle API Express `/api/ideas` (modèles `Idea`, `IdeationSettings`, `RosterEntry`, groupe embarqué dans `Idea`), fichiers stockés hors du dossier statique et servis par une route authentifiée, pages Next.js sous `/idees` et `/admin/idees` construites avec les composants `components/ui/*` existants. Livraison en 3 lots indépendants.

**Tech Stack:** Node/Express, Mongoose 6, multer (existant), `archiver` (nouveau, ZIP en streaming), `csv-parse` (nouveau, lot 3), Jest + Supertest + mongodb-memory-server, Next.js 12 (pages router), Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-30-piscine-ideation-design.md`

## Global Constraints

- Staff = rôle `admin` existant (`isAdmin`). Aucun nouveau rôle, aucune modification du modèle `User`.
- Toutes les routes `/api/ideas` sont derrière `authenticateToken`. Aucun fichier n'est servi par URL statique : stockage dans `server/storage/ideas/<ideaId>/`, jamais sous `/uploads`.
- Titre : 80 caractères max. Description : 50 mots max (plafond). Hashtags : 3 distincts minimum, normalisés en minuscules, sans espaces, `#` retiré.
- Logo : PNG, JPG ou SVG, 2 Mo max. Deck : PPTX ou PDF, 20 Mo max. Documents du jour 2 : liens `https://` uniquement, 10 max par idée, 2048 caractères max, libellé 1 à 80 caractères.
- Groupe : 3 à 6 membres créateur inclus ; un invité en attente occupe une place sur les 6 mais ne compte pas dans le minimum de 3.
- Date limite : stockée comme chaîne `YYYY-MM-DD`, valable jusqu'à la fin de ce jour en fuseau Europe/Paris. Après : création, modification, upload, liens et invitations refusés ; lecture et téléchargement restent ouverts. `unlockedUntil` d'une idée rouvre cette idée seulement.
- Erreurs : `ErrorResponse(message, statusCode)` avec messages en français, via `asyncHandler`. Tests dans `server/src/tests/` (`unit/` et `functional/ideation/`), helpers `createUser`, `createAdmin`, `authHeader` de `tests/helpers/auth.js`.
- Commits : texte brut, sans emoji ni ligne `Co-Authored-By` (règle du dépôt), préfixe `feat(ideation):` ou `test(ideation):`. Travailler sur une branche `feature/piscine-ideation`, jamais sur `master`.
- Le frontend ne se teste pas sur l'hôte (Node 25 casse Next.js 12) : vérification via Docker uniquement. Le client n'a pas de runner de tests : les tâches client se vérifient par une checklist manuelle dans Docker.

## Review Focus

1. Un hashtag saisi `#IA`, ` ia ` ou `#ia` doit désigner le même hashtag, et les 3 minimum doivent être distincts après normalisation (Task 1, Task 4).
2. Un fichier au bon suffixe mais au mauvais contenu (HTML renommé `.svg`, texte renommé `.pdf`, SVG avec `<script`) doit être refusé et ne rien laisser sur le disque (Task 3).
3. Un utilisateur non staff ne doit jamais obtenir le fichier d'une idée masquée, et un identifiant ou un nom de fichier contenant `../` ne doit jamais sortir de `storage/ideas/` (Task 5).
4. La date limite le dernier jour à 23:59 Paris, y compris juste après le passage à l'heure d'été (28/03/2027), et le déblocage d'une seule idée (Task 1, Task 4).
5. Deux invitations simultanées sur un groupe à 5 membres ne doivent pas produire un groupe à 7 (Task 7).

---

## Lot 1 — Dépôt, catalogue, groupes

### Task 1: Utilitaires purs

**Files:**
- Create: `server/src/utils/ideation.js`
- Test: `server/src/tests/unit/ideation.test.js`

**Interfaces:**
- Produces (toutes exportées de `utils/ideation.js`) :
  - `normalizeHashtag(raw: string): string | null` — `null` si vide ou caractères hors `[\p{L}\p{N}_-]` ou plus de 30 caractères.
  - `normalizeHashtags(raw: string[]): { tags: string[], error?: string }` — dédoublonne après normalisation, `error` si un élément est invalide.
  - `countWords(text: string): number`
  - `validateLink(raw: string): { ok: true, url: string } | { ok: false, error: string }`
  - `getCutoff(deadlineDate: string): Date` — instant de fin de journée Europe/Paris, exclusif.
  - `assertWritable(idea: { unlockedUntil?: Date }, settings: { deadlineDate?: string }, now?: Date): void` — lève `ErrorResponse("La date limite de dépôt est dépassée", 403)`.
  - `escapeRegex(s: string): string`

- [ ] **Step 1: Write the failing tests**, un `it` par ligne :
  - `normalizeHashtag`: `'#IA'`, `' ia '`, `'#ia'` donnent `'ia'` ; `''`, `'#'`, `'a b'`, `'<x>'` donnent `null` ; 31 caractères donne `null`.
  - `normalizeHashtags(['#IA','ia','#Web'])` donne `{ tags: ['ia','web'] }` (dédoublonné).
  - `countWords`: `''` donne 0, `'  un  deux\ntrois '` donne 3.
  - `validateLink`: `'https://drive.google.com/x'` ok ; refus pour `http://a.fr`, `javascript:alert(1)`, `https://u:p@a.fr`, `https://127.0.0.1/x`, `https://localhost/x`, `https://[::1]/x`, une URL de 2049 caractères ; l'hôte est mis en minuscules (`https://DRIVE.google.com/A` donne `https://drive.google.com/A`).
  - `getCutoff('2027-03-31')` est `2027-03-31T22:00:00.000Z` (23:59:59 Paris CEST + 1 s) ; `getCutoff('2027-03-27')` est `2027-03-27T23:00:00.000Z` (CET, avant le changement d'heure).
  - `assertWritable`: sans `deadlineDate` ne lève pas ; avec `deadlineDate: '2027-03-31'` et `now = 2027-03-31T21:59:59Z` ne lève pas, à `22:00:00Z` lève 403 ; avec `unlockedUntil` dans le futur ne lève pas.

- [ ] **Step 2: Run** `cd server && npx jest src/tests/unit/ideation.test.js` — Expected: FAIL (module absent).
- [ ] **Step 3: Implement** les fonctions ci-dessus. `getCutoff` : calculer le décalage Europe/Paris du lendemain 00:00 avec `Intl.DateTimeFormat` (`timeZone: 'Europe/Paris'`), sans bibliothèque de dates. `validateLink` : `new URL`, refuser si `protocol !== 'https:'`, si `username` ou `password`, si l'hôte est une IP (v4 ou v6) ou `localhost` ou sans point.
- [ ] **Step 4: Run** le fichier de test — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ideation): add pure helpers (hashtags, links, deadline)`.

### Task 2: Modèles

**Files:**
- Create: `server/src/models/Idea.js`, `server/src/models/IdeationSettings.js`
- Test: `server/src/tests/unit/ideaModel.test.js`

**Interfaces:**
- Produces:
  - `Idea` : `title` (String, requis, trim, max 80), `description` (String, requis), `hashtags: [String]`, `creator: { userId: ObjectId→User, name, email }`, `members: [{ userId, name, email, status: 'pending'|'accepted', invitedAt }]`, `logo: { versions: [FileVersion] }`, `deck: { versions: [FileVersion] }`, `day2Links: [{ label, url, author: { userId, name }, createdAt }]`, `hidden: Boolean` (défaut false), `unlockedUntil: Date`, `lastActivityAt: Date`, `timestamps`. `FileVersion` = `{ number: Number, storedName: String, originalName: String, size: Number, author: { userId, name }, createdAt: Date }`. Index : `members.userId`, `hashtags`, texte sur `title`.
  - Virtuals/méthodes sur `Idea` : `acceptedCount(): number`, `slotCount(): number` (acceptés + en attente), `isIncomplete(): boolean` (acceptés < 3), `currentVersion(kind: 'logo'|'deck')` renvoie la dernière version ou `null`.
  - `IdeationSettings` : `{ deadlineDate: String (/^\d{4}-\d{2}-\d{2}$/) }`, singleton via `IdeationSettings.getSingleton(): Promise<doc>` (crée si absent).

- [ ] **Step 1: Write failing tests**: titre de 81 caractères refusé ; `slotCount` compte les pending, `acceptedCount` non ; `isIncomplete` vrai à 2 acceptés, faux à 3 ; `currentVersion('deck')` renvoie la version de numéro le plus haut, `null` si aucune ; `getSingleton` appelé deux fois renvoie le même `_id` ; `deadlineDate: '31/03/2027'` refusé.
- [ ] **Step 2: Run** `npx jest src/tests/unit/ideaModel.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** les deux modèles selon l'interface.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ideation): add Idea and IdeationSettings models`.

### Task 3: Upload sécurisé

**Files:**
- Create: `server/src/utils/fileSignature.js`, `server/src/middleware/ideaUpload.js`
- Modify: `docker-compose.prod.yml` (volume `ideas_data:/app/storage/ideas` sur le service serveur + déclaration en fin de fichier), `docker-compose.yml` si le service serveur y monte un dossier
- Test: `server/src/tests/unit/fileSignature.test.js`, `server/src/tests/functional/ideation/upload.test.js`

**Interfaces:**
- Produces:
  - `detectFileType(buf: Buffer): 'png'|'jpeg'|'svg'|'pdf'|'zip'|null` — signatures `\x89PNG`, `\xFF\xD8\xFF`, `%PDF-`, `PK\x03\x04`, texte contenant `<svg` ; `svg` renvoie `null` si le contenu matche `/<script|\son\w+\s*=/i`.
  - `IDEA_FILE_RULES = { logo: { exts: ['.png','.jpg','.jpeg','.svg'], types: ['png','jpeg','svg'], maxSize: 2*1024*1024 }, deck: { exts: ['.pptx','.pdf'], types: ['pdf','zip'], maxSize: 20*1024*1024 } }`
  - `ideaUpload(kind: 'logo'|'deck')` — middleware Express : multer `diskStorage` vers `storage/ideas/<req.params.id>/` (nom `<Date.now()>-<aléatoire>-<nom nettoyé>`), contrôle de l'extension et de la taille, puis lecture des premiers octets avec `detectFileType` ; sur échec supprime le fichier et appelle `next(ErrorResponse(<message explicite>, 400))`. Champ de formulaire : `file`. Expose `req.file` comme multer. Un `.pptx` doit avoir la signature `zip`, un `.pdf` la signature `pdf`.
  - `storageDirFor(ideaId: string): string` — chemin absolu sous `server/storage/ideas`, lève si `ideaId` n'est pas un ObjectId valide (protection contre `../`).

- [ ] **Step 1: Write failing tests**:
  - unit : `detectFileType` reconnaît chaque signature ; HTML (`<html>`) donne `null` ; SVG contenant `<script>` donne `null` ; `storageDirFor('../x')` lève.
  - functional (route de test montée sur `express()` avec `ideaUpload('deck')`) : PDF valide accepté ; fichier texte nommé `a.pdf` refusé 400 et dossier vide ; PDF de 21 Mo refusé avec message contenant `20 Mo` ; `.exe` refusé ; logo SVG avec `<script` refusé ; logo PNG de 3 Mo refusé avec `2 Mo`.
- [ ] **Step 2: Run** `npx jest src/tests/unit/fileSignature.test.js src/tests/functional/ideation/upload.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** selon l'interface. Ne pas réutiliser `middleware/upload.js` (PDF seul, 10 Mo, dossier figé) ; s'inspirer de la fabrique de `middleware/printJobUpload.js`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ideation): add validated idea upload middleware and storage volume`.

### Task 4: Création, lecture, modification, catalogue

**Files:**
- Create: `server/src/middleware/ideaAccess.js`, `server/src/controllers/ideation/ideaController.js`, `server/src/routes/ideas.js`
- Modify: `server/src/app.js` (monter `app.use("/api/ideas", require("./routes/ideas"))` près des autres routes)
- Test: `server/src/tests/functional/ideation/ideas.test.js`, `server/src/tests/helpers/ideation.js`

**Interfaces:**
- Consumes: Task 1 (`normalizeHashtags`, `countWords`, `assertWritable`, `escapeRegex`), Task 2 (modèles).
- Produces:
  - `ideaAccess.js` : `loadIdea` (charge `req.idea`, 404 « Idée introuvable » si absente ou masquée pour un non-admin), `requireAcceptedMember`, `requireCreator`, `requireWritable` (appelle `assertWritable` avec `IdeationSettings.getSingleton()`). Les admins passent `requireAcceptedMember` uniquement sur les routes de modération (Task 9), pas ici.
  - Routes (statiques avant `/:id`) : `GET /settings` renvoie `{ deadlineDate }` ; `GET /hashtags?prefix=` renvoie jusqu'à 10 hashtags existants (idées non masquées) commençant par le préfixe normalisé ; `GET /me` renvoie `{ ideas: [{...idée, role: 'creator'|'member'}], invitations: [...] }` ; `GET /` catalogue ; `POST /` ; `GET /:id` ; `PUT /:id`.
  - `GET /` : paramètres `q` (titre ou nom d'un membre accepté, insensible à la casse, via `escapeRegex`), `tags` (liste séparée par des virgules, correspondance sur tous), `sort` (`date` | `title`, défaut `date` décroissant), `page`, `limit` (24 par défaut, 50 max). Réponse `{ success, data: IdeaCard[], total }`. `IdeaCard` = `{ _id, title, description, hashtags, hasLogo, memberCount, incomplete, createdAt }`. Les idées masquées sont exclues. Aucun email n'est renvoyé aux non-admins.
  - `POST /` corps `{ title, description, hashtags }` + deck envoyé ensuite (voir Task 5) : l'idée est créée avec le créateur membre `accepted`. Règles : `ideaCreate` refuse sans titre, description, ou moins de 3 hashtags distincts ; description de plus de 50 mots refusée (« La description ne doit pas dépasser 50 mots »). Le deck étant obligatoire, la création est en deux appels côté client : `POST /` puis `POST /:id/deck` ; l'idée n'apparaît dans le catalogue que si `deck.versions.length > 0` (filtre du catalogue), ma décision pour garder l'API simple.
  - `PUT /:id` : mêmes validations, réservé aux membres acceptés, protégé par `requireWritable`.
  - `helpers/ideation.js` : `createIdea(creator, overrides?)` renvoie une idée valide avec un deck factice déjà versionné.

- [ ] **Step 1: Write failing tests**, `it` par ligne :
  - création : sans titre 400 ; avec 2 hashtags 400 ; avec `['#IA','ia','web']` 400 (seulement 2 distincts) ; description de 51 mots 400 ; création valide renvoie 201 et hashtags normalisés (`#IA`, `Web`, `x` donnent `ia`, `web`, `x`).
  - catalogue : sans deck, l'idée n'apparaît pas ; idée masquée absente pour un étudiant ; `q` retrouve par titre et par nom d'un membre, `q=.*` ne renvoie pas tout (regex échappée) ; `tags=ia,web` exige les deux ; `sort=title` trie par titre ; la réponse n'a jamais de champ `email`.
  - accès : étudiant non membre `PUT /:id` donne 403 ; membre en attente donne 403 ; après la date limite (`deadlineDate` dans le passé) `PUT` et `POST` donnent 403 ; avec `unlockedUntil` futur, `PUT` réussit pour cette idée mais pas pour une autre ; `GET /:id` d'une idée masquée donne 404 pour un étudiant.
  - `GET /hashtags?prefix=I` renvoie `ia` si présent, pas ceux des idées masquées.
  - `GET /me` liste mes idées avec rôle et mes invitations en attente.
- [ ] **Step 2: Run** `npx jest src/tests/functional/ideation/ideas.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** contrôleur, middlewares, routes, montage. Dénormaliser `name` et `email` des membres à l'invitation. Valider le titre avec `[...title].length` (points de code) en plus du `maxlength` Mongoose. Index texte inutile si `q` est une regex : choisir la regex, volume faible.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ideation): add idea CRUD, catalogue search and hashtag suggestions`.

### Task 5: Fichiers versionnés et téléchargement

**Files:**
- Create: `server/src/controllers/ideation/fileController.js`
- Modify: `server/src/routes/ideas.js`
- Test: `server/src/tests/functional/ideation/files.test.js`

**Interfaces:**
- Consumes: Task 3 (`ideaUpload`, `storageDirFor`), Task 4 (`loadIdea`, `requireAcceptedMember`, `requireWritable`).
- Produces:
  - `POST /:id/logo` et `POST /:id/deck` (champ `file`) : ajoutent une `FileVersion` (`number` = précédent + 1, `author` = utilisateur) et mettent à jour `lastActivityAt` ; renvoient l'idée.
  - `GET /:id/:kind(logo|deck)/:version?` : sans `version` renvoie la version courante. Réponse en flux (`fs.createReadStream`) avec `Content-Disposition: attachment; filename*=UTF-8''<nom d'origine>`, `X-Content-Type-Options: nosniff`, `Content-Type` déduit du type détecté (jamais du client). Exception : un logo `png`/`jpeg` est servi avec `Content-Disposition: inline` pour l'affichage des cartes. Un SVG est toujours `attachment`.
  - Les fichiers d'une idée masquée sont 404 pour un non-admin. Le chemin est toujours `path.join(storageDirFor(id), version.storedName)` avec contrôle que le chemin résolu reste dans ce dossier.
  - En cas d'échec d'écriture en base après l'upload, le fichier du disque est supprimé.

- [ ] **Step 1: Write failing tests**, `it` par ligne : membre dépose un deck puis un second, versions numérotées 1 et 2, les deux téléchargeables et la courante par défaut est la 2 ; non-membre `POST` donne 403 ; après la date limite donne 403 ; téléchargement par un utilisateur connecté quelconque réussit (RG6) ; sans token 401 ; idée masquée donne 404 pour un étudiant et 200 pour un admin ; un `storedName` modifié en base en `../../etc/passwd` ne sort pas (404, aucun fichier lu) ; SVG servi avec `attachment` et `nosniff` ; PNG avec `inline` ; version inexistante 404.
- [ ] **Step 2: Run** `npx jest src/tests/functional/ideation/files.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** contrôleur et routes. Le catalogue (Task 4) n'affiche l'idée qu'une fois le deck présent : vérifier avec le test de création.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ideation): add versioned logo/deck upload and authenticated download`.

### Task 6: Liens du jour 2

**Files:**
- Create: `server/src/controllers/ideation/linkController.js`
- Modify: `server/src/routes/ideas.js`
- Test: `server/src/tests/functional/ideation/links.test.js`

**Interfaces:**
- Consumes: Task 1 (`validateLink`), Task 4 (middlewares).
- Produces: `POST /:id/links` corps `{ label, url }` ; `DELETE /:id/links/:linkId`. Réservés aux membres acceptés, `requireWritable`. Refus : libellé vide ou de plus de 80 caractères, URL invalide (message de `validateLink`), même URL normalisée déjà présente (« Ce lien est déjà ajouté »), 11e lien (« 10 liens maximum »).

- [ ] **Step 1: Write failing tests**, `it` par ligne : ajout valide renvoie le lien normalisé (hôte en minuscules) ; `http://` refusé ; `javascript:` refusé ; doublon refusé ; 11e refusé ; libellé de 81 caractères refusé ; membre en attente 403 ; après la date limite 403 ; suppression d'un lien par un membre OK.
- [ ] **Step 2: Run** `npx jest src/tests/functional/ideation/links.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** contrôleur et routes. Aucune requête sortante vers l'URL.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ideation): add day-2 links`.

### Task 7: Groupe et invitations

**Files:**
- Create: `server/src/controllers/ideation/memberController.js`
- Modify: `server/src/routes/ideas.js`, `server/src/routes/users.js` (route `GET /search`), `server/src/app.js` si un limiteur dédié est monté
- Test: `server/src/tests/functional/ideation/members.test.js`

**Interfaces:**
- Consumes: Task 2 (`slotCount`), Task 4 (middlewares).
- Produces:
  - `GET /api/users/search?q=` (authentifié) : 3 caractères minimum (sinon 400), recherche sur `name` ou sur la partie locale de l'email, 10 résultats max, renvoie `[{ _id, name, login }]` où `login` = partie locale de l'email. Jamais l'email complet ni `microsoftId`. Limiteur de débit dédié (`express-rate-limit`, 30 requêtes par minute et par utilisateur).
  - `POST /:id/members` corps `{ userId }` (créateur seul, `requireWritable`) : ajoute `{ status: 'pending' }`. Refus : utilisateur inconnu, déjà membre ou invité, groupe plein (`slotCount() >= 6` : « Un groupe ne peut pas dépasser 6 membres »). L'ajout est atomique : `Idea.updateOne({ _id, $expr: { $lt: [{ $size: '$members' }, 6] }, 'members.userId': { $ne: userId } }, { $push })` et le nombre de documents modifiés décide du refus.
  - `POST /:id/invitation/accept` et `POST /:id/invitation/decline` (invité seul, `requireWritable`) : `accept` passe en `accepted`, `decline` retire l'entrée.
  - `DELETE /:id/members/:userId` : le créateur retire n'importe quel membre sauf lui-même ; un membre peut se retirer lui-même ; le créateur ne peut jamais être retiré (« Le créateur ne peut pas quitter son idée »).

- [ ] **Step 1: Write failing tests**, `it` par ligne : recherche à 2 caractères 400 ; résultat sans champ `email` ni `microsoftId` ; inviter donne `pending` et un invité en attente ne peut pas modifier l'idée (403) ; accepter donne les droits ; refuser retire l'entrée ; inviter deux fois le même étudiant refusé ; non-créateur ne peut pas inviter (403) ; groupe de 6 (acceptés et en attente) refuse la 7e avec le message exact ; **deux invitations lancées en parallèle (`Promise.all`) sur un groupe à 5 donnent exactement un succès et un refus, taille finale 6** ; créateur retire un membre, qui perd ses droits immédiatement ; retirer le créateur donne 400 ; un membre se retire lui-même ; idée soumise à 1 ou 2 acceptés : `incomplete` vrai dans la fiche ; après la date limite l'invitation est refusée.
- [ ] **Step 2: Run** `npx jest src/tests/functional/ideation/members.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** contrôleur, routes, limiteur.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ideation): add group invitations and student search`.

### Task 8: Interface étudiante

**Files:**
- Create: `client/src/lib/ideation.js` (`normalizeHashtag`, `countWords`, constantes de formats et tailles, miroir de `utils/ideation.js` pour le retour immédiat dans le formulaire ; le serveur reste l'autorité), `client/src/lib/download.js` (`fetchBlob(path, token): Promise<Blob>`, `saveBlob(blob, filename)`), `client/src/components/ideas/IdeaCard.js`, `client/src/components/ideas/AuthImage.js` (affiche un logo en le chargeant avec le token, `<img src>` ne pouvant pas envoyer l'en-tête `Authorization` ; SVG remplacé par le visuel par défaut), `client/src/components/ideas/HashtagInput.js` (auto-complétion via `/api/ideas/hashtags`), `client/src/components/ideas/MemberManager.js`, `client/src/components/ideas/LinkList.js`, `client/src/components/ideas/VersionHistory.js`
- Create (pages) : `client/src/pages/idees/index.js` (catalogue), `client/src/pages/idees/nouvelle.js`, `client/src/pages/idees/mes-idees.js`, `client/src/pages/idees/[id]/index.js` (fiche), `client/src/pages/idees/[id]/modifier.js`
- Modify: `client/src/components/layout/AppHeader.js` (entrée « Idéation » aux deux endroits où « Simulated » est déclaré : liens `/idees`, `/idees/nouvelle`, `/idees/mes-idees`)

**Interfaces:**
- Consumes: l'API des tasks 4 à 7 ; `useApi` (rappel : `get` n'est pas mémorisé, ne jamais le mettre dans les dépendances d'un `useEffect`), `FileInput`, `FormField`, `Input`, `Textarea`, `FilterChips`, `Pagination`, `BentoGrid`, `EmptyState`, `Skeleton`, `Modal`, `Badge`.
- Produces: pages décrites dans la section « Interface » du spec : barre de recherche texte, filtres hashtag combinables avec compteur et bouton de réinitialisation, tri date ou titre ; formulaire dont le bouton reste inactif tant que titre, description (compteur de mots à la frappe), deck et 3 hashtags distincts manquent, date limite affichée (`/api/ideas/settings`), après validation redirection vers la fiche ; fiche avec membres, « groupe incomplet » sous 3 acceptés, deck et historique des versions téléchargeables, liens avec nom de domaine affiché, `rel="noopener noreferrer nofollow"` et le message d'aide sur les liens privés ; « Mes idées » avec rôle et section « Invitations » (accepter ou refuser) ; aucun bouton de modification pour un non-membre.

- [ ] **Step 1: Implement** les pages et composants. Respecter les skills de design du dépôt (design tokens, `Plus Jakarta Sans`, dark mode par défaut) en lisant `~/.claude/skills/design-inspiration/SKILL.md` avant d'écrire du code visuel.
- [ ] **Step 2: Vérifier dans Docker** (`docker compose up --build`) avec deux comptes étudiants et un compte admin : checklist manuelle — bouton inactif tant que le formulaire est incomplet ; 3e hashtag `#IA` après `ia` refusé comme doublon ; PDF de 21 Mo refusé avec message ; deck PDF accepté puis remplacé, deux versions visibles ; invitation visible chez l'invité, acceptation donne le bouton « modifier » ; un 3e compte non membre ne voit aucun bouton de modification ; lien `http://` refusé ; recherche « nom d'étudiant » retrouve l'idée ; logo PNG affiché, logo SVG remplacé par le visuel par défaut.
- [ ] **Step 3: Commit** `feat(ideation): add student pages (catalogue, form, detail, my ideas)`.

---

## Lot 2 — Staff

### Task 9: Suivi, masquage, suppression, modération, date limite

**Files:**
- Create: `server/src/controllers/ideation/adminController.js`
- Modify: `server/src/routes/ideas.js`
- Test: `server/src/tests/functional/ideation/admin.test.js`

**Interfaces:**
- Consumes: Task 2 à 7.
- Produces (toutes `authenticateToken` + `isAdmin`, déclarées avant `/:id`) :
  - `GET /admin` : tableau de suivi, paramètres `q` (titre, nom ou email d'un membre), `hasDeck`, `hasLinks` (`true`/`false`). Ligne = `{ _id, title, creator, memberCount, incomplete, hasDeck, linkCount, linkDomains, hidden, lastActivityAt }`. Inclut les idées masquées et celles sans deck.
  - `PATCH /admin/:id/hide` corps `{ hidden: boolean }`.
  - `DELETE /admin/:id` : supprime le document puis le dossier `storageDirFor(id)` (récursif) ; renvoie 200 même si le dossier n'existe pas.
  - `PATCH /admin/:id/unlock` corps `{ until: ISO date }` ou `{ until: null }` pour reverrouiller.
  - `PUT /admin/deadline` corps `{ deadlineDate: 'YYYY-MM-DD' | null }`.
  - Modération : `PUT /admin/:id` (titre, description), `DELETE /admin/:id/logo`, `DELETE /admin/:id/deck` (supprime toutes les versions et les fichiers, décision « supprime tout »), `DELETE /admin/:id/links/:linkId`, `PUT /admin/:id/links/:linkId` (libellé). Ces routes ne sont pas bloquées par la date limite.

- [ ] **Step 1: Write failing tests**, `it` par ligne : un étudiant reçoit 403 sur chaque route admin ; `GET /admin` voit une idée masquée et une idée sans deck ; `q` retrouve par nom ou email de membre ; `hasDeck=false` filtre ; masquer retire l'idée du catalogue étudiant et la restitue après `hidden:false` ; suppression efface le document et le dossier (`fs.existsSync` faux) ; suppression d'un deck supprime toutes les versions et les fichiers ; modération possible après la date limite ; `PUT /admin/deadline` refuse `2027-3-1` ; `unlock` réouvre une idée précise.
- [ ] **Step 2: Run** `npx jest src/tests/functional/ideation/admin.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** contrôleur et routes.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ideation): add staff tracking, moderation and deadline settings`.

### Task 10: Export ZIP des decks

**Files:**
- Modify: `server/package.json` (dépendance `archiver`), `server/src/controllers/ideation/adminController.js`, `server/src/routes/ideas.js`
- Test: `server/src/tests/functional/ideation/export.test.js`

**Interfaces:**
- Produces: `GET /admin/export?includeHidden=true|false` (admin) : réponse `application/zip` en streaming (`archiver` piped sur `res`, jamais en mémoire), une entrée par idée contenant un deck, nommée `<titre assaini>.<ext>` avec suffixe `-2`, `-3` en cas de doublon ; version courante uniquement ; idées masquées exclues par défaut.

- [ ] **Step 1: Write failing tests**, `it` par ligne : réponse 200 avec `Content-Type` ZIP et premier octets `PK` ; le tampon contient le nom de fichier de chaque deck courant ; une idée masquée est absente par défaut et présente avec `includeHidden=true` ; deux idées de même titre donnent deux entrées distinctes ; un titre avec `/` ou `..` ne produit pas de chemin (assaini) ; étudiant 403. Lecture binaire via `.buffer(true).parse(...)`.
- [ ] **Step 2: Run** `npx jest src/tests/functional/ideation/export.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** (`cd server && npm install archiver`), assainir les noms avec le même nettoyage que les uploads.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ideation): add streaming ZIP export of current decks`.

### Task 11: Purge de fin de saison

**Files:**
- Modify: `server/src/controllers/ideation/adminController.js`, `server/src/routes/ideas.js`
- Test: `server/src/tests/functional/ideation/purge.test.js`

**Interfaces:**
- Produces: `DELETE /admin/purge` corps `{ confirm: 'PURGER' }` (admin) : supprime toutes les `Idea`, tout le contenu de `server/storage/ideas/` (sans supprimer le dossier racine), toutes les `RosterEntry` (si le modèle existe) et met `deadlineDate` à `null`. Refus 400 si `confirm` est différent de `PURGER`. Renvoie les compteurs `{ ideas, files }`.

- [ ] **Step 1: Write failing tests**, `it` par ligne : sans `confirm` 400 et rien supprimé ; avec `confirm: 'purger'` 400 (casse exacte) ; purge efface documents et dossiers d'idées, remet `deadlineDate` à `null` ; le dossier racine existe encore ; étudiant 403.
- [ ] **Step 2: Run** `npx jest src/tests/functional/ideation/purge.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement**. Ne supprimer que sous `storageDirFor`'s racine, en listant ses enfants.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ideation): add end-of-season purge`.

### Task 12: Interface staff

**Files:**
- Create: `client/src/pages/admin/idees/index.js`
- Modify: `client/src/components/layout/AppHeader.js` (lien « Admin idéation » visible pour `isAdmin`)

**Interfaces:**
- Consumes: API des tasks 9 à 11, `DataTable`, `TableToolbar`, `Tabs`, `Modal`, `Dialog`, `KpiCard`, `Switch`.
- Produces: page à onglets (`Tabs`) ; onglet **Suivi** : tableau (idée, créateur, membres, deck, liens et domaines, dernière modification), recherche, filtres deck et liens, indicateurs visuels pour groupe incomplet et idée sans deck, actions masquer, supprimer (confirmation explicite), modérer, débloquer, bouton d'export ZIP (option « inclure les idées masquées »), champ de date limite, bouton « Purger la saison » avec saisie du mot `PURGER`. L'onglet « Sans projet » est ajouté au lot 3.

- [ ] **Step 1: Implement** la page.
- [ ] **Step 2: Vérifier dans Docker** (admin) : checklist manuelle — le tableau liste tout y compris les idées masquées ; la recherche par nom d'étudiant filtre ; masquer retire la carte du catalogue étudiant ; supprimer demande confirmation et efface ; l'export télécharge un ZIP contenant les decks ; la date limite modifiée bloque un dépôt étudiant ; la purge refuse un mot incorrect.
- [ ] **Step 3: Commit** `feat(ideation): add staff dashboard`.

---

## Lot 3 — Promotion (CSV)

Ce lot dépend du format réel du fichier (à confirmer par le demandeur : nom, prénom, email supposés). Il ne bloque pas les lots 1 et 2.

### Task 13: Import CSV et liste « sans projet »

**Files:**
- Create: `server/src/models/RosterEntry.js`, `server/src/controllers/ideation/rosterController.js`
- Modify: `server/package.json` (dépendance `csv-parse`), `server/src/routes/ideas.js`
- Test: `server/src/tests/functional/ideation/roster.test.js`

**Interfaces:**
- Produces:
  - `RosterEntry` : `{ email (unique, minuscules), lastName, firstName, importedAt }`.
  - `parseRosterCsv(buf: Buffer): { entries: { email, lastName, firstName }[], duplicates: number, invalid: { line: number, value: string }[], error?: 'NO_EMAIL_COLUMN' | 'TOO_LARGE' }` exportée de `rosterController.js` : gère le BOM UTF-8, le séparateur `,` ou `;` (déterminé sur la ligne d'en-tête), les en-têtes insensibles à la casse et aux accents (`email`, `mail`, `nom`, `prenom`, `name`), 2000 lignes max ; sans colonne email retourne `error: 'NO_EMAIL_COLUMN'`.
  - `POST /admin/roster/preview` (multipart, champ `file`, 1 Mo max, mémoire) : renvoie l'analyse sans rien enregistrer. `POST /admin/roster` (même fichier, renvoyé par le client) remplace la liste. `DELETE /admin/roster`.
  - `GET /admin/roster/without-project?q=` : pour chaque entrée, statut `never_connected` (aucun `User` avec cet email), `no_project` (compte sans groupe accepté et sans invitation), `invited_only` (invité sans acceptation) ; les entrées avec au moins un groupe accepté sont exclues. Réponse `{ counts: { never_connected, no_project, invited_only }, data: [...] }`, filtrable par `q` (nom ou email). Réservé admin, jamais exposé aux étudiants.

- [ ] **Step 1: Write failing tests**, `it` par ligne : CSV avec BOM et `;` analysé ; en-têtes `Mail`, `Prénom` reconnus ; fichier sans colonne email donne `NO_EMAIL_COLUMN` (400 avec message clair) ; email invalide listé avec son numéro de ligne ; doublon compté une fois ; aperçu n'enregistre rien ; import remplace (une ancienne entrée absente du nouveau fichier disparaît) ; fichier de 1,1 Mo refusé ; étudiant 403 ; `without-project` classe correctement les trois statuts et exclut un étudiant avec un groupe accepté ; l'email en majuscules dans le CSV est rapproché du compte en minuscules ; la purge (Task 11) vide `RosterEntry`.
- [ ] **Step 2: Run** `npx jest src/tests/functional/ideation/roster.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** (`cd server && npm install csv-parse`, API synchrone `csv-parse/sync`, ne jamais évaluer le contenu).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ideation): add promotion CSV import and students-without-project list`.

### Task 14: Onglet « Sans projet »

**Files:**
- Modify: `client/src/pages/admin/idees/index.js`

**Interfaces:**
- Consumes: Task 13, `FileInput` (accept `.csv`, 1 Mo), `Modal`, `KpiCard`, `DataTable`.
- Produces: onglet « Sans projet » : trois compteurs, tableau (nom, email, statut), recherche, bouton « Importer la promotion » ouvrant une modale (choix du fichier, aperçu des lignes valides, doublons et invalides listés avec numéro de ligne, confirmation qui rappelle que la liste précédente est remplacée), message explicite pour `NO_EMAIL_COLUMN`. Un statut `never_connected` affiche « Jamais connecté : ne peut pas être invité avant sa première connexion ».

- [ ] **Step 1: Implement** l'onglet.
- [ ] **Step 2: Vérifier dans Docker** (admin) : import d'un CSV `;` avec BOM, aperçu puis confirmation ; réimport avec moins de lignes remplace la liste ; CSV sans email affiche l'erreur ; les trois statuts apparaissent après connexion d'un compte test et acceptation d'une invitation.
- [ ] **Step 3: Commit** `feat(ideation): add students-without-project tab and CSV import dialog`.

---

## Auto-revue

- **Couverture du spec** : soumission (T4, T5, T8), hashtags (T1, T4), groupes et invitations (T7), versions (T5), liens (T1, T6), catalogue et recherche (T4, T8), date limite et déblocage (T1, T4, T9), vue staff, masquage, suppression, modération (T9, T12), export ZIP (T10), purge (T11), import CSV et « sans projet » (T13, T14), volume de stockage (T3).
- **Cohérence des noms** : `slotCount`/`acceptedCount`/`isIncomplete`/`currentVersion` (T2) réutilisés tels quels en T4, T7 ; `storageDirFor` (T3) en T5, T9, T11 ; `assertWritable` (T1) via `requireWritable` (T4) en T5, T6, T7.
- **Écart au spec** : le spec dit que la recherche d'étudiants ne renvoie « jamais l'email » mais le besoin de rechercher par « login » impose de renvoyer la partie locale de l'email (`login`) ; l'email complet n'est jamais renvoyé, mais le login équivaut presque à l'email pour un domaine unique. À valider avec le demandeur.
- **Point hors plan à vérifier avant mise en production** : `docker-compose.prod.yml` ne persiste que `/app/uploads` ; `server/storage/` (déjà utilisé par l'impression) n'y a pas de volume. Vérifier sur le VPS si les jobs d'impression survivent à un redémarrage de conteneur, indépendamment de ce module.
