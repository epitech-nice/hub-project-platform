from unittest.mock import patch

import pytest
import requests
import requests_mock

from agent.moonraker_client import MoonrakerClient, MoonrakerClientError

BASE_URL = "http://localhost:7125"


def make_client():
    return MoonrakerClient(BASE_URL)


def test_upload_and_start_print_uses_a_longer_timeout_than_status_checks(tmp_path):
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
        mock_post.return_value.json.return_value = {"result": {"print_started": True}}
        client.upload_and_start_print(str(gcode_path), "print.gcode")

    _, kwargs = mock_post.call_args
    assert kwargs["timeout"] > client.timeout


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
    # root=gcodes et print=true sont le mécanisme même qui déclenche l'impression : une
    # régression qui les omettrait upload le fichier sans jamais démarrer l'impression.
    assert 'name="root"' in sent_body and "gcodes" in sent_body
    assert 'name="print"' in sent_body and "true" in sent_body


def test_upload_and_start_print_raises_when_print_not_started(tmp_path):
    # Couvre l'Important #3 : Moonraker peut répondre HTTP 200/201 tout en refusant de démarrer
    # l'impression (Klipper pas prêt, en shutdown, déjà occupé) — print_started=false doit être
    # traité comme un échec de dispatch, pas comme un succès silencieux.
    client = make_client()
    gcode_path = tmp_path / "print.gcode"
    gcode_path.write_text("G28\n")

    with requests_mock.Mocker() as m:
        m.post(
            f"{BASE_URL}/server/files/upload",
            json={"result": {"item": {"path": "print.gcode", "root": "gcodes"}, "print_started": False}},
        )
        with pytest.raises(MoonrakerClientError):
            client.upload_and_start_print(str(gcode_path), "print.gcode")


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


def test_get_print_stats_raises_on_null_print_stats():
    # print_stats peut être présent mais null (ex: objet pas encore initialisé côté Klipper) ;
    # ça ne doit jamais remonter en AttributeError non attrapé sur print_stats.get(...).
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(
            f"{BASE_URL}/printer/objects/query",
            json={"result": {"status": {"print_stats": None}}},
        )
        with pytest.raises(MoonrakerClientError):
            client.get_print_stats()


def test_cancel_print_success():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/printer/print/cancel", json={"result": "ok"})
        client.cancel_print()
    assert m.last_request.method == "POST"


def test_cancel_print_raises_on_http_error():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/printer/print/cancel", status_code=500, text="internal error")
        with pytest.raises(MoonrakerClientError):
            client.cancel_print()


def test_cancel_print_raises_on_network_error():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/printer/print/cancel", exc=requests.exceptions.ConnectTimeout)
        with pytest.raises(MoonrakerClientError):
            client.cancel_print()
