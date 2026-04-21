# Refonte graphique Hub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Moderniser visuellement le Hub Project Platform (tokens, typographie, composants, layout, thèmes saisonniers simplifiés, mobile) sans modifier aucune logique métier, en 8 phases incrémentales sur la branche `feature/ui-redesign`.

**Architecture:** Migration progressive avec cohabitation. Les tokens et la bibliothèque de composants sont construits d'abord (phases 1-3), puis chaque groupe de pages est migré un par un (phases 4-7), avec suppression finale des anciens composants (phase 8). Chaque commit laisse toutes les pages fonctionnelles.

**Tech Stack:** Next.js 12.2.3 (pages router), React 18, Tailwind 3, next-themes, `next/font` (à ajouter), MongoDB/Mongoose (backend non touché).

**Spec de référence:** `docs/superpowers/specs/2026-04-21-refonte-graphique-hub-design.md`

## Notes d'adaptation TDD

Aucun test frontend n'existe sur ce projet et la refonte est purement visuelle. La vérification s'appuie sur :

- `npm run build` doit réussir après chaque tâche qui touche le client
- Une page de smoke-test `client/src/pages/_tokens-preview.js` est créée en Phase 1 et enrichie au fil des phases — elle rend chaque primitive/pattern dans ses variantes et modes (light/dark/Noël/Printemps). Supprimée en Phase 8.
- Navigation manuelle sur la page migrée après chaque migration (liens, actions, dropdowns, modals)
- Audit Lighthouse a11y + perf en fin de phase 7
- Commits fréquents (un par tâche terminée), format `feat(ui):`, `chore(ui):`, `refactor(ui):`, `docs(ui):`

Pour la logique pure (utilitaires extraits), des tests légers sont ajoutés (phase 2, helper `cn` et helper seasonal).

---

## File Structure

### Nouveaux fichiers créés

```
client/src/
├── components/
│   ├── ui/                        # primitives
│   │   ├── Button.js
│   │   ├── IconButton.js
│   │   ├── Input.js
│   │   ├── Textarea.js
│   │   ├── Select.js
│   │   ├── Checkbox.js
│   │   ├── Radio.js
│   │   ├── Switch.js
│   │   ├── FileInput.js
│   │   ├── Badge.js
│   │   ├── Card.js
│   │   ├── Modal.js
│   │   ├── Dialog.js
│   │   ├── Tooltip.js
│   │   ├── Progress.js
│   │   ├── Skeleton.js
│   │   ├── Tabs.js
│   │   ├── Pagination.js
│   │   └── Breadcrumb.js
│   ├── patterns/                  # compositions métier
│   │   ├── AppHeader.js
│   │   ├── NavDropdown.js
│   │   ├── MobileNavPanel.js
│   │   ├── BentoGrid.js
│   │   ├── BentoCard.js
│   │   ├── KpiCard.js
│   │   ├── DataTable.js
│   │   ├── TableToolbar.js
│   │   ├── FilterChips.js
│   │   ├── PageHead.js
│   │   ├── FormField.js
│   │   ├── FormSection.js
│   │   ├── FormActions.js
│   │   ├── EmptyState.js
│   │   ├── ErrorPage.js
│   │   ├── StatusBadge.js
│   │   ├── CreditChip.js
│   │   ├── ChangeHistory.js
│   │   ├── CycleTimeline.js
│   │   ├── DoubleCycleToggle.js
│   │   ├── SubjectFilePreview.js
│   │   ├── ProjectCard.js         # remplace components/projects/ProjectCard.js
│   │   └── WorkshopCard.js        # remplace components/workshops/WorkshopCard.js
│   ├── layout/
│   │   ├── SeasonalLayer.js       # fusion Snowfall + PetalFall + backgrounds
│   │   └── Footer.js              # existant, restylé
│   └── theme/
│       └── SeasonalControl.js     # fusion des toggles saisonniers
├── lib/
│   ├── cn.js                      # classnames helper
│   └── seasonal.js                # détection saison active
├── pages/
│   └── _tokens-preview.js         # smoke test, supprimé en phase 8
└── styles/
    └── globals.css                # réécrit
```

### Fichiers modifiés

```
client/
├── tailwind.config.js             # tokens étendus, mode class
├── package.json                   # ajout @next/font (si Next 12 ne l'a pas)
└── src/
    └── pages/
        └── _app.js                # next/font + SeasonalLayer
```

### Fichiers supprimés (Phase 8 uniquement)

```
client/src/components/
├── layout/Header.js
├── theme/SpringToggle.js
├── theme/ChristmasToggle.js
├── theme/Snowfall.js
├── theme/PetalFall.js
├── theme/SpringBackground.js
├── theme/ChristmasBackground.js
├── theme/ThemeSwitcher.js
├── projects/ProjectCard.js
└── workshops/WorkshopCard.js
```

---

## Phase 1 — Fondations (tokens, typographie, globals, smoke test)

**Objectif :** poser tout ce qui est nécessaire pour construire la bibliothèque de composants. Aucune page utilisateur migrée. À la fin de la phase, les anciennes pages fonctionnent encore comme avant (nouveaux tokens non consommés).

### Task 1.1: Installer et configurer next/font

**Files:**
- Modify: `client/src/pages/_app.js`

Le projet tourne en Next 12.2.3 (vérifié dans `client/package.json`). On installe donc `@next/font` (package séparé en Next 12 ; fusionné dans `next/font` à partir de Next 13).

- [ ] **Step 1: Installer @next/font**

```bash
cd client && npm install @next/font
```
Attendu : install sans conflit avec React 18.

- [ ] **Step 2: Intégrer les polices dans _app.js**

Ajouter en tête de fichier :

```js
import { Plus_Jakarta_Sans, JetBrains_Mono } from '@next/font/google';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-mono',
  display: 'swap',
});
```

Wrapper le contenu de `MyApp` avec les classes variables :

```js
<div className={`${jakarta.variable} ${mono.variable} font-sans`}>
  {/* existant */}
</div>
```

- [ ] **Step 3: Build + vérif visuelle**

```bash
cd client && npm run dev
```
Ouvrir `http://localhost:3000`, vérifier que le site rend encore sans régression (le `font-sans` est nouveau mais remplace les fonts par défaut). Ouvrir DevTools > Network, vérifier que deux fichiers `.woff2` sont chargés.

- [ ] **Step 4: Commit**

```bash
git add client/package.json client/package-lock.json client/src/pages/_app.js
git commit -m "feat(ui): integrate Plus Jakarta Sans and JetBrains Mono via next/font"
```

### Task 1.2: Étendre tailwind.config.js avec les tokens

**Files:**
- Modify: `client/tailwind.config.js`

- [ ] **Step 1: Lire le fichier actuel pour connaître la structure**

```bash
cat client/tailwind.config.js
```

- [ ] **Step 2: Remplacer la section `theme.extend` par :**

