# Onboarding d'une imprimante 3D (Rinkhals + agent Hub)

Checklist condensée pour flasher Rinkhals sur une Anycubic Kobra 3 / Kobra 3 Max et y déployer
`printer-agent`. Basée sur le déploiement réel du premier Kobra 3 le 2026-09-07 — pour le détail
complet et les justifications, voir `docs/superpowers/plans/2026-09-07-deploiement-agent-imprimante-rinkhals.md`.

## Prérequis

- Clé USB FAT32, table de partition MBR (pas GPT)
- Un poste sur le **même réseau** que l'imprimante pendant toute l'opération (SSH direct requis,
  pas d'accès distant)
- Accès admin au Hub (`/admin/print`)

## 1. Flasher Rinkhals

1. Vérifier le firmware stock actuel (Réglages → À propos) :
   - Kobra 3 : `2.4.5` ou `2.4.6.7`
   - Kobra 3 Max : `2.5.1.7` ou `2.5.2.8`

   Si autre version : mettre à jour/downgrade via l'appli Anycubic d'abord.

2. Télécharger depuis [rinkhals-community/Rinkhals releases](https://github.com/rinkhals-community/Rinkhals/releases) (le dépôt `jbatonnet/Rinkhals` est déprécié depuis le 2026-07-01) :
   - Kobra 3 → `installer-k2p-k3.swu`
   - Kobra 3 Max → `installer-k3m.swu`

3. Renommer en `update.swu`, le placer dans un dossier nommé exactement `aGVscF9zb3Nf` à la
   racine de la clé USB.

4. Imprimante allumée, insérer la clé → l'installeur se lance après ~10s.

5. Dans l'installeur : connecter le Wi-Fi si ce n'est pas déjà fait (nécessaire pour que
   l'installeur récupère la liste des versions disponibles — sans réseau, "Manage" n'affiche
   qu'une case à cocher vide, aucune version à installer).

6. Rinkhals → Manage → choisir la dernière version stable → Install.

7. **Si erreur "Not enough free space in /useremain"** (quasi systématique sur une imprimante
   déjà utilisée depuis longtemps) : voir "Libérer de l'espace" ci-dessous, puis refaire
   l'étape 6.

8. Une fois installé : Réglages → l'entrée "Rinkhals" doit apparaître, `ssh root@<ip>`
   (mot de passe `rockchip`) doit répondre.

### Libérer de l'espace si besoin

Le dossier `/useremain/app/gk/gcodes/` accumule tous les gcode envoyés depuis toujours et n'est
jamais nettoyé automatiquement — c'est la cause quasi certaine d'un "not enough free space".

Un accès shell root est possible **sans même avoir Rinkhals installé** :

1. Télécharger `tools-k2p-k3.zip` (ou `tools-k3m.zip`) depuis les releases Rinkhals, en extraire
   `ssh-k2p-k3.swu` (ou `ssh-k3m.swu`)
2. Le renommer `update.swu`, remplacer le fichier dans `aGVscF9zb3Nf/` sur la clé
3. Réinsérer la clé, redémarrer l'imprimante → ouvre un SSH root sur le **port 2222**
   (mot de passe `rockchip`), sans rien flasher
4. `ssh -p 2222 root@<ip>`, puis nettoyer (exemple : tout ce qui date d'avant une date donnée) :
   ```sh
   touch -t 202608010000 /tmp/cutoff   # adapter la date de coupure
   find /useremain/app/gk/gcodes -type f ! -newer /tmp/cutoff -exec rm {} +
   df -h /useremain
   ```
5. Remettre le fichier installeur d'origine sur la clé (celui de l'étape 2 de la section
   précédente) et reprendre à l'étape 6.

## 2. Créer l'imprimante côté Hub

1. `/admin/print` → créer l'imprimante (nom + modèle)
2. Copier l'`api_key` affichée (montrée une seule fois — si perdue, utiliser "Régénérer la clé",
   pas besoin de recréer l'imprimante)
3. Noter l'`id` Mongo (visible dans l'URL du bouton QR : `/admin/print/printers/<id>/qr`)

## 3. Déployer l'agent

Depuis la racine du repo :

```sh
IP=<ip de l'imprimante>

# Config réelle — jamais commitée dans le repo
cat > /tmp/config.json <<EOF
{
  "hub": { "base_url": "https://api-hub.nice-tek.eu/api/print/agent" },
  "printer": { "id": "<id Mongo du Hub>", "api_key": "<api_key du Hub>" },
  "moonraker": { "base_url": "http://localhost:7125" }
}
EOF

sshpass -p rockchip ssh -o StrictHostKeyChecking=no root@$IP \
  "mkdir -p /useremain/home/rinkhals/apps/printer-agent"

sshpass -p rockchip scp -o StrictHostKeyChecking=no -r printer-agent/agent \
  root@$IP:/useremain/home/rinkhals/apps/printer-agent/
sshpass -p rockchip scp -o StrictHostKeyChecking=no \
  printer-agent/rinkhals-app/app.sh printer-agent/rinkhals-app/app.json /tmp/config.json \
  root@$IP:/useremain/home/rinkhals/apps/printer-agent/

sshpass -p rockchip ssh -o StrictHostKeyChecking=no root@$IP '
  chmod 600 /useremain/home/rinkhals/apps/printer-agent/config.json
  chmod +x /useremain/home/rinkhals/apps/printer-agent/app.sh
  touch /useremain/home/rinkhals/apps/printer-agent/.enabled
  cd /useremain/home/rinkhals/apps/printer-agent && ./app.sh start && ./app.sh status
'
```

> ⚠️ **Piège rencontré le 2026-09-07** : `hub.base_url` n'est **pas** `https://hub.nice-tek.eu/...`.
> Le frontend et l'API backend sont sur deux sous-domaines distincts en prod
> (`hub.nice-tek.eu` vs `api-hub.nice-tek.eu`, valeur définie dans `client/.env`, non versionné,
> non déductible du repo seul). Une mauvaise URL renvoie une page 404 HTML Next.js au lieu d'une
> erreur JSON `{"success":false,...}` — c'est le symptôme qui doit faire remonter cette note.

## 4. Vérifier

- `tail -f agent.log` sur l'imprimante : au moins 2 ticks propres (~60s d'écart), aucun warning
- `/admin/print` : l'imprimante passe au statut **Disponible** (pas Offline)
- Redémarrer l'imprimante (`ssh root@$IP reboot`) et revérifier `./app.sh status` après ~1 min →
  doit être reparti tout seul, sans relancer `./app.sh start` manuellement (confirme que
  `.enabled` fonctionne)
