# Module Piscine idéation Tech 3 — conception

Date : 2026-10-30
Source : spécification d'Eric (« Piscine idéation Tech 3 : spécifications du module », 29/10/2026), amendée par les décisions prises avec le demandeur le 30/10/2026.

## Intention

Remplacer les rendus par mail de la première semaine de la piscine idéation Tech 3 par un dépôt centralisé sur le hub : chaque étudiant ou groupe publie une idée (titre, logo, description, deck, hashtags), les documents du jour 2 (Start-up Day) y sont rattachés, et tous les utilisateurs du hub peuvent parcourir le catalogue.

Le staff n'évalue pas les idées via le module : il vérifie que les étudiants travaillent, en regardant leur contenu. L'outil doit donc rendre visible qui a rendu quoi, et quand.

Le module est saisonnier : la piscine a lieu en mars et se termine fin mars (mars 2027 pour cette première édition), soit environ un mois chaque année. Après la date limite, les étudiants disposent d'une à deux semaines pour récupérer leurs fichiers, puis le staff purge tout, y compris la liste de la promotion importée.

Calendrier : la spec d'Eric parle de « fin novembre 2026 » ; cette date est remplacée par la fin mars 2027. Il reste plusieurs mois avant l'ouverture, ce qui permet de livrer en deux lots et de tester sur des comptes réels avant la piscine.

## Objectifs

- Soumission d'une idée en une seule page, sans mail.
- Catalogue consultable par tout utilisateur connecté, avec recherche et filtre par hashtag.
- Gestion de groupe de 3 à 6 membres, avec invitation à confirmer.
- Versioning des fichiers du deck et du logo (aucune version écrasée).
- Vue staff de suivi, export ZIP des decks, modération, purge de fin de saison.
- Réutiliser l'existant : authentification Microsoft, rôle `admin`, design system `client/src/components/ui/*`.

## Hors périmètre

