# Réintroduction de MMU_TTG_MAP aux côtés du .acm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Réintroduire l'appel `MMU_TTG_MAP` côté `printer-agent`, en complément du sidecar `.acm` déjà écrit, pour que le mapping tool→gate choisi par l'étudiant soit effectif sur le chemin de dispatch MQTT (`kobra.py::mqtt_print_file`) — le chemin normal en usage réel, que le `.acm` seul ne couvre pas.

**Architecture:** `_try_dispatch` calcule désormais systématiquement une table complète tool→gate (`_build_ttg_map`, identité par défaut, longueur `MAX_ACE_GATE + 1`) à partir des mêmes `tool_gate_pairs` déjà validés pour le `.acm`, et l'envoie via `MoonrakerClient.set_ttg_map()` (`POST /printer/gcode/script`, commande `MMU_TTG_MAP`) juste avant `start_print()`. Le `.acm` reste inchangé, pour le chemin non-MQTT.

**Tech Stack:** Python 3.11, `requests`, `pytest` + `requests_mock` (printer-agent uniquement — aucun changement côté `server`/`client`). Un fichier Markdown (`docs/api-print.md`) est aussi mis à jour.

**Spec:** `docs/superpowers/specs/2026-09-17-ttg-map-mqtt-path-design.md`

## Global Constraints

- `set_ttg_map` est appelé **systématiquement** à chaque dispatch (mono, multi-outils, override vide) — jamais seulement pour le cas multi-outils, car un `ttg_map` laissé non-identité par un job précédent ferait aussi résoudre le `Tn` du cas mono vers le mauvais gate physique (spec, section "Implication pour le cas mono-matériau").
- `set_ttg_map` est appelé **après** `upload_acm` (si présent) et **avant** `start_print` — jamais avant le téléchargement du fichier.
- Le mapping envoyé à `set_ttg_map` est **toujours complet** (un gate par index de tool, longueur `MAX_ACE_GATE + 1`, identité par défaut) — jamais une liste partielle.
- Aucune modification à `_resolve_gate_assignments` ni `_build_acm_mapping` : `tool_gate_pairs`, déjà résolu et validé par le code existant, est réutilisé tel quel.
- Toute nouvelle méthode `MoonrakerClient` suit le patron d'erreur existant : lever `MoonrakerClientError`, jamais laisser fuiter une exception `requests` brute.
- Un échec de `set_ttg_map` fait échouer le dispatch (job `failed`, `start_print` jamais appelé) — pas de mode best-effort, même posture que l'échec d'upload `.acm`/`.gcode`.

---

## Task 1: `MoonrakerClient.set_ttg_map()`

**Files:**
- Modify: `printer-agent/agent/moonraker_client.py` (nouvelle méthode, après `upload_acm`)
- Test: `printer-agent/tests/test_moonraker_client.py` (nouveau bloc de tests)

**Interfaces:**
- Produces: `MoonrakerClient.set_ttg_map(mapping: list[int]) -> None` — lève `MoonrakerClientError` sur échec réseau ou HTTP ≥ 400. `mapping` est une liste complète (un gate par index de tool), jamais partielle — construite par `_build_ttg_map` (Task 2).

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `printer-agent/tests/test_moonraker_client.py`, ajouter en tête du fichier l'import manquant :

```python
import urllib.parse
```

(juste après `import time`, avant `import pytest`)

Puis ajouter à la fin du fichier :

```python
def test_set_ttg_map_sends_mmu_ttg_map_script():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/printer/gcode/script", json={"result": "ok"})
        client.set_ttg_map([3, 1, 2, 3])
    query = urllib.parse.parse_qs(urllib.parse.urlparse(m.last_request.url).query)
    assert query["script"] == ["MMU_TTG_MAP MAP=3,1,2,3"]


def test_set_ttg_map_raises_on_network_error():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/printer/gcode/script", exc=requests.exceptions.ConnectTimeout)
        with pytest.raises(MoonrakerClientError):
            client.set_ttg_map([0, 1, 2, 3])


def test_set_ttg_map_raises_on_http_error():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/printer/gcode/script", status_code=500, text="internal error")
        with pytest.raises(MoonrakerClientError):
            client.set_ttg_map([0, 1, 2, 3])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd printer-agent && pytest tests/test_moonraker_client.py -k set_ttg_map -v`
