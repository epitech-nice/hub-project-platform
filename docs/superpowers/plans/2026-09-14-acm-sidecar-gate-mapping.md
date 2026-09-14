# Écriture directe du sidecar .acm pour le mapping tool→gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer `MMU_TTG_MAP` (confirmé sans effet réel sur `gklib` par des tests matériel réels) par l'écriture directe du sidecar `<nom>.acm` que `gklib` consulte réellement pour le mapping tool→gate d'un fichier multi-couleurs.

**Architecture:** `printer-agent` scinde son unique appel d'upload+démarrage en trois appels Moonraker explicites : upload du `.gcode` (`print=false`) → upload du `.acm` corrigé (uniquement si le job a des `gateAssignments` multi-tool) → `POST /printer/print/start`. `set_ttg_map()`/`MMU_TTG_MAP` sont supprimés (dead code confirmé).

**Tech Stack:** Python 3.11, `requests`, `pytest` + `requests_mock` (printer-agent uniquement — aucun changement côté `server`/`client`).

**Spec:** `docs/superpowers/specs/2026-09-11-acm-sidecar-gate-mapping-design.md`

## Global Constraints

- Ne jamais appeler `start_print()` si l'upload du `.acm` a échoué (sinon `gklib` repartirait silencieusement sur le mapping du slicer — spec, section "Gestion d'erreurs").
- Le mécanisme mono-matériau (injection `Tn` en tête de fichier) reste inchangé — aucune tâche de ce plan ne le touche.
- Toute nouvelle méthode `MoonrakerClient` suit le patron d'erreur existant : lever `MoonrakerClientError`, jamais laisser fuiter une exception `requests` brute.

---

## Task 1: `MoonrakerClient.upload_file` — remplace `upload_and_start_print`

**Files:**
- Modify: `printer-agent/agent/moonraker_client.py:20-56` (méthode `upload_and_start_print`)
- Test: `printer-agent/tests/test_moonraker_client.py:18-221` (bloc de tests `test_upload_and_start_print_*`)

**Interfaces:**
- Produces: `MoonrakerClient.upload_file(file_path: str, filename: str) -> None` — lève `MoonrakerClientError` sur échec réseau ou HTTP ≥ 400. N'inspecte plus le corps de la réponse (plus de `print_started` à lire, `print=false` toujours).

- [ ] **Step 1: Écrire les tests qui échouent, remplaçant tout le bloc `test_upload_and_start_print_*`**