```js
extend: {
  fontFamily: {
    sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
    mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
  },
  colors: {
    // tokens dynamiques via CSS vars
    primary: 'rgb(var(--primary) / <alpha-value>)',
    'primary-hover': 'rgb(var(--primary-hover) / <alpha-value>)',
    'primary-ghost': 'rgb(var(--primary-ghost) / <alpha-value>)',
    'primary-border': 'rgb(var(--primary-border) / <alpha-value>)',
    secondary: 'rgb(var(--secondary) / <alpha-value>)',
    accent: 'rgb(var(--accent) / <alpha-value>)',
    danger: 'rgb(var(--danger) / <alpha-value>)',
    bg: 'rgb(var(--bg) / <alpha-value>)',
    surface: 'rgb(var(--surface) / <alpha-value>)',
    'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
    border: 'rgb(var(--border) / <alpha-value>)',
    'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',
    text: 'rgb(var(--text) / <alpha-value>)',
    'text-muted': 'rgb(var(--text-muted) / <alpha-value>)',
    'text-dim': 'rgb(var(--text-dim) / <alpha-value>)',
    // saisonniers conservés
    'christmas-red': '#DC2626',
    'christmas-green': '#15803D',
    'christmas-gold': '#EAB308',
    'spring-pink': '#EC4899',
    'spring-green': '#22C55E',
    'spring-yellow': '#FDE68A',
    'spring-sky': '#38BDF8',
  },
  borderRadius: {
    sm: '8px',
    md: '10px',
    lg: '12px',
    xl: '20px',
    full: '9999px',
  },
  boxShadow: {
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow-md)',
    lg: 'var(--shadow-lg)',
  },
  spacing: {
    '4.5': '18px',
    '5.5': '22px',
  },
  fontSize: {
    xs: ['12px', { lineHeight: '1.5' }],
    sm: ['13.5px', { lineHeight: '1.5' }],
    base: ['14px', { lineHeight: '1.6' }],
    md: ['15px', { lineHeight: '1.6' }],
    lg: ['17px', { lineHeight: '1.5' }],
    xl: ['20px', { lineHeight: '1.3' }],
    '2xl': ['24px', { lineHeight: '1.25' }],
    '3xl': ['32px', { lineHeight: '1.15' }],
    '4xl': ['44px', { lineHeight: '1.1' }],
  },
  letterSpacing: {
    tight: '-0.025em',
    snug: '-0.01em',
  },
  transitionTimingFunction: {
    smooth: 'cubic-bezier(.4, 0, .2, 1)',
  },
  transitionDuration: {
    150: '150ms',
    200: '200ms',
    300: '300ms',
  },
  maxWidth: {
    container: '1280px',
  },
},
```

Conserver les variants `christmas` et `spring` existants inchangés.

- [ ] **Step 3: Vérifier que le build passe**

```bash
cd client && npm run build
```
Attendu : build succeeds (warnings tolérés, pas d'erreur).

- [ ] **Step 4: Commit**

```bash
git add client/tailwind.config.js
git commit -m "feat(ui): extend tailwind config with design tokens"
```

### Task 1.3: Réécrire globals.css avec tous les tokens

**Files:**
- Modify: `client/src/styles/globals.css`

- [ ] **Step 1: Sauvegarder l'ancien fichier**

```bash
cp client/src/styles/globals.css client/src/styles/globals.css.bak
```

- [ ] **Step 2: Remplacer le contenu par :**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Couleurs sémantiques — LIGHT */
    --primary: 59 130 246;
    --primary-hover: 37 99 235;
    --primary-ghost: 239 246 255;
    --primary-border: 191 219 254;
    --secondary: 21 128 61;
    --accent: 234 179 8;
    --danger: 220 38 38;

    --bg: 247 249 252;
    --surface: 255 255 255;
    --surface-2: 250 251 252;
    --border: 228 231 236;
    --border-strong: 203 213 225;
    --text: 15 23 42;
    --text-muted: 71 85 105;
    --text-dim: 148 163 184;

    /* Status — LIGHT */
    --status-pending-bg: 239 246 255;
    --status-pending-text: 37 99 235;
    --status-approved-bg: 220 252 231;
    --status-approved-text: 21 128 61;
    --status-changes-bg: 254 243 199;
    --status-changes-text: 180 83 9;
    --status-rejected-bg: 254 226 226;
    --status-rejected-text: 185 28 28;

    /* Ombres */
    --shadow-sm: 0 1px 2px rgba(16, 24, 40, .04);
    --shadow-md: 0 4px 10px rgba(16, 24, 40, .06), 0 2px 4px rgba(16, 24, 40, .04);
    --shadow-lg: 0 14px 28px rgba(16, 24, 40, .10), 0 4px 8px rgba(16, 24, 40, .06);
  }

  .dark {
    --primary: 96 165 250;
    --primary-hover: 59 130 246;
    --primary-ghost: 30 58 138;
    --primary-border: 59 130 246;
    --secondary: 74 222 128;
    --accent: 250 204 21;
    --danger: 248 113 113;

    --bg: 10 14 26;
    --surface: 17 23 38;
    --surface-2: 15 20 34;
    --border: 31 38 55;
    --border-strong: 42 52 73;
    --text: 241 245 249;
    --text-muted: 148 163 184;
    --text-dim: 100 116 139;

    --status-pending-bg: 30 58 138;
    --status-pending-text: 147 197 253;
    --status-approved-bg: 20 83 45;
    --status-approved-text: 134 239 172;
    --status-changes-bg: 113 63 18;
    --status-changes-text: 253 224 71;
    --status-rejected-bg: 127 29 29;
    --status-rejected-text: 252 165 165;

    --shadow-sm: 0 1px 2px rgba(0, 0, 0, .3);
    --shadow-md: 0 6px 18px rgba(0, 0, 0, .4);
    --shadow-lg: 0 20px 45px rgba(0, 0, 0, .5);
  }

  /* Thèmes saisonniers — accent only */
  :root.christmas {
    --primary: 220 38 38;
    --primary-hover: 185 28 28;
    --primary-ghost: 254 226 226;
    --primary-border: 252 165 165;
    --accent: 234 179 8;
  }

  .dark.christmas {
    --primary: 248 113 113;
    --primary-hover: 239 68 68;
    --primary-ghost: 127 29 29;
    --primary-border: 185 28 28;
    --accent: 250 204 21;
  }

  :root.spring {
    --primary: 236 72 153;
    --primary-hover: 219 39 119;
    --primary-ghost: 253 242 248;
    --primary-border: 251 207 232;
    --accent: 34 197 94;
  }

  .dark.spring {
    --primary: 244 114 182;
    --primary-hover: 236 72 153;
    --primary-ghost: 131 24 67;
    --primary-border: 190 24 93;
    --accent: 74 222 128;
  }

  html {
    font-family: var(--font-sans), system-ui, sans-serif;
    font-feature-settings: 'ss01', 'cv11';
  }

  body {
    background-color: rgb(var(--bg));
    color: rgb(var(--text));
    -webkit-font-smoothing: antialiased;
  }

  /* Focus visible global */
  *:focus-visible {
    outline: 2px solid rgb(var(--primary) / .5);
    outline-offset: 2px;
    border-radius: 4px;
  }

  /* Respect prefers-reduced-motion */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
}
```

- [ ] **Step 3: Lancer `npm run dev` et vérifier qu'aucune page ne casse**

```bash
cd client && npm run dev
```
Ouvrir `http://localhost:3000/`, `/dashboard`, `/glossaire`, `/inventory`. Les couleurs vont changer (primary devient plus vif) mais la structure reste identique.

- [ ] **Step 4: Supprimer le backup**

```bash
rm client/src/styles/globals.css.bak
```

- [ ] **Step 5: Commit**

```bash
git add client/src/styles/globals.css
git commit -m "feat(ui): rewrite globals.css with design tokens (light/dark/seasonal)"
```

### Task 1.4: Créer les helpers lib/cn.js et lib/seasonal.js

**Files:**
- Create: `client/src/lib/cn.js`
- Create: `client/src/lib/seasonal.js`

Note : le projet n'a pas de framework de test frontend (pas de Jest dans `package.json`). Vérification par exécution directe via Node à la Step 3.

- [ ] **Step 1: Créer `client/src/lib/cn.js`**

```js
export function cn(...args) {
  return args
    .flat(Infinity)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Step 2: Créer `client/src/lib/seasonal.js`**

```js
export function getActiveSeason(date = new Date()) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  // Noël : 1er décembre - 5 janvier
  if ((m === 12) || (m === 1 && d <= 5)) return 'christmas';
  // Printemps : 20 mars - 20 juin
  if ((m === 3 && d >= 20) || m === 4 || m === 5 || (m === 6 && d <= 20)) return 'spring';
  return null;
}

export function getSeasonalPreference() {
  if (typeof window === 'undefined') return 'auto';
  return localStorage.getItem('seasonal-preference') || 'auto';
}

export function setSeasonalPreference(value) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('seasonal-preference', value);
}

