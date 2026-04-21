# Refonte graphique Hub — Design spec

**Date** : 2026-04-21
**Branche d'implémentation** : `feature/ui-redesign` (depuis `master`)
**Auteur** : Renaud Juliani
**Objectif** : refonte visuelle complète du site Hub, sans modification du comportement fonctionnel

---

## 1. Contexte & objectif

### Situation actuelle
Le site Hub (plateforme de gestion de projets, workshops, Simulated et inventaire pour Epitech Nice) est fonctionnel mais visuellement daté : header bleu plein style Bootstrap, cartes blanches uniformes sans hiérarchie forte, boutons de couleurs vives empilés, peu de rythme typographique. L'identité visuelle n'est pas distinctive et certaines pages denses (admin, inventaire, simulated) manquent de lisibilité.

### Objectif de la refonte
Moderniser l'interface tout en améliorant la hiérarchie d'information (choix **D** dans le brainstorming : mix A + C). La palette chromatique de l'école est préservée ; ce qui change, c'est la typographie, les espacements, les ombres, la structure des composants, et l'organisation des écrans.

### Non-objectifs (explicites)
- Aucune modification de la logique métier, des routes, des API, des modèles Mongoose, des emails, de la validation, ou des workflows (pending → approved/rejected/pending_changes, lockedByAdmin, fenêtres cycle, attribution de crédits)
- Aucun changement des contrats de données entre front et back
- Aucune suppression de fonctionnalité existante
- Aucune migration de stack (on reste en Next.js pages router + Tailwind + Mongoose)

---

## 2. Direction visuelle validée

**Combinaison** : Swiss Modernism 2.0 × Bento Grid × Soft UI Evolution

- **Base structurelle** : grille 12 colonnes, ratios mathématiques, hiérarchie typographique nette (WCAG AA+ garanti)
- **Exceptions marketing** : Bento Box Grid sur l'accueil et les dashboards — cartes de tailles variées (1×1, 2×1, 2×2), radius 16-24px, ombres douces
- **Signature composants** : Soft UI Evolution — ombres multi-couches subtiles, radius 10-12px, transitions 200-300ms
- **Typographie unique** : `Plus Jakarta Sans` (400/500/600/700/800) pour tout le texte, `JetBrains Mono` pour crédits, codes, URLs monospace
- **Palette** : palette existante préservée, bleu pivoté vers `#3B82F6` (Tailwind `blue-500` — couleur phare Epitech déjà utilisée dans `bg-blue-600` = `#2563EB`)

---

## 3. Design tokens

### Couleurs sémantiques

| Token | Light | Dark |
|---|---|---|
| `primary` | `#3B82F6` | `#60A5FA` |
| `primary-hover` | `#2563EB` | `#3B82F6` |
| `primary-ghost` | `#EFF6FF` | `rgba(96,165,250,.12)` |
| `primary-border` | `#BFDBFE` | `rgba(59,130,246,.35)` |
| `secondary` | `#15803D` | `#4ADE80` |
| `accent` | `#EAB308` | `#FACC15` |
| `danger` | `#DC2626` | `#F87171` |
| `bg` | `#F7F9FC` | `#0A0E1A` |
| `surface` | `#FFFFFF` | `#111726` |
| `surface-2` | `#FAFBFC` | `#0F1422` |
| `border` | `#E4E7EC` | `#1F2637` |
| `border-strong` | `#CBD5E1` | `#2A3449` |
| `text` | `#0F172A` | `#F1F5F9` |
| `text-muted` | `#475569` | `#94A3B8` |
| `text-dim` | `#94A3B8` | `#64748B` |

### Couleurs status

| Status | Light bg / text | Dark bg / text |
|---|---|---|
| `pending` (info) | `#EFF6FF` / `#2563EB` | `rgba(96,165,250,.15)` / `#60A5FA` |
| `approved` (success) | `#DCFCE7` / `#15803D` | `rgba(74,222,128,.13)` / `#4ADE80` |
| `changes` (warning) | `#FEF3C7` / `#B45309` | `rgba(250,204,21,.15)` / `#FACC15` |
| `rejected` (danger) | `#FEE2E2` / `#B91C1C` | `rgba(248,113,113,.15)` / `#F87171` |

