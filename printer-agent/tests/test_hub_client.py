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
