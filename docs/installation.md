# Installation et Configuration

## Prérequis

- Docker et Docker Compose
- Node.js 22+ (si installation locale sans Docker)
- Compte Microsoft Azure (OAuth)
- Compte Resend (emails)

---

## Installation avec Docker (Recommandé)

### 1. Cloner le projet

```bash
git clone <repository-url>
cd hub-project-platform
```

### 2. Créer les fichiers d'environnement

**`server/.env`** :
```bash
PORT=5000
NODE_ENV=development

# Base de données
MONGODB_URI=mongodb://mongo:mongo@db:27017/hub_project_db

# Microsoft OAuth
MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_CLIENT_SECRET=votre-secret
MICROSOFT_CALLBACK_URL=http://localhost:5000/api/auth/microsoft/callback
MICROSOFT_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Frontend
FRONTEND_URL=http://localhost:3000

# API Intra Epitech
EXTERNAL_API_URL=https://intra.epitech.eu/module/2025/G-INN-020/NCE-0-1/#!/create
EXTERNAL_API_KEY=votre-api-key

# Emails (Resend)
EMAIL_FROM=Hub Projets <noreply@votredomaine.eu>
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_DOMAIN=votredomaine.eu

# Admins (séparés par virgule)
APP_OWNER_EMAILS=admin@epitech.eu,admin2@epitech.eu

# JWT
JWT_SECRET=une-chaine-aleatoire-longue-et-securisee
```

**`client/.env.local`** :
```bash
NEXT_PUBLIC_API_URL=http://localhost:5000
```

### 3. Démarrer l'application

**Développement :**
```bash
docker-compose up --build
```

**Production :**
```bash
docker-compose -f docker-compose.prod.yml up --build -d
```

### 4. Accès

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| MongoDB | localhost:27017 |

---

## Installation Locale (Sans Docker)

### 1. Backend

```bash
cd server
npm install
# Créer server/.env (voir ci-dessus)
npm start
```

### 2. Frontend

```bash
cd client
npm install
# Créer client/.env.local (voir ci-dessus)
npm run dev
```

### 3. MongoDB

```bash
mongod
```

Adapter `MONGODB_URI` dans `server/.env` pour pointer vers `localhost:27017`.

---

## Variables d'Environnement — Référence complète

### Backend (`server/.env`)

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `PORT` | Oui | Port du serveur (défaut : 5000) |
| `NODE_ENV` | Oui | `development` ou `production` |
| `MONGODB_URI` | Oui | URI de connexion MongoDB |
| `MICROSOFT_CLIENT_ID` | Oui | Client ID de l'app Azure |
| `MICROSOFT_CLIENT_SECRET` | Oui | Secret de l'app Azure |
| `MICROSOFT_CALLBACK_URL` | Oui | URL de callback OAuth |
| `MICROSOFT_TENANT_ID` | Oui | Tenant ID Azure |
| `FRONTEND_URL` | Oui | URL du frontend (liens dans les emails) |
| `JWT_SECRET` | Oui | Clé de signature des tokens JWT |
| `RESEND_API_KEY` | Oui | Clé API Resend pour les emails |
| `EMAIL_FROM` | Oui | Expéditeur des emails |
| `EMAIL_DOMAIN` | Non | Domaine utilisé dans le pied d'email |
| `APP_OWNER_EMAILS` | Oui | Emails admin, séparés par virgule |
| `EXTERNAL_API_URL` | Non | URL API Intra Epitech (approbation projets) |
| `EXTERNAL_API_KEY` | Non | Clé API Intra Epitech |

### Frontend (`client/.env.local`)

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `NEXT_PUBLIC_API_URL` | Oui | URL de l'API backend |