### Typographie

- **Sans** : `Plus Jakarta Sans` (weights 400, 500, 600, 700, 800) — chargé via `next/font`
- **Mono** : `JetBrains Mono` (weight 500) — chargé via `next/font`
- **Échelle** : `xs 12 / sm 13.5 / base 14 / md 15 / lg 17 / xl 20 / 2xl 24 / 3xl 32 / 4xl 44`
- **Letter-spacing** : `-0.025em` titres, `-0.01em` labels UI
- **Line-height** : `1.5`-`1.75` body, `1.1`-`1.2` titres
- **Line-length** : max 65-75 caractères par ligne (texte long)

### Espacement & dimensions

- **Base** : 4px (toutes valeurs multiples de 4)
- **Échelle** : `1/2/3/4/6/8/12/16/24/32` (= 4 à 128px)
- **Padding carte par défaut** : 22px (1.375rem)
- **Padding compact** : 16×18px
- **Gap grid** : 14-16px
- **Container max-width** : 1280px

### Radius

- `sm 8 / md 10 / lg 12 / xl 20 / full 999`
- Cartes standard : `md` (10) ou `lg` (12)
- Cartes bento : `xl` (20)
- Boutons : `md` (10)
- Badges : `full`

### Ombres

```
sm  0 1px 2px rgba(16,24,40,.04)                          → 0 1px 2px rgba(0,0,0,.3)
md  0 4px 10px rgba(16,24,40,.06), 0 2px 4px ...          → 0 6px 18px rgba(0,0,0,.4)
lg  0 14px 28px rgba(16,24,40,.10), 0 4px 8px ...         → 0 20px 45px rgba(0,0,0,.5)
```

### Motion

- `150ms` (hover / micro-interactions)
- `200ms` (default — apparition, disparition)
- `300ms` (page transitions)
- Easing : `cubic-bezier(.4, 0, .2, 1)`
- Respect obligatoire de `prefers-reduced-motion`

### Focus states

Tout élément interactif reçoit : `ring 2px rgba(59,130,246,.5)` + offset 2px en focus-visible.

### Responsive & mobile

Même si la part mobile des utilisateurs est faible, le site doit rester utilisable et lisible sur téléphone. Tailwind étant mobile-first, on conçoit les composants dans cet ordre puis on enrichit aux breakpoints supérieurs.

**Breakpoints** (alignés sur Tailwind par défaut) :

| Nom | Largeur | Cible |
|---|---|---|
| base | `< 640px` | téléphone portrait |
| `sm` | `≥ 640px` | téléphone paysage / petite tablette |
| `md` | `≥ 768px` | tablette |
| `lg` | `≥ 1024px` | petit laptop |
| `xl` | `≥ 1280px` | desktop standard |

**Tailles de référence à tester** : 375, 640, 768, 1024, 1280, 1440 px.

**Touch targets** : tout élément interactif (bouton, chip, icône cliquable, lien de nav) expose une zone tactile minimale de **44×44px** sur mobile (via padding ou `min-height`/`min-width`). Les `IconButton` en taille `sm` restent au-dessus de ce seuil.

**Typographie mobile** :
- Body à `15-16px` minimum sur mobile (jamais sous `14px` pour du texte de contenu)
- Titres `4xl` (44px) descendent à `3xl` (32px) sous `md`
- Titres `3xl` (32px) descendent à `2xl` (24px) sous `md`
- Line-length naturellement contraint par le viewport — pas de limite manuelle sous `md`

