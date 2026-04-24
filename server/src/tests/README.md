# Guide Jest — Hub Project Platform

## 1. Qu'est-ce que Jest ?

Jest est un **framework de test JavaScript** développé par Meta. Il regroupe dans un seul outil tout ce dont on a besoin pour tester du code Node.js :

- Un **lanceur de tests** (il trouve et exécute tes fichiers `.test.js`)
- Un **système d'assertions** (`expect(x).toBe(y)`)
- Un **système de mocking** pour simuler des dépendances
- Un **rapport de couverture** de code

La philosophie de Jest : chaque test doit être **isolé**, **reproductible**, et **rapide**. Pas de vraie base de données, pas de vrais emails, pas de vraies APIs externes — tout est simulé ou en mémoire.

---

## 2. Architecture des tests dans ce projet

```
server/
├── jest.config.js              ← Configuration Jest
└── src/
    └── tests/
        ├── setup.js            ← Initialisation globale (avant tous les tests)
        ├── helpers/
        │   └── auth.js         ← Utilitaires partagés (créer users, tokens JWT)
        ├── unit/               ← Tests unitaires (une fonction à la fois)
        │   ├── errorHandler.test.js
        │   ├── backgroundJobs.test.js
        │   └── emailService.test.js
        └── functional/         ← Tests fonctionnels (une route HTTP complète)
            ├── projects.test.js
            └── simulated/
                └── enrollment.test.js
```

### `jest.config.js` — la configuration

```js
module.exports = {
  testEnvironment: 'node',                              // Environnement Node.js (pas navigateur)
  testMatch: ['**/tests/**/*.test.js'],                 // Quels fichiers sont des tests
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.js'], // Fichier lancé avant chaque suite
  testTimeout: 30000,                                   // 30s max par test (MongoDB in-memory peut être lent)
  verbose: true,                                        // Affiche chaque test individuellement
  collectCoverageFrom: ['src/**/*.js', '!src/index.js', '!src/config/**', '!src/tests/**'],
};
```

---

## 3. Le fichier `setup.js` — infrastructure partagée

Ce fichier est exécuté **une fois avant chaque fichier de test**. Il fait trois choses :

### 3.1 Variables d'environnement

```js
process.env.MICROSOFT_CLIENT_ID = 'test-client-id';
process.env.MICROSOFT_CLIENT_SECRET = 'test-client-secret';
process.env.JWT_SECRET = 'your-secret-key';
process.env.RESEND_API_KEY = 're_test_key_000';
```

Certaines librairies (`passport-microsoft`, `resend`) lancent une erreur dès le chargement si ces variables sont absentes — même en test. On les injecte donc en premier.

### 3.2 Base de données en mémoire

```js
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();  // Démarre une fausse MongoDB
  await mongoose.connect(mongoServer.getUri());    // Mongoose s'y connecte
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();                        // Arrête proprement
});
```

`mongodb-memory-server` crée une vraie instance MongoDB qui tourne **dans la RAM**. Avantages :
- Pas besoin d'une vraie base de données installée
- Isolation totale : les données d'un test ne polluent pas les autres
- 10× plus rapide qu'une vraie MongoDB

### 3.3 Nettoyage entre chaque test

```js
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});  // Vide toutes les collections
  }
});
```

Après **chaque test individuel**, toutes les collections sont vidées. Cela garantit qu'un test ne dépend pas de ce qu'un test précédent a créé.

---

## 4. Tests unitaires vs tests fonctionnels

### Tests unitaires

> "Est-ce que **cette fonction** fait exactement ce qu'elle doit faire ?"

On isole une fonction, on l'appelle directement, on vérifie le résultat. Toutes les dépendances (base de données, emails, etc.) sont **mockées**.

### Tests fonctionnels (= tests d'intégration)

> "Est-ce que **cette route HTTP** se comporte correctement de bout en bout ?"

On simule un vrai appel HTTP à l'application Express avec `supertest`, qui traverse tout : middleware d'auth → controller → base de données (en mémoire). Seuls les services **vraiment externes** (emails, services tiers) sont mockés.

