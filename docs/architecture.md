# Architecture du Projet

## Arborescence

```
hub-project-platform/
├── client/                          # Frontend Next.js
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index.js             # Page d'accueil
│   │   │   ├── dashboard.js         # Dashboard étudiant projets
│   │   │   ├── submit-project.js
│   │   │   ├── submit-workshop.js
│   │   │   ├── glossaire.js         # Glossaire Scrum Agile
│   │   │   ├── projects/
│   │   │   │   ├── [id].js
│   │   │   │   └── edit/[id].js
│   │   │   ├── workshops/
│   │   │   │   ├── dashboard.js
│   │   │   │   ├── [id].js
│   │   │   │   └── edit/[id].js
│   │   │   ├── simulated/
│   │   │   │   ├── index.js         # Catalogue + modal calendrier
│   │   │   │   ├── mes-projets.js   # Historique enrollments
│   │   │   │   └── [id].js          # Détail projet / enrollment
│   │   │   └── admin/
│   │   │       ├── dashboard.js
│   │   │       ├── projects/[id].js
│   │   │       ├── workshops/
│   │   │       │   ├── dashboard.js
│   │   │       │   └── [id].js
│   │   │       └── simulated/
│   │   │           ├── index.js     # Catalogue + suivis + force-enroll
│   │   │           └── enrollments/[id].js
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Header.js        # Navigation avec menu Simulated
│   │   │   │   └── Footer.js
│   │   │   ├── ProjectForm.js
│   │   │   ├── WorkshopForm.js
│   │   │   ├── ProjectCard.js
│   │   │   ├── WorkshopCard.js
│   │   │   └── ThemeSwitcher.js
│   │   ├── context/
│   │   │   └── AuthContext.js
│   │   ├── hooks/
│   │   │   └── useApi.js
│   │   └── styles/
│   ├── public/
│   │   └── images/simulated/
│   ├── Dockerfile
│   ├── Dockerfile.prod
│   └── package.json
│
├── server/                          # Backend Express.js
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── projects.js
│   │   │   ├── workshops.js
│   │   │   ├── users.js
│   │   │   ├── simulatedProjects.js
│   │   │   ├── simulatedCycles.js
│   │   │   └── simulatedEnrollments.js
│   │   ├── controllers/
│   │   │   ├── projectController.js
│   │   │   ├── workshopController.js
│   │   │   └── simulated/
│   │   │       ├── projectController.js
│   │   │       ├── cycleController.js
│   │   │       └── enrollmentController.js
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Project.js
│   │   │   ├── Workshop.js
│   │   │   ├── SimulatedProject.js
│   │   │   ├── SimulatedEnrollment.js
│   │   │   └── SimulatedCycle.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── upload.js            # Multer — PDF sujets Simulated
│   │   ├── services/
│   │   │   ├── emailService.js
│   │   │   └── externalApiService.js
│   │   └── config/
│   │       └── passport.js
│   ├── uploads/
│   │   └── simulated-subjects/      # PDF uploadés (volume Docker en prod)
│   ├── Dockerfile
│   ├── Dockerfile.prod
│   └── package.json
│
├── docs/                            # Documentation segmentée
├── docker-compose.yml               # Dev
├── docker-compose.prod.yml          # Prod
└── dotenv-example.txt
```

---

## Stack Technique

### Frontend

| Technologie | Version | Usage |
|------------|---------|-------|
| Next.js | 12.2.3 | Framework React (pages router) |
| React | 18.2.0 | UI |
| Tailwind CSS | 3.1.7 | Styles utilitaires |
| Axios | 0.30.0 | Client HTTP |
| jwt-decode | 3.1.2 | Décodage JWT |
| next-themes | 0.4.6 | Mode sombre/clair |
| react-toastify | 11.0.5 | Notifications toast |

### Backend

| Technologie | Version | Usage |
|------------|---------|-------|
| Node.js | 22-alpine | Runtime |
| Express.js | 4.18.1 | Framework web |
| Mongoose | 6.5.0 | ODM MongoDB |
| Passport.js + passport-microsoft | — | OAuth |
| jsonwebtoken | 9.0.0 | JWT |
| Multer | 1.4.5-lts.1 | Upload fichiers PDF |
| Resend | 4.1.2 | Emails transactionnels |
| cors | 2.8.5 | CORS |

### Ports

| Service | Dev | Prod |
|---------|-----|------|
| Frontend | 3002 (→ 3000 interne) | 3000 |
| Backend | 5000 | 5000 |
| MongoDB | 27017 | 27017 |
