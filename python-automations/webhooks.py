from __future__ import annotations
"""
Rotas de Webhook — recebem eventos do WhatsApp via UAZAPI GO e processam.

Formato esperado da UAZAPI GO:
{
  "event": "messages",
  "instance": "nome-da-instancia",
  "data": {
    "key": { "remoteJid": "5511999999999@s.whatsapp.net", "fromMe": false },
    "pushName": "Nome do Contato",
    "message": { "conversation": "texto da mensagem" }
  }
}
"""
from datetime import datetime, timezone

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


@router.post("/setup")
async def setup_webhook_now(request: Request):
    """
    Força a configuração do webhook no UAZAPI agora.
    Útil após deploy sem precisar reconectar o WhatsApp.
    """
    from supabase_client import get_supabase
    s = get_settings()
    if not s.webhook_url:
        return {"status": "error", "message": "WEBHOOK_URL não configurado nas env vars"}

    db = get_supabase()
    instances = db.table("whatsapp_instances").select("*").execute()
    if not instances.data:
        return {"status": "error", "message": "Nenhuma instância WhatsApp encontrada"}

    results = []
    for inst in instances.data:
        result = await uazapi.set_webhook(
            inst["api_url"], inst["api_token"],
            inst["instance_name"], s.webhook_url,
            inst.get("instance_token"),
        )
        results.append({"instance": inst["instance_name"], "result": result})
        logger.info(f"Webhook forçado para '{inst['instance_name']}': {result}")

    return {"status": "ok", "results": results}


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

    # Log tudo que chega para facilitar diagnóstico
    logger.info(f"[WEBHOOK] event={body.get('event')} instance={body.get('instance')} keys={list(body.keys())}")

    event = (body.get("event", "") or "").upper()
    message_data = body.get("data", body)

    # UAZAPI GO envia event: "messages" para mensagens recebidas
    # Ignorar eventos de connection/status — não são mensagens
    if "MESSAGE" not in event:
        if event:
            logger.info(f"Webhook ignorado: evento '{event}' não é mensagem")
        return {"status": "ignored", "reason": f"evento {event} não é mensagem"}

    if not isinstance(message_data, dict):
        return {"status": "ignored", "reason": "formato de dados não reconhecido"}

    # Extrai dados da mensagem no formato UAZAPI GO
    key = message_data.get("key", {})
    remote_jid = key.get("remoteJid", "") or message_data.get("from", "") or ""
    from_me = key.get("fromMe", False) or message_data.get("fromMe", False)

    msg_obj = message_data.get("message", {}) or {}
    if isinstance(msg_obj, str):
        message_text = msg_obj
    else:
        message_text = (
            msg_obj.get("conversation", "")
            or msg_obj.get("extendedTextMessage", {}).get("text", "")
            or msg_obj.get("imageMessage", {}).get("caption", "")
            or msg_obj.get("videoMessage", {}).get("caption", "")
            or message_data.get("body", "")
            or message_data.get("text", "")
            or ""
        )

    push_name = (
        message_data.get("pushName", "")
        or message_data.get("senderName", "")
        or f"WhatsApp {remote_jid.split('@')[0][-4:] if '@' in remote_jid else 'Lead'}"
    )

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
                    "last_message_at": datetime.now(timezone.utc).isoformat(),
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
                    "last_message_at": datetime.now(timezone.utc).isoformat(),
                }).execute()
                if not insert_conv.data:
                    logger.error("Erro ao criar conversa: %s", insert_conv)
                    return {"status": "error", "message": "falha ao criar conversa"}
                conversation_id = insert_conv.data[0]["id"]

        # ─── 3. Salva Mensagem ────────────────────────────────────────────
        if not DRY_RUN:
            try:
                db.table("messages").insert({
                    "conversation_id": conversation_id,
                    "client_id": client_id,
                    "content": message_text,
                    "sender_type": "cliente",
                    "channel": "whatsapp",
                    "is_from_client": True,
                }).execute()
                logger.info("Mensagem de %s salva na conversa %s: %.50s...", push_name, conversation_id, message_text)
            except Exception as e:
                logger.error("Erro ao salvar mensagem (colunas faltando? rode a migration): %s", e)
                # Tenta inserir só com colunas originais como fallback
                try:
                    db.table("messages").insert({
                        "conversation_id": conversation_id,
                        "content": message_text,
                        "sender_type": "cliente",
                    }).execute()
                    logger.info("Mensagem salva (fallback sem colunas extras) para conversa %s", conversation_id)
                except Exception as e2:
                    logger.error("Fallback de mensagem também falhou: %s", e2)

        # ─── 4. Cria ou Atualiza Oportunidade (Pipeline) ─────────────────
        if is_new and not DRY_RUN:
            try:
                db.table("opportunities").insert({
                    "title": f"Lead WhatsApp - {push_name or phone}",
                    "client_id": client_id,
                    "stage": "lead_novo",
                    "estimated_value": 0,
                }).execute()
                logger.info("Nova oportunidade criada no pipeline para %s", push_name)
            except Exception as e:
                logger.warning("Erro ao criar oportunidade (stage inválido?): %s", e)
        elif not is_new:
            try:
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
            except Exception as e:
                logger.warning("Erro ao buscar/atualizar oportunidade: %s", e)

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
                            "conversation_id": conversation_id,
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


@router.post("/uzapi/debug")
async def debug_webhook(request: Request):
    """Loga o payload bruto recebido da UAZAPI — útil para diagnosticar formato de eventos."""
    try:
        body = await request.json()
    except Exception:
        body = await request.body()
        body = {"raw": body.decode()}
    logger.info(f"[DEBUG WEBHOOK] payload={body}")
    return {"status": "logged", "event": body.get("event") or body.get("type"), "keys": list(body.keys())}


@router.get("/diagnostics")
async def diagnostics():
    """
    Diagnóstico do sistema — verifica DB e mostra conversas existentes.
    Acesse: GET /webhook/diagnostics
    """
    try:
        db = get_supabase()
        s = get_settings()

        conv_res = db.table("conversations").select("id, status, last_message, last_message_at, client_id").order("created_at", desc=True).limit(10).execute()
        client_res = db.table("clients").select("id, name, phone, origin").order("created_at", desc=True).limit(10).execute()
        instances = db.table("whatsapp_instances").select("instance_name, status, api_url").execute()

        return {
            "status": "ok",
            "dry_run": DRY_RUN,
            "webhook_url": s.webhook_url,
            "conversations_found": len(conv_res.data or []),
            "conversations": conv_res.data,
            "clients_found": len(client_res.data or []),
            "clients": client_res.data,
            "whatsapp_instances": instances.data,
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


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
            f"⏰ Hora: {datetime.now(timezone.utc).strftime('%H:%M')}\n\n"
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