- Authentification (déjà gérée), notifications (aucune : ni confirmation de dépôt, ni rappel, ni alerte d'invitation).
- Contrôle du nombre de slides, quota total par idée, journal des suppressions.
- Transfert du rôle de créateur.
- Conservation à long terme : tout est effacé après la saison.

## Anti-objectifs (échec même si « ça marche »)

- Un fichier accessible par URL sans compte hub (contredit RG6).
- Un étudiant extérieur au groupe qui peut modifier une idée.
- Un SVG ou un document exécuté dans l'origine du hub.
- Un annuaire d'étudiants (noms, emails) interrogeable librement.

## Décisions prises avec le demandeur

| Sujet | Décision |
|---|---|
| Staff | Les `admin` actuels, aucun nouveau rôle |
| Après la date limite | Dépôts et modifications bloqués |
| Fichiers | Logo et deck téléversés et versionnés. Documents du jour 2 : liens uniquement |
| Ajout de membre | Demande une confirmation de l'étudiant invité |
| Modération | Le staff supprime tout (idée, groupe, fichiers, historique), sans trace |
| Durée de vie | La piscine a lieu en mars (fin fin mars), puis 1 à 2 semaines de récupération, puis purge |
| Recherche | Par nom de projet et par nom d'étudiant, pour le staff comme pour les étudiants |
| Promotion | Import d'un CSV de la promotion Tech 3 par le staff. Seuls ces étudiants sont suivis pour la liste « sans projet » |
| Visibilité | Idées et fichiers visibles par tous les utilisateurs connectés du hub, toutes promotions confondues (voulu) |

## Données

Nouveaux modèles Mongoose, dans le style de `server/src/models/` :

- **Idea** : `title` (80 car. max), `description` (50 mots max), `hashtags[]` (normalisés), `creator` (ref User), `members[]` (`user`, `status` : `pending` | `accepted`, `invitedAt`), `logo` et `deck` (chacun : `versions[]` avec `number`, `storedName`, `originalName`, `size`, `author`, `createdAt`), `day2Links[]` (`label`, `url`, `author`, `createdAt`), `hidden` (booléen), `unlockedUntil` (date, déblocage staff), `createdAt`, `updatedAt`.
- **IdeationSettings** (document unique) : `deadline` (date).
- **RosterEntry** : `email` (normalisé en minuscules, unique), `lastName` et `firstName` (facultatifs), `importedAt`. C'est la liste de la promotion Tech 3, séparée de `User` : un étudiant de la liste n'a pas forcément déjà ouvert une session sur le hub, donc n'a pas forcément de `User`. Le lien se fait par comparaison de l'email avec `User.email`.

Le groupe est embarqué dans `Idea` : RG2 impose un groupe par idée, une collection séparée n'apporte rien. Index : `members.user`, `hashtags`, texte sur `title`.

## Règles métier

- Création : titre, description, deck et au moins 3 hashtags distincts obligatoires (EF1, EF7). Le créateur est membre accepté d'office.
- Hashtags : minuscules, sans espaces, `#` retiré (EF6). L'auto-complétion agrège les hashtags des idées existantes (EF5).
- Description : 50 mots maximum, compteur affiché pendant la saisie (ma décision : la spec dit « 50 mots » sans préciser plafond ou cible).
- Groupe : 3 à 6 membres créateur inclus. Moins de 3 : soumission possible, la fiche affiche « groupe incomplet ». Plafond de 6 refusé avec message.
- Invitation : le créateur recherche un étudiant et l'invite. L'invité voit l'invitation dans une section « Invitations » de sa page « Mes idées » et l'accepte ou la refuse. Un membre en attente n'a aucun droit. Ma décision : un invité en attente occupe une place sur les 6 mais ne compte pas dans le minimum de 3.
- Droits : les membres acceptés modifient l'idée, remplacent les fichiers, ajoutent des liens. Seul le créateur invite et retire. Le créateur seul dans le groupe ne peut pas partir.
- Suppression : seul le staff supprime une idée (ma décision : la spec ne tranchait pas). Un créateur ne peut pas supprimer sa propre idée.
- Versioning : chaque remplacement de logo ou de deck ajoute une version (numéro, auteur, date). La version courante est servie par défaut, les précédentes restent téléchargeables (EF16, EF17).
- Documents du jour 2 : liste de liens, sans versioning (règles détaillées dans la section « Liens du jour 2 »).
- Date limite : après `deadline` (fin de journée, fuseau Europe/Paris), création, modification, téléversement et ajout ou retrait de lien sont refusés. Lecture et téléchargement restent ouverts pour la période de récupération. Le staff peut débloquer une idée précise via `unlockedUntil` (ma décision).
- Une seule date limite pour la semaine 1 et le jour 2 (hypothèse de la spec, à confirmer par Eric). Elle se règle depuis l'interface staff, en mars 2027.

## API

Préfixe `/api/ideas`, toutes les routes derrière `authenticateToken`.

- Étudiants : `POST /`, `GET /` (catalogue, paramètres `q`, `tags`, `sort`, pagination), `GET /me`, `GET /:id`, `PUT /:id`, `POST /:id/logo`, `POST /:id/deck`, `GET /:id/logo|deck/:version`, `POST|DELETE /:id/links`, `POST /:id/members`, `DELETE /:id/members/:userId`, `POST /:id/invitation/accept|decline`, `GET /hashtags?prefix=`.
- Recherche d'étudiants pour l'invitation : `GET /api/users/search?q=`, 3 caractères minimum, renvoie uniquement identifiant et nom d'affichage, jamais l'email ni l'ID Microsoft, limiteur de débit dédié (ma décision).
- Staff, promotion : `POST /admin/roster/preview` (analyse du CSV, aucun enregistrement), `POST /admin/roster` (confirmation et remplacement), `GET /admin/roster/without-project` (liste « sans projet » avec statut), `DELETE /admin/roster`.
- Staff (`isAdmin`) : `GET /admin` (tableau de suivi), `PATCH /:id/hide`, `DELETE /:id`, `PUT /admin/deadline`, `PATCH /:id/unlock`, `GET /admin/export` (ZIP en streaming), `DELETE /admin/purge`, modération de contenu (modifier la description, supprimer logo, deck ou lien).

## Fichiers

- Stockage dans `server/storage/ideas/`, hors du dossier statique `/uploads`. Aucun fichier n'est servi par URL directe : téléchargement via route authentifiée qui streame le fichier et vérifie que l'idée n'est pas masquée (sauf staff).
- Validation à l'upload : extension, taille (logo 2 Mo ; deck 20 Mo), et signature binaire (magic bytes), pas seulement le `Content-Type` (le `fileFilter` actuel de `middleware/upload.js` ne vérifie que le mimetype). Message d'erreur explicite (EF2).
- SVG : servi en `Content-Disposition: attachment` avec `X-Content-Type-Options: nosniff`, jamais en inline. Pour l'affichage du logo sur les cartes, ma décision : raster (PNG/JPG) affiché normalement, SVG nettoyé ou remplacé par le visuel par défaut.
- Export ZIP : généré en streaming (nouvelle dépendance `archiver`), version courante de chaque deck, nommée d'après le titre, idées masquées exclues par défaut (EF20).
- Fabrique multer paramétrée sur le modèle de `createGcodeUpload` (`middleware/printJobUpload.js`), non réutilisation de `upload.js` (PDF seul, 10 Mo, dossier figé).

## Liens du jour 2

Les documents du Start-up Day sont déposés sous forme de liens vers un service externe (Drive, OneDrive, Canva, Notion, Figma, GitHub, etc.), pas de fichiers. Cela retire du module le stockage, le contrôle de format et le versioning pour cette partie. En contrepartie, le hub ne contrôle ni le contenu, ni l'accessibilité, ni les modifications faites après la date limite.

**Données.** Chaque lien : `label` (obligatoire, 1 à 80 caractères), `url` (obligatoire), `author` (ref User), `createdAt`. Pas d'historique : modifier un lien le remplace, supprimer un lien le retire.

**Validation côté serveur (ma décision)** :
- Schéma `https://` uniquement. `http://`, `javascript:`, `data:`, `file:` et autres sont refusés.
- 2048 caractères maximum. Pas d'identifiants dans l'URL (`https://user:pass@...` refusé).
- Hôte obligatoire, nom de domaine uniquement : les adresses IP littérales, `localhost` et les domaines internes sont refusés.
- URL normalisée avant enregistrement (hôte en minuscules, espaces retirés) ; un même lien ne peut pas être ajouté deux fois à la même idée.
- 10 liens maximum par idée.
- Le serveur ne récupère jamais le contenu d'un lien (pas de vérification de disponibilité, pas d'aperçu côté serveur). Cela évite toute requête sortante déclenchée par un utilisateur, donc tout risque SSRF. La conséquence assumée : un lien mort ou privé n'est pas détecté.

