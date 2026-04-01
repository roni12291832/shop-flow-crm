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
from stages import VALID_STAGES, TERMINAL_STAGES

router = APIRouter(prefix="/webhook", tags=["Webhooks"])

# ─── Mapa de extração de texto por tipo de mensagem UAZAPI ────────────────────
# Cada chave é um campo do objeto `message` do payload da UAZAPI.
# O valor é uma função que extrai o texto daquele tipo.
_MSG_EXTRACTORS = {
    "conversation":        lambda m: m.get("conversation") or "",
    "extendedTextMessage": lambda m: (m.get("extendedTextMessage") or {}).get("text") or "",
    "imageMessage":        lambda m: (m.get("imageMessage") or {}).get("caption") or "[Imagem]",
    "videoMessage":        lambda m: (m.get("videoMessage") or {}).get("caption") or "[Vídeo]",
    "documentMessage":     lambda m: (m.get("documentMessage") or {}).get("caption") or "[Documento]",
    "audioMessage":        lambda m: "[Áudio]",
    "pttMessage":          lambda m: "[Áudio]",
    "stickerMessage":      lambda m: "[Figurinha]",
    "contactMessage":      lambda m: "[Contato]",
    "locationMessage":     lambda m: "[Localização]",
    "reactionMessage":     lambda m: (m.get("reactionMessage") or {}).get("text") or "[Reação]",
    "pollCreationMessage": lambda m: (m.get("pollCreationMessage") or {}).get("name") or "[Enquete]",
}


def _extract_message_text(msg_obj: dict, message_data: dict) -> tuple[str, str]:
    """
    Extrai (texto, tipo) de qualquer payload UAZAPI.
    Nunca retorna string vazia sem registrar — tipos desconhecidos são logados.
    """
    if not isinstance(msg_obj, dict):
        return str(msg_obj) if msg_obj else "", "unknown"

    for key, extractor in _MSG_EXTRACTORS.items():
        if key in msg_obj:
            text = extractor(msg_obj)
            return text, key

    # Tipo desconhecido — tenta campos genéricos e loga para mapeamento futuro
    fallback = (
        message_data.get("body") 
        or message_data.get("text") 
        or message_data.get("caption") 
        or ""
    )
    
    if not fallback:
        # Tenta extrair qualquer coisa de qualquer chave que pareça conter texto
        for k, v in msg_obj.items():
            if isinstance(v, dict):
                fallback = v.get("text") or v.get("caption") or v.get("body")
                if fallback: break
            elif isinstance(v, str) and len(v) > 2:
                fallback = v
                break

    unknown_keys = list(msg_obj.keys())
    if not fallback:
        fallback = f"[Mensagem {unknown_keys[0] if unknown_keys else 'ignorada'}]"
        
    logger.warning("Tipo de mensagem UAZAPI desconhecido: %s — fallback='%s'", unknown_keys, fallback[:50])
    return fallback, "unknown"


# PIPELINE_STAGES importado de stages.py (fonte única de verdade)


@router.get("/debug/pipeline")
async def debug_pipeline():
    """
    Diagnóstico: mostra os últimos leads criados/movidos pelo webhook.
    Útil para verificar se novos contatos estão sendo registrados no CRM.
    """
    db = get_supabase()
    from datetime import timedelta
    from datetime import datetime as dt
    since = (dt.now(timezone.utc) - timedelta(hours=48)).isoformat()

    # Oportunidades criadas nas últimas 48h
    opps = (
        db.table("opportunities")
        .select("id, title, stage, created_at, client_id")
        .gte("created_at", since)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )

    # Logs do watcher agent
    watcher_logs = (
        db.table("automacoes_log")
        .select("detalhes, iniciado_em, status")
        .eq("nome", "whatsapp_watcher")
        .gte("iniciado_em", since)
        .order("iniciado_em", desc=True)
        .limit(20)
        .execute()
    )

    # System errors
    errors = (
        db.table("system_logs")
        .select("message, created_at")
        .eq("level", "ERROR")
        .gte("created_at", since)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )

    # Mensagens recentes recebidas (via webhook = tem provider_message_id, via sync = não tem)
    recent_msgs = (
        db.table("messages")
        .select("id, content, sender_type, provider_message_id, created_at, client_id")
        .eq("sender_type", "cliente")
        .gte("created_at", since)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )

    return {
        "recent_opportunities_48h": opps.data or [],
        "watcher_moves_48h": watcher_logs.data or [],
        "recent_errors": errors.data or [],
        "recent_client_messages_48h": [
            {**m, "source": "webhook" if m.get("provider_message_id") else "sync_offline"}
            for m in (recent_msgs.data or [])
        ],
    }


