# Configuration Docker

---

## Développement (`docker-compose.yml`)

```yaml
services:
  db:      # MongoDB — port 27017
  server:  # Backend Express — port 5000
  client:  # Frontend Next.js — port 3002 (mappe sur 3000 interne)
```

```bash
docker-compose up --build
```
> **Note Dev** : Le `docker-compose.yml` injecte `NODE_ENV=development`. C'est **obligatoire** pour bénéficier d'un Rate Limiter permissif (ex: 2000 requêtes) et ne pas être bloqué lors du développement intensif de l'UI.

---

## Production (`docker-compose.prod.yml`)

```yaml
services:
  db:
    image: mongo:latest
    volumes:
      - mongodb_data:/data/db    # Données MongoDB persistantes

  server:
    build:
      context: server/
      dockerfile: Dockerfile.prod
    ports:
      - "5000:5000"
    volumes:
      - uploads_data:/app/uploads  # PDF des sujets Simulated — persistants

  client:
    build:
      context: client
      dockerfile: Dockerfile.prod
    ports:
      - "3000:3000"

volumes:
  mongodb_data:   # Données MongoDB
  uploads_data:   # Fichiers uploadés (PDF sujets Simulated)
```

```bash
docker-compose -f docker-compose.prod.yml up --build -d
```

---

## Volumes

| Volume | Monté sur | Contenu |
|--------|-----------|---------|
| `mongodb_data` | `/data/db` (conteneur `db`) | Données MongoDB |
| `uploads_data` | `/app/uploads` (conteneur `server`) | PDF des sujets Simulated uploadés via l'interface admin |

> **Important** : Sans le volume `uploads_data`, tous les PDF uploadés seraient perdus à chaque `docker compose up --build`. Le volume persiste indépendamment de la durée de vie des conteneurs.

---

## Dockerfiles

### `server/Dockerfile.prod`

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY . .
RUN npm install
EXPOSE 5000
CMD ["npm", "run", "prod"]
```

### `client/Dockerfile.prod`

Build Next.js optimisé, servi sur le port 3000.

---

## Réseau

Tous les services partagent le réseau interne `app-network` (bridge). Le frontend appelle le backend via `NEXT_PUBLIC_API_URL=http://localhost:5000` (depuis le navigateur, donc via les ports exposés).

---

## Commandes utiles

```bash
# Démarrer en prod (détaché)
docker-compose -f docker-compose.prod.yml up --build -d

# Voir les logs du serveur
docker logs hub-project-server -f

# Voir les logs du client
docker logs hub-project-client -f

# Arrêter et supprimer les conteneurs (les volumes sont conservés)
docker-compose -f docker-compose.prod.yml down

# Supprimer aussi les volumes (⚠️ efface les données MongoDB ET les PDF)
docker-compose -f docker-compose.prod.yml down -v
```
