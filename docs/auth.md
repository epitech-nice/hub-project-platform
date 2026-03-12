# Authentification

## Architecture : OAuth + JWT

L'authentification est hybride :
1. **Microsoft OAuth** — identification initiale via Azure AD
2. **JWT** — sessions persistantes côté frontend

---

## Flow d'authentification

```
Utilisateur → clic "Se connecter"
    → GET /api/auth/microsoft
    → Redirect Microsoft OAuth
    → Utilisateur saisit ses credentials
    → Microsoft → GET /api/auth/microsoft/callback
    → Backend crée ou met à jour le User en base
    → Génère un JWT signé
    → Redirect frontend : /auth/callback?token=<JWT>
    → Frontend stocke le token (localStorage)
    → Redirect vers /dashboard
```

---

## Middleware

### `authenticateToken` (`server/src/middleware/auth.js`)

Appliqué sur toutes les routes protégées.

- Lit le header `Authorization: Bearer <token>`
- Vérifie et décode le JWT (`JWT_SECRET`)
- Récupère l'utilisateur en base via l'ID contenu dans le token
- Attache `req.user` pour les handlers suivants
- Retourne 401 si token absent ou invalide, 404 si utilisateur introuvable

### `isAdmin` (`server/src/middleware/auth.js`)

Appliqué après `authenticateToken` sur les routes admin.

- Vérifie `req.user.role === 'admin'`
- Retourne 403 si l'utilisateur n'est pas admin

---

## Rôles

| Rôle | Attribution | Permissions |
|------|-------------|-------------|
| `student` | Défaut à la création du compte | Créer/gérer ses propres projets, workshops et enrollments Simulated |
| `admin` | Défini manuellement en base ou via `APP_OWNER_EMAILS` | Toutes les permissions + révision/gestion de tous les éléments |

---

## Structure du JWT

```json
{
  "id": "mongodb_object_id",
  "name": "Prénom Nom",
  "email": "user@epitech.eu",
  "role": "student"
}
```

Expiration : définie dans la configuration Passport (`passport.js`).

---

## Contexte React (`AuthContext.js`)

Expose aux composants frontend :
- `user` — objet utilisateur décodé depuis le JWT
- `isAuthenticated` — booléen
- `loading` — booléen (pendant la vérification initiale)
- `logout()` — supprime le token et redirige vers `/`

### Hook `useApi` (`hooks/useApi.js`)

Wrapper Axios qui injecte automatiquement le header `Authorization` dans chaque requête, et gère les erreurs 401 (déconnexion automatique).
