# hub-whitelabel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer un nouveau repo `hub-whitelabel` basé sur le Hub Epitech, avec mode démo sans login (données fictives) et système de branding/features configurable via un fichier `client.config.js`.

**Architecture:** Fork du repo `hub-project-platform` dans un dossier séparé (`hub-whitelabel`). La variable d'env `DEMO_MODE=true` active un bypass d'auth backend, un seed automatique de données fictives, et un banner frontend. La configuration white-label (`client.config.js` à la racine) est injectée comme variables `NEXT_PUBLIC_*` au build Next.js via `next.config.js`. Les CSS vars de couleurs sont appliquées via React `style` prop sur le div racine dans `_app.js`.

**Tech Stack:** Next.js 12 (pages router), Tailwind CSS, next-themes, Node/Express, Mongoose/MongoDB, Passport.js, JWT

**Important:** Ce plan s'exécute dans le dossier `/Users/juliani/Desktop/Dev/hub-whitelabel` (créé à la Task 1). Ouvrir une session Claude Code dans ce dossier pour les tasks 2 à 12.

---

### Task 1 : Créer le repo hub-whitelabel

**Files:**
- Create: `/Users/juliani/Desktop/Dev/hub-whitelabel/` (copie de hub-project-platform)

- [ ] **Step 1 : Copier le projet source (sans .git, node_modules, .next)**

```bash
rsync -a \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.superpowers' \
  --exclude='uploads' \
  /Users/juliani/Desktop/Dev/hub-project-platform/ \
  /Users/juliani/Desktop/Dev/hub-whitelabel/
```

- [ ] **Step 2 : Initialiser un nouveau repo Git**

```bash
cd /Users/juliani/Desktop/Dev/hub-whitelabel
git init
git add .
git commit -m "init: base hub-whitelabel depuis hub-project-platform"
```

- [ ] **Step 3 : Installer les dépendances**

```bash
cd /Users/juliani/Desktop/Dev/hub-whitelabel/client && npm install
cd /Users/juliani/Desktop/Dev/hub-whitelabel/server && npm install
```

Expected: pas d'erreurs npm.

- [ ] **Step 4 : Créer server/.env**

```
PORT=5001
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/hub-whitelabel-demo
DEMO_MODE=true
FRONTEND_URL=http://localhost:3000
JWT_SECRET=demo-secret-key-not-for-production
```

- [ ] **Step 5 : Créer client/.env.local**

```
NEXT_PUBLIC_API_URL=http://localhost:5001
```

---

### Task 2 : client.config.js + next.config.js + lib/config.js

**Files:**
- Create: `client.config.js` (racine du repo)
- Create: `client/next.config.js`
- Create: `client/src/lib/config.js`

- [ ] **Step 1 : Créer client.config.js à la racine**

```js
// client.config.js
module.exports = {
  brand: {
    name: 'Hub Projets',
    logo: '/images/logo-dark-mode-hub.png',
    primaryColor: '#2563eb',
    secondaryColor: '#15803d',
    accentColor: '#eab308',
    favicon: '/favicon.ico',
  },
  features: {
    projects: true,
    workshops: true,
    simulated: true,
    inventory: false,
    glossaire: true,
  },
  demo: {
    enabled: true,
    demoRole: 'admin',
    banner: 'Mode Démo — données fictives',
  },
  labels: {
    student: 'Étudiant',
    project: 'Projet',
  },
};
```

- [ ] **Step 2 : Créer client/next.config.js**

```js
// client/next.config.js
const clientConfig = require('../client.config');

function hexToRgbObj(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}
function rgb(o) { return `${o.r} ${o.g} ${o.b}`; }
function darken(o, f) {
  return rgb({ r: Math.round(o.r * f), g: Math.round(o.g * f), b: Math.round(o.b * f) });
}
function lighten(o, f) {
  return rgb({
    r: Math.round(o.r + (255 - o.r) * f),
    g: Math.round(o.g + (255 - o.g) * f),
    b: Math.round(o.b + (255 - o.b) * f),
  });
}

const primary = hexToRgbObj(clientConfig.brand.primaryColor);
const secondary = hexToRgbObj(clientConfig.brand.secondaryColor);
const accent = hexToRgbObj(clientConfig.brand.accentColor);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BRAND_NAME:           clientConfig.brand.name,
    NEXT_PUBLIC_BRAND_LOGO:           clientConfig.brand.logo,
    NEXT_PUBLIC_BRAND_FAVICON:        clientConfig.brand.favicon,
    NEXT_PUBLIC_BRAND_PRIMARY:        rgb(primary),
    NEXT_PUBLIC_BRAND_PRIMARY_HOVER:  darken(primary, 0.85),
    NEXT_PUBLIC_BRAND_PRIMARY_GHOST:  lighten(primary, 0.92),
    NEXT_PUBLIC_BRAND_PRIMARY_BORDER: lighten(primary, 0.65),
    NEXT_PUBLIC_BRAND_SECONDARY:      rgb(secondary),
    NEXT_PUBLIC_BRAND_ACCENT:         rgb(accent),
    NEXT_PUBLIC_FEATURE_PROJECTS:  String(clientConfig.features.projects),
    NEXT_PUBLIC_FEATURE_WORKSHOPS: String(clientConfig.features.workshops),
    NEXT_PUBLIC_FEATURE_SIMULATED: String(clientConfig.features.simulated),
    NEXT_PUBLIC_FEATURE_INVENTORY: String(clientConfig.features.inventory),
    NEXT_PUBLIC_FEATURE_GLOSSAIRE: String(clientConfig.features.glossaire),
    NEXT_PUBLIC_DEMO_ENABLED: String(clientConfig.demo.enabled),
    NEXT_PUBLIC_DEMO_ROLE:    clientConfig.demo.demoRole,
    NEXT_PUBLIC_DEMO_BANNER:  clientConfig.demo.banner,
    NEXT_PUBLIC_LABEL_STUDENT: clientConfig.labels.student,
    NEXT_PUBLIC_LABEL_PROJECT: clientConfig.labels.project,
  },
};

module.exports = nextConfig;
```

