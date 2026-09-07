# Frontend — Pages et Composants

Framework : **Next.js 12** (pages router), **Tailwind CSS**, mode sombre natif via `next-themes`.

> **Note sur la gestion des API** : Tous les appels API de mutation (`POST`, `PUT`, `DELETE`, `PATCH`) utilisent le hook personnalisé `useApi`. Il embarque un intercepteur axios qui extrait de manière garantie le `message` et les `errors` du backend, évitant ainsi les alertes génériques pour afficher les causes exactes (erreurs de validation métier, conflits, etc.).

---

## Design System

Migration graphique complète (PR #6) : mode sombre par défaut, tokens CSS pour les couleurs, nouvelle police, composant `BentoCard`, navigation refondue.

### Mode sombre par défaut
Le `ThemeProvider` de `next-themes` est configuré dans `client/src/pages/_app.js` avec `attribute="class"` et **`defaultTheme="dark"`** : l'application démarre en mode sombre tant que l'utilisateur n'a pas changé de thème lui-même.

### Tokens CSS
Définis dans `client/src/styles/globals.css`, sous forme de triplets RGB (utilisables via `rgb(var(--x))` ou les classes Tailwind `bg-x` / `text-x`). Valeurs principales :

| Token | Clair (`:root`) | Sombre (`.dark`) |
|---|---|---|
| `--bg` | `247 249 252` | `18 24 42` |
| `--surface` | `255 255 255` | `26 34 58` |
| `--surface-2` | `250 251 252` | `22 29 50` |
| `--border` | `228 231 236` | `44 54 80` |
| `--text` | `15 23 42` | `241 245 249` |
| `--primary` | `59 130 246` | `96 165 250` |

D'autres jeux de tokens couvrent les couleurs de statut (`--status-pending-bg/text`, `--status-approved-bg/text`, etc., déjà utilisées par les badges — voir `ProjectCard.js`/`WorkshopCard.js` ci-dessous), les ombres (`--shadow-sm/md/lg`), et des thèmes saisonniers optionnels (classes `.christmas`, `.spring`) qui ne redéfinissent que `--primary`/`--accent`.

### Typographie
Chargée via Google Fonts dans `client/src/pages/_document.js` : **Plus Jakarta Sans** (poids 400 à 800, police principale, variable `--font-sans`) et **JetBrains Mono** (poids 500, `--font-mono`).

### `BentoCard.js`
Composant de carte (`client/src/components/ui/BentoCard.js`) utilisé pour les grilles de type bento. Props : `span` (`normal`/`wide`/`tall`/`large`), `variant` (`default`/`highlight`/`ghost`), `hover` (bool, défaut `true`), `padding` (`default`/`compact`/`none`), `as` (tag HTML). Quand `hover` est actif, effet de survol : `-translate-y-1` + `shadow-lg` + `border-primary/40`.

### Navigation desktop en 3 colonnes
`AppHeader.js` (voir aussi `Header.js` ci-dessous) organise la barre en 3 zones via `flex-1` de part et d'autre du contenu central : logo à gauche, nav desktop centrée, contrôles (thème saisonnier, bascule sombre/clair, connexion/déconnexion, burger mobile) à droite.

---

## Pages — Projets & Workshops

### `/` — Accueil
Présentation de la plateforme. Boutons d'accès rapide si authentifié (dashboard, soumettre, glossaire). Bouton connexion si non authentifié.

### `/dashboard` — Dashboard étudiant projets
Liste des projets de l'utilisateur avec statistiques, badges de statut, et actions contextuelles (voir, éditer, supprimer, quitter).

### `/submit-project` — Soumettre un projet
Formulaire complet avec validation GitHub (vérifie l'existence du repo via l'API GitHub), gestion des membres et technologies.

### `/submit-workshop` — Soumettre un workshop
Formulaire avec instructeurs, présentation, liens.

### `/projects/[id]` — Détails projet
Informations complètes, statut, historique des changements, commentaires admin, infos additionnelles post-approbation.

### `/projects/edit/[id]` — Éditer un projet
Réservé au créateur. Accessible uniquement si `status === 'pending'` ou `'pending_changes'`.

### `/workshops/dashboard` — Dashboard étudiant workshops
Même structure que le dashboard projets.

### `/workshops/[id]` / `/workshops/edit/[id]`
Détail et édition d'un workshop.

### `/glossaire`
Glossaire des termes Scrum Agile : User Stories, Sizing (Story Points, T-shirt), Man-day, GitHub Projects. Support mode sombre, design responsive.

### `/admin/dashboard` — Dashboard admin projets
Filtrage par statut, liste complète, statistiques globales.

### `/admin/projects/[id]` — Révision projet (admin)
Approuver (+ crédits), rejeter, demander modifications, marquer terminé. Affiche l'historique complet.

### `/admin/workshops/dashboard` / `/admin/workshops/[id]`
Dashboard et révision admin workshops.

---

## Pages — Simulated Professional Work

### `/simulated` — Catalogue
Grille de cartes projets (miniature PDF ou placeholder).

**Fonctionnalités** :
- Projets déjà effectués (phase 2 approuvée ou complétée) : grisés et non cliquables
- **Bandeau cycle actif** :
  - Phase 1 ouverte → bandeau vert avec deadlines
  - Phase 2 ouverte → bandeau bleu
  - Aucune fenêtre → bandeau orange
- **Bouton "Calendrier des cycles"** → ouvre un modal :
  - Tous les cycles listés, triés par priorité (1. En cours, 2. À venir, 3. Terminés).
  - Cycle courant (entre "Ouverture phase 1" et "2ème défense finale") mis en évidence de façon persistante avec bordure bleue.
  - Badge dynamique en temps réel ("Phase 1 en cours", "Défenses phase 1", "Phase 2...", etc.).
  - Cycles passés grisés.
  - Fermeture par clic en dehors ou bouton ✕.

### `/simulated/[id]` — Détail projet / enrollment
Page unique qui adapte son affichage selon l'état :

| État | Affichage |
|------|-----------|
| Pas encore inscrit + fenêtre ouverte | Bouton "Choisir ce projet" |
| Pas inscrit + aucune fenêtre | Message d'information |
| Enrollment actif | Formulaire GitHub + statut + phase |
| `lockedByAdmin = true` | Message "En attente de défense" |
| Phase 2 ouverte, non verrouillé | Invitation à mettre à jour le GitHub |
| `isCompleted = true` | Résumé du projet terminé |

Affiche aussi le `changeHistory` complet.

### `/simulated/mes-projets` — Historique étudiant
Liste de tous les enrollments (actif en premier, puis terminés).
Enrollment terminé : affiche `totalCredits` (somme cumulée de toutes les défenses de cet enrollment).

### `/admin/simulated` — Dashboard admin Simulated

**Onglet Catalogue** :
- Liste des projets avec statut actif/inactif
- Création / édition (titre + upload PDF)
- Toggle actif/inactif

**Onglet Suivis étudiants** :
- Tableau de tous les enrollments avec filtres par statut
- **Formulaire force-enroll** : sélection projet + email étudiant → inscription immédiate
- Export CSV

### `/admin/simulated/enrollments/[id]` — Détail enrollment (admin)

Sections :
1. Informations générales (étudiant, projet, cycle, phase, GitHub)
2. **Formulaire de review** : radio approve / reject / pending_changes + commentaires *(si non verrouillé)*
3. **Formulaire de défense** : saisie crédits + commentaires *(si `canDefend`)*
4. Tableau `defenseHistory` (toutes les défenses passées avec crédits)
5. Bannière `totalCredits`
6. Actions : "Marquer comme terminé" *(si `canComplete`)* / "Relancer" *(si `canRelaunch`)*
7. Toggle double cycle

**Conditions d'affichage** :
```
canDefend   = status === "approved" && (phase 1 ? phase1Credits === null : credits === null)
canComplete = status === "approved" && phase === 2 && credits !== null && !isCompleted
canRelaunch = phase === 2 && credits !== null && ["approved","completed"].includes(status)
```

---

## Pages — Impression 3D

### `/print` — Soumission d'impression 3D
Formulaire de soumission d'un fichier `.gcode` vers une imprimante disponible (Kobra 3 / Kobra 3 Max), et historique des impressions de l'utilisateur avec statut (en attente, envoyée, en cours, terminée, échec, refusée — message d'erreur affiché si échec). Si l'utilisateur n'est pas encore autorisé à imprimer, affiche un bouton de demande d'accès ou l'état de sa demande en cours. Accessible à tout utilisateur authentifié (redirige vers `/` sinon) ; la soumission effective reste conditionnée à une autorisation whitelist côté backend.

### `/print/printers/[id]/confirm-clearance` — Confirmation de libération d'imprimante
Page accédée via le QR code collé sur l'imprimante : l'étudiant y certifie que le plateau d'impression est vide pour remettre la machine à disposition. Affiche un lien de connexion si non authentifié, sinon un bouton de confirmation avec avertissement sur les fausses déclarations. Accessible à tout utilisateur authentifié.

### `/admin/print` — Administration Impression 3D
Gestion des imprimantes (création, affichage du QR code de libération, régénération de clé API, activation/désactivation avec note obligatoire), de la liste blanche des étudiants autorisés (autoriser/bloquer avec justification obligatoire, révocation), des demandes d'accès en attente, et journal de toutes les impressions soumises (avec motif de refus le cas échéant). Réservée aux administrateurs.

### `/admin/print/printers/[id]/qr` — QR code imprimante (à imprimer)
Page minimaliste affichant en grand le QR code de libération d'une imprimante (récupéré via l'API admin authentifiée, chargé en `blob`), destinée à être imprimée et collée sur la machine ; pointe vers `/print/printers/[id]/confirm-clearance`. Réservée aux administrateurs.

---

## Composants Réutilisables

### `Header.js` / `AppHeader.js`
`Header.js` réexporte désormais `AppHeader.js`, qui contient l'implémentation réelle. Barre de navigation sticky en 3 colonnes (voir section Design System) :
- **Soumettre un projet** (dropdown) : sous-sections Projets, Workshops et Simulated (avec libellé dynamique du cycle Simulated en cours si applicable), plus les liens admin correspondants pour les administrateurs.
- **Hub** (dropdown) : Inventaire, Impression 3D, plus les liens admin correspondants.
- Lien direct **Glossaire**.

Panneau `MobileNavPanel.js` (burger) sur mobile : sections à plat (Projets, Workshops, Simulated, Hub, Impression 3D), mais avec un regroupement différent du desktop — Glossaire rejoint le groupe Hub (absent du dropdown Hub desktop, où il n'apparaît pas du tout puisque Glossaire est un lien autonome à côté des dropdowns), et Impression 3D en devient sa propre section de premier niveau au lieu d'être une sous-section de Hub.

### `Footer.js`
Pied de page avec copyright.

### `ProjectForm.js`
Formulaire réutilisable création/édition projet.
- Validation GitHub via API GitHub
- Gestion membres, technologies, liens multiples
- Mode création vs édition selon `initialData`

### `WorkshopForm.js`
Formulaire workshops : instructeurs, présentation, liens.

### `ProjectCard.js` / `WorkshopCard.js`
Cartes d'affichage avec badge statut coloré et actions contextuelles.

**Couleurs de statut** :
| Statut | Couleur |
|--------|---------|
| `pending` | Bleu |
| `pending_changes` | Orange |
| `approved` | Vert |
| `rejected` | Rouge |
| `completed` | Violet |

### `ThemeSwitcher.js`
Bascule sombre/clair avec persistance `localStorage` via `next-themes`.
