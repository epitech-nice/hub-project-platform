# Workflows

---

## Projets classiques

### Étudiant
1. Se connecte via Microsoft OAuth
2. Soumet un projet (`/submit-project`) — validation GitHub incluse
3. Reçoit un email de confirmation
4. Suit le statut sur `/dashboard`
5. Si `pending_changes` : modifie le projet et re-soumet
6. Si `approved` : ajoute les infos complémentaires (GitHub final, documents) depuis `/projects/[id]`

### Admin
1. Accède à `/admin/dashboard`, filtre par statut
2. Ouvre un projet, choisit une action :
   - **Approuver** : saisit les crédits → email envoyé + appel API Intra Epitech
   - **Rejeter** : ajoute un commentaire → email envoyé
   - **Demander modifications** : ajoute un commentaire → email envoyé
3. Marque le projet comme terminé après finalisation, en saisissant la date de la soutenance (obligatoire)
4. Envoie le projet sur my depuis la carte « Synchronisation my » (voir ci-dessous)
5. Exporte le CSV si besoin (`/api/projects/export/csv`)

### Diagramme de statuts

```
pending
  ├─→ approved (+ crédits)   → completed
  ├─→ rejected
  └─→ pending_changes
          └─→ pending  (après modification étudiant)
```

### Envoi d'un projet terminé sur my

**Quand l'utiliser** : une fois le projet marqué comme terminé (crédits > 0 et date de soutenance saisie), sur la page admin du projet, bouton « Envoyer sur my ». Le bouton disparaît quand la synchronisation est terminée.

**Ce que fait l'envoi** : création de l'activité `Projet HUB - <nom>` et d'une session à la date de soutenance, inscription et présence de chaque membre, puis ajout de `crédits × 4` points à la note du critère Student Engagement. Les notes restent non confirmées : le Hub ne confirme ni ne rouvre jamais une évaluation.

**États de la carte** :
- « Non synchronisé » : rien n'a encore été envoyé (bouton « Envoyer sur my »)
- « Synchronisation partielle » : au moins une étape ou un étudiant est en erreur (bouton « Relancer »). Le message en rouge donne la cause
- « Synchronisé » : tous les étudiants sont inscrits, présents et ont reçu leurs points

Chaque étudiant affiche trois badges : inscrit, présent, points (`+8 pts` par exemple, ou « en attente »).