@router.post("/debug/test-lead")
async def debug_test_lead(request: Request):
    """
    Simula a criação de um lead via webhook para testar se o banco está funcionando.
    Body: { "phone": "5511999999999", "name": "Teste" }
    """
    try:
        body = await request.json()
    except Exception:
        return {"error": "JSON inválido"}

    phone = body.get("phone", "5500000000000")
    name = body.get("name", "Teste Debug")

    db = get_supabase()
    result = {"steps": {}}

    # 1. Testa criação/busca de cliente
    try:
        client_res = db.table("clients").select("id, name").eq("phone", phone).limit(1).execute()
        if client_res.data:
            client_id = client_res.data[0]["id"]
            result["steps"]["client"] = f"encontrado: {client_id}"
        else:
            ins = db.table("clients").insert({"name": name, "phone": phone, "origin": "whatsapp"}).execute()
            if ins.data:
                client_id = ins.data[0]["id"]
                result["steps"]["client"] = f"criado: {client_id}"
            else:
                result["steps"]["client"] = f"FALHOU: {ins}"
                return result
    except Exception as e:
        result["steps"]["client"] = f"ERRO: {e}"
        return result

    # 2. Testa busca de oportunidade
    try:
        opp_res = db.table("opportunities").select("id, stage").eq("client_id", client_id).limit(1).execute()
        if opp_res.data:
            result["steps"]["opportunity"] = f"já existe: {opp_res.data[0]}"
        else:
            # 3. Testa criação de oportunidade
            ins_opp = db.table("opportunities").insert({
                "title": f"Lead WhatsApp - {name}",
                "client_id": client_id,
                "stage": "lead_novo",
                "estimated_value": 0,
            }).execute()
            if ins_opp.data:
                result["steps"]["opportunity"] = f"criada: {ins_opp.data[0]}"
            else:
                result["steps"]["opportunity"] = f"FALHOU (sem data): {ins_opp}"
    except Exception as e:
        result["steps"]["opportunity"] = f"ERRO: {e}"

    return result


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
    # Precisamos de MESSAGE (recebimento), CHATS_DELETE (sync apagados), MESSAGES_DELETE (sync apagados)
    # e MESSAGES_UPDATE (status de entrega/erro)
    is_message = "MESSAGE" in event
    is_delete  = "DELETE" in event
    is_update  = "UPDATE" in event
    
    if not (is_message or is_delete or is_update):
        if event:
            logger.info(f"Webhook ignorado: evento '{event}' não processado")
        return {"status": "ignored", "reason": f"evento {event} não processado"}

    if not isinstance(message_data, (dict, list)):
        return {"status": "ignored", "reason": "formato de dados não reconhecido"}

    # Normaliza message_data para dict para os fluxos que esperam objeto único
    # (MESSAGE, DELETE)
    msg_data_dict = message_data[0] if isinstance(message_data, list) and len(message_data) > 0 else message_data
    if not isinstance(msg_data_dict, dict):
        msg_data_dict = {}

    # ─── Tratamento de Exclusão (Sync) ──────────────────────────────
    if is_delete:
        try:
            db = get_supabase()
            if "CHAT" in event:
                # Exclusão de conversa
                remote_jid = msg_data_dict.get("number") or msg_data_dict.get("remoteJid") or ""
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
                # Exclusão de mensagem única — busca pelo provider_message_id (campo correto)
                msg_id = msg_data_dict.get("id") or msg_data_dict.get("messageid")
                if msg_id:
                    db.table("messages").delete().eq("provider_message_id", msg_id).execute()
                    logger.info(f"Sync: Mensagem {msg_id} apagada via webhook (provider_message_id)")
                    return {"status": "deleted", "type": "message", "id": msg_id}
            
            return {"status": "ignored", "reason": "evento de delete sem dados suficientes"}
        except Exception as e:
            logger.error(f"Erro ao processar sync de delete: {e}")
            return {"status": "error", "message": str(e)}

    # ─── Tratamento de Status de Entrega (Sync/Status) ─────────────
    if is_update:
        # MESSAGES_UPDATE ou MESSAGES_SET traz status de entrega (ack)
        # Geralmente é uma lista de mensagens
        msgs = message_data if isinstance(message_data, list) else [message_data]
        updated_count = 0
        for m in msgs:
            msg_id = m.get("id") or (m.get("key") or {}).get("id")
            update = m.get("update") or m
            status = update.get("status") or update.get("ack")
            
            if msg_id and status is not None:
                # Mapeia status do WhatsApp: 3=DEALIVRED, 4=READ, etc.
                # Se for erro (depende da implementação UAZAPI, mas geralmente status > 0)
                db = get_supabase()
                db.table("messages").update({"status": str(status)}).eq("provider_message_id", msg_id).execute()
                updated_count += 1
        
        return {"status": "updated", "count": updated_count}

    # ─── Tratamento de Mensagens Recebidas ────────────────────────────
    key = msg_data_dict.get("key", {})
    remote_jid = key.get("remoteJid", "") or msg_data_dict.get("from", "") or ""
    from_me = key.get("fromMe", False) or msg_data_dict.get("fromMe", False)

    # ID único da mensagem no WhatsApp — usado para deduplicação
    provider_message_id = (
        key.get("id")
        or msg_data_dict.get("id")
        or msg_data_dict.get("messageId")
    )

    msg_obj = msg_data_dict.get("message", {}) or {}
    if isinstance(msg_obj, str):
        message_text, _msg_type = msg_obj, "text"
    else:
        message_text, _msg_type = _extract_message_text(msg_obj, msg_data_dict)

    push_name = (
        msg_data_dict.get("pushName", "")
        or msg_data_dict.get("senderName", "")
        or f"WhatsApp {remote_jid.split('@')[0][-4:] if '@' in remote_jid else 'Lead'}"
    )

    if from_me:
        return {"status": "ignored", "reason": "mensagem própria"}

    phone = remote_jid.replace("@s.whatsapp.net", "").replace("@c.us", "")
    if not phone or len(phone) < 10:
        return {"status": "ignored", "reason": "número inválido"}

    try:
        db = get_supabase()

        # ─── Deduplicação de webhook ──────────────────────────────────────────
        # A UAZAPI pode reenviar o mesmo evento 2-3x em caso de timeout de resposta.
        # Verificamos pelo provider_message_id ANTES de processar qualquer coisa.
        if provider_message_id:
            dup = (
                db.table("messages")
                .select("id")
                .eq("provider_message_id", provider_message_id)
                .limit(1)
                .execute()
            )
            if dup.data:
                logger.info("Webhook duplicado ignorado: provider_message_id=%s", provider_message_id)
                return {"status": "ignored", "reason": "mensagem já processada"}

        # ─── 1. Busca ou cria Cliente ─────────────────────────────────────
        # Normaliza número para busca: tenta com e sem DDI 55 (Brasil)
        # Ex: "5511999999999" → também testa "11999999999"
        # Ex: "11999999999"  → também testa "5511999999999"
        phone_variants: list[str] = [phone]
        if phone.startswith("55") and len(phone) >= 12:
            phone_variants.append(phone[2:])          # remove DDI
        elif len(phone) <= 11:
            phone_variants.append("55" + phone)       # adiciona DDI
        # Também tenta sem o 9 extra (celular 8 dígitos antigo)
        if len(phone) == 13 and phone.startswith("55"):
            phone_variants.append(phone[:4] + phone[5:])  # remove 9 extra

        client: dict | None = None
        for ph_variant in phone_variants:
            res = db.table("clients").select("*").eq("phone", ph_variant).limit(1).execute()
            if res.data:
                client = res.data[0]
                break

        if client:
            client_id = client["id"]
            is_new = False
            # Atualiza nome se estava genérico e agora temos pushName real
            if push_name and client.get("name", "").startswith("WhatsApp "):
                db.table("clients").update({"name": push_name}).eq("id", client_id).execute()
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
                # Pode ter falhado por UNIQUE violation se outro webhook criou ao mesmo tempo
                # Tenta buscar o cliente que acabou de ser inserido por request concorrente
                logger.warning("INSERT de cliente falhou para %s — buscando registro concorrente", phone)
                for ph_variant in phone_variants:
                    retry_res = db.table("clients").select("*").eq("phone", ph_variant).limit(1).execute()
                    if retry_res.data:
                        client = retry_res.data[0]
                        break
                if not client:
                    logger.error("Erro ao criar cliente e não encontrado no banco: %s (%s)", push_name, phone)
                    return {"status": "error", "message": "falha ao criar cliente"}
                client_id = client["id"]
                is_new = False
                logger.info("Cliente encontrado após falha de INSERT (concorrência): %s (%s)", push_name, phone)
            else:
                client = insert_res.data[0]
                client_id = client["id"]
                is_new = True
                logger.info("Novo cliente criado: %s (%s)", push_name, phone)

        # ─── 2. Gerencia Conversa ─────────────────────────────────────────
        # NOTA: o cancelamento de follow-ups foi movido para DEPOIS de salvar
        # a mensagem. Motivo: se o webhook for duplicado e a mensagem for
        # descartada pela deduplicação (UNIQUE constraint), os follow-ups
        # NÃO devem ser cancelados — seriam cancelados indevidamente.
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
                # _msg_type já foi detectado por _extract_message_text()
                # Normaliza nomes para o schema do banco
                _type_map = {
                    "conversation": "text", "extendedTextMessage": "text",
                    "imageMessage": "image", "videoMessage": "video",
                    "audioMessage": "audio", "pttMessage": "audio",
                    "documentMessage": "document", "locationMessage": "location",
                    "stickerMessage": "text", "contactMessage": "text",
                    "reactionMessage": "text", "pollCreationMessage": "text",
                }
                db_msg_type = _type_map.get(_msg_type, "text")
                db.table("messages").insert({
                    "conversation_id":    conversation_id,
                    "client_id":          client_id,
                    "content":            message_text,
                    "sender_type":        "cliente",
                    "channel":            "whatsapp",
                    "is_from_client":     True,
                    "type":               db_msg_type,
                    "direction":          "inbound",
                    "provider_message_id": provider_message_id,
                }).execute()
                logger.info("Mensagem de %s salva na conversa %s: %.50s...", push_name, conversation_id, message_text)

                # Cancela follow-ups SOMENTE após a mensagem ser salva com sucesso.
                # Se o INSERT acima tivesse sido deduplicado (webhook duplicado),
                # já teríamos retornado antes — garantindo que não cancelamos
                # follow-ups por engano.
                try:
                    await cancel_pending_for_client(client_id, reason="cliente_respondeu")
                except Exception as _ce:
                    logger.warning("Erro ao cancelar follow-ups (não crítico): %s", _ce)

                # ── INTERCEPTAÇÃO DE NPS ───────────────────────────────────────
                try:
                    survey_res = db.table("nps_surveys").select("id").eq("customer_id", client_id).eq("status", "sent").execute()
                    if survey_res.data:
                        survey_id = survey_res.data[0]["id"]
                        logger.info("Processando resposta %s como NPS para o client %s", message_text, client_id)
                        
                        # Processa com a IA
                        from nps_agent import process_nps_response
                        nps_result = await process_nps_response(survey_id, message_text)
                        
                        cls = nps_result.get("classification")
                        sent = nps_result.get("sentiment")

                        import uazapi_client
                        db_inst = db.table("whatsapp_instances").select("*").eq("status", "connected").limit(1).execute()
                        if db_inst.data:
                            i = db_inst.data[0]
                            # Positivo: manda pro Google
                            if cls == "promotor" or sent == "positivo":
                                gmb_res = db.table("tenants").select("google_mybusiness_url").limit(1).execute()
                                gmb_url = gmb_res.data[0].get("google_mybusiness_url") if gmb_res.data else ""
                                if gmb_url:
                                    reply = f"Ficamos muito felizes que tenha gostado! 🥰 Você pode nos ajudar avaliando a loja no Google usando esse link?\n\n{gmb_url}\n\nMuito obrigado pela confiança!"
                                    await uazapi_client.uazapi.send_text(i["api_url"], i["api_token"], i["instance_name"], phone, reply)
                                else:
                                    reply = "Ficamos muito felizes que tenha gostado! 🥰 Muito obrigado pela confiança e volte sempre!"
                                    await uazapi_client.uazapi.send_text(i["api_url"], i["api_token"], i["instance_name"], phone, reply)
                            
                            # Negativo: pede desculpas e evita enviar link
                            elif cls == "detrator" or sent == "negativo":
                                reply = "Poxa, sentimos muito pela sua experiência. 😔 Já acionamos a gerência para verificar o que houve e resolver qualquer problema. Agradecemos o feedback sincero para continuarmos melhorando!"
                                await uazapi_client.uazapi.send_text(i["api_url"], i["api_token"], i["instance_name"], phone, reply)
                        
                        # Interrompe o fluxo para que a automação de leads (watcher_agent) não tente mover o card
                        return {"status": "ok", "message": "NPS response processed"}
                except Exception as e:
                    logger.error("Erro ao interceptar NPS: %s", e)

            except Exception as e:
                err_str = str(e).lower()
                # ─── Detecção de UNIQUE violation ───────────────────────────────
                # Se o INSERT falhou por duplicata de provider_message_id (UNIQUE constraint),
                # significa que outro webhook já processou esta mensagem em paralelo.
                # NÃO fazemos fallback — interrompe imediatamente para evitar:
                #   1. Criar schedules de follow-up duplicados
                #   2. Disparar Jarvis duplicado
                #   3. Criar oportunidade duplicada
                is_duplicate = any(kw in err_str for kw in [
                    "duplicate", "unique", "23505", "already exists", "violates"
                ])
                if is_duplicate:
                    logger.info(
                        "Webhook duplicado detectado via UNIQUE constraint — "
                        "abortando processamento de %s para evitar duplicatas", phone
                    )
                    return {"status": "ignored", "reason": "mensagem duplicada (constraint db)"}

                logger.error("Erro ao salvar mensagem (colunas faltando? rode a migration): %s", e)
                # Fallback apenas para erros NÃO relacionados a duplicatas
                # (ex: coluna não existe — migration pendente)
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

                elif existing_opp["stage"] == "comprador":
                    # Lógica de Avaliação Pós-Venda (Google Meu Negócio)
                    opportunity_action = "existing_comprador_review_check"
                    try:
                        from openai import AsyncOpenAI
                        from config import get_settings
                        _client = AsyncOpenAI(api_key=get_settings().openai_api_key)
                        prompt = f"""O cliente acabou de fazer uma compra e foi solicitado a avaliar a experiência.
Mensagem do cliente: {message_text}

Responda APENAS "SIM" se for um feedback positivo/elogio explícito sobre a compra/loja, ou "NAO" se for negativo, neutro, dúvida ou qualquer outra coisa. Seja estrito: só diga SIM para elogios reais."""
                        
                        response = await _client.chat.completions.create(
                            model="gpt-4o-mini",
                            messages=[{"role": "user", "content": prompt}],
                            temperature=0.0,
                            max_tokens=10,
                        )
                        content = (response.choices[0].message.content or "").strip().upper()
                        
                        if "SIM" in content:
                            gmb_res = db.table("tenants").select("google_mybusiness_url").limit(1).execute()
                            gmb_link = ""
                            if gmb_res.data and gmb_res.data[0].get("google_mybusiness_url"):
                                gmb_link = gmb_res.data[0]["google_mybusiness_url"]
                            
                            if gmb_link:
                                reply_msg = f"Ficamos muito felizes que gostou! 😍\nVocê poderia nos avaliar no Google rapidinho? Isso nos ajuda muito!\n👉 {gmb_link}"
                                wp_res = db.table("whatsapp_instances").select("*").eq("status", "connected").limit(1).execute()
                                if wp_res.data:
                                    wp = wp_res.data[0]
                                    await uazapi.send_text(
                                        api_url=wp["api_url"],
                                        api_token=wp["api_token"],
                                        instance_name=wp["instance_name"],
                                        phone=phone,
                                        message=reply_msg,
                                        instance_token=wp.get("instance_token")
                                    )
                                    logger.info("Feedback positivo de comprador %s — link GMB enviado!", phone)
                                    opportunity_action = "existing_comprador_gmb_sent"
                    except Exception as e:
                        logger.warning("Falha ao analisar feedback de comprador: %s", e)
                        opportunity_action = f"existing_comprador_error_{e}"

                elif existing_opp["stage"] in ("perdido", "desqualificado"):
                    # Contato voltou após ter sido perdido/desqualificado → reabre como lead_novo
                    ins = db.table("opportunities").insert({
                        "title": f"Lead WhatsApp - {push_name or phone}",
                        "client_id": client_id,
                        "stage": "lead_novo",
                        "estimated_value": 0,
                    }).execute()
                    if ins.data:
                        opportunity_action = "reactivated_lead_novo"
                        logger.info(
                            "Contato reativado: %s estava em '%s', nova oportunidade criada em lead_novo",
                            phone, existing_opp["stage"],
                        )
                        try:
                            await on_stage_change(
                                client_id=str(client_id),
                                opportunity_id=str(ins.data[0]["id"]),
                                new_stage="lead_novo",
                                old_stage=None,
                            )
                        except Exception as fe:
                            logger.warning("Erro ao acionar follow-up de 'lead_novo' reativado (não crítico): %s", fe)
                    else:
                        opportunity_action = "reactivate_failed"
                        logger.error("Falha ao reativar oportunidade para %s", phone)

                else:
                    # Oportunidade em etapa ativa (lead_novo, contato_iniciado, interessado) → analisa mensagem
                    old_stage = existing_opp["stage"]
                    opportunity_action = f"existing_{old_stage}"

                    # ─── Regra Determinística: lead_novo → contato_iniciado ────────
                    # Se o lead está em lead_novo e QUALQUER mensagem chega, ele já
                    # é contato_iniciado — não precisa de IA para isso.
                    # A IA só é usada para avanços mais significativos (→ interessado, → comprador).
                    if old_stage == "lead_novo":
                        try:
                            db.table("opportunities").update({
                                "stage": "contato_iniciado",
                            }).eq("id", existing_opp["id"]).execute()
                            opportunity_action = "advanced_to_contato_iniciado"
                            logger.info(
                                "lead_novo → contato_iniciado (regra determinística): %s (%s)",
                                push_name, phone,
                            )
                            try:
                                await on_stage_change(
                                    client_id=str(client_id),
                                    opportunity_id=str(existing_opp["id"]),
                                    new_stage="contato_iniciado",
                                    old_stage="lead_novo",
                                )
                            except Exception as fe:
                                logger.warning("Erro ao acionar follow-up de contato_iniciado (não crítico): %s", fe)
                        except Exception as e:
                            logger.warning("Erro ao mover lead_novo → contato_iniciado: %s", e)

                    else:
                        # Para contato_iniciado e interessado → usa IA (Watcher Agent)
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

            # analyze_client_intent retorna True/False/None
            # None = IA indisponível — não penaliza o lead, apenas pula a resposta automática
            if is_new:
                logger.info("Cliente novo (primeira mensagem): Pulando IA (Jarvis) por regra de negócio.")
                intent = False
            else:
                intent = await jarvis.analyze_client_intent(message_text) if message_text else False

            reply = None
            if intent is not False:  # True ou None (incerto) → tenta responder
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
                        resp = await uazapi.send_text(
                            api_url=inst["api_url"],
                            api_token=inst["api_token"],
                            instance_name=inst["instance_name"],
                            phone=phone,
                            message=reply,
                        )
                        
                        if "error" in resp:
                            logger.error("Jarvis: falha ao enviar resposta para %s: %s (%s)", 
                                         push_name, resp.get("error"), resp.get("error_code"))
                        else:
                            db.table("messages").insert({
                                "conversation_id": conversation_id,
                                "client_id": client_id,
                                "content": reply,
                                "sender_type": "agent",
                                "channel": "whatsapp",
                                "is_from_client": False,
                                "type": "text",
                                "direction": "outbound",
                                "provider_message_id": resp.get("id") or resp.get("messageId"),
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
