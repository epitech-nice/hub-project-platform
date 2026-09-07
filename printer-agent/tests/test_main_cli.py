import fcntl
import json
import os
from unittest.mock import patch

from agent.main import load_config, main


class _StopLoop(Exception):
    """Sentinelle pour sortir de `while True` dans les tests du mode --loop.

    Doit être levée depuis le mock de `time.sleep`, jamais depuis `run_tick` : une exception
    levée par `run_tick` est interceptée et avalée par le `try/except` de la boucle dans
    `agent/main.py`, donc le test tournerait indéfiniment au lieu d'échouer.
    """

CONFIG = {
    "hub": {"base_url": "https://hub.example.org/api/print/agent"},
    "printer": {"id": "printer-1", "api_key": "secret"},
    "moonraker": {"base_url": "http://localhost:7125"},
}

DEFAULT_STATE = {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


def write_config(tmp_path):
    config_path = tmp_path / "config.json"
    with open(config_path, "w") as f:
        json.dump(CONFIG, f)
    return str(config_path)


def test_load_config_parses_json(tmp_path):
    config_path = write_config(tmp_path)
    assert load_config(config_path) == CONFIG


@patch("agent.main.run_tick")
def test_main_runs_one_tick_and_persists_returned_state(mock_run_tick, tmp_path):
    config_path = write_config(tmp_path)
    mock_run_tick.return_value = {"job_id": "job-42", "consecutive_moonraker_failures": 0, "job_started_at": "x"}

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
    mock_run_tick.return_value = dict(DEFAULT_STATE)

    main(["--config", config_path])

    assert (tmp_path / "agent.log").exists()


@patch("agent.main.save_state")
@patch("agent.main.run_tick")
def test_main_skips_save_state_when_state_unchanged(mock_run_tick, mock_save_state, tmp_path):
    config_path = write_config(tmp_path)
    mock_run_tick.return_value = dict(DEFAULT_STATE)

    main(["--config", config_path])

    mock_save_state.assert_not_called()


@patch("agent.main.save_state")
@patch("agent.main.run_tick")
def test_main_calls_save_state_when_state_changed(mock_run_tick, mock_save_state, tmp_path):
    config_path = write_config(tmp_path)
    new_state = {"job_id": "job-99", "consecutive_moonraker_failures": 0, "job_started_at": "x"}
    mock_run_tick.return_value = new_state

    main(["--config", config_path])

    mock_save_state.assert_called_once()
    args, kwargs = mock_save_state.call_args
    assert args[1] == new_state


@patch("agent.main.run_tick")
def test_main_creates_downloads_subdirectory(mock_run_tick, tmp_path):
    config_path = write_config(tmp_path)
    mock_run_tick.return_value = dict(DEFAULT_STATE)

    main(["--config", config_path])

    assert os.path.isdir(tmp_path / "downloads") is True


@patch("agent.main.run_tick")
def test_main_purges_stale_files_left_in_downloads_directory(mock_run_tick, tmp_path):
    # Un kill (ex: app.sh stop/restart, SIGKILL) en plein téléchargement empêche le
    # `finally` de _try_dispatch de nettoyer dest_path : le fichier partiel reste dans
    # downloads/ indéfiniment. Comme le flock plus haut dans main() garantit qu'aucune
    # autre instance de l'agent ne possède ces fichiers, main() doit purger le contenu
    # de downloads/ au démarrage.
    config_path = write_config(tmp_path)
    mock_run_tick.return_value = dict(DEFAULT_STATE)
    downloads_dir = tmp_path / "downloads"
    downloads_dir.mkdir()
    stale_file = downloads_dir / "orphaned_job.gcode"
    stale_file.write_text("partial gcode content")

    main(["--config", config_path])

    assert stale_file.exists() is False
    assert os.path.isdir(downloads_dir) is True


@patch("agent.main.time.sleep")
@patch("agent.main.run_tick")
def test_main_without_loop_flag_never_sleeps(mock_run_tick, mock_sleep, tmp_path):
    config_path = write_config(tmp_path)
    mock_run_tick.return_value = dict(DEFAULT_STATE)

    main(["--config", config_path])

    mock_run_tick.assert_called_once()
    mock_sleep.assert_not_called()


@patch("agent.main.time.sleep")
@patch("agent.main.run_tick")
def test_main_loop_ticks_repeatedly_with_sleep_between(mock_run_tick, mock_sleep, tmp_path):
    config_path = write_config(tmp_path)
    mock_run_tick.return_value = dict(DEFAULT_STATE)
    mock_sleep.side_effect = [None, None, _StopLoop()]

    main(["--config", config_path, "--loop"])

    assert mock_run_tick.call_count == 3
    mock_sleep.assert_called_with(60)


@patch("agent.main.time.sleep")
@patch("agent.main.run_tick")
def test_main_loop_continues_after_tick_error(mock_run_tick, mock_sleep, tmp_path):
    config_path = write_config(tmp_path)
    mock_run_tick.side_effect = [RuntimeError("boom"), dict(DEFAULT_STATE)]
    mock_sleep.side_effect = [None, _StopLoop()]

    main(["--config", config_path, "--loop"])

    assert mock_run_tick.call_count == 2
    log_content = (tmp_path / "agent.log").read_text()
    assert "boucle continue" in log_content


@patch("agent.main.run_tick")
def test_main_logs_and_returns_cleanly_on_bad_config(mock_run_tick, tmp_path):
    # Couvre le Critical #2 : setup_logging tourne avant load_config, donc même une config
    # cassée/absente doit finir dans le fichier de log plutôt qu'échouer avant qu'aucun
    # logger n'existe. On pointe --config vers un fichier inexistant dans un répertoire qui,
    # lui, existe bien (tmp_path), pour que base_dir — et donc l'emplacement du log — reste
    # résolvable.
    bad_config_path = str(tmp_path / "nonexistent.json")

    main(["--config", bad_config_path])

    mock_run_tick.assert_not_called()
    log_path = tmp_path / "agent.log"
    assert log_path.exists()
    log_content = log_path.read_text()
    assert "chargement de la configuration" in log_content
