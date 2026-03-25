from __future__ import annotations
"""
Rotas da aba WhatsApp — listagem de conversas e mensagens.
Consome a UAZAPI GO e enriquece com dados do Supabase.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from core import logger
from supabase_client import get_supabase
from uazapi_client import uazapi

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])


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


@router.get("/conversations")
async def list_conversations(count: int = Query(default=50, ge=1, le=200)):
    """
    Lista as últimas conversas do WhatsApp conectado.
    Busca na UAZAPI GO e enriquece com nomes do CRM.
    """
    instance = _get_active_instance()

    chats = await uazapi.get_chats(
        api_url=instance["api_url"],
        instance_token=instance["instance_token"],
        count=count,
    )

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
        enriched.append({
            **chat,
            "name": crm_data.get("crm_name") or chat.get("name"),
            "crm_client_id": crm_data.get("crm_client_id"),
        })

    enriched.sort(key=lambda x: x.get("last_message_at") or 0, reverse=True)
    return {"conversations": enriched, "total": len(enriched)}


@router.get("/conversations/{chat_id}/messages")
async def get_conversation_messages(
    chat_id: str,
    count: int = Query(default=30, ge=1, le=100),
):
    """
    Retorna mensagens de uma conversa.
    Mescla mensagens da UAZAPI GO com histórico salvo no Supabase.
    """
    instance = _get_active_instance()

    full_jid = chat_id if "@" in chat_id else f"{chat_id}@s.whatsapp.net"
    phone = full_jid.replace("@s.whatsapp.net", "").replace("@c.us", "")

    # 1. Mensagens do WhatsApp (UAZAPI GO)
    wa_messages = await uazapi.get_messages(
        api_url=instance["api_url"],
        instance_token=instance["instance_token"],
        chat_id=full_jid,
        count=count,
    )

    # 2. Mensagens salvas no Supabase (enviadas pelo Jarvis ou agente)
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
                crm_messages.append({
                    "id": f"crm-{m['id']}",
                    "from_me": not m.get("is_from_client", True),
                    "text": m.get("content", ""),
                    "timestamp": m.get("created_at"),
                    "source": "crm",
                    "sender_type": m.get("sender_type"),
                })
    except Exception as e:
        logger.warning("Erro ao buscar histórico do CRM: %s", e)

    # 3. Mescla e ordena por timestamp
    all_messages = [{**m, "source": "whatsapp"} for m in wa_messages] + crm_messages

    def sort_key(m):
        ts = m.get("timestamp")
        if isinstance(ts, str):
            return ts
        return ts or 0

    all_messages.sort(key=sort_key)

    return {
        "chat_id": full_jid,
        "phone": phone,
        "messages": all_messages,
        "total": len(all_messages),
    }


class SendMessageBody(BaseModel):
    chat_id: str
    message: str


@router.post("/conversations/send")
async def send_message(body: SendMessageBody):
    """Envia mensagem manualmente a partir da aba WhatsApp do CRM."""
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Mensagem não pode ser vazia")

    instance = _get_active_instance()
    phone = body.chat_id.replace("@s.whatsapp.net", "").replace("@c.us", "")

    result = await uazapi.send_text(
        api_url=instance["api_url"],
        api_token=instance["api_token"],
        instance_name=instance["instance_name"],
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
            db.table("messages").insert({
                "client_id": client_res.data[0]["id"],
                "content": body.message,
                "sender_type": "agent",
                "channel": "whatsapp",
                "is_from_client": False,
            }).execute()
    except Exception as e:
        logger.warning("Mensagem enviada mas não salva no CRM: %s", e)

    return {"status": "ok", "sent": True}