Expected: FAIL avec `AttributeError: 'MoonrakerClient' object has no attribute 'set_ttg_map'`

- [ ] **Step 3: Implémenter `set_ttg_map`**

Dans `printer-agent/agent/moonraker_client.py`, ajouter la méthode juste après `upload_acm` (avant le commentaire `# Fenêtre de corrélation pour _get_recent_gcode_error`) :

```python
    def set_ttg_map(self, mapping):
        """Assigne la table tool→gate côté firmware (`MMU_TTG_MAP MAP=g0,g1,g2,g3`) — appel gcode
        séparé, envoyé juste avant start_print(). Nécessaire en complément de upload_acm() : le
        chemin de dispatch MQTT (kobra.py::mqtt_print_file, le chemin normal en usage réel avec
        le mode LAN activé) construit son propre print_data sans jamais lire le sidecar .acm sur
        disque — mmu_ace.py::patch_print_data y calcule le mapping tool→gate exclusivement depuis
        self.ace.ttg_map (voir spec 2026-09-17). mapping : liste complète d'un gate par index de
        tool (voir _build_ttg_map, agent/main.py), jamais une liste partielle."""
        url = f"{self.base_url}/printer/gcode/script"
        script = f"MMU_TTG_MAP MAP={','.join(str(g) for g in mapping)}"
        try:
            response = requests.post(url, params={"script": script}, timeout=self.timeout)
        except requests.RequestException as exc:
            raise MoonrakerClientError(f"Moonraker injoignable (MMU_TTG_MAP): {exc}") from exc

        if response.status_code >= 400:
            raise MoonrakerClientError(
                f"Erreur Moonraker (MMU_TTG_MAP, HTTP {response.status_code}): {response.text}"
            )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd printer-agent && pytest tests/test_moonraker_client.py -v`
Expected: PASS pour l'intégralité du fichier.

- [ ] **Step 5: Commit**

```bash
cd printer-agent && git add agent/moonraker_client.py tests/test_moonraker_client.py
git commit -m "$(cat <<'EOF'
feat(print-agent): reintroduce MoonrakerClient.set_ttg_map()

Removed in PR #20 as dead code (confirmed to have no effect on the
non-MQTT dispatch path). Needed back: the MQTT dispatch path
(kobra.py::mqtt_print_file, the normal path in real usage with LAN mode
on) never reads the .acm sidecar and derives its gate mapping entirely
from firmware ttg_map state instead. See spec 2026-09-17.
EOF
)"
```

---

## Task 2: `_build_ttg_map()` — table complète tool→gate

**Files:**
- Modify: `printer-agent/agent/main.py` (nouvelle fonction, après `_build_acm_mapping`)
- Test: `printer-agent/tests/test_run_tick.py` (nouveau bloc de tests unitaires)

**Interfaces:**
- Consumes: `MAX_ACE_GATE` (constante existante, `agent/main.py`, valeur `3`)
- Produces: `_build_ttg_map(tool_gate_pairs: list[tuple[int, int]] | None) -> list[int]` — toujours de longueur `MAX_ACE_GATE + 1`, identité par défaut. Utilisé par Task 3 pour alimenter `MoonrakerClient.set_ttg_map`.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `printer-agent/tests/test_run_tick.py`, modifier la ligne d'import (ligne 10) :

```python
from agent.main import MAX_JOB_AGE_SECONDS, run_tick, _build_acm_mapping, _build_ttg_map, _hex_to_rgb, _resolve_gate_assignments
```

Puis ajouter, juste après le bloc de tests `test_build_acm_mapping_raises_when_assigned_gate_has_no_color` (après la ligne `_build_acm_mapping([(0, 0)], gates)` et avant le commentaire `# --- Heartbeat`) :

```python
def test_build_ttg_map_returns_identity_when_none():
    assert _build_ttg_map(None) == [0, 1, 2, 3]


def test_build_ttg_map_returns_identity_when_empty():
    assert _build_ttg_map([]) == [0, 1, 2, 3]


def test_build_ttg_map_overrides_assigned_tools_only():
    assert _build_ttg_map([(0, 3), (2, 1)]) == [3, 1, 1, 3]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd printer-agent && pytest tests/test_run_tick.py -k build_ttg_map -v`
