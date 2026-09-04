import pytest
import requests
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
        m.post(f"{BASE_URL}/server/files/upload", exc=requests.exceptions.ConnectTimeout)
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
        m.get(f"{BASE_URL}/printer/objects/query", exc=requests.exceptions.ConnectTimeout)
        with pytest.raises(MoonrakerClientError):
            client.get_print_stats()


def test_get_print_stats_raises_on_unexpected_shape():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/printer/objects/query", json={"unexpected": "shape"})
        with pytest.raises(MoonrakerClientError):
            client.get_print_stats()
