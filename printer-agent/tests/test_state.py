import json
import os

from agent.state import load_state, save_state


def test_load_state_returns_default_when_file_missing(tmp_path):
    path = str(tmp_path / "state.json")
    assert load_state(path) == {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


def test_save_then_load_roundtrip(tmp_path):
    path = str(tmp_path / "state.json")
    state = {"job_id": "abc123", "consecutive_moonraker_failures": 2, "job_started_at": "2026-09-01T00:00:00+00:00"}
    save_state(path, state)
    assert load_state(path) == state


def test_load_state_returns_default_on_corrupted_json(tmp_path):
    path = str(tmp_path / "state.json")
    with open(path, "w") as f:
        f.write("not valid json {{{")
    assert load_state(path) == {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


def test_load_state_returns_default_on_missing_keys(tmp_path):
    path = str(tmp_path / "state.json")
    with open(path, "w") as f:
        json.dump({"unexpected": "shape"}, f)
    assert load_state(path) == {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


def test_save_state_does_not_leave_tmp_file_behind(tmp_path):
    path = str(tmp_path / "state.json")
    save_state(path, {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None})
    remaining = os.listdir(tmp_path)
    assert remaining == ["state.json"]