Dans `printer-agent/tests/test_moonraker_client.py`, remplacer les lignes 18 à 221 (du premier `def test_upload_and_start_print_uses_a_longer_timeout_than_status_checks` jusqu'à la fin de `test_upload_and_start_print_raises_on_network_error` inclus) par :

```python
def test_upload_file_uses_a_longer_timeout_than_status_checks(tmp_path):
    # Bug réel en prod (2026-09-08) : un gcode de 6h a fait timeout à l'upload
    # (`read timeout=10`) alors que Moonraker aurait probablement fini par répondre — le
    # timeout de 10s partagé avec get_print_stats() est bien trop court pour écrire+parser un
    # gros fichier sur le CPU mono-cœur ARMv7 de ces imprimantes. L'upload doit avoir son
    # propre timeout, nettement plus généreux que celui des appels de statut légers.
    client = make_client()
    gcode_path = tmp_path / "print.gcode"
    gcode_path.write_text("G28\n")

    with patch("agent.moonraker_client.requests.post") as mock_post:
        mock_post.return_value.status_code = 200
        client.upload_file(str(gcode_path), "print.gcode")

    _, kwargs = mock_post.call_args
    assert kwargs["timeout"] > client.timeout


def test_upload_file_success(tmp_path):
    client = make_client()
    gcode_path = tmp_path / "print.gcode"
    gcode_path.write_text("G28\n")

    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/server/files/upload", json={"action": "create_file"})
        client.upload_file(str(gcode_path), "print.gcode")

    sent_body = m.last_request.text
    assert "print.gcode" in sent_body
    assert 'name="root"' in sent_body and "gcodes" in sent_body
    # print=false : le démarrage se fait désormais via start_print(), jamais ici — une
    # régression qui repasserait à "true" démarrerait l'impression avant que le .acm corrigé
    # (le cas échéant) n'ait été uploadé (voir spec 2026-09-11).
    assert 'name="print"' in sent_body and "false" in sent_body


def test_upload_file_raises_on_http_error(tmp_path):
    client = make_client()
    gcode_path = tmp_path / "print.gcode"
    gcode_path.write_text("G28\n")

    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/server/files/upload", status_code=500, text="internal error")
        with pytest.raises(MoonrakerClientError):
            client.upload_file(str(gcode_path), "print.gcode")


def test_upload_file_raises_on_network_error(tmp_path):
    client = make_client()
    gcode_path = tmp_path / "print.gcode"
    gcode_path.write_text("G28\n")

    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/server/files/upload", exc=requests.exceptions.ConnectTimeout)
        with pytest.raises(MoonrakerClientError):
            client.upload_file(str(gcode_path), "print.gcode")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd printer-agent && pytest tests/test_moonraker_client.py -k upload_file -v`
Expected: FAIL avec `AttributeError: 'MoonrakerClient' object has no attribute 'upload_file'`

- [ ] **Step 3: Remplacer `upload_and_start_print` par `upload_file`**

Dans `printer-agent/agent/moonraker_client.py`, remplacer les lignes 20 à 56 (la méthode `upload_and_start_print` complète, du `def upload_and_start_print` jusqu'au `raise MoonrakerClientError(message)` qui la termine) par :

```python
    def upload_file(self, file_path, filename):
        """Upload un fichier depuis le disque local vers Moonraker, sans démarrer l'impression
        (print=false) — voir start_print(), appelé séparément après. Remplace l'ancien
        upload_and_start_print (spec 2026-09-11, MMU_TTG_MAP remplacé par l'écriture directe du
        sidecar .acm que gklib consulte réellement) : upload et démarrage sont désormais deux
        appels distincts, pour pouvoir uploader le .acm corrigé entre les deux."""
        url = f"{self.base_url}/server/files/upload"
        try:
            with open(file_path, "rb") as f:
                files = {"file": (filename, f, "text/plain")}
                data = {"root": "gcodes", "print": "false"}
                response = requests.post(url, files=files, data=data, timeout=self.upload_timeout)
        except (requests.RequestException, OSError) as exc:
            raise MoonrakerClientError(f"Échec de l'upload de {filename} vers Moonraker: {exc}") from exc

        if response.status_code >= 400:
            raise MoonrakerClientError(
                f"Moonraker a refusé l'upload de {filename} (HTTP {response.status_code}): {response.text}"
            )
```

Le reste du fichier (`_get_recent_gcode_error`, `get_print_stats`, `cancel_print`, `get_mmu_status`, `set_ttg_map`) reste inchangé pour l'instant — `_get_recent_gcode_error` sera réutilisé par `start_print()` en Task 3, `set_ttg_map` sera supprimé en Task 3.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd printer-agent && pytest tests/test_moonraker_client.py -v`
Expected: PASS pour tous les tests `test_upload_file_*` ; les autres tests du fichier (get_print_stats, cancel_print, get_mmu_status, set_ttg_map) doivent aussi rester au vert, inchangés à ce stade.

- [ ] **Step 5: Commit**

```bash
cd printer-agent && git add agent/moonraker_client.py tests/test_moonraker_client.py
git commit -m "$(cat <<'EOF'
refactor(print-agent): split upload from print start in MoonrakerClient

Replaces upload_and_start_print with upload_file (print=false always) —
first step of moving away from MMU_TTG_MAP, which real hardware tests
confirmed never reaches gklib. start_print() and the .acm sidecar upload
come in follow-up commits.
EOF
)"
```

---

## Task 2: `MoonrakerClient.upload_acm`

**Files:**
- Modify: `printer-agent/agent/moonraker_client.py` (imports + nouvelle méthode)
- Test: `printer-agent/tests/test_moonraker_client.py`

**Interfaces:**
- Consumes: rien de nouveau (méthode indépendante).
- Produces: `MoonrakerClient.upload_acm(filename: str, mapping: list[dict]) -> None` — construit `<basename>.acm` et l'upload. `mapping` : liste de dicts `{paint_index: int, ams_index: int, paint_color: [r,g,b], ams_color: [r,g,b], material_type: str}` — format produit par `_build_acm_mapping` (Task 4).

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `printer-agent/tests/test_moonraker_client.py` :

```python
def test_upload_acm_uploads_json_sidecar_with_matching_basename(tmp_path):
    client = make_client()
    mapping = [
        {"paint_index": 0, "ams_index": 3, "paint_color": [225, 6, 0], "ams_color": [225, 6, 0], "material_type": "PLA"},
        {"paint_index": 2, "ams_index": 1, "paint_color": [33, 39, 33], "ams_color": [33, 39, 33], "material_type": "PETG"},
    ]

    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/server/files/upload", json={"action": "create_file"})
        client.upload_acm("multi.gcode", mapping)

    sent_body = m.last_request.text
    # Le sidecar doit porter le même nom de base que le gcode, extension .acm — c'est
    # exactement l'emplacement que gklib lit (voir spec 2026-09-11).
    assert 'filename="multi.acm"' in sent_body
    assert '"use_ams": true' in sent_body
    assert '"paint_index": 0' in sent_body and '"ams_index": 3' in sent_body
    assert '"paint_index": 2' in sent_body and '"ams_index": 1' in sent_body


def test_upload_acm_raises_on_http_error():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/server/files/upload", status_code=500, text="internal error")
        with pytest.raises(MoonrakerClientError):
            client.upload_acm("multi.gcode", [])


def test_upload_acm_raises_on_network_error():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/server/files/upload", exc=requests.exceptions.ConnectTimeout)
        with pytest.raises(MoonrakerClientError):
            client.upload_acm("multi.gcode", [])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd printer-agent && pytest tests/test_moonraker_client.py -k upload_acm -v`
Expected: FAIL avec `AttributeError: 'MoonrakerClient' object has no attribute 'upload_acm'`

- [ ] **Step 3: Ajouter les imports et la méthode**

Dans `printer-agent/agent/moonraker_client.py`, ajouter en tête de fichier (avant `import logging`) :

```python
import json
import os
```

Puis ajouter la méthode suivante, juste après `upload_file` :

```python
    def upload_acm(self, filename, mapping):
        """Construit et upload le sidecar <basename>.acm que gklib lit directement pour le
        mapping tool→gate d'un fichier multi-couleurs, en écrasant celui auto-généré par
        Moonraker depuis les métadonnées slicer — voir spec 2026-09-11 (MMU_TTG_MAP confirmé
        sans effet réel sur gklib par des tests matériel réels le 2026-09-11). mapping : liste
        de dicts {paint_index, ams_index, paint_color: [r,g,b], ams_color: [r,g,b],
        material_type}, produite par _build_acm_mapping (agent/main.py)."""
        acm_filename = os.path.splitext(filename)[0] + ".acm"
        content = json.dumps({"use_ams": True, "ams_box_mapping": mapping}).encode("utf-8")
        url = f"{self.base_url}/server/files/upload"
        try:
            files = {"file": (acm_filename, content, "application/json")}
            data = {"root": "gcodes", "print": "false"}
            response = requests.post(url, files=files, data=data, timeout=self.timeout)
        except requests.RequestException as exc:
            raise MoonrakerClientError(f"Échec de l'upload de {acm_filename} vers Moonraker: {exc}") from exc

        if response.status_code >= 400:
            raise MoonrakerClientError(
                f"Moonraker a refusé l'upload de {acm_filename} (HTTP {response.status_code}): {response.text}"
            )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd printer-agent && pytest tests/test_moonraker_client.py -v`
Expected: PASS pour tous les tests, y compris les nouveaux `test_upload_acm_*`.

- [ ] **Step 5: Commit**

```bash
cd printer-agent && git add agent/moonraker_client.py tests/test_moonraker_client.py
git commit -m "$(cat <<'EOF'
feat(print-agent): add MoonrakerClient.upload_acm

Uploads the ams_box_mapping sidecar that gklib actually reads for
tool->gate resolution, overwriting the slicer-generated one — see spec
2026-09-11.
EOF
)"
```

---

## Task 3: `MoonrakerClient.start_print` + suppression de `set_ttg_map`

**Files:**
- Modify: `printer-agent/agent/moonraker_client.py:99-183` (retirer `set_ttg_map`, ajouter `start_print`)
- Test: `printer-agent/tests/test_moonraker_client.py` (retirer les tests `test_set_ttg_map_*`, ajouter les tests `test_start_print_*`)

**Interfaces:**
- Produces: `MoonrakerClient.start_print(filename: str) -> None` — lève `MoonrakerClientError` avec le message réel de `gklib` en cas d'échec (extrait de `error.message` dans le corps de réponse HTTP ≥ 400, avec repli sur `_get_recent_gcode_error` si absent).
- Removes: `MoonrakerClient.set_ttg_map` (dead code — confirmé par test matériel réel le 2026-09-11 que ce mécanisme n'atteint jamais `gklib` sur le chemin de dispatch de l'agent).

- [ ] **Step 1: Retirer les tests de `set_ttg_map` et écrire ceux de `start_print`**

Dans `printer-agent/tests/test_moonraker_client.py`, supprimer les trois tests `test_set_ttg_map_sends_mmu_ttg_map_script`, `test_set_ttg_map_raises_on_network_error`, `test_set_ttg_map_raises_on_http_error` (fin du fichier) ainsi que l'import `urllib.parse` en tête de fichier (devenu inutile, seul `test_set_ttg_map_sends_mmu_ttg_map_script` l'utilisait).

Remplacer ces trois tests par :

```python
def test_start_print_success():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/printer/print/start", json={"result": "ok"})
        client.start_print("multi.gcode")
    assert m.last_request.json() == {"filename": "multi.gcode"}


def test_start_print_raises_with_direct_error_message_from_response_body():
    # Confirmé en direct sur l'imprimante le 2026-09-11 : contrairement à l'ancien
    # /server/files/upload?print=true (qui avalait l'exception réelle côté serveur),
    # /printer/print/start expose le message gklib directement dans error.message du corps
    # de réponse HTTP 400 — pas besoin de l'enrichissement gcode_store dans ce cas.
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(
            f"{BASE_URL}/printer/print/start",
            status_code=400,
            json={"error": {"code": 400, "message": "unknown filament in extruder"}},
        )
        with pytest.raises(MoonrakerClientError, match="unknown filament in extruder"):
            client.start_print("multi.gcode")


def test_start_print_falls_back_to_gcode_store_when_response_has_no_error_message():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/printer/print/start", status_code=400, json={"unexpected": "shape"})
        now = time.time()
        m.get(
            f"{BASE_URL}/server/gcode_store",
            json={
                "result": {
                    "gcode_store": [
                        {
                            "message": "error: typ = WebRequestError, code = 10011703, "
                            "message = unknown filament in extruder",
                            "time": now,
                            "type": "response",
                        },
                    ]
                }
            },
        )
        with pytest.raises(MoonrakerClientError, match="unknown filament in extruder"):
            client.start_print("multi.gcode")


def test_start_print_raises_generic_message_when_no_enrichment_available():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/printer/print/start", status_code=400, text="")
        with pytest.raises(MoonrakerClientError):
            client.start_print("multi.gcode")


def test_start_print_raises_on_network_error():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/printer/print/start", exc=requests.exceptions.ConnectTimeout)
        with pytest.raises(MoonrakerClientError):
            client.start_print("multi.gcode")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd printer-agent && pytest tests/test_moonraker_client.py -k start_print -v`
Expected: FAIL avec `AttributeError: 'MoonrakerClient' object has no attribute 'start_print'`

- [ ] **Step 3: Retirer `set_ttg_map`, ajouter `start_print`**

Dans `printer-agent/agent/moonraker_client.py`, supprimer entièrement la méthode `set_ttg_map` (les lignes commençant par `def set_ttg_map(self, mapping):` jusqu'à la fin du fichier).

Ajouter, juste après la méthode `get_mmu_status` (qui devient la dernière méthode du fichier après cette suppression) :

```python
    def start_print(self, filename):
        """Démarre l'impression d'un fichier déjà uploadé (POST /printer/print/start). En cas
        d'échec, le corps de réponse contient directement le message réel de gklib dans
        error.message (confirmé en direct sur l'imprimante le 2026-09-11, ex: "unknown
        filament in extruder") — utilisé en priorité ; repli sur l'enrichissement gcode_store
        (_get_recent_gcode_error) si absent ou de forme inattendue."""
        url = f"{self.base_url}/printer/print/start"
        try:
            response = requests.post(url, json={"filename": filename}, timeout=self.timeout)
        except requests.RequestException as exc:
            raise MoonrakerClientError(f"Moonraker injoignable (print/start): {exc}") from exc

        if response.status_code < 400:
            return

        detail = self._extract_error_message(response) or self._get_recent_gcode_error()
        message = f"Moonraker a refusé le démarrage de l'impression (HTTP {response.status_code})"
        if detail:
            message += f" — {detail}"
        raise MoonrakerClientError(message)

    @staticmethod
    def _extract_error_message(response):
        try:
            return response.json()["error"]["message"]
        except (ValueError, KeyError, TypeError):
            return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd printer-agent && pytest tests/test_moonraker_client.py -v`
Expected: PASS pour tous les tests du fichier.

- [ ] **Step 5: Commit**

```bash
cd printer-agent && git add agent/moonraker_client.py tests/test_moonraker_client.py
git commit -m "$(cat <<'EOF'
feat(print-agent): add MoonrakerClient.start_print, remove set_ttg_map

MMU_TTG_MAP confirmed dead code by real hardware tests on 2026-09-11:
it never reaches gklib on the dispatch path this agent uses. start_print
also surfaces gklib's real error.message directly from the HTTP response
now, falling back to the existing gcode_store enrichment when absent.
EOF
)"
```

---

## Task 4: `main.py` — `_resolve_gate_assignments` (nouveau format) + `_hex_to_rgb` + `_build_acm_mapping`

**Files:**
- Modify: `printer-agent/agent/main.py:84-116` (`_resolve_gate_assignments`) et ajout de deux fonctions
- Test: `printer-agent/tests/test_run_tick.py` (les tests touchant `_resolve_gate_assignments` sont testés via `run_tick` — adaptés en Task 5, car ils dépendent aussi de `_try_dispatch`)

**Interfaces:**
- Produces:
  - `_resolve_gate_assignments(gate_assignments: list) -> tuple[int | None, list[tuple[int, int]] | None]` — `(single_gate, tool_gate_pairs)`. Remplace l'ancien retour `(single_gate, ttg_map: list[int])`.
  - `_hex_to_rgb(color_hex: str) -> list[int]` — convertit `"RRGGBBAA"` en `[r, g, b]`, lève `ValueError` si invalide.
  - `_build_acm_mapping(tool_gate_pairs: list[tuple[int, int]], gates: list[dict]) -> list[dict]` — `gates` au format retourné par `MoonrakerClient.get_mmu_status()` (`{"gate", "material", "color", "empty"}`). Lève `ValueError` si un gate assigné n'existe pas dans `gates`.

Cette tâche modifie une fonction dont Task 5 dépend (`_try_dispatch` appelle ces trois fonctions) — elle est volontairement autonome et testable isolément avant que Task 5 ne la câble dans le flux de dispatch.

- [ ] **Step 1: Écrire les tests qui échouent (tests directs, indépendants de `run_tick`)**

Ajouter en tête de `printer-agent/tests/test_run_tick.py`, juste après les imports existants (après la ligne `from agent.main import MAX_JOB_AGE_SECONDS, run_tick`) :

```python
from agent.main import _build_acm_mapping, _hex_to_rgb, _resolve_gate_assignments
```

Puis ajouter, juste avant la section `# --- Heartbeat`  :

```python
# --- _resolve_gate_assignments / _hex_to_rgb / _build_acm_mapping (unitaires) ---

def test_resolve_gate_assignments_returns_none_none_when_empty():
    assert _resolve_gate_assignments([]) == (None, None)


def test_resolve_gate_assignments_returns_none_none_when_absent():
    assert _resolve_gate_assignments(None) == (None, None)


def test_resolve_gate_assignments_returns_single_gate_for_mono_tool():
    assert _resolve_gate_assignments([{"tool": None, "gate": 2}]) == (2, None)


def test_resolve_gate_assignments_returns_tool_gate_pairs_for_multi_tool():
    result = _resolve_gate_assignments([{"tool": "T0", "gate": 3}, {"tool": "T2", "gate": 1}])
    assert result == (None, [(0, 3), (2, 1)])


def test_resolve_gate_assignments_raises_when_mono_has_multiple_entries():
    with pytest.raises(ValueError):
        _resolve_gate_assignments([{"tool": None, "gate": 1}, {"tool": None, "gate": 2}])


def test_hex_to_rgb_converts_ignoring_alpha():
    assert _hex_to_rgb("F40031FF") == [244, 0, 49]


def test_hex_to_rgb_raises_on_invalid_input():
    with pytest.raises(ValueError):
        _hex_to_rgb("not-a-color")


def test_build_acm_mapping_translates_gate_color_and_material():
    gates = [
        {"gate": 0, "material": "PLA", "color": "212721FF", "empty": False},
        {"gate": 1, "material": "PETG", "color": "F40031FF", "empty": False},
        {"gate": 3, "material": "PLA", "color": "FF6A14FF", "empty": False},
    ]
    mapping = _build_acm_mapping([(0, 3), (2, 1)], gates)
    assert mapping == [
        {"paint_index": 0, "ams_index": 3, "paint_color": [255, 106, 20], "ams_color": [255, 106, 20], "material_type": "PLA"},
        {"paint_index": 2, "ams_index": 1, "paint_color": [244, 0, 49], "ams_color": [244, 0, 49], "material_type": "PETG"},
    ]


def test_build_acm_mapping_raises_when_assigned_gate_missing_from_moonraker_status():
    gates = [{"gate": 0, "material": "PLA", "color": "212721FF", "empty": False}]
    with pytest.raises(ValueError):
        _build_acm_mapping([(0, 3)], gates)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd printer-agent && pytest tests/test_run_tick.py -k "resolve_gate_assignments or hex_to_rgb or build_acm_mapping" -v`
Expected: FAIL — `_resolve_gate_assignments` renvoie encore l'ancien format `(single_gate, ttg_map)` ; `_hex_to_rgb`/`_build_acm_mapping` n'existent pas (`ImportError`).

- [ ] **Step 3: Remplacer `_resolve_gate_assignments` et ajouter les deux nouvelles fonctions**

Dans `printer-agent/agent/main.py`, remplacer les lignes 84 à 116 (la fonction `_resolve_gate_assignments` complète, de `def _resolve_gate_assignments` jusqu'au `return None, ttg_map` qui la termine) par :

```python
def _resolve_gate_assignments(gate_assignments):
    """Traduit gateAssignments (reçu du hub) en soit un gate unique à injecter en tête de
    fichier (Tn, cas mono-matériau : une seule entrée à tool=null), soit une liste de paires
    (tool_index, gate) pour construire le sidecar .acm que gklib lit réellement (cas
    multi-couleur : au moins une entrée à tool non-null) — voir spec 2026-09-11 (MMU_TTG_MAP
    remplacé, confirmé sans effet réel sur gklib par des tests matériel réels). Retourne
    (single_gate, tool_gate_pairs).

    Une liste vide/absente (overrideNoSpoolData, ou un vieux hub qui n'envoie pas encore ce
    champ) retourne (None, None) : ni Tn injecté ni .acm écrit, le fichier garde le mapping du
    slicer tel quel. Contrairement à l'ancien mécanisme ttg_map (état persistant côté firmware,
    jamais reset automatiquement par l'imprimante), aucune réinitialisation n'est nécessaire
    ici : le .acm est propre à chaque fichier, jamais réutilisé d'un job à l'autre."""
    if not gate_assignments:
        return None, None

    has_null_tool = any(a.get("tool") is None for a in gate_assignments)
    if has_null_tool:
        if len(gate_assignments) != 1:
            raise ValueError(f"gateAssignments avec tool=null doit contenir une seule entrée: {gate_assignments!r}")
        gate = _validate_gate(gate_assignments[0].get("gate"))
        return gate, None

    tool_gate_pairs = []
    for assignment in gate_assignments:
        tool_index = _validate_tool_index(assignment.get("tool"))
        gate = _validate_gate(assignment.get("gate"))
        tool_gate_pairs.append((tool_index, gate))
    return None, tool_gate_pairs


def _hex_to_rgb(color_hex):
    """Convertit une couleur au format Moonraker/ACE (RRGGBBAA, sans '#') en triplet [r, g, b]
    — le format attendu par gklib dans le sidecar .acm (paint_color/ams_color). L'alpha (2
    derniers caractères) est ignoré, toujours 'FF' en pratique côté ACE."""
    try:
        return [int(color_hex[i:i + 2], 16) for i in (0, 2, 4)]
    except (TypeError, ValueError, IndexError):
        raise ValueError(f"couleur de gate invalide: {color_hex!r}")


def _build_acm_mapping(tool_gate_pairs, gates):
    """Construit la liste ams_box_mapping (voir spec 2026-09-11) à partir des paires
    (tool_index, gate) résolues par _resolve_gate_assignments et de l'état courant des gates
    (moonraker.get_mmu_status()). Ne fait jamais confiance à un gate assigné par le hub avant de
    vérifier qu'il existe bien dans l'état Moonraker courant — même posture que _validate_gate."""
    gates_by_index = {g["gate"]: g for g in gates}
    mapping = []
    for tool_index, gate in tool_gate_pairs:
        gate_info = gates_by_index.get(gate)
        if gate_info is None:
            raise ValueError(f"gate {gate} absent de l'état Moonraker (gates connus: {sorted(gates_by_index)})")
        rgb = _hex_to_rgb(gate_info["color"])
        mapping.append(
            {
                "paint_index": tool_index,
                "ams_index": gate,
                "paint_color": rgb,
                "ams_color": rgb,
                "material_type": gate_info["material"],
            }
        )
    return mapping
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd printer-agent && pytest tests/test_run_tick.py -k "resolve_gate_assignments or hex_to_rgb or build_acm_mapping" -v`
Expected: PASS pour les nouveaux tests unitaires. Les tests de dispatch existants (`test_dispatch_*`) vont maintenant échouer — c'est attendu, ils sont corrigés en Task 5, qui câble `_try_dispatch` sur ce nouveau format.

- [ ] **Step 5: Commit**

```bash
cd printer-agent && git add agent/main.py tests/test_run_tick.py
git commit -m "$(cat <<'EOF'
feat(print-agent): resolve gate assignments into tool/gate pairs for .acm

_resolve_gate_assignments now returns (single_gate, tool_gate_pairs)
instead of a ttg_map array, plus _hex_to_rgb/_build_acm_mapping to turn
those pairs into the ams_box_mapping gklib's .acm sidecar expects.
Existing dispatch tests are updated in the next commit, which wires this
into _try_dispatch.
EOF
)"
```

---

## Task 5: `main.py` — câbler `_try_dispatch` sur `upload_file`/`upload_acm`/`start_print`

**Files:**
- Modify: `printer-agent/agent/main.py:131-208` (`_try_dispatch`)
- Test: `printer-agent/tests/test_run_tick.py` (bloc de tests de dispatch, lignes ~152-449 selon état après Task 4)

**Interfaces:**
- Consumes: `_resolve_gate_assignments`, `_hex_to_rgb`, `_build_acm_mapping` (Task 4) ; `MoonrakerClient.upload_file`/`upload_acm`/`start_print`/`get_mmu_status` (Tasks 1-3, `get_mmu_status` déjà existant).
- Produces: `_try_dispatch(hub, moonraker, state, download_dir, logger) -> dict` — signature inchangée, comportement interne mis à jour.

- [ ] **Step 1: Mettre à jour les tests de dispatch existants**

Dans `printer-agent/tests/test_run_tick.py`, remplacer les tests suivants (identifiés par leur nom actuel) :

**a) `test_successful_dispatch_reports_printing_and_saves_job_id`** — remplacer la ligne `moonraker.upload_and_start_print.assert_called_once()` par ces deux lignes :
```python
    moonraker.upload_file.assert_called_once()
    moonraker.start_print.assert_called_once_with("a.gcode")
```

**b) `test_no_job_available_returns_state_unchanged`** — remplacer `moonraker.upload_and_start_print.assert_not_called()` par :
```python
    moonraker.start_print.assert_not_called()
```

**c) Remplacer entièrement les quatre tests `test_dispatch_injects_gate_selection_for_a_mono_gate_assignment`, `test_dispatch_resets_ttg_map_but_injects_nothing_when_gate_assignments_absent`, `test_dispatch_resets_ttg_map_but_injects_nothing_when_gate_assignments_empty`, `test_dispatch_calls_set_ttg_map_before_download_and_upload_for_multi_tool_assignment`** (lignes ~199-337 avant cette tâche) par :