- [ ] **Step 3 : Créer client/src/lib/config.js**

```js
// client/src/lib/config.js
export const brand = {
  name:    process.env.NEXT_PUBLIC_BRAND_NAME    || 'Hub Projets',
  logo:    process.env.NEXT_PUBLIC_BRAND_LOGO    || '/images/logo-dark-mode-hub.png',
  favicon: process.env.NEXT_PUBLIC_BRAND_FAVICON || '/favicon.ico',
};

export const cssVars = {
  '--primary':        process.env.NEXT_PUBLIC_BRAND_PRIMARY        || '59 130 246',
  '--primary-hover':  process.env.NEXT_PUBLIC_BRAND_PRIMARY_HOVER  || '37 99 235',
  '--primary-ghost':  process.env.NEXT_PUBLIC_BRAND_PRIMARY_GHOST  || '239 246 255',
  '--primary-border': process.env.NEXT_PUBLIC_BRAND_PRIMARY_BORDER || '191 219 254',
  '--secondary':      process.env.NEXT_PUBLIC_BRAND_SECONDARY      || '21 128 61',
  '--accent':         process.env.NEXT_PUBLIC_BRAND_ACCENT         || '234 179 8',
};

export const demo = {
  enabled: process.env.NEXT_PUBLIC_DEMO_ENABLED === 'true',
  role:    process.env.NEXT_PUBLIC_DEMO_ROLE    || 'admin',
  banner:  process.env.NEXT_PUBLIC_DEMO_BANNER  || 'Mode Démo — données fictives',
};

export const labels = {
  student: process.env.NEXT_PUBLIC_LABEL_STUDENT || 'Étudiant',
  project: process.env.NEXT_PUBLIC_LABEL_PROJECT || 'Projet',
};

export function isFeatureEnabled(key) {
  const val = process.env[`NEXT_PUBLIC_FEATURE_${key.toUpperCase()}`];
  return val !== 'false';
}
```

- [ ] **Step 4 : Commit**

```bash
git add client.config.js client/next.config.js client/src/lib/config.js
git commit -m "feat: client.config.js + next.config.js + lib/config.js"
```

---

### Task 3 : _app.js — CSS vars, titre, favicon et banner démo

**Files:**
- Modify: `client/src/pages/_app.js`

Les CSS vars sont injectées via React `style` prop sur le div racine — pas de innerHTML. Les valeurs viennent de `process.env.NEXT_PUBLIC_*` (build-time, developer-controlled).

- [ ] **Step 1 : Remplacer le contenu de _app.js**

```jsx
// client/src/pages/_app.js
import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { AuthProvider } from "../context/AuthContext";
import { ThemeProvider, useTheme } from "next-themes";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "../styles/globals.css";
import SeasonalLayer from "../components/layout/SeasonalLayer";
import { brand, cssVars, demo, isFeatureEnabled } from "../lib/config";

function ToastWithTheme() {
  const { theme, resolvedTheme } = useTheme();
  const [toastTheme, setToastTheme] = useState("light");
  const [toastStyles, setToastStyles] = useState({});

  useEffect(() => {
    const isDarkMode = theme === 'dark' || resolvedTheme === 'dark';
    setToastTheme(isDarkMode ? "dark" : "light");
    setToastStyles({
      backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
      color: isDarkMode ? '#f3f4f6' : '#1f2937',
    });
  }, [theme, resolvedTheme]);

  return (
    <ToastContainer
      position="top-right"
      autoClose={5000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme={toastTheme}
      toastStyle={toastStyles}
    />
  );
}

function DemoBanner() {
  if (!demo.enabled) return null;
  return (
    <div
      style={{
        background: '#1e3a5f',
        color: '#93c5fd',
        padding: '8px 16px',
        fontSize: '13px',
        textAlign: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      <strong>Mode Demo</strong> {"—"} {demo.banner}
    </div>
  );
}

// Routes désactivées par feature flag → /404
const FEATURE_ROUTES = {
  '/inventory':       'inventory',
  '/admin/inventory': 'inventory',
  '/workshops/dashboard': 'workshops',
  '/submit-workshop': 'workshops',
  '/glossaire':       'glossaire',
  '/simulated':       'simulated',
  '/simulated/mes-projets': 'simulated',
  '/admin/simulated': 'simulated',
};

function MyApp({ Component, pageProps }) {
  const router = useRouter();

  useEffect(() => {
    const match = Object.entries(FEATURE_ROUTES).find(([path]) =>
      router.pathname === path || router.pathname.startsWith(path + '/')
    );
    if (match && !isFeatureEnabled(match[1])) {
      router.replace('/404');
    }
  }, [router.pathname]);

  return (
    <AuthProvider>
      <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
        {/* cssVars injecte les CSS custom properties sur le div racine — valeurs build-time uniquement */}
        <div className="font-sans" style={cssVars}>
          <Head>
            <title>{brand.name}</title>
            <meta name="description" content={`Plateforme de gestion — ${brand.name}`} />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <link rel="icon" href={brand.favicon} sizes="any" />
          </Head>
          <DemoBanner />
          <SeasonalLayer />
          <Component {...pageProps} />
          <ToastWithTheme />
        </div>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default MyApp;
```

