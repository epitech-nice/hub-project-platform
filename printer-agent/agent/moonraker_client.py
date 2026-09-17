import json
import logging
import os
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

    def upload_file(self, file_path, filename):
        """Upload un fichier depuis le disque local vers Moonraker, sans démarrer l'impression
        (print=false) — voir start_print(), appelé séparément après. Remplace l'ancien
        upload_and_start_print (spec 2026-09-11, MMU_TTG_MAP remplacé par l'écriture directe du
        sidecar .acm que gklib consulte réellement) : upload et démarrage sont désormais deux
        appels distincts, pour pouvoir uploader le .acm corrigé entre les deux."""
        url = f"{self.base_url}/server/files/upload"
        try:
            with open(file_path, "rb") as f:
                files = {"file": (filename, f, "text/plain")}
                data = {"root": "gcodes", "print": "false"}
                response = requests.post(url, files=files, data=data, timeout=self.upload_timeout)
        except (requests.RequestException, OSError) as exc:
            raise MoonrakerClientError(f"Échec de l'upload de {filename} vers Moonraker: {exc}") from exc

        if response.status_code >= 400:
            raise MoonrakerClientError(
                f"Moonraker a refusé l'upload de {filename} (HTTP {response.status_code}): {response.text}"
            )

    # Timeout dédié à upload_acm : plus long que self.timeout (prévu pour de légers appels de
    # statut) car cet upload suit immédiatement un upload_file potentiellement long sur ce CPU
    # mono-cœur — réutiliser self.timeout risquerait le même genre de timeout prématuré que
    # celui qui a motivé upload_timeout (voir __init__). Bien plus court qu'upload_timeout en
    # revanche : le sidecar ne pèse que quelques centaines d'octets de JSON, pas besoin de
    # tolérer plusieurs minutes avant d'échouer sur une connexion bloquée.
    ACM_UPLOAD_TIMEOUT_SECONDS = 30

    def upload_acm(self, filename, mapping):
        """Construit et upload le sidecar <basename>.acm que gklib lit directement pour le
        mapping tool→gate d'un fichier multi-couleurs, en écrasant celui auto-généré par
        Moonraker depuis les métadonnées slicer — voir spec 2026-09-11 (MMU_TTG_MAP confirmé
        sans effet réel sur gklib par des tests matériel réels le 2026-09-11). mapping : liste
        de dicts {paint_index, ams_index, paint_color: [r,g,b], ams_color: [r,g,b],
        material_type}, produite par _build_acm_mapping (agent/main.py)."""
        acm_filename = os.path.splitext(filename)[0] + ".acm"
        content = json.dumps({"use_ams": True, "ams_box_mapping": mapping}).encode("utf-8")
        url = f"{self.base_url}/server/files/upload"
        try:
            files = {"file": (acm_filename, content, "application/json")}
            data = {"root": "gcodes", "print": "false"}
            response = requests.post(url, files=files, data=data, timeout=self.ACM_UPLOAD_TIMEOUT_SECONDS)
        except requests.RequestException as exc:
            raise MoonrakerClientError(f"Échec de l'upload de {acm_filename} vers Moonraker: {exc}") from exc

        if response.status_code >= 400:
            raise MoonrakerClientError(
                f"Moonraker a refusé l'upload de {acm_filename} (HTTP {response.status_code}): {response.text}"
            )

    def set_ttg_map(self, mapping):
        """Assigne la table tool→gate côté firmware (`MMU_TTG_MAP MAP=g0,g1,g2,g3`) — appel gcode
        séparé, envoyé juste avant start_print(). Nécessaire en complément de upload_acm() : le
        chemin de dispatch MQTT (kobra.py::mqtt_print_file, le chemin normal en usage réel avec
        le mode LAN activé) construit son propre print_data sans jamais lire le sidecar .acm sur
        disque — mmu_ace.py::patch_print_data y calcule le mapping tool→gate exclusivement depuis
        self.ace.ttg_map (voir spec 2026-09-17). mapping : liste complète d'un gate par index de
        tool (voir _build_ttg_map, agent/main.py), jamais une liste partielle."""
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

    # Fenêtre de corrélation pour _get_recent_gcode_error : au-delà, une entrée est considérée
    # trop ancienne pour être liée à l'échec en cours (voir docstring de la méthode).
    RECENT_GCODE_ERROR_WINDOW_SECONDS = 30

    def _get_recent_gcode_error(self):
        """Best-effort : repli de start_print quand _extract_error_message ne trouve pas de
        error.message exploitable dans la réponse de /printer/print/start (absent, ou forme de
        réponse inattendue). Va chercher la vraie raison de l'échec dans server/gcode_store
        (journal des dernières commandes/réponses gcode Klipper), la seule autre source qui
        l'expose — confirmé en direct sur l'imprimante (2026-09-11, échec réel : "unknown
        filament in extruder" retrouvé dans gcode_store).

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

    def start_print(self, filename):
        """Démarre l'impression d'un fichier déjà uploadé (POST /printer/print/start). En cas
        d'échec, le corps de réponse contient directement le message réel de gklib dans
        error.message (confirmé en direct sur l'imprimante le 2026-09-11, ex: "unknown
        filament in extruder") — utilisé en priorité ; repli sur l'enrichissement gcode_store
        (_get_recent_gcode_error) si absent ou de forme inattendue.

        Utilise upload_timeout (pas le timeout court des status checks) : bug réel en prod
        (2026-09-16) — la requête ne répond qu'une fois la séquence physique de démarrage
        terminée côté gklib (coupe filament + déroulement + chauffe buse/plateau + homing),
        qui peut largement dépasser 10s (chauffe seule observée à plus d'1 minute). Un timeout
        trop court fait lever un MoonrakerClientError et reporter le job 'failed' au hub alors
        que l'impression démarre en réalité normalement — même classe de bug que celui déjà
        documenté sur upload_timeout (voir son commentaire dans __init__)."""
        url = f"{self.base_url}/printer/print/start"
        try:
            response = requests.post(url, json={"filename": filename}, timeout=self.upload_timeout)
        except requests.RequestException as exc:
            raise MoonrakerClientError(f"Moonraker injoignable (print/start): {exc}") from exc

        if response.status_code < 400:
            return

        detail = self._extract_error_message(response) or self._get_recent_gcode_error()
        message = f"Moonraker a refusé le démarrage de l'impression (HTTP {response.status_code})"
        if detail:
            message += f" — {detail}"
        raise MoonrakerClientError(message)

    @staticmethod
    def _extract_error_message(response):
        try:
            return response.json()["error"]["message"]
        except (ValueError, KeyError, TypeError):
            return None
