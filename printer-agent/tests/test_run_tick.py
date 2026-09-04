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