- [ ] **Step 2 : Vérifier le banner et les couleurs**

Lancer `cd client && npm run dev`. Ouvrir http://localhost:3000 :
- Banner "Mode Demo" affiché en haut
- Titre de l'onglet = "Hub Projets"
- Changer `primaryColor: "#E84040"` dans `client.config.js`, relancer — les boutons passent en rouge. Remettre `"#2563eb"`.

- [ ] **Step 3 : Commit**

```bash
git add client/src/pages/_app.js
git commit -m "feat: CSS vars couleurs, titre/favicon, banner demo, route guards"
```

---

### Task 4 : AppHeader.js — logo, nom et feature flags nav

**Files:**
- Modify: `client/src/components/layout/AppHeader.js`

- [ ] **Step 1 : Ajouter les imports de lib/config**

Ajouter après les imports existants dans `AppHeader.js` :

```js
import { brand, isFeatureEnabled } from '../../lib/config';
```

- [ ] **Step 2 : Remplacer le logo hardcodé**

Trouver dans le JSX (section `{/* Logo — left */}`) :

```jsx
<img
  src="/images/logo-dark-mode-hub.png"
  alt="Hub Projets"
  className="h-8 w-auto"
/>
```

Remplacer par :

```jsx
<img
  src={brand.logo}
  alt={brand.name}
  className="h-8 w-auto"
/>
```

- [ ] **Step 3 : Remplacer soumettreDesktop avec feature flags**

Trouver la définition de `soumettreDesktop` (vers la ligne 131) et la remplacer par :

```js
const soumettreDesktop = [
  ...(isFeatureEnabled('projects') ? [{
    label: 'Projets',
    items: [
      { label: 'Liste des projets', href: '/dashboard' },
      { label: 'Soumettre un projet', href: '/submit-project' },
      ...(isAdmin ? [{ label: 'Admin projets', href: '/admin/dashboard' }] : []),
    ],
  }] : []),
  ...(isFeatureEnabled('workshops') ? [{
    label: 'Workshops',
    items: [
      { label: 'Liste des workshops', href: '/workshops/dashboard' },
      { label: 'Soumettre un workshop', href: '/submit-workshop' },
      ...(isAdmin ? [{ label: 'Admin workshops', href: '/admin/workshops/dashboard' }] : []),
    ],
  }] : []),
  ...(isFeatureEnabled('simulated') ? [{
    label: 'Simulated',
    sub: simulatedCycleLabel,
    items: [
      { label: 'Choisir un projet', href: '/simulated' },
      { label: 'Mes projets', href: '/simulated/mes-projets' },
      ...(isAdmin ? [{ label: 'Admin Simulated', href: '/admin/simulated' }] : []),
    ],
  }] : []),
];
```

- [ ] **Step 4 : Remplacer hubDesktop avec feature flags**

Trouver `hubDesktop` et le remplacer par :

```js
const hubDesktop = isFeatureEnabled('inventory') ? [
  {
    label: null,
    items: [
      { label: 'Inventaire', href: '/inventory' },
      ...(isAdmin ? [{ label: "Gérer l'inventaire", href: '/admin/inventory' }] : []),
    ],
  },
] : [];
```

- [ ] **Step 5 : Remplacer mobileSections avec feature flags**

Trouver `mobileSections` et le remplacer par :

```js
const mobileSections = isAuthenticated
  ? [
      ...(isFeatureEnabled('projects') ? [{
        label: 'Projets',
        items: [
          { label: 'Liste des projets', href: '/dashboard' },
          { label: 'Soumettre un projet', href: '/submit-project' },
          ...(isAdmin ? [{ label: 'Admin projets', href: '/admin/dashboard' }] : []),
        ],
      }] : []),
      ...(isFeatureEnabled('workshops') ? [{
        label: 'Workshops',
        items: [
          { label: 'Liste des workshops', href: '/workshops/dashboard' },
          { label: 'Soumettre un workshop', href: '/submit-workshop' },
          ...(isAdmin ? [{ label: 'Admin workshops', href: '/admin/workshops/dashboard' }] : []),
        ],
      }] : []),
      ...(isFeatureEnabled('simulated') ? [{
        label: 'Simulated',
        items: [
          { label: 'Choisir un projet', href: '/simulated' },
          { label: 'Mes projets', href: '/simulated/mes-projets' },
          ...(isAdmin ? [{ label: 'Admin Simulated', href: '/admin/simulated' }] : []),
        ],
      }] : []),
      {
        label: 'Hub',
        items: [
          ...(isFeatureEnabled('inventory') ? [
            { label: 'Inventaire', href: '/inventory' },
            ...(isAdmin ? [{ label: "Gérer l'inventaire", href: '/admin/inventory' }] : []),
          ] : []),
          ...(isFeatureEnabled('glossaire') ? [{ label: 'Glossaire', href: '/glossaire' }] : []),
        ],
      },
    ]
  : [];
```

