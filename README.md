# Hub Project Platform

Application full-stack permettant aux étudiants de soumettre et gérer leurs projets et workshops, et aux administrateurs de les examiner, approuver ou rejeter. Elle intègre également un module **Simulated Professional Work** avec cycles, défenses bi-phases et attribution de crédits.

---

## Fonctionnalités clés

- Authentification Microsoft OAuth + sessions JWT
- Gestion de **projets** avec workflow d'approbation et crédits
- Gestion de **workshops** avec équipes d'instructeurs
- Module **Simulated Professional Work** : catalogue de projets, cycles, défenses, crédits cumulés
- Notifications email automatiques (Resend)
- Dashboards admin avec export CSV
- Glossaire Scrum Agile
- Mode sombre/clair, design responsive

---

## Documentation

| Fichier | Contenu |
|---------|---------|
| [docs/architecture.md](docs/architecture.md) | Arborescence du projet, stack technique, ports |
| [docs/installation.md](docs/installation.md) | Installation Docker/locale, variables d'environnement |
| [docs/auth.md](docs/auth.md) | OAuth Microsoft, JWT, rôles, middlewares |
| [docs/models.md](docs/models.md) | Modèles Mongoose (User, Project, Workshop, Simulated*) |
| [docs/api-projects-workshops.md](docs/api-projects-workshops.md) | Routes API projets, workshops, users, health |
| [docs/api-simulated.md](docs/api-simulated.md) | Routes API Simulated (catalogue, enrollments, cycles) |
| [docs/inventory.md](docs/inventory.md) | Système d'inventaire matériel, emprunt par QR Code |
| [docs/frontend.md](docs/frontend.md) | Pages frontend et composants réutilisables |
| [docs/workflows.md](docs/workflows.md) | Workflows étudiant et admin (projets, workshops, simulated, inventory) |
| [docs/docker.md](docs/docker.md) | Configuration Docker dev/prod, volumes persistants |

---

## Démarrage rapide

```bash
# Cloner le projet
git clone <repository-url>
cd hub-project-platform

# Créer server/.env et client/.env.local (voir docs/installation.md)

# Lancer en développement
docker-compose up --build

# Lancer en production
docker-compose -f docker-compose.prod.yml up --build -d
```

- Frontend : http://localhost:3000
- Backend API : http://localhost:5000

Pour le détail complet → [docs/installation.md](docs/installation.md)
