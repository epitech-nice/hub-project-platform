# Écriture directe du sidecar `.acm` pour le mapping tool→gate — Design

## Contexte

La feature "remapping bobine→gate ACE v2" (spec `2026-09-10-remap-gate-ace-design.md`, PR #17 mergée) a introduit `MMU_TTG_MAP` comme mécanisme pour qu'un fichier multi-couleurs utilise les gates choisis par l'étudiant sur le Hub, plutôt que le mapping par défaut du slicer. Cette PR notait déjà un risque résiduel explicite : *"ce mécanisme n'a jamais été testé en conditions réelles"*.

**Test supervisé réel effectué le 2026-09-11** (mémoire projet, section "INVESTIGATION CLOSE") : deux dispatchs réels sur le Kobra 3 de prod, `MMU_TTG_MAP MAP=0,2,2,0` envoyé juste avant le démarrage, confirment que **ce mécanisme n'a aucun effet**. Root cause tracée précisément par lecture directe du firmware Rinkhals (`kobra.py`, `mmu_ace.py`) et confirmée par les logs :

1. Le dispatch de `printer-agent` (`POST /printer/print/start` → gcode `SDCARD_PRINT_FILE`) passe systématiquement par la branche `delegate_run_gcode()` de `kobra.py::handle_gcode_print_file` — jamais par `mqtt_print_file()`/`patch_print_data()`, le seul endroit où `MMU_TTG_MAP`/`ttg_map` est consulté. Confirmé par `moonraker.log` : `[Kobra] Not MQTT print file: ...` loggé sur chaque tentative, **y compris en mode réseau LAN** (le mode LAN n'a d'effet que sur la synchro écran tactile, sans rapport).
2. Le vrai moteur d'impression (`gklib`, binaire Go fermé) lit et utilise **directement** un fichier sidecar `<nom>.acm` sur disque (`/userdata/app/gk/printer_data/gcodes/<nom>.acm`), généré automatiquement par Moonraker au moment de l'upload à partir des métadonnées AMS qu'OrcaSlicer embarque nativement dans le gcode — totalement indépendant de la couche Python Moonraker/`mmu`/`ttg_map`.
3. Contenu du `.acm` vérifié en direct : JSON plat, `{"use_ams": bool, "ams_box_mapping": [{"paint_index", "paint_color": [r,g,b], "material_type", "ams_index", "ams_color": [r,g,b]}, ...]}` — `paint_index` = index du tool, `ams_index` = gate physique.
4. Confirmé également que ce même endpoint d'upload (`POST /server/files/upload`, celui déjà utilisé par l'agent pour le `.gcode`) accepte sans validation particulière un fichier `.acm` arbitraire et l'écrit tel quel à l'emplacement attendu — testé en direct (upload d'un `.acm` de diagnostic, contenu relu, conforme).

**Conclusion** : `MMU_TTG_MAP` (tout le mécanisme introduit en PR #17 pour le cas multi-tool) doit être abandonné et remplacé par l'écriture directe de ce `.acm`, qui est le seul canal que `gklib` consulte réellement.

**Hors de cause, non affecté** : le mécanisme mono-matériau existant (injection `Tn` en tête de fichier, PR #16) — jamais mis en cause par cette investigation, aucune raison de le modifier.

## Objectif

Remplacer `MMU_TTG_MAP`/`set_ttg_map()` par l'écriture du `.acm` correct côté agent, avant de démarrer l'impression, pour que le mapping tool→gate choisi par l'étudiant sur le Hub soit réellement celui utilisé par `gklib`.

## Architecture

### `printer-agent/agent/moonraker_client.py`

**Retiré** : `set_ttg_map()` (dead code confirmé — jamais consulté par `gklib` sur le chemin de dispatch réel de l'agent).

**`upload_and_start_print` scindé en trois étapes explicites** (au lieu d'un seul appel `POST /server/files/upload` avec `print=true`) :

1. `upload_file(file_path, filename, root="gcodes")` — `POST /server/files/upload`, `print=false`. Méthode générique (réutilisée pour le `.gcode` et le `.acm`), remplace le comportement actuel où l'upload et le démarrage n'étaient qu'un seul appel.
2. `start_print(filename)` — nouvelle méthode, `POST /printer/print/start` avec `{"filename": filename}`.
   - Sur échec (HTTP ≥ 400), le corps de réponse contient directement `{"error": {"message": "..."}}` avec le message réel de `gklib` (ex: `"unknown filament in extruder"`, `"The device cannot parse the file"`) — confirmé en direct lors des deux tests du 2026-09-11. `start_print` lève `MoonrakerClientError` avec ce message directement, sans passer par l'enrichissement `_get_recent_gcode_error`/`gcode_store` (PR #19) qui reste conservé comme repli uniquement si la réponse d'erreur ne contient pas de message exploitable — deux chemins vers la même information, celui-ci est direct et plus fiable, aucune suppression de l'existant.
3. Orchestration (nouvelle méthode ou logique dans `_try_dispatch`, à trancher en plan) : upload du `.gcode` → upload du `.acm` (si mapping multi-tool) → `start_print`. Si l'upload du `.acm` échoue, **ne jamais appeler `start_print`** — sinon `gklib` repartirait silencieusement sur le mapping du slicer, pire que l'état actuel où l'échec est au moins visible.

### `printer-agent/agent/main.py`

**`_resolve_gate_assignments`** : signature/retour changent de `(single_gate, ttg_map)` à `(single_gate, tool_gate_pairs)`.
- `gate_assignments` vide/absent → `(None, None)` — aucun `.acm` écrit, aucun `Tn` injecté, comportement inchangé (le fichier garde le mapping du slicer, cas déjà accepté aujourd'hui via `overrideNoSpoolData`). **Simplification notable** : plus besoin de réinitialiser un état firmware persistant à l'identité avant dispatch (nécessaire avec `ttg_map`, qui survit entre jobs côté firmware) — chaque `.acm` est propre à son fichier, aucun état résiduel possible.
- Une entrée `tool=null` → `(gate, None)`, comportement `Tn` inchangé, aucun `.acm`.
- Une ou plusieurs entrées `tool` non-null → `(None, [(tool_index, gate), ...])`.

**Construction du `.acm`** (nouvelle fonction, ex. `_build_acm_mapping(tool_gate_pairs, mmu_status)`) : pour chaque `(tool_index, gate)`, retrouve `mmu_status["gates"][gate]` (déjà renvoyé par `get_mmu_status()`, présent : `material`, `color` en hex `RRGGBBAA`, `empty`) et construit une entrée :
```
{"paint_index": tool_index, "ams_index": gate,
 "paint_color": [r, g, b], "ams_color": [r, g, b],
 "material_type": material}
```
Conversion couleur : `color[0:2]`, `color[2:4]`, `color[4:6]` en hex → int (les 2 derniers caractères, alpha, toujours `FF` en pratique côté ACE — ignorés). `paint_color` et `ams_color` reçoivent la même valeur (le Hub ne distingue pas "couleur attendue par le slicer" de "couleur réelle du gate" à ce stade — seule la couleur réelle du gate choisi est connue et pertinente ici).

**`_try_dispatch`** : remplace l'appel `moonraker.set_ttg_map(ttg_map)` (fait aujourd'hui *avant* le téléchargement) par, *après* téléchargement du fichier et injection `Tn` éventuelle : si `tool_gate_pairs` n'est pas `None`, appelle `moonraker.get_mmu_status()`, construit le mapping, puis la séquence upload `.gcode` → upload `.acm` → `start_print` (remplace l'actuel `moonraker.upload_and_start_print(dest_path, file_name)` par cette séquence explicite, avec ou sans étape `.acm` selon le cas).

## Gestion d'erreurs

- Échec upload `.gcode` ou `.acm` → job `failed`, même patron que l'échec actuel (`hub.update_job_status(job_id, "failed", ...)`), aucun `start_print` appelé.
- Échec `start_print` → job `failed` avec le message réel de `gklib` (amélioration par rapport à aujourd'hui, où ce message passe déjà par l'enrichissement `gcode_store` en repli).
- `get_mmu_status()` injoignable au moment de construire le `.acm` → job `failed` (comportement cohérent avec le reste du dispatch, qui échoue déjà proprement sur toute erreur Moonraker).

## Tests

- Unitaires (`printer-agent/tests/`) : `_resolve_gate_assignments` (nouveau retour), `_build_acm_mapping` (conversion couleur, plusieurs tools vers un même gate — cas déjà couvert aujourd'hui pour `ttg_map`), `MoonrakerClient.upload_file`/`start_print` (succès, erreur HTTP avec message direct, repli `gcode_store`), orchestration complète dans `_try_dispatch` (mono inchangé, multi-tool nouveau chemin, vide inchangé).
- Test supervisé réel sur le Kobra 3 de prod avant tout déploiement (même exigence que pour `MMU_TTG_MAP` en PR #17, qui ne l'avait pas eu — cause directe de cette investigation) : au minimum un dispatch multi-tool réel avec vérification du `gcodeMapping` dans `gklib.log` correspondant au mapping envoyé, un test avec un fichier mono-matériau (chemin `Tn` inchangé) et un test avec `gateAssignments` vide (override).

## Hors périmètre

- Mécanisme mono-matériau (`Tn` injecté en tête de fichier) : non affecté par cette investigation, aucun changement.
- Cas où l'étudiant n'a pas configuré l'AMS dans OrcaSlicer (fichier sans mapping AMS du tout) : hors de portée, ce cas ne génère jamais de `gateAssignments` multi-tool côté Hub aujourd'hui (le flux de confirmation ne propose un `GatePicker` par tool que si des tools sont détectés dans le fichier).
- Nettoyage du `.acm` du slicer après écrasement, ou du `.gcode`/`.acm` après impression sur l'imprimante elle-même : hors périmètre, comportement Moonraker existant (rétention gcode déjà un gap connu, voir mémoire projet, section spike Rinkhals du 2026-09-07).
- Bug non lié découvert en testant (nom de fichier accentué en Unicode NFD faisant planter `gklib`) : documenté en mémoire projet, pas traité ici — aucun étudiant n'a encore rencontré ce cas en usage réel.