export function resolveSeason(preference, date = new Date()) {
  if (preference === 'off') return null;
  if (preference === 'christmas' || preference === 'spring') return preference;
  return getActiveSeason(date); // 'auto'
}
```

- [ ] **Step 3: Vérifier qu'aucun appel manuel ne casse**

```bash
cd client && node -e "const {getActiveSeason, resolveSeason} = require('./src/lib/seasonal.js'); console.log(getActiveSeason(new Date(2026,11,15)), getActiveSeason(new Date(2026,3,1)), getActiveSeason(new Date(2026,6,1)));"
```
Attendu : `christmas spring null`.

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/cn.js client/src/lib/seasonal.js
git commit -m "feat(ui): add cn and seasonal helpers"
```

### Task 1.5: Créer la page de preview _tokens-preview.js

**Files:**
- Create: `client/src/pages/_tokens-preview.js`

Cette page sert de terrain de jeu pour valider tous les primitives/patterns au fur et à mesure. Elle montre chaque composant dans toutes ses variantes, en light/dark/Noël/Printemps.

- [ ] **Step 1: Créer la page avec un squelette minimal**

```jsx
import { useTheme } from 'next-themes';
import { useState } from 'react';

export default function TokensPreview() {
  const { theme, setTheme } = useTheme();
  const [season, setSeason] = useState('none');

  const setSeasonClass = (s) => {
    document.documentElement.classList.remove('christmas', 'spring');
    if (s === 'christmas' || s === 'spring') {
      document.documentElement.classList.add(s);
    }
    setSeason(s);
  };

  return (
    <div className="min-h-screen bg-bg text-text p-8 font-sans">
      <div className="max-w-container mx-auto space-y-12">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Tokens & Components Preview</h1>
          <div className="flex gap-2">
            <button onClick={() => setTheme('light')} className="px-3 py-2 rounded-md border border-border text-sm">Light</button>
            <button onClick={() => setTheme('dark')} className="px-3 py-2 rounded-md border border-border text-sm">Dark</button>
            <button onClick={() => setSeasonClass('none')} className="px-3 py-2 rounded-md border border-border text-sm">Off</button>
            <button onClick={() => setSeasonClass('christmas')} className="px-3 py-2 rounded-md border border-border text-sm">Christmas</button>
            <button onClick={() => setSeasonClass('spring')} className="px-3 py-2 rounded-md border border-border text-sm">Spring</button>
          </div>
        </header>

        <section>
          <h2 className="text-xl font-semibold mb-4">Colors</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {['primary', 'secondary', 'accent', 'danger', 'bg', 'surface', 'surface-2', 'border', 'border-strong', 'text', 'text-muted', 'text-dim'].map((t) => (
              <div key={t} className="rounded-md border border-border overflow-hidden">
                <div className={`h-16 bg-${t}`} />
                <div className="p-2 text-xs font-mono">{t}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Typography</h2>
          <div className="space-y-2">
            <div className="text-4xl font-bold tracking-tight">Display 4xl / 44px</div>
            <div className="text-3xl font-bold tracking-tight">Title 3xl / 32px</div>
            <div className="text-2xl font-semibold tracking-tight">Section 2xl / 24px</div>
            <div className="text-xl font-semibold">Subtitle xl / 20px</div>
            <div className="text-lg">Lead lg / 17px</div>
            <div className="text-md">Body md / 15px</div>
            <div className="text-base">Base 14px</div>
            <div className="text-sm text-text-muted">Small sm / 13.5px muted</div>
            <div className="text-xs text-text-dim">XS 12px dim</div>
            <div className="font-mono text-sm">JetBrains Mono sample 1234.56</div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Shadows</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="h-20 bg-surface rounded-lg shadow-sm flex items-center justify-center text-sm">sm</div>
            <div className="h-20 bg-surface rounded-lg shadow-md flex items-center justify-center text-sm">md</div>
            <div className="h-20 bg-surface rounded-lg shadow-lg flex items-center justify-center text-sm">lg</div>
          </div>
        </section>

        {/* Les sections suivantes seront ajoutées au fil des phases */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Components</h2>
          <p className="text-text-muted">Ajoutés au fil des phases 2 et 3.</p>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier le rendu**

```bash
cd client && npm run dev
```
Ouvrir `http://localhost:3000/_tokens-preview`. Tester les 4 combinaisons light/dark/Noël/Printemps. Vérifier que toutes les couleurs changent cohéremment.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/_tokens-preview.js
git commit -m "feat(ui): add tokens preview page for smoke testing"
```

---

## Phase 2 — Primitives UI

**Objectif :** construire la bibliothèque de primitives autonomes. Chaque composant est ajouté à la page `_tokens-preview.js` dans ses variantes principales. Aucun import dans les pages utilisateur.

**Pattern commun pour chaque primitive :**
- Créer le composant avec props, variants, states
- L'ajouter dans `_tokens-preview.js`
- Vérifier visuellement light/dark/Noël/Printemps
- Commit `feat(ui): add <Component>`

Pour alléger la lecture, les tâches ci-dessous donnent l'API attendue ; le code complet de chaque primitive est produit pendant l'implémentation en respectant tokens et focus states déjà définis.

### Task 2.1: Button.js

**Files:**
- Create: `client/src/components/ui/Button.js`
- Modify: `client/src/pages/_tokens-preview.js` (ajouter section Buttons)

API attendue :
```js
<Button variant="primary|ghost|outline|danger|subtle" size="sm|md|lg" loading={bool} disabled={bool} as="a|button" href={string}>
  Label
