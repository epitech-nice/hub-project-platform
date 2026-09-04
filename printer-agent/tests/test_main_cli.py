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
