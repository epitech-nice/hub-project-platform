# hub-whitelabel — Spec de design

Date : 2026-04-29

## Contexte

Le repo `hub-project-platform` est actuellement déployé en production pour Epitech et ne doit pas être modifié. Ce spec décrit la création d'un nouveau repo `hub-whitelabel`, basé sur le Hub, qui sert deux objectifs :

1. **Démo portfolio** — une instance publique navigable sans login, avec données fictives, hébergée et linkée depuis un futur site portfolio freelance.
2. **Template white-label** — un point de départ réutilisable pour livrer le Hub à de nouveaux clients en ~35 minutes, avec branding et modules configurables.

## Ce qui est hors scope

- Le site portfolio lui-même (projet séparé, à faire ultérieurement)
- Un panneau admin visuel pour configurer le branding (prévu pour une v2)
- Toute modification du repo `hub-project-platform` actuel

---

## 1. Architecture

### Nouveau repo

```
hub-whitelabel/                      ← nouveau repo Git, créé par copie du Hub
├── client.config.js                 ← NOUVEAU — branding + feature flags
├── client/
│   ├── src/
│   │   ├── lib/config.js            ← NOUVEAU — lit client.config.js
│   │   ├── styles/globals.css       ← MODIFIÉ — inject CSS vars depuis config
│   │   ├── pages/
│   │   │   └── _app.js              ← MODIFIÉ — banner démo + config colors
│   │   └── components/
│   │       └── layout/Header.js     ← MODIFIÉ — logo/nom depuis config
└── server/
    └── src/
        ├── middleware/
        │   └── demoAuth.js          ← NOUVEAU — bypass auth en DEMO_MODE
        └── scripts/
            └── seedDemo.js          ← NOUVEAU — seed données fictives
```

### Règle fondamentale

Le repo `hub-project-platform` n'est jamais touché. Toutes les modifications se font uniquement dans `hub-whitelabel`.

---

## 2. Mode démo (DEMO_MODE)

### Variable d'environnement

```
DEMO_MODE=true    # démo portfolio (accès public, données fictives)
DEMO_MODE=false   # instance client réelle (auth OAuth, base vide)
```

### Ce que DEMO_MODE=true active

**Backend — `demoAuth.js`**
- Remplace le middleware `authenticateToken` de toutes les routes
- Injecte `req.user` avec un faux admin fictif, sans passer par Passport/Microsoft OAuth
- Le endpoint `/api/auth/login` redirige directement vers le frontend sans OAuth

**Backend — démarrage serveur**
- Au démarrage : si `DEMO_MODE=true` et `User.countDocuments() === 0`, lance `seedDemo()`
- Le seed ne tourne qu'une fois (base vide = premier démarrage)
- `npm run seed:reset` vide et re-seede manuellement

**Frontend — `_app.js`**
- Affiche un banner fixe en haut : `"Mode Démo — Toutes les données affichées sont fictives"`
- Masque le bouton "Se connecter avec Microsoft"
- Considère l'utilisateur comme toujours authentifié (admin)

### Ce que DEMO_MODE=false désactive

- Tout le middleware `demoAuth.js` est ignoré
- Authentification Microsoft OAuth normale
- Aucun seed automatique
- Banner retiré

---

## 3. White-label — client.config.js

Fichier unique à la racine du repo, édité une fois par client avant déploiement.

```js
const config = {

  // Branding
  brand: {
    name:           "Hub Projets",      // affiché dans le titre, le header, les emails
    logo:           "/images/logo.png", // chemin dans /public
    primaryColor:   "#2563eb",          // → --primary (boutons, liens, header)
    secondaryColor: "#15803d",          // → --secondary (badges approuvé, statuts positifs)
    accentColor:    "#eab308",          // → --accent (crédits, highlights)
    favicon:        "/favicon.ico",
  },

  // Modules (true = visible, false = masqué partout : nav, routes, dashboard)
  features: {
    projects:  true,
    workshops: true,
    simulated: true,
    inventory: false,
    glossaire: true,
  },

  // Mode démo (cohérent avec env DEMO_MODE)
  demo: {
    enabled:  true,
    demoRole: "admin",   // rôle injecté : "admin" ou "student"
    banner:   "Mode Démo — données fictives",
  },

  // Labels personnalisables (adaptés au vocabulaire du client)
  labels: {
    student: "Étudiant",   // ou "Employé", "Membre", "Participant"
    project: "Projet",     // ou "Mission", "Dossier"
  },

};

module.exports = config;
```

