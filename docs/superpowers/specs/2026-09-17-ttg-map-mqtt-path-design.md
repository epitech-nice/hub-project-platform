# Réintroduction de `MMU_TTG_MAP` en complément du `.acm` — couvrir le chemin de dispatch MQTT — Design

## Contexte

La spec `2026-09-11-acm-sidecar-gate-mapping-design.md` (PR #20, mergée) a remplacé `MMU_TTG_MAP` par l'écriture directe du sidecar `.acm`, après avoir conclu que `MMU_TTG_MAP` n'avait aucun effet réel — conclusion établie via deux dispatchs réels sur le Kobra 3 de prod (192.168.68.7), à un moment où l'imprimante était dans un état dégradé qui forçait systématiquement le dispatch sur la branche non-MQTT de `kobra.py` (`moonraker.log` : `[Kobra] Not MQTT print file: ...`).

**Découverte critique du 2026-09-17** (mémoire projet, section "DÉCOUVERTE CRITIQUE") : une fois l'imprimante saine (après reboot physique) et en mode LAN, le dispatch réel passe par la branche **MQTT** de `kobra.py` (`mqtt_print_file`) — le chemin normal en usage réel, pas un cas dégradé. Sur ce chemin, le mapping choisi par l'étudiant est silencieusement ignoré : gklib reçoit systématiquement un mapping identité, quel que soit le `.acm` écrit sur disque.

**Root cause confirmée par lecture directe du firmware sur l'imprimante (2026-09-17, cette session)** :

1. `kobra.py::mqtt_print_file` construit `print_data` **à partir de zéro** (`filename`, `filepath`, `taskid`, `task_settings`, …) — cette structure ne contient jamais de clé `ams_settings` au départ, et ne lit jamais le `.acm` sur disque.
2. `print_data` est ensuite passé à travers `self.print_data_patchers` — une liste avec un **unique** patcher enregistré (`register_print_data_patcher` n'est appelé qu'une fois dans tout le firmware, par `mmu_ace.py:1612`, avec `self.patch_print_data`). Confirmé par recherche exhaustive sur les fichiers du firmware.
3. `mmu_ace.py::patch_print_data` contient le garde `if self.ace.enabled and "ams_settings" not in print_data:` — ce garde est donc **toujours vrai** sur le chemin MQTT (la clé n'existe jamais avant ce point), et le mapping est systématiquement recalculé depuis `self.ace.ttg_map` (identité par défaut, jamais écrit depuis la suppression de `set_ttg_map` en PR #20).
4. Le handler gcode `MMU_TTG_MAP` (`_on_gcode_mmu_ttg_map` → `update_ttg_map`) existe toujours dans le firmware — seul l'appel côté agent a été supprimé.
5. `self.ace.ttg_map` est préservé entre les polls périodiques du statut ACE (~20s, `_set_ace_status`) tant que le nombre de gates physiques ne change pas (fix firmware issue #49) — un `ttg_map` custom envoyé avant un dispatch tient donc jusqu'au prochain changement de topologie, pas seulement jusqu'au prochain poll.

**Implication pour le cas mono-matériau aussi** : l'injection `Tn` (où `n` = gate physique voulu) suppose que `ttg_map[n] == n` au moment de la résolution du tool par `patch_print_data`. Un `ttg_map` laissé non-identité par un job multi-couleur précédent ferait donc résoudre `Tn` vers le mauvais gate physique, même en mono — ce n'est pas seulement un risque pour le multi-tool.

**Conclusion** : les deux mécanismes (`.acm` et `MMU_TTG_MAP`) sont nécessaires et non redondants — `.acm` couvre le chemin non-MQTT (dégradé/transitoire : goklipper non démarré, MQTT broker local indisponible), `ttg_map`/`MMU_TTG_MAP` couvre le chemin MQTT (le chemin normal en usage réel, LAN sain). Désactiver MQTT pour ne garder qu'un mécanisme n'est pas une option : le mode LAN a été activé spécifiquement pour la synchro écran tactile (`kobra.py`, `is_using_mqtt()`), qui dépend de ce même chemin.

## Objectif

Réintroduire l'appel `MMU_TTG_MAP` côté agent, en complément de (pas à la place de) l'écriture `.acm` déjà en place, pour que le mapping choisi par l'étudiant soit effectif sur les deux chemins de dispatch possibles.

## Architecture

### `printer-agent/agent/moonraker_client.py`

**Réintroduit** : `set_ttg_map(mapping)` — quasi identique à l'implémentation supprimée en PR #20 (`git show ede73e7`) : `POST /printer/gcode/script` avec `script = f"MMU_TTG_MAP MAP={','.join(str(g) for g in mapping)}"`, lève `MoonrakerClientError` sur erreur réseau ou HTTP ≥ 400. `mapping` est une liste complète (un gate par index de tool, longueur `MAX_ACE_GATE + 1`), jamais une liste partielle.

### `printer-agent/agent/main.py`

**Nouvelle fonction `_build_ttg_map(tool_gate_pairs)`** : construit un tableau identité `list(range(MAX_ACE_GATE + 1))`, puis écrase l'entrée `tool_index` par `gate` pour chaque paire de `tool_gate_pairs` (peut être `None` ou `[]` → identité pure). Ne revalide pas les gates individuellement (déjà fait par `_build_acm_mapping`, appelée sur les mêmes `tool_gate_pairs` juste avant dans `_try_dispatch` — voir plus bas ; en cas de `tool_gate_pairs` non vide, `_build_ttg_map` n'est appelée qu'après que `_build_acm_mapping` a validé sans erreur).

**`_try_dispatch`** : la séquence de dispatch devient :

1. `download_job_file` (inchangé)
2. `_inject_gate_selection` si `single_gate is not None` (inchangé)
3. `moonraker.upload_file(dest_path, file_name)` (inchangé)
4. `moonraker.upload_acm(file_name, acm_mapping)` si `acm_mapping is not None` (inchangé)
5. **Nouveau** : `full_ttg_map = _build_ttg_map(tool_gate_pairs)` puis `moonraker.set_ttg_map(full_ttg_map)` — appelé **systématiquement**, y compris quand `tool_gate_pairs is None` (mono ou override vide → identité pure envoyée). Placé juste avant l'étape 6, après l'upload du `.acm`.
6. `moonraker.start_print(file_name)` (inchangé, y compris le traitement existant du marqueur de timeout MQTT `MOONRAKER_PRINT_START_TIMEOUT_MARKER`)

Aucun changement à `_resolve_gate_assignments` ni à `_build_acm_mapping` — `tool_gate_pairs` déjà résolu/validé est réutilisé tel quel pour construire `full_ttg_map`.

## Gestion d'erreurs

- Échec de `set_ttg_map` (Moonraker injoignable, HTTP ≥ 400) → propage l'exception, capturée par le `except Exception` englobant de `_try_dispatch` existant → job `failed`, même posture que l'échec d'upload `.gcode`/`.acm`. Pas de mode best-effort : `ttg_map` est désormais sur le chemin critique de correction pour le cas normal (MQTT), un échec silencieux reproduirait exactement le bug qu'on corrige.
- Aucun changement aux autres chemins d'erreur déjà en place (espace disque, `gateAssignments` invalide, timeout MQTT sur `start_print`).

## Compatibilité entre les deux mécanismes

`ttg_map`/`mmu_ace` (chemin MQTT) et la lecture directe du `.acm` par `gklib` (chemin non-MQTT) sont deux mécanismes disjoints, confirmés par lecture de code sur les deux composants concernés — écrire l'un n'a aucun effet observable sur le comportement de l'autre. Aucun risque d'interférence entre les deux appels ajoutés à la séquence de dispatch.

## Tests

- Unitaires (`printer-agent/tests/`) :
  - `MoonrakerClient.set_ttg_map` : succès, erreur réseau, erreur HTTP ≥ 400 (repris de l'ancienne couverture supprimée en PR #20).
  - `_build_ttg_map` : `tool_gate_pairs=None` → identité ; `tool_gate_pairs=[]` → identité ; une paire → identité partiellement écrasée ; plusieurs paires (y compris deux tools vers le même gate, cas déjà couvert pour le `.acm`).
  - `_try_dispatch` (orchestration complète) : mono → `set_ttg_map` appelé avec l'identité ; override vide → `set_ttg_map` appelé avec l'identité ; multi-tool → `set_ttg_map` appelé avec le mapping correct, dans l'ordre attendu (après `upload_acm`, avant `start_print`) ; échec de `set_ttg_map` → job `failed`, `start_print` jamais appelé.
- **Test supervisé réel obligatoire avant tout déploiement** (canari `192.168.68.7` uniquement, les 2 autres imprimantes restent sur l'ancien code tant que ce test n'est pas concluant) :
  - Dispatch multi-tool réel avec vérification du `gcodeMapping` dans `gklib.log` (ou de l'`ams_box_mapping` reçu côté MQTT) correspondant au mapping envoyé — le test qui avait révélé le bug initial.
  - Dispatch mono-matériau réel après un job multi-tool (pour vérifier que `ttg_map` repasse bien à l'identité et que `Tn` résout vers le bon gate).
  - Dispatch avec `gateAssignments` vide (override).
  - Re-soumission du même nom de fichier avec des `gateAssignments` différents d'un job à l'autre (risque déjà identifié en revue finale de PR #20, jamais testé).

## Hors périmètre

- Le log de diagnostic temporaire ajouté dans `_try_dispatch` (`gateAssignments brut reçu du hub pour le job %s: %r`), déployé sur l'imprimante de test mais non committé — à retirer une fois ce fix validé, il a rempli son rôle diagnostique.
- Toute évolution du mécanisme `.acm` lui-même (non affecté par cette investigation).
- Nettoyage/rétention des `.acm`/`.gcode` sur l'imprimante : hors périmètre, gap déjà connu (mémoire projet, spike Rinkhals 2026-09-07).
- Idée produit "signal visible côté Hub pour un job `paused`" (notée le 2026-09-16) : hors périmètre, à brainstormer séparément si besoin.
