# Guide de remédiation — actions VPS (audit sécurité 2026-06)

Ce guide couvre les actions **à réaliser manuellement sur le VPS OVH**, que les
correctifs code de la branche `security/hardening-audit-2026-06` ne peuvent pas
faire seuls. À exécuter en SSH sur le VPS, dans l'ordre.

> ⚠️ **À LIRE EN PREMIER — prérequis bloquant.** Le correctif `config/auth.js`
> de cette branche **refuse désormais de démarrer le serveur en production si
> `JWT_SECRET` n'est pas défini**. Avant de déployer la branche, vérifie que
> `server/.env.prod` contient bien une ligne `JWT_SECRET=...` avec une valeur
> forte. Sinon le conteneur `hub-project-server` ne bootera pas.
>
> ```bash
> grep -q '^JWT_SECRET=' server/.env.prod && echo "OK JWT_SECRET present" || echo "MANQUANT — a ajouter avant deploiement"
> ```

---

## Étape 0 — Récupérer la branche sur le VPS

```bash
cd <chemin-du-repo-sur-le-vps>
git fetch origin
git checkout security/hardening-audit-2026-06
# (ne PAS encore merger sur master — on valide d'abord)
```

---

## Étape 1 — 🔴 Fermer MongoDB (finding 3.1, Critique)

**Contexte :** le port 27017 est joignable depuis Internet et le mot de passe
Mongo est faible. C'est l'action la plus urgente.

### 1a. Fermer le port

**Option recommandée — supprimer le mapping** dans `docker-compose.prod.yml`,
service `db` :

```yaml
  db:
    image: mongo:latest
    # ...
    # SUPPRIMER ces deux lignes :
    # ports:
    #   - "27017:27017"
```

Le backend accède à Mongo via le réseau interne `app-network` (`db:27017`), le
port hôte n'est pas nécessaire.

> Si tu as besoin d'un accès admin distant ponctuel, passe par un tunnel SSH :
> `ssh -L 27017:localhost:27017 user@vps` puis connecte-toi sur `localhost:27017`.
> Ne rouvre jamais le port public.

À défaut de suppression, binder en local : `- "127.0.0.1:27017:27017"`.

> ⚠️ Ne compte pas sur `ufw` : Docker contourne ses règles. Le mapping compose
> (ou le firewall réseau OVH) est le seul levier fiable.

### 1b. Changer le mot de passe Mongo

Génère un secret fort :

```bash
openssl rand -hex 32
```

Mets à jour l'utilisateur dans Mongo (remplace `<ancien>`/`<nouveau>`/`<user>`) :

```bash
docker exec -it hub-project-db mongosh -u <user> -p '<ancien_mdp>' --authenticationDatabase admin
```
```javascript
use admin
db.changeUserPassword("<user>", "<nouveau_mdp_fort>")
exit
```

Puis reporte le nouveau mot de passe dans `server/.env.prod` (variable
`MONGODB_URI=mongodb://<user>:<nouveau_mdp_fort>@db:27017/...?authSource=admin`).

### 1c. Vérifier qu'une intrusion n'a pas déjà eu lieu

Pendant l'exposition, un bot a pu écrire. Cherche des bases suspectes :

```bash
docker exec -it hub-project-db mongosh -u <user> -p '<nouveau_mdp>' --authenticationDatabase admin --quiet --eval 'db.adminCommand({listDatabases:1}).databases.forEach(d => print(d.name))'
```

Repère toute base de type `READ__ME_TO_RECOVER`, `PLEASE_READ`, `PWNED`, ou des
collections manquantes/vides anormales. Si présent → restaure depuis backup
après avoir fermé le port.

---

## Étape 2 — 🟠 Recréer les conteneurs et vérifier que les secrets ne sont plus bakés (finding 4.1)

Le `.dockerignore` serveur ajouté par cette branche empêche le `COPY . .` de
recopier `.env.prod` dans l'image. Il faut **rebuild sans cache** pour purger la
couche fautive.

```bash
docker compose -f docker-compose.prod.yml build --no-cache server
docker compose -f docker-compose.prod.yml up -d
```

**Vérification — le secret ne doit plus être dans l'image :**