- [ ] **Step 6 : Conditionner le Glossaire et le dropdown Hub dans le JSX desktop**

Trouver dans le JSX de la nav desktop :

```jsx
<NavDropdown label="Hub" sections={hubDesktop} />
<NavLink href="/glossaire">Glossaire</NavLink>
```

Remplacer par :

```jsx
{hubDesktop.length > 0 && <NavDropdown label="Hub" sections={hubDesktop} />}
{isFeatureEnabled('glossaire') && <NavLink href="/glossaire">Glossaire</NavLink>}
```

- [ ] **Step 7 : Vérifier visuellement**

Avec `inventory: false` dans `client.config.js`, lancer `npm run dev`, se connecter via demo mode : "Inventaire" absent de la nav. Passer `inventory: true` → lien "Inventaire" réapparaît. Remettre `false`.

- [ ] **Step 8 : Commit**

```bash
git add client/src/components/layout/AppHeader.js
git commit -m "feat: logo/nom depuis config + feature flags nav AppHeader"
```

---

### Task 5 : Backend — DEMO_MODE bypass dans auth.js

**Files:**
- Modify: `server/src/middleware/auth.js`
- Create: `server/src/tests/middleware/demoAuth.test.js`

- [ ] **Step 1 : Écrire le test**

Créer `server/src/tests/middleware/demoAuth.test.js` :

```js
// server/src/tests/middleware/demoAuth.test.js
const { authenticateToken, isAdmin } = require('../../middleware/auth');

describe('auth middleware — DEMO_MODE', () => {
  const originalDemo = process.env.DEMO_MODE;

  beforeAll(() => { process.env.DEMO_MODE = 'true'; });
  afterAll(() => { process.env.DEMO_MODE = originalDemo; });

  it('authenticateToken injecte un faux admin sans token', (done) => {
    const req = { headers: {} };
    const res = {};
    const next = (err) => {
      expect(err).toBeUndefined();
      expect(req.user).toMatchObject({ role: 'admin', email: 'admin@demo.fr' });
      done();
    };
    authenticateToken(req, res, next);
  });

  it('isAdmin passe sans vérifier le rôle', (done) => {
    const req = { user: { role: 'student' } };
    const res = {};
    const next = (err) => {
      expect(err).toBeUndefined();
      done();
    };
    isAdmin(req, res, next);
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd server && npm test -- --testPathPattern="demoAuth"
```

Expected: FAIL — req.user est undefined.

- [ ] **Step 3 : Modifier server/src/middleware/auth.js**

Remplacer le contenu par :

```js
// middleware/auth.js
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const config = require('../config/auth');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('./asyncHandler');

const DEMO_USER = {
  _id: new mongoose.Types.ObjectId('000000000000000000000001'),
  name: 'Admin Demo',
  email: 'admin@demo.fr',
  role: 'admin',
  microsoftId: 'demo-admin',
};

exports.authenticateToken = asyncHandler(async (req, res, next) => {
  if (process.env.DEMO_MODE === 'true') {
    req.user = DEMO_USER;
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next(new ErrorResponse('Authentification requise', 401));
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new ErrorResponse('Utilisateur non trouve', 401));
    }
    req.user = user;
    next();
  } catch (error) {
    return next(new ErrorResponse('Token invalide', 401));
  }
});

exports.isAdmin = (req, res, next) => {
  if (process.env.DEMO_MODE === 'true') return next();
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return next(new ErrorResponse('Acces refuse. Droits administrateur requis.', 403));
};
```

- [ ] **Step 4 : Relancer le test**

```bash
cd server && npm test -- --testPathPattern="demoAuth"
```

Expected: PASS — 2 tests passent.

- [ ] **Step 5 : Suite complète — vérifier aucune régression**

```bash
cd server && npm test
```

Expected: toutes les suites passent (80+ tests).

- [ ] **Step 6 : Commit**

```bash
git add server/src/middleware/auth.js server/src/tests/middleware/demoAuth.test.js
git commit -m "feat: DEMO_MODE bypass dans authenticateToken et isAdmin"
```

---

### Task 6 : Backend — Passport conditionnel en DEMO_MODE

**Files:**
- Modify: `server/src/app.js`

- [ ] **Step 1 : Wrapper la config Passport dans une condition**

Dans `server/src/app.js`, trouver le commentaire `// Configuration de Passport pour Microsoft OAuth` suivi du bloc `passport.use(new MicrosoftStrategy(...))`. Wrapper l'intégralité du bloc (de `passport.use(` jusqu'au `)` fermant) dans :

```js
if (process.env.DEMO_MODE !== 'true') {
  passport.use(
    new MicrosoftStrategy(
      // ... tout le code existant inchangé ...
    )
  );
}
```

- [ ] **Step 2 : Conditionner le montage de /api/auth**

Trouver :

