# Synchronisation d'un projet Hub terminé vers my (Epitech)

Date : 2026-11-24
Statut : design validé oralement par l'utilisateur (flux, garde-fous, choix), en attente de relecture écrite.

## Intention et pourquoi

Quand un projet Hub est présenté et validé, le staff doit le reporter à la main sur my (process décrit par Eric Deschodt) : créer une activité, y mettre l'étudiant "présent", puis ajouter des points dans le module Networking & Cohesion / projet Student Engagement. Ces étapes sont régulièrement oubliées, donc les étudiants ne sont pas notés.

Objectif : un bouton "Envoyer sur my" sur la fiche admin d'un projet terminé, qui exécute ces étapes automatiquement avec les données déjà présentes dans le Hub.

## Objectifs

- Un bouton sur la page admin d'un projet au statut `completed`.
- Création sur my de l'activité, de la session, des inscriptions, des présences et des points, pour tous les membres du projet.
- Points par étudiant = `credits` du projet x 4, attribués individuellement.
- Exécution reprenable : une étape déjà faite n'est jamais refaite, une étape échouée peut être relancée.
- Visibilité : l'admin voit l'état de chaque étape et chaque étudiant.

## Non-objectifs

- Lire ou afficher des données my dans le Hub.
- Annuler ou défaire une synchronisation déjà faite sur my.
- Historique détaillé des synchronisations (seul l'état courant est conservé).
- Confirmer les notes sur my (`confirm`) : explicitement exclu pour le moment, comme dans le process d'Eric.
- Synchronisation des workshops ou du module Simulated.

## Anti-objectifs (échecs même si "ça marche")

- Ajouter deux fois les points à un étudiant (double clic, retry).
- Écraser des points existants ou des commentaires d'évaluation déjà saisis sur my.
- Créer deux activités pour le même projet.
- Dépasser silencieusement ou écrêter le plafond de la note.

## Contraintes

- API officielle my : base `https://my.epitech.eu/api`, authentification `Authorization: Bearer <JWT>` (clé fournie par l'utilisateur). Spec : `https://my.epitech.eu/api/docs-json`.
- Le login my d'un étudiant est son email (`prenom.nom@epitech.eu`).
- La note "Engagement interne - Projets Hub" (achievement 5833 de la grille 1295) est **cumulative et unique** par étudiant. Valeurs autorisées : 0 à 16. `PUT .../assessments` remplace la note et les commentaires.
- Les ids changent chaque année scolaire (voir configuration).
- Stack existante : Express + Mongoose, `asyncHandler`, `ErrorResponse`, routes admin protégées par `authenticateToken` + `isAdmin`, client Next.js 12 (pages router), `useApi` dont `get` n'est pas mémorisé (ne pas le mettre dans les deps de `useEffect`).

## Approches considérées

- **A. Bouton synchrone avec reprise (retenue).** Le serveur exécute les étapes dans une requête, enregistre la progression sur le projet, et le bouton relance le reste en cas d'échec. Simple, visible, sans doublon. Limite : la requête dure quelques secondes avec plusieurs membres.
- **B. Même flux via la file de jobs existante.** Plus confortable avec beaucoup de membres, mais plus de code, et la file sert aux emails ; non vérifié qu'elle survive à un redémarrage. Évolution possible plus tard sans changer le modèle de données.
- **C. Automatique au passage en `completed`, sans bouton.** Écartée : les erreurs seraient invisibles et l'utilisateur a demandé un bouton.

Choix de l'utilisateur : A.

## Flux détaillé

Entrées : un projet `completed` avec `credits` > 0, des `members` (emails), un nom, un id Hub, une date de soutenance.

1. **Date de soutenance.** `completeProject` exige `defenseDate` (date + heure de début de session ; 400 si absente ou invalide). Les projets déjà terminés avant cette fonctionnalité n'ont pas de date et ne sont pas concernés (ils ont été saisis à la main). Stockée sur le projet. Valeur par défaut proposée côté interface : 13:00, durée 30 minutes. La synchro est impossible si la date est absente.
2. **Activité.** `POST /units/instances/{MY_HUB_UNIT_INSTANCE_ID}/activities` avec :
   - `name` : `Projet HUB - <nom du projet>`
   - `description` : `<emails des membres, séparés par des virgules> : <URL de la fiche admin Hub>` (l'URL est `<FRONTEND_URL>/admin/projects/<id>` ; le Hub ne stocke que les emails des membres, pas leurs noms)
   - `duration` : 30
   - `startDate` / `endDate` : fenêtre englobant la session (au minimum le jour de la soutenance)
   - `slots` false, `mandatory` false, `forceRegistration` false, `plannableSessions` 1
   Sauvegarder `activityId` retourné.
3. **Session.** `POST /events` avec `activityInstanceId`, `title` identique, `startDate` = date de soutenance, `endDate` = +30 minutes. Sauvegarder `eventId`.
4. **Inscription et présence, par membre.**
   - `POST /events/{eventId}/registrations/{login}`
   - puis `POST /events/{eventId}/attendance/set` avec `records: [{ login, status: "present" }]`
   Marquer l'étudiant `registered` puis `present`.
5. **Points, par membre.**
   - `GET /students/{login}/projects?schoolYear=<année>` : trouver la ligne dont `projectInstanceId` = `MY_ENGAGEMENT_PROJECT_ID` et lire `registrationId`.
   - `POST /evaluations/assessments/session/from-project-registration/{registrationId}` : récupérer `assessmentSessionId`.
   - `GET /evaluations/assessments/session/{assessmentSessionId}` : lire la note actuelle du critère 5833 pour ce login, ainsi que `individualComment` et `groupComment` existants.
   - Calculer `nouveau = actuel + credits x 4`. Si `nouveau` > 16 ou n'est pas une valeur autorisée de la grille : étape en échec pour cet étudiant, avec message explicite, rien n'est écrit.
   - `PUT /evaluations/assessments/session/{assessmentSessionId}/assessments` avec `{ login, achievementId: 5833, mark: nouveau, individualComment: <existant>, groupComment: <existant> }`. Ne pas appeler `/confirm`.
   - Enregistrer sur le projet `pointsApplied` (le nombre de points ajoutés) et `markAfter`.

Chaque étape est ignorée si déjà marquée faite. L'écriture de la progression sur le projet se fait immédiatement après chaque appel réussi, avant de passer à la suite.

## Modèle de données (Project)

Ajouter :

- `defenseDate` : Date.
- `mySync` :
  - `activityId`, `eventId` : Number.
  - `students` : tableau de `{ email, registered: Boolean, present: Boolean, markBefore: Number|null, markTarget: Number|null, pointsApplied: Number|null, error: String|null }`. `markBefore` et `markTarget` sont écrits **avant** le `PUT` des points ; `pointsApplied` (credits x 4) n'est écrit qu'après son succès. Si une synchro est reprise avec `markTarget` défini et `pointsApplied` vide (crash entre le `PUT` et l'enregistrement), on relit la note : égale à `markTarget` = déjà appliqué, égale à `markBefore` = refaire le `PUT`, autre valeur = étape en erreur (note modifiée entre-temps sur my), jamais d'ajout à l'aveugle.
  - `inProgressUntil` : Date (verrou, voir API).
  - `status` : `idle | partial | done`.
  - `lastAttemptAt` : Date, `lastError` : String.

`status` passe à `done` quand activité, session et tous les étudiants (inscrit, présent, points) sont faits.

## API Hub

- `POST /api/projects/:id/sync-my` (admin). Corps vide. Exécute ou reprend la synchro. Réponse : le projet avec `mySync` à jour et, en cas d'échec partiel, le détail des erreurs (code 200 avec `mySync.status = partial`, pas de 500 pour une erreur my gérée).
- Refuse (400) : projet non `completed`, `credits` vide ou <= 0, `defenseDate` absente, synchro déjà `done`.
- Nouveau service `server/src/services/mySyncService.js` (client HTTP my + logique d'étapes) et contrôleur dans `projectController.js` ou un contrôleur dédié, selon ce qui reste lisible.
- Verrou anti-concurrence : refuser (409) si une synchro est en cours sur le même projet (champ `mySync.inProgress` avec expiration courte). Traiter les projets d'un même étudiant en séquence suffit vu le volume ; le verrou évite le double clic.

## Interface

Page admin du projet (`client/src/pages/admin/...` détail projet) :
- Champ date de soutenance dans l'action "marquer comme terminé".
- Carte "my" visible si le projet est `completed` : état global, liste des étudiants avec les trois états (inscrit, présent, points), erreurs par étape, bouton "Envoyer sur my" ou "Relancer". Après succès : liens vers l'activité et la session sur my, bouton masqué.
- Respecter les tokens de design existants et le dark mode.

## Configuration (variables d'environnement serveur)

- `MY_API_URL` (défaut `https://my.epitech.eu/api`)
- `MY_API_TOKEN` (la clé API)
- `MY_HUB_UNIT_INSTANCE_ID` (949 pour 2026)
- `MY_ENGAGEMENT_PROJECT_ID` (5651 pour 2026)
- `MY_ENGAGEMENT_ACHIEVEMENT_ID` (5833 pour 2026)
- `MY_SCHOOL_YEAR` (2026)
- `MY_MAX_ENGAGEMENT_MARK` (16)

Jamais dans le repo ni dans les logs. Ajouter les noms (sans valeurs) à la documentation de déploiement existante. Si une variable manque, la route répond 500 avec un message d'administration clair, sans appeler my.

## Risques à valider en premier

1. `attendance/set` est peut-être refusé sur une session passée ou "pas encore ouverte" (le connecteur évoque ce cas). À tester sur une vraie session de test ; si refusé, il faudra ouvrir la présence (`start`/`stop` attendance) avant de poser le statut.
2. Forme de la réponse de `GET .../session/{id}` : **observée le 2026-11-24** sur une session réelle (voir `server/src/tests/fixtures/mySessionResponse.json`). La note est dans `assessments[login][]` (ligne dont `achievementId` = 5833), avec `mark`, `individualComment`, `groupComment`, `validated`. La session existe déjà pour les étudiants que le staff a ouverts, et `session.confirmedAt` peut être renseigné : une session confirmée refuse un `PUT` tant que l'évaluation n'est pas rouverte. Décision : le Hub ne rouvre jamais une évaluation confirmée ; l'étape points de cet étudiant échoue avec un message explicite et le staff rouvre l'évaluation sur my avant de relancer. À confirmer avec l'utilisateur.
3. Durée de vie et droits de la clé API : si elle expire, le message d'erreur doit le dire clairement.
4. Étudiants non inscrits à Student Engagement : le module est en `forceRegistration`, mais un étudiant peut être hors cursus ou d'une autre promotion.

## À la charge du constructeur

- Nom et emplacement exacts des fichiers client et des champs d'interface.
- Format de la fenêtre `startDate`/`endDate` de l'activité (par exemple le jour de la soutenance, de 00:00 à 23:59, ou la fenêtre de l'ancienne activité Chartscope V2 comme référence).
- Tests : service avec client HTTP simulé, y compris reprise après échec partiel, plafond à 16, absence de double ajout de points ; test fonctionnel de la route dans la suite existante.
- Mise à jour de `docs/` (API et déploiement).

## Hors périmètre / suites possibles

Annulation d'une synchro, exécution en arrière-plan (approche B), synchronisation des workshops.