### Comment client.config.js est consommé

- **Serveur** : `require('../../client.config.js')` depuis `server/src/` — accès direct Node.js.
- **Frontend** : `client/next.config.js` importe `client.config.js` et expose les valeurs comme variables d'env Next.js (`env: { NEXT_PUBLIC_BRAND_NAME: config.brand.name, ... }`). Le frontend lit `process.env.NEXT_PUBLIC_*`, jamais le fichier directement.

### Application des couleurs

Le Hub utilise déjà des CSS variables dans `globals.css` (valeurs par défaut conservées). L'injection des couleurs client se fait dans `client/src/pages/_document.js` via un tag `<style>` injecté dans le `<head>` :

```js
// _document.js génère :
// :root { --primary: R G B; --primary-hover: R G B; --primary-ghost: R G B; --primary-border: R G B;
//         --secondary: R G B; --accent: R G B; }
// Les variantes de primary sont calculées depuis primaryColor (tinycolor2 ou équivalent)
```

`globals.css` reste inchangé — il définit les valeurs par défaut Epitech, écrasées par le `<style>` injecté si `client.config.js` définit des couleurs différentes.

Seules 3 couleurs sont nécessaires dans le config. Les variables `--bg`, `--surface`, `--border`, `--text` restent gérées par le thème clair/sombre existant.

### Application des features

Un helper `client/src/lib/config.js` expose `isFeatureEnabled(key)` (lit `process.env.NEXT_PUBLIC_FEATURES_*`). Utilisé dans :
- `Header.js` — masquer les liens de navigation
- `_app.js` — rediriger les routes désactivées vers 404
- Dashboard admin — masquer les onglets des modules désactivés

---

## 4. Données fictives — seedDemo.js

### Contenu du seed

| Collection | Quantité | Détails |
|---|---|---|
| Users | ~21 | 1 admin fictif + 20 étudiants, emails `prenom.nom@demo.fr` |
| Projects | ~30 | Tous statuts (approved/pending/rejected/pending_changes), répartis sur 2 années scolaires, avec historique de changements |
| Workshops | ~15 | Avec équipes instructeurs fictives, statuts mixtes |
| SimulatedProjects | 5 | Sujets catalogue génériques |
| SimulatedEnrollments | ~20 | Cycles variés, crédits 0/0.5/1/1.5 |

### Scripts npm

```json
"seed:reset": "node src/scripts/seedDemo.js --force"
```

`--force` vide toutes les collections avant de re-seeder.

---

## 5. Workflow de livraison client

Pour chaque nouveau client, à partir du repo `hub-whitelabel` :

1. **Clone** — `git clone hub-whitelabel client-nom-hub` (~30s)
2. **Éditer `client.config.js`** — nom, logo, couleurs, features actives, `demo.enabled: false` (~5 min)
3. **Configurer les `.env`** — `DEMO_MODE=false`, tenant Microsoft du client, MongoDB URI, Resend API key (~10 min)
4. **Déployer** — backend sur Railway/Render + frontend sur Vercel (~20 min)

**Total estimé : ~35 minutes** du clone au déploiement.

---

## 6. Hébergement

Le choix d'hébergement est décidé au moment du déploiement, pas bloquant pour l'implémentation.

| Option | Frontend | Backend + DB | Coût |
|---|---|---|---|
| Gratuit | Vercel | Render + MongoDB Atlas | 0€/mois (serveur en veille ~30s) |
| Payant | Vercel | Railway | ~5€/mois (toujours actif) |

Pour la démo portfolio : l'option gratuite est suffisante.

---

## 7. Ce qui ne change pas

Par rapport au Hub original, ces éléments sont conservés à l'identique :
- Tous les composants UI (`/components/ui/`)
- Toute la logique métier (controllers, models, services)
- Le design system (tokens CSS, dark mode, fonts)
- Les 80 tests backend existants
- La structure Docker
