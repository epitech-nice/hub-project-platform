# Agent d'impression 3D — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire l'agent Python qui tourne sur chaque imprimante Kobra 3/3 Max (via Rinkhals), déclenché par cron toutes les minutes, pour dispatcher les jobs d'impression depuis le Hub vers Moonraker local et remonter leur statut — plus un petit correctif frontend pour exposer les erreurs aux utilisateurs whitelistés.

**Architecture:** Un script Python (`printer-agent/`) sans démon : chaque tick charge un état local (`state.json`), interroge soit le Hub (aucun job en cours) soit Moonraker local (job en cours de suivi), agit, sauvegarde l'état, et se termine. Un verrou fichier (`flock`) empêche le chevauchement de deux ticks.

**Tech Stack:** Python 3.10+, `requests`, `PyYAML`, `pytest` + `requests-mock` (dev only). Frontend : React/Next.js 12 existant, pas de framework de test (aucun n'existe dans ce repo côté `client/`).

**Spec:** `docs/superpowers/specs/2026-09-03-agent-impression-3d-design.md` (complète `docs/superpowers/specs/2026-09-02-integration-imprimantes-3d-design.md` pour le contexte backend déjà mergé sur `master`).

## Global Constraints

- Cron toutes les 1 minute (pas de démon long-running).
- Seuil de 5 échecs Moonraker consécutifs avant de déclarer un job `failed` pendant le suivi.
- Échec de dispatch (download/upload/start) → `POST status: 'failed'` immédiat, pas de retry.
- Rotation des logs réduite : 2 fichiers de 500 Ko max (contrainte de stockage flash embarqué).
- Nouveau code dans `printer-agent/` à la racine du repo, aucune modification du backend Node existant (`server/`) — l'API `/api/print/agent/*` est utilisée telle quelle.
- Un agent = une imprimante (pas de config multi-imprimantes).
- Moonraker toujours en local : `http://localhost:7125`.

---

## Task 1: Scaffolding du projet + `state.py`

**Files:**
- Create: `printer-agent/agent/__init__.py`
- Create: `printer-agent/agent/state.py`
- Create: `printer-agent/requirements.txt`
- Create: `printer-agent/requirements-dev.txt`
- Create: `printer-agent/config.example.yaml`
- Create: `printer-agent/pytest.ini`
- Test: `printer-agent/tests/test_state.py`
- Modify: `.gitignore` (racine du repo)

**Interfaces:**
- Produces: `load_state(path: str) -> dict` — retourne `{"job_id": str | None, "consecutive_moonraker_failures": int}`
- Produces: `save_state(path: str, state: dict) -> None` — écriture atomique

- [ ] **Step 1: Créer la structure du projet et les fichiers de config**

```bash
mkdir -p printer-agent/agent printer-agent/tests
touch printer-agent/agent/__init__.py printer-agent/tests/__init__.py
```

`printer-agent/requirements.txt` :
```
requests>=2.31,<3
PyYAML>=6.0,<7
```

`printer-agent/requirements-dev.txt` :
```
-r requirements.txt
pytest>=8.0,<9
requests-mock>=1.12,<2
```

`printer-agent/config.example.yaml` :
```yaml
# Copier ce fichier en config.yaml (non commité) et renseigner les valeurs
# réelles avant de déployer sur une imprimante.
hub:
  base_url: https://<hub-domain>/api/print/agent
printer:
  id: "<mongo id de ce Printer, généré côté hub>"
  api_key: "<clé api générée pour cette imprimante>"
moonraker:
  base_url: http://localhost:7125
```

`printer-agent/pytest.ini` :
```ini
[pytest]
testpaths = tests
```

- [ ] **Step 2: Ajouter les fichiers générés au `.gitignore` du repo**

Ajouter à la fin de `.gitignore` (racine du repo) :
```
# Agent imprimante
printer-agent/config.yaml
printer-agent/state.json
printer-agent/agent.lock
printer-agent/*.log
printer-agent/.venv/
```

- [ ] **Step 3: Écrire les tests de `state.py`**

`printer-agent/tests/test_state.py` :
```python
import json
import os

from agent.state import load_state, save_state


def test_load_state_returns_default_when_file_missing(tmp_path):
    path = str(tmp_path / "state.json")
    assert load_state(path) == {"job_id": None, "consecutive_moonraker_failures": 0}


def test_save_then_load_roundtrip(tmp_path):
    path = str(tmp_path / "state.json")
    state = {"job_id": "abc123", "consecutive_moonraker_failures": 2}
    save_state(path, state)
    assert load_state(path) == state


def test_load_state_returns_default_on_corrupted_json(tmp_path):
    path = str(tmp_path / "state.json")
    with open(path, "w") as f:
        f.write("not valid json {{{")
    assert load_state(path) == {"job_id": None, "consecutive_moonraker_failures": 0}


def test_load_state_returns_default_on_missing_keys(tmp_path):
    path = str(tmp_path / "state.json")
    with open(path, "w") as f:
        json.dump({"unexpected": "shape"}, f)
    assert load_state(path) == {"job_id": None, "consecutive_moonraker_failures": 0}


def test_save_state_does_not_leave_tmp_file_behind(tmp_path):
    path = str(tmp_path / "state.json")
    save_state(path, {"job_id": None, "consecutive_moonraker_failures": 0})
    remaining = os.listdir(tmp_path)
    assert remaining == ["state.json"]
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils échouent**

```bash
cd printer-agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest tests/test_state.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'agent.state'` (ou `agent` introuvable si `PYTHONPATH` n'inclut pas `printer-agent/`).

Si `agent` n'est pas trouvé, lancer plutôt `python -m pytest tests/test_state.py -v` depuis `printer-agent/` (le mode `-m` ajoute le répertoire courant à `sys.path`).

- [ ] **Step 5: Implémenter `state.py`**

`printer-agent/agent/state.py` :
```python
import json
import os
import tempfile

DEFAULT_STATE = {"job_id": None, "consecutive_moonraker_failures": 0}
REQUIRED_KEYS = set(DEFAULT_STATE.keys())


def load_state(path):
    if not os.path.exists(path):
        return dict(DEFAULT_STATE)

    try:
        with open(path, "r") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return dict(DEFAULT_STATE)

    if not isinstance(data, dict) or not REQUIRED_KEYS.issubset(data.keys()):
        return dict(DEFAULT_STATE)

    return data


def save_state(path, state):
    directory = os.path.dirname(os.path.abspath(path)) or "."
    fd, tmp_path = tempfile.mkstemp(dir=directory, prefix=".state-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(state, f)
        os.replace(tmp_path, path)
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

```bash
python -m pytest tests/test_state.py -v
```
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add printer-agent .gitignore
git commit -m "feat(print-agent): scaffolding + état local persisté (state.json)"
```

---

## Task 2: `hub_client.py`

**Files:**
- Create: `printer-agent/agent/hub_client.py`
- Test: `printer-agent/tests/test_hub_client.py`

**Interfaces:**
- Consumes: rien (module indépendant)
- Produces: `class HubClientError(Exception)` avec attribut `.status_code` (`int | None`)
- Produces: `class HubClient.__init__(self, base_url: str, printer_id: str, api_key: str, timeout: int = 10)`
- Produces: `HubClient.get_next_job() -> dict | None` — `{"jobId": str, "fileName": str, "downloadUrl": str}` ou `None`
- Produces: `HubClient.download_job_file(job_id: str, dest_path: str) -> None`
- Produces: `HubClient.update_job_status(job_id: str, status: str, error_message: str | None = None) -> None`

- [ ] **Step 1: Écrire les tests**

`printer-agent/tests/test_hub_client.py` :
```python
import pytest
import requests_mock

from agent.hub_client import HubClient, HubClientError

BASE_URL = "https://hub.example.org/api/print/agent"


def make_client():
    return HubClient(BASE_URL, printer_id="printer-1", api_key="secret-key")


def test_get_next_job_returns_job_data():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(
            f"{BASE_URL}/next-job",
            json={"success": True, "data": {"jobId": "job-1", "fileName": "a.gcode", "downloadUrl": "/x"}},
        )
        job = client.get_next_job()
    assert job == {"jobId": "job-1", "fileName": "a.gcode", "downloadUrl": "/x"}
    assert m.last_request.headers["x-printer-id"] == "printer-1"
    assert m.last_request.headers["x-api-key"] == "secret-key"


def test_get_next_job_returns_none_when_no_job():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/next-job", json={"success": True, "data": None})
        assert client.get_next_job() is None


def test_get_next_job_raises_on_401():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/next-job", status_code=401, json={"success": False, "error": "Clé API invalide"})
        with pytest.raises(HubClientError) as exc_info:
            client.get_next_job()
    assert exc_info.value.status_code == 401
    assert "invalide" in str(exc_info.value)


def test_get_next_job_raises_on_network_error():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/next-job", exc=requests_mock.exceptions.ConnectTimeout)
        with pytest.raises(HubClientError):
            client.get_next_job()


def test_download_job_file_writes_content(tmp_path):
    client = make_client()
    dest = str(tmp_path / "job.gcode")
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/jobs/job-1/file", content=b"G28\nG1 X10\n")
        client.download_job_file("job-1", dest)
    with open(dest, "rb") as f:
        assert f.read() == b"G28\nG1 X10\n"


def test_update_job_status_sends_status_only():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/jobs/job-1/status", json={"success": True})
        client.update_job_status("job-1", "printing")
    assert m.last_request.json() == {"status": "printing"}


def test_update_job_status_includes_error_message():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/jobs/job-1/status", json={"success": True})
        client.update_job_status("job-1", "failed", error_message="capteur filament")
    assert m.last_request.json() == {"status": "failed", "errorMessage": "capteur filament"}


def test_update_job_status_raises_with_status_code_on_409():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(
            f"{BASE_URL}/jobs/job-1/status",
            status_code=409,
            json={"success": False, "error": "Ce job est déjà dans un état terminal"},
        )
        with pytest.raises(HubClientError) as exc_info:
            client.update_job_status("job-1", "completed")
    assert exc_info.value.status_code == 409
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
python -m pytest tests/test_hub_client.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'agent.hub_client'`

- [ ] **Step 3: Implémenter `hub_client.py`**

`printer-agent/agent/hub_client.py` :
```python
import requests


class HubClientError(Exception):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


class HubClient:
    def __init__(self, base_url, printer_id, api_key, timeout=10):
        self.base_url = base_url.rstrip("/")
        self.headers = {"x-printer-id": printer_id, "x-api-key": api_key}
        self.timeout = timeout

    def _request(self, method, path, **kwargs):
        url = f"{self.base_url}{path}"
        try:
            response = requests.request(method, url, headers=self.headers, timeout=self.timeout, **kwargs)
        except requests.RequestException as exc:
            raise HubClientError(f"Erreur réseau vers le hub ({method} {path}): {exc}") from exc

        if response.status_code >= 400:
            try:
                message = response.json().get("error", response.text)
            except ValueError:
                message = response.text
            raise HubClientError(message, status_code=response.status_code)

        return response

    def get_next_job(self):
        response = self._request("GET", "/next-job")
        return response.json().get("data")

    def download_job_file(self, job_id, dest_path):
        response = self._request("GET", f"/jobs/{job_id}/file", stream=True)
        with open(dest_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

    def update_job_status(self, job_id, status, error_message=None):
        payload = {"status": status}
        if error_message is not None:
            payload["errorMessage"] = error_message
        self._request("POST", f"/jobs/{job_id}/status", json=payload)
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

```bash
python -m pytest tests/test_hub_client.py -v
```
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add printer-agent/agent/hub_client.py printer-agent/tests/test_hub_client.py
git commit -m "feat(print-agent): client HTTP pour l'API agent du hub"
```

---

## Task 3: `moonraker_client.py`

**Files:**
- Create: `printer-agent/agent/moonraker_client.py`
- Test: `printer-agent/tests/test_moonraker_client.py`

**Interfaces:**
- Consumes: rien (module indépendant)
- Produces: `class MoonrakerClientError(Exception)`
- Produces: `class MoonrakerClient.__init__(self, base_url: str, timeout: int = 10)`
- Produces: `MoonrakerClient.upload_and_start_print(file_path: str, filename: str) -> None`
- Produces: `MoonrakerClient.get_print_stats() -> dict` — `{"state": str, "message": str}`

- [ ] **Step 1: Écrire les tests**

`printer-agent/tests/test_moonraker_client.py` :
```python
import pytest
import requests_mock

from agent.moonraker_client import MoonrakerClient, MoonrakerClientError

BASE_URL = "http://localhost:7125"


def make_client():
    return MoonrakerClient(BASE_URL)


def test_upload_and_start_print_success(tmp_path):
    client = make_client()
    gcode_path = tmp_path / "print.gcode"
    gcode_path.write_text("G28\n")

    with requests_mock.Mocker() as m:
        m.post(
            f"{BASE_URL}/server/files/upload",
            json={"result": {"item": {"path": "print.gcode", "root": "gcodes"}, "print_started": True}},
        )
        client.upload_and_start_print(str(gcode_path), "print.gcode")

    sent_body = m.last_request.text
    assert "print.gcode" in sent_body


def test_upload_and_start_print_raises_on_http_error(tmp_path):
    client = make_client()
    gcode_path = tmp_path / "print.gcode"
    gcode_path.write_text("G28\n")

    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/server/files/upload", status_code=500, text="internal error")
        with pytest.raises(MoonrakerClientError):
            client.upload_and_start_print(str(gcode_path), "print.gcode")


def test_upload_and_start_print_raises_on_network_error(tmp_path):
    client = make_client()
    gcode_path = tmp_path / "print.gcode"
    gcode_path.write_text("G28\n")

    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/server/files/upload", exc=requests_mock.exceptions.ConnectTimeout)
        with pytest.raises(MoonrakerClientError):
            client.upload_and_start_print(str(gcode_path), "print.gcode")


def test_get_print_stats_parses_printing_state():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(
            f"{BASE_URL}/printer/objects/query",
            json={"result": {"status": {"print_stats": {"state": "printing", "message": ""}}}},
        )
        stats = client.get_print_stats()
    assert stats == {"state": "printing", "message": ""}


def test_get_print_stats_parses_error_state_with_message():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(
            f"{BASE_URL}/printer/objects/query",
            json={"result": {"status": {"print_stats": {"state": "error", "message": "thermal runaway"}}}},
        )
        stats = client.get_print_stats()
    assert stats == {"state": "error", "message": "thermal runaway"}


def test_get_print_stats_raises_on_network_error():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/printer/objects/query", exc=requests_mock.exceptions.ConnectTimeout)
        with pytest.raises(MoonrakerClientError):
            client.get_print_stats()


def test_get_print_stats_raises_on_unexpected_shape():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/printer/objects/query", json={"unexpected": "shape"})
        with pytest.raises(MoonrakerClientError):
            client.get_print_stats()
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
python -m pytest tests/test_moonraker_client.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'agent.moonraker_client'`

- [ ] **Step 3: Implémenter `moonraker_client.py`**

`printer-agent/agent/moonraker_client.py` :
```python
import requests


class MoonrakerClientError(Exception):
    pass


class MoonrakerClient:
    def __init__(self, base_url, timeout=10):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def upload_and_start_print(self, file_path, filename):
        url = f"{self.base_url}/server/files/upload"
        try:
            with open(file_path, "rb") as f:
                files = {"file": (filename, f, "text/plain")}
                # root=gcodes : dossier standard Moonraker pour les fichiers imprimables.
                # print=true : démarre l'impression immédiatement après l'upload, en un seul
                # appel plutôt que upload + POST /printer/print/start séparé.
                data = {"root": "gcodes", "print": "true"}
                response = requests.post(url, files=files, data=data, timeout=self.timeout)
        except (requests.RequestException, OSError) as exc:
            raise MoonrakerClientError(f"Échec de l'upload vers Moonraker: {exc}") from exc

        if response.status_code >= 400:
            raise MoonrakerClientError(
                f"Moonraker a refusé l'upload (HTTP {response.status_code}): {response.text}"
            )

    def get_print_stats(self):
        url = f"{self.base_url}/printer/objects/query"
        try:
            response = requests.get(url, params={"print_stats": ""}, timeout=self.timeout)
        except requests.RequestException as exc:
            raise MoonrakerClientError(f"Moonraker injoignable: {exc}") from exc

        if response.status_code >= 400:
            raise MoonrakerClientError(f"Erreur Moonraker (HTTP {response.status_code}): {response.text}")

        try:
            print_stats = response.json()["result"]["status"]["print_stats"]
        except (KeyError, ValueError, TypeError) as exc:
            raise MoonrakerClientError(f"Réponse Moonraker inattendue: {exc}") from exc

        return {"state": print_stats.get("state"), "message": print_stats.get("message", "")}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

```bash
python -m pytest tests/test_moonraker_client.py -v
```
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add printer-agent/agent/moonraker_client.py printer-agent/tests/test_moonraker_client.py
git commit -m "feat(print-agent): client HTTP pour l'API Moonraker locale"
```

---

## Task 4: `main.py` — orchestration d'un tick (`run_tick`)

**Files:**
- Create: `printer-agent/agent/main.py` (contenu de ce task : uniquement `run_tick` et ses fonctions internes — l'entrée CLI est le Task 5)
- Test: `printer-agent/tests/test_run_tick.py`

**Interfaces:**
- Consumes: `HubClient`, `HubClientError` de `agent.hub_client` (Task 2) ; `MoonrakerClient`, `MoonrakerClientError` de `agent.moonraker_client` (Task 3) ; `load_state`, `save_state`, `DEFAULT_STATE` de `agent.state` (Task 1)
- Produces: `MOONRAKER_FAILURE_THRESHOLD = 5` (constante module-level)
- Produces: `run_tick(hub, moonraker, state: dict, download_dir: str, logger: logging.Logger) -> dict` — reçoit des instances de `HubClient`/`MoonrakerClient` (réelles ou mocks) et l'état courant, retourne le nouvel état à persister. Ne fait aucune I/O sur `state.json` lui-même (délégué au Task 5).

- [ ] **Step 1: Écrire les tests**

`printer-agent/tests/test_run_tick.py` :
```python
import logging
import os
from unittest.mock import MagicMock

import pytest

from agent.hub_client import HubClientError
from agent.moonraker_client import MoonrakerClientError
from agent.main import run_tick

IDLE_STATE = {"job_id": None, "consecutive_moonraker_failures": 0}


@pytest.fixture
def logger():
    log = logging.getLogger("test")
    log.addHandler(logging.NullHandler())
    return log


def make_hub():
    return MagicMock()


def make_moonraker():
    return MagicMock()


# --- Branche dispatch (state.job_id is None) ---

def test_no_job_available_returns_state_unchanged(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = None
    moonraker = make_moonraker()

    result = run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    assert result == IDLE_STATE
    moonraker.upload_and_start_print.assert_not_called()


def test_hub_unreachable_during_next_job_returns_state_unchanged(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.side_effect = HubClientError("timeout")
    moonraker = make_moonraker()

    result = run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    assert result == IDLE_STATE


def test_successful_dispatch_reports_printing_and_saves_job_id(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {"jobId": "job-1", "fileName": "a.gcode", "downloadUrl": "/x"}

    def fake_download(job_id, dest_path):
        with open(dest_path, "w") as f:
            f.write("G28\n")

    hub.download_job_file.side_effect = fake_download
    moonraker = make_moonraker()

    result = run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    moonraker.upload_and_start_print.assert_called_once()
    hub.update_job_status.assert_called_once_with("job-1", "printing")
    assert result == {"job_id": "job-1", "consecutive_moonraker_failures": 0}
    # le fichier téléchargé temporairement est nettoyé après dispatch
    assert os.listdir(tmp_path) == []


def test_dispatch_failure_on_moonraker_upload_reports_failed_immediately(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {"jobId": "job-1", "fileName": "a.gcode", "downloadUrl": "/x"}

    def fake_download(job_id, dest_path):
        with open(dest_path, "w") as f:
            f.write("G28\n")

    hub.download_job_file.side_effect = fake_download
    moonraker = make_moonraker()
    moonraker.upload_and_start_print.side_effect = MoonrakerClientError("upload refusé")

    result = run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    hub.update_job_status.assert_called_once_with("job-1", "failed", error_message="upload refusé")
    assert result == IDLE_STATE
    assert os.listdir(tmp_path) == []


def test_dispatch_failure_when_reporting_failed_also_fails_is_logged_not_raised(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {"jobId": "job-1", "fileName": "a.gcode", "downloadUrl": "/x"}

    def fake_download(job_id, dest_path):
        with open(dest_path, "w") as f:
            f.write("G28\n")

    hub.download_job_file.side_effect = fake_download
    moonraker = make_moonraker()
    moonraker.upload_and_start_print.side_effect = MoonrakerClientError("upload refusé")
    hub.update_job_status.side_effect = HubClientError("hub down")

    result = run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    assert result == IDLE_STATE  # ne casse pas, ne perd pas l'état


# --- Branche suivi (state.job_id is not None) ---

IN_PROGRESS_STATE = {"job_id": "job-1", "consecutive_moonraker_failures": 0}


def test_monitor_still_printing_returns_state_with_failures_reset(tmp_path, logger):
    hub = make_hub()
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "printing", "message": ""}

    result = run_tick(hub, moonraker, {"job_id": "job-1", "consecutive_moonraker_failures": 2}, str(tmp_path), logger)

    assert result == {"job_id": "job-1", "consecutive_moonraker_failures": 0}
    hub.update_job_status.assert_not_called()


def test_monitor_complete_reports_completed_and_clears_job(tmp_path, logger):
    hub = make_hub()
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "complete", "message": ""}

    result = run_tick(hub, moonraker, IN_PROGRESS_STATE, str(tmp_path), logger)

    hub.update_job_status.assert_called_once_with("job-1", "completed", error_message=None)
    assert result == {"job_id": None, "consecutive_moonraker_failures": 0}


def test_monitor_error_reports_failed_with_moonraker_message(tmp_path, logger):
    hub = make_hub()
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "error", "message": "thermal runaway"}

    result = run_tick(hub, moonraker, IN_PROGRESS_STATE, str(tmp_path), logger)

    hub.update_job_status.assert_called_once_with("job-1", "failed", error_message="thermal runaway")
    assert result == {"job_id": None, "consecutive_moonraker_failures": 0}


def test_monitor_cancelled_reports_failed_with_fallback_message(tmp_path, logger):
    hub = make_hub()
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "cancelled", "message": ""}

    result = run_tick(hub, moonraker, IN_PROGRESS_STATE, str(tmp_path), logger)

    hub.update_job_status.assert_called_once_with(
        "job-1", "failed", error_message="Impression cancelled sur l'imprimante"
    )


def test_monitor_moonraker_unreachable_increments_failure_counter(tmp_path, logger):
    hub = make_hub()
    moonraker = make_moonraker()
    moonraker.get_print_stats.side_effect = MoonrakerClientError("connexion refusée")

    result = run_tick(hub, moonraker, {"job_id": "job-1", "consecutive_moonraker_failures": 2}, str(tmp_path), logger)

    assert result == {"job_id": "job-1", "consecutive_moonraker_failures": 3}
    hub.update_job_status.assert_not_called()


def test_monitor_moonraker_unreachable_5_times_reports_failed(tmp_path, logger):
    hub = make_hub()
    moonraker = make_moonraker()
    moonraker.get_print_stats.side_effect = MoonrakerClientError("connexion refusée")

    result = run_tick(hub, moonraker, {"job_id": "job-1", "consecutive_moonraker_failures": 4}, str(tmp_path), logger)

    hub.update_job_status.assert_called_once_with(
        "job-1", "failed", error_message="Moonraker injoignable après 5 tentatives"
    )
    assert result == {"job_id": None, "consecutive_moonraker_failures": 0}


def test_monitor_terminal_report_conflict_409_is_treated_as_already_recorded(tmp_path, logger):
    hub = make_hub()
    hub.update_job_status.side_effect = HubClientError("déjà terminal", status_code=409)
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "complete", "message": ""}

    result = run_tick(hub, moonraker, IN_PROGRESS_STATE, str(tmp_path), logger)

    assert result == {"job_id": None, "consecutive_moonraker_failures": 0}


def test_monitor_terminal_report_other_hub_error_keeps_state_for_retry(tmp_path, logger):
    hub = make_hub()
    hub.update_job_status.side_effect = HubClientError("hub down", status_code=None)
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "complete", "message": ""}

    result = run_tick(hub, moonraker, IN_PROGRESS_STATE, str(tmp_path), logger)

    assert result == IN_PROGRESS_STATE
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
python -m pytest tests/test_run_tick.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'agent.main'`

- [ ] **Step 3: Implémenter `run_tick` dans `main.py`**

`printer-agent/agent/main.py` (contenu de ce task — la fonction `main()` CLI est ajoutée au Task 5, ne pas l'ajouter ici) :
```python
import os

from .hub_client import HubClientError
from .moonraker_client import MoonrakerClientError

MOONRAKER_FAILURE_THRESHOLD = 5


def run_tick(hub, moonraker, state, download_dir, logger):
    if state.get("job_id") is None:
        return _try_dispatch(hub, moonraker, state, download_dir, logger)
    return _try_monitor(hub, moonraker, state, logger)


def _try_dispatch(hub, moonraker, state, download_dir, logger):
    try:
        job = hub.get_next_job()
    except HubClientError as exc:
        logger.warning("Hub injoignable lors de la recherche d'un nouveau job: %s", exc)
        return state

    if job is None:
        logger.info("Aucun nouveau job pour cette imprimante.")
        return state

    job_id = job["jobId"]
    file_name = job["fileName"]
    logger.info("Nouveau job détecté: %s (%s)", job_id, file_name)

    dest_path = os.path.join(download_dir, file_name)
    try:
        hub.download_job_file(job_id, dest_path)
        moonraker.upload_and_start_print(dest_path, file_name)
    except (HubClientError, MoonrakerClientError) as exc:
        logger.error("Échec du dispatch du job %s: %s", job_id, exc)
        try:
            hub.update_job_status(job_id, "failed", error_message=str(exc))
        except HubClientError as report_exc:
            logger.error(
                "Échec du signalement de l'échec de dispatch au hub pour le job %s: %s", job_id, report_exc
            )
        return state
    finally:
        if os.path.exists(dest_path):
            os.remove(dest_path)

    try:
        hub.update_job_status(job_id, "printing")
    except HubClientError as exc:
        logger.error(
            "Impression démarrée sur Moonraker mais échec de la notification 'printing' au hub pour le job %s: %s",
            job_id,
            exc,
        )

    logger.info("Job %s dispatché avec succès, impression démarrée.", job_id)
    return {"job_id": job_id, "consecutive_moonraker_failures": 0}


def _try_monitor(hub, moonraker, state, logger):
    job_id = state["job_id"]
    try:
        stats = moonraker.get_print_stats()
    except MoonrakerClientError as exc:
        failures = state.get("consecutive_moonraker_failures", 0) + 1
        logger.warning(
            "Moonraker injoignable (échec %d/%d) pour le job %s: %s",
            failures,
            MOONRAKER_FAILURE_THRESHOLD,
            job_id,
            exc,
        )
        if failures >= MOONRAKER_FAILURE_THRESHOLD:
            return _report_terminal(
                hub, job_id, "failed", "Moonraker injoignable après 5 tentatives", state, logger
            )
        return {**state, "consecutive_moonraker_failures": failures}

    print_state = stats["state"]
    logger.info("État Moonraker pour le job %s: %s", job_id, print_state)

    if print_state == "complete":
        return _report_terminal(hub, job_id, "completed", None, state, logger)

    if print_state in ("error", "cancelled"):
        detail = stats.get("message") or f"Impression {print_state} sur l'imprimante"
        return _report_terminal(hub, job_id, "failed", detail, state, logger)

    return {**state, "consecutive_moonraker_failures": 0}


def _report_terminal(hub, job_id, status, error_message, state, logger):
    try:
        hub.update_job_status(job_id, status, error_message=error_message)
    except HubClientError as exc:
        if exc.status_code == 409:
            logger.info("Job %s déjà signalé '%s' côté hub (409), état local nettoyé.", job_id, status)
        else:
            logger.error("Échec de la notification '%s' au hub pour le job %s: %s", status, job_id, exc)
            return state
    else:
        logger.info("Job %s signalé '%s' au hub.", job_id, status)

    return {"job_id": None, "consecutive_moonraker_failures": 0}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

```bash
python -m pytest tests/test_run_tick.py -v
```
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add printer-agent/agent/main.py printer-agent/tests/test_run_tick.py
git commit -m "feat(print-agent): orchestration d'un tick (dispatch + suivi d'impression)"
```

---

## Task 5: `main.py` — point d'entrée CLI (config, logging, verrou)

**Files:**
- Modify: `printer-agent/agent/main.py` (ajoute `load_config`, `setup_logging`, `main`, le bloc `if __name__ == "__main__":`)
- Test: `printer-agent/tests/test_main_cli.py`

**Interfaces:**
- Consumes: `run_tick` (Task 4), `load_state`/`save_state` (Task 1), `HubClient` (Task 2), `MoonrakerClient` (Task 3)
- Produces: `load_config(path: str) -> dict`
- Produces: `setup_logging(log_path: str) -> logging.Logger`
- Produces: `main(argv: list[str] | None = None) -> None` — point d'entrée, lit `--config` (défaut : `config.yaml` à côté du package `agent/`)

- [ ] **Step 1: Écrire les tests**

`printer-agent/tests/test_main_cli.py` :
```python
import fcntl
import os
from unittest.mock import patch

import yaml

from agent.main import load_config, main

CONFIG = {
    "hub": {"base_url": "https://hub.example.org/api/print/agent"},
    "printer": {"id": "printer-1", "api_key": "secret"},
    "moonraker": {"base_url": "http://localhost:7125"},
}


def write_config(tmp_path):
    config_path = tmp_path / "config.yaml"
    with open(config_path, "w") as f:
        yaml.safe_dump(CONFIG, f)
    return str(config_path)


def test_load_config_parses_yaml(tmp_path):
    config_path = write_config(tmp_path)
    assert load_config(config_path) == CONFIG


@patch("agent.main.run_tick")
def test_main_runs_one_tick_and_persists_returned_state(mock_run_tick, tmp_path):
    config_path = write_config(tmp_path)
    mock_run_tick.return_value = {"job_id": "job-42", "consecutive_moonraker_failures": 0}

    main(["--config", config_path])

    state_path = tmp_path / "state.json"
    assert state_path.exists()
    mock_run_tick.assert_called_once()


@patch("agent.main.run_tick")
def test_main_skips_tick_when_lock_already_held(mock_run_tick, tmp_path):
    config_path = write_config(tmp_path)
    lock_path = tmp_path / "agent.lock"
    lock_file = open(lock_path, "w")
    fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)

    try:
        main(["--config", config_path])
    finally:
        fcntl.flock(lock_file, fcntl.LOCK_UN)
        lock_file.close()

    mock_run_tick.assert_not_called()


@patch("agent.main.run_tick")
def test_main_creates_log_file(mock_run_tick, tmp_path):
    config_path = write_config(tmp_path)
    mock_run_tick.return_value = {"job_id": None, "consecutive_moonraker_failures": 0}

    main(["--config", config_path])

    assert (tmp_path / "agent.log").exists()
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
python -m pytest tests/test_main_cli.py -v
```
Expected: FAIL — `ImportError: cannot import name 'load_config' from 'agent.main'`

- [ ] **Step 3: Ajouter la partie CLI à `main.py`**

Ajouter en tête de `printer-agent/agent/main.py` (après les imports existants) et à la fin du fichier :
```python
import argparse
import fcntl
import logging
import logging.handlers
import sys

import yaml

from .hub_client import HubClient
from .moonraker_client import MoonrakerClient
from .state import load_state, save_state
```

Et à la fin du fichier, après `_report_terminal` :
```python
def load_config(path):
    with open(path, "r") as f:
        return yaml.safe_load(f)


def setup_logging(log_path):
    logger = logging.getLogger("printer_agent")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    handler = logging.handlers.RotatingFileHandler(log_path, maxBytes=500_000, backupCount=1)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)
    return logger


