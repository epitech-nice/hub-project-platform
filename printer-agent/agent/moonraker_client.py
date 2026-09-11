import logging
import time

import requests


class MoonrakerClientError(Exception):
    pass


class MoonrakerClient:
    def __init__(self, base_url, timeout=10, upload_timeout=300):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        # Écrire + parser un gros gcode sur le CPU mono-cœur ARMv7 de ces imprimantes peut
        # largement dépasser le timeout des appels de statut légers (get_print_stats) — un
        # gcode de 6h a fait timeout à l'upload en prod avec un timeout partagé de 10s.
        self.upload_timeout = upload_timeout

    def upload_and_start_print(self, file_path, filename):
        url = f"{self.base_url}/server/files/upload"
        try:
            with open(file_path, "rb") as f:
                files = {"file": (filename, f, "text/plain")}
                # root=gcodes : dossier standard Moonraker pour les fichiers imprimables.
                # print=true : démarre l'impression immédiatement après l'upload, en un seul
                # appel plutôt que upload + POST /printer/print/start séparé.
                data = {"root": "gcodes", "print": "true"}
                response = requests.post(url, files=files, data=data, timeout=self.upload_timeout)
        except (requests.RequestException, OSError) as exc:
            raise MoonrakerClientError(f"Échec de l'upload vers Moonraker: {exc}") from exc

        if response.status_code >= 400:
            raise MoonrakerClientError(
                f"Moonraker a refusé l'upload (HTTP {response.status_code}): {response.text}"
            )

        try:
            # Contrairement à printer/objects/query (result.status.*), la réponse réelle de
            # /server/files/upload sur ce firmware Rinkhals/GoKlipper n'est PAS enveloppée dans
            # "result" : {"action": ..., "item": {...}, "print_started": bool, "print_queued":
            # bool} directement à la racine — vérifié par un upload de test (print=false) en
            # direct sur l'imprimante. L'ancien code lisait ["result"]["print_started"], qui
            # levait systématiquement un KeyError('result') : le job était rapporté "failed" au
            # hub alors que l'impression démarrait réellement (le KeyError survient après l'appel
            # HTTP, qui avait déjà réussi côté Moonraker).
            print_started = response.json()["print_started"]
        except (KeyError, ValueError, TypeError) as exc:
            raise MoonrakerClientError(f"Réponse Moonraker inattendue à l'upload: {exc}") from exc

        if not print_started:
            detail = self._get_recent_gcode_error()
            message = "Moonraker a accepté le fichier mais n'a pas démarré l'impression (print_started=false)"
            if detail:
                message += f" — {detail}"
            raise MoonrakerClientError(message)

    # Fenêtre de corrélation pour _get_recent_gcode_error : au-delà, une entrée est considérée
    # trop ancienne pour être liée à l'échec en cours (voir docstring de la méthode).
    RECENT_GCODE_ERROR_WINDOW_SECONDS = 30

    def _get_recent_gcode_error(self):
        """Best-effort : va chercher la vraie raison d'un échec de démarrage d'impression dans
        server/gcode_store (journal des dernières commandes/réponses gcode Klipper), la seule
        source qui l'expose. /server/files/upload avale l'exception réelle de start_print côté
        Moonraker (file_manager.py::_finish_gcode_upload fait `except self.server.error: pass`)
        et ne renvoie qu'un booléen print_started=false sans aucun détail — confirmé en direct
        sur l'imprimante (2026-09-11, échec réel : "unknown filament in extruder" invisible dans
        la réponse d'upload, présent uniquement dans gcode_store).

        Ne retient une entrée que si elle date de moins de RECENT_GCODE_ERROR_WINDOW_SECONDS —
        sinon, si Klipper n'a rien échoté du tout pour CETTE tentative (déjà en shutdown/occupé,
        cas déjà couvert par ailleurs), la dernière erreur du store pourrait être une erreur
        ancienne et sans rapport (une commande manuelle d'un opérateur, un appel MMU_TTG_MAP
        précédent...), attribuée à tort à l'échec courant.

        Ne doit jamais lever : un échec de cette recherche d'enrichissement (store indisponible,
        forme de réponse différente sur un autre firmware, etc.) ne doit pas masquer/remplacer
        l'erreur déjà en cours de levée par l'appelant — on retombe sur le message générique, en
        laissant une trace en debug pour ne pas perdre silencieusement ce signal.
        """
        url = f"{self.base_url}/server/gcode_store"
        try:
            response = requests.get(url, params={"count": 5}, timeout=self.timeout)
            entries = response.json()["result"]["gcode_store"]
            cutoff = time.time() - self.RECENT_GCODE_ERROR_WINDOW_SECONDS
            for entry in reversed(entries):
                if entry.get("time", 0) < cutoff:
                    break
                message = entry.get("message") or ""
                if entry.get("type") == "response" and "error" in message.lower():
                    return message
        except Exception as exc:
            logging.getLogger("printer_agent").debug(
                "Échec de l'enrichissement d'erreur via gcode_store (non bloquant): %s", exc
            )
        return None

    def get_print_stats(self):
        url = f"{self.base_url}/printer/objects/query"
        try:
            response = requests.get(url, params={"print_stats": ""}, timeout=self.timeout)
        except requests.RequestException as exc:
            raise MoonrakerClientError(f"Moonraker injoignable: {exc}") from exc

        if response.status_code >= 400:
            raise MoonrakerClientError(f"Erreur Moonraker (HTTP {response.status_code}): {response.text}")

        try:
            print_stats = response.json()["result"]["status"]["print_stats"]
        except (KeyError, ValueError, TypeError) as exc:
            raise MoonrakerClientError(f"Réponse Moonraker inattendue: {exc}") from exc

        if not isinstance(print_stats, dict):
            raise MoonrakerClientError(f"print_stats inattendu dans la réponse Moonraker: {print_stats!r}")

        return {"state": print_stats.get("state"), "message": print_stats.get("message", "")}

    def cancel_print(self):
        url = f"{self.base_url}/printer/print/cancel"
        try:
            response = requests.post(url, timeout=self.timeout)
        except requests.RequestException as exc:
            raise MoonrakerClientError(f"Moonraker injoignable lors de l'annulation: {exc}") from exc

        if response.status_code >= 400:
            raise MoonrakerClientError(
                f"Erreur Moonraker à l'annulation (HTTP {response.status_code}): {response.text}"
            )

    def get_mmu_status(self):
        url = f"{self.base_url}/printer/objects/query"
        try:
            response = requests.get(url, params={"mmu": ""}, timeout=self.timeout)
        except requests.RequestException as exc:
            raise MoonrakerClientError(f"Moonraker injoignable (mmu): {exc}") from exc

        if response.status_code >= 400:
            raise MoonrakerClientError(f"Erreur Moonraker (mmu, HTTP {response.status_code}): {response.text}")

        try:
            mmu = response.json()["result"]["status"]["mmu"]
            num_gates = mmu["num_gates"]
            gate_status = mmu["gate_status"]
            gate_material = mmu["gate_material"]
            gate_color = mmu["gate_color"]

            if not isinstance(num_gates, int):
                raise MoonrakerClientError(f"num_gates inattendu dans la réponse Moonraker (mmu): {num_gates!r}")

            gates = []
            for i in range(num_gates):
                gates.append(
                    {
                        "gate": i,
                        "material": gate_material[i] if i < len(gate_material) else "",
                        "color": gate_color[i] if i < len(gate_color) else "",
                        "empty": not bool(gate_status[i]) if i < len(gate_status) else True,
                    }
                )
        except (KeyError, ValueError, TypeError, IndexError) as exc:
            raise MoonrakerClientError(f"Réponse Moonraker inattendue (mmu): {exc}") from exc

        return gates

    def set_ttg_map(self, mapping):
        """Assigne la table tool→gate (MMU_TTG_MAP MAP=g0,g1,g2,g3) — appel séparé, envoyé
        AVANT upload_and_start_print, jamais comme contenu du fichier gcode : le pré-chargement
        automatique du firmware (patch_print_data/_auto_feed_at_print_start, voir spec
        2026-09-10, section spike) consulte l'état courant de ttg_map au moment de l'appel qui
        démarre l'impression, pas en lisant le gcode ligne par ligne — une commande MMU_TTG_MAP
        injectée en tête de fichier arriverait trop tard."""
        url = f"{self.base_url}/printer/gcode/script"
        script = f"MMU_TTG_MAP MAP={','.join(str(g) for g in mapping)}"
        try:
            response = requests.post(url, params={"script": script}, timeout=self.timeout)
        except requests.RequestException as exc:
            raise MoonrakerClientError(f"Moonraker injoignable (MMU_TTG_MAP): {exc}") from exc

        if response.status_code >= 400:
            raise MoonrakerClientError(
                f"Erreur Moonraker (MMU_TTG_MAP, HTTP {response.status_code}): {response.text}"
            )