```js
app.use("/api/auth", require("./routes/auth"));
```

Remplacer par :

```js
if (process.env.DEMO_MODE !== 'true') {
  app.use("/api/auth", require("./routes/auth"));
}
```

- [ ] **Step 3 : Vérifier que le serveur démarre sans erreur**

```bash
cd server && node src/index.js
```

Expected: `Serveur demarre sur le port 5001` sans erreurs Passport. Ctrl+C pour arrêter.

- [ ] **Step 4 : Commit**

```bash
git add server/src/app.js
git commit -m "feat: Passport et routes auth desactives en DEMO_MODE"
```

---

### Task 7 : Frontend — AuthContext en DEMO_MODE

**Files:**
- Modify: `client/src/context/AuthContext.js`

- [ ] **Step 1 : Ajouter le bypass DEMO_MODE au début de initAuth**

Dans `client/src/context/AuthContext.js`, trouver la fonction `initAuth` dans le premier `useEffect` (vers la ligne 17). Ajouter ces lignes **au tout début** de `initAuth`, avant le `try` existant :

```js
const initAuth = async () => {
  if (process.env.NEXT_PUBLIC_DEMO_ENABLED === 'true') {
    const role = process.env.NEXT_PUBLIC_DEMO_ROLE || 'admin';
    setUser({
      _id: '000000000000000000000001',
      name: 'Admin Demo',
      email: 'admin@demo.fr',
      role,
    });
    setToken('demo-token');
    setLoading(false);
    return;
  }
  // --- reste du code initAuth existant inchangé ---
  try {
    // ...
```

- [ ] **Step 2 : Masquer le bouton de connexion Microsoft sur la page index**

Trouver les fichiers qui contiennent le lien OAuth :

```bash
grep -r "auth/microsoft\|Se connecter\|Connexion" client/src/pages --include="*.js" -l
```

Pour chaque fichier trouvé contenant un lien vers `/api/auth/microsoft`, importer `demo` et entourer le bouton de login :

```js
import { demo } from '../lib/config'; // ajuster le chemin selon le fichier
```

```jsx
{!demo.enabled && (
  <a href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/microsoft`}>
    Se connecter avec Microsoft
  </a>
)}
```

(Adapter au JSX exact du fichier — ne pas changer la structure, juste wrapper d'un conditionnel.)

- [ ] **Step 3 : Vérifier le comportement**

Lancer `npm run dev` (client) + `node src/index.js` (server). Ouvrir http://localhost:3000 : l'utilisateur est directement connecté comme admin (banner visible, dashboard accessible).

- [ ] **Step 4 : Commit**

```bash
git add client/src/context/AuthContext.js client/src/pages/index.js
git commit -m "feat: AuthContext bypass DEMO_MODE — admin injecte sans login"
```

---

### Task 8 : Seed script — seedDemo.js

**Files:**
- Create: `server/src/scripts/seedDemo.js`
- Modify: `server/package.json`

- [ ] **Step 1 : Créer server/src/scripts/seedDemo.js**

```js
// server/src/scripts/seedDemo.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Project = require('../models/Project');
const Workshop = require('../models/Workshop');

const FORCE = process.argv.includes('--force');

const ADMIN = { microsoftId: 'demo-admin', name: 'Admin Demo', email: 'admin@demo.fr', role: 'admin' };

const STUDENTS = [
  { microsoftId: 'demo-s-01', name: 'Marie Dupont',     email: 'marie.dupont@demo.fr' },
  { microsoftId: 'demo-s-02', name: 'Lucas Martin',     email: 'lucas.martin@demo.fr' },
  { microsoftId: 'demo-s-03', name: 'Emma Bernard',     email: 'emma.bernard@demo.fr' },
  { microsoftId: 'demo-s-04', name: 'Hugo Petit',       email: 'hugo.petit@demo.fr' },
  { microsoftId: 'demo-s-05', name: 'Lea Moreau',       email: 'lea.moreau@demo.fr' },
  { microsoftId: 'demo-s-06', name: 'Antoine Durand',   email: 'antoine.durand@demo.fr' },
  { microsoftId: 'demo-s-07', name: 'Camille Leroy',    email: 'camille.leroy@demo.fr' },
  { microsoftId: 'demo-s-08', name: 'Theo Simon',       email: 'theo.simon@demo.fr' },
  { microsoftId: 'demo-s-09', name: 'Chloe Laurent',    email: 'chloe.laurent@demo.fr' },
  { microsoftId: 'demo-s-10', name: 'Maxime Michel',    email: 'maxime.michel@demo.fr' },
  { microsoftId: 'demo-s-11', name: 'Julie Thomas',     email: 'julie.thomas@demo.fr' },
  { microsoftId: 'demo-s-12', name: 'Nicolas Garcia',   email: 'nicolas.garcia@demo.fr' },
  { microsoftId: 'demo-s-13', name: 'Manon Martinez',   email: 'manon.martinez@demo.fr' },
  { microsoftId: 'demo-s-14', name: 'Romain Lefebvre',  email: 'romain.lefebvre@demo.fr' },
  { microsoftId: 'demo-s-15', name: 'Alice Bonnet',     email: 'alice.bonnet@demo.fr' },
  { microsoftId: 'demo-s-16', name: 'Florian Francois', email: 'florian.francois@demo.fr' },
  { microsoftId: 'demo-s-17', name: 'Pauline Henry',    email: 'pauline.henry@demo.fr' },
  { microsoftId: 'demo-s-18', name: 'Julien Rousseau',  email: 'julien.rousseau@demo.fr' },
  { microsoftId: 'demo-s-19', name: 'Jade Blanc',       email: 'jade.blanc@demo.fr' },
  { microsoftId: 'demo-s-20', name: 'Louis Guerin',     email: 'louis.guerin@demo.fr' },
];

