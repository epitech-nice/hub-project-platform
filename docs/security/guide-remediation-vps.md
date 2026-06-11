# Guide de remédiation — audit sécurité 2026-06

## Légende — OÙ exécuter chaque étape

- 💻 **LOCAL** = ta machine de dev (le dossier `~/Desktop/Dev/hub-project-platform`)
- 🖥️ **VPS** = le serveur OVH, en SSH (`51.75.200.98`)
- 🌐 **WEB** = une console web (Resend, Azure AD)

> Suis les étapes **dans l'ordre A → F**. Ne saute pas l'ordre interne d'une étape.

---

## ✅ Déjà fait (pour info)

- 💻 Tous les correctifs code commités sur la branche `security/hardening-audit-2026-06` et poussés sur GitHub.
- 💻 Tests backend 103/103, boot vérifié.
- 🖥️ Branche récupérée, recette fonctionnelle OK (login, preview PDF, recherche, emprunt, onglet historique admin).
- 🖥️ Port Mongo 27017 fermé en live (`nc` → refused).

Il reste à **rendre cette fermeture permanente** (via la version commitée du compose), **changer le mot de passe Mongo**, **purger le secret baké dans l'image**, **faire tourner les secrets**, puis **merger**.

---

## Étape A — 🖥️ VPS : sécuriser MongoDB (URGENT)

> Le port est déjà fermé en live, mais ta modif est **locale non commitée** : un futur
> `git pull` la perdrait. Ici on récupère la version commitée (port retiré proprement)
> ET on remplace le mot de passe trivial `mongo/mongo`.

**A.1 — Générer le nouveau mot de passe et le garder sous la main**
```bash
openssl rand -hex 24      # => copie le résultat, on l'appellera <NOUVEAU_MDP>
```

**A.2 — Créer le fichier `.env` racine** (lu par docker compose pour les `${...}`, gitignoré)
```bash
cat > .env <<EOF
MONGO_ROOT_USER=mongo
MONGO_ROOT_PASSWORD=<NOUVEAU_MDP>
EOF
```

**A.3 — Mettre à jour `server/.env.prod`** : remplacer le mot de passe dans `MONGODB_URI`
```
MONGODB_URI=mongodb://mongo:<NOUVEAU_MDP>@db:27017/hub_project_db?authSource=admin
```

**A.4 — Récupérer la version commitée du compose** (abandonne ta modif locale, récupère la mienne)
```bash
git checkout -- docker-compose.prod.yml
git pull
```

**A.5 — Changer le mot de passe live de Mongo** (le volume utilise encore `mongo/mongo`)
```bash
docker exec -it hub-project-db mongosh -u mongo -p mongo --authenticationDatabase admin \
  --eval "db.getSiblingDB('admin').changeUserPassword('mongo', '<NOUVEAU_MDP>')"
```

> ⚠️ Après A.5, le serveur perd la connexion Mongo (il a encore l'ancienne URI en mémoire).
> C'est normal, l'étape B le reconnecte. Enchaîne directement.

---

## Étape B — 🖥️ VPS : rebuild pour purger le secret baké + appliquer la branche (finding 4.1)

Un rebuild **sans cache** est nécessaire pour que le `.dockerignore` retire `.env.prod`
de l'image, et pour appliquer tous les correctifs code.

```bash
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

**Vérifications :**
```bash
# le serveur a redémarré et reparle à Mongo avec le nouveau mot de passe :
docker logs hub-project-server --tail 20        # "Serveur démarré sur le port 5000", pas d'erreur auth

# le secret n'est plus dans l'image :
docker exec hub-project-server sh -c 'find /app -maxdepth 2 -name ".env*"'   # => vide

# le port Mongo est fermé (depuis ton PC, pas le VPS) :
#   💻 LOCAL : nc -zv -w3 51.75.200.98 27017   => refused
```

À ce stade : teste vite le site (login + une page qui charge des données + preview PDF).

---

## Étape C — 🌐 WEB : faire tourner les secrets exposés

Ces secrets ont vécu dans des couches d'image (et backups éventuels). On les régénère.

- 🌐 **Resend** (dashboard) : révoquer l'ancienne `RESEND_API_KEY`, en générer une neuve.
- 🌐 **Azure AD** (App registrations > Certificates & secrets) : régénérer le `MICROSOFT_CLIENT_SECRET`.
- (Le `JWT_SECRET` a déjà été tourné si tu l'as régénéré ; sinon, c'est le moment.)

Puis 🖥️ **VPS** : reporter les nouvelles valeurs dans `server/.env.prod` et recharger le backend :
```bash
docker compose -f docker-compose.prod.yml up -d server
```

> Note : régénérer `JWT_SECRET` déconnecte les utilisateurs (ils se reconnectent). Sans impact data.

---

## Étape D — 🖥️ VPS : vérifier qu'aucune intrusion n'a eu lieu

La base a été joignable avec `mongo/mongo` pendant un temps indéterminé. On contrôle.
```bash
docker exec -it hub-project-db mongosh -u mongo -p '<NOUVEAU_MDP>' --authenticationDatabase admin \
  --quiet --eval 'db.adminCommand({listDatabases:1}).databases.forEach(d => print(d.name))'
```
Bases attendues : `admin`, `config`, `local`, `hub_project_db`. Toute base type
`READ__ME_TO_RECOVER`, `PWNED`, `readme`… = intrusion → restaurer depuis un backup propre.

---

## Étape E — 💻 LOCAL : merger la branche sur master

À faire **une fois A→D validés et le site stable en prod**.
```bash
git checkout master
git merge --no-ff security/hardening-audit-2026-06
git push origin master
```
Puis, si tu veux aligner le VPS sur master :
```bash
#  🖥️ VPS
git checkout master
git pull
# pas besoin de re-déployer si le VPS tournait déjà la branche (même code)
```

---

## Étape F — 💻 LOCAL : montée de versions des dépendances (finding 5.1) — PLUS TARD

Pas un quick-win, à traiter dans une branche dédiée avec tests :
```bash
cd server && npm audit
cd ../client && npm audit
```
Priorités : `next` 12 → 14, `multer` 1.x → 2.x, `axios` 0.x → 1.x. Optionnel : retirer `xss-clean`.

---

## Récapitulatif express

| Ordre | Où | Action |
|------|-----|--------|
| A | 🖥️ VPS | Sécuriser Mongo : `.env` racine + `.env.prod` + pull compose + changer mdp |
| B | 🖥️ VPS | `build --no-cache` + `up -d` (purge secret baké, applique la branche) |
| C | 🌐 + 🖥️ | Rotation Resend / Microsoft secret + reload server |
| D | 🖥️ VPS | Vérifier intrusion (listDatabases) |
| E | 💻 LOCAL | Merger la branche sur master |
| F | 💻 LOCAL | (plus tard) Montée de versions dépendances |
