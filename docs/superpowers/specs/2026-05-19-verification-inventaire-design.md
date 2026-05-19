# Spec — Vérification d'inventaire RFID

## Contexte

L'inventaire Hub permet déjà d'importer un fichier RFID pour identifier ou créer des outils ("Import RFID"). Cette feature ajoute le sens inverse : comparer un scan physique avec l'inventaire en base pour détecter les écarts — éléments manquants, inconnus, ou confirmés présents.

## Objectif

Donner à l'admin un rapport d'audit rapide : quels outils RFID sont absents du scan (manquants), quels RFIDs scannés ne sont pas en base (inconnus), et lesquels sont confirmés présents.

---

## Backend

### Endpoint

`POST /api/tools/verify-inventory` — admin uniquement (middleware `isAdmin`).

### Body

```json
{
  "rfids": ["A3B4C5D6", "9F8E7D6C"],
  "tags": ["électronique"]
}
```

- `rfids` : obligatoire, tableau non vide
- `tags` : optionnel — si absent ou vide, la vérification porte sur tous les outils ayant un RFID

### Logique

1. Normaliser les RFIDs : `trim().toUpperCase()`, dédupliquer (même helper que `bulkImport`)
2. Construire la requête DB :
   - Base : `{ rfid: { $exists: true, $ne: null } }`
   - Si `tags` fourni et non vide : ajouter `{ tags: { $in: tags } }`
3. Récupérer tous les outils correspondants
4. Comparer :
   - `present` : outils dont le RFID figure dans le scan
   - `missing` : outils dont le RFID est absent du scan
   - `unknown` : RFIDs scannés sans correspondance en DB (indépendant du filtre tag)
5. Répondre avec les trois listes et les stats

### Réponse

```json
{
  "success": true,
  "data": {
    "stats": {
      "expected": 10,
      "scanned": 8,
      "presentCount": 7,
      "missingCount": 3,
      "unknownCount": 1
    },
    "present": [ /* Tool objects */ ],
    "missing": [ /* Tool objects */ ],
    "unknown": ["DEADBEEF"]
  }
}
```

### Fichiers touchés

- `server/src/controllers/toolController.js` — ajouter `exports.verifyInventory`
- `server/src/routes/tools.js` — enregistrer la route

---

## Frontend

### Point d'entrée

Nouveau bouton **"Vérifier inventaire"** dans `PageHead` actions, à côté de "Import RFID". Ouvre une modal dédiée indépendante.

### État React (isolé de l'Import)

```js
const [showVerify, setShowVerify] = useState(false);
const [verifyRaw, setVerifyRaw]   = useState('');
const [verifyTags, setVerifyTags] = useState([]);
const [verifyLoading, setVerifyLoading] = useState(false);
const [verifyResults, setVerifyResults] = useState(null);
```

### Contenu de la modal

1. **Filtre par tag** — chips cliquables construites depuis `allTags` (déjà chargé). Aucun tag sélectionné = portée globale. Sélection multiple.
2. **Zone de saisie RFID** — même UX que l'Import : drag & drop fichier `.txt`/`.csv` + textarea. Réutilise `parseRfidText` et `readFile` sans duplication.
3. **Compteur de codes détectés** — même ligne `X code(s) détecté(s)`.
4. **Bouton "Vérifier"** — désactivé si `rfidCount === 0` ou `verifyLoading`.

### Résultats

Stats résumées en haut de la section résultats :

```
X attendus · Y scannés · Z présents · N manquants · M inconnus
```

Trois sections colorées :

| Section | Badge variant | Contenu |
|---|---|---|
| Présents | `approved` (vert) | Nom + RFID de chaque outil confirmé |
| Manquants | `rejected` (rouge) | Nom + RFID des outils absents du scan |
| Inconnus | `changes` (orange) | RFID brut + bouton "Créer l'outil →" (même pattern Import) |

Le bouton "Créer l'outil →" sur les inconnus réutilise `openAddFromImport(rfid)` — la modal outil s'empile par-dessus, le modal de vérification reste ouvert.

### Cas limites

- Aucun outil avec RFID pour la sélection de tags → message "Aucun outil avec RFID dans cette sélection"
- Tous présents → message "Inventaire complet" à la place des sections vides
- Erreur réseau → message d'erreur inline dans la modal

### Fichiers touchés

- `client/src/pages/admin/inventory.js` — nouveaux états, nouveau handler `handleVerify`, nouvelle modal

---

## Tests

Un test backend sur `POST /api/tools/verify-inventory` couvrant :
- Cas nominal : present / missing / unknown correctement séparés
- Filtre par tag respecté
- RFIDs vides → 400

Pas de test frontend unitaire prévu (même convention que le reste du projet).

---

## Hors périmètre

- Export CSV du rapport de vérification
- Historique des vérifications passées
- Vérification depuis la page étudiant