const PROJECT_DATA = [
  { name: 'Application de gestion inventaire',     technologies: ['React', 'Node.js', 'MongoDB'],      status: 'approved',         credits: 2 },
  { name: 'Plateforme e-commerce',                 technologies: ['Next.js', 'Stripe', 'PostgreSQL'],  status: 'approved',         credits: 2 },
  { name: 'Dashboard analytique temps reel',       technologies: ['Vue.js', 'Socket.io', 'Redis'],     status: 'approved',         credits: 1 },
  { name: 'Systeme de reservation en ligne',       technologies: ['React', 'Express', 'MySQL'],         status: 'approved',         credits: 1 },
  { name: 'API REST pour marketplace',             technologies: ['Node.js', 'GraphQL', 'MongoDB'],     status: 'approved',         credits: 2 },
  { name: 'Application mobile fitness',            technologies: ['React Native', 'Firebase'],          status: 'approved',         credits: 1 },
  { name: 'Outil de gestion de projet',            technologies: ['Angular', 'NestJS', 'PostgreSQL'],  status: 'approved',         credits: 2 },
  { name: 'Chatbot assistance client',             technologies: ['Python', 'FastAPI', 'OpenAI'],       status: 'approved',         credits: 1 },
  { name: 'Site portfolio interactif',             technologies: ['Svelte', 'Three.js'],                status: 'approved',         credits: 1 },
  { name: 'Systeme de gestion RH',                technologies: ['React', 'Django', 'PostgreSQL'],     status: 'approved',         credits: 2 },
  { name: 'Plateforme apprentissage en ligne',     technologies: ['Next.js', 'Prisma', 'Supabase'],    status: 'approved',         credits: 2 },
  { name: 'Application covoiturage',               technologies: ['React Native', 'Node.js', 'MongoDB'], status: 'approved',       credits: 1 },
  { name: 'Systeme de vote electronique',          technologies: ['React', 'Solidity', 'Ethereum'],    status: 'pending',          credits: null },
  { name: 'Outil de veille technologique',         technologies: ['Vue.js', 'Python', 'Elasticsearch'], status: 'pending',         credits: null },
  { name: 'Application gestion budgetaire',        technologies: ['Flutter', 'Firebase', 'Dart'],       status: 'pending',          credits: null },
  { name: 'Marketplace services freelance',        technologies: ['Next.js', 'Stripe', 'MongoDB'],      status: 'pending',          credits: null },
  { name: 'Plateforme streaming musical',          technologies: ['React', 'Node.js', 'AWS S3'],        status: 'pending',          credits: null },
  { name: 'Systeme de ticketing',                  technologies: ['Angular', 'Spring Boot', 'MySQL'],  status: 'pending',          credits: null },
  { name: 'Application recettes de cuisine',       technologies: ['React Native', 'GraphQL'],           status: 'pending',          credits: null },
  { name: 'Outil gestion de flotte',               technologies: ['React', 'Node.js', 'PostgreSQL'],   status: 'pending',          credits: null },
  { name: 'Reseau social pour developpeurs',       technologies: ['Next.js', 'Prisma', 'tRPC'],        status: 'pending_changes',  credits: null },
  { name: 'Traduction en temps reel',              technologies: ['React', 'WebSockets', 'Python'],    status: 'pending_changes',  credits: null },
  { name: 'Systeme gestion evenements',            technologies: ['Vue.js', 'Node.js', 'MongoDB'],     status: 'pending_changes',  credits: null },
  { name: 'Plateforme de mentorat',                technologies: ['React', 'Express', 'PostgreSQL'],   status: 'pending_changes',  credits: null },
  { name: 'Application yoga en ligne',             technologies: ['Next.js', 'Stripe', 'Firebase'],    status: 'pending_changes',  credits: null },
  { name: 'Outil de generation de CV',             technologies: ['React', 'PDF.js', 'Node.js'],       status: 'rejected',         credits: null },
  { name: 'Application de karaoke',                technologies: ['React', 'Web Audio API'],            status: 'rejected',         credits: null },
  { name: 'File attente virtuelle',                technologies: ['Vue.js', 'Socket.io', 'Redis'],     status: 'rejected',         credits: null },
  { name: 'Dessin collaboratif',                   technologies: ['React', 'Canvas API', 'WebSockets'], status: 'rejected',        credits: null },
  { name: 'Quiz multijoueur en ligne',             technologies: ['Next.js', 'Socket.io', 'MongoDB'],  status: 'rejected',         credits: null },
];

