from __future__ import annotations
"""
Cliente para a API da UAZAPI (Evolution API / WhatsApp).
Gerencia envio de mensagens de texto, mídia e status de instâncias.
"""
import httpx
import asyncio
import random
import logging
from config import get_settings

logger = logging.getLogger("uazapi")


class UazapiClient:
    """Cliente assíncrono para a UAZAPI."""

    def __init__(self):
        # Configuration is now dynamic per-instance from the DB
        pass

    async def send_text(self, api_url: str, api_token: str, instance_name: str, phone: str, message: str, instance_token: str | None = None) -> dict:
        """
        Envia mensagem de texto simples.
        phone: número com DDI, ex: 5511999999999
        """
        url = f"{api_url.rstrip('/')}/message/sendText/{instance_name}"
        headers = {
            "Content-Type": "application/json",
            "apikey": api_token,
        }
        if instance_token:
            headers["token"] = instance_token

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

    async def set_webhook(self, api_url: str, api_token: str, instance_name: str, webhook_url: str, instance_token: str | None = None) -> dict:
        """Configura a URL do webhook na UAZAPI GO."""
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

    async def send_bulk_campaign(
        self,
        api_url: str,
        api_token: str,
        instance_name: str,
        contacts: list[dict],
        messages: list[str],
        min_delay: int = 15,
        max_delay: int = 60,
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
        random.shuffle(shuffled_contacts)  # Embaralha ordem de envio

        for i, contact in enumerate(shuffled_contacts):
            phone = contact.get("phone", "")
            name = contact.get("name", "Cliente")
            if not phone:
                results["failed"] += 1
                continue

            # Seleciona mensagem aleatória e personaliza com dados do contato
            msg_template = random.choice(messages)
            personalized_msg = self._personalize_message(msg_template, contact)

            resp = await self.send_text(api_url, api_token, instance_name, phone, personalized_msg)
            if "error" in resp:
                results["failed"] += 1
                results["errors"].append({"phone": phone, "error": resp["error"]})
            else:
                results["sent"] += 1

            # Delay aleatório entre mensagens para evitar bloqueio
            if i < len(shuffled_contacts) - 1:
                delay = random.uniform(min_delay, max_delay)
                logger.info(f"Aguardando {delay:.1f}s antes do próximo envio...")
                await asyncio.sleep(delay)

        return results

    async def get_instance_status(self, api_url: str, api_token: str, instance_name: str, instance_token: str | None = None) -> dict:
        """Verifica status de conexão da instância."""
        if instance_token:
            url = f"{api_url.rstrip('/')}/instance/status"
            headers = {"token": instance_token}
        else:
            url = f"{api_url.rstrip('/')}/instance/connectionState/{instance_name}"
            headers = {"apikey": api_token}
            
        async with httpx.AsyncClient(timeout=15) as client:
            try:
                resp = await client.get(url, headers=headers)
                return resp.json()
            except Exception as e:
                return {"error": str(e)}

    async def get_chats(self, api_url: str, api_token: str, instance_name: str, count: int = 50) -> list:
        """Busca as últimas conversas da instância."""
        # TODO: Implement proper Evolution API chat sync mapping. Return empty list for now.
        return []

    def _format_phone(self, phone: str) -> str:
        """Normaliza número de telefone."""
        cleaned = "".join(c for c in phone if c.isdigit())
        if not cleaned.startswith("55"):
            cleaned = "55" + cleaned
        return cleaned

    def _personalize_message(self, template: str, contact: dict) -> str:
        """
        Substitui variáveis dinâmicas na mensagem.
        Variáveis suportadas: {nome}, {telefone}, {email}, {origem}
        """
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