---

## 5. Le concept clé : le mocking

Mocker = **remplacer une vraie implémentation par une fausse** pour les tests.

### Pourquoi mocker ?

- Éviter d'envoyer de vrais emails pendant les tests
- Éviter d'appeler des APIs payantes
- Rendre les tests déterministes (pas de dépendance réseau)
- Tester des cas d'erreur difficiles à reproduire en vrai

### Comment Jest mock un module

```js
jest.mock('../../services/emailService', () => ({
  sendStatusChangeEmail: jest.fn().mockResolvedValue({ success: true }),
}));
```

`jest.mock()` intercepte le `require()` de ce module dans **tout le fichier de test**. Quand le code sous test appelle `emailService.sendStatusChangeEmail(...)`, il reçoit en réalité `jest.fn()` — une fonction factice qui ne fait rien mais enregistre tous ses appels.

Ensuite on peut vérifier :

```js
expect(emailService.sendStatusChangeEmail).toHaveBeenCalledTimes(1);
expect(emailService.sendStatusChangeEmail).toHaveBeenCalledWith(
  project, 'approved', false, false
);
```

### La règle du `mock*` (hoisting)

Jest **remonte** (`hoist`) les appels `jest.mock()` en haut du fichier avant toute exécution. Problème : si on veut référencer une variable dans la factory, cette variable n'est pas encore définie.

**Exception** : les variables dont le nom commence par `mock` sont tolérées.

```js
// ✅ Fonctionne — le préfixe "mock" est autorisé dans les factories
const mockSend = jest.fn().mockResolvedValue({ data: { id: 'email-id' }, error: null });

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));
```

C'est le pattern utilisé dans `emailService.test.js` pour capturer les appels à `resend.emails.send`.

---

## 6. Détail de chaque fichier de test

### 6.1 `unit/errorHandler.test.js` — 7 tests

**Ce qu'on teste** : le middleware Express `errorHandler` qui transforme les erreurs en réponses HTTP.

**Pourquoi c'est un test unitaire** : `errorHandler` est une simple fonction `(err, req, res, next)`. Pas de base de données, pas de réseau. On lui passe des objets simulés et on vérifie ce qu'elle appelle.

```js
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);  // Chaînable : res.status(500).json(...)
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
```

**Ce qu'on vérifie** :

| Cas d'erreur | Code HTTP attendu | Message attendu |
|---|---|---|
| Erreur générique | 500 | Message de l'erreur |
| `CastError` Mongoose (mauvais ObjectId) | 404 | "Ressource non trouvée" |
| Code `11000` (duplicate key) | 400 | "Valeur dupliquée entrée" |
| `ValidationError` Mongoose | 400 | Messages des champs en erreur |
| `JsonWebTokenError` | 401 | "Token invalide..." |
| `TokenExpiredError` | 401 | "Token expiré..." |
| `ErrorResponse` custom | Statut du constructeur | Message du constructeur |

---

### 6.2 `unit/backgroundJobs.test.js` — 6 tests

**Ce qu'on teste** : `addJob(jobName, payload)` — le système de jobs asynchrones fire-and-forget.

**Le pattern `setImmediate`** :

`addJob` utilise `setImmediate(() => { ... })` pour exécuter le job **après** le tour courant de l'event loop. En test, on doit donc "attendre" que l'event loop avance :

```js
const flushImmediate = () => new Promise((resolve) => setImmediate(resolve));

addJob('sendStatusEmail', { project, status: 'approved' });
await flushImmediate();  // On laisse le job s'exécuter
expect(emailService.sendStatusChangeEmail).toHaveBeenCalled();
```

**Ce qu'on vérifie** :
- Les bons paramètres sont transmis à `sendStatusChangeEmail` selon le type (`isWorkshop`, `isSimulated`)
- Si `emailService` rejette → pas d'erreur non catchée
- Le message d'erreur contient `[Background Job Error]`
- Un job inconnu ne fait rien

---

### 6.3 `unit/emailService.test.js` — 12 tests

