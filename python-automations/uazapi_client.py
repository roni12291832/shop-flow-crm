from __future__ import annotations
"""
Cliente WhatsApp — adaptador para o conector Baileys interno (localhost:3001).

Mantém a mesma assinatura de métodos do cliente UAZAPI anterior para que todos
os chamadores (webhooks, followup, campaigns, crons, etc.) funcionem sem alteração.

Os parâmetros api_url / api_token / instance_name / instance_token são aceitos
mas ignorados — todas as chamadas vão para http://localhost:3001.
"""
import httpx
import asyncio
import random
import logging
from config import get_settings

logger = logging.getLogger("wa_connector")

CONNECTOR_BASE = "http://localhost:3001"

_HTTP_ERROR_MAP = {
    400: ("bad_request",   "Requisição inválida"),
    404: ("not_found",     "Número não encontrado no WhatsApp"),
    429: ("rate_limit",    "Limite de envios atingido — aguardar antes de continuar"),
    500: ("server_error",  "Erro interno do conector"),
    503: ("unavailable",   "WhatsApp não conectado — escaneie o QR code"),
}


def _structured_error(e: httpx.HTTPStatusError, phone: str = "") -> dict:
    code, description = _HTTP_ERROR_MAP.get(
        e.response.status_code,
        ("http_error", f"HTTP {e.response.status_code}"),
    )
    logger.error("wa_connector %s para %s: %s", code, phone, e.response.text[:200])
    return {
        "error":       description,
        "error_code":  code,
        "status_code": e.response.status_code,
    }


