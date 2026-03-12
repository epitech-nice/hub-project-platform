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
3. Marque le projet comme terminé après finalisation
4. Exporte le CSV si besoin (`/api/projects/export/csv`)

### Diagramme de statuts

```
pending
  ├─→ approved (+ crédits)   → completed
  ├─→ rejected
  └─→ pending_changes
          └─→ pending  (après modification étudiant)
```

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

| Module | Destinataires | Déclencheurs |
|--------|--------------|--------------|
| Projets | Membres + soumetteur | approved, rejected, pending_changes, completed |
| Workshops | Instructeurs + soumetteur | approved, rejected, pending_changes, completed |
| Simulated | Étudiant du cycle | approved, rejected, pending_changes |

Email Simulated : affiche le titre du projet, le numéro de cycle, et les crédits obtenus si approuvé.
