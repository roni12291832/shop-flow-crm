from __future__ import annotations
"""
Cliente para a API da UAZAPI GO V2.
Documentação: https://docs.uazapi.com/

Autenticação: header "token" com o token da instância.
Base URL: configurada por instância no banco (ex: https://nexaflow.uazapi.com)

CORREÇÕES v2:
- send_text:    POST /send/text                  (era /message/sendText/{instance})
- get_chats:    POST /chat/find                  (era GET /chats)
- get_messages: POST /message/find               (era GET /messages/{chat_id})
- set_webhook:  POST /webhook                    (correto, mantido)
"""
import httpx
import asyncio
import random
import logging

logger = logging.getLogger("uazapi")


class UazapiClient:
    """Cliente assíncrono para a UAZAPI GO V2."""

    # ─── Envio de mensagens ───────────────────────────────────────────────

    async def send_text(
        self,
        api_url: str,
        api_token: str,
        instance_name: str,
        phone: str,
        message: str,
        instance_token: str | None = None,
    ) -> dict:
        """
        Envia mensagem de texto.
        Endpoint UAZAPI GO V2: POST /send/text
        Header: token (instance_token preferencial, fallback api_token)
        O campo 'number' aceita: número internacional, JID com @s.whatsapp.net ou @lid
        """
        url = f"{api_url.rstrip('/')}/send/text"
        token = instance_token or api_token
        headers = {
            "Content-Type": "application/json",
            "token": token,
        }
        payload = {
            "number": self._format_phone(phone),
            "text": message,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                logger.info(f"Mensagem enviada para {phone}")
                return resp.json()
            except httpx.HTTPStatusError as e:
                logger.error(
                    f"Erro HTTP ao enviar para {phone}: {e.response.status_code} - {e.response.text}"
                )
                return {"error": str(e)}
            except Exception as e:
                logger.error(f"Erro ao enviar para {phone}: {e}")
                return {"error": str(e)}

    async def send_bulk_campaign(
        self,
        api_url: str,
        api_token: str,
        instance_name: str,
        contacts: list[dict],
        messages: list[str],
        min_delay: int = 15,
        max_delay: int = 60,
        instance_token: str | None = None,
    ) -> dict:
        """
        Disparo em massa anti-bloqueio.
        - contacts: lista de {"phone": "5511...", "name": "João", ...}
        - messages: lista com pelo menos 15 variações de mensagem
        - Cada contato recebe 1 mensagem aleatória com delay aleatório entre envios
        """
        if len(messages) < 15:
            return {
                "error": "OBRIGATÓRIO: envie pelo menos 15 variações de mensagem para evitar bloqueio do WhatsApp."
            }

        results = {"sent": 0, "failed": 0, "errors": []}
        shuffled_contacts = contacts.copy()
        random.shuffle(shuffled_contacts)

        for i, contact in enumerate(shuffled_contacts):
            phone = contact.get("phone", "")
            if not phone:
                results["failed"] += 1
                continue

            msg_template = random.choice(messages)
            personalized_msg = self._personalize_message(msg_template, contact)

            resp = await self.send_text(
                api_url, api_token, instance_name, phone, personalized_msg, instance_token
            )
            if "error" in resp:
                results["failed"] += 1
                results["errors"].append({"phone": phone, "error": resp["error"]})
            else:
                results["sent"] += 1

            if i < len(shuffled_contacts) - 1:
                delay = random.uniform(min_delay, max_delay)
                logger.info(f"Aguardando {delay:.1f}s antes do próximo envio...")
                await asyncio.sleep(delay)

        return results

    # ─── Webhook ──────────────────────────────────────────────────────────

    async def set_webhook(
        self,
        api_url: str,
        api_token: str,
        instance_name: str,
        webhook_url: str,
        instance_token: str | None = None,
    ) -> dict:
        """
        Configura URL do webhook na UAZAPI GO V2.
        Endpoint: POST /webhook
        Modo simples: sem 'action' nem 'id' — cria/atualiza automaticamente.
        Header: token (instance_token)
        """
        url = f"{api_url.rstrip('/')}/webhook"
        token = instance_token or api_token
        headers = {
            "token": token,
            "Content-Type": "application/json",
        }
        # Modo simples recomendado pela UAZAPI GO V2
        payload = {
            "enabled": True,
            "url": webhook_url,
            "events": ["messages", "connection", "chats"],
            "excludeMessages": ["wasSentByApi"],
        }
        async with httpx.AsyncClient(timeout=15) as client:
            try:
                resp = await client.post(url, json=payload, headers=headers)
                logger.info(f"Webhook configurado (status {resp.status_code}): {resp.text[:200]}")
                return resp.json()
            except Exception as e:
                logger.error(f"Erro ao configurar webhook: {e}")
                return {"error": str(e)}

    # ─── Conversas ────────────────────────────────────────────────────────

    async def get_chats(
        self, api_url: str, instance_token: str, count: int = 50
    ) -> list[dict]:
        """
        Retorna as últimas conversas da instância.
        Endpoint UAZAPI GO V2: POST /chat/find
        Body: { "count": N }
        Header: token: <instance_token>
        """
        url = f"{api_url.rstrip('/')}/chat/find"
        headers = {
            "token": instance_token,
            "Content-Type": "application/json",
        }
        payload = {"limit": count}

        async with httpx.AsyncClient(timeout=20) as client:
            try:
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                logger.debug(f"get_chats raw response type={type(data)}: {str(data)[:300]}")

                if isinstance(data, list):
                    raw_chats = data
                elif isinstance(data, dict):
                    raw_chats = (
                        data.get("chats")
                        or data.get("data")
                        or data.get("result")
                        or []
                    )
                else:
                    raw_chats = []

                return [self._normalize_chat(c) for c in raw_chats]

            except httpx.HTTPStatusError as e:
                logger.error(
                    "Erro HTTP ao buscar chats: %s — %s",
                    e.response.status_code,
                    e.response.text,
                )
                return []
            except Exception as e:
                logger.error("Erro ao buscar chats: %s", e)
                return []

    # ─── Mensagens ────────────────────────────────────────────────────────

    async def get_messages(
        self, api_url: str, instance_token: str, chat_id: str, count: int = 30
    ) -> list[dict]:
        """
        Retorna as mensagens de uma conversa.
        Endpoint UAZAPI GO V2: POST /message/find
        Body: { "chatId": "<jid>", "count": N }
        Header: token: <instance_token>
        """
        # Garante o formato JID correto
        if "@" not in chat_id:
            chat_id = f"{chat_id}@s.whatsapp.net"

        url = f"{api_url.rstrip('/')}/message/find"
        headers = {
            "token": instance_token,
            "Content-Type": "application/json",
        }
        payload = {
            "chatid": chat_id,
            "limit": count,
        }

        async with httpx.AsyncClient(timeout=20) as client:
            try:
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                logger.debug(
                    f"get_messages({chat_id}) raw response type={type(data)}: {str(data)[:300]}"
                )

                if isinstance(data, list):
                    raw_msgs = data
                elif isinstance(data, dict):
                    raw_msgs = (
                        data.get("messages")
                        or data.get("data")
                        or data.get("result")
                        or []
                    )
                else:
                    raw_msgs = []

                return [self._normalize_message(m) for m in raw_msgs]

            except httpx.HTTPStatusError as e:
                logger.error(
                    "Erro HTTP ao buscar mensagens de %s: %s — %s",
                    chat_id,
                    e.response.status_code,
                    e.response.text,
                )
                return []
            except Exception as e:
                logger.error("Erro ao buscar mensagens de %s: %s", chat_id, e)
                return []

    # ─── Normalização ─────────────────────────────────────────────────────

    def _normalize_chat(self, raw: dict) -> dict:
        """
        Normaliza o objeto de chat da UAZAPI GO V2 para formato padrão.
        A UAZAPI GO V2 usa 'remoteJid' como campo principal de identificação.
        """
        jid = (
            raw.get("remoteJid")
            or raw.get("id")
            or raw.get("jid")
            or raw.get("chatId")
            or ""
        )
        phone = jid.replace("@s.whatsapp.net", "").replace("@c.us", "").replace("@lid", "")

        # last_message pode ser objeto ou string
        last_msg_raw = raw.get("lastMessage") or raw.get("lastMsg") or {}
        if isinstance(last_msg_raw, dict):
            msg_obj = last_msg_raw.get("message", {}) or {}
            if isinstance(msg_obj, dict):
                last_message_text = (
                    msg_obj.get("conversation", "")
                    or msg_obj.get("extendedTextMessage", {}).get("text", "")
                    or last_msg_raw.get("body", "")
                    or last_msg_raw.get("text", "")
                    or raw.get("preview", "")
                    or ""
                )
            else:
                last_message_text = str(msg_obj)
        else:
            last_message_text = str(last_msg_raw) if last_msg_raw else raw.get("preview", "")

        return {
            "id": jid,
            "phone": phone,
            "name": (
                raw.get("name")
                or raw.get("pushName")
                or raw.get("notifyName")
                or raw.get("verifiedName")
                or f"WhatsApp {phone[-4:]}" if phone else "Desconhecido"
            ),
            "last_message": last_message_text,
            "last_message_at": (
                raw.get("lastMessageAt")
                or raw.get("conversationTimestamp")
                or raw.get("t")
                or raw.get("timestamp")
                or None
            ),
            "unread_count": raw.get("unreadCount") or raw.get("unread") or 0,
            "is_group": "@g.us" in jid,
        }

    def _normalize_message(self, raw: dict) -> dict:
        """
        Normaliza o objeto de mensagem da UAZAPI GO V2 para formato padrão.
        """
        key = raw.get("key", {}) or {}
        msg_obj = raw.get("message", {}) or {}

        if isinstance(msg_obj, str):
            text = msg_obj
        else:
            text = (
                msg_obj.get("conversation", "")
                or (msg_obj.get("extendedTextMessage") or {}).get("text", "")
                or (msg_obj.get("imageMessage") or {}).get("caption", "")
                or (msg_obj.get("videoMessage") or {}).get("caption", "")
                or raw.get("body", "")
                or raw.get("text", "")
                or ""
            )

        return {
            "id": key.get("id") or raw.get("id") or raw.get("messageid") or "",
            "from_me": key.get("fromMe", False) or raw.get("fromMe", False),
            "text": text,
            "timestamp": (
                raw.get("messageTimestamp")
                or raw.get("t")
                or raw.get("timestamp")
            ),
            "status": raw.get("status") or raw.get("ack") or None,
            "type": (
                list(msg_obj.keys())[0]
                if msg_obj and isinstance(msg_obj, dict) and msg_obj.keys()
                else raw.get("messageType", "text")
            ),
        }

    # ─── Status da instância ──────────────────────────────────────────────

    async def get_instance_status(
        self,
        api_url: str,
        api_token: str,
        instance_name: str,
        instance_token: str | None = None,
    ) -> dict:
        """
        Verifica status de conexão da instância.
        Endpoint UAZAPI GO V2: GET /instance/status
        Header: token
        """
        url = f"{api_url.rstrip('/')}/instance/status"
        token = instance_token or api_token
        async with httpx.AsyncClient(timeout=15) as client:
            try:
                resp = await client.get(url, headers={"token": token})
                return resp.json()
            except Exception as e:
                return {"error": str(e)}

    # ─── Helpers ──────────────────────────────────────────────────────────

    def _format_phone(self, phone: str) -> str:
        """
        Normaliza número de telefone para formato internacional brasileiro (DDI 55).
        A UAZAPI GO V2 aceita o número diretamente sem @s.whatsapp.net no campo 'number'.
        """
        cleaned = "".join(c for c in phone if c.isdigit())
        if not cleaned.startswith("55"):
            cleaned = "55" + cleaned
        return cleaned

    def _personalize_message(self, template: str, contact: dict) -> str:
        """Substitui variáveis {nome}, {telefone}, {email}, {origem} na mensagem."""
        replacements = {
            "{nome}": contact.get("name", "Cliente"),
            "{telefone}": contact.get("phone", ""),
            "{email}": contact.get("email", ""),
            "{origem}": contact.get("origin", ""),
        }
        result = template
        for key, value in replacements.items():
            result = result.replace(key, str(value))
        return result


# Instância global
uazapi = UazapiClient()
