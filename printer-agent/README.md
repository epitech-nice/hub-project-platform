# printer-agent

Agent pull-only qui tourne sur chaque imprimante (Anycubic Kobra 3 / Kobra 3 Max flashées
[Rinkhals](https://github.com/rinkhals-community/Rinkhals)) et fait le lien avec le Hub :
récupère les jobs d'impression, les transmet à Moonraker en local, remonte le statut.

## Déploiement

- Copier `config.example.json` en `config.json` (non commité) et renseigner les valeurs réelles.
- `config.json` contient une clé API en clair : une fois copié, restreindre les permissions avec
  `chmod 600 config.json`.
- Lancer l'agent avec `python3 -m agent.main --loop` depuis le dossier `printer-agent/` (et non
  `python3 agent/main.py`, qui échoue avec "attempted relative import with no known parent
  package" à cause des imports relatifs du package `agent`).
- **Le flag `--loop` est obligatoire sur Rinkhals** : le runtime embarqué n'a pas de cron du tout
  (confirmé par SSH sur du matériel réel — `crond: applet not found` dans ce build busybox, pas de
  `/var/spool/cron`). `--loop` fait tourner l'agent en process persistant (tick toutes les 60s)
  au lieu d'un tick unique invoqué par cron. Sans `--loop`, l'agent fait un seul tick puis quitte
  (utile pour du debug manuel ou un environnement qui a bien un cron).
- Dépendances : `requests` uniquement (voir `requirements.txt`). Volontairement pas de `PyYAML` —
  la config est en JSON précisément parce que PyPI n'a pas de wheel précompilé pour
  ARMv7/Python 3.11 (le runtime Rinkhals réel), et compiler PyYAML depuis les sources échoue sur
  cette machine (Cython manquant) et serait de toute façon risqué à tenter sur un device à 1 seul
  cœur CPU / 212 Mo de RAM totale.
- `pip` est disponible sur Rinkhals uniquement via `python3 -m pip` (pas de binaire `pip3` dans le
  PATH). `requests` est déjà présent nativement sur le firmware testé — vérifier avec
  `python3 -c "import requests"` avant de tenter une install.
- Empreinte mesurée sur du matériel réel (Kobra 3, Rinkhals `20260901_01`) : ~15.5 Mo de RSS pour
  un process Python avec `requests` chargé, CPU quasi nul en idle (le process dort 59s/60 en mode
  `--loop`). Comparable au coût d'une app Rinkhals classique (Tailscale, etc.) — la doc Rinkhals
  indique que Moonraker + 1~2 apps tourne bien sur ce matériel.
- Fichiers gcode uploadés sur Moonraker (dossier gcodes) : ce fichier de config n'active aucun
  nettoyage automatique après une impression terminée. C'est une lacune opérationnelle connue
  (politique de rétention à définir, suppression via DELETE /server/files/gcodes/<name> ou non) —
  décision volontairement hors scope de cette passe. Note du 2026-09-07 : sur la première
  imprimante flashée, ce dossier avait accumulé 866 fichiers / 4.8 Go sans jamais avoir été
  nettoyé, au point de bloquer l'installation de Rinkhals lui-même faute d'espace disque libre.