```python
def test_dispatch_injects_gate_selection_for_a_mono_gate_assignment(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {
        "jobId": "job-1",
        "fileName": "a.gcode",
        "downloadUrl": "/x",
        "gateAssignments": [{"tool": None, "gate": 2}],
    }

    def fake_download(job_id, dest_path):
        with open(dest_path, "w") as f:
            f.write("G28\nG1 X10\n")

    hub.download_job_file.side_effect = fake_download
    moonraker = make_moonraker()

    captured = {}

    def fake_upload(file_path, filename):
        with open(file_path, "r") as f:
            captured["content"] = f.read()

    moonraker.upload_file.side_effect = fake_upload

    run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    assert captured["content"] == "T2\nG28\nG1 X10\n"
    # Cas mono : aucun .acm à écrire, le mécanisme Tn suffit (inchangé, voir spec 2026-09-11).
    moonraker.upload_acm.assert_not_called()
    moonraker.start_print.assert_called_once_with("a.gcode")


def test_dispatch_uploads_gcode_and_starts_print_without_acm_when_gate_assignments_absent(tmp_path, logger):
    # Un vieux hub qui n'envoie pas encore ce champ : le fichier garde le mapping du slicer tel
    # quel, aucun .acm écrit (voir spec 2026-09-11 — contrairement à l'ancien ttg_map, il n'y a
    # plus d'état firmware persistant à réinitialiser dans ce cas).
    hub = make_hub()
    hub.get_next_job.return_value = {"jobId": "job-1", "fileName": "a.gcode", "downloadUrl": "/x"}

    def fake_download(job_id, dest_path):
        with open(dest_path, "w") as f:
            f.write("G28\nG1 X10\n")

    hub.download_job_file.side_effect = fake_download
    moonraker = make_moonraker()

    captured = {}

    def fake_upload(file_path, filename):
        with open(file_path, "r") as f:
            captured["content"] = f.read()

    moonraker.upload_file.side_effect = fake_upload

    run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    assert captured["content"] == "G28\nG1 X10\n"
    moonraker.upload_acm.assert_not_called()
    moonraker.start_print.assert_called_once_with("a.gcode")


def test_dispatch_uploads_gcode_and_starts_print_without_acm_when_gate_assignments_empty(tmp_path, logger):
    # Cas overrideNoSpoolData : mêmes conséquences qu'un hub sans le champ.
    hub = make_hub()
    hub.get_next_job.return_value = {
        "jobId": "job-1",
        "fileName": "a.gcode",
        "downloadUrl": "/x",
        "gateAssignments": [],
    }

    def fake_download(job_id, dest_path):
        with open(dest_path, "w") as f:
            f.write("G28\n")

    hub.download_job_file.side_effect = fake_download
    moonraker = make_moonraker()

    captured = {}

    def fake_upload(file_path, filename):
        with open(file_path, "r") as f:
            captured["content"] = f.read()

    moonraker.upload_file.side_effect = fake_upload

    run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    assert captured["content"] == "G28\n"
    moonraker.upload_acm.assert_not_called()
    moonraker.start_print.assert_called_once_with("a.gcode")


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
    moonraker.start_print.side_effect = fake_start_print

    run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    assert call_order[0] == "download"
    assert call_order[1] == "upload_file"
    assert call_order[2] == "upload_acm"
    mapping = call_order[3]
    assert mapping == [
        {"paint_index": 0, "ams_index": 3, "paint_color": [244, 0, 49], "ams_color": [244, 0, 49], "material_type": "PLA"},
        {"paint_index": 2, "ams_index": 1, "paint_color": [33, 39, 33], "ams_color": [33, 39, 33], "material_type": "PETG"},
    ]
    assert call_order[4] == "start_print"


def test_dispatch_fails_job_and_never_starts_print_when_assigned_gate_missing_from_moonraker_status(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {
        "jobId": "job-1",
        "fileName": "a.gcode",
        "downloadUrl": "/x",
        "gateAssignments": [{"tool": "T0", "gate": 3}],
    }
    moonraker = make_moonraker()
    moonraker.get_mmu_status.return_value = [{"gate": 0, "material": "PLA", "color": "212721FF", "empty": False}]

    run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    hub.download_job_file.assert_not_called()
    moonraker.start_print.assert_not_called()
    hub.update_job_status.assert_called_once()
    args, kwargs = hub.update_job_status.call_args
    assert args[1] == "failed"


def test_dispatch_fails_job_and_never_starts_print_when_acm_upload_fails(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {
        "jobId": "job-1",
        "fileName": "a.gcode",
        "downloadUrl": "/x",
        "gateAssignments": [{"tool": "T0", "gate": 1}],
    }

    def fake_download(job_id, dest_path):
        with open(dest_path, "w") as f:
            f.write("G28\n")

    hub.download_job_file.side_effect = fake_download
    moonraker = make_moonraker()
    moonraker.get_mmu_status.return_value = [{"gate": 1, "material": "PLA", "color": "212721FF", "empty": False}]
    moonraker.upload_acm.side_effect = MoonrakerClientError("upload .acm refusé")

    run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    moonraker.start_print.assert_not_called()
    hub.update_job_status.assert_called_once_with("job-1", "failed", error_message="upload .acm refusé")
```