const WORKSHOP_DATA = [
  { title: 'Introduction a Docker',               details: 'Containers, images, docker-compose',            status: 'approved' },
  { title: 'CI/CD avec GitHub Actions',           details: 'Pipelines, deploiement automatise',            status: 'approved' },
  { title: 'Securite web OWASP Top 10',           details: 'Vulnerabilites courantes et bonnes pratiques', status: 'approved' },
  { title: 'Introduction a Kubernetes',           details: 'Orchestration de containers',                   status: 'approved' },
  { title: 'TypeScript avance',                   details: 'Generics, decorators, patterns',               status: 'approved' },
  { title: 'Architecture microservices',          details: 'Design patterns, communication inter-services', status: 'approved' },
  { title: 'Machine Learning avec Python',        details: 'Scikit-learn, pandas, visualisation',          status: 'approved' },
  { title: 'React Hooks les patterns',            details: 'useReducer, useContext, custom hooks',          status: 'pending' },
  { title: 'Bases de donnees NoSQL',              details: 'MongoDB, Redis, cas usage',                    status: 'pending' },
  { title: 'Introduction a Rust',                 details: 'Ownership, borrowing, traits',                  status: 'pending' },
  { title: 'API Design REST vs GraphQL',          details: 'Avantages, cas usage, implementation',         status: 'pending' },
  { title: 'Tests automatises JavaScript',        details: 'Jest, Testing Library, bonnes pratiques',       status: 'pending_changes' },
  { title: 'Accessibilite web a11y',              details: 'ARIA, WCAG, tests automatiques',               status: 'pending_changes' },
  { title: 'Infrastructure as Code Terraform',    details: 'Providers, modules, state management',          status: 'rejected' },
  { title: 'Introduction au Web3',                details: 'Smart contracts, DeFi, tokens',                status: 'rejected' },
];

function demoDate(monthsAgo) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  return d;
}

async function seedDemo() {
  if (!mongoose.connection.readyState) {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connecte a MongoDB.');
  }

  if (FORCE) {
    await Promise.all([User.deleteMany({}), Project.deleteMany({}), Workshop.deleteMany({})]);
    console.log('Collections videes.');
  }

  const admin = await User.create(ADMIN);
  const students = await User.insertMany(STUDENTS.map(s => ({ ...s, role: 'student' })));
  console.log(`${students.length + 1} utilisateurs crees.`);

  await Promise.all(PROJECT_DATA.map((p, i) => {
    const creator = students[i % students.length];
    const teammate = students[(i + 3) % students.length];
    const slug = p.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 30);
    const hasReview = p.status !== 'pending';
    return Project.create({
      name: p.name,
      description: `Application ${p.name.toLowerCase()} realisee dans le cadre de la formation.`,
      objectives: `Developper une solution complete utilisant ${p.technologies.slice(0, 2).join(' et ')}.`,
      technologies: p.technologies,
      studentCount: 2,
      studentEmails: [creator.email, teammate.email],
      links: { github: `https://github.com/demo/${slug}`, projectGithub: `https://github.com/orgs/demo/projects/${i + 1}` },
      status: p.status,
      credits: p.credits,
      members: [
        { email: creator.email, userId: creator._id, isCreator: true },
        { email: teammate.email, userId: teammate._id, isCreator: false },
      ],
      submittedBy: { userId: creator._id, name: creator.name, email: creator.email },
      ...(hasReview ? {
        reviewedBy: {
          userId: admin._id,
          name: admin.name,
          comments: p.status === 'rejected' ? 'Projet insuffisamment detaille.'
            : p.status === 'pending_changes' ? 'Merci de completer les objectifs.'
            : 'Excellent travail !',
        },
        changeHistory: [{
          status: p.status,
          comments: p.status === 'approved' ? 'Approuve.' : p.status === 'rejected' ? 'Rejete.' : 'Modifications requises.',
          reviewer: { userId: admin._id, name: admin.name },
          date: demoDate((i % 3) + 1),
        }],
      } : {}),
      createdAt: demoDate((i % 10) + 1),
      updatedAt: demoDate(i % 2),
    });
  }));
  console.log(`${PROJECT_DATA.length} projets crees.`);

  await Promise.all(WORKSHOP_DATA.map((w, i) => {
    const main = students[i % students.length];
    const co = students[(i + 5) % students.length];
    const hasReview = w.status !== 'pending';
    return Workshop.create({
      title: w.title,
      details: w.details,
      instructorCount: 2,
      instructorEmails: [main.email, co.email],
      links: { github: `https://github.com/demo/workshop-${i + 1}`, presentation: `https://slides.com/demo/w${i + 1}` },
      status: w.status,
      instructors: [
        { email: main.email, userId: main._id, isMain: true },
        { email: co.email, userId: co._id, isMain: false },
      ],
      submittedBy: { userId: main._id, name: main.name, email: main.email },
      ...(hasReview ? {
        reviewedBy: { userId: admin._id, name: admin.name, comments: w.status === 'approved' ? 'Super atelier !' : 'A retravailler.' },
        changeHistory: [{
          status: w.status,
          comments: w.status === 'approved' ? 'Approuve.' : 'Modifications necessaires.',
          reviewer: { userId: admin._id, name: admin.name },
          date: demoDate((i % 3) + 1),
        }],
      } : {}),
      createdAt: demoDate((i % 8) + 1),
      updatedAt: demoDate(i % 2),
    });
  }));
  console.log(`${WORKSHOP_DATA.length} workshops crees.`);

  console.log('Seed termine avec succes.');
}