**Layout & composants** :
- `AppHeader` : nav complète ≥ `lg` · menu burger plein écran < `lg` (panel slide depuis la droite, même tokens visuels)
- `BentoGrid` : 6 colonnes `xl`, 4 colonnes `lg`, 2 colonnes `md`, 1 colonne en base — cartes `2×2` deviennent `1×1` sous `md`
- `DataTable` : tableau horizontalement scrollable sous `lg` (`overflow-x-auto`) avec la colonne clé (titre / nom) en `sticky left-0`. Pas de transformation en cartes empilées : les pages `admin/*` et `inventory/*` sont déclarées **desktop-first en usage** (mobile = lecture secondaire).
- `TableToolbar` : search et chips passent en stack vertical sous `md`, scrollable horizontalement si les chips débordent
- `FormActions` : sticky bottom sur mobile (`< md`), inline à droite dès `md`
- `FormSection` : 2 colonnes ≥ `md`, 1 colonne en base
- `Modal` / `Dialog` : fullscreen sous `sm`, fenêtre centrée au-dessus
- `NavDropdown` : bascule en accordéon dans le burger menu mobile (pas de dropdown flottant)
- `CycleTimeline` : horizontale ≥ `md`, verticale en base

**Sécurité mobile** :
- `viewport` meta : `width=device-width, initial-scale=1` vérifié dans `_document.js`
- Aucun scroll horizontal non-intentionnel (audit visuel sur chaque page migrée)
- Images et SVG responsives (`max-width: 100%`, pas de largeur fixe en px)
- Inputs type correct (`type="email"`, `type="tel"`, `type="date"`) pour faire apparaître le bon clavier
- Désactivation du zoom auto iOS : `font-size: 16px` minimum sur inputs (évite le zoom involontaire au focus)

