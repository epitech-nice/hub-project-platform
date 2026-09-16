from unittest.mock import patch
import time

import pytest
import requests
import requests_mock

from agent.moonraker_client import MoonrakerClient, MoonrakerClientError

BASE_URL = "http://localhost:7125"


def make_client():
    return MoonrakerClient(BASE_URL)


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


def test_get_mmu_status_parses_gates():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(
            f"{BASE_URL}/printer/objects/query",
            json={
                "result": {
                    "status": {
                        "mmu": {
                            "num_gates": 4,
                            "gate_status": [1, 0, 1, 1],
                            "gate_material": ["PLA", "PLA", "PETG", "PLA"],
                            "gate_color": ["212721FF", "F40031FF", "FED141FF", "FF6A14FF"],
                        }
                    }
                }
            },
        )
        gates = client.get_mmu_status()
    assert gates == [
        {"gate": 0, "material": "PLA", "color": "212721FF", "empty": False},
        {"gate": 1, "material": "PLA", "color": "F40031FF", "empty": True},
        {"gate": 2, "material": "PETG", "color": "FED141FF", "empty": False},
        {"gate": 3, "material": "PLA", "color": "FF6A14FF", "empty": False},
    ]
    assert m.last_request.method == "GET"


def test_get_mmu_status_raises_on_network_error():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/printer/objects/query", exc=requests.exceptions.ConnectTimeout)
        with pytest.raises(MoonrakerClientError):
            client.get_mmu_status()


def test_get_mmu_status_raises_on_http_error():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/printer/objects/query", status_code=500, text="internal error")
        with pytest.raises(MoonrakerClientError):
            client.get_mmu_status()


def test_get_mmu_status_raises_on_unexpected_shape():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(f"{BASE_URL}/printer/objects/query", json={"result": {"status": {}}})
        with pytest.raises(MoonrakerClientError):
            client.get_mmu_status()


def test_get_mmu_status_raises_moonraker_error_when_num_gates_is_not_an_int():
    # num_gates non numérique (ex: chaîne) doit être détecté avant `range(num_gates)`,
    # qui lèverait sinon un TypeError brut hors de tout except — voir Finding 3 : un
    # échec de get_mmu_status ne doit jamais propager autre chose qu'un MoonrakerClientError.
    client = make_client()
    with requests_mock.Mocker() as m:
        m.get(
            f"{BASE_URL}/printer/objects/query",
            json={
                "result": {
                    "status": {
                        "mmu": {
                            "num_gates": "4",
                            "gate_status": [1, 0, 1, 1],
                            "gate_material": ["PLA", "PLA", "PETG", "PLA"],
                            "gate_color": ["212721FF", "F40031FF", "FED141FF", "FF6A14FF"],
                        }
                    }
                }
            },
        )
        with pytest.raises(MoonrakerClientError):
            client.get_mmu_status()


def test_start_print_success():
    client = make_client()
    with requests_mock.Mocker() as m:
        m.post(f"{BASE_URL}/printer/print/start", json={"result": "ok"})
        client.start_print("multi.gcode")
    assert m.last_request.json() == {"filename": "multi.gcode"}


def test_start_print_uses_a_longer_timeout_than_status_checks():
    # Bug réel en prod (2026-09-16) : /printer/print/start ne répond qu'une fois la séquence
    # physique de démarrage terminée côté gklib (coupe filament + déroulement + chauffe buse/
    # plateau + homing) — observée à plus d'1 minute rien que pour la chauffe. Le timeout court
    # de 10s (partagé avec les status checks) faisait lever un MoonrakerClientError et reporter
    # le job 'failed' au hub alors que l'impression démarrait en réalité normalement.
    client = make_client()
    with patch("agent.moonraker_client.requests.post") as mock_post:
        mock_post.return_value.status_code = 200
        client.start_print("multi.gcode")

    _, kwargs = mock_post.call_args
    assert kwargs["timeout"] > client.timeout


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