Expected: FAIL avec `ImportError: cannot import name '_build_ttg_map'`

- [ ] **Step 3: Implémenter `_build_ttg_map`**

Dans `printer-agent/agent/main.py`, ajouter la fonction juste après `_build_acm_mapping` (avant `_inject_gate_selection`) :

```python
def _build_ttg_map(tool_gate_pairs):
    """Construit la table complète tool→gate pour MMU_TTG_MAP (voir spec 2026-09-17) : un gate
    par index de tool, longueur MAX_ACE_GATE + 1, initialisée à l'identité puis écrasée par
    chaque paire de tool_gate_pairs (déjà validées par _build_acm_mapping, voir _try_dispatch).
    tool_gate_pairs=None ou [] renvoie l'identité pure — c'est le cas mono et override vide, qui
    doivent quand même réinitialiser un ttg_map potentiellement laissé non-identité par un job
    multi-outils précédent (un ttg_map non-identité ferait aussi résoudre le Tn du cas mono vers
    le mauvais gate physique)."""
    ttg_map = list(range(MAX_ACE_GATE + 1))
    if not tool_gate_pairs:
        return ttg_map
    for tool_index, gate in tool_gate_pairs:
        ttg_map[tool_index] = gate
    return ttg_map
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd printer-agent && pytest tests/test_run_tick.py -v`
Expected: PASS pour l'intégralité du fichier (les tests de dispatch existants ne sont pas encore affectés — `_build_ttg_map` n'est pas encore appelée depuis `_try_dispatch`).

- [ ] **Step 5: Commit**

```bash
cd printer-agent && git add agent/main.py tests/test_run_tick.py
git commit -m "$(cat <<'EOF'
feat(print-agent): add _build_ttg_map for the full tool->gate table

Reuses the same tool_gate_pairs already resolved/validated for the .acm
sidecar to build a complete identity-by-default mapping, ready to feed
MoonrakerClient.set_ttg_map(). Not yet wired into dispatch.
EOF
)"
```

---

## Task 3: Câbler `set_ttg_map` dans `_try_dispatch`

**Files:**
- Modify: `printer-agent/agent/main.py:225-243` (bloc de dispatch dans `_try_dispatch`)
- Test: `printer-agent/tests/test_run_tick.py` (4 tests existants modifiés, 1 nouveau test)

**Interfaces:**
- Consumes: `_build_ttg_map` (Task 2), `moonraker.set_ttg_map` (Task 1)

- [ ] **Step 1: Modifier les tests existants et en ajouter un nouveau**

Dans `printer-agent/tests/test_run_tick.py`, modifier `test_dispatch_injects_gate_selection_for_a_mono_gate_assignment` : ajouter juste avant `moonraker.start_print.assert_called_once_with("a.gcode")` :

```python
    moonraker.set_ttg_map.assert_called_once_with([0, 1, 2, 3])
```

Modifier `test_dispatch_uploads_gcode_and_starts_print_without_acm_when_gate_assignments_absent` : ajouter juste avant `moonraker.start_print.assert_called_once_with("a.gcode")` :

```python
    moonraker.set_ttg_map.assert_called_once_with([0, 1, 2, 3])
```

Modifier `test_dispatch_uploads_gcode_and_starts_print_without_acm_when_gate_assignments_empty` : même ajout, juste avant `moonraker.start_print.assert_called_once_with("a.gcode")` :

```python
    moonraker.set_ttg_map.assert_called_once_with([0, 1, 2, 3])
```

Remplacer entièrement `test_dispatch_uploads_acm_before_start_print_for_multi_tool_assignment` par :

