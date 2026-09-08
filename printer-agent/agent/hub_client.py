import requests


class HubClientError(Exception):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


class HubClient:
    def __init__(self, base_url, printer_id, api_key, timeout=10):
        self.base_url = base_url.rstrip("/")
        self.headers = {"x-printer-id": printer_id, "x-api-key": api_key}
        self.timeout = timeout

    def _request(self, method, path, **kwargs):
        url = f"{self.base_url}{path}"
        try:
            response = requests.request(method, url, headers=self.headers, timeout=self.timeout, **kwargs)
        except requests.RequestException as exc:
            raise HubClientError(f"Erreur réseau vers le hub ({method} {path}): {exc}") from exc

        if response.status_code >= 400:
            try:
                message = response.json().get("error", response.text)
            except ValueError:
                message = response.text
            raise HubClientError(message, status_code=response.status_code)

        return response

    def heartbeat(self):
        response = self._request("GET", "/heartbeat")
        return response.json().get("cancelRequested", False)

    def get_next_job(self):
        response = self._request("GET", "/next-job")
        return response.json().get("data")

    def download_job_file(self, job_id, dest_path):
        response = self._request("GET", f"/jobs/{job_id}/file", stream=True)
        try:
            with open(dest_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
        except (requests.RequestException, OSError) as exc:
            raise HubClientError(f"Échec de l'écriture du fichier téléchargé: {exc}") from exc
        finally:
            response.close()

    def update_job_status(self, job_id, status, error_message=None):
        payload = {"status": status}
        if error_message is not None:
            payload["errorMessage"] = error_message
        self._request("POST", f"/jobs/{job_id}/status", json=payload)