**d) `test_dispatch_fails_job_when_tool_is_invalid_in_a_multi_tool_assignment`** — remplacer la ligne `moonraker.set_ttg_map.assert_not_called()` par :
```python
    moonraker.upload_file.assert_not_called()
```

**e) `test_dispatch_failure_on_moonraker_upload_reports_failed_immediately`** — renommer en `test_dispatch_failure_on_gcode_upload_reports_failed_immediately` et remplacer `moonraker.upload_and_start_print.side_effect = MoonrakerClientError("upload refusé")` par :
```python
    moonraker.upload_file.side_effect = MoonrakerClientError("upload refusé")
```
(le reste du test, assertions comprises, ne change pas.)

Ajouter juste après ce test :

```python
def test_dispatch_failure_on_start_print_reports_failed(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {"jobId": "job-1", "fileName": "a.gcode", "downloadUrl": "/x"}

    def fake_download(job_id, dest_path):
        with open(dest_path, "w") as f:
            f.write("G28\n")

    hub.download_job_file.side_effect = fake_download
    moonraker = make_moonraker()
    moonraker.start_print.side_effect = MoonrakerClientError("unknown filament in extruder")

    result = run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    hub.update_job_status.assert_called_once_with(
        "job-1", "failed", error_message="unknown filament in extruder"
    )
    assert result == IDLE_STATE
    assert os.listdir(tmp_path) == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd printer-agent && pytest tests/test_run_tick.py -v`
