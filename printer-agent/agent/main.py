import argparse
import fcntl
import json
import logging
import logging.handlers
import os
import shutil
import sys
import time
from datetime import datetime, timezone

from .hub_client import HubClient, HubClientError
from .moonraker_client import MoonrakerClient, MoonrakerClientError
from .state import load_state, save_state

TICK_INTERVAL_SECONDS = 60
MOONRAKER_FAILURE_THRESHOLD = 5
MAX_JOB_AGE_SECONDS = 24 * 60 * 60  # filet de sécurité absolu, indépendant de ce que rapporte Moonraker
MIN_FREE_DISK_BYTES = 100 * 1024 * 1024  # 100 Mo de marge avant de tenter un téléchargement
ACTIVE_STATES = ("printing", "paused")
TERMINAL_ERROR_STATES = ("error", "cancelled")
PERMANENT_HUB_ERROR_CODES = (400, 403, 404)


def run_tick(hub, moonraker, state, download_dir, logger):
    cancel_requested = False
    try:
        cancel_requested = hub.heartbeat()
    except HubClientError as exc:
        logger.warning("Échec du heartbeat vers le hub: %s", exc)

    _report_spool_status(hub, moonraker, logger)

    if state.get("job_id") is None:
        return _try_dispatch(hub, moonraker, state, download_dir, logger)
    return _try_monitor(hub, moonraker, state, logger, cancel_requested)


def _report_spool_status(hub, moonraker, logger):
    try:
        gates = moonraker.get_mmu_status()
    except MoonrakerClientError as exc:
        logger.warning("Échec de la lecture du statut bobines Moonraker: %s", exc)
        return
    try:
        hub.report_spool_status(gates)
    except HubClientError as exc:
        logger.warning("Échec du signalement du statut bobines au hub: %s", exc)


def _has_enough_disk_space(download_dir):
    try:
        return shutil.disk_usage(download_dir).free >= MIN_FREE_DISK_BYTES
    except OSError:
        return True  # la vérification elle-même échouant ne doit pas bloquer le dispatch


def _inject_gate_selection(file_path, gate):
    """Préfixe le fichier gcode d'une commande Tn — c'est le même canal que celui utilisé
    nativement par un gcode multi-couleur pour changer de bobine côté ACE (jamais les commandes
    manuelles MMU_SELECT/MMU_LOAD, réservées au panneau Fluidd — voir spec 2026-09-09)."""
    with open(file_path, "r") as f:
        original_content = f.read()
    with open(file_path, "w") as f:
        f.write(f"T{gate}\n")
        f.write(original_content)


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
    # os.path.basename : le hub renvoie fileName tel que soumis par l'étudiant (originalname
    # multer, non assaini côté hub) ; ne jamais faire confiance à ce payload comme chemin local.
    file_name = os.path.basename(job["fileName"]) or f"{job_id}.gcode"
    selected_gate = job.get("selectedGate")
    logger.info("Nouveau job détecté: %s (%s)", job_id, file_name)

    if not _has_enough_disk_space(download_dir):
        logger.error("Espace disque insuffisant pour télécharger le job %s, abandon.", job_id)
        try:
            hub.update_job_status(job_id, "failed", error_message="Espace disque insuffisant sur l'imprimante")
        except HubClientError as report_exc:
            logger.error(
                "Échec du signalement d'espace disque insuffisant pour le job %s: %s", job_id, report_exc
            )
        return state

    dest_path = os.path.join(download_dir, file_name)
    try:
        hub.download_job_file(job_id, dest_path)
        if selected_gate is not None:
            _inject_gate_selection(dest_path, selected_gate)
        moonraker.upload_and_start_print(dest_path, file_name)
    except Exception as exc:
        logger.error("Échec du dispatch du job %s: %s", job_id, exc, exc_info=True)
        try:
            hub.update_job_status(job_id, "failed", error_message=str(exc)[:500])
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
    return {
        "job_id": job_id,
        "consecutive_moonraker_failures": 0,
        "job_started_at": datetime.now(timezone.utc).isoformat(),
    }


