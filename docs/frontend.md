# Frontend — Pages et Composants

Framework : **Next.js 12** (pages router), **Tailwind CSS**, mode sombre natif via `next-themes`.

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
  - Tous les cycles listés (passés / courant / à venir)
  - Cycle courant mis en évidence (bordure bleue, badge "Phase X en cours")
  - Cycles passés grisés
  - 5 dates clés par cycle avec icônes et code couleur
  - Badge "Double cycle" si applicable
  - Fermeture par clic en dehors ou bouton ✕

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
Enrollment terminé : affiche `totalCredits`.

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

## Composants Réutilisables

### `Header.js`
Navigation principale responsive avec trois menus déroulants :
- **Projets** : Dashboard, Soumettre
- **Workshops** : Dashboard, Soumettre
- **Simulated** : Choisir un projet, Mes projets, Admin Simulated *(admins uniquement)*

Les menus se ferment mutuellement. Highlight de la section active (`isProjectsRoute`, `isWorkshopsRoute`, `isSimulatedRoute`). Burger menu mobile.

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
