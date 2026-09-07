# Déploiement de l'agent d'impression sur Rinkhals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Packager `printer-agent` en app Rinkhals, provisionner une entrée `Printer` côté Hub, et faire tourner l'agent pour de vrai sur le premier Kobra 3 déjà flashé.

**Architecture:** `printer-agent` (déjà écrit, testé, doté d'un flag `--loop`) est copié tel quel sur l'imprimante dans `/useremain/home/rinkhals/apps/printer-agent/`, packagé avec un `app.sh`/`app.json` au format attendu par le système d'apps natif de Rinkhals (démarrage géré par `start.sh` de Rinkhals au boot, pas par cron — inexistant sur ce runtime). Côté Hub, un enregistrement `Printer` est créé via l'UI admin existante pour obtenir l'`api_key` que l'agent utilisera.

**Tech Stack:** Python 3.11 (stdlib uniquement : `json`, pas de `PyYAML`), `requests` (déjà présent nativement sur le firmware Rinkhals testé), shell POSIX (`ash`/busybox) pour l'intégration Rinkhals, Next.js/Express déjà en place côté Hub (aucune modification backend/frontend nécessaire, l'UI de création d'imprimante existe déjà).

**Spec:** `docs/superpowers/specs/2026-09-03-agent-impression-3d-design.md` (spec d'origine de l'agent). Ce plan n'a pas de spec dédiée séparée : les décisions de déploiement ci-dessous ont été établies en session le 2026-09-07 par un spike matériel direct (SSH sur le Kobra 3 réellement flashé) plutôt que par un document de spec formel — elles sont actées ici en tant que contraintes globales.

## Global Constraints

- Pas de cron sur le runtime Rinkhals réel (`crond: applet not found`, pas de `/var/spool/cron`) → l'agent tourne obligatoirement avec le flag `--loop` (process persistant, tick toutes les 60s), jamais invoqué en tick unique en production.
- `PyYAML` ne peut pas être installé sur cette plateforme (ARMv7/Python 3.11, pas de wheel PyPI, build source qui échoue) → la config de l'agent est en JSON (`config.json`, pas `config.yaml`). Ce changement est déjà fait dans `printer-agent/agent/main.py` (commit à vérifier avant de commencer ce plan).
- `pip` n'existe que via `python3 -m pip` sur ce runtime (pas de binaire `pip3` dans le PATH). `requests` est déjà présent nativement sur le firmware Rinkhals `20260901_01` testé — ne pas tenter de l'installer sauf si `python3 -c "import requests"` échoue sur la machine cible.
- Une app Rinkhals custom (« user app ») vit dans `/useremain/home/rinkhals/apps/<nom>/`, doit contenir `app.sh` + `app.json` (avec `"$version": "1"` exactement, sinon l'app est ignorée par le boot), et un fichier marqueur vide `.enabled` à sa racine pour être démarrée automatiquement.
- `app.sh start` est invoqué par Rinkhals avec un **timeout de 5 secondes** (`start_app $APP 5` dans `files/3-rinkhals/start.sh` de Rinkhals) : `start()` doit lancer le process en arrière-plan (`&`) et retourner immédiatement, jamais bloquer.
- Empreinte mesurée sur le matériel réel (Kobra 3, Rinkhals `20260901_01`) : 1 seul cœur CPU, 212 Mo RAM totale, ~15.5 Mo RSS pour l'agent avec `requests` chargé — acceptable au vu du budget "Moonraker + 1~2 apps" documenté par Rinkhals.
- Ce plan ne couvre qu'**un seul** Kobra 3 (celui déjà flashé et joignable en SSH pendant cette session). Les deux autres imprimantes suivront la même procédure une fois flashées — pas répété ici, la Task 3 sert de recette réutilisable.

---

### Task 1 : Packager `printer-agent` comme app Rinkhals

**Files:**
- Create: `printer-agent/rinkhals-app/app.json`
- Create: `printer-agent/rinkhals-app/app.sh`
- Modify: `printer-agent/README.md` (ajouter une section "Installation sur l'imprimante (Rinkhals)")

**Interfaces:**
- Consumes: `python3 -m agent.main --config <path> --loop` (CLI déjà existant dans `agent/main.py`, flag `--loop` déjà implémenté).
- Produces: `app.sh {status|start|stop}` — contrat attendu par `files/3-rinkhals/tools.sh` de Rinkhals (`start_app`/`stop_app`/`get_app_status`), consommé par la Task 3 (déploiement).

- [ ] **Step 1: Écrire `app.json`**

```json
{
    "$version": "1",

    "name": "Hub Print Agent",
    "description": "Relie cette imprimante à la file d'impression du Hub Epitech Nice (agent pull-only)",
    "version": "1.0.0",
    "depends": [],

    "requirements": {
        "cpu": 5,
        "memory": 20
    }
}
```

- [ ] **Step 2: Valider que `app.json` est du JSON strictement valide**

Run: `python3 -m json.tool printer-agent/rinkhals-app/app.json`
Expected: le JSON est réimprimé formaté, aucune erreur `json.decoder.JSONDecodeError`.

- [ ] **Step 3: Écrire `app.sh`**

```sh
#!/bin/sh

. /useremain/rinkhals/.current/tools.sh

export AGENT_ROOT=$(dirname $(realpath $0))
export AGENT_CONFIG="$AGENT_ROOT/config.json"
export AGENT_STDOUT_LOG="$AGENT_ROOT/agent.stdout.log"

status() {
    PIDS=$(get_by_name "agent.main")

    if [ "$PIDS" == "" ]; then
        report_status $APP_STATUS_STOPPED
    else
        report_status $APP_STATUS_STARTED "$PIDS" "$AGENT_ROOT/agent.log"
    fi
}

start() {
    kill_by_name "agent.main"

    cd $AGENT_ROOT
    log "Starting Hub print agent from $AGENT_ROOT"
    python3 -m agent.main --config $AGENT_CONFIG --loop >> $AGENT_STDOUT_LOG 2>&1 &
}

stop() {
    kill_by_name "agent.main"
}

case "$1" in
    status)
        status
        ;;
    start)
        start
        ;;
    stop)
        stop
        ;;
    *)
        echo "Usage: $0 {status|start|stop}" >&2
        exit 1
        ;;
esac
```

Note : `get_by_name`/`kill_by_name` (fournis par `tools.sh` de Rinkhals) matchent sur la ligne de commande complète du process — `"agent.main"` est un substring stable de `python3 -m agent.main --config ... --loop` quel que soit l'ordre des arguments qui suivent, contrairement à un pattern qui inclurait `--loop` (qui pourrait se retrouver après `--config <path>` et casser un match trop spécifique).

- [ ] **Step 4: Vérifier la syntaxe shell**

Run: `sh -n printer-agent/rinkhals-app/app.sh`
Expected: aucune sortie, code de retour 0 (pas d'erreur de syntaxe).

- [ ] **Step 5: Rendre `app.sh` exécutable**

Run: `chmod +x printer-agent/rinkhals-app/app.sh`
Expected: `ls -la printer-agent/rinkhals-app/app.sh` montre le bit `x` posé (ex: `-rwxr-xr-x`).

- [ ] **Step 6: Documenter l'installation dans `printer-agent/README.md`**

Ajouter cette section après celle existante ("## Déploiement") :

```markdown
## Installation sur l'imprimante (Rinkhals)

`printer-agent` est packagé comme une "app" custom du système d'apps Rinkhals (voir
`rinkhals-app/`). Sur l'imprimante, une app custom vit dans
`/useremain/home/rinkhals/apps/<nom>/` et doit contenir `app.sh` + `app.json`, plus un fichier
vide `.enabled` à sa racine pour démarrer automatiquement au boot.

Procédure (voir aussi le plan
`docs/superpowers/plans/2026-09-07-deploiement-agent-imprimante-rinkhals.md` pour le détail
complet, réutilisable pour chaque nouvelle imprimante) :

1. Créer l'entrée `Printer` côté Hub (`/admin/print`) pour récupérer `id` et `api_key`.
2. Remplir un `config.json` réel à partir de `config.example.json` avec ces valeurs.
3. Copier `agent/`, `app.sh`, `app.json`, `config.json` dans
   `/useremain/home/rinkhals/apps/printer-agent/` sur l'imprimante (SSH, port 22, user `root`,
   mot de passe par défaut Rinkhals `rockchip` — à changer en prod).
4. `chmod 600 config.json` et `chmod +x app.sh`.
5. `touch /useremain/home/rinkhals/apps/printer-agent/.enabled`.
6. Démarrer immédiatement sans reboot : `./app.sh start` depuis ce dossier (ou redémarrer
   l'imprimante, qui démarrera l'app automatiquement au boot suivant).
7. Vérifier : `./app.sh status` doit répondre `Status: started` avec un PID, et
   `tail -f agent.log` doit montrer des ticks réguliers.
```

- [ ] **Step 7: Commit**

```bash
git add printer-agent/rinkhals-app/app.json printer-agent/rinkhals-app/app.sh printer-agent/README.md
git commit -m "$(cat <<'EOF'
feat(print-agent): package as a Rinkhals app

Adds app.sh/app.json so printer-agent can run as a native Rinkhals
"user app" (started/stopped/monitored via start.sh at boot), since the
target runtime has no cron at all.
EOF
)"
```

---

### Task 2 : Provisionner l'entrée `Printer` côté Hub pour ce Kobra 3

**Files:** aucun changement de code — tâche opérationnelle via l'UI admin déjà existante (`client/src/pages/admin/print/index.js`, endpoint `POST /api/print/printers` déjà en prod).

**Interfaces:**
- Consumes: `POST /api/print/printers` avec body `{name, model}` (contrat déjà existant, `server/src/controllers/print/printerController.js:14-27`), réponse `{data: {printer: {_id, name, model, ...}, apiKey}}` — l'`apiKey` n'est montrée qu'une seule fois à la création.
- Produces: un `id` Mongo et un `api_key` en clair, consommés par la Task 3 pour remplir `config.json`.

- [ ] **Step 1: Se connecter au Hub en tant qu'admin et ouvrir `/admin/print`**

- [ ] **Step 2: Créer l'imprimante via le formulaire existant**

Renseigner un nom explicite (ex: `Kobra 3 - Atelier 1`) et le modèle. Valider.

- [ ] **Step 3: Copier immédiatement l'API key affichée**

Elle n'est montrée qu'une fois à la création (`res.data.apiKey` dans `handleCreatePrinter`,
`client/src/pages/admin/print/index.js:136-146`) — si elle est perdue, il faut utiliser
"Régénérer la clé" (`POST /api/print/printers/:id/regenerate-key`) plutôt que recréer
l'imprimante.

- [ ] **Step 4: Noter l'`id` Mongo de l'imprimante créée**

Visible dans la liste des imprimantes de `/admin/print`, ou via `GET /api/print/printers`
(champ `_id`).

- [ ] **Step 5: Vérifier que l'imprimante apparaît bien en base**

Run (depuis un poste ayant accès à l'API du Hub, avec un cookie de session admin valide) :
`curl -s https://<hub-domain>/api/print/printers -H "Cookie: <session>" | jq '.data[] | {id: ._id, name, model, status}'`
Expected: l'imprimante créée apparaît dans la liste, avec `status` à sa valeur par défaut
(probablement `offline`, aucun agent ne s'étant encore connecté).

---

### Task 3 : Déployer et démarrer l'agent sur le Kobra 3

**Files:** aucun fichier du repo modifié — déploiement sur le matériel physique via SSH. Dépend des Tasks 1 et 2 terminées.

**Interfaces:**
- Consumes: `printer-agent/rinkhals-app/{app.sh,app.json}` (Task 1), `id`/`api_key` de l'imprimante (Task 2), `printer-agent/config.example.json` comme gabarit.
- Produces: un process `printer-agent` tournant en continu sur l'imprimante, visible côté Hub comme un `Printer` avec un `lastSeenAt` récent.

- [ ] **Step 1: Préparer un `config.json` réel en local (jamais commité)**

```bash
cp printer-agent/config.example.json /tmp/config.json
```

Éditer `/tmp/config.json` pour renseigner les vraies valeurs (`hub.base_url` = URL réelle du
Hub, `printer.id` et `printer.api_key` = valeurs de la Task 2, `moonraker.base_url` reste
`http://localhost:7125`).

- [ ] **Step 2: Copier les fichiers de l'agent sur l'imprimante**

```bash
IP=10.82.247.208   # adapter à l'IP réelle de l'imprimante au moment du déploiement
ssh root@$IP "mkdir -p /useremain/home/rinkhals/apps/printer-agent"
scp -r printer-agent/agent \
       printer-agent/rinkhals-app/app.sh \
       printer-agent/rinkhals-app/app.json \
       /tmp/config.json \
       root@$IP:/useremain/home/rinkhals/apps/printer-agent/
ssh root@$IP "chmod 600 /useremain/home/rinkhals/apps/printer-agent/config.json"
```

(mot de passe SSH par défaut Rinkhals : `rockchip`, root)

- [ ] **Step 3: Rendre `app.sh` exécutable et activer l'app**

```bash
ssh root@$IP "chmod +x /useremain/home/rinkhals/apps/printer-agent/app.sh && touch /useremain/home/rinkhals/apps/printer-agent/.enabled"
```

- [ ] **Step 4: Vérifier que `requests` est bien disponible sur cette machine précise**

```bash
ssh root@$IP "python3 -c 'import requests; print(requests.__version__)'"
```

Expected: affiche un numéro de version, pas de `ModuleNotFoundError`. Si absent : `ssh root@$IP "python3 -m pip install requests"` (peut être lent, cf. contrainte CPU/RAM globale — surveiller que ça ne bloque pas indéfiniment le seul cœur CPU).

- [ ] **Step 5: Démarrer l'agent sans attendre un reboot**

```bash
ssh root@$IP "cd /useremain/home/rinkhals/apps/printer-agent && ./app.sh start"
```

- [ ] **Step 6: Vérifier le statut immédiatement**

```bash
ssh root@$IP "cd /useremain/home/rinkhals/apps/printer-agent && ./app.sh status"
```

Expected:
```
Status: started
PIDs: <un ou plusieurs PIDs numériques>
Log: /useremain/home/rinkhals/apps/printer-agent/agent.log
```

- [ ] **Step 7: Suivre les logs pendant au moins 2 ticks (2 minutes)**

```bash
ssh root@$IP "tail -n 50 -f /useremain/home/rinkhals/apps/printer-agent/agent.log"
```

Expected: au moins deux lignes `Aucun nouveau job pour cette imprimante.` (ou équivalent) espacées d'environ 60s, aucune exception non gérée.

- [ ] **Step 8: Confirmer côté Hub que l'imprimante est vue comme en ligne**

```bash
curl -s https://<hub-domain>/api/print/printers -H "Cookie: <session admin>" | jq '.data[] | select(.name=="Kobra 3 - Atelier 1") | {status, lastSeenAt}'
```

Expected: `lastSeenAt` récent (moins de 2 minutes), `status` qui n'est plus `offline`.

- [ ] **Step 9: Vérifier la persistance au reboot**

```bash
ssh root@$IP "reboot"
```

Attendre ~1-2 minutes que l'imprimante redémarre complètement, puis :

```bash
ssh root@$IP "cd /useremain/home/rinkhals/apps/printer-agent && ./app.sh status"
```

Expected: `Status: started` à nouveau, sans avoir eu à relancer `app.sh start` manuellement —
confirme que le boot de Rinkhals démarre bien l'app via le fichier `.enabled`.

- [ ] **Step 10: Mettre à jour la mémoire projet**

Noter dans la mémoire (`project_integration_imprimantes_3d`) que l'agent tourne réellement en
prod sur ce premier Kobra 3 depuis telle date, avec le nom/id de l'imprimante créée côté Hub —
pas une étape de code, mais à ne pas oublier pour que la prochaine session sache où en est le
déploiement réel (par opposition au code déjà mergé mais pas encore exécuté sur le matériel).

---

## Self-Review

**Couverture** : packaging Rinkhals (Task 1) → provisioning Hub (Task 2) → déploiement +
vérification end-to-end incluant survie au reboot (Task 3). Couvre toutes les contraintes
listées dans "Global Constraints" (`--loop`, JSON, `pip`/`requests`, format app Rinkhals,
timeout de 5s au démarrage, budget CPU/RAM).

**Placeholders** : aucun — commandes shell et code JSON/sh donnés intégralement, IP/URL/nom
d'imprimante marqués explicitement comme "à adapter" plutôt que laissés vagues.

**Cohérence des noms** : `agent.main` (nom de module utilisé pour `get_by_name`/`kill_by_name`
dans `app.sh`) correspond exactement à `python3 -m agent.main` utilisé dans `start()` et déjà
existant dans `printer-agent/agent/main.py`. `config.json`/`config.example.json` cohérents avec
le renommage déjà fait dans `agent/main.py:load_config`. Chemin `/useremain/home/rinkhals/apps/`
cohérent entre Task 1 (doc) et Task 3 (déploiement réel).

**Hors scope assumé** : rotation/nettoyage de `agent.stdout.log` (fichier de redirection stdout
créé par `app.sh`, distinct du `agent.log` avec rotation déjà géré par le code Python) — laissé
tel quel pour cette passe, volume négligeable vu la fréquence des ticks ; à surveiller si ça
devient un problème réel plutôt qu'à anticiper maintenant.