class UazapiClient:
    """Thin wrapper sobre o conector Baileys interno. Interface idêntica ao cliente UAZAPI."""

    # ─── Envio de mensagens ───────────────────────────────────────────────

    async def send_text(
        self,
        api_url: str = "",
        api_token: str = "",
        instance_name: str = "",
        phone: str = "",
        message: str = "",
        instance_token: str | None = None,
    ) -> dict:
        url = f"{CONNECTOR_BASE}/send/text"
        payload = {"number": self._format_phone(phone), "text": message}
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                logger.info("Mensagem enviada para %s", phone)
                return resp.json()
            except httpx.HTTPStatusError as e:
                return _structured_error(e, phone)
            except Exception as e:
                logger.error("Erro ao enviar para %s: %s", phone, e)
                return {"error": str(e), "error_code": "network_error"}

    async def send_media(
        self,
        api_url: str = "",
        api_token: str = "",
        phone: str = "",
        media_type: str = "",
        file: str = "",
        text: str | None = None,
        doc_name: str | None = None,
        instance_token: str | None = None,
        **kwargs,
    ) -> dict:
        url = f"{CONNECTOR_BASE}/send/media"
        payload: dict = {
            "number":    self._format_phone(phone),
            "mediaType": media_type,
            "file":      file,
        }
        if text:
            payload["text"] = text
        if doc_name:
            payload["doc_name"] = doc_name
        async with httpx.AsyncClient(timeout=60) as client:
            try:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                return resp.json()
            except Exception as e:
                logger.error("Erro ao enviar mídia (%s) para %s: %s", media_type, phone, e)
                return {"error": str(e), "error_code": "network_error"}

    async def send_location(
        self,
        api_url: str = "",
        api_token: str = "",
        phone: str = "",
        latitude: float = 0.0,
        longitude: float = 0.0,
        name: str | None = None,
        address: str | None = None,
        instance_token: str | None = None,
        **kwargs,
    ) -> dict:
        # Conector Baileys não implementa /send/location — fallback para texto
        text = f"📍 Localização: {name or ''}\n{address or ''}\nhttps://maps.google.com/?q={latitude},{longitude}"
        return await self.send_text(phone=phone, message=text)

    async def delete_message(
        self,
        api_url: str = "",
        api_token: str = "",
        message_id: str = "",
        instance_token: str | None = None,
    ) -> dict:
        logger.info("delete_message: não suportado pelo conector interno, ignorado")
        return {"success": True, "skipped": True}

    async def delete_chat(
        self,
        api_url: str = "",
        api_token: str = "",
        phone: str = "",
        delete_chat_db: bool = True,
        delete_messages_db: bool = True,
        delete_chat_whatsapp: bool = True,
        instance_token: str | None = None,
    ) -> dict:
        logger.info("delete_chat: não suportado pelo conector interno, ignorado")
        return {"success": True, "skipped": True}

    async def delete_instance(
        self,
        api_url: str = "",
        api_token: str = "",
        instance_token: str | None = None,
    ) -> dict:
        logger.info("delete_instance: não suportado pelo conector interno, ignorado")
        return {"success": True, "skipped": True}

    async def send_bulk_campaign(
        self,
        api_url: str = "",
        api_token: str = "",
        instance_name: str = "",
        contacts: list[dict] | None = None,
        messages: list[str] | None = None,
        min_delay: int = 15,
        max_delay: int = 60,
        instance_token: str | None = None,
    ) -> dict:
        contacts = contacts or []
        messages = messages or []
        if len(messages) < 15:
            return {
                "error": "OBRIGATÓRIO: envie pelo menos 15 variações de mensagem para evitar bloqueio do WhatsApp."
            }

        results: dict = {"sent": 0, "failed": 0, "errors": []}
        shuffled_contacts = contacts.copy()
        random.shuffle(shuffled_contacts)

        for i, contact in enumerate(shuffled_contacts):
            phone = contact.get("phone", "")
            if not phone:
                results["failed"] += 1
                continue

            msg_template = random.choice(messages)
            personalized_msg = self._personalize_message(msg_template, contact)

            resp = await self.send_text(phone=phone, message=personalized_msg)
            if "error" in resp:
                results["failed"] += 1
                results["errors"].append({"phone": phone, "error": resp["error"]})
                error_code = resp.get("error_code", "")
                if error_code == "rate_limit":
                    logger.warning("Rate limit — campanha interrompida após %d envios", results["sent"])
                    results["errors"].append({"phone": "SISTEMA", "error": "Rate limit atingido — campanha pausada"})
                    break
            else:
                results["sent"] += 1

            if i < len(shuffled_contacts) - 1:
                delay = random.uniform(min_delay, max_delay)
                logger.info("Aguardando %.1fs antes do próximo envio...", delay)
                await asyncio.sleep(delay)

        return results

    # ─── Webhook (no-op — conector usa URL interna fixa) ─────────────────

    async def set_webhook(
        self,
        api_url: str = "",
        api_token: str = "",
        instance_name: str = "",
        webhook_url: str = "",
        instance_token: str | None = None,
    ) -> dict:
        logger.info("set_webhook: conector interno usa URL fixa, ignorado")
        return {"success": True, "skipped": True}

    # ─── Conversas (retorna vazio — Baileys não persiste histórico) ──────

    async def get_chats(
        self, api_url: str = "", instance_token: str = "", count: int = 50
    ) -> list[dict]:
        return []

    async def get_messages(
        self, api_url: str = "", instance_token: str = "", chat_id: str = "", count: int = 30
    ) -> list[dict]:
        return []

    # ─── Status da instância ──────────────────────────────────────────────

    async def get_instance_status(
        self,
        api_url: str = "",
        api_token: str = "",
        instance_name: str = "",
        instance_token: str | None = None,
    ) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(f"{CONNECTOR_BASE}/instance/status")
                return resp.json()
            except Exception as e:
                return {"error": str(e), "connected": False}

    # ─── Helpers ──────────────────────────────────────────────────────────

    def _format_phone(self, phone: str) -> str:
        cleaned = "".join(c for c in phone if c.isdigit())
        if not cleaned.startswith("55"):
            cleaned = "55" + cleaned
        return cleaned

    def _personalize_message(self, template: str, contact: dict) -> str:
        replacements = {
            "{nome}":     contact.get("name", "Cliente"),
            "{telefone}": contact.get("phone", ""),
            "{email}":    contact.get("email", ""),
            "{origem}":   contact.get("origin", ""),
        }
        result = template
        for key, value in replacements.items():
            result = result.replace(key, str(value))
        return result

    # ─── Normalização (mantida para compatibilidade) ──────────────────────

    def _normalize_chat(self, raw: dict) -> dict:
        jid = raw.get("remoteJid") or raw.get("id") or raw.get("jid") or ""
        phone = jid.replace("@s.whatsapp.net", "").replace("@c.us", "").replace("@lid", "")
        return {
            "id": jid,
            "phone": phone,
            "name": raw.get("name") or raw.get("pushName") or f"WhatsApp {phone[-4:]}",
            "last_message": "",
            "last_message_at": None,
            "unread_count": 0,
            "is_group": "@g.us" in jid,
        }

    def _normalize_message(self, raw: dict) -> dict:
        key = raw.get("key", {}) or {}
        msg_obj = raw.get("message", {}) or {}
        text = (
            msg_obj.get("conversation", "")
            or (msg_obj.get("extendedTextMessage") or {}).get("text", "")
            or raw.get("body", "")
            or ""
        ) if isinstance(msg_obj, dict) else str(msg_obj)
        return {
            "id":        key.get("id") or raw.get("id") or "",
            "from_me":   key.get("fromMe", False),
            "text":      text,
            "timestamp": raw.get("messageTimestamp") or raw.get("timestamp"),
            "status":    raw.get("status") or None,
            "type":      list(msg_obj.keys())[0] if isinstance(msg_obj, dict) and msg_obj else "text",
        }


# Instância global — mesmo nome para compatibilidade total com todos os imports
uazapi = UazapiClient()
