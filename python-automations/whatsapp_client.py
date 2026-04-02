from __future__ import annotations
"""
Cliente WhatsApp — neonize (Python puro, sem Node.js).
Gerencia QR code, conexão e envio de mensagens.
"""
import asyncio
import base64
import io
import logging
import os
import threading
from typing import Optional

logger = logging.getLogger("wa_client")

SESSION_DIR = os.getenv("WA_SESSION_DIR", "./wa_sessions")
SESSION_DB = os.path.join(SESSION_DIR, "shopflow.db")


class WhatsAppClient:
    def __init__(self):
        self._client = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self.qr_base64: Optional[str] = None
        self.connected: bool = False
        self.state: str = "disconnected"

    # ── Helpers ──────────────────────────────────────────────────────────

    def _qr_to_base64(self, data: bytes) -> str:
        import segno
        buf = io.BytesIO()
        segno.make_qr(data).save(buf, kind="png", scale=10)
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    # ── Internal async runner ────────────────────────────────────────────

    def _run_loop(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._async_connect())
        except Exception as e:
            logger.error("WA loop encerrado: %s", e)

    async def _async_connect(self):
        from neonize.aioze.client import NewAClient
        from neonize.events import ConnectedEv, DisconnectedEv, MessageEv

        os.makedirs(SESSION_DIR, exist_ok=True)
        self._client = NewAClient(SESSION_DB)

        # QR callback
        async def on_qr(c, data: bytes):
            self.qr_base64 = self._qr_to_base64(data)
            self.state = "connecting"
            logger.info("[WA] QR Code gerado — aguardando escaneamento")

        self._client.qr(on_qr)

        @self._client.event(ConnectedEv)
        async def on_connected(c, ev):
            self.connected = True
            self.state = "connected"
            self.qr_base64 = None
            logger.info("[WA] Conectado!")
            await self._notify_db("connected")

        @self._client.event(DisconnectedEv)
        async def on_disconnected(c, ev):
            self.connected = False
            self.state = "disconnected"
            logger.info("[WA] Desconectado")
            await self._notify_db("disconnected")

        @self._client.event(MessageEv)
        async def on_message(c, ev):
            asyncio.create_task(self._handle_message(ev))

        await self._client.connect()

    async def _notify_db(self, status: str):
        try:
            from supabase_client import get_supabase
            db = get_supabase()
            inst = db.table("whatsapp_instances").select("id").limit(1).execute()
            if inst.data:
                db.table("whatsapp_instances").update({"status": status}).eq("id", inst.data[0]["id"]).execute()
            else:
                db.table("whatsapp_instances").insert({
                    "api_url": "internal-neonize",
                    "api_token": "internal",
                    "instance_name": "shopflow",
                    "instance_token": "internal",
                    "status": status,
                }).execute()
        except Exception as e:
            logger.warning("[WA] Falha ao atualizar status no DB: %s", e)

    async def _handle_message(self, ev):
        try:
            from neonize.utils.jid import Jid2String
            info = ev.Info
            sender_jid = Jid2String(info.Sender) if info.Sender else ""
            remote_jid = Jid2String(info.Chat) if info.Chat else ""

            # Ignora grupos e mensagens enviadas por mim
            if info.IsFromMe or remote_jid.endswith("@g.us") or remote_jid.endswith("@broadcast"):
                return

            # Extrai texto
            msg = ev.Message
            text = (
                msg.conversation
                or (msg.extendedTextMessage.text if msg.extendedTextMessage else "")
                or ""
            ).strip()
            if not text:
                return

            phone = remote_jid.replace("@s.whatsapp.net", "").replace("@c.us", "")
            push_name = info.PushName or ""
            timestamp = int(info.Timestamp.seconds) if info.Timestamp else 0

            # Encaminha para o webhook interno (mesma estrutura que o wa-connector usava)
            payload = {
                "event": "messages",
                "instance": "shopflow",
                "data": {
                    "key": {
                        "remoteJid": remote_jid,
                        "fromMe": False,
                        "id": info.ID or "",
                    },
                    "pushName": push_name,
                    "message": {"conversation": text},
                    "messageTimestamp": timestamp,
                },
            }

            import httpx
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post("http://localhost:8000/webhook/uzapi", json=payload)

        except Exception as e:
            logger.error("[WA] Erro ao processar mensagem: %s", e)

    # ── Public API ───────────────────────────────────────────────────────

    def start(self):
        """Inicia conexão em thread dedicada."""
        if self._thread and self._thread.is_alive():
            return
        self.state = "connecting"
        self.qr_base64 = None
        self._thread = threading.Thread(
            target=self._run_loop, daemon=True, name="wa-neonize"
        )
        self._thread.start()
        logger.info("[WA] Client iniciado")

    def reconnect(self):
        """Força desconexão e gera novo QR code."""
        logger.info("[WA] Reconectando...")
        self.disconnect()
        import time; time.sleep(1)
        self.start()

    def disconnect(self):
        """Desconecta e limpa estado."""
        if self._client and self._loop and self._loop.is_running():
            try:
                future = asyncio.run_coroutine_threadsafe(
                    self._client.disconnect(), self._loop
                )
                future.result(timeout=5)
            except Exception:
                pass
        self.connected = False
        self.state = "disconnected"
        self.qr_base64 = None
        self._client = None
        self._thread = None

    def send_text(self, phone: str, message: str) -> bool:
        """Envia mensagem de texto. Retorna True se enviou com sucesso."""
        if not self.connected or not self._client or not self._loop:
            logger.warning("[WA] Tentativa de envio sem conexão ativa")
            return False
        try:
            from neonize.utils.jid import build_jid
            clean = "".join(c for c in phone if c.isdigit())
            if not clean.startswith("55"):
                clean = "55" + clean
            jid = build_jid(clean)
            future = asyncio.run_coroutine_threadsafe(
                self._client.send_message(jid, message), self._loop
            )
            future.result(timeout=30)
            logger.info("[WA] Mensagem enviada para %s", phone)
            return True
        except Exception as e:
            logger.error("[WA] Erro ao enviar para %s: %s", phone, e)
            return False

    def get_status(self) -> dict:
        return {
            "connected": self.connected,
            "state": self.state,
            "hasQr": self.qr_base64 is not None,
        }

    def get_qr(self) -> dict:
        return {
            "qr": self.qr_base64,
            "connected": self.connected,
            "state": self.state,
        }


# Singleton global
wa_client = WhatsAppClient()
