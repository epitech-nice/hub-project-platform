import pytest
import requests
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
        m.get(f"{BASE_URL}/next-job", exc=requests.exceptions.ConnectTimeout)
        with pytest.raises(HubClientError):
            client.get_next_job()


def test_get_next_job_raises_with_raw_text_on_non_json_error_body():
    # Certaines erreurs (ex: 502 renvoyé par un reverse proxy) ne sont pas au format JSON du hub
    # mais une page d'erreur HTML — _request doit alors retomber sur response.text plutôt que
    # de laisser le ValueError de response.json() remonter.
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(
            f"{BASE_URL}/next-job",
            status_code=502,
            text="<html><body>Bad Gateway</body></html>",
        )
        with pytest.raises(HubClientError) as exc_info:
            client.get_next_job()
    assert exc_info.value.status_code == 502
    assert "Bad Gateway" in str(exc_info.value)


def test_heartbeat_sends_auth_headers():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/heartbeat", json={"success": True, "cancelRequested": False})
        result = client.heartbeat()
    assert result is False
    assert m.last_request.method == "GET"
    assert m.last_request.headers["x-printer-id"] == "printer-1"
    assert m.last_request.headers["x-api-key"] == "secret-key"


def test_heartbeat_returns_true_when_cancellation_requested():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/heartbeat", json={"success": True, "cancelRequested": True})
        assert client.heartbeat() is True


def test_heartbeat_raises_on_failure():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/heartbeat", status_code=500, text="internal error")
        with pytest.raises(HubClientError):
            client.heartbeat()


def test_heartbeat_returns_false_on_non_json_2xx_body():
    # Couvre le cas d'un hub pas encore mis à jour renvoyant un 204 No Content vide (ou tout
    # autre corps non-JSON) à un agent neuf : ValueError de response.json() ne doit jamais
    # s'échapper de heartbeat() et casser tout le tick (voir run_tick, qui ne catche que
    # HubClientError autour de l'appel heartbeat).
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/heartbeat", status_code=204, text="")
        assert client.heartbeat() is False


def test_heartbeat_returns_false_on_invalid_json_2xx_body():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/heartbeat", status_code=200, text="not json")
        assert client.heartbeat() is False


def test_download_job_file_writes_content(tmp_path):
    client = make_client()
    dest = str(tmp_path / "job.gcode")
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/jobs/job-1/file", content=b"G28\nG1 X10\n")
        client.download_job_file("job-1", dest)
    with open(dest, "rb") as f:
        assert f.read() == b"G28\nG1 X10\n"


def test_download_job_file_wraps_write_failure_in_hub_client_error(tmp_path):
    # Couvre le Critical #2 : une écriture qui échoue en cours de stream (ici simulée en
    # pointant dest_path dans un répertoire inexistant) ne doit jamais laisser fuiter un OSError
    # brut — elle doit être convertie en HubClientError, et la réponse streamée doit être fermée.
    client = make_client()
    dest = str(tmp_path / "does-not-exist" / "job.gcode")
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/jobs/job-1/file", content=b"G28\nG1 X10\n")
        with pytest.raises(HubClientError):
            client.download_job_file("job-1", dest)


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