**Ce qu'on teste** : `sendStatusChangeEmail(item, status, isWorkshop, isSimulated)`.

**Le mock Resend** :

On remplace le SDK Resend entier par une factory qui retourne toujours la même instance mockée :

```js
const mockSend = jest.fn().mockResolvedValue({ data: { id: 'mock-email-id' }, error: null });
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));
```

**Ce qu'on vérifie** :

- **Destinataires projet** : membres + submitter, dédupliqués
- **Pas de destinataires** : retour anticipé `{ success: false, reason: 'No recipients' }`, pas d'appel Resend
- **Destinataires workshop** : instructeurs + submitter
- **Destinataires enrollment simulé** : seulement l'étudiant
- **Emojis par statut** : `approved` → ✅, `rejected` → ⛔, etc.
- **Label dans le sujet** : "Projet" / "Workshop" / "Cycle Simulated"
- **Erreur Resend** : si l'API retourne `{ error: { message: '...' } }`, le service doit throw

---

### 6.4 `functional/projects.test.js` — 18 tests

**Ce qu'on teste** : les routes `/api/projects`.

**Setup** :

```js
const app = require('../../app');
const request = require('supertest');

jest.mock('../../utils/backgroundJobs');       // Pas de vrais emails
jest.mock('../../services/externalService');   // Pas de vrais appels externes
```

`supertest` permet de faire de vrais appels HTTP à `app` sans démarrer un serveur réseau :

```js
const res = await request(app)
  .post('/api/projects')
  .set(authHeader(student))   // Header Authorization: Bearer <token>
  .send({ name: 'Mon projet', ... });

expect(res.statusCode).toBe(201);
expect(res.body.data.name).toBe('Mon projet');
```

**Ce qu'on vérifie** :

- Créer un projet → 201 + données correctes
- Sans token → 401
- Accès à son propre projet (créateur, membre) → 200
- Accès au projet d'un autre → 403
- Admin voit tout → 200
- Review admin `approved` → statut et crédits mis à jour
- Review admin `rejected` → statut mis à jour, `lockedByAdmin` reste false
- Review `pending_changes` → statut correct
- Filtrage par statut/search

---

### 6.5 `functional/simulated/enrollment.test.js` — 22 tests

**Ce qu'on teste** : les routes `/api/simulated/enrollments` (module Simulated Professional Work).

**Helpers de setup** :

```js
const createOpenCycle = () => SimulatedCycle.create({
  startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),      // Commencé il y a 7 jours
  firstSubmissionDeadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),  // Dans 3 jours
  // ...
});

const createClosedCycle = () => SimulatedCycle.create({
  firstSubmissionDeadline: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),  // Passé
  // ...
});
```

**Ce qu'on vérifie** :

- `POST /enroll` succès → enrollment créé avec les bonnes dates
- Fenêtre fermée → 400 "No open cycle"
- Déjà un enrollment actif → 400 "already enrolled"
- Projet déjà complété (phase 2 approuvée) → 400 "already done"
- `PUT /enrollments/:id` → mise à jour du lien GitHub
- `lockedByAdmin: true` → 403 "locked by admin"
- Review admin `approved` → `lockedByAdmin` devient `true`
- Défense phase 1 approuvée → crée automatiquement l'enrollment phase 2
- `relaunch` → crée un nouvel enrollment sur le cycle suivant

---

## 7. Le helper `auth.js`

Pour les tests fonctionnels, on a besoin de créer des users en base et de générer leurs tokens JWT :

```js
const createUser = async (overrides = {}) => {
  const defaults = {
    microsoftId: `ms-${Date.now()}-${Math.random()}`,  // ID unique
    name: 'Test User',
    email: `test-${Date.now()}@epitech.eu`,
    role: 'student',
  };
  return User.create({ ...defaults, ...overrides });
};

const createAdmin = (overrides = {}) => createUser({ role: 'admin', ...overrides });

const generateToken = (user) => jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1d' });

const authHeader = (user) => ({ Authorization: `Bearer ${generateToken(user)}` });
```