**Quand un étudiant est en erreur** : corriger la cause puis cliquer sur « Relancer ». Seules les étapes non faites sont refaites.
- Session d'évaluation déjà confirmée sur my : rouvrir l'évaluation sur my, puis « Relancer »
- Note qui dépasserait le maximum (16 en 2026) ou valeur non autorisée : les points ne sont pas ajoutés, corriger la note sur my si nécessaire
- Étudiant introuvable dans le projet Student Engagement : l'étudiant n'est pas inscrit à ce projet sur my (hors cursus ou autre promotion), l'inscrire puis relancer
- Note modifiée entre-temps sur my : le message ne donne pas les valeurs, qui se lisent dans `data.mySync.students[]` de la réponse de `POST /api/projects/:id/sync-my` ou dans le champ `mySync.students` du projet en base (`markBefore` = note avant l'ajout, `markTarget` = note visée). La note actuelle sur my n'est ni l'une ni l'autre, peut-être modifiée volontairement : vérifier d'abord sur my. Puis remettre la note à `markBefore` si les points n'ont jamais été écrits sur my (la relance les ajoutera), ou à `markTarget` s'ils l'ont déjà été (la relance enregistrera simplement le résultat sans rien écrire). Se tromper de valeur donne un crédit manquant ou doublé
- Clé API my invalide ou expirée : renouveler `MY_API_TOKEN` côté serveur
- Message `409` « synchronisation déjà en cours » : attendre la fin de l'envoi (le verrou expire seul après 2 minutes)

**Les points ne sont jamais ajoutés deux fois** : la note avant ajout et la note visée sont enregistrées avant l'écriture sur my. Après un plantage ou une relance, le Hub relit la note sur my : si elle vaut déjà la note visée, il enregistre simplement le résultat sans rien ajouter.

---

## Workshops

Identique aux projets, sans crédits ni intégration API externe.

---

## Simulated Professional Work

### Vue d'ensemble du cycle

```
[Admin crée un SimulatedCycle avec 5 dates]
          ↓
[Phase 1 ouverte : startDate → firstSubmissionDeadline]
          ↓
[Étudiant choisit un projet, dépose son GitHub]
  → status: pending
          ↓
[Admin review GitHub]
  → approved  (lockedByAdmin = true)
  → rejected  (étudiant peut re-soumettre)
  → pending_changes  (étudiant doit modifier)
          ↓
[Admin : Défense phase 1]  → defend (credits)
  → phase1Credits stockés
  → phase → 2
  → status → pending_changes
  → lockedByAdmin = false  ← étudiant déverrouillé
          ↓
[Phase 2 : firstDefenseDate → secondSubmissionDeadline]
[Étudiant met à jour son GitHub]  → changeHistory tracé
          ↓
[Admin review GitHub phase 2]
  → approved (lockedByAdmin = true)
          ↓
[Admin : Défense phase 2]  → defend (credits)
  → credits stockés
  → totalCredits incrémenté
  → lockedByAdmin = true
          ↓
[Admin choisit]
  ├─→ "Marquer comme terminé"  → isCompleted = true
  └─→ "Relancer"               → nouveau cycle
                                  cycleNumber++, phase → 1
                                  defenseHistory et totalCredits CONSERVÉS
```

### Workflow étudiant — pas à pas

1. Accède à `/simulated`
2. Consulte le calendrier des cycles (bouton "Calendrier des cycles")
3. Si une fenêtre de **phase 1** est ouverte : clique sur un projet disponible
4. Dépose son lien GitHub Project et confirme
5. Attend la review admin (notification email)
6. Si `pending_changes` : met à jour le lien depuis `/simulated/[id]`
7. Si `approved` : patiente jusqu'à la 1ère défense (champ verrouillé)
8. Après la défense phase 1 : le champ est déverrouillé, met à jour son GitHub pour la phase 2
9. Attend la review phase 2 puis la 2ème défense
10. Une fois terminé : consulte les crédits dans `/simulated/mes-projets`

### Workflow admin — pas à pas

**Préparation** :
1. Crée les projets du catalogue (`/admin/simulated` → onglet Catalogue) avec PDF du sujet
2. Crée les cycles (`/admin/simulated` → gestion des cycles)

**Suivi des enrollments** :
1. Ouvre `/admin/simulated` → onglet Suivis
2. Filtre par statut
3. Si besoin, force-enroll un étudiant hors fenêtre (champ email + projet)
4. Ouvre le détail d'un enrollment
5. **Review GitHub** : approuve / rejette / demande modifications
6. **Défense phase 1** : clique "Défense projet", saisit les crédits → étudiant déverrouillé
7. **Review GitHub phase 2** : approuve après mise à jour de l'étudiant
8. **Défense phase 2** : clique "Défense projet", saisit les crédits
9. Choisit : "Marquer comme terminé" ou "Relancer pour un nouveau cycle"
10. Export CSV des enrollments terminés si besoin

### Règles métier importantes

| Règle | Détail |
|-------|--------|
| Projet "déjà effectué" | `phase === 2 && status ∈ {approved, completed}` — projet grisé dans le catalogue |
| Fenêtre d'inscription | Phase 1 uniquement — `startDate ≤ now ≤ firstSubmissionDeadline` |
| Blocage après deadline | L'étudiant ne peut pas s'inscrire hors fenêtre (sauf force-enroll admin) |
| Double cycle | Activé/désactivé par l'admin — crédits de 0 à 4 par pas de 0.5 |
| Crédits cycle normal | 0 / 0.5 / 1 / 1.5 par phase |
| `totalCredits` | Jamais réinitialisé — cumule toutes les défenses sur la durée du projet |
| `lockedByAdmin` | Empêche l'étudiant de modifier son GitHub en dehors des fenêtres prévues |

---

## Notifications Email

`emailService.sendStatusChangeEmail(item, status, isWorkshop, isSimulated)`

> **Performance** : Les envois d'emails sont délégués à une file d'attente en mémoire via `backgroundJobs.js` ("fire-and-forget"). Cela garantit que les temps de réponse de l'API (ex: lors de l'approbation d'un projet) restent instantanés pour l'administrateur, même en cas de latence SMTP.

| Module | Destinataires | Déclencheurs |
|--------|--------------|--------------|
| Projets | Membres + soumetteur | approved, rejected, pending_changes, completed |
| Workshops | Instructeurs + soumetteur | approved, rejected, pending_changes, completed |
| Simulated | Étudiant du cycle | approved, rejected, pending_changes |

Email Simulated : affiche le titre du projet, le numéro de cycle, et les crédits obtenus si approuvé.
