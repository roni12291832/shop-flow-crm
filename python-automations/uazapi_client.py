from __future__ import annotations
"""
Cliente para a API da UAZAPI GO.
Documentação: https://docs.uazapi.com/

Autenticação: header "token" com o token da instância.
Base URL: configurada por instância no banco (ex: https://nexaflow.uazapi.com)
"""
import httpx
import asyncio
import random
import logging

logger = logging.getLogger("uazapi")


class UazapiClient:
    """Cliente assíncrono para a UAZAPI GO."""

    # ─── Envio de mensagens ───────────────────────────────────────────────

    async def send_text(self, api_url: str, api_token: str, instance_name: str, phone: str, message: str, instance_token: str | None = None) -> dict:
        """
        Envia mensagem de texto.
        Endpoint UAZAPI: POST /message/sendText/{instance_name}
        Header: token (instance_token preferencial, fallback api_token)
        phone: número com DDI, ex: 5511999999999
        """
        url = f"{api_url.rstrip('/')}/message/sendText/{instance_name}"
        token = instance_token or api_token
        headers = {
            "Content-Type": "application/json",
            "token": token,
        }
        payload = {
            "number": f"{self._format_phone(phone)}@s.whatsapp.net",
            "text": message,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                logger.info(f"Mensagem enviada para {phone}")
                return resp.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"Erro HTTP ao enviar para {phone}: {e.response.status_code} - {e.response.text}")
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
            return {"error": "OBRIGATÓRIO: envie pelo menos 15 variações de mensagem para evitar bloqueio do WhatsApp."}

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

            resp = await self.send_text(api_url, api_token, instance_name, phone, personalized_msg, instance_token)
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

    async def set_webhook(self, api_url: str, api_token: str, instance_name: str, webhook_url: str, instance_token: str | None = None) -> dict:
        """
        Configura URL do webhook na UAZAPI GO.
        Endpoint: POST /webhook
        Header: token
        """
        url = f"{api_url.rstrip('/')}/webhook"
        token = instance_token or api_token
        headers = {
            "token": token,
            "Content-Type": "application/json",
        }
        payload = {
            "enabled": True,
            "url": webhook_url,
            "events": ["messages", "connection"],
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

    # ─── Status da instância ──────────────────────────────────────────────

    async def get_instance_status(self, api_url: str, api_token: str, instance_name: str, instance_token: str | None = None) -> dict:
        """
        Verifica status de conexão da instância.
        Endpoint UAZAPI: GET /instance/status
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
        """Normaliza número de telefone para DDI 55 (Brasil)."""
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