```python
def test_dispatch_uploads_acm_before_start_print_for_multi_tool_assignment(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {
        "jobId": "job-1",
        "fileName": "a.gcode",
        "downloadUrl": "/x",
        "gateAssignments": [{"tool": "T0", "gate": 3}, {"tool": "T2", "gate": 1}],
    }

    call_order = []

    def fake_download(job_id, dest_path):
        call_order.append("download")
        with open(dest_path, "w") as f:
            f.write("G28\nT0\nG1 X10\nT2\nG1 X20\n")

    def fake_upload_file(file_path, filename):
        call_order.append("upload_file")

    def fake_upload_acm(filename, mapping):
        call_order.append("upload_acm")
        call_order.append(mapping)

    def fake_set_ttg_map(mapping):
        call_order.append("set_ttg_map")
        call_order.append(mapping)

    def fake_start_print(filename):
        call_order.append("start_print")

    hub.download_job_file.side_effect = fake_download
    moonraker = make_moonraker()
    moonraker.get_mmu_status.return_value = [
        {"gate": 1, "material": "PETG", "color": "212721FF", "empty": False},
        {"gate": 3, "material": "PLA", "color": "F40031FF", "empty": False},
    ]
    moonraker.upload_file.side_effect = fake_upload_file
    moonraker.upload_acm.side_effect = fake_upload_acm
    moonraker.set_ttg_map.side_effect = fake_set_ttg_map
    moonraker.start_print.side_effect = fake_start_print

    run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    assert call_order[0] == "download"
    assert call_order[1] == "upload_file"
    assert call_order[2] == "upload_acm"
    acm_mapping = call_order[3]
    assert acm_mapping == [
        {"paint_index": 0, "ams_index": 3, "paint_color": [244, 0, 49], "ams_color": [244, 0, 49], "material_type": "PLA"},
        {"paint_index": 2, "ams_index": 1, "paint_color": [33, 39, 33], "ams_color": [33, 39, 33], "material_type": "PETG"},
    ]
    assert call_order[4] == "set_ttg_map"
    assert call_order[5] == [3, 1, 1, 3]
    assert call_order[6] == "start_print"
```

Puis ajouter un nouveau test, juste après `test_dispatch_fails_job_and_never_starts_print_when_acm_upload_fails` :

```python
def test_dispatch_fails_job_and_never_starts_print_when_set_ttg_map_fails(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {"jobId": "job-1", "fileName": "a.gcode", "downloadUrl": "/x"}

    def fake_download(job_id, dest_path):
        with open(dest_path, "w") as f:
            f.write("G28\n")

    hub.download_job_file.side_effect = fake_download
    moonraker = make_moonraker()
    moonraker.set_ttg_map.side_effect = MoonrakerClientError("MMU_TTG_MAP refusé")

    run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    moonraker.start_print.assert_not_called()
    hub.update_job_status.assert_called_once_with("job-1", "failed", error_message="MMU_TTG_MAP refusé")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd printer-agent && pytest tests/test_run_tick.py -v`