```bash
docker exec hub-project-server sh -c 'find /app -maxdepth 2 -name ".env*"'
# Attendu : AUCUNE sortie (avant le fix : /app/.env.prod)
```

Les variables d'env continuent d'arriver via `env_file:` au runtime — le site
fonctionne normalement.

**Purger les anciennes images contenant le secret :**

```bash
docker image prune -f
# verifie qu'aucune image intermediaire ne traine :
docker images | grep hub-project
```

---

## Étape 3 — 🟠 Rotation des secrets exposés (consécutif à 4.1)

Les secrets ont vécu dans des couches d'image (et d'éventuels backups). Par
précaution, régénère :

- **`JWT_SECRET`** : `openssl rand -hex 64` → remplacer dans `.env.prod`.
  ⚠️ Invalide les sessions en cours (les utilisateurs devront se reconnecter).
- **`RESEND_API_KEY`** : régénérer depuis le dashboard Resend, remplacer dans
  `.env.prod`. (Risque : envoi d'emails au nom du domaine = phishing.)
- **`MICROSOFT_CLIENT_SECRET`** : régénérer dans Azure AD > App registrations >
  Certificates & secrets, remplacer dans `.env.prod`.

Après modification de `.env.prod` :

```bash
docker compose -f docker-compose.prod.yml up -d server
```

---

## Étape 4 — 🟠 Mettre à jour les dépendances vulnérables (finding 5.1)

À faire hors VPS (en local), puis redéployer. Audit :

```bash
cd server && npm audit
cd ../client && npm audit
```

Priorités (CVE connues) :
- **client : `next@12.2.3`** → migrer vers la dernière 14.x (corrige SSRF image,
  empoisonnement de cache, contournement middleware). Migration la plus lourde,
  à tester soigneusement.
- **server : `multer@1.4.5-lts.1`** → `2.x` (DoS).
- **server/client : `axios@0.27/0.30`** → `1.x` (SSRF/fuite d'en-têtes).
- **`xss-clean`** : déprécié — peut être retiré (Helmet + échappement de sortie
  suffisent). Optionnel.

À traiter dans une branche dédiée, ce n'est pas un quick-win sans risque.

---

## Étape 5 — Vérifications post-déploiement (recette)

À cocher **avant de merger la branche** :

- [ ] Le site charge, login Microsoft OK.
- [ ] **La preview PDF de la partie Simulated s'affiche bien** (iframe). C'est le
      point sensible du correctif Helmet : ouvrir une page projet Simulated avec
      un sujet PDF et vérifier que l'iframe s'affiche. Inspecter la réponse
      `/uploads/...` (DevTools > Network) : doit avoir
      `Cross-Origin-Resource-Policy: cross-origin` et **pas** de `X-Frame-Options`.
- [ ] L'onglet « Historique » de l'inventaire fonctionne (route `loans/history`).
- [ ] Recherche d'outils fonctionne (correctif ReDoS).
- [ ] `nc -zv -w3 <IP_VPS> 27017` depuis un poste externe → **refused/timed out**.
- [ ] `docker exec hub-project-server sh -c 'find /app -maxdepth 2 -name ".env*"'`
      → aucune sortie.
- [ ] Le serveur a bien démarré (logs : `Serveur démarré sur le port 5000`).

---

## Étape 6 — Merge

Une fois la recette validée par toi :

```bash
git checkout master
git merge --no-ff security/hardening-audit-2026-06
git push origin master
# puis redéploiement habituel sur le VPS depuis master
```

---

## Récapitulatif : qui fait quoi

| Action | Statut |
|---|---|
| `.dockerignore`, garde-fou JWT, ReDoS, microsoftId, Helmet/uploads, HSTS | ✅ fait (code, branche) |
| Fermer port 27017 + rotation mdp Mongo (3.1) | ⬜ VPS — étape 1 |
| Rebuild + purge image + vérif secret (4.1) | ⬜ VPS — étape 2 |
| Rotation Resend / MS secret / JWT (4.1) | ⬜ VPS/consoles — étape 3 |
| Montée de versions dépendances (5.1) | ⬜ branche dédiée — étape 4 |
| Décision : étudiants voient-ils tous les emprunts ? (2.3) | ⬜ choix produit |