Expected: FAIL sur tous les tests de dispatch — `_try_dispatch` appelle encore `moonraker.set_ttg_map`/`moonraker.upload_and_start_print`, que les mocks `MagicMock()` acceptent silencieusement (aucune erreur Python), mais les nouvelles assertions sur `upload_file`/`upload_acm`/`start_print` échouent (jamais appelés).

- [ ] **Step 3: Câbler `_try_dispatch` sur les nouvelles méthodes**

Dans `printer-agent/agent/main.py`, remplacer les lignes 173-180 (le bloc `dest_path = os.path.join(...)` jusqu'à `moonraker.upload_and_start_print(dest_path, file_name)` inclus, à l'intérieur du `try` de `_try_dispatch`) par :

```python
    dest_path = os.path.join(download_dir, file_name)
    try:
        acm_mapping = None
        if tool_gate_pairs is not None:
            gates = moonraker.get_mmu_status()
            acm_mapping = _build_acm_mapping(tool_gate_pairs, gates)

        hub.download_job_file(job_id, dest_path)
        if single_gate is not None:
            _inject_gate_selection(dest_path, single_gate)
        moonraker.upload_file(dest_path, file_name)
        if acm_mapping is not None:
            moonraker.upload_acm(file_name, acm_mapping)
        moonraker.start_print(file_name)
```

