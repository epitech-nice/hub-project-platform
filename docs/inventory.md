# Hub Inventory & QR Code System

Ce document décrit le système de gestion d'inventaire, d'emprunt et de retour de matériel physique du Hub via les QR codes.

---

## Architecture globale

Le système permet de référencer le matériel physique (câbles, Raspberry Pi, capteurs, etc.) et de proposer une interface pour que les étudiants puissent emprunter des éléments en autonomie via leur smartphone en scannant un QR code posé sur l'objet.

### Le Flux Emprunteur (L'Étudiant)
1. L'étudiant scanne le **QR code** de l'objet physique avec son appareil photo.
2. Il est redirigé vers l'URL `/inventory/scan/[id]`.
3. S'il n'est pas connecté, le front-end l'envoie vers le login Microsoft (`/api/auth/microsoft?redirectTo=...`).
4. Microsoft OAuth s'exécute, le backend retient l'URL d'origine via le paramètre `state` (encodé en Hexadécimal pour plus de sécurité des chemins d'URL).
5. À la reconnexion, l'étudiant atterrit de façon transparente sur `/inventory/scan/[id]`.
6. L'étudiant peut renseigner une quantité et sélectionner **Emprunter** ou **Rendre**.

### Le Flux Gestionnaire (L'Admin)
1. L'admin gère les objets depuis le panel `/admin/inventory`.
2. Il peut définir un **Max / Étudiant** (`maxBorrowPerUser`) empêchant un abus d'emprunt du même outil.
3. Il clique sur le bouton **QR Code** pour générer automatiquement l'image imprimable liée à l'URL de l'outil.
4. L'historique en temps réel est accessible via le panneau d'inventaire.
5. Il peut lancer une **vérification d'inventaire** en comparant un scan RFID avec la base — les résultats indiquent les éléments présents, manquants ou inconnus, avec un filtre optionnel par tag.
6. Il peut consulter les **signalements de problèmes** sur chaque outil via un badge rouge visible dans la liste (nombre de signalements ouverts). Au clic sur le bouton "Rapports", une modal liste les signalements avec la possibilité de les résoudre en ajoutant un commentaire.

---

## Architecture Elite (Fat Model, Skinny Controller)

Le système a été refactorisé pour déplacer la logique métier critique directement dans les modèles Mongoose, garantissant une cohérence absolue et une sécurité renforcée.

### 1. Atomicité et Concurrence
Toutes les opérations de stock (`processBorrow`, `processReturn`) utilisent des requêtes atomiques MongoDB (`findOneAndUpdate` avec `$expr` et `$inc`). Cela prévient les "Race Conditions" (sur-emprunt) sans nécessiter de transactions lourdes, garantissant l'intégrité du stock même lors de pics d'utilisation simultanés.

### 2. Sécurité et Validation
- **Protection CSV** : Les exports d'inventaire sont protégés contre l'injection de formules Excel via un mécanisme d'assainissement des caractères de contrôle (`=`, `+`, `-`, `@`).
- **Validation Strict** : Utilisation systématique de `Math.max(1, ...)` pour bloquer toute tentative d'injection de quantités négatives ou nulles.
- **Constantes Centralisées** : Suppression des Magic Strings au profit d'un fichier `constants.js` central pour tous les statuts (`available`, `borrowed`, etc.).

---

## Modèles de Base de Données

### Tool (Outil / Composant)
Le modèle gérant le matériel en stock.
```javascript
{
  name: String,               
  description: String,        
  tags: [String],             
  rfid: String,               // Index unique sparse
  quantity: Number,           
  borrowedCount: Number,      
  maxBorrowPerUser: Number,   // Limite par étudiant (null = illimité)
  status: String,             // Statut (constants.js)
  createdAt: Date,
  updatedAt: Date
}
```

### Loan (Transaction)
Le modèle gardant une trace immuable des activités d'emprunts et de retours.
```javascript
{
  tool: ObjectId,             
  user: ObjectId,             
  quantity: Number,           
  status: String,             // Statut (constants.js)
  borrowedAt: Date,           
  returnedAt: Date            
}
```

---

## Routes API (Backend)

### `GET /api/tools`
- **Requis** : Token Auth
- **Enrichissement** : Injecte `currentUserBorrowCount` pour chaque outil, permettant au front-end d'afficher dynamiquement la capacité d'emprunt restante de l'utilisateur.
- **Filtrage** : Recherche plein texte et filtrage par tags/statut via un moteur de requête unifié.

### `POST /api/tools/:id/borrow`
- **Validation** : Vérifie l'atomicité du stock et le respect des quotas utilisateurs via `Tool.processBorrow`.

### `POST /api/tools/:id/return`
- **Résolution** : Utilise `Loan.resolveReturn` pour gérer intelligemment les retours partiels (clôture ou scindement de prêts) selon une logique FIFO.

### (Admin Uniquement)
- `GET /api/tools/export/csv` : Export sécurisé de l'inventaire avec protection contre les injections de formules.
- `POST /api/tools/bulk-import` : Traitement par lots des scans RFID.
- `POST /api/tools/verify-inventory` : Compare une liste de codes RFID scannés avec l'inventaire en base. Accepte `rfids[]` (obligatoire) et `tags[]` (optionnel pour restreindre le périmètre). Retourne trois listes : `present` (trouvés), `missing` (attendus mais absents du scan), `unknown` (scannés mais non enregistrés), accompagnées de stats (`expected`, `scanned`, `presentCount`, `missingCount`, `unknownCount`).
- `POST /api/tools/:id/report` : (tout utilisateur authentifié) Crée un signalement de problème sur un outil. Accepte `category` (obligatoire : `broken` | `missing` | `incomplete` | `defective` | `other`) et `message` (optionnel, max 100 chars). Envoie un email aux admins (non-bloquant).
- `GET /api/tools/:id/reports` : (admin) Liste tous les signalements d'un outil, triés du plus récent au plus ancien.
- `PATCH /api/tools/:id/reports/:reportId/resolve` : (admin) Marque un signalement comme résolu. Accepte `resolveMessage` (optionnel, max 500 chars).
