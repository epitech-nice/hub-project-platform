import logging
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from agent.hub_client import HubClientError
from agent.moonraker_client import MoonrakerClientError
from agent.main import MAX_JOB_AGE_SECONDS, run_tick

IDLE_STATE = {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


@pytest.fixture
def logger():
    log = logging.getLogger("test")
    log.addHandler(logging.NullHandler())
    return log


def make_hub():
    hub = MagicMock()
    hub.heartbeat.return_value = False
    return hub


def make_moonraker():
    return MagicMock()


def recent_iso():
    return datetime.now(timezone.utc).isoformat()


def in_progress_state(job_started_at=None):
    return {
        "job_id": "job-1",
        "consecutive_moonraker_failures": 0,
        "job_started_at": job_started_at or recent_iso(),
    }


# --- Heartbeat (nouveau : appelé à chaque tick, avant tout le reste) ---

def test_heartbeat_called_on_dispatch_tick(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = None
    moonraker = make_moonraker()

    run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    hub.heartbeat.assert_called_once()


def test_heartbeat_called_on_monitor_tick(tmp_path, logger):
    hub = make_hub()
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "printing", "message": ""}

    run_tick(hub, moonraker, in_progress_state(), str(tmp_path), logger)

    hub.heartbeat.assert_called_once()


def test_heartbeat_failure_does_not_block_the_rest_of_the_tick(tmp_path, logger):
    hub = make_hub()
    hub.heartbeat.side_effect = HubClientError("hub down")
    hub.get_next_job.return_value = None
    moonraker = make_moonraker()

    result = run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    assert result == IDLE_STATE
    hub.get_next_job.assert_called_once()


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
    assert result["job_id"] == "job-1"
    assert result["consecutive_moonraker_failures"] == 0
    assert result["job_started_at"] is not None
    # le fichier téléchargé temporairement est nettoyé après dispatch
    assert os.listdir(tmp_path) == []


def test_dispatch_sanitizes_filename_from_hub_payload(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {
        "jobId": "job-1",
        "fileName": "../../etc/evil.gcode",
        "downloadUrl": "/x",
    }

    captured = {}

    def fake_download(job_id, dest_path):
        captured["dest_path"] = dest_path
        with open(dest_path, "w") as f:
            f.write("G28\n")

    hub.download_job_file.side_effect = fake_download
    moonraker = make_moonraker()

    run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    # le chemin final doit rester dans tmp_path, jamais remonter via ../..
    assert os.path.dirname(captured["dest_path"]) == str(tmp_path)
    assert os.path.basename(captured["dest_path"]) == "evil.gcode"


def test_dispatch_skipped_when_disk_space_too_low(tmp_path, logger):
    hub = make_hub()
    hub.get_next_job.return_value = {"jobId": "job-1", "fileName": "a.gcode", "downloadUrl": "/x"}
    moonraker = make_moonraker()

    with patch("agent.main.shutil.disk_usage") as mock_disk_usage:
        mock_disk_usage.return_value = MagicMock(free=1024)  # bien en dessous de MIN_FREE_DISK_BYTES
        result = run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    hub.download_job_file.assert_not_called()
    hub.update_job_status.assert_called_once_with(
        "job-1", "failed", error_message="Espace disque insuffisant sur l'imprimante"
    )
    assert result == IDLE_STATE


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


def test_dispatch_failure_on_unexpected_exception_still_reports_failed(tmp_path, logger):
    # Couvre le Critical #2 de la revue finale : une exception qui n'est ni HubClientError
    # ni MoonrakerClientError (ex: OSError levé par open() avant même le download) ne doit
    # plus s'échapper de run_tick — elle doit être rapportée comme un échec de job normal.
    hub = make_hub()
    hub.get_next_job.return_value = {"jobId": "job-1", "fileName": "a.gcode", "downloadUrl": "/x"}
    hub.download_job_file.side_effect = OSError("disque plein")
    moonraker = make_moonraker()

    result = run_tick(hub, moonraker, IDLE_STATE, str(tmp_path), logger)

    hub.update_job_status.assert_called_once_with("job-1", "failed", error_message="disque plein")
    assert result == IDLE_STATE


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

def test_monitor_still_printing_returns_state_with_failures_reset(tmp_path, logger):
    hub = make_hub()
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "printing", "message": ""}
    state = in_progress_state()
    state["consecutive_moonraker_failures"] = 2

    result = run_tick(hub, moonraker, state, str(tmp_path), logger)

    assert result["job_id"] == "job-1"
    assert result["consecutive_moonraker_failures"] == 0
    hub.update_job_status.assert_not_called()


def test_monitor_complete_reports_completed_and_clears_job(tmp_path, logger):
    hub = make_hub()
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "complete", "message": ""}

    result = run_tick(hub, moonraker, in_progress_state(), str(tmp_path), logger)

    hub.update_job_status.assert_called_once_with("job-1", "completed", error_message=None)
    assert result == {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


def test_monitor_error_reports_failed_with_moonraker_message(tmp_path, logger):
    hub = make_hub()
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "error", "message": "thermal runaway"}

    result = run_tick(hub, moonraker, in_progress_state(), str(tmp_path), logger)

    hub.update_job_status.assert_called_once_with("job-1", "failed", error_message="thermal runaway")
    assert result == {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


def test_monitor_cancelled_reports_failed_with_fallback_message(tmp_path, logger):
    hub = make_hub()
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "cancelled", "message": ""}

    result = run_tick(hub, moonraker, in_progress_state(), str(tmp_path), logger)

    hub.update_job_status.assert_called_once_with(
        "job-1", "failed", error_message="Impression cancelled sur l'imprimante"
    )
    assert result == {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


def test_monitor_moonraker_unreachable_increments_failure_counter(tmp_path, logger):
    hub = make_hub()
    moonraker = make_moonraker()
    moonraker.get_print_stats.side_effect = MoonrakerClientError("connexion refusée")
    state = in_progress_state()
    state["consecutive_moonraker_failures"] = 2

    result = run_tick(hub, moonraker, state, str(tmp_path), logger)

    assert result["job_id"] == "job-1"
    assert result["consecutive_moonraker_failures"] == 3
    hub.update_job_status.assert_not_called()


def test_monitor_moonraker_unreachable_5_times_reports_failed(tmp_path, logger):
    hub = make_hub()
    moonraker = make_moonraker()
    moonraker.get_print_stats.side_effect = MoonrakerClientError("connexion refusée")
    state = in_progress_state()
    state["consecutive_moonraker_failures"] = 4

    result = run_tick(hub, moonraker, state, str(tmp_path), logger)

    hub.update_job_status.assert_called_once_with(
        "job-1", "failed", error_message="Moonraker injoignable après 5 tentatives"
    )
    assert result == {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


def test_monitor_unexpected_state_increments_failure_counter(tmp_path, logger):
    # Couvre l'Important #4 de la revue finale : un état Moonraker inattendu (ex: 'standby'
    # après un redémarrage Klipper en plein print) ne doit ni faire suivre indéfiniment,
    # ni planter — il doit passer par le même mécanisme d'escalade que "injoignable".
    hub = make_hub()
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "standby", "message": ""}
    state = in_progress_state()
    state["consecutive_moonraker_failures"] = 2

    result = run_tick(hub, moonraker, state, str(tmp_path), logger)

    assert result["job_id"] == "job-1"
    assert result["consecutive_moonraker_failures"] == 3
    hub.update_job_status.assert_not_called()


def test_monitor_unexpected_state_5_times_reports_failed(tmp_path, logger):
    hub = make_hub()
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "standby", "message": ""}
    state = in_progress_state()
    state["consecutive_moonraker_failures"] = 4

    result = run_tick(hub, moonraker, state, str(tmp_path), logger)

    hub.update_job_status.assert_called_once()
    args, kwargs = hub.update_job_status.call_args
    assert args[0] == "job-1"
    assert args[1] == "failed"
    assert "standby" in kwargs["error_message"]
    assert result == {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


def test_monitor_job_older_than_max_age_reports_failed_regardless_of_moonraker_state(tmp_path, logger):
    # Couvre l'Important #4 : filet de sécurité absolu, indépendant de ce que Moonraker
    # rapporte (même s'il dit encore 'printing', un job suivi depuis plus de 24h est anormal).
    hub = make_hub()
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "printing", "message": ""}
    too_old = (datetime.now(timezone.utc) - timedelta(seconds=MAX_JOB_AGE_SECONDS + 60)).isoformat()

    result = run_tick(hub, moonraker, in_progress_state(job_started_at=too_old), str(tmp_path), logger)

    hub.update_job_status.assert_called_once()
    args, kwargs = hub.update_job_status.call_args
    assert args[0] == "job-1"
    assert args[1] == "failed"
    moonraker.get_print_stats.assert_not_called()
    assert result == {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


# --- Annulation (cancelRequested via heartbeat) ---

def test_monitor_cancel_requested_while_active_calls_moonraker_cancel_and_reports_cancelled(tmp_path, logger):
    hub = make_hub()
    hub.heartbeat.return_value = True
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "printing", "message": ""}

    result = run_tick(hub, moonraker, in_progress_state(), str(tmp_path), logger)

    moonraker.cancel_print.assert_called_once()
    hub.update_job_status.assert_called_once_with("job-1", "cancelled", error_message=None)
    assert result == {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


def test_monitor_cancel_requested_but_print_already_completed_reports_completed_not_cancelled(tmp_path, logger):
    # Un cancelRequested arrivé pile au moment où l'impression se termine naturellement ne doit
    # jamais écraser un état terminal légitime.
    hub = make_hub()
    hub.heartbeat.return_value = True
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "complete", "message": ""}

    result = run_tick(hub, moonraker, in_progress_state(), str(tmp_path), logger)

    moonraker.cancel_print.assert_not_called()
    hub.update_job_status.assert_called_once_with("job-1", "completed", error_message=None)
    assert result == {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


def test_monitor_cancel_requested_but_print_already_errored_reports_failed_not_cancelled(tmp_path, logger):
    hub = make_hub()
    hub.heartbeat.return_value = True
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "error", "message": "thermal runaway"}

    result = run_tick(hub, moonraker, in_progress_state(), str(tmp_path), logger)

    moonraker.cancel_print.assert_not_called()
    hub.update_job_status.assert_called_once_with("job-1", "failed", error_message="thermal runaway")
    assert result == {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


def test_monitor_cancel_requested_but_moonraker_cancel_call_fails_retries_next_tick(tmp_path, logger):
    hub = make_hub()
    hub.heartbeat.return_value = True
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "printing", "message": ""}
    moonraker.cancel_print.side_effect = MoonrakerClientError("timeout")

    result = run_tick(hub, moonraker, in_progress_state(), str(tmp_path), logger)

    moonraker.cancel_print.assert_called_once()
    hub.update_job_status.assert_not_called()
    assert result["job_id"] == "job-1"