Usage dans les tests :

```js
let student, admin;

beforeEach(async () => {
  student = await createUser();
  admin = await createAdmin();
});

// Dans le test :
const res = await request(app)
  .get('/api/projects')
  .set(authHeader(admin));
```

---

## 8. Lancer les tests

```bash
# Depuis le dossier server/

# Tous les tests
npm test

# Mode watch (relance au changement de fichier)
npm run test:watch

# Avec rapport de couverture
npm run test:coverage

# Un fichier spécifique
npx jest --testPathPatterns=errorHandler

# Un describe ou it spécifique
npx jest --testNamePattern="returns 404"
```

### Lire les résultats

```
PASS src/tests/unit/errorHandler.test.js
  errorHandler middleware
    ✓ returns 500 for a generic error (3 ms)
    ✓ returns 404 for a Mongoose CastError (bad ObjectId) (1 ms)
    ✓ returns 400 for a Mongoose duplicate key error (1 ms)
    ...

Test Suites: 5 passed, 5 total
Tests:       65 passed, 65 total
Time:        4.2 s
```

- **PASS / FAIL** : statut du fichier de test
- **✓ / ✗** : statut de chaque test individuel
- En cas d'échec : Jest affiche la valeur attendue vs reçue en diff coloré

### Rapport de couverture

```bash
npm run test:coverage
```

```
File                  | % Stmts | % Branch | % Funcs | % Lines
----------------------|---------|----------|---------|--------
middleware/           |         |          |         |
  errorHandler.js     |   100   |   100    |   100   |   100
services/             |         |          |         |
  emailService.js     |    87   |    91    |   100   |    87
utils/                |         |          |         |
  backgroundJobs.js   |   100   |   100    |   100   |   100
```

- **Stmts** : lignes de code exécutées
- **Branch** : branches `if/else` couvertes
- **Funcs** : fonctions appelées
- Une couverture de 80%+ est un bon objectif

---

## 9. Ajouter un nouveau test

### Test unitaire d'une nouvelle fonction

1. Créer `src/tests/unit/maFonction.test.js`
2. Importer la fonction et mocker ses dépendances
3. Structurer avec `describe` / `it`

```js
const { maFonction } = require('../../utils/maFonction');

describe('maFonction', () => {
  it('retourne X quand Y', () => {
    const result = maFonction(input);
    expect(result).toBe(expectedOutput);
  });
});
```

### Test fonctionnel d'une nouvelle route

1. Créer `src/tests/functional/maRoute.test.js`
2. Importer `app` et `request` de supertest
3. Mocker `backgroundJobs` et les services externes

```js
const app = require('../../app');
const request = require('supertest');
const { createUser, createAdmin, authHeader } = require('../helpers/auth');

jest.mock('../../utils/backgroundJobs');

describe('GET /api/ma-route', () => {
  let user;
  beforeEach(async () => {
    user = await createUser();
  });

  it('retourne 200 avec les données', async () => {
    const res = await request(app)
      .get('/api/ma-route')
      .set(authHeader(user));

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('retourne 401 sans token', async () => {
    const res = await request(app).get('/api/ma-route');
    expect(res.statusCode).toBe(401);
  });
});
```

---

## 10. Résumé des concepts clés

| Concept | Description |
|---|---|
| `jest.mock()` | Remplace un module par une version factice |
| `jest.fn()` | Crée une fonction factice qui enregistre ses appels |
| `mockResolvedValue()` | Configure la valeur de retour d'une `Promise` |
| `expect().toHaveBeenCalledWith()` | Vérifie les arguments d'une fonction mockée |
| `beforeAll / afterAll` | Code exécuté une fois avant/après toute la suite |
| `beforeEach / afterEach` | Code exécuté avant/après chaque test individuel |
| `mongodb-memory-server` | MongoDB en RAM, isolation totale |
| `supertest` | Simule des requêtes HTTP sans démarrer un vrai serveur |
| `describe` | Groupe des tests liés |
| `it` / `test` | Déclare un test individuel |
