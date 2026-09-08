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
│   │   │   ├── simulatedEnrollments.js
│   │   │   ├── printPrinters.js     # CRUD imprimantes (admin)
│   │   │   ├── printWhitelist.js    # Autorisations étudiant/imprimante
│   │   │   ├── printAccessRequests.js
│   │   │   ├── printJobs.js         # Soumission/suivi jobs d'impression
│   │   │   └── printAgent.js        # Endpoints pull consommés par printer-agent
│   │   ├── controllers/
│   │   │   ├── projectController.js
│   │   │   ├── workshopController.js
│   │   │   ├── toolReportController.js  # Signalement d'anomalie sur un outil (create/get/resolve)
│   │   │   ├── simulated/
│   │   │   │   ├── projectController.js
│   │   │   │   ├── cycleController.js
│   │   │   │   └── enrollmentController.js
│   │   │   └── print/
│   │   │       ├── printerController.js
│   │   │       ├── whitelistController.js
│   │   │       ├── accessRequestController.js
│   │   │       ├── jobController.js
│   │   │       └── agentController.js
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Project.js
│   │   │   ├── Workshop.js
│   │   │   ├── SimulatedProject.js
│   │   │   ├── SimulatedEnrollment.js
│   │   │   ├── SimulatedCycle.js
│   │   │   ├── ToolReport.js        # Signalement d'anomalie outil (en prod depuis mai 2026)
│   │   │   ├── Printer.js
│   │   │   ├── PrintJob.js
│   │   │   ├── PrintAuthorization.js
│   │   │   └── PrintAccessRequest.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   ├── printerAuth.js       # Auth imprimante (headers x-printer-id / x-api-key)
│   │   │   ├── printJobUpload.js    # Multer — fichiers .gcode (200 Mo max)
│   │   │   └── upload.js            # Multer — PDF sujets Simulated
│   │   ├── services/
│   │   │   ├── emailService.js
│   │   │   ├── externalService.js
│   │   │   └── projectService.js
│   │   ├── utils/
│   │   │   ├── apiKey.js
│   │   │   ├── backgroundJobs.js
│   │   │   ├── constants.js
│   │   │   ├── errorResponse.js
│   │   │   └── printerScheduler.js  # Détection imprimante offline / auto-fail des jobs en cours
│   │   └── config/
│   │       └── passport.js
│   ├── uploads/
│   │   └── simulated-subjects/      # PDF uploadés (volume Docker en prod)
│   ├── storage/
│   │   └── print-jobs/              # Fichiers .gcode uploadés (pas de volume Docker dédié en prod)
│   ├── Dockerfile
│   ├── Dockerfile.prod
│   └── package.json
│
├── printer-agent/                   # Agent Python déployé sur chaque imprimante (via Rinkhals)
│   ├── agent/
│   │   ├── main.py                  # Boucle de polling (`--loop`) + CLI
│   │   ├── hub_client.py            # Client vers les endpoints /api/print/agent/*
│   │   ├── moonraker_client.py      # Client Moonraker (statut imprimante, jobs)
│   │   └── state.py
│   ├── rinkhals-app/                # Packaging "app" custom Rinkhals (app.sh + app.json)
│   ├── tests/
│   ├── config.example.json
│   └── README.md
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
| jwt-decode | 4.0.0 | Décodage JWT |
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

---

## Dépendances / Intégrations Externes

| Dépendance | Rôle |
|------------|------|
| Passport.js + passport-microsoft (OAuth) | Authentification via compte Microsoft (Epitech) |
| Resend | Envoi des emails transactionnels (changements de statut, relances) |
| Rinkhals | Firmware custom pour les imprimantes 3D Anycubic Kobra ; expose l'accès SSH/Moonraker consommé par `printer-agent/` sur les 3 imprimantes du Hub. Voir [rinkhals-community/Rinkhals](https://github.com/rinkhals-community/Rinkhals) et `docs/printer-onboarding.md` pour le flashage/déploiement. |