def main(argv=None):
    parser = argparse.ArgumentParser(description="Agent d'impression 3D — un tick.")
    default_config = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.yaml")
    parser.add_argument("--config", default=default_config)
    args = parser.parse_args(argv)

    base_dir = os.path.dirname(os.path.abspath(args.config))
    config = load_config(args.config)
    logger = setup_logging(os.path.join(base_dir, "agent.log"))

    lock_path = os.path.join(base_dir, "agent.lock")
    lock_file = open(lock_path, "w")
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        logger.info("Tick précédent encore en cours, on saute celui-ci.")
        lock_file.close()
        return

    try:
        hub = HubClient(config["hub"]["base_url"], config["printer"]["id"], config["printer"]["api_key"])
        moonraker = MoonrakerClient(config["moonraker"]["base_url"])
        state_path = os.path.join(base_dir, "state.json")
        state = load_state(state_path)

        new_state = run_tick(hub, moonraker, state, base_dir, logger)

        if new_state != state:
            save_state(state_path, new_state)
    finally:
        fcntl.flock(lock_file, fcntl.LOCK_UN)
        lock_file.close()


if __name__ == "__main__":
    main(sys.argv[1:])
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

```bash
python -m pytest tests/ -v
```
Expected: PASS (toute la suite, ~32 tests)