**Affichage.**
- Chaque lien s'affiche avec son libellé et, à côté, le nom de domaine réel, pour que le lecteur voie où il va. Les domaines connus (Drive, OneDrive, Canva, Notion, Figma, GitHub) reçoivent une pastille ou une icône, purement cosmétique.
- Ouverture dans un nouvel onglet avec `rel="noopener noreferrer nofollow"`.
- Ces liens sont affichés sur la fiche dans une section distincte du deck (EF4).
- Message d'aide sous le champ : « Vérifiez que le lien est lisible par toute personne connectée. Un lien privé ne pourra pas être ouvert par les autres étudiants ni par le staff. »

**Droits.**
- Les membres acceptés du groupe ajoutent, modifient et retirent les liens ; les invités en attente n'ont aucun droit.
- Après la date limite, aucun ajout ni retrait (sauf déblocage staff), pour limiter les changements de dernière minute. Le contenu derrière un lien reste modifiable par son propriétaire : le hub ne peut pas l'empêcher et l'indique aux étudiants dans l'interface (« le contenu du lien n'est pas figé par le hub »).
- Le staff peut supprimer un lien inapproprié ou modifier son libellé (modération).

**Suivi staff.** Le tableau de suivi affiche le nombre de liens et le domaine de chacun, pour repérer d'un coup d'œil une idée sans document du jour 2 ou un lien suspect. Il ne dit pas si un lien est accessible : le staff l'ouvre pour le savoir.