def _job_age_seconds(state):
    started_at = state.get("job_started_at")
    if not started_at:
        return 0
    try:
        started = datetime.fromisoformat(started_at)
    except ValueError:
        return 0
    return (datetime.now(timezone.utc) - started).total_seconds()


def _try_monitor(hub, moonraker, state, logger, cancel_requested=False):
    job_id = state["job_id"]

    if _job_age_seconds(state) > MAX_JOB_AGE_SECONDS:
        logger.error(
            "Job %s suivi depuis plus de %ds, abandon (filet de sécurité absolu).", job_id, MAX_JOB_AGE_SECONDS
        )
        return _report_terminal(
            hub,
            job_id,
            "failed",
            f"Impression suivie depuis plus de {MAX_JOB_AGE_SECONDS // 3600}h, abandon",
            state,
            logger,
        )

    try:
        stats = moonraker.get_print_stats()
    except MoonrakerClientError as exc:
        return _handle_monitor_stall(hub, job_id, state, logger, "Moonraker injoignable", exc)

    print_state = stats["state"]
    logger.info("État Moonraker pour le job %s: %s", job_id, print_state)

    if print_state == "complete":
        return _report_terminal(hub, job_id, "completed", None, state, logger)

    # Moonraker peut déjà rapporter 'cancelled' nativement au moment où on regarde (ex: retry
    # d'un tick précédent où _report_terminal("cancelled", ...) a échoué côté hub — l'appel
    # moonraker.cancel_print() a bien eu lieu, et au tick suivant print_stats.state s'est
    # naturellement stabilisé sur 'cancelled'). Dans ce cas précis, il s'agit du chemin heureux
    # de l'annulation qui rejoue, pas d'un échec — ne jamais le rapporter 'failed'.
    if print_state == "cancelled" and cancel_requested:
        return _report_terminal(hub, job_id, "cancelled", None, state, logger)

    if print_state in TERMINAL_ERROR_STATES:
        detail = stats.get("message") or f"Impression {print_state} sur l'imprimante"
        return _report_terminal(hub, job_id, "failed", detail, state, logger)

    if print_state in ACTIVE_STATES:
        if cancel_requested:
            return _try_cancel_active_print(hub, moonraker, job_id, state, logger)
        return {**state, "consecutive_moonraker_failures": 0}

    # État inattendu (ex: 'standby' après un redémarrage Klipper en plein print, ou 'state'
    # absent) : traité comme le cas "Moonraker injoignable" — tolérant à court terme, mais
    # escalade en failed après le même seuil pour ne jamais suivre indéfiniment un job dont
    # l'imprimante ne sait plus rien.
    return _handle_monitor_stall(
        hub, job_id, state, logger, f"État Moonraker inattendu ('{print_state}')", None
    )


def _try_cancel_active_print(hub, moonraker, job_id, state, logger):
    try:
        moonraker.cancel_print()
    except MoonrakerClientError as exc:
        logger.warning(
            "Échec de l'appel d'annulation à Moonraker pour le job %s, nouvelle tentative au prochain tick: %s",
            job_id,
            exc,
        )
        return {**state, "consecutive_moonraker_failures": 0}
    return _report_terminal(hub, job_id, "cancelled", None, state, logger)


def _handle_monitor_stall(hub, job_id, state, logger, reason, exc):
    failures = state.get("consecutive_moonraker_failures", 0) + 1
    logger.warning(
        "%s (échec %d/%d) pour le job %s%s",
        reason,
        failures,
        MOONRAKER_FAILURE_THRESHOLD,
        job_id,
        f": {exc}" if exc else "",
    )
    if failures >= MOONRAKER_FAILURE_THRESHOLD:
        return _report_terminal(
            hub,
            job_id,
            "failed",
            f"{reason} après {MOONRAKER_FAILURE_THRESHOLD} tentatives",
            state,
            logger,
        )
    return {**state, "consecutive_moonraker_failures": failures}