Expected: FAIL sur les 5 tests modifiés/ajoutés (`moonraker.set_ttg_map` jamais appelé — les mocks `MagicMock()` acceptent l'appel silencieusement, mais les nouvelles assertions échouent).

- [ ] **Step 3: Câbler `set_ttg_map` dans `_try_dispatch`**

Dans `printer-agent/agent/main.py`, remplacer :

```python
        moonraker.upload_file(dest_path, file_name)
        if acm_mapping is not None:
            moonraker.upload_acm(file_name, acm_mapping)
        try:
            moonraker.start_print(file_name)
```

par :

```python
        moonraker.upload_file(dest_path, file_name)
        if acm_mapping is not None:
            moonraker.upload_acm(file_name, acm_mapping)
        moonraker.set_ttg_map(_build_ttg_map(tool_gate_pairs))
        try:
            moonraker.start_print(file_name)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd printer-agent && pytest tests/ -v`
Expected: PASS pour l'intégralité de la suite (`test_run_tick.py` et `test_moonraker_client.py`).

- [ ] **Step 5: Commit**

```bash
cd printer-agent && git add agent/main.py tests/test_run_tick.py
git commit -m "$(cat <<'EOF'
feat(print-agent): send MMU_TTG_MAP before every print start

Wires _build_ttg_map + MoonrakerClient.set_ttg_map into _try_dispatch,
called unconditionally (mono, multi-tool, empty override) right before
start_print, after the .acm upload. A failure fails the dispatch, same
as the .acm/gcode upload. See spec 2026-09-17 for why both the .acm and
ttg_map mechanisms are needed (they cover different dispatch paths that
Rinkhals/Moonraker picks between at runtime, outside agent control).
EOF
)"
```

---

## Task 4: Mettre à jour `docs/api-print.md`

**Files:**
- Modify: `docs/api-print.md:318`

- [ ] **Step 1: Remplacer le paragraphe obsolète**

Dans `docs/api-print.md`, remplacer le paragraphe (ligne 318) :

```
Le dispatch effectif se déroule ensuite dans cet ordre strict, chaque étape conditionnant la suivante (le fichier n'est jamais imprimé si une étape précédente a échoué) : téléchargement du `.gcode` depuis le hub → upload vers Moonraker (`print=false`) → pour un job multi-outils, upload du sidecar `<basename>.acm` (écrase celui auto-généré par Moonraker depuis les métadonnées slicer, seul fichier que gklib lit réellement pour ce mapping) → `POST /printer/print/start`. Il n'existe plus de réinitialisation `MMU_TTG_MAP`/`ttg_map` : ce mécanisme a été entièrement supprimé (tests matériel réels ayant confirmé qu'il n'a aucun effet sur gklib), et le sidecar `.acm` étant réécrit à chaque job multi-outils, aucun état persistant du firmware ne peut fuiter d'un job au suivant.
```

par :

```
Le dispatch effectif se déroule ensuite dans cet ordre strict, chaque étape conditionnant la suivante (le fichier n'est jamais imprimé si une étape précédente a échoué) : téléchargement du `.gcode` depuis le hub → upload vers Moonraker (`print=false`) → pour un job multi-outils, upload du sidecar `<basename>.acm` (écrase celui auto-généré par Moonraker depuis les métadonnées slicer) → `MMU_TTG_MAP` (systématique, y compris en mono/override — voir plus bas) → `POST /printer/print/start`.

Depuis le 2026-09-17, `printer-agent` envoie systématiquement `MMU_TTG_MAP` juste avant `POST /printer/print/start`, en complément du `.acm` (voir spec `2026-09-17-ttg-map-mqtt-path-design.md`) : le chemin de dispatch MQTT (`kobra.py::mqtt_print_file`, le chemin normal en usage réel avec le mode LAN activé) construit son `print_data` à partir de rien et ne lit jamais le sidecar `.acm` sur disque — `mmu_ace.py::patch_print_data` y calcule le mapping tool→gate exclusivement depuis l'état firmware `ttg_map`. Les deux mécanismes sont donc nécessaires et non redondants : `.acm` couvre le chemin non-MQTT (dégradé/transitoire), `ttg_map`/`MMU_TTG_MAP` couvre le chemin MQTT. `MMU_TTG_MAP` est envoyé à chaque dispatch avec une table complète (un gate par tool, identité par défaut) — jamais seulement pour le cas multi-outils — car un `ttg_map` laissé non-identité par un job précédent ferait aussi résoudre le `Tn` du cas mono vers le mauvais gate physique.
```

- [ ] **Step 2: Commit**

```bash
git add docs/api-print.md
git commit -m "$(cat <<'EOF'
docs(print): document MMU_TTG_MAP back alongside the .acm mechanism

Updates the dispatch sequence description to reflect that both
mechanisms are needed, one per dispatch path picked by Rinkhals at
runtime — corrects the paragraph written for PR #20, which assumed
MMU_TTG_MAP was dead code.
EOF
)"
```

---

## Après implémentation (hors plan, rappel de la spec)

Un test supervisé réel sur le Kobra 3 de test (`192.168.68.7`) est requis avant tout déploiement, y compris sur les 2 autres imprimantes de prod : dispatch multi-tool réel (vérifier `gcodeMapping`/`ams_box_mapping` reçu par gklib), dispatch mono après un job multi-tool (vérifier que `Tn` résout vers le bon gate), dispatch avec `gateAssignments` vide, et re-soumission du même nom de fichier avec des `gateAssignments` différents. Voir spec, section "Tests". Ce plan ne couvre que la couche `printer-agent` unitaire ; le déploiement (copie sur l'imprimante, `app.sh restart`) et la vérification matérielle restent manuels.

Le log de diagnostic temporaire déjà présent dans `_try_dispatch` (non committé, voir mémoire projet) reste hors périmètre de ce plan — à retirer séparément une fois le test supervisé validé.