## Import de la promotion (CSV)

Le staff importe la liste de la promotion Tech 3 pour que le suivi « sans projet » ne porte que sur ces étudiants, pas sur tous les comptes du hub.

**Format.** Fichier CSV, UTF-8 (avec ou sans BOM), séparateur virgule ou point-virgule détecté automatiquement, 1 Mo et 2 000 lignes maximum. Colonnes attendues (probable, à confirmer par le demandeur) : nom, prénom, adresse email. Seule l'adresse email est obligatoire, car c'est la clé de rapprochement avec `User.email` ; nom et prénom servent à l'affichage et à la recherche. Les en-têtes reconnus sont insensibles à la casse et aux accents (`email`, `mail`, `nom`, `prenom`, `name`). Si le fichier ne contient pas de colonne email, l'import est refusé avec un message explicite, plutôt que de rapprocher par nom (trop fragile : homonymes, accents, ordre nom/prénom). `RosterEntry` stocke donc `lastName` et `firstName` en plus de `email`.

**Déroulé.**
1. Le staff choisit le fichier. Rien n'est enregistré à ce stade.
2. Le serveur analyse le fichier et renvoie un aperçu : nombre de lignes valides, doublons ignorés, emails invalides listés (numéro de ligne et valeur).
3. Le staff confirme. L'import remplace la liste précédente (une seule liste par saison, ma décision) ; il ne fusionne pas.
4. La liste est enregistrée avec les emails normalisés en minuscules.

**Utilisation.** La liste sert à deux choses uniquement :
- l'onglet « Sans projet » du tableau de suivi staff (voir ci-dessous) ;
- rien d'autre : elle ne restreint ni qui peut se connecter, ni qui peut voir ou créer des idées, ni qui peut être invité dans un groupe (ma décision, cohérente avec « visibles par tous »).

**Onglet « Sans projet » (staff).** Pour chaque entrée de la liste, le serveur compare l'email au compte `User` et aux groupes :
- « Jamais connecté » : aucun compte hub pour cet email.
- « Connecté, sans projet » : compte existant, aucun groupe accepté.
- « Invitation en attente seulement » : invité mais n'a pas accepté.
Les entrées avec au moins un groupe accepté n'apparaissent pas. Un compteur en tête indique le total par statut. La recherche par nom ou email filtre cette liste.

**Conséquence à connaître.** Un étudiant « jamais connecté » n'a pas de compte hub et n'apparaît donc pas dans la recherche d'étudiants : il ne peut pas être invité tant qu'il ne s'est pas connecté une première fois. L'interface d'invitation l'indique (« introuvable : l'étudiant doit d'abord se connecter au hub »).

**Données personnelles.** La liste contient des emails de personnes : accès réservé au staff, jamais incluse dans une réponse destinée aux étudiants, supprimée à la purge de fin de saison.

## Interface

Pages à créer sur le modèle des pages Simulated :
- `/idees` : catalogue en cartes (`BentoGrid`), barre de recherche (titre et noms de membres), hashtags en `FilterChips`, tri date ou titre, compteur de résultats, réinitialisation.
- `/idees/nouvelle` et `/idees/[id]/modifier` : formulaire (`FormField`, `FileInput`, compteur de mots, saisie de hashtags avec auto-complétion), bouton désactivé tant que le formulaire est incomplet (US1).
- `/idees/[id]` : fiche (description, membres, statut du groupe, deck, liens du jour 2, historique des versions).
- `/idees/mes-idees` : mes idées avec rôle (créateur ou membre) et invitations en attente.
- `/admin/idees` : deux onglets (`Tabs`).
  - **Suivi** : tableau (`DataTable`) : idée, groupe, nombre de membres, deck présent, liens du jour 2 (nombre et domaines), dernière modification ; filtres par présence de deck et de liens ; recherche par projet ou étudiant ; actions masquer, supprimer, modérer, exporter, purge, date limite.
  - **Sans projet** : liste issue du CSV avec statut (jamais connecté, connecté sans projet, invitation en attente), compteurs (`KpiCard`), recherche, et bouton d'import du CSV avec aperçu avant confirmation (`Modal`).

