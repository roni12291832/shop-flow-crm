from __future__ import annotations
"""
Rotas da aba WhatsApp — gerenciamento de conexão e conversas.
WhatsApp gerenciado via UAZAPI GO V2 (nexaflow.uazapi.com).
"""
import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from core import logger
from config import get_settings
from supabase_client import get_supabase
from uazapi_client import uazapi

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])


# ─── Modelos ──────────────────────────────────────────────────────────────────

class SendMessageBody(BaseModel):
    chat_id: str
    message: str


class SendMediaBody(BaseModel):
    chat_id: str
    media_type: str  # image, video, audio, document, sticker, ptt, etc
    file: str  # URL or base64
    text: str | None = None  # caption
    doc_name: str | None = None
    delay: int | None = None
    reply_id: str | None = None


class SendLocationBody(BaseModel):
    chat_id: str
    latitude: float
    longitude: float
    name: str | None = None
    address: str | None = None


class DeleteMessageBody(BaseModel):
    message_id: str


class DeleteChatBody(BaseModel):
    chat_id: str
    delete_chat_db: bool = True
    delete_messages_db: bool = True
    delete_chat_whatsapp: bool = True


# ─── Helper: instância ativa ──────────────────────────────────────────────────

def _get_active_instance() -> dict:
    """Busca a instância WhatsApp conectada no Supabase. Lança 503 se nenhuma disponível."""
    db = get_supabase()
    res = (
        db.table("whatsapp_instances")
        .select("api_url, api_token, instance_token, instance_name")
        .eq("status", "connected")
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(
            status_code=503,
            detail="Nenhuma instância WhatsApp conectada. Escaneie o QR Code primeiro.",
        )
    return res.data[0]


def _get_any_instance() -> dict | None:
    """Busca qualquer instância no Supabase (qualquer status). Retorna None se não houver."""
    try:
        db = get_supabase()
        res = (
            db.table("whatsapp_instances")
            .select("api_url, api_token, instance_token, instance_name, status")
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None
    except Exception as e:
        logger.warning("Erro ao buscar instância: %s", e)
        return None


# ─── Gerenciamento de conexão (QR Code) ──────────────────────────────────────

@router.get("/management/status")
async def wa_get_status():
    """Retorna o status da instância WhatsApp (UAZAPI)."""
    s = get_settings()
    instance = _get_any_instance()

    if not instance:
        return {"connected": False, "state": "disconnected", "instance_name": None}

    api_url = instance.get("api_url") or s.uazapi_base_url
    instance_token = instance.get("instance_token") or instance.get("api_token") or s.uazapi_admin_token

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(
                f"{api_url.rstrip('/')}/instance/status",
                headers={"token": instance_token},
            )
            data = resp.json()
            connected = (
                data.get("connected")
                or data.get("state") in ("open", "connected")
                or instance.get("status") == "connected"
            )
            return {
                "connected": bool(connected),
                "state": data.get("state") or ("connected" if connected else "disconnected"),
                "instance_name": instance.get("instance_name"),
                "raw": data,
            }
        except Exception as e:
            return {
                "connected": instance.get("status") == "connected",
                "state": instance.get("status", "disconnected"),
                "instance_name": instance.get("instance_name"),
                "error": str(e),
            }


@router.get("/management/qr")
async def wa_get_qr():
    """
    Retorna o QR Code para escanear com o WhatsApp.
    Fluxo: busca instância no Supabase → se não existir, cria uma via UAZAPI admin →
    salva token no Supabase → chama /instance/qrcode com o instance_token.
    """
    s = get_settings()

    if not s.uazapi_admin_token:
        return {"qr": None, "connected": False, "state": "error", "error": "UAZAPI_ADMIN_TOKEN não configurado"}

    api_url = s.uazapi_base_url.rstrip("/")
    instance = _get_any_instance()
    instance_token: str | None = instance.get("instance_token") if instance else None

    async with httpx.AsyncClient(timeout=20) as client:
        # 1. Se não há instance_token, cria instância na UAZAPI
        if not instance_token:
            logger.info("[WA] Nenhuma instância encontrada — criando via UAZAPI admin")
            try:
                create_resp = await client.post(
                    f"{api_url}/instance/create",
                    headers={"token": s.uazapi_admin_token, "Content-Type": "application/json"},
                    json={"name": "shopflow"},
                )
                create_data = create_resp.json()
                logger.info("[WA] Resposta create instance: %s", str(create_data)[:300])
                instance_token = (
                    create_data.get("token")
                    or create_data.get("instance_token")
                    or create_data.get("apikey")
                    or create_data.get("key")
                )
                if not instance_token:
                    return {"qr": None, "connected": False, "state": "error",
                            "error": f"UAZAPI não retornou token. Resposta: {create_data}"}

                # Salva no Supabase
                try:
                    db = get_supabase()
                    db.table("whatsapp_instances").upsert({
                        "instance_name": create_data.get("name") or "shopflow",
                        "instance_token": instance_token,
                        "api_url": api_url,
                        "api_token": s.uazapi_admin_token,
                        "status": "pending",
                    }, on_conflict="instance_name").execute()
                except Exception as dbe:
                    logger.warning("[WA] Erro ao salvar instância no Supabase: %s", dbe)

            except Exception as e:
                logger.error("[WA] Erro ao criar instância: %s", e)
                return {"qr": None, "connected": False, "state": "error", "error": f"Erro ao criar instância: {e}"}

        # 2. Verifica status atual
        state = "disconnected"
        try:
            status_resp = await client.get(
                f"{api_url}/instance/status",
                headers={"token": instance_token},
            )
            status_data = status_resp.json()
            logger.info("[WA] Status instância: %s", str(status_data)[:200])

            if status_data.get("connected") or status_data.get("state") in ("open", "connected"):
                try:
                    db = get_supabase()
                    db.table("whatsapp_instances").update({"status": "connected"}).eq("instance_token", instance_token).execute()
                except Exception:
                    pass
                return {"qr": None, "connected": True, "state": "connected"}

            state = status_data.get("state", "disconnected")
        except Exception as e:
            logger.warning("[WA] Erro ao verificar status: %s", e)

        # 3. Se desconectado, inicia a conexão para gerar o QR
        if state not in ("qr", "waiting_qr", "connecting"):
            logger.info("[WA] Instância desconectada — chamando /instance/connect para iniciar QR")
            try:
                conn_resp = await client.post(
                    f"{api_url}/instance/connect",
                    headers={"token": instance_token, "Content-Type": "application/json"},
                    json={},
                )
                conn_data = conn_resp.json()
                logger.info("[WA] Resposta connect (status %s): %s", conn_resp.status_code, str(conn_data)[:200])
            except Exception as e:
                logger.warning("[WA] Erro ao chamar /instance/connect: %s", e)

        # 4. Busca QR code
        import asyncio as _asyncio
        await _asyncio.sleep(1)  # aguarda 1s para UAZAPI gerar o QR
        try:
            qr_resp = await client.get(
                f"{api_url}/instance/qrcode",
                headers={"token": instance_token},
            )
            qr_data = qr_resp.json()
            logger.info("[WA] Resposta QR (status %s): %s", qr_resp.status_code, str(qr_data)[:300])

            if qr_data.get("connected") or qr_data.get("state") in ("open", "connected"):
                return {"qr": None, "connected": True, "state": "connected"}

            qr = (
                qr_data.get("qrcode")
                or qr_data.get("qr")
                or qr_data.get("base64")
                or qr_data.get("code")
            )
            return {
                "qr": qr,
                "connected": False,
                "state": qr_data.get("state", "waiting_qr"),
                "debug": str(qr_data)[:300] if not qr else None,
            }
        except Exception as e:
            logger.error("[WA] Erro ao buscar QR: %s", e)
            return {"qr": None, "connected": False, "state": "error", "error": str(e)}


@router.post("/management/connect")
async def wa_connect():
    """Inicia/reconecta a instância WhatsApp via UAZAPI."""
    s = get_settings()

    if not s.uazapi_admin_token:
        raise HTTPException(status_code=500, detail="UAZAPI_ADMIN_TOKEN não configurado")

    api_url = s.uazapi_base_url
    instance = _get_any_instance()

    async with httpx.AsyncClient(timeout=20) as client:
        try:
            if instance and instance.get("instance_token"):
                # Instância existente — reconecta
                resp = await client.post(
                    f"{api_url.rstrip('/')}/instance/connect",
                    headers={"token": instance["instance_token"], "Content-Type": "application/json"},
                    json={},
                )
            else:
                # Cria nova instância via admin
                resp = await client.post(
                    f"{api_url.rstrip('/')}/instance/create",
                    headers={"token": s.uazapi_admin_token, "Content-Type": "application/json"},
                    json={"name": "shopflow"},
                )
                data = resp.json()
                new_token = data.get("token") or data.get("instance_token") or data.get("apikey")
                if new_token:
                    try:
                        db = get_supabase()
                        db.table("whatsapp_instances").upsert({
                            "instance_name": "shopflow",
                            "instance_token": new_token,
                            "api_url": api_url,
                            "api_token": s.uazapi_admin_token,
                            "status": "pending",
                        }, on_conflict="instance_name").execute()
                    except Exception as dbe:
                        logger.warning("Erro ao salvar instância no Supabase: %s", dbe)

            return {"ok": True, "message": "Iniciando conexão... Acesse /management/qr para escanear o QR Code."}
        except Exception as e:
            logger.error("[WA] Erro ao conectar: %s", e)
            raise HTTPException(status_code=502, detail=f"Erro ao conectar: {e}")


@router.post("/management/disconnect")
async def wa_disconnect_management():
    """Desconecta o WhatsApp e remove a instância."""
    instance = _get_any_instance()

    if instance:
        # Remove da UAZAPI
        api_url = instance.get("api_url") or get_settings().uazapi_base_url
        instance_token = instance.get("instance_token") or instance.get("api_token")
        if instance_token:
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    await client.delete(
                        f"{api_url.rstrip('/')}/instance",
                        headers={"token": instance_token},
                    )
            except Exception as e:
                logger.warning("[WA] Erro ao deletar instância na UAZAPI: %s", e)

        # Atualiza status no Supabase
        try:
            db = get_supabase()
            db.table("whatsapp_instances").update({"status": "disconnected"}).neq("id", "").execute()
        except Exception as e:
            logger.warning("[WA] Erro ao atualizar status no Supabase: %s", e)

    return {"ok": True}


# ─── Debug / Diagnóstico ──────────────────────────────────────────────────────

@router.get("/debug")
async def debug_whatsapp():
    """Diagnóstico — verifica conexão com UAZAPI GO V2."""
    try:
        instance = _get_active_instance()
    except HTTPException as e:
        return {"error": str(e.detail), "instance": None}

    status = await uazapi.get_instance_status(
        api_url=instance["api_url"],
        api_token=instance["api_token"],
        instance_name=instance.get("instance_name", ""),
        instance_token=instance.get("instance_token"),
    )

    raw_chats_sample = None
    raw_error = None
    try:
        url = f"{instance['api_url'].rstrip('/')}/chat/find"
        headers = {
            "token": instance["instance_token"],
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(url, json={"limit": 5}, headers=headers)
            raw_chats_sample = {
                "status_code": resp.status_code,
                "response_preview": str(resp.text[:500]),
            }
    except Exception as e:
        raw_error = str(e)

    return {
        "instance_config": {
            "api_url": instance["api_url"],
            "instance_name": instance.get("instance_name"),
            "has_instance_token": bool(instance.get("instance_token")),
        },
        "instance_status": status,
        "chat_find_test": raw_chats_sample,
        "chat_find_error": raw_error,
    }


# ─── Conversas ────────────────────────────────────────────────────────────────

@router.get("/conversations")
async def list_conversations(count: int = Query(default=50, ge=1, le=200)):
    """Lista as últimas conversas do WhatsApp conectado via UAZAPI GO V2."""
    instance = _get_active_instance()

    chats = await uazapi.get_chats(
        api_url=instance["api_url"],
        instance_token=instance["instance_token"],
        count=count,
    )

    logger.info(f"get_chats retornou {len(chats)} conversas")

    if not chats:
        return {"conversations": [], "total": 0}

    phones = [c["phone"] for c in chats if c.get("phone")]
    crm_map: dict[str, dict] = {}
    if phones:
        try:
            db = get_supabase()
            crm_res = (
                db.table("clients")
                .select("id, phone, name")
                .in_("phone", phones)
                .execute()
            )
            for client in crm_res.data or []:
                crm_map[client["phone"]] = {
                    "crm_client_id": client["id"],
                    "crm_name": client["name"],
                }
        except Exception as e:
            logger.warning("Erro ao enriquecer conversas com CRM: %s", e)

    enriched = []
    for chat in chats:
        phone = chat.get("phone", "")
        crm_data = crm_map.get(phone, {})
        enriched.append(
            {
                **chat,
                "name": crm_data.get("crm_name") or chat.get("name"),
                "crm_client_id": crm_data.get("crm_client_id"),
            }
        )

    def _sort_ts(x) -> float:
        ts = x.get("last_message_at")
        if ts is None:
            return 0.0
        if isinstance(ts, (int, float)):
            return float(ts)
        try:
            from datetime import datetime as _dt
            return _dt.fromisoformat(str(ts).replace("Z", "+00:00")).timestamp()
        except (ValueError, TypeError):
            return 0.0

    enriched.sort(key=_sort_ts, reverse=True)
    return {"conversations": enriched, "total": len(enriched)}


# ─── Mensagens de uma conversa ────────────────────────────────────────────────

@router.get("/conversations/{chat_id}/messages")
async def get_conversation_messages(
    chat_id: str,
    count: int = Query(default=30, ge=1, le=100),
):
    """Retorna mensagens de uma conversa mesclando UAZAPI + histórico do Supabase."""
    instance = _get_active_instance()

    full_jid = chat_id if "@" in chat_id else f"{chat_id}@s.whatsapp.net"
    phone = (
        full_jid.replace("@s.whatsapp.net", "")
        .replace("@c.us", "")
        .replace("@lid", "")
    )

    wa_messages = await uazapi.get_messages(
        api_url=instance["api_url"],
        instance_token=instance["instance_token"],
        chat_id=full_jid,
        count=count,
    )
    logger.info(f"get_messages({full_jid}) retornou {len(wa_messages)} mensagens")

    crm_messages: list[dict] = []
    try:
        db = get_supabase()
        client_res = (
            db.table("clients")
            .select("id")
            .eq("phone", phone)
            .limit(1)
            .execute()
        )
        if client_res.data:
            client_id = client_res.data[0]["id"]
            msg_res = (
                db.table("messages")
                .select("id, content, is_from_client, created_at, sender_type")
                .eq("client_id", client_id)
                .order("created_at", desc=True)
                .limit(count)
                .execute()
            )
            for m in msg_res.data or []:
                crm_messages.append(
                    {
                        "id": f"crm-{m['id']}",
                        "from_me": not m.get("is_from_client", True),
                        "text": m.get("content", ""),
                        "timestamp": m.get("created_at"),
                        "source": "crm",
                        "sender_type": m.get("sender_type"),
                    }
                )
    except Exception as e:
        logger.warning("Erro ao buscar histórico do CRM: %s", e)

    all_messages = [{**m, "source": "whatsapp"} for m in wa_messages] + crm_messages

    def _sort_key(m) -> float:
        ts = m.get("timestamp")
        if ts is None:
            return 0.0
        if isinstance(ts, (int, float)):
            return float(ts)
        try:
            from datetime import datetime as _dt
            return _dt.fromisoformat(str(ts).replace("Z", "+00:00")).timestamp()
        except (ValueError, TypeError):
            return 0.0

    all_messages.sort(key=_sort_key)

    return {
        "chat_id": full_jid,
        "phone": phone,
        "messages": all_messages,
        "total": len(all_messages),
    }


# ─── Envio de mensagens ───────────────────────────────────────────────────────

@router.post("/conversations/send")
async def send_message(body: SendMessageBody):
    """Envia mensagem manualmente a partir da aba WhatsApp do CRM."""
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Mensagem não pode ser vazia")

    instance = _get_active_instance()
    phone = (
        body.chat_id.replace("@s.whatsapp.net", "")
        .replace("@c.us", "")
        .replace("@lid", "")
    )

    result = await uazapi.send_text(
        api_url=instance["api_url"],
        api_token=instance["api_token"],
        instance_name=instance.get("instance_name", ""),
        phone=phone,
        message=body.message,
        instance_token=instance.get("instance_token"),
    )

    if "error" in result:
        raise HTTPException(status_code=502, detail=f"Erro ao enviar: {result['error']}")

    try:
        db = get_supabase()
        client_res = (
            db.table("clients")
            .select("id")
            .eq("phone", phone)
            .limit(1)
            .execute()
        )
        if client_res.data:
            db.table("messages").insert(
                {
                    "client_id": client_res.data[0]["id"],
                    "content": body.message,
                    "sender_type": "agent",
                    "channel": "whatsapp",
                    "is_from_client": False,
                }
            ).execute()
    except Exception as e:
        logger.warning("Mensagem enviada mas não salva no CRM: %s", e)

    return {"status": "ok", "sent": True}


@router.post("/conversations/send-media")
async def send_media(body: SendMediaBody):
    """Envia mídia (imagem, vídeo, áudio, doc, figurinha)."""
    instance = _get_active_instance()
    phone = body.chat_id.replace("@s.whatsapp.net", "").replace("@c.us", "").replace("@lid", "")

    extra_args = {}
    if body.delay:
        extra_args["delay"] = body.delay
    if body.reply_id:
        extra_args["replyid"] = body.reply_id

    result = await uazapi.send_media(
        api_url=instance["api_url"],
        api_token=instance["api_token"],
        phone=phone,
        media_type=body.media_type,
        file=body.file,
        text=body.text,
        doc_name=body.doc_name,
        instance_token=instance.get("instance_token"),
        **extra_args
    )

    if "error" in result:
        raise HTTPException(status_code=502, detail=f"Erro ao enviar mídia: {result['error']}")

    try:
        db = get_supabase()
        client_res = db.table("clients").select("id").eq("phone", phone).limit(1).execute()
        if client_res.data:
            content = f"[{body.media_type.upper()}] {body.text or body.doc_name or ''}"
            db.table("messages").insert({
                "client_id": client_res.data[0]["id"],
                "content": content.strip(),
                "sender_type": "agent",
                "channel": "whatsapp",
                "is_from_client": False,
            }).execute()
    except Exception as e:
        logger.warning("Mídia enviada mas não salva no CRM: %s", e)

    return {"status": "ok", "result": result}


@router.post("/conversations/send-location")
async def send_location(body: SendLocationBody):
    """Envia localização geográfica."""
    instance = _get_active_instance()
    phone = body.chat_id.replace("@s.whatsapp.net", "").replace("@c.us", "").replace("@lid", "")

    result = await uazapi.send_location(
        api_url=instance["api_url"],
        api_token=instance["api_token"],
        phone=phone,
        latitude=body.latitude,
        longitude=body.longitude,
        name=body.name,
        address=body.address,
        instance_token=instance.get("instance_token"),
    )

    if "error" in result:
        raise HTTPException(status_code=502, detail=f"Erro ao enviar localização: {result['error']}")

    try:
        db = get_supabase()
        client_res = db.table("clients").select("id").eq("phone", phone).limit(1).execute()
        if client_res.data:
            content = f"📍 Localização: {body.name or 'Enviada'}"
            db.table("messages").insert({
                "client_id": client_res.data[0]["id"],
                "content": content,
                "sender_type": "agent",
                "channel": "whatsapp",
                "is_from_client": False,
            }).execute()
    except Exception as e:
        logger.warning("Localização enviada mas não salva no CRM: %s", e)

    return {"status": "ok", "result": result}


# ─── Exclusão ─────────────────────────────────────────────────────────────────

@router.post("/messages/delete")
async def delete_message(body: DeleteMessageBody):
    """Apaga uma mensagem para todos (unsend)."""
    instance = _get_active_instance()
    result = await uazapi.delete_message(
        api_url=instance["api_url"],
        api_token=instance["api_token"],
        message_id=body.message_id,
        instance_token=instance.get("instance_token"),
    )

    if "error" in result:
        raise HTTPException(status_code=502, detail=f"Erro ao apagar mensagem: {result['error']}")

    return {"status": "ok", "result": result}


@router.post("/conversations/delete")
async def delete_conversation(body: DeleteChatBody):
    """Deleta uma conversa do WhatsApp e/ou Banco de Dados."""
    instance = _get_active_instance()
    phone = body.chat_id.replace("@s.whatsapp.net", "").replace("@c.us", "").replace("@lid", "")

    result = await uazapi.delete_chat(
        api_url=instance["api_url"],
        api_token=instance["api_token"],
        phone=phone,
        delete_chat_db=body.delete_chat_db,
        delete_messages_db=body.delete_messages_db,
        delete_chat_whatsapp=body.delete_chat_whatsapp,
        instance_token=instance.get("instance_token"),
    )

    if "error" in result:
        raise HTTPException(status_code=502, detail=f"Erro ao deletar conversa: {result['error']}")

    return {"status": "ok", "result": result}


@router.delete("/instance")
async def disconnect_whatsapp_legacy():
    """Desconecta WhatsApp (compatibilidade com versão anterior)."""
    return await wa_disconnect_management()
