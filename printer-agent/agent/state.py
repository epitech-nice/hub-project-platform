import json
import os
import tempfile

DEFAULT_STATE = {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}
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
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise
