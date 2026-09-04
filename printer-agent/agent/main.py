import argparse
import fcntl
import logging
import logging.handlers
import os
import sys

import yaml

from .hub_client import HubClient, HubClientError
from .moonraker_client import MoonrakerClient, MoonrakerClientError
from .state import load_state, save_state

MOONRAKER_FAILURE_THRESHOLD = 5


def run_tick(hub, moonraker, state, download_dir, logger):
    if state.get("job_id") is None:
        return _try_dispatch(hub, moonraker, state, download_dir, logger)
    return _try_monitor(hub, moonraker, state, logger)


def _try_dispatch(hub, moonraker, state, download_dir, logger):
    try:
        job = hub.get_next_job()
    except HubClientError as exc:
        logger.warning("Hub injoignable lors de la recherche d'un nouveau job: %s", exc)
        return state

    if job is None:
        logger.info("Aucun nouveau job pour cette imprimante.")
        return state

    job_id = job["jobId"]
    file_name = job["fileName"]
    logger.info("Nouveau job détecté: %s (%s)", job_id, file_name)

    dest_path = os.path.join(download_dir, file_name)
    try:
        hub.download_job_file(job_id, dest_path)
        moonraker.upload_and_start_print(dest_path, file_name)
    except (HubClientError, MoonrakerClientError) as exc:
        logger.error("Échec du dispatch du job %s: %s", job_id, exc)
        try:
            hub.update_job_status(job_id, "failed", error_message=str(exc))
        except HubClientError as report_exc:
            logger.error(
                "Échec du signalement de l'échec de dispatch au hub pour le job %s: %s", job_id, report_exc
            )
        return state
    finally:
        if os.path.exists(dest_path):
            os.remove(dest_path)

    try:
        hub.update_job_status(job_id, "printing")
    except HubClientError as exc:
        logger.error(
            "Impression démarrée sur Moonraker mais échec de la notification 'printing' au hub pour le job %s: %s",
            job_id,
            exc,
        )

    logger.info("Job %s dispatché avec succès, impression démarrée.", job_id)
    return {"job_id": job_id, "consecutive_moonraker_failures": 0}


def _try_monitor(hub, moonraker, state, logger):
    job_id = state["job_id"]
    try:
        stats = moonraker.get_print_stats()
    except MoonrakerClientError as exc:
        failures = state.get("consecutive_moonraker_failures", 0) + 1
        logger.warning(
            "Moonraker injoignable (échec %d/%d) pour le job %s: %s",
            failures,
            MOONRAKER_FAILURE_THRESHOLD,
            job_id,
            exc,
        )
        if failures >= MOONRAKER_FAILURE_THRESHOLD:
            return _report_terminal(
                hub, job_id, "failed", "Moonraker injoignable après 5 tentatives", state, logger
            )
        return {**state, "consecutive_moonraker_failures": failures}

    print_state = stats["state"]
    logger.info("État Moonraker pour le job %s: %s", job_id, print_state)

    if print_state == "complete":
        return _report_terminal(hub, job_id, "completed", None, state, logger)

    if print_state in ("error", "cancelled"):
        detail = stats.get("message") or f"Impression {print_state} sur l'imprimante"
        return _report_terminal(hub, job_id, "failed", detail, state, logger)

    return {**state, "consecutive_moonraker_failures": 0}


def _report_terminal(hub, job_id, status, error_message, state, logger):
    try:
        hub.update_job_status(job_id, status, error_message=error_message)
    except HubClientError as exc:
        if exc.status_code == 409:
            logger.info("Job %s déjà signalé '%s' côté hub (409), état local nettoyé.", job_id, status)
        else:
            logger.error("Échec de la notification '%s' au hub pour le job %s: %s", status, job_id, exc)
            return state
    else:
        logger.info("Job %s signalé '%s' au hub.", job_id, status)

    return {"job_id": None, "consecutive_moonraker_failures": 0}


def load_config(path):
    with open(path, "r") as f:
        return yaml.safe_load(f)


def setup_logging(log_path):
    logger = logging.getLogger("printer_agent")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    handler = logging.handlers.RotatingFileHandler(log_path, maxBytes=500_000, backupCount=1)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)
    return logger


def main(argv=None):
    parser = argparse.ArgumentParser(description="Agent d'impression 3D — un tick.")
    default_config = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.yaml")
    parser.add_argument("--config", default=default_config)
    args = parser.parse_args(argv)

    base_dir = os.path.dirname(os.path.abspath(args.config))
    config = load_config(args.config)
    logger = setup_logging(os.path.join(base_dir, "agent.log"))

    lock_path = os.path.join(base_dir, "agent.lock")
    lock_file = open(lock_path, "w")
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        logger.info("Tick précédent encore en cours, on saute celui-ci.")
        lock_file.close()
        return

    try:
        hub = HubClient(config["hub"]["base_url"], config["printer"]["id"], config["printer"]["api_key"])
        moonraker = MoonrakerClient(config["moonraker"]["base_url"])
        state_path = os.path.join(base_dir, "state.json")
        state = load_state(state_path)

        new_state = run_tick(hub, moonraker, state, base_dir, logger)

        if new_state != state:
            save_state(state_path, new_state)
    finally:
        fcntl.flock(lock_file, fcntl.LOCK_UN)
        lock_file.close()


if __name__ == "__main__":
    main(sys.argv[1:])