- [ ] **Step 5: Commit**

```bash
git add printer-agent/agent/main.py printer-agent/tests/test_main_cli.py
git commit -m "feat(print-agent): point d'entrée CLI (config, logging, verrou anti-chevauchement)"
```

---

## Task 6: Frontend — afficher `errorMessage` sur "Mes impressions"

**Files:**
- Modify: `client/src/pages/print/index.js:222-229`

**Interfaces:**
- Consumes: `job.errorMessage` (champ déjà renvoyé par `GET /api/print/jobs/me`, aucun changement backend nécessaire — vérifié dans `server/src/controllers/print/jobController.js:getMyJobs`, aucune exclusion de champ)

Pas de framework de test frontend dans ce repo (`client/package.json` n'a ni script `test` ni dépendance Jest/Testing Library) — vérification manuelle via Docker uniquement, conformément à la pratique du projet sur cette machine (Node 25 casse Next.js 12 en local hors conteneur).

- [ ] **Step 1: Modifier la carte de job pour afficher l'erreur**

Dans `client/src/pages/print/index.js`, remplacer :
```javascript
            {jobs.map((job) => (
              <Card key={job._id} padding="compact" className="flex items-center justify-between gap-4">
                <span className="text-text truncate">{job.fileName}</span>
                <Badge variant={STATUS_BADGE_VARIANTS[job.status] || 'neutral'}>
                  {STATUS_LABELS[job.status] || job.status}
                </Badge>
              </Card>
            ))}
```
par :
```javascript
            {jobs.map((job) => (
              <Card key={job._id} padding="compact" className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-text truncate">{job.fileName}</span>
                  <Badge variant={STATUS_BADGE_VARIANTS[job.status] || 'neutral'}>
                    {STATUS_LABELS[job.status] || job.status}
                  </Badge>
                </div>
                {job.status === 'failed' && job.errorMessage && (
                  <p className="text-sm text-danger">{job.errorMessage}</p>
                )}
              </Card>
            ))}
```

- [ ] **Step 2: Vérification manuelle via Docker**

```bash
docker-compose up
```
Ouvrir `/print`, soumettre un job sur une imprimante `idle`, puis (en base ou via l'API admin) faire passer ce job en `failed` avec un `errorMessage` renseigné — confirmer que le message apparaît sous le badge "Échec" en rouge, et que les jobs `queued`/`printing`/`completed` n'affichent rien en plus du badge.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/print/index.js
git commit -m "fix(print): afficher le détail de l'erreur sur les impressions échouées"
```

---

## Self-Review

**Couverture du spec** — chaque section de `2026-09-03-agent-impression-3d-design.md` a une tâche correspondante :
- Architecture générale / Composants → Tasks 1-5 (structure `printer-agent/`)
- Configuration & état local → Task 1 (`state.py`, `config.example.yaml`)
- Workflow détaillé (dispatch + suivi) → Task 4 (`run_tick`)
- Gestion des erreurs (dispatch immédiat, seuil 5 échecs Moonraker, hub injoignable) → Task 4, cas de test dédiés
- Logging → Task 5 (`setup_logging`, rotation 2×500 Ko)
- Correctif frontend → Task 6
- Tests → chaque task inclut sa suite `pytest`

**Écart assumé par rapport au spec** : le spec mentionne un « test existant du composant Mes impressions étendu » — en réalité aucune infra de test frontend n'existe dans ce repo (vérifié : pas de Jest/RTL dans `client/package.json`). Task 6 documente cet écart explicitement plutôt que d'introduire silencieusement un nouveau framework de test, ce qui aurait été hors périmètre de cette feature.

**Placeholders** : aucun — chaque step contient du code exécutable complet, aucune section « TODO » ou « similaire à ».

**Cohérence des types/signatures** : `run_tick(hub, moonraker, state, download_dir, logger)` (Task 4) est appelé à l'identique dans `main()` (Task 5) ; `HubClientError`/`MoonrakerClientError` ont la même forme partout ; `load_state`/`save_state` (Task 1) sont consommés tels quels par `main()` (Task 5) sans changement de signature.