module.exports = seedDemo;

if (require.main === module) {
  seedDemo()
    .then(() => mongoose.disconnect())
    .catch((err) => { console.error('Erreur seed:', err); process.exit(1); });
}
```

- [ ] **Step 2 : Ajouter le script npm dans server/package.json**

Dans `server/package.json`, section `"scripts"`, ajouter :

```json
"seed:reset": "node src/scripts/seedDemo.js --force"
```

- [ ] **Step 3 : Tester le seed manuellement**

```bash
cd server && npm run seed:reset
```

Expected :
```
Connecte a MongoDB.
Collections videes.
21 utilisateurs crees.
30 projets crees.
15 workshops crees.
Seed termine avec succes.
```

- [ ] **Step 4 : Commit**

```bash
git add server/src/scripts/seedDemo.js server/package.json
git commit -m "feat: seedDemo.js — 21 users, 30 projets, 15 workshops"
```

---

### Task 9 : Déclenchement seed automatique + test final

**Files:**
- Modify: `server/src/index.js`

- [ ] **Step 1 : Modifier server/src/index.js**

Remplacer le contenu de `server/src/index.js` par :

```js
// index.js
require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/database');
const User = require('./models/User');

async function startServer() {
  await connectDB();

  if (process.env.DEMO_MODE === 'true') {
    const count = await User.countDocuments();
    if (count === 0) {
      console.log('DEMO_MODE : base vide, lancement du seed...');
      const seedDemo = require('./scripts/seedDemo');
      await seedDemo();
    }
  }

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(new Date().toString());
    console.log(`Serveur demarre sur le port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Erreur au demarrage:', err);
  process.exit(1);
});
```

**Note :** `connectDB()` dans `config/database.js` fait `mongoose.connect()` et log le succès, mais ne retourne pas de Promise explicite. Vérifier que la fonction retourne bien la Promise de `mongoose.connect()`. Si ce n'est pas le cas, modifier `config/database.js` pour ajouter `return` devant `mongoose.connect(...)`.

- [ ] **Step 2 : Vérifier que connectDB() est awaitable**

Ouvrir `server/src/config/database.js`. S'assurer qu'il y a un `return` devant `mongoose.connect(...)` :

```js
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, { ... });
    console.log(`MongoDB connecte: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Erreur de connexion a MongoDB: ${error.message}`);
    process.exit(1);
  }
};
```

`mongoose.connect()` retourne une Promise. Puisque le `catch` gère les erreurs avec `process.exit(1)`, le `await connectDB()` dans `startServer()` fonctionnera correctement.

- [ ] **Step 3 : Tester le démarrage automatique**

Vider la base via `npm run seed:reset`, puis supprimer les données :

```bash
cd server && npm run seed:reset
# puis en mongosh ou via script :
node -e "
  require('dotenv').config();
  const mongoose = require('mongoose');
  mongoose.connect(process.env.MONGODB_URI).then(async () => {
    await mongoose.connection.dropDatabase();
    console.log('Base videe.');
    process.exit(0);
  });
"
```

Lancer le serveur :

```bash
node src/index.js
```

Expected dans les logs :
```
MongoDB connecte: localhost
DEMO_MODE : base vide, lancement du seed...
Connecte a MongoDB.
21 utilisateurs crees.
30 projets crees.
15 workshops crees.
Seed termine avec succes.
Serveur demarre sur le port 5001
```

- [ ] **Step 4 : Test d'intégration complet**

Avec le backend démarré (port 5001) et `cd client && npm run dev` (port 3000) :

1. Ouvrir http://localhost:3000
2. Banner "Mode Demo" visible en haut
3. Pas de bouton login Microsoft
4. Dashboard admin accessible avec 30 projets affichés
5. Nav sans "Inventaire"
6. Nav avec Projets, Workshops, Simulated, Glossaire
7. Changer `primaryColor: "#E84040"` dans `client.config.js`, rebuild frontend → boutons rouges
8. Remettre `"#2563eb"`

- [ ] **Step 5 : Commit final**

```bash
git add server/src/index.js
git commit -m "feat: seed automatique au demarrage si DEMO_MODE + base vide"
```

---

## Résumé des fichiers

| Fichier | Action |
|---|---|
| `client.config.js` | Cree — config branding + features + demo |
| `client/next.config.js` | Cree — injection NEXT_PUBLIC_* depuis config |
| `client/src/lib/config.js` | Cree — helpers isFeatureEnabled, brand, cssVars, demo, labels |
| `client/src/pages/_app.js` | Modifie — CSS vars, titre/favicon, banner demo, route guards |
| `client/src/components/layout/AppHeader.js` | Modifie — logo depuis config, feature flags nav |
| `client/src/context/AuthContext.js` | Modifie — bypass DEMO_MODE |
| `server/src/middleware/auth.js` | Modifie — DEMO_MODE shortcut |
| `server/src/app.js` | Modifie — Passport conditionnel |
| `server/src/index.js` | Modifie — seed au demarrage |
| `server/src/scripts/seedDemo.js` | Cree — 21 users, 30 projets, 15 workshops |
| `server/src/tests/middleware/demoAuth.test.js` | Cree — tests DEMO_MODE middleware |
| `server/package.json` | Modifie — script seed:reset |