Réutilisation : `FileInput` (une variante multi-fichiers n'est plus nécessaire puisque les documents du jour 2 sont des liens), `Modal`/`Dialog` pour les confirmations, `Badge`, `EmptyState`, `Skeleton`, `Pagination`, `TableToolbar`.

## Purge de fin de saison

Action admin `DELETE /api/ideas/admin/purge` : supprime toutes les idées (donc groupes, liens et historiques), tous les fichiers du dossier `storage/ideas/`, la liste de la promotion importée, et remet `deadline` à vide. Confirmation par saisie explicite (par exemple le mot `PURGER`), car l'action est irréversible. Rien n'est supprimé automatiquement : le staff garde la main sur le calendrier.

## Points sensibles à traiter à l'implémentation

- `xss-clean` (appliqué globalement dans `app.js`) altère les `<` et `>` : à vérifier sur les descriptions et les titres.
- Le limiteur de débit par utilisateur n'a pas été conçu pour des téléchargements en rafale (cartes avec logos) : à vérifier, et à exclure si besoin.
- `/api/users` n'expose que `/me` : la recherche d'étudiants est un nouvel endpoint à sécuriser.
- Pas de champ « promotion » dans `User` : la promotion Tech 3 est connue uniquement par le CSV importé (collection `RosterEntry`), le modèle `User` n'est pas modifié.
- Analyse du CSV côté serveur : décider entre une bibliothèque (ex. `csv-parse`) et un analyseur minimal. Gérer le BOM, les guillemets, les séparateurs `,` et `;`, et ne jamais exécuter ni évaluer le contenu.
- Les tests suivent l'existant : Jest, Supertest, `mongodb-memory-server`.

## Questions ouvertes (pour le demandeur)

Réglées : calendrier (mars 2027), import CSV de la promotion, visibilité de tous les utilisateurs.

1. **Dates exactes** : jour de début et jour de la date limite en mars 2027 (réglables ensuite dans l'interface, donc non bloquant pour développer).
2. **Date limite unique** pour la semaine 1 et le jour 2 ? Hypothèse de la spec, non confirmée.
3. **Format du CSV** (à confirmer par le demandeur plus tard) : probablement nom, prénom et email. Le design repose sur la présence de l'email ; sans lui, l'import est refusé et il faudra choisir une autre clé. Non bloquant pour les lots 1 et 2, bloquant uniquement pour le lot 3.
4. **Étudiants jamais connectés** : acceptez-vous qu'ils ne puissent pas être invités avant leur première connexion au hub ? Alternative : les inviter à partir de la liste CSV et créer le compte à leur première connexion (plus complexe, non retenue par défaut).
5. **Liens du jour 2** : tout lien `https://` est accepté sans liste blanche de services. Une liste blanche (Drive, OneDrive, Canva, Notion, Figma, GitHub) serait plus restrictive : à trancher selon ce qu'Eric attend pour le Start-up Day.

## Découpage de la livraison (proposition)

- **Lot 1** : modèles, soumission, upload sécurisé et versioning, catalogue avec recherche et hashtags, fiche, groupes avec invitations, date limite et blocage.
- **Lot 2** : vue staff (suivi, recherche), masquage, suppression, modération, export ZIP, purge.
- **Lot 3** : import CSV de la promotion et onglet « Sans projet ». Séparé car il dépend de la réponse sur le format du fichier et n'est pas nécessaire au dépôt des idées.

Avec une ouverture en mars 2027, les trois lots peuvent être livrés et testés avant la piscine.
