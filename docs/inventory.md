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

---

## Modèles de Base de Données

### Tool (Outil / Composant)
Le modèle gérant le matériel en stock.
```javascript
{
  name: String,               // Nom de l'outil
  description: String,        // Description facultative
  tags: [String],             // Catégories (ex: "IOT", "Câbles")
  rfid: String,               // Code puce RFID (optionnel)
  quantity: Number,           // Stock physique total enregistré
  borrowedCount: Number,      // Nombre d'exemplaires actuellement en cours d'emprunt
  maxBorrowPerUser: Number,   // Limite maximale d'emprunt par étudiant (null = illimité)
  status: String,             // 'available' | 'borrowed' | 'maintenance' (influe l'état global)
  createdAt: Date,
  updatedAt: Date
}
```

### Loan (Transaction)
Le modèle gardant une trace immuable des activités d'emprunts et de retours.
```javascript
{
  tool: ObjectId,             // Référence vers le Tool
  user: ObjectId,             // Référence vers l'utilisateur (student/admin)
  quantity: Number,           // Quantité empruntée / retournée
  status: String,             // 'borrowed' (emprunt en cours) | 'returned' (rendu)
  borrowedAt: Date,           // Date du clic "Emprunter"
  returnedAt: Date            // Date du clic "Rendre", ou du retour complet
}
```
> **Mécanisme des emprunts partiels** : Si un étudiant emprunte 3 câbles (créant un objet `Loan{quantity: 3, status: 'borrowed'}`) et n'en rend que 2 le lendemain : le back-end déduira la quantité du flux original et créera un *nouveau* document `Loan{quantity: 2, status: 'returned'}` pour inscrire ce retour partiel dans l'historique complet, sans perturber le câble restant toujours `borrowed`.

---

## Routes API (Backend)

### `GET /api/tools`
- **Requis** : Token Auth
- **Admin** : Accède à tous les champs.
- **Étudiants** : Vue filtrée.
- **Query** : `search` (nom/description), `tags` (array), `status`.

### `GET /api/tools/loans/history`
- **Requis** : Token Auth
- **Fonction** : Récupère le registre public avec l'identité des étudiants.
- **Query** : `status` ('borrowed' | 'returned'), `limit`.

### `POST /api/tools/:id/borrow`
- **Requis** : Token Auth (Student/Admin)
- **Body** : `{ quantity: Number }`
- **Fonction** : Valide le stock, valide la règle `maxBorrowPerUser`, incrémente `Tool.borrowedCount` et génère un model `Loan` au statut `borrowed`.

### `POST /api/tools/:id/return`
- **Requis** : Token Auth (Student/Admin)
- **Body** : `{ quantity: Number }`
- **Fonction** : Calcule tous les emprunts non rendus de l'utilisateur pour cet outil, résout le volume rendu dynamiquement (clôture des `Loan` ou scindement en cas de retour partiel), et décrémente `Tool.borrowedCount`.

### (Admin Uniquement)
- `POST /api/tools` : Création de matériel.
- `PUT /api/tools/:id` : Modification (dont l'ajout du *Max Borrow*).
- `DELETE /api/tools/:id` : Suppression.
- `POST /api/tools/bulk-import` : Synchronisation des scans de lecteurs RFID par lots.
- `GET /api/tools/export/csv` : Export au format dactylo-friendly.