def _report_terminal(hub, job_id, status, error_message, state, logger):
    try:
        hub.update_job_status(job_id, status, error_message=error_message)
    except HubClientError as exc:
        if exc.status_code == 409:
            logger.info("Job %s déjà signalé '%s' côté hub (409), état local nettoyé.", job_id, status)
        elif exc.status_code in PERMANENT_HUB_ERROR_CODES:
            logger.error(
                "Erreur permanente (HTTP %s) en signalant '%s' pour le job %s, abandon: %s",
                exc.status_code,
                status,
                job_id,
                exc,
            )
        else:
            logger.error("Échec de la notification '%s' au hub pour le job %s: %s", status, job_id, exc)
            return state
    else:
        logger.info("Job %s signalé '%s' au hub.", job_id, status)

    return {"job_id": None, "consecutive_moonraker_failures": 0, "job_started_at": None}


def load_config(path):
    with open(path, "r") as f:
        return json.load(f)


def setup_logging(log_path):
    logger = logging.getLogger("printer_agent")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.handlers.clear()
    handler = logging.handlers.RotatingFileHandler(log_path, maxBytes=500_000, backupCount=1)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)
    return logger


def _execute_tick(hub, moonraker, state_path, downloads_dir, logger):
    state = load_state(state_path)
    new_state = run_tick(hub, moonraker, state, downloads_dir, logger)
    if new_state != state:
        save_state(state_path, new_state)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Agent d'impression 3D.")
    default_config = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.json")
    parser.add_argument("--config", default=default_config)
    parser.add_argument(
        "--loop",
        action="store_true",
        help=(
            "Tourne en continu (tick toutes les %ds) au lieu de faire un seul tick puis quitter. "
            "À utiliser sur un environnement sans cron (ex: Rinkhals)." % TICK_INTERVAL_SECONDS
        ),
    )
    args = parser.parse_args(argv)

    base_dir = os.path.dirname(os.path.abspath(args.config))
    logger = setup_logging(os.path.join(base_dir, "agent.log"))

    try:
        config = load_config(args.config)
    except Exception:
        logger.error("Échec du chargement de la configuration (%s)", args.config, exc_info=True)
        return

    lock_path = os.path.join(base_dir, "agent.lock")
    lock_file = open(lock_path, "w")
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        logger.info("Une instance de l'agent tourne déjà, on s'arrête.")
        lock_file.close()
        return

    try:
        hub = HubClient(config["hub"]["base_url"], config["printer"]["id"], config["printer"]["api_key"])
        moonraker = MoonrakerClient(config["moonraker"]["base_url"])
        state_path = os.path.join(base_dir, "state.json")

        downloads_dir = os.path.join(base_dir, "downloads")
        os.makedirs(downloads_dir, exist_ok=True)
        # Purge des fichiers laissés par un kill en plein téléchargement (ex: app.sh
        # stop/restart envoie un SIGKILL) : le finally de _try_dispatch ne s'exécute pas
        # dans ce cas, et ces fichiers orphelins s'accumulent sinon indéfiniment. Le flock
        # ci-dessus garantit qu'aucune autre instance de l'agent ne possède ces fichiers.
        for stale_file in os.listdir(downloads_dir):
            stale_path = os.path.join(downloads_dir, stale_file)
            if os.path.isfile(stale_path):
                os.remove(stale_path)

        if args.loop:
            logger.info("Démarrage de l'agent en mode boucle (tick toutes les %ds).", TICK_INTERVAL_SECONDS)
            while True:
                try:
                    _execute_tick(hub, moonraker, state_path, downloads_dir, logger)
                except Exception:
                    # Une erreur pendant un tick ne doit jamais arrêter le process : en mode
                    # boucle, il n'y a personne (pas de cron) pour le relancer si on sort ici.
                    logger.error("Erreur inattendue pendant un tick, la boucle continue.", exc_info=True)
                time.sleep(TICK_INTERVAL_SECONDS)
        else:
            _execute_tick(hub, moonraker, state_path, downloads_dir, logger)
    except Exception:
        logger.error("Erreur inattendue pendant le tick.", exc_info=True)
    finally:
        fcntl.flock(lock_file, fcntl.LOCK_UN)
        lock_file.close()


if __name__ == "__main__":
    main(sys.argv[1:])
