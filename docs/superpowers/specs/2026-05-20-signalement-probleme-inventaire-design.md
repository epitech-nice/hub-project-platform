# Spec — Signalement de problème inventaire

## Contexte

La page de scan `/inventory/scan/[id]` permet aux étudiants d'emprunter ou de rendre du matériel. Cette feature ajoute une troisième action : signaler un problème sur un outil (cassé, manquant, défectueux, etc.). Les admins sont notifiés par email et peuvent consulter + résoudre les signalements depuis le panel inventaire.

## Objectif

Permettre aux étudiants de remonter rapidement un problème constaté sur un outil, et donner aux admins une vue claire des signalements ouverts avec la capacité de les clôturer en ajoutant un commentaire de résolution.

---

## Backend

### Modèle `ToolReport`

Nouveau fichier : `server/src/models/ToolReport.js`

```js
{
  tool:           ObjectId → Tool (requis),
  student: {
    userId:       ObjectId → User (requis),
    name:         String (requis),
    email:        String (requis),
  },
  category:       String, // enum: 'broken' | 'missing' | 'incomplete' | 'defective' | 'other'
  message:        String, // optionnel, max 100 chars
  status:         String, // 'open' | 'resolved', default 'open'
  resolvedBy: {
    userId:       ObjectId → User,
    name:         String,
  },
  resolvedAt:     Date,
  resolveMessage: String, // optionnel, commentaire admin à la résolution
  createdAt:      Date (timestamps)
}
```

Index : `{ tool: 1, status: 1 }` pour les requêtes admin filtrées.

### Routes

Nouveau fichier : `server/src/controllers/toolReportController.js`
Routes ajoutées au router existant : `server/src/routes/tools.js` (pas de nouveau fichier router — évite tout conflit de montage)

| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/tools/:id/report` | authenticateToken | Créer un signalement |
| GET | `/api/tools/:id/reports` | authenticateToken + isAdmin | Lister les signalements d'un outil |
| PATCH | `/api/tools/:id/reports/:reportId/resolve` | authenticateToken + isAdmin | Résoudre un signalement |

### Logique des endpoints

**POST `/api/tools/:id/report`**
1. Vérifier que l'outil existe (404 sinon)
2. Valider `category` (enum) et `message` (optionnel, max 100 chars)
3. Créer le `ToolReport` avec les infos student depuis `req.user`
4. Envoyer l'email admin (non-bloquant — erreur email n'annule pas la création)
5. Retourner 201

**GET `/api/tools/:id/reports`**
1. Vérifier que l'outil existe (404 sinon)
2. Retourner tous les reports de cet outil triés par `createdAt` desc

**PATCH `/api/tools/:id/reports/:reportId/resolve`**
1. Vérifier que le report existe et appartient à cet outil (404 sinon)
2. Vérifier que le report est `open` (400 si déjà résolu)
3. Mettre à jour : `status: 'resolved'`, `resolvedBy`, `resolvedAt`, `resolveMessage`
4. Retourner le report mis à jour

### Enrichissement `GET /api/tools`

`openReportCount` ajouté sur chaque outil via aggregation MongoDB dans `getAllTools` :
```js
ToolReport.aggregate([
  { $match: { status: 'open' } },
  { $group: { _id: '$tool', count: { $sum: 1 } } }
])
```
Résultat mergé sur chaque outil avant retour de la réponse.

### Email

Utilise `emailService` (Resend). Destinataires : tous les users avec `role: 'admin'`.
Contenu : nom outil, catégorie, message étudiant, nom + email étudiant, lien `/admin/inventory`.

### Validation (express-validator)

Règles dans `server/src/middleware/validators.js` :
- `category` : required, `isIn(['broken', 'missing', 'incomplete', 'defective', 'other'])`
- `message` : optional, `isString`, `isLength({ max: 100 })`
- `resolveMessage` : optional, `isString`, `isLength({ max: 500 })`

### Cas d'erreur

| Situation | Code |
|---|---|
| Outil introuvable | 404 |
| Catégorie invalide | 400 |
| Message > 100 chars | 400 |
| Report introuvable | 404 |
| Report déjà résolu | 400 |
| Échec email | ignoré (non-bloquant) |

---

## Frontend — Page étudiant (`/inventory/scan/[id]`)

### Nouveau bouton

**"Signaler un problème"** — bouton `variant="ghost"` ajouté sous les boutons Emprunter/Rendre. Visible même quand l'outil est en maintenance (un outil en maintenance peut avoir un nouveau problème à signaler).

### Formulaire inline

Au clic, un formulaire s'affiche dans la même Card (pas de modal) :

- **Select catégorie** (obligatoire) :
  - Cassé / Endommagé (`broken`)
  - Manquant / Introuvable (`missing`)
  - Incomplet — pièces manquantes (`incomplete`)
  - Défectueux — fonctionne mais problème (`defective`)
  - Autre (`other`)

- **Textarea message** (optionnel, max 100 chars) avec compteur `X/100`

- Boutons **"Envoyer"** (primary) + **"Annuler"** (outline)

### États

- Envoi en cours : bouton "Envoyer" en loading, inputs désactivés
- Succès : formulaire masqué, message vert "Signalement envoyé, merci !"
- Erreur : message rouge inline

### Fichier modifié

- `client/src/pages/inventory/scan/[id].js`

---

## Frontend — Panel admin (`/admin/inventory`)

### Badge sur chaque outil

Dans la colonne "Outil" du DataTable, si `openReportCount > 0` : badge rouge `rejected` affiché à côté du nom. Exemple : `Arduino Mega` + badge `2`.

### Bouton "Rapports" dans les actions

Colonne Actions : bouton **"Rapports"** (variant `outline`, size `sm`) visible uniquement si `openReportCount > 0`. Au clic, ouvre la modal de détail.

### Modal de détail des signalements

**Titre :** "Signalements — [Nom de l'outil]"

**Section "Ouverts"** (si reports open) :
- Chaque report : date, nom étudiant, badge catégorie, message (si présent)
- Bouton **"Résoudre"** → affiche inline sous le report :
  - Textarea "Commentaire de résolution" (optionnel, max 500 chars)
  - Boutons "Confirmer" + "Annuler"
- Après résolution : le report disparaît de la section ouverte et apparaît dans "Résolus"

**Section "Résolus"** (si reports resolved, affichés en grisé) :
- Date signalement, catégorie, résolu par, date résolution, commentaire admin

**Quand tous les reports sont résolus :** badge et bouton "Rapports" disparaissent de la table.

### Nouveaux états React

```js
const [showReports, setShowReports]       = useState(false);
const [reportsToolId, setReportsToolId]   = useState(null);
const [reportsToolName, setReportsToolName] = useState('');
const [reports, setReports]               = useState([]);
const [reportsLoading, setReportsLoading] = useState(false);
const [resolvingId, setResolvingId]       = useState(null);  // report en cours de résolution
const [resolveMsg, setResolveMsg]         = useState('');
const [resolveLoading, setResolveLoading] = useState(false);
```

### Fichier modifié

- `client/src/pages/admin/inventory.js`

---

## Tests

Fichier : `server/src/tests/functional/toolReports.test.js`

Cas couverts :
- `POST /report` : 201 ok, 401 sans token, 404 outil inexistant, 400 catégorie invalide, 400 message trop long
- `GET /reports` : 200 admin, 403 étudiant, 404 outil inexistant
- `PATCH /resolve` : 200 admin avec et sans resolveMessage, 400 déjà résolu, 404 report inexistant, 403 étudiant

---

## Hors périmètre

- Historique global des signalements (toutes pages confondues)
- Filtres/recherche sur les signalements
- Notifications push ou Slack
- Limite de signalements par étudiant par outil