Et remplacer, un peu plus haut dans la même fonction, la ligne :
```python
        single_gate, ttg_map = _resolve_gate_assignments(gate_assignments)
```
par :
```python
        single_gate, tool_gate_pairs = _resolve_gate_assignments(gate_assignments)
```

(Le reste de `_try_dispatch` — gestion des erreurs, `finally`, notification `printing` — reste inchangé.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd printer-agent && pytest tests/ -v`
Expected: PASS pour l'intégralité de la suite (`test_run_tick.py` et `test_moonraker_client.py`).

- [ ] **Step 5: Commit**

```bash
cd printer-agent && git add agent/main.py tests/test_run_tick.py
git commit -m "$(cat <<'EOF'
feat(print-agent): dispatch through upload_file/upload_acm/start_print

Wires _try_dispatch onto the new MoonrakerClient API: gcode upload, then
the .acm sidecar (multi-tool jobs only), then start_print — never starts
a print if the .acm upload failed. Closes out the MMU_TTG_MAP replacement
started in the previous commits (spec 2026-09-11).
EOF
)"
```

---

## Après implémentation (hors plan, rappel de la spec)

Un test supervisé réel sur le Kobra 3 de prod est requis avant tout déploiement — voir spec, section "Tests". Ce plan ne couvre que la couche `printer-agent` unitaire ; le déploiement (copie sur l'imprimante, `app.sh restart`) et la vérification matérielle restent manuels, comme pour les fixes précédents de ce projet.
