"""
Rotas de Webhook — recebem dados do WhatsApp (UAZAPI) e processam.
Substitui completamente o fluxo N8N 08-whatsapp-lead-auto-pipeline.
"""
import logging
from datetime import datetime
from fastapi import APIRouter, Request
from supabase_client import get_supabase
from uazapi_client import uazapi
from jarvis_agent import jarvis

logger = logging.getLogger("webhooks")
router = APIRouter(prefix="/webhook", tags=["Webhooks"])

# Stages do Pipeline (sincronizados com o Frontend)
PIPELINE_STAGES = [
    "lead_novo",
    "contato_iniciado",
    "interessado",
    "comprador",
    "perdido",
    "desqualificado",
]


@router.post("/uzapi")
async def receive_whatsapp_message(request: Request):
    """
    Recebe webhook da UAZAPI quando alguém manda mensagem no WhatsApp.
    1. Identifica ou cria o cliente no Supabase
    2. Salva a mensagem na tabela `messages`
    3. Cria oportunidade no pipeline se for lead novo
    4. (Opcional) Gera resposta automática via Jarvis IA
    """
    try:
        body = await request.json()
    except Exception:
        return {"status": "error", "message": "JSON inválido"}

    # Extrai dados do payload UAZAPI
    event = body.get("event", "")
    if event not in ("messages.upsert", "message"):
        return {"status": "ignored", "reason": f"evento {event} não processado"}

    # Estrutura do payload pode variar conforme versão da UAZAPI
    message_data = body.get("data", body)
    
    # Tenta extrair de diferentes formatos
    if isinstance(message_data, dict):
        remote_jid = message_data.get("key", {}).get("remoteJid", "") or message_data.get("from", "")
        message_text = (
            message_data.get("message", {}).get("conversation", "")
            or message_data.get("message", {}).get("extendedTextMessage", {}).get("text", "")
            or message_data.get("body", "")
            or ""
        )
        from_me = message_data.get("key", {}).get("fromMe", False)
        push_name = message_data.get("pushName", "") or message_data.get("senderName", "")
    else:
        return {"status": "ignored", "reason": "formato de dados não reconhecido"}

    # Ignora mensagens enviadas por nós mesmos
    if from_me:
        return {"status": "ignored", "reason": "mensagem própria"}

    # Extrai número limpo (remove @s.whatsapp.net)
    phone = remote_jid.replace("@s.whatsapp.net", "").replace("@c.us", "")
    if not phone or len(phone) < 10:
        return {"status": "ignored", "reason": "número inválido"}

    db = get_supabase()

    # ─── 1. Busca ou cria Cliente ─────────────────────────────────────
    client_res = db.table("clients").select("*").eq("phone", phone).limit(1).execute()

    if client_res.data and len(client_res.data) > 0:
        client = client_res.data[0]
        client_id = client["id"]
        is_new = False
    else:
        # Cria novo cliente
        new_client = {
            "name": push_name or f"WhatsApp {phone[-4:]}",
            "phone": phone,
            "origin": "whatsapp",
        }
        insert_res = db.table("clients").insert(new_client).execute()
        if not insert_res.data:
            logger.error(f"Erro ao criar cliente: {insert_res}")
            return {"status": "error", "message": "falha ao criar cliente"}
        client = insert_res.data[0]
        client_id = client["id"]
        is_new = True
        logger.info(f"Novo cliente criado: {push_name} ({phone})")

    # ─── 2. Salva Mensagem ────────────────────────────────────────────
    msg_payload = {
        "client_id": client_id,
        "content": message_text,
        "sender_type": "client",
        "channel": "whatsapp",
        "is_from_client": True,
    }
    db.table("messages").insert(msg_payload).execute()
    logger.info(f"Mensagem salva de {push_name}: {message_text[:50]}...")

    # ─── 3. Cria Oportunidade (Pipeline) se for Lead Novo ─────────────
    if is_new:
        opp_payload = {
            "title": f"Lead WhatsApp - {push_name or phone}",
            "client_id": client_id,
            "stage": "lead_novo",
            "estimated_value": 0,
        }
        db.table("opportunities").insert(opp_payload).execute()
        logger.info(f"Nova oportunidade criada no pipeline para {push_name}")

    # ─── 4. Resposta Automática via Jarvis (se ativada) ───────────────
    try:
        # Busca histórico recente
        history_res = db.table("messages").select("content, is_from_client").eq("client_id", client_id).order("created_at", desc=True).limit(10).execute()
        history = list(reversed(history_res.data or []))

        # Gera resposta
        reply = await jarvis.auto_reply_lead(
            client_name=client.get("name", "Cliente"),
            client_message=message_text,
            client_history=history,
        )

        if reply:
            # Busca instância do WhatsApp no banco
            instance_res = db.table("whatsapp_instances").select("api_token").limit(1).execute()
            if instance_res.data:
                token = instance_res.data[0]["api_token"]
                await uazapi.send_text(token, phone, reply)

                # Salva a resposta automática no banco
                db.table("messages").insert({
                    "client_id": client_id,
                    "content": reply,
                    "sender_type": "agent",
                    "channel": "whatsapp",
                    "is_from_client": False,
                }).execute()
                logger.info(f"Jarvis respondeu automaticamente para {push_name}")

    except Exception as e:
        logger.warning(f"Jarvis auto-reply falhou (não crítico): {e}")

    return {
        "status": "ok",
        "client_id": client_id,
        "is_new_lead": is_new,
        "message_saved": True,
    }


@router.post("/new-lead-notify")
async def notify_new_lead(request: Request):
    """
    Webhook interno: quando um novo lead é inserido via qualquer canal,
    dispara notificação para o admin via WhatsApp.
    Substitui o fluxo N8N 05.
    """
    try:
        body = await request.json()
    except Exception:
        return {"status": "error"}

    client_name = body.get("name", "Novo Lead")
    client_phone = body.get("phone", "")
    origin = body.get("origin", "desconhecido")

    db = get_supabase()

    # Busca instância e token
    instance_res = db.table("whatsapp_instances").select("api_token").limit(1).execute()
    if not instance_res.data:
        return {"status": "error", "message": "sem instância WhatsApp configurada"}

    token = instance_res.data[0]["api_token"]

    from config import get_settings
    s = get_settings()
    admin_phone = s.admin_phone

    if not admin_phone:
        return {"status": "error", "message": "ADMIN_PHONE não configurado"}

    msg = (
        f"🔥 *NOVO LEAD NO CRM!*\n\n"
        f"👤 Nome: {client_name}\n"
        f"📱 Telefone: {client_phone}\n"
        f"📍 Origem: {origin}\n"
        f"⏰ Hora: {datetime.utcnow().strftime('%H:%M')}\n\n"
        f"*Acesse o CRM para acompanhar!*"
    )

    await uazapi.send_text(token, admin_phone, msg)
    return {"status": "ok", "notified": True}
