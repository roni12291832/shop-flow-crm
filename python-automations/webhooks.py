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
from followup_engine import cancel_pending_for_client, on_stage_change
from whatsapp_watcher_agent import analyze_and_move_lead as watcher_analyze

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

    # UAZAPI GO envia eventos variados. 
    # Precisamos de MESSAGE (recebimento), CHATS_DELETE (sync apagados) e MESSAGES_DELETE (sync apagados)
    is_message = "MESSAGE" in event
    is_delete = "DELETE" in event
    
    if not (is_message or is_delete):
        if event:
            logger.info(f"Webhook ignorado: evento '{event}' não processado")
        return {"status": "ignored", "reason": f"evento {event} não processado"}

    if not isinstance(message_data, dict):
        return {"status": "ignored", "reason": "formato de dados não reconhecido"}

    # ─── Tratamento de Exclusão (Sync) ──────────────────────────────
    if is_delete:
        try:
            db = get_supabase()
            if "CHAT" in event:
                # Exclusão de conversa
                remote_jid = message_data.get("number") or message_data.get("remoteJid") or ""
                phone = remote_jid.replace("@s.whatsapp.net", "").replace("@c.us", "").replace("@lid", "")
                if phone:
                    # Busca cliente para apagar conversas vinculadas
                    client_res = db.table("clients").select("id").eq("phone", phone).limit(1).execute()
                    if client_res.data:
                        client_id = client_res.data[0]["id"]
                        # Apaga mensagens e conversas
                        db.table("messages").delete().eq("client_id", client_id).execute()
                        db.table("conversations").delete().eq("client_id", client_id).execute()
                        logger.info(f"Sync: Conversa e mensagens de {phone} apagadas via webhook")
                        return {"status": "deleted", "type": "chat", "phone": phone}
            
            elif "MESSAGE" in event:
                # Exclusão de mensagem única
                msg_id = message_data.get("id") or message_data.get("messageid")
                if msg_id:
                    db.table("messages").delete().eq("id", msg_id).execute()
                    # Fallback para IDs do CRM
                    db.table("messages").delete().eq("id", f"crm-{msg_id}").execute()
                    logger.info(f"Sync: Mensagem {msg_id} apagada via webhook")
                    return {"status": "deleted", "type": "message", "id": msg_id}
            
            return {"status": "ignored", "reason": "evento de delete sem dados suficientes"}
        except Exception as e:
            logger.error(f"Erro ao processar sync de delete: {e}")
            return {"status": "error", "message": str(e)}

    # ─── Tratamento de Mensagens Recebidas ────────────────────────────
    key = message_data.get("key", {})
    remote_jid = key.get("remoteJid", "") or message_data.get("from", "") or ""
    from_me = key.get("fromMe", False) or message_data.get("fromMe", False)

    msg_obj = message_data.get("message", {}) or {}
    if isinstance(msg_obj, str):
        message_text = msg_obj
    elif isinstance(msg_obj, dict):
        # Extrai texto em cascata — cada tipo de mensagem tem seu campo específico.
        # Usando blocos if/elif explícitos para evitar bug de precedência do operador
        # `or` vs ternário `if/else` que mascarava fallbacks quando o campo existia mas estava vazio.
        message_text = msg_obj.get("conversation") or ""
        if not message_text and isinstance(msg_obj.get("extendedTextMessage"), dict):
            message_text = msg_obj["extendedTextMessage"].get("text", "")
        if not message_text and isinstance(msg_obj.get("imageMessage"), dict):
            message_text = msg_obj["imageMessage"].get("caption", "")
        if not message_text and isinstance(msg_obj.get("videoMessage"), dict):
            message_text = msg_obj["videoMessage"].get("caption", "")
        if not message_text and isinstance(msg_obj.get("documentMessage"), dict):
            message_text = msg_obj["documentMessage"].get("caption", "")
        if not message_text:
            message_text = message_data.get("body") or message_data.get("text") or ""
    else:
        message_text = ""

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

        # Cancela follow-ups pendentes — cliente respondeu
        try:
            await cancel_pending_for_client(client_id, reason="cliente_respondeu")
        except Exception as e:
            logger.warning("Erro ao cancelar follow-ups (não crítico): %s", e)

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
                # Detectar tipo de mensagem
                _msg_type = "text"
                if isinstance(msg_obj, dict):
                    if msg_obj.get("imageMessage"): _msg_type = "image"
                    elif msg_obj.get("videoMessage"): _msg_type = "video"
                    elif msg_obj.get("audioMessage") or msg_obj.get("pttMessage"): _msg_type = "audio"
                    elif msg_obj.get("documentMessage"): _msg_type = "document"
                    elif msg_obj.get("locationMessage"): _msg_type = "location"
                db.table("messages").insert({
                    "conversation_id": conversation_id,
                    "client_id": client_id,
                    "content": message_text,
                    "sender_type": "cliente",
                    "channel": "whatsapp",
                    "is_from_client": True,
                    "type": _msg_type,
                    "direction": "inbound",
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
        opportunity_action = "none"
        if not DRY_RUN:
            try:
                # Busca qualquer oportunidade existente para este cliente
                any_opp_res = (
                    db.table("opportunities")
                    .select("id, stage")
                    .eq("client_id", client_id)
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                existing_opp = any_opp_res.data[0] if any_opp_res.data else None

                if not existing_opp:
                    # Sem oportunidade alguma → cria em lead_novo (novo OU cliente existente sem opp)
                    ins = db.table("opportunities").insert({
                        "title": f"Lead WhatsApp - {push_name or phone}",
                        "client_id": client_id,
                        "stage": "lead_novo",
                        "estimated_value": 0,
                    }).execute()
                    if ins.data:
                        opportunity_action = "created_lead_novo"
                        logger.info("Oportunidade 'lead_novo' criada para %s (%s)", push_name, phone)
                        try:
                            await on_stage_change(
                                client_id=str(client_id),
                                opportunity_id=str(ins.data[0]["id"]),
                                new_stage="lead_novo",
                                old_stage=None,
                            )
                        except Exception as fe:
                            logger.warning("Erro ao acionar follow-up de 'lead_novo' (não crítico): %s", fe)
                    else:
                        opportunity_action = "create_failed"
                        logger.error("Falha ao criar oportunidade para %s: %s", push_name, ins)

                elif existing_opp["stage"] not in ("comprador", "perdido", "desqualificado"):
                    # Oportunidade em etapa ativa → analisa mensagem com Watcher Agent (IA avançada)
                    old_stage = existing_opp["stage"]
                    opportunity_action = f"existing_{old_stage}"
                    try:
                        # Busca histórico de mensagens do cliente para contexto
                        hist_res = (
                            db.table("messages")
                            .select("content, is_from_client")
                            .eq("client_id", client_id)
                            .order("created_at", desc=True)
                            .limit(10)
                            .execute()
                        )
                        history = list(reversed(hist_res.data or []))

                        watcher_result = await watcher_analyze(
                            client_id=str(client_id),
                            opportunity_id=str(existing_opp["id"]),
                            current_stage=old_stage,
                            new_message=message_text,
                            message_history=history,
                            db=db,
                        )

                        if watcher_result.get("moved"):
                            new_stage = watcher_result["new_stage"]
                            opportunity_action = f"advanced_to_{new_stage}"
                            logger.info(
                                "Watcher moveu %s de '%s' → '%s': %s",
                                push_name, old_stage, new_stage, watcher_result.get("reason"),
                            )
                            try:
                                await on_stage_change(
                                    client_id=str(client_id),
                                    opportunity_id=str(existing_opp["id"]),
                                    new_stage=new_stage,
                                    old_stage=old_stage,
                                )
                            except Exception as fe:
                                logger.warning("Erro ao acionar follow-up após watcher (não crítico): %s", fe)
                        else:
                            opportunity_action = f"existing_{old_stage}_no_change"
                    except Exception as e:
                        logger.warning("Watcher Agent falhou (não crítico): %s", e)
                        opportunity_action = f"existing_{old_stage}_watcher_error"

                else:
                    opportunity_action = f"existing_{existing_opp['stage']}_no_change"

            except Exception as e:
                opportunity_action = f"error: {e}"
                logger.error("Erro ao gerenciar oportunidade para %s (%s): %s", push_name, phone, e)

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
                            "type": "text",
                            "direction": "outbound",
                        }).execute()
                        logger.info("Jarvis respondeu automaticamente para %s", push_name)

        except Exception as e:
            logger.warning("Jarvis auto-reply falhou (não crítico): %s", e)

        return {
            "status": "ok",
            "client_id": client_id,
            "client_name": push_name,
            "phone": phone,
            "is_new_lead": is_new,
            "opportunity_action": opportunity_action,
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
