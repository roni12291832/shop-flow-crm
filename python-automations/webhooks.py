from __future__ import annotations
"""
Rotas de Webhook — recebem dados do WhatsApp (UAZAPI) e processam.
Substitui completamente o fluxo N8N 08-whatsapp-lead-auto-pipeline.
"""
from datetime import datetime

from fastapi import APIRouter, Request

from core import logger, DRY_RUN, registrar_automacao, alertar_dono
from supabase_client import get_supabase
from uazapi_client import uazapi
from jarvis_agent import jarvis
from config import get_settings

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

    event = body.get("event", "")
    if event not in ("messages.upsert", "message"):
        return {"status": "ignored", "reason": f"evento {event} não processado"}

    message_data = body.get("data", body)

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

    if from_me:
        return {"status": "ignored", "reason": "mensagem própria"}

    phone = remote_jid.replace("@s.whatsapp.net", "").replace("@c.us", "")
    if not phone or len(phone) < 10:
        return {"status": "ignored", "reason": "número inválido"}

    try:
        db = get_supabase()

        # ─── 1. Busca ou cria Cliente ─────────────────────────────────────
        client_res = db.table("clients").select("*").eq("phone", phone).limit(1).execute()

        if client_res.data:
            client = client_res.data[0]
            client_id = client["id"]
            is_new = False
        else:
            if DRY_RUN:
                logger.info("[DRY_RUN] Criaria cliente %s (%s)", push_name, phone)
                return {"status": "dry_run", "message": "novo cliente não criado em DRY_RUN"}

            new_client = {
                "name": push_name or f"WhatsApp {phone[-4:]}",
                "phone": phone,
                "origin": "whatsapp",
            }
            insert_res = db.table("clients").insert(new_client).execute()
            if not insert_res.data:
                logger.error("Erro ao criar cliente: %s", insert_res)
                return {"status": "error", "message": "falha ao criar cliente"}

            client = insert_res.data[0]
            client_id = client["id"]
            is_new = True
            logger.info("Novo cliente criado: %s (%s)", push_name, phone)

        # ─── 2. Gerencia Conversa ─────────────────────────────────────────
        conv_res = (
            db.table("conversations")
            .select("*")
            .eq("client_id", client_id)
            .in_("status", ["aberta", "em_atendimento", "aguardando"])
            .order("last_message_at", desc=True)
            .limit(1)
            .execute()
        )

        if conv_res.data:
            conversation_id = conv_res.data[0]["id"]
            if not DRY_RUN:
                db.table("conversations").update({
                    "last_message": message_text[:100],
                    "last_message_at": datetime.utcnow().isoformat(),
                    "status": "aguardando",
                }).eq("id", conversation_id).execute()
        else:
            if DRY_RUN:
                logger.info("[DRY_RUN] Criaria conversa para cliente %s", client_id)
                conversation_id = "dry-run-id"
            else:
                insert_conv = db.table("conversations").insert({
                    "client_id": client_id,
                    "status": "aberta",
                    "last_message": message_text[:100],
                    "last_message_at": datetime.utcnow().isoformat(),
                }).execute()
                if not insert_conv.data:
                    logger.error("Erro ao criar conversa: %s", insert_conv)
                    return {"status": "error", "message": "falha ao criar conversa"}
                conversation_id = insert_conv.data[0]["id"]

        # ─── 3. Salva Mensagem ────────────────────────────────────────────
        if not DRY_RUN:
            db.table("messages").insert({
                "conversation_id": conversation_id,
                "client_id": client_id,
                "content": message_text,
                "sender_type": "cliente",
                "channel": "whatsapp",
                "is_from_client": True,
            }).execute()
        logger.info("Mensagem de %s salva na conversa %s: %.50s...", push_name, conversation_id, message_text)

        # ─── 4. Cria ou Atualiza Oportunidade (Pipeline) ─────────────────
        if is_new and not DRY_RUN:
            db.table("opportunities").insert({
                "title": f"Lead WhatsApp - {push_name or phone}",
                "client_id": client_id,
                "stage": "lead_novo",
                "estimated_value": 0,
            }).execute()
            logger.info("Nova oportunidade criada no pipeline para %s", push_name)
        elif not is_new:
            active_opp_res = (
                db.table("opportunities")
                .select("id, stage")
                .eq("client_id", client_id)
                .in_("stage", ["lead_novo", "contato_iniciado"])
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if active_opp_res.data:
                opp = active_opp_res.data[0]
                try:
                    is_interested = await jarvis.analyze_client_intent(message_text)
                    if is_interested and not DRY_RUN:
                        db.table("opportunities").update({"stage": "interessado"}).eq("id", opp["id"]).execute()
                        logger.info("Oportunidade de %s atualizada para 'interessado' via IA", push_name)
                except Exception as e:
                    logger.warning("Erro ao analisar intenção do cliente via IA: %s", e)

        # ─── 5. Resposta Automática via Jarvis ────────────────────────────
        try:
            history_res = (
                db.table("messages")
                .select("content, is_from_client")
                .eq("client_id", client_id)
                .order("created_at", desc=True)
                .limit(10)
                .execute()
            )
            history = list(reversed(history_res.data or []))

            reply = await jarvis.auto_reply_lead(
                client_name=client.get("name", "Cliente"),
                client_message=message_text,
                client_history=history,
            )

            if reply:
                instance_res = (
                    db.table("whatsapp_instances")
                    .select("api_url, api_token, instance_name")
                    .eq("status", "connected")
                    .limit(1)
                    .execute()
                )
                if instance_res.data:
                    inst = instance_res.data[0]

                    if DRY_RUN:
                        logger.info("[DRY_RUN] Jarvis responderia para %s: %.80s...", push_name, reply)
                    else:
                        await uazapi.send_text(
                            api_url=inst["api_url"],
                            api_token=inst["api_token"],
                            instance_name=inst["instance_name"],
                            phone=phone,
                            message=reply,
                        )
                        db.table("messages").insert({
                            "client_id": client_id,
                            "content": reply,
                            "sender_type": "agent",
                            "channel": "whatsapp",
                            "is_from_client": False,
                        }).execute()
                        logger.info("Jarvis respondeu automaticamente para %s", push_name)

        except Exception as e:
            logger.warning("Jarvis auto-reply falhou (não crítico): %s", e)

        return {
            "status": "ok",
            "client_id": client_id,
            "is_new_lead": is_new,
            "message_saved": not DRY_RUN,
        }

    except Exception as e:
        logger.error("Erro crítico ao processar webhook de %s: %s", phone, e)
        await alertar_dono(f"Erro no webhook WhatsApp\nNúmero: {phone}\nErro: {e}")
        return {"status": "error", "message": "erro interno ao processar mensagem"}


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

    async with registrar_automacao("notificacao_novo_lead", {"nome": client_name, "origem": origin}):
        db = get_supabase()

        instance_res = (
            db.table("whatsapp_instances")
            .select("api_url, api_token, instance_name")
            .eq("status", "connected")
            .limit(1)
            .execute()
        )
        if not instance_res.data:
            logger.warning("Sem instância WhatsApp para notificar novo lead")
            return {"status": "error", "message": "sem instância WhatsApp configurada"}

        inst = instance_res.data[0]
        s = get_settings()

        if not s.admin_phone:
            return {"status": "error", "message": "ADMIN_PHONE não configurado"}

        msg = (
            f"🔥 *NOVO LEAD NO CRM!*\n\n"
            f"👤 Nome: {client_name}\n"
            f"📱 Telefone: {client_phone}\n"
            f"📍 Origem: {origin}\n"
            f"⏰ Hora: {datetime.utcnow().strftime('%H:%M')}\n\n"
            f"*Acesse o CRM para acompanhar!*"
        )

        if DRY_RUN:
            logger.info("[DRY_RUN] Notificaria novo lead '%s' para %s", client_name, s.admin_phone)
            return {"status": "dry_run", "notified": False}

        await uazapi.send_text(
            api_url=inst["api_url"],
            api_token=inst["api_token"],
            instance_name=inst["instance_name"],
            phone=s.admin_phone,
            message=msg,
        )
        return {"status": "ok", "notified": True}