</Button>
```

Détails :
- Classes primary : `bg-primary text-white hover:bg-primary-hover`
- Ghost : `bg-transparent text-primary hover:bg-primary-ghost`
- Outline : `border border-primary text-primary hover:bg-primary-ghost`
- Danger : `bg-danger text-white hover:opacity-90`
- Subtle : `bg-surface-2 text-text hover:bg-border`
- Sizes : `sm` h-8 px-3 text-sm, `md` h-10 px-4 text-base, `lg` h-12 px-5 text-md
- Loading : spinner SVG + label disabled, garde les dimensions
- `rounded-md`, `transition-colors duration-200 ease-smooth`, `font-medium`
- Touch target garanti (min h-10 sur mobile)

- [ ] Créer le composant
- [ ] Ajouter section dans `_tokens-preview.js` : 5 variantes × 3 tailles + état loading + disabled
- [ ] Vérifier visuel 4 modes
- [ ] Commit : `git add client/src/components/ui/Button.js client/src/pages/_tokens-preview.js && git commit -m "feat(ui): add Button primitive"`

### Task 2.2: IconButton.js

**Files:**
- Create: `client/src/components/ui/IconButton.js`
- Modify: `client/src/pages/_tokens-preview.js`

API : `<IconButton variant="default|ghost|danger" size="sm|md|lg" aria-label="..."><Icon /></IconButton>`

Détails :
- Carré, `rounded-md`, contient l'icône centrée
- Sizes : `sm` 32×32, `md` 40×40, `lg` 44×44 (= touch target)
- `aria-label` requis en dev (log warning sinon)

- [ ] Créer + preview + commit

### Task 2.3: Input.js + Textarea.js + Select.js

**Files:**
- Create: `client/src/components/ui/Input.js`
- Create: `client/src/components/ui/Textarea.js`
- Create: `client/src/components/ui/Select.js`
- Modify: `client/src/pages/_tokens-preview.js`

API Input : `<Input type="..." error={bool} leadingIcon={ReactNode} trailingIcon={ReactNode} {...props} />`
- `h-10 md:h-11 px-3 text-base bg-surface border border-border rounded-md`
- `focus:border-primary focus:ring-2 focus:ring-primary/30`
- `disabled:bg-surface-2 disabled:text-text-dim`
- `error: border-danger focus:ring-danger/30`
- **Mobile** : `font-size: 16px` sur mobile (évite zoom iOS) → style inline

Textarea : même styles, auto-grow optionnel via `onInput` qui ajuste `element.style.height`.

Select : variante native stylée, et variante searchable custom (reporté en post-refonte si complexe — on commit la native only dans ce plan).

- [ ] Créer les 3 fichiers (Select = native stylée uniquement)
- [ ] Ajouter section formulaire dans preview (input normal, erreur, disabled, textarea, select)
- [ ] Commit : `feat(ui): add Input, Textarea, Select primitives`

### Task 2.4: Checkbox.js + Radio.js + Switch.js

**Files:**
- Create: `client/src/components/ui/Checkbox.js`
- Create: `client/src/components/ui/Radio.js`
- Create: `client/src/components/ui/Switch.js`
- Modify: `client/src/pages/_tokens-preview.js`

API commune : `<Checkbox label="..." description="..." checked={bool} onChange={fn} />`, idem Radio et Switch.
- Checkbox/Radio : input natif masqué + visuel custom via `<span>`, `checked:bg-primary checked:border-primary`
- Switch : toggle 44×24 avec cercle animé, couleur primary quand ON
- Zone cliquable minimale 44×44 via padding

- [ ] Créer + preview (4 états de chaque : off / on / disabled / with description)
- [ ] Commit : `feat(ui): add Checkbox, Radio, Switch primitives`

### Task 2.5: FileInput.js

**Files:**
- Create: `client/src/components/ui/FileInput.js`
- Modify: `client/src/pages/_tokens-preview.js`

API : `<FileInput accept="application/pdf,image/*" onChange={fn} maxSize={5000000} preview={bool} />`
- Drag & drop avec highlight primary sur dragover
- Preview PDF : affiche le nom + bouton "Aperçu" (ouvre dans modal Phase 3)
- Preview image : miniature
- Messages d'erreur : taille dépassée, type non accepté

- [ ] Créer + preview (un avec preview PDF mock, un avec image)
- [ ] Commit : `feat(ui): add FileInput primitive`

### Task 2.6: Badge.js

**Files:**
- Create: `client/src/components/ui/Badge.js`
- Modify: `client/src/pages/_tokens-preview.js`

API : `<Badge variant="pending|approved|changes|rejected|neutral|new" dot={bool} size="sm|md">Label</Badge>`
- Utilise tokens status : `bg-[rgb(var(--status-<variant>-bg))] text-[rgb(var(--status-<variant>-text))]`
- `rounded-full px-2.5 py-0.5 text-xs font-medium`
- `dot` : petit cercle 8px devant le label, animation `pulse` si `variant="new"`

- [ ] Créer + preview (6 variantes, avec et sans dot, 2 tailles)
- [ ] Commit : `feat(ui): add Badge primitive`

### Task 2.7: Card.js

**Files:**
- Create: `client/src/components/ui/Card.js`
- Modify: `client/src/pages/_tokens-preview.js`

API : `<Card padding="default|compact|none" interactive={bool} as="div|a" {...props}>children</Card>`
- `bg-surface border border-border rounded-lg shadow-sm`
- `padding="default"` : `p-5.5` (22px)
- `padding="compact"` : `p-4.5` (18px)
- `interactive` : `hover:shadow-md transition-shadow duration-200 cursor-pointer`
- Slot `<Card.Header>`, `<Card.Body>`, `<Card.Footer>` exportés comme static props

- [ ] Créer + preview (3 variantes)
- [ ] Commit : `feat(ui): add Card primitive`

### Task 2.8: Modal.js + Dialog.js

**Files:**
- Create: `client/src/components/ui/Modal.js`
- Create: `client/src/components/ui/Dialog.js`
- Modify: `client/src/pages/_tokens-preview.js`

Modal :
- Backdrop `bg-black/40 backdrop-blur-sm`
- Contenu `bg-surface rounded-xl shadow-lg max-w-lg w-full`
- **Mobile** : `max-w-none h-full w-full rounded-none sm:rounded-xl sm:max-w-lg sm:h-auto`
- Animation slide-up 300ms ease-smooth
- Fermeture : ESC, click backdrop, bouton close
- Focus trap (implémenté avec `useEffect` qui focus le premier focusable et loop)
- Body scroll lock pendant l'ouverture

Dialog : variante légère, même API mais taille réduite (`max-w-sm`), pour confirmations.

- [ ] Créer + preview (bouton qui ouvre chaque)
- [ ] Commit : `feat(ui): add Modal and Dialog primitives`

### Task 2.9: Tooltip.js

**Files:**
- Create: `client/src/components/ui/Tooltip.js`
- Modify: `client/src/pages/_tokens-preview.js`

API : `<Tooltip content="..." placement="top|bottom|left|right" delay={400}>{children}</Tooltip>`
- Affiché après délai sur hover / focus
- `bg-text text-surface text-xs rounded-md px-2 py-1 max-w-60`
- Sur mobile (`hover: none`), remplacé par une opacité `:active` briève
- Position calculée par rapport au trigger (pas de lib : `getBoundingClientRect`)

- [ ] Créer + preview
- [ ] Commit : `feat(ui): add Tooltip primitive`

### Task 2.10: Progress.js + Skeleton.js

**Files:**
- Create: `client/src/components/ui/Progress.js`
- Create: `client/src/components/ui/Skeleton.js`
- Modify: `client/src/pages/_tokens-preview.js`

Progress : linear et circular, `<Progress value={70} max={100} variant="linear|circular" label="..." />`
- Linear : barre `h-2 bg-surface-2 rounded-full`, fill `bg-primary rounded-full transition-all duration-300`
- Circular : SVG `<circle>` avec `stroke-dasharray`

Skeleton : `<Skeleton variant="text|circle|rect" width height className />`
- Animation shimmer : `bg-gradient-to-r from-surface-2 via-border to-surface-2 bg-[length:200%_100%] animate-[shimmer_1.5s_infinite]`
- Ajouter keyframe `shimmer` dans globals.css : `@keyframes shimmer { from { background-position: 200% 0 } to { background-position: -200% 0 } }`

- [ ] Créer + preview
- [ ] Ajouter keyframe shimmer à globals.css
- [ ] Commit : `feat(ui): add Progress and Skeleton primitives`

### Task 2.11: Tabs.js + Pagination.js + Breadcrumb.js

**Files:**
- Create: `client/src/components/ui/Tabs.js`
- Create: `client/src/components/ui/Pagination.js`
- Create: `client/src/components/ui/Breadcrumb.js`
- Modify: `client/src/pages/_tokens-preview.js`

Tabs :
- API : `<Tabs items={[{id, label, content}]} defaultValue={id} />`
- Style underline : `border-b-2 border-transparent aria-selected:border-primary`
- `aria-selected` + navigation clavier (flèches)

Pagination :
- API : `<Pagination page={n} totalPages={n} onChange={fn} />`
- Chevrons + "X-Y sur Z"
- Sur mobile : juste chevrons + compteur

Breadcrumb :
- API : `<Breadcrumb items={[{label, href}]} />`
- Séparateur `·`
- Dernier item non cliquable, `text-text-muted`

- [ ] Créer + preview
- [ ] Commit : `feat(ui): add Tabs, Pagination, Breadcrumb primitives`

---

## Phase 3 — Patterns & Layout

**Objectif :** construire les compositions métier et le nouveau layout. La cohabitation est critique : les anciens composants (`Header.js`, `Snowfall.js`, etc.) restent en place pour les pages non migrées.

### Task 3.1: SeasonalLayer.js (fusion des 4 backgrounds)

**Files:**
- Create: `client/src/components/layout/SeasonalLayer.js`
- Modify: `client/src/pages/_app.js`

Unifie `Snowfall`, `PetalFall`, `SpringBackground`, `ChristmasBackground` en un seul composant. Lit la préférence via `lib/seasonal.js`.

Comportement :
- `useEffect` applique/retire les classes `christmas`/`spring` sur `document.documentElement`
- Rend une couche `<canvas>` ou `<div>` d'effets de particules selon la saison active
- Densité de particules adaptée au viewport : sous 768px, divise par 2
- Respect `prefers-reduced-motion` : désactive les animations
- Pas de DOM rendu si `preference === 'off'` ou saison inactive

- [ ] Lire `Snowfall.js`, `PetalFall.js`, `SpringBackground.js`, `ChristmasBackground.js` pour extraire la logique particules
- [ ] Fusionner dans `SeasonalLayer.js` avec switch sur la saison active
- [ ] Dans `_app.js` : remplacer `<SpringBackground />` et `<PetalFall />` par `<SeasonalLayer />`. Laisser `Snowfall` et `ChristmasBackground` inchangés temporairement s'ils sont importés ailleurs (ils ne le sont pas — vérifier avec grep)
- [ ] Vérifier en dev : activer Noël puis Printemps, observer les particules
- [ ] Commit : `feat(ui): add unified SeasonalLayer`

### Task 3.2: SeasonalControl.js (fusion des toggles)

**Files:**
- Create: `client/src/components/theme/SeasonalControl.js`

Remplace `SpringToggle` et `ChristmasToggle`. Utilise `lib/seasonal.js` pour la préférence.

API : `<SeasonalControl />` — un bouton icône qui ouvre un menu :
- `Auto` (défaut) — résout selon la date
- `Noël` — force
- `Printemps` — force
- `Désactivé` — pas d'animation

- [ ] Créer le composant (icône flocon/pétale selon saison active)
- [ ] Ajouter à `_tokens-preview.js` pour tester
- [ ] Commit : `feat(ui): add SeasonalControl`

### Task 3.3: AppHeader.js + NavDropdown.js + MobileNavPanel.js

**Files:**
- Create: `client/src/components/patterns/AppHeader.js`
- Create: `client/src/components/patterns/NavDropdown.js`
- Create: `client/src/components/patterns/MobileNavPanel.js`

**AppHeader responsabilités :**
- Remplace `layout/Header.js` (qui reste en place jusqu'en Phase 8)
- Logo Hub à gauche, nav centrée (desktop) ou burger (mobile), actions à droite
- Dropdowns : Soumettre (projet / workshop) et Hub (projets / workshops / simulated / inventaire)
- Actions droite : `SeasonalControl`, `ThemeSwitcher` remplacé par `IconButton` theme, avatar utilisateur + menu déconnexion
- Mobile (`< lg`) : burger ouvre `MobileNavPanel` slide-in depuis la droite
- Sticky top avec backdrop blur quand on scrolle : `sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-border`

**NavDropdown :**
- API : `<NavDropdown label="Soumettre" items={[{label, href}]} />`
- Click-outside et ESC ferment le menu
- Animation open : fade + scale 0.95→1, 200ms
- Highlight item actif (compare `asPath` du router)

**MobileNavPanel :**
- Full-screen `<div className="fixed inset-0 z-40 bg-surface">` avec header (logo + close)
- Liens en accordion pour les sections avec sous-items
- Actions en bas : avatar + déconnexion, SeasonalControl, ThemeSwitcher
- Slide-in depuis la droite, 300ms

- [ ] Lire l'ancien `Header.js` pour extraire les labels/liens exacts (ne pas deviner)
- [ ] Créer `NavDropdown.js` d'abord (composant plus simple)
- [ ] Créer `MobileNavPanel.js`
- [ ] Créer `AppHeader.js` en composant les deux
- [ ] Ajouter une démo dans `_tokens-preview.js` (ou créer page de test temporaire)
- [ ] Vérifier visuel en dev
- [ ] Commit : `feat(ui): add AppHeader with NavDropdown and MobileNavPanel`

### Task 3.4: BentoGrid.js + BentoCard.js + KpiCard.js

**Files:**
- Create: `client/src/components/patterns/BentoGrid.js`
- Create: `client/src/components/patterns/BentoCard.js`
- Create: `client/src/components/patterns/KpiCard.js`

**BentoGrid :**
- API : `<BentoGrid>{children}</BentoGrid>`
- `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4`
- Cartes enfants utilisent `col-span-*` et `row-span-*`

**BentoCard :**
- API : `<BentoCard variant="hero|neutral|accent" size="1x1|2x1|2x2|3x2" icon={ReactNode} title href>{children}</BentoCard>`
- Hero : `bg-gradient-to-br from-primary to-primary-hover text-white`
- Neutral : `bg-surface border border-border`
- Accent : `bg-primary-ghost border border-primary-border`
- `rounded-xl p-5.5 shadow-sm hover:shadow-md transition-shadow duration-200`
- Props de taille appliquent `col-span-*` / `row-span-*` responsive

**KpiCard :**
- API : `<KpiCard label="..." value="42" delta={{ value: "+3%", direction: "up|down|neutral" }} icon={ReactNode} />`
- Label en `text-text-muted text-xs uppercase tracking-snug`
- Value en `text-3xl font-bold tracking-tight font-mono`
- Delta en `text-sm` avec couleur selon direction (green up, red down, muted neutral)

- [ ] Créer les 3 fichiers
- [ ] Ajouter une démo dans `_tokens-preview.js` : un BentoGrid avec 5 cartes de tailles variées + 3 KpiCards
- [ ] Vérifier responsive (resize fenêtre, DevTools device mode)
- [ ] Commit : `feat(ui): add BentoGrid, BentoCard, KpiCard`

### Task 3.5: DataTable.js + TableToolbar.js + FilterChips.js

**Files:**
- Create: `client/src/components/patterns/DataTable.js`
- Create: `client/src/components/patterns/TableToolbar.js`
- Create: `client/src/components/patterns/FilterChips.js`

**DataTable :**
- API : `<DataTable columns={[{key, label, render?, sortable?, width?}]} data={[]} keyField="id" onRowClick={fn} emptyState={ReactNode} loading={bool} />`
- `<table>` HTML sémantique avec `<thead>` sticky
- Header `bg-surface-2 border-b border-border text-text-muted text-xs uppercase tracking-snug`
- Row hover `hover:bg-surface-2 cursor-pointer` si `onRowClick`
- Sort : click header (si sortable), affiche chevron
- **Mobile (< lg)** : wrapper `overflow-x-auto` ; colonne `key` avec flag `sticky` reçoit `sticky left-0 bg-surface`
- `loading` : render 5 lignes Skeleton
- `emptyState` : render dans un `<tr><td colSpan>` centré

**TableToolbar :**
- API : `<TableToolbar search={{ value, onChange, placeholder }} filters={ReactNode} actions={ReactNode} />`
- Search à gauche (icône loupe + Input), filtres au milieu, actions à droite
- Mobile : stack vertical, actions en dernier

**FilterChips :**
- API : `<FilterChips options={[{value, label, count?}]} value={selectedValue} onChange={fn} allLabel="Tous" />`
- Bouton pillule `rounded-full px-3 py-1.5 text-sm border` + compteur en Badge
- État actif : `bg-primary text-white border-primary`
- Scrollable horizontalement si débordement (`overflow-x-auto flex gap-2`)

- [ ] Créer les 3 fichiers
- [ ] Ajouter démo dans `_tokens-preview.js` : une table de 5 lignes avec toolbar + chips
- [ ] Tester responsive et scroll horizontal mobile
- [ ] Commit : `feat(ui): add DataTable, TableToolbar, FilterChips`

### Task 3.6: PageHead.js + FormField.js + FormSection.js + FormActions.js

**Files:**
- Create: `client/src/components/patterns/PageHead.js`
- Create: `client/src/components/patterns/FormField.js`
- Create: `client/src/components/patterns/FormSection.js`
- Create: `client/src/components/patterns/FormActions.js`

**PageHead :** breadcrumb + titre + description optionnelle + CTA
- `<PageHead breadcrumb={[...]} title="..." description="..." actions={ReactNode} />`

**FormField :** wrapper Label + Input/control + Hint + ErrorMessage
- `<FormField label="..." htmlFor="id" hint="..." error="..." required>{control}</FormField>`
- Label `text-sm font-medium text-text mb-1.5 block`, astérisque primary si required
- Hint `text-xs text-text-muted mt-1`
- Error `text-xs text-danger mt-1` avec `role="alert"`

**FormSection :** fieldset avec légende, grille responsive 2 cols desktop / 1 col mobile
- `<FormSection title="..." description="...">{children}</FormSection>`

**FormActions :**
- `<FormActions primary={<Button/>} secondary={<Button/>} />`
- Mobile : `fixed bottom-0 inset-x-0 bg-surface border-t border-border p-4 z-20 flex gap-3`
- Desktop (`md+`) : inline à droite `flex justify-end gap-3 pt-6 border-t border-border`
- Padding sécurité mobile : `env(safe-area-inset-bottom)`

- [ ] Créer les 4 fichiers
- [ ] Ajouter une démo formulaire complet dans `_tokens-preview.js`
- [ ] Tester sticky bottom mobile (DevTools mobile)
- [ ] Commit : `feat(ui): add PageHead, FormField, FormSection, FormActions`

### Task 3.7: EmptyState.js + ErrorPage.js

**Files:**
- Create: `client/src/components/patterns/EmptyState.js`
- Create: `client/src/components/patterns/ErrorPage.js`

**EmptyState :** illustration SVG + titre + description + CTA
- `<EmptyState icon={ReactNode} title="..." description="..." action={<Button />} />`
- Centré, padding généreux, illustration ~120px

**ErrorPage :** pour 404 / 500 / accès refusé
- `<ErrorPage code="404" title="Page introuvable" description="..." action={<Button />} />`
- Layout centré, code en `text-4xl` primary, retour accueil en CTA

- [ ] Créer + preview
- [ ] Commit : `feat(ui): add EmptyState and ErrorPage patterns`

### Task 3.8: StatusBadge + CreditChip + ChangeHistory + CycleTimeline + DoubleCycleToggle + SubjectFilePreview

**Files:**
- Create: `client/src/components/patterns/StatusBadge.js`
- Create: `client/src/components/patterns/CreditChip.js`
- Create: `client/src/components/patterns/ChangeHistory.js`
- Create: `client/src/components/patterns/CycleTimeline.js`
- Create: `client/src/components/patterns/DoubleCycleToggle.js`
- Create: `client/src/components/patterns/SubjectFilePreview.js`

**StatusBadge :** wrapper de `Badge` qui mappe `'pending'|'approved'|'pending_changes'|'rejected'` sur les variantes Badge
- `<StatusBadge status="pending" />` → "En attente", Badge pending

**CreditChip :** affiche un nombre de crédits en police monospace
- `<CreditChip value={1.5} />`
- `font-mono text-sm px-2.5 py-1 rounded-full`
- Couleur : 0 = `bg-surface-2 text-text-dim`, 0.5-1 = `bg-[status-changes-bg] text-[status-changes-text]`, 1.5+ = `bg-[status-approved-bg] text-[status-approved-text]`

**ChangeHistory :** timeline verticale des modifications
- `<ChangeHistory entries={[{date, actor, action, diff}]} />`
- Point coloré + date + acteur + description
- `border-l border-border` avec point `-ml-1.5` absolute

**CycleTimeline :** ligne horizontale Simulated (start → defense → submission)
- `<CycleTimeline start={date} defense={date} submission={date} currentDate={date} />`
- 3 points reliés par une ligne, état coché/actuel/à venir avec couleurs
- Desktop horizontal, mobile (`< md`) vertical

**DoubleCycleToggle :** switch admin avec explication intégrée
- `<DoubleCycleToggle enabled={bool} onChange={fn} />`
- Switch + label "Double cycle" + texte d'aide sur les crédits étendus

**SubjectFilePreview :** aperçu PDF/image + bouton ouvrir en plein
- `<SubjectFilePreview url="..." type="pdf|image" title="..." />`
- PDF : thumbnail via `<iframe>` ou icône + "Ouvrir"
- Image : `<img>` avec click → Modal plein écran

- [ ] Créer les 6 fichiers
- [ ] Ajouter dans `_tokens-preview.js`
- [ ] Commit : `feat(ui): add domain patterns (StatusBadge, CreditChip, timelines, toggles)`

### Task 3.9: ProjectCard.js + WorkshopCard.js (nouveaux)

**Files:**
- Create: `client/src/components/patterns/ProjectCard.js`
- Create: `client/src/components/patterns/WorkshopCard.js`

Nouveaux dans `patterns/`. Les anciens dans `components/projects/` et `components/workshops/` restent (cohabitation) et seront supprimés en Phase 8.

**ProjectCard :**
- `<ProjectCard project={{...}} onClick={fn} />`
- Card + StatusBadge + titre + description tronquée + méta (date, auteur, membres)
- Hover : shadow-md

**WorkshopCard :**
- `<WorkshopCard workshop={{...}} onClick={fn} />`
- Même base + Badge "X/Y places" ou "Complet"

- [ ] Créer les deux en lisant les anciens pour préserver le contrat de props
- [ ] Ajouter dans `_tokens-preview.js` avec des mocks
- [ ] Commit : `feat(ui): add new ProjectCard and WorkshopCard`

### Task 3.10: Footer.js (restylé)

**Files:**
- Modify: `client/src/components/layout/Footer.js`

Le Footer actuel fait 343B — probablement très minimal. On le restyle avec tokens.

- [ ] Lire le fichier actuel
- [ ] Le restyler : `bg-surface border-t border-border mt-16 py-8 text-sm text-text-muted`, 3 colonnes max (à propos, liens, légal)
- [ ] Commit : `refactor(ui): restyle Footer with design tokens`

---

## Phase 4 — Migration Home & Glossaire

**Objectif :** migrer les pages les plus visibles (accueil + glossaire). C'est la première migration end-to-end, elle valide que les primitives et patterns sont utilisables.

Principe de migration pour chaque page :
1. Remplacer l'import `Header` par `AppHeader`
2. Remplacer les primitives inline (boutons, inputs, cartes) par les composants de `ui/`
3. Appliquer les patterns (`BentoGrid`, `PageHead`, etc.) là où la spec le prévoit
4. Vérifier que le comportement (liens, états, auth) reste identique
5. Tester en dev : light/dark, mobile/desktop, auth/non-auth
6. Commit

### Task 4.1: Migrer pages/index.js (accueil public)

**Files:**
- Modify: `client/src/pages/index.js`

Structure cible :
- `AppHeader` (état non-connecté)
- Section Hero : eyebrow badge "Epitech Nice" + titre 4xl + sous-titre + Button primary "Connexion Microsoft"
- Pas de bento en non-connecté
- Footer

- [ ] Lire le fichier actuel pour comprendre la logique d'auth
- [ ] Réécrire avec les nouveaux composants en préservant la redirection vers `/auth/*`
- [ ] Tester en dev non connecté
- [ ] Commit : `refactor(ui): migrate home page to new design system`

### Task 4.2: Migrer pages/dashboard.js (accueil connecté)

**Files:**
- Modify: `client/src/pages/dashboard.js`

Structure cible :
- `AppHeader` connecté
- Hero personnalisé : "Bonjour, {prenom}" + sous-titre
- `BentoGrid` 5 sections :
  - Projets en cours (hero 2×2, gradient primary)
  - Soumettre (1×1)
  - Workshops (1×1)
  - Simulated (2×1)
  - Inventaire (1×1)
- Chaque carte = `BentoCard` avec lien interne

- [ ] Lire le fichier actuel pour les données affichées
- [ ] Réécrire en préservant les requêtes/données
- [ ] Tester responsive (bento doit reflow correctement)
- [ ] Commit : `refactor(ui): migrate dashboard to bento grid`

### Task 4.3: Migrer pages/glossaire.js

**Files:**
- Modify: `client/src/pages/glossaire.js`

Structure cible :
- `AppHeader`
- `PageHead` avec titre "Glossaire" et description
- Layout 2 colonnes : contenu principal à gauche, sommaire sticky à droite (`lg:sticky lg:top-24`)
- Sections avec `<h2>` ancré (`id` + scroll-margin), liste de termes en cartes

- [ ] Lire le fichier actuel (15KB, beaucoup de contenu texte)
- [ ] Réécrire en préservant tous les termes et définitions
- [ ] Générer les ancres automatiquement à partir des titres
- [ ] Tester scroll / lien sommaire / mobile (sommaire passe en accordéon collapsable)
- [ ] Commit : `refactor(ui): migrate glossaire with TOC layout`

---

## Phase 5 — Migration Dashboards (admin + user)

**Objectif :** migrer les pages à forte densité de données (dashboards admin et vues utilisateur listing).

### Task 5.1: Migrer pages/admin/dashboard.js

**Files:**
- Modify: `client/src/pages/admin/dashboard.js`

Structure cible :
- `AppHeader` admin
- `PageHead` "Administration" + description
- `BentoGrid` de `KpiCard` (compte projets pending, approved, etc. + shortcuts)
- Pas de table ici (c'est un hub)

- [ ] Lire le fichier actuel
- [ ] Extraire les KPIs et shortcuts affichés
- [ ] Réécrire avec `KpiCard` + `BentoCard`
- [ ] Tester
- [ ] Commit : `refactor(ui): migrate admin dashboard to KPI cards`

### Task 5.2: Migrer pages/admin/projects/[id].js (dashboard projets admin)

**Files:**
- Modify: `client/src/pages/admin/projects/[id].js`

**Attention :** malgré le nom `[id].js`, lire le fichier (27KB) pour comprendre si c'est vraiment une page de détail ou un listing mal nommé.

Si c'est une page de **listing** (filtre par statut, table de projets) :
- `AppHeader`
- `PageHead` "Gestion des projets"
- `TableToolbar` avec search + `FilterChips` (statuts : tous/pending/approved/changes/rejected)
- `DataTable` avec colonnes : titre / auteur / date / statut (StatusBadge) / actions
- Click row → navigation vers la page détail

Si c'est une **page détail** :
- `AppHeader`
- `PageHead` avec breadcrumb Admin › Projets › [titre]
- `Card` principal avec info projet
- `ChangeHistory` pour l'historique
- `FormActions` avec boutons approve/reject/request-changes

- [ ] Lire pour déterminer le type
- [ ] Appliquer la structure correspondante
- [ ] Préserver toutes les actions admin et les appels API
- [ ] Commit : `refactor(ui): migrate admin projects page`

### Task 5.3: Migrer pages/admin/workshops/dashboard.js et pages/admin/workshops/[id].js

**Files:**
- Modify: `client/src/pages/admin/workshops/dashboard.js`
- Modify: `client/src/pages/admin/workshops/[id].js`

Même structure que 5.2 (listing + détail workshops). Deux commits séparés.

- [ ] Migrer dashboard (listing)
- [ ] Commit : `refactor(ui): migrate admin workshops dashboard`
- [ ] Migrer détail
- [ ] Commit : `refactor(ui): migrate admin workshops detail page`

### Task 5.4: Migrer pages/admin/simulated/index.js (gros fichier — 66KB)

**Files:**
- Modify: `client/src/pages/admin/simulated/index.js`

Ce fichier contient probablement 2 onglets (Catalogue + Suivis étudiants) et des modals. Très dense.

Plan de migration :
- Extraire chaque onglet en composant local (`<CatalogTab>`, `<EnrollmentsTab>`) à l'intérieur du fichier — pas de nouveau fichier pour éviter de toucher la structure
- Utiliser `Tabs` primitive
- Onglet Catalogue : `TableToolbar` + `DataTable` de projets catalogue + Modal création/édition
- Onglet Suivis : `TableToolbar` + `FilterChips` (statuts) + `DataTable` d'enrollments
- **DatePickers natifs** : restylés via tokens Input (déjà fait en Phase 2), logique préservée
- Modals : utiliser `Modal` primitive, préserver upload PDF avec `FileInput`

- [ ] Lire le fichier en détail (sections par sections)
- [ ] Identifier les sous-composants à extraire
- [ ] Migrer onglet Catalogue, vérifier CRUD complet en dev
- [ ] Commit : `refactor(ui): migrate admin simulated catalog tab`
- [ ] Migrer onglet Suivis
- [ ] Commit : `refactor(ui): migrate admin simulated enrollments tab`

### Task 5.5: Migrer pages/admin/inventory.js (41KB)

**Files:**
- Modify: `client/src/pages/admin/inventory.js`

Page probablement composée de : listing d'outils + gestion ajout/édition + historique prêts + scan RFID. Très dense.

- [ ] Lire le fichier et identifier les sections
- [ ] Appliquer pattern Admin : `PageHead` + `Tabs` si plusieurs sections + `DataTable` + Modals
- [ ] Préserver toute la logique (scan RFID, import CSV, etc.)
- [ ] Tester en dev
- [ ] Commit : `refactor(ui): migrate admin inventory page`

### Task 5.6: Migrer pages/inventory.js (vue publique inventaire)

**Files:**
- Modify: `client/src/pages/inventory.js`

Vue étudiante de l'inventaire : grille de cartes outils + modal détail + bouton emprunt.

Structure cible :
- `AppHeader`
- `PageHead` "Inventaire"
- `TableToolbar` avec search + `FilterChips` (catégories / disponibilité)
- Grille responsive de `Card` outils (3 cols desktop, 2 tablet, 1 mobile)
- Modal détail : `Modal` primitive, bouton emprunt en `Button primary`

- [ ] Lire le fichier actuel
- [ ] Migrer
- [ ] Commit : `refactor(ui): migrate public inventory page`

### Task 5.7: Migrer pages/workshops/dashboard.js et pages/simulated/index.js

**Files:**
- Modify: `client/src/pages/workshops/dashboard.js`
- Modify: `client/src/pages/simulated/index.js`

**workshops/dashboard.js :** listing public workshops
- `PageHead` + `TableToolbar` + grille de `WorkshopCard`

**simulated/index.js (18KB) :** catalogue étudiant Simulated
- `PageHead` + grille de cartes catalogue avec preview PDF via `SubjectFilePreview`
- Projets déjà faits grisés (opacité 50% + badge "Déjà réalisé")
- Click → modal avec détails + bouton "Choisir ce projet"

- [ ] Migrer workshops/dashboard.js
- [ ] Commit : `refactor(ui): migrate public workshops dashboard`
- [ ] Migrer simulated/index.js
- [ ] Commit : `refactor(ui): migrate simulated catalog page`

### Task 5.8: Migrer pages/simulated/mes-projets.js

**Files:**
- Modify: `client/src/pages/simulated/mes-projets.js`

Vue cycle étudiant : statut actuel + deadline + GitHub link + historique.
- `PageHead` "Mes cycles Simulated"
- `Card` du cycle en cours avec `CycleTimeline`, `StatusBadge`, `CreditChip`, lien GitHub éditable via `FormField` + `Input`
- Liste des cycles précédents en dessous (collapsed)
- `ChangeHistory` par cycle

- [ ] Migrer
- [ ] Commit : `refactor(ui): migrate simulated mes-projets page`

---

## Phase 6 — Migration pages de détail

**Objectif :** migrer les pages de détail (un projet, un workshop, un enrollment).

### Task 6.1: Migrer pages/projects/[id].js et pages/simulated/[id].js

**Files:**
- Modify: `client/src/pages/projects/[id].js`
- Modify: `client/src/pages/simulated/[id].js`

Pattern commun détail :
- `AppHeader`
- `PageHead` avec breadcrumb (Hub › Projets › [titre]) + titre + actions (edit si autorisé)
- Layout 2 colonnes (`lg:grid-cols-[2fr_1fr]`) :
  - Gauche : Card info projet + `ChangeHistory`
  - Droite : Card méta (statut, crédits, dates) + actions
- Simulated ajoute `CycleTimeline` et `SubjectFilePreview`

- [ ] Migrer `projects/[id].js`
- [ ] Commit : `refactor(ui): migrate project detail page`
- [ ] Migrer `simulated/[id].js`
- [ ] Commit : `refactor(ui): migrate simulated detail page`

### Task 6.2: Migrer pages/workshops/[id].js et pages/admin/simulated/enrollments/[id].js

**Files:**
- Modify: `client/src/pages/workshops/[id].js`
- Modify: `client/src/pages/admin/simulated/enrollments/[id].js`

Même pattern que 6.1. L'enrollment admin ajoute les actions admin (approve/reject/credits/double-cycle) dans la colonne droite.

- [ ] Migrer workshops/[id].js
- [ ] Commit : `refactor(ui): migrate workshop detail page`
- [ ] Migrer enrollments/[id].js en préservant `DoubleCycleToggle` et l'attribution de crédits
- [ ] Commit : `refactor(ui): migrate admin enrollment detail page`

### Task 6.3: Migrer pages/inventory/scan/[id].js

**Files:**
- Modify: `client/src/pages/inventory/scan/[id].js`

Page mobile-first (scan RFID). Structure cible :
- Header minimal (logo + bouton retour)
- Grand visuel outil au centre
- Info clé : nom, statut (disponible / emprunté), utilisateur actuel
- CTA principal pleine largeur (`Button` `w-full` taille `lg`)
- Si admin : actions supplémentaires

- [ ] Migrer en priorisant le mobile (viewport étroit)
- [ ] Commit : `refactor(ui): migrate inventory scan page`

---

## Phase 7 — Migration formulaires & pages admin restantes

**Objectif :** migrer les pages de formulaire (soumission, édition) et les pages auth.

### Task 7.1: Migrer ProjectForm.js et WorkshopForm.js

**Files:**
- Modify: `client/src/components/forms/ProjectForm.js`
- Modify: `client/src/components/forms/WorkshopForm.js`

Ces composants sont consommés par plusieurs pages. On les refond pour utiliser les patterns forms.

Pattern cible :
- `FormSection` pour chaque groupe de champs
- `FormField` pour chaque input
- `FormActions` en pied de formulaire

- [ ] Migrer `ProjectForm.js`
- [ ] Commit : `refactor(ui): migrate ProjectForm to new form patterns`
- [ ] Migrer `WorkshopForm.js`
- [ ] Commit : `refactor(ui): migrate WorkshopForm to new form patterns`

### Task 7.2: Migrer pages/submit-project.js, pages/submit-workshop.js, pages/projects/edit/[id].js, pages/workshops/edit/[id].js

**Files:**
- Modify: `client/src/pages/submit-project.js`
- Modify: `client/src/pages/submit-workshop.js`
- Modify: `client/src/pages/projects/edit/[id].js`
- Modify: `client/src/pages/workshops/edit/[id].js`

Pages fines qui wrappent les `Form` déjà migrés en 7.1. Il reste à ajouter `AppHeader`, `PageHead`, et vérifier que le layout respecte le nouveau design.

- [ ] Migrer submit-project.js
- [ ] Migrer submit-workshop.js
- [ ] Migrer projects/edit/[id].js
- [ ] Migrer workshops/edit/[id].js
- [ ] Commit unique : `refactor(ui): migrate form pages (submit and edit)`

### Task 7.3: Migrer pages/auth/callback.js

**Files:**
- Modify: `client/src/pages/auth/callback.js`

Page transitoire (redirect après OAuth). Afficher un `Skeleton` ou `Progress` centré le temps du traitement.

- [ ] Migrer avec layout minimal (pas de header)
- [ ] Commit : `refactor(ui): migrate auth callback page`

### Task 7.4: Audit responsive et a11y

**Files:**
- Tests manuels sur toutes les pages migrées

- [ ] Ouvrir chaque page migrée aux breakpoints 375/640/768/1024/1280/1440
- [ ] Vérifier : pas de scroll horizontal, touch targets ≥ 44px, burger menu fonctionnel, modals fullscreen mobile
- [ ] Lancer Lighthouse (audit a11y + perf) sur : `/`, `/dashboard`, `/admin/dashboard`, `/glossaire`, `/inventory` — cible ≥ 90 perf desktop et mobile, 100 a11y si possible
- [ ] Navigation clavier (Tab) sur 3 pages types : Home, admin dashboard, submit-project
- [ ] Corriger les problèmes critiques trouvés (contrastes insuffisants, focus manquants, aria-labels oubliés)
- [ ] Commit correctifs : `fix(ui): address audit findings (contrast, focus, aria)`

---

## Phase 8 — Nettoyage final

**Objectif :** supprimer les anciens composants devenus inutilisés et la page de preview.

### Task 8.1: Vérifier qu'aucune page ne consomme les anciens composants

**Files:**
- Grep + fixes si trouvés

- [ ] Lancer les greps suivants et vérifier que les résultats sont vides :

```bash
grep -rn "components/layout/Header" client/src/pages
grep -rn "components/theme/SpringToggle" client/src
grep -rn "components/theme/ChristmasToggle" client/src
grep -rn "components/theme/Snowfall" client/src
grep -rn "components/theme/PetalFall" client/src
grep -rn "components/theme/SpringBackground" client/src
grep -rn "components/theme/ChristmasBackground" client/src
grep -rn "components/theme/ThemeSwitcher" client/src
grep -rn "components/projects/ProjectCard" client/src
grep -rn "components/workshops/WorkshopCard" client/src
```

- [ ] Si un résultat apparaît, ouvrir le fichier concerné et migrer
- [ ] Commit correctif si nécessaire : `refactor(ui): migrate last stragglers to new components`

### Task 8.2: Supprimer les anciens fichiers

**Files:**
- Delete: `client/src/components/layout/Header.js`
- Delete: `client/src/components/theme/SpringToggle.js`
- Delete: `client/src/components/theme/ChristmasToggle.js`
- Delete: `client/src/components/theme/Snowfall.js`
- Delete: `client/src/components/theme/PetalFall.js`
- Delete: `client/src/components/theme/SpringBackground.js`
- Delete: `client/src/components/theme/ChristmasBackground.js`
- Delete: `client/src/components/theme/ThemeSwitcher.js`
- Delete: `client/src/components/projects/ProjectCard.js`
- Delete: `client/src/components/workshops/WorkshopCard.js`

- [ ] Supprimer les fichiers un par un ou en lot
- [ ] Vérifier `npm run build` passe
- [ ] Commit : `chore(ui): remove deprecated components after migration`

### Task 8.3: Supprimer _tokens-preview.js

**Files:**
- Delete: `client/src/pages/_tokens-preview.js`

- [ ] Supprimer la page
- [ ] Vérifier build
- [ ] Commit : `chore(ui): remove tokens preview page`

### Task 8.4: Nettoyer les TODO et commentaires de migration

**Files:**
- Grep dans `client/src` pour `TODO|FIXME|migration`

- [ ] Lancer `grep -rn "TODO\|FIXME" client/src` et nettoyer ceux ajoutés pendant la refonte
- [ ] Commit si nettoyages nécessaires : `chore(ui): cleanup migration notes`

### Task 8.5: Vérif finale complète

**Files:**
- Tests manuels

- [ ] `npm run build` sans erreur ni warning nouveau
- [ ] Parcourir toutes les pages en light + dark + Noël + Printemps
- [ ] Parcourir depuis un compte admin ET un compte étudiant
- [ ] Parcourir en mobile (DevTools, 375px)
- [ ] Lighthouse final sur pages publiques : perf ≥ 90, a11y idéalement 100
- [ ] Screenshots light + dark de chaque pattern pour la description de PR
- [ ] Commit final si correctifs : `fix(ui): final polish`

---

## PR finale

Quand toutes les phases sont terminées :

- [ ] Rebase sur `master` si besoin
- [ ] Ouvrir la PR `feature/ui-redesign` → `master`
- [ ] Description PR avec :
  - Résumé : "Refonte visuelle complète du Hub, sans modification métier"
  - Liste des 8 phases et ce qui a été fait
  - Screenshots avant/après light + dark pour chaque pattern clé (Home, Dashboard, Admin projects, Simulated cycle, Mobile burger)
  - Checklist pré-merge (testé light/dark/saisonniers, responsive 375-1440, a11y OK, Lighthouse OK)
  - Note : "Aucun fichier backend modifié, aucun contrat d'API changé"

---

## Self-review (checklist pré-livraison)

Avant d'ouvrir la PR :

- [ ] Toutes les pages sous `client/src/pages/` ont été migrées (23 pages importaient l'ancien `Header.js` — vérifier le compte)
- [ ] Aucune référence résiduelle aux 10 composants supprimés
- [ ] `npm run build` et `npm run dev` tournent sans erreur
- [ ] Aucune logique backend touchée (grep `git diff master -- server/` doit être vide)
- [ ] `_tokens-preview.js` supprimé
- [ ] Critères d'acceptation de la spec section 9 tous cochés
