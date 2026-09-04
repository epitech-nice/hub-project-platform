import os

from .hub_client import HubClientError
from .moonraker_client import MoonrakerClientError

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
