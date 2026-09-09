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
            print_started = response.json()["result"]["print_started"]
        except (KeyError, ValueError, TypeError) as exc:
            raise MoonrakerClientError(f"Réponse Moonraker inattendue à l'upload: {exc}") from exc

        if not print_started:
            raise MoonrakerClientError(
                "Moonraker a accepté le fichier mais n'a pas démarré l'impression (print_started=false)"
            )

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
        except (KeyError, ValueError, TypeError) as exc:
            raise MoonrakerClientError(f"Réponse Moonraker inattendue (mmu): {exc}") from exc

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
        return gates