**Dark mode mobile** :
- Tokens `bg #0A0E1A` et `surface #111726` compatibles OLED (pas de noir absolu pour limiter l'effet halo)
- Même ratio de contraste que desktop (WCAG AA garanti)

**Perf mobile** :
- `SeasonalLayer` réduit la densité de particules sous `md` (voir section 6)
- `next/font` avec `display: swap` pour éviter le FOIT
- Pas d'animation coûteuse (box-shadow, filter blur lourd) déclenchée sur hover côté mobile — on se rabat sur `:active`

---

## 4. Bibliothèque de composants

### Organisation dossier

```
client/src/components/
├── ui/            # primitives UI (autonomes, non métier)
├── patterns/      # compositions métier
├── layout/        # AppHeader, Footer, SeasonalLayer
└── theme/         # SeasonalControl (remplace les toggles saisonniers)
```

### Primitives UI (`ui/`)

| Composant | Variantes / states |
|---|---|
| `Button` | `primary \| ghost \| outline \| danger \| subtle` · `sm \| md \| lg` · loading, disabled |
| `IconButton` | `default \| ghost \| danger` · sizes |
| `Input` | states: default / focus / error / disabled / readonly |
| `Textarea` | auto-grow optionnel |
| `Select` | native + custom searchable variant |
| `Checkbox`, `Radio`, `Switch` | avec label, description optionnelle |
| `FileInput` | drag & drop + preview (PDF Simulated) |
| `Badge` | `pending \| approved \| changes \| rejected \| neutral \| new` + dot animé optionnel |
| `Modal` | backdrop blur, slide-up, ESC + click-outside |
| `Dialog` | variante légère (confirmations) |
| `Tooltip` | délai 400ms, max-width 240px |
| `Progress` | linear + circular |
| `Skeleton` | remplace les "Chargement..." texte partout |
| `Tabs` | underline primary, pas de fond plein |
| `Pagination` | chevrons + compteur "X-Y sur Z" |
| `Breadcrumb` | séparateur `·` |
| `Card` | surface de base — radius `md`/`lg`, padding 22 |

### Patterns métier (`patterns/`)

| Pattern | Description |
|---|---|
| `AppHeader` | nouveau — fond surface, nav avec état actif, dropdowns Soumettre/Hub, avatar, icônes recherche/thème |
| `NavDropdown` | animation open/close, click-outside propre |
| `BentoGrid` | wrapper grid 6 colonnes responsive |
| `BentoCard` | variante hero (gradient primary) + variantes neutres |
| `KpiCard` | label + valeur + delta (up/down/neutral) |
| `DataTable` | header sticky, hover row, tri par colonne, pagination intégrée |
| `TableToolbar` | search input + FilterChips + CTA |
| `FilterChips` | remplace les boutons statuts colorés actuels |
| `PageHead` | breadcrumb + titre + CTA |
| `FormField` | wrapper Label + Control + Hint + ErrorMessage |
| `FormSection` | fieldset avec légende, grille responsive |
| `FormActions` | sticky bottom mobile, inline desktop |
| `EmptyState` | illustration SVG + texte + CTA |
| `ErrorPage` | 404/500/accès refusé — illustration + titre + CTA retour |
| `ProjectCard` | refonte — Card + Badge statut + méta |
| `WorkshopCard` | même base + badge "places disponibles" |
| `StatusBadge` | mapping statut → variante Badge |
| `CreditChip` | monospace, couleur selon valeur (0=gris, 0.5-1=amber, 1.5+=green) |
| `ChangeHistory` | timeline verticale des modifications (restylé) |
| `CycleTimeline` | nouveau — ligne horizontale Simulated (start → defense → submission) |
| `DoubleCycleToggle` | switch admin avec explication |
| `SubjectFilePreview` | PDF/image preview + bouton "Ouvrir en plein" |

### DatePicker — décision

**Option A retenue** : on garde `<input type="date">` natif, restylé via tokens (border, focus, typo, padding). Zero nouvelle dépendance, zero risque sur la validation des dates de cycle. Upgrade vers picker custom (`react-day-picker`) reporté en PR de suivi optionnelle.

### Composants supprimés / fusionnés

Remplacés par la nouvelle implémentation. **La suppression effective n'a lieu qu'en Phase 8**, une fois toutes les pages migrées — en attendant, les anciens et les nouveaux cohabitent dans le repo.

- `Header.js` → nouveau `AppHeader`
- `SpringToggle.js`, `ChristmasToggle.js` → fusionnés en `SeasonalControl`
- `Snowfall.js`, `PetalFall.js`, `ChristmasBackground.js`, `SpringBackground.js` → fusionnés en `SeasonalLayer` unique
- `ThemeSwitcher.js` → intégré dans `AppHeader` comme `IconButton` standard
- Pages consommant ces composants ajustées en conséquence lors de leurs phases de migration respectives

---

## 5. Patterns de pages

### Pattern A — Landing / Home

**Pages concernées** : `/` (public), `/` (connecté), `/glossaire`

```
AppHeader
 ┌ Hero: eyebrow badge · titre 4xl · sous-titre · CTAs
 ├ BentoGrid: 1 carte héros gradient + 4 cartes neutres
 └ Footer
```

- `/` non connecté : Hero + bouton "Connexion Microsoft", pas de bento
- `/` connecté : Hero personnalisé + Bento 5 sections (Projets en cours, Soumettre, Workshops, Simulated, Inventaire)
- `/glossaire` : Hero compact + contenu 2 colonnes (main + sommaire sticky)

### Pattern B — Dashboard / Liste

**Pages concernées** : `/dashboard`, `/admin/dashboard`, `/workshops/dashboard`, `/admin/workshops/dashboard`, `/simulated/mes-projets`, `/inventory`, `/admin/inventory`

```
AppHeader
 ┌ PageHead: breadcrumb · titre · CTA primary
 ├ KpiRow (4 colonnes, label + valeur + delta)
 ├ TableToolbar: search + FilterChips
 ├ DataTable: header sticky · hover row · badges · actions
 └ Pagination
```

**KPIs par page** :

- `/dashboard` étudiant : en attente / validés / à revoir / crédits totaux
- `/admin/dashboard` : en attente global / soumis aujourd'hui / mon quota review / validés ce mois
- `/workshops/*` : colonnes nom, places, session, statut
- `/simulated/mes-projets` : cycle, projet, statut, crédits, dernière maj
- `/inventory*` : outil, catégorie, disponibilité, emprunteur (+ QR/RFID/actions pour admin)

### Pattern C — Détail d'item

**Pages concernées** : `/projects/[id]`, `/admin/projects/[id]`, `/workshops/[id]`, `/admin/workshops/[id]`, `/simulated/[id]`, `/admin/simulated/enrollments/[id]`, `/inventory/scan/[id]`

```
AppHeader
 ┌ PageHead: breadcrumb · titre · StatusBadge · actions
 ├ Grid 2 cols desktop / 1 col mobile:
 │   ├ Main (2/3): sections Détails, Description, Historique
 │   └ Sidebar (1/3): Meta card · TimelineCard · Actions card
 └ Footer
```

Variantes notables :

- `/simulated/[id]` étudiant : CycleTimeline + champ GitHub éditable si `!lockedByAdmin`
- `/admin/simulated/enrollments/[id]` : + panneau review (credits input, status select, commentaire textarea)
- `/inventory/scan/[id]` : variante mobile-friendly fullscreen pour scan

### Pattern D — Formulaire

**Pages concernées** : `/submit-project`, `/projects/edit/[id]`, `/submit-workshop`, `/workshops/edit/[id]`

```
AppHeader
 ┌ PageHead: breadcrumb · titre
 ├ Card max 720px:
 │   ├ FormSection "Informations" (2 cols)
 │   ├ FormSection "Détails" (textarea wide)
 │   └ FormSection "Pièces jointes" (Simulated)
 ├ FormActions: "Annuler" (ghost) + "Soumettre" (primary)
 │              sticky bottom sur mobile
 └ Footer
```

### Pattern E — Admin multi-onglet

**Pages concernées** : `/admin/simulated`, `/admin/inventory`

```
AppHeader
 ┌ PageHead: titre + description
 ├ Tabs (underline primary):
 │   ├ Onglet 1 (= Pattern B)
 │   ├ Onglet 2
 │   └ Onglet 3
 └ Footer
```

- `/admin/simulated` : onglets Catalogue / Cycles / Suivis étudiants / Export CSV
- `/admin/inventory` : onglets Liste outils / Catégories / Emprunts actifs / Import RFID

### Cas particulier — Catalogue Simulated

**Page** : `/simulated` (choix de projet étudiant)

```
AppHeader
 ┌ PageHead avec sous-titre (cycle en cours, deadline)
 ├ Grid responsive 3 cols: cartes projet
 │    - disponibles = cliquables, hover lift
 │    - "déjà faites" = opacité 60%, badge gris, non-cliquables
 └ CTA sticky bottom: "Valider mon choix" (activé après sélection)
```

### Cas particulier — Auth callback

`/auth/callback` : juste un `LoadingState` centré. Comportement inchangé.

### Cas particulier — Pages d'erreur

Nouveau pattern `ErrorPage` pour 404, 500, accès refusé : illustration SVG légère + titre + message + CTA retour.

---

## 6. Thèmes saisonniers (option B validée)

**Principe** : accents subtils, design system reste maître. Aucune repeinture globale.

### Mécanisme unifié

Un seul composant `SeasonalLayer` lit un état global (`localStorage` key conservée pour ne pas perdre les préférences utilisateurs) et applique :

1. Un accent chromatique dans **2 zones ciblées** : carte héros du bento (gradient saisonnier) + badge eyebrow du hero accueil
2. Une **mini-décoration SVG** dans l'AppHeader (sapin pour Noël, pétale pour Printemps, 16px, animée en hover)
3. Un **voile d'ambiance full-page** : particules `position: fixed`, `pointer-events: none`, `z-index: 1`, densité réduite (max 20 particules), respect `prefers-reduced-motion`

### Noël

```
seasonal-primary       #DC2626  (remplace bleu dans héros/eyebrow)
seasonal-accent        #EAB308  (or, déjà dans palette)
seasonal-decoration    SVG sapin header + flocons (Snowfall simplifié)
seasonal-bg-tint       rgba(220,38,38,.02)
```

**Activation** : togglable admin + auto du 1er décembre au 6 janvier.

### Printemps

```
seasonal-primary       #EC4899  (remplace bleu dans héros/eyebrow)
seasonal-accent        #22C55E  (vert, déjà dans palette)
seasonal-decoration    SVG pétale header + pétales flottants (PetalFall simplifié)
seasonal-bg-tint       rgba(236,72,153,.02)
```

**Activation** : togglable admin + auto du 20 mars au 20 juin.

### Dark mode saisonnier

- Noël : `#F87171` pour les accents, flocons argentés
- Printemps : `#F472B6`, pétales avec glow subtil

### Simplifications par rapport à l'existant

- **Supprime** les variants Tailwind `spring:` et `christmas:` dans les composants (plus besoin)
- **Fusionne** `SpringToggle` + `ChristmasToggle` en un seul `SeasonalControl` (dropdown Auto / Aucun / Noël / Printemps)
- **Réduit** la densité des particules (perf mobile)
- **Conserve** la clé `localStorage` existante
- **Extensible** : accepte un 3ème thème (Halloween, Hub Fest…) sans toucher au design system

---

## 7. Stratégie de migration

### Branche & CI

- Branche : `feature/ui-redesign` depuis `master` (créée)
- Rebase périodique sur `master` si nouvelles PR mergent
- Aucun changement backend → tests backend restent verts
- Pas de tests frontend existants → pas de régression CI à craindre

### 8 phases (1 commit majeur par phase)

**Phase 1 — Fondations**

- Ajout `Plus Jakarta Sans` + `JetBrains Mono` via `next/font` (importés dans `pages/_app.js`, variables CSS exposées)
- Extension `tailwind.config.js` avec palette sémantique, `fontFamily`, `boxShadow`, `borderRadius`
- Réécriture `globals.css` : tokens CSS vars light + dark + seasonal (en complément, pas en remplacement brutal, pour que les pages existantes continuent de fonctionner)
- Aucun rendu visible modifié à ce stade

**Phase 2 — Primitives UI** (`client/src/components/ui/`)

- Tous les composants listés section 4
- Autonomes, documentés via props, isolés des pages
- Pages existantes inchangées

**Phase 3 — Patterns & layout**

- Création des nouveaux `AppHeader`, `Footer` (restylé), `SeasonalLayer`, `SeasonalControl` — **en cohabitation** avec l'ancien `Header.js` et les toggles existants (pas encore supprimés pour ne pas casser les pages non-migrées)
- Création des patterns : `DataTable`, `TableToolbar`, `FilterChips`, `KpiCard`, `BentoCard`, `BentoGrid`, `PageHead`, `FormField`, `FormSection`, `FormActions`, `CycleTimeline`
- Les pages existantes continuent d'utiliser l'ancien `Header.js` jusqu'à leur migration en Phases 4-7

**Phase 4 — Pattern A : Home + Glossaire**

- `/` (login + connecté) + `/glossaire`
- Validation visuelle avant d'avancer

**Phase 5 — Pattern B : dashboards & listes**

- 7 pages dashboard (étudiant + admin, projets + workshops + simulated + inventaire)
- Un seul `DataTable` derrière

**Phase 6 — Pattern C : pages détail**

- 7 pages détail (projet, workshop, simulated, scan)
- `ChangeHistory`, `CycleTimeline`, review admin panel

**Phase 7 — Pattern D + E : formulaires + admin multi-onglet**

- 4 pages formulaire
- `/admin/simulated` (4 onglets), `/admin/inventory` (4 onglets)
- Catalogue `/simulated`

**Phase 8 — Polish & nettoyage**

- `ErrorPage` (404/500/accès refusé)
- Audit a11y : contraste, focus, `prefers-reduced-motion`, alt/aria
- Test responsive 375/768/1024/1440
- **Suppression effective** des anciens composants une fois qu'aucune page ne les importe : `Header.js`, `SpringToggle.js`, `ChristmasToggle.js`, `Snowfall.js`, `PetalFall.js`, `SpringBackground.js`, `ChristmasBackground.js`, `ThemeSwitcher.js`
- Nettoyage des anciens tokens CSS dans `globals.css` devenus inutilisés
- Suppression des variants Tailwind `christmas:` et `spring:` dans `tailwind.config.js`
- Suppression code mort, imports orphelins
- Mise à jour README/docs si nécessaire

### Validation qualité avant PR

- **Manuel** : chaque page en light + dark + Noël + Printemps
- **Responsive** : 375, 640, 768, 1024, 1280, 1440 — vérifier absence de scroll horizontal involontaire et lisibilité des tables scrollables
- **Mobile** : burger menu fonctionnel, touch targets ≥ 44px, inputs natifs déclenchent le bon clavier, pas de zoom auto iOS sur focus input
- **A11y** : Lighthouse + navigation clavier + VoiceOver sanity check
- **Perf** : Lighthouse ≥ 90 sur pages publiques (desktop et mobile)

### PR & merge

- **1 PR finale** `feature/ui-redesign` → `master`
- Commits structurés par phase pour que le reviewer puisse dérouler la timeline
- Screenshots light + dark de chaque pattern dans la description
- Checklist pré-merge issue du skill `ui-ux-pro-max`

### Risques & mitigation

| Risque | Mitigation |
|---|---|
| Conflit avec PR en cours | Rebase régulier sur `master` |
| Breaking visuel invisible côté backend | Revue manuelle soignée avant merge, screenshots dans la PR |
| Préférences utilisateurs saisonnières perdues | Clé `localStorage` existante conservée |
| Performance bundle alourdie | `next/font` = pas de CLS, 2 woff2 en preload |

---

## 8. Références implémentation

### Fichiers clés à modifier / créer

**Configuration** :
- `client/tailwind.config.js` (étendu)
- `client/src/styles/globals.css` (réécrit tokens)
- `client/src/pages/_app.js` (intégration `next/font`)

**Layout** :
- `client/src/components/layout/AppHeader.js` (nouveau)
- `client/src/components/layout/Footer.js` (restylé)
- `client/src/components/layout/SeasonalLayer.js` (nouveau, fusion)
- `client/src/components/theme/SeasonalControl.js` (nouveau, remplace toggles)

**Primitives** :
- `client/src/components/ui/Button.js`, `Badge.js`, `Input.js`, `Card.js`, `Modal.js`, `Tabs.js`, `DataTable.js`, etc.

**Patterns** :
- `client/src/components/patterns/BentoGrid.js`, `KpiCard.js`, `ProjectCard.js`, `WorkshopCard.js`, `StatusBadge.js`, `CreditChip.js`, `ChangeHistory.js`, `CycleTimeline.js`, etc.

**Pages** (refonte progressive, pas de modif de logique) :
- Toutes les pages sous `client/src/pages/`

### Fichiers supprimés

- `client/src/components/layout/Header.js`
- `client/src/components/theme/SpringToggle.js`
- `client/src/components/theme/ChristmasToggle.js`
- `client/src/components/theme/Snowfall.js`
- `client/src/components/theme/PetalFall.js`
- `client/src/components/theme/SpringBackground.js`
- `client/src/components/theme/ChristmasBackground.js`
- `client/src/components/theme/ThemeSwitcher.js` (intégré dans `AppHeader`)

---

## 9. Critères d'acceptation

- [ ] Toutes les 24 pages existantes fonctionnent identiquement (workflow métier préservé)
- [ ] Light mode et dark mode validés sur chaque page
- [ ] Thèmes Noël et Printemps activables via `SeasonalControl`, persistés
- [ ] Responsive validé sur 375, 768, 1024, 1440
- [ ] Contrastes WCAG AA+ sur tous les éléments textuels
- [ ] Focus visible au clavier sur tous les éléments interactifs
- [ ] `prefers-reduced-motion` respecté
- [ ] Aucune régression fonctionnelle : soumissions de projet/workshop, validations admin, envois d'emails, uploads PDF, cycles Simulated, emprunts inventaire, scan QR — tous testés
- [ ] Tests backend existants passent sans modification
- [ ] PR review positive + screenshots fournis