def test_monitor_not_cancel_requested_ignores_active_print(tmp_path, logger):
    hub = make_hub()
    hub.heartbeat.return_value = False
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "printing", "message": ""}

    result = run_tick(hub, moonraker, in_progress_state(), str(tmp_path), logger)

    moonraker.cancel_print.assert_not_called()
    hub.update_job_status.assert_not_called()


def test_monitor_terminal_report_conflict_409_is_treated_as_already_recorded(tmp_path, logger):
    hub = make_hub()
    hub.update_job_status.side_effect = HubClientError("déjà terminal", status_code=409)
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "complete", "message": ""}

    result = run_tick(hub, moonraker, in_progress_state(), str(tmp_path), logger)

    assert result == {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


def test_monitor_terminal_report_permanent_error_clears_state(tmp_path, logger):
    # Couvre l'Important #8 : une erreur permanente (404 "job non trouvé", 403 "ne correspond
    # plus à cette imprimante") ne se résoudra jamais par un retry — il faut nettoyer l'état
    # local plutôt que de suivre ce job indéfiniment.
    hub = make_hub()
    hub.update_job_status.side_effect = HubClientError("job non trouvé", status_code=404)
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "complete", "message": ""}

    result = run_tick(hub, moonraker, in_progress_state(), str(tmp_path), logger)

    assert result == {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


def test_monitor_terminal_report_other_hub_error_keeps_state_for_retry(tmp_path, logger):
    hub = make_hub()
    hub.update_job_status.side_effect = HubClientError("hub down", status_code=None)
    moonraker = make_moonraker()
    moonraker.get_print_stats.return_value = {"state": "complete", "message": ""}

    state = in_progress_state()
    result = run_tick(hub, moonraker, state, str(tmp_path), logger)

    assert result == state
