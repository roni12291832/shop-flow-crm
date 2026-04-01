from __future__ import annotations
"""
Rotas da aba WhatsApp — listagem de conversas e mensagens.
Consome a UAZAPI GO V2 e enriquece com dados do Supabase.

CORREÇÕES v2:
- Usa os métodos corrigidos do uazapi_client (POST /chat/find, POST /message/find)
- Adicionado endpoint de diagnóstico GET /whatsapp/debug para facilitar troubleshooting
- Sort key corrigido para lidar com timestamp int e string
"""
import httpx
import os as _os
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from core import logger
from supabase_client import get_supabase
from uazapi_client import uazapi

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])

WA_CONNECTOR_URL = _os.getenv("WA_CONNECTOR_URL", "http://localhost:3001")


async def _connector_request(method: str, path: str, **kwargs) -> dict:
    """Faz requisição HTTP para o conector WA interno."""
    url = f"{WA_CONNECTOR_URL.rstrip('/')}{path}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await getattr(client, method)(url, **kwargs)
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Conector WA indisponível: {e}")


@router.get("/management/qr")
async def wa_get_qr():
    """Retorna QR code do conector interno para o frontend."""
    return await _connector_request("get", "/qr")


@router.get("/management/status")
async def wa_get_status():
    """Retorna status de conexão do conector interno."""
    return await _connector_request("get", "/status")


@router.post("/management/connect")
async def wa_connect():
    """Inicia/reinicia conexão WhatsApp (gera novo QR)."""
    return await _connector_request("post", "/connect")


@router.post("/management/disconnect")
async def wa_disconnect_management():
    """Desconecta o WhatsApp do conector interno."""
    result = await _connector_request("post", "/disconnect")
    # Atualiza status no banco
    try:
        db = get_supabase()
        db.table("whatsapp_instances").update({"status": "disconnected"}).neq("id", "").execute()
    except Exception:
        pass
    return result


@router.post("/management/set-status")
async def wa_set_status_internal(request: Request):
    """Chamado pelo conector Node.js para atualizar status no banco."""
    body = await request.json()
    status = body.get("status", "disconnected")
    try:
        db = get_supabase()
        inst = db.table("whatsapp_instances").select("id").limit(1).execute()
        if inst.data:
            db.table("whatsapp_instances").update({"status": status}).eq("id", inst.data[0]["id"]).execute()
        else:
            db.table("whatsapp_instances").insert({
                "api_url": WA_CONNECTOR_URL,
                "api_token": "internal",
                "instance_name": "shopflow",
                "instance_token": "internal",
                "status": status,
            }).execute()
    except Exception as e:
        logger.warning("Erro ao atualizar status WA no banco: %s", e)
    return {"ok": True, "status": status}


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


def _get_active_instance() -> dict:
    """Busca a instância WhatsApp. Suporta conector interno (localhost:3001) e UAZAPI."""
    db = get_supabase()
    res = (
        db.table("whatsapp_instances")
        .select("api_url, api_token, instance_token, instance_name, status")
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(
            status_code=503,
            detail="Nenhuma instância WhatsApp configurada. Conecte o WhatsApp primeiro.",
        )
    inst = res.data[0]
    # Conector interno não precisa de status "connected" no banco para operar
    api_url = inst.get("api_url", "")
    is_internal = "localhost" in api_url or "127.0.0.1" in api_url
    if not is_internal and inst.get("status") != "connected":
        raise HTTPException(
            status_code=503,
            detail="Nenhuma instância WhatsApp conectada. Escaneie o QR Code primeiro.",
        )
    return inst


# ─── Debug / Diagnóstico ──────────────────────────────────────────────────────

@router.get("/debug")
async def debug_whatsapp():
    """
    Endpoint de diagnóstico — verifica a conexão com a UAZAPI GO V2 e
    retorna o status da instância e uma amostra de chats brutos.
    Útil para verificar se os endpoints estão corretos.
    """
    try:
        instance = _get_active_instance()
    except HTTPException as e:
        return {"error": str(e.detail), "instance": None}

    # Testa status da instância
    status = await uazapi.get_instance_status(
        api_url=instance["api_url"],
        api_token=instance["api_token"],
        instance_name=instance.get("instance_name", ""),
        instance_token=instance.get("instance_token"),
    )

    # Testa busca de chats (retorna raw para diagnóstico)
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
    """
    Lista as últimas conversas do WhatsApp conectado.
    Busca na UAZAPI GO V2 (POST /chat/find) e enriquece com nomes do CRM.
    """
    instance = _get_active_instance()

    chats = await uazapi.get_chats(
        api_url=instance["api_url"],
        instance_token=instance["instance_token"],
        count=count,
    )

    logger.info(f"get_chats retornou {len(chats)} conversas")

    if not chats:
        return {"conversations": [], "total": 0}

    # Enriquece com nomes do CRM em lote
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

    # Ordena por timestamp — converte tudo para float (Unix epoch) para evitar
    # TypeError ao comparar int com str em Python 3.
    def _sort_ts(x) -> float:
        ts = x.get("last_message_at")
        if ts is None:
            return 0.0
        if isinstance(ts, (int, float)):
            return float(ts)
        # ISO string → converte para Unix timestamp para comparação uniforme
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
    """
    Retorna mensagens de uma conversa.
    Mescla mensagens da UAZAPI GO V2 (POST /message/find) com histórico do Supabase.
    """
    instance = _get_active_instance()

    full_jid = chat_id if "@" in chat_id else f"{chat_id}@s.whatsapp.net"
    phone = (
        full_jid.replace("@s.whatsapp.net", "")
        .replace("@c.us", "")
        .replace("@lid", "")
    )

    # 1. Mensagens do WhatsApp (UAZAPI GO V2 — POST /message/find)
    wa_messages = await uazapi.get_messages(
        api_url=instance["api_url"],
        instance_token=instance["instance_token"],
        chat_id=full_jid,
        count=count,
    )
    logger.info(f"get_messages({full_jid}) retornou {len(wa_messages)} mensagens")

    # 2. Mensagens salvas no Supabase (enviadas pelo agente/Jarvis)
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

    # 3. Mescla e ordena por timestamp
    all_messages = [{**m, "source": "whatsapp"} for m in wa_messages] + crm_messages

    def _sort_key(m) -> float:
        ts = m.get("timestamp")
        if ts is None:
            return 0.0
        if isinstance(ts, (int, float)):
            return float(ts)
        # ISO string → converte para Unix timestamp para comparação uniforme
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

    # Salva no CRM se o cliente existir
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
    if body.delay: extra_args["delay"] = body.delay
    if body.reply_id: extra_args["replyid"] = body.reply_id

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

    # Salva referência no CRM
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
