from __future__ import annotations
"""
Stub sem neonize — compatibilidade de import apenas.
WhatsApp gerenciado via UAZAPI GO V2 (nexaflow.uazapi.com).
"""


class WhatsAppClient:
    """Stub vazio — sem neonize. Gerenciamento via UAZAPI."""
    connected: bool = False
    state: str = "disconnected"
    last_error: str | None = None
    qr_base64: str | None = None

    def get_status(self) -> dict:
        return {"connected": False, "state": "disconnected", "hasQr": False}

    def get_qr(self) -> dict:
        return {"qr": None, "connected": False, "state": "disconnected"}

    def start(self) -> None:
        pass

    def reconnect(self) -> None:
        pass

    def disconnect(self) -> None:
        pass

    def send_text(self, phone: str, message: str) -> bool:
        return False


wa_client = WhatsAppClient()
