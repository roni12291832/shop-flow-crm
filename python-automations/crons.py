from __future__ import annotations
"""
Rotinas agendadas (Cron Jobs).
Substitui os fluxos N8N 07 (relatório diário) e 09 (sync mensagens).
"""
from datetime import datetime, timedelta, timezone

from core import logger, DRY_RUN, registrar_automacao, alertar_dono
from supabase_client import get_supabase
from uazapi_client import uazapi
from jarvis_agent import jarvis
from config import get_settings


async def job_daily_report():
    """
    Gera e envia relatório diário de vendas via WhatsApp.
    Roda todo dia no horário configurado (padrão: 18:00).
    Substitui N8N fluxo 07-relatorio-diario.
    """
    async with registrar_automacao("relatorio_diario"):
        logger.info("Executando relatório diário...")

        report = await jarvis.generate_daily_report()
        if not report:
            logger.warning("Jarvis retornou relatório vazio")
            return

        db = get_supabase()
        instance_res = (
            db.table("whatsapp_instances")
            .select("api_url, api_token, instance_name")
            .eq("status", "connected")
            .limit(1)
            .execute()
        )
        if not instance_res.data:
            logger.error("Nenhuma instância WhatsApp com status='open' para enviar relatório")
            return

        inst = instance_res.data[0]
        s = get_settings()

        if not s.admin_phone:
            logger.error("ADMIN_PHONE não configurado no .env")
            return

        if DRY_RUN:
            logger.info("[DRY_RUN] Enviaria relatório para %s: %.100s...", s.admin_phone, report)
            return

        await uazapi.send_text(
            api_url=inst["api_url"],
            api_token=inst["api_token"],
            instance_name=inst["instance_name"],
            phone=s.admin_phone,
            message=report,
        )
        logger.info("Relatório diário enviado para %s", s.admin_phone)


async def job_sync_offline_messages():
    """
    Sincroniza mensagens offline do WhatsApp.
    Pede para a UAZAPI o histórico das conversas recentes
    e insere no Supabase as que estiverem faltando.
    Substitui N8N fluxo 09-resync-offline-messages.
    Roda a cada 6 horas automaticamente.
    """
    async with registrar_automacao("sync_mensagens_offline"):
        logger.info("Sincronizando mensagens offline...")

        db = get_supabase()
        instance_res = (
            db.table("whatsapp_instances")
            .select("api_url, api_token, instance_token, instance_name")
            .eq("status", "connected")
            .limit(1)
            .execute()
        )
        if not instance_res.data:
            logger.warning("Sem instância WhatsApp conectada para sync")
            return

        inst = instance_res.data[0]
        token = inst.get("instance_token") or inst["api_token"]

        chats = await uazapi.get_chats(
            api_url=inst["api_url"],
            instance_token=token,
            count=30,
        )

        synced_count = 0
        inserted_count = 0

        for chat in chats:
            phone = chat.get("phone", "")
            if not phone or len(phone) < 10:
                continue

            client_res = db.table("clients").select("id").eq("phone", phone).limit(1).execute()
            if not client_res.data:
                continue

            client_id = client_res.data[0]["id"]

            # Busca última mensagem salva no Supabase para este cliente
            last_msg_res = (
                db.table("messages")
                .select("created_at")
                .eq("client_id", client_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            last_ts_raw = last_msg_res.data[0].get("created_at") if last_msg_res.data else None
            # Converte para datetime para comparação segura (evita problemas de formato ISO)
            last_ts_dt = None
            if last_ts_raw:
                try:
                    last_ts_dt = datetime.fromisoformat(last_ts_raw.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    last_ts_dt = None

            # Busca mensagens do WhatsApp para este chat
            chat_jid = chat.get("id", "")
            if not chat_jid:
                continue

            wa_messages = await uazapi.get_messages(
                api_url=inst["api_url"],
                instance_token=token,
                chat_id=chat_jid,
                count=20,
            )

            if not wa_messages:
                continue

            # Busca ou cria conversa aberta para este cliente
            conv_res = (
                db.table("conversations")
                .select("id")
                .eq("client_id", client_id)
                .in_("status", ["aberta", "em_atendimento", "aguardando"])
                .order("last_message_at", desc=True)
                .limit(1)
                .execute()
            )
            conversation_id = conv_res.data[0]["id"] if conv_res.data else None

            if not conversation_id:
                # Cria conversa se não existe
                try:
                    conv_insert = db.table("conversations").insert({
                        "client_id": client_id,
                        "status": "aberta",
                        "last_message": wa_messages[-1].get("text", "")[:100] if wa_messages else "",
                        "last_message_at": datetime.now(timezone.utc).isoformat(),
                    }).execute()
                    if conv_insert.data:
                        conversation_id = conv_insert.data[0]["id"]
                except Exception as e:
                    logger.warning("Erro ao criar conversa para sync de %s: %s", phone, e)
                    continue

            # Insere mensagens que não existem ainda no Supabase
            for msg in wa_messages:
                msg_text = msg.get("text", "")
                if not msg_text:
                    continue

                # Converte timestamp UAZAPI para datetime
                ts = msg.get("timestamp")
                if isinstance(ts, (int, float)):
                    msg_time_dt = datetime.fromtimestamp(ts, tz=timezone.utc)
                elif isinstance(ts, str):
                    try:
                        msg_time_dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    except (ValueError, TypeError):
                        msg_time_dt = datetime.now(timezone.utc)
                else:
                    msg_time_dt = datetime.now(timezone.utc)

                # Pula se a mensagem é anterior à última salva (comparação datetime, não string)
                if last_ts_dt and msg_time_dt <= last_ts_dt:
                    continue

                msg_time = msg_time_dt.isoformat()

                try:
                    if not DRY_RUN:
                        # Usa provider_message_id para evitar duplicatas com mensagens do webhook
                        msg_provider_id = msg.get("id") or None
                        if msg_provider_id:
                            # Verifica se já existe antes de inserir
                            dup_check = (
                                db.table("messages")
                                .select("id")
                                .eq("provider_message_id", msg_provider_id)
                                .limit(1)
                                .execute()
                            )
                            if dup_check.data:
                                continue  # já foi inserida pelo webhook

                        db.table("messages").insert({
                            "conversation_id": conversation_id,
                            "client_id": client_id,
                            "content": msg_text,
                            "sender_type": "atendente" if msg.get("from_me") else "cliente",
                            "channel": "whatsapp",
                            "is_from_client": not msg.get("from_me", False),
                            "provider_message_id": msg_provider_id,
                        }).execute()
                        inserted_count += 1
                except Exception as e:
                    logger.debug("Erro ao inserir msg sync para %s: %s", phone, e)

            synced_count += 1

        logger.info(
            "Sync concluído: %d conversas verificadas, %d mensagens inseridas",
            synced_count, inserted_count,
        )


async def job_notify_stale_leads():
    """
    Verifica leads que estão parados na mesma etapa há mais de 3 dias
    e avisa o admin para tomar ação.
    """
    async with registrar_automacao("alerta_leads_parados"):
        logger.info("Verificando leads parados...")

        db = get_supabase()
        cutoff = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()

        stale_res = (
            db.table("opportunities")
            .select("title, stage, updated_at")
            .lt("updated_at", cutoff)
            .not_.in_("stage", ["comprador", "perdido", "desqualificado"])
            .execute()
        )
        stale = stale_res.data or []

        if not stale:
            logger.info("Nenhum lead parado encontrado")
            return

        lines = [f"⚠️ *{len(stale)} LEADS PARADOS há +3 dias:*\n"]
        for lead in stale[:10]:
            lines.append(f"• {lead['title']} — Etapa: {lead['stage']}")
        if len(stale) > 10:
            lines.append(f"\n...e mais {len(stale) - 10} leads")

        msg = "\n".join(lines)

        instance_res = (
            db.table("whatsapp_instances")
            .select("api_url, api_token, instance_name")
            .eq("status", "connected")
            .limit(1)
            .execute()
        )
        if not instance_res.data:
            logger.warning("Sem instância WhatsApp para enviar alerta de leads parados")
            return

        inst = instance_res.data[0]
        s_config = get_settings()
        if not s_config.admin_phone:
            logger.warning("ADMIN_PHONE não configurado — alerta de leads não enviado")
            return

        if DRY_RUN:
            logger.info("[DRY_RUN] Enviaria alerta de %d leads parados para %s", len(stale), s_config.admin_phone)
            return

        await uazapi.send_text(
            api_url=inst["api_url"],
            api_token=inst["api_token"],
            instance_name=inst["instance_name"],
            phone=s_config.admin_phone,
            message=msg,
        )
        logger.info("Alerta de leads parados enviado (%d leads)", len(stale))


async def job_send_post_sale_nps():
    """
    Envia pedido de avaliação via WhatsApp 3 minutos após
    o registro de uma nova venda (status='confirmado').
    """
    async with registrar_automacao("nps_pos_venda_5min"):
        db = get_supabase()

        # Janela: vendas confirmadas nos últimos 60 minutos, e com >= 5 minutos de idade
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
        start_window = datetime.now(timezone.utc) - timedelta(minutes=60)
        
        sales_res = (
            db.table("sales_entries")
            .select("id, customer_id, created_at")
            .eq("status", "confirmado")
            .gte("created_at", start_window.isoformat())
            .lte("created_at", cutoff.isoformat())
            .execute()
        )
        sales = sales_res.data or []
        if not sales:
            return

        # Pega IDs das vendas que já receberam NPS (para evitar duplicatas)
        sale_ids = [s["id"] for s in sales]
        sent_res = (
            db.table("nps_surveys")
            .select("reference_id")
            .in_("reference_id", sale_ids)
            .execute()
        )
        sent_ids = {s.get("reference_id") for s in (sent_res.data or []) if s.get("reference_id")}

        pending_sales = [s for s in sales if s["id"] not in sent_ids]
        if not pending_sales:
            return

        instance_res = (
            db.table("whatsapp_instances")
            .select("api_url, api_token, instance_name")
            .eq("status", "connected")
            .limit(1)
            .execute()
        )
        if not instance_res.data:
            return
        inst = instance_res.data[0]

        ativos = 0
        for sale in pending_sales:
            # Pega dados do cliente para personalizar mensagem
            cl_res = db.table("clients").select("id, name, phone, tenant_id").eq("id", sale["customer_id"]).execute()
            if not cl_res.data:
                continue
            client = cl_res.data[0]
            phone = client.get("phone")
            name = client.get("name") or "Cliente"
            first_name = name.split()[0]
            if not phone:
                continue

            # Registra no BD que enviamos a survey
            # Adicionamos status=sent e triggered_by=after_sale
            survey_data = {
                "tenant_id": client.get("tenant_id"),
                "customer_id": client["id"],
                "triggered_by": "after_sale",
                "reference_id": sale["id"],
                "status": "sent"
            }
            res_survey = db.table("nps_surveys").insert(survey_data).execute()
            if not res_survey.data:
                logger.warning("Falha ao registrar envio de NPS no BD para %s", phone)
                continue

            msg = f"Oi {first_name}! Tudo bem?\n\nPercebemos que você fez uma compra com a gente agora pouco. Como foi a sua experiência na loja hoje? Se puder responder aqui, nos ajuda muito a melhorar (basta enviar como foi)!"
            
            if DRY_RUN:
                logger.info("[DRY_RUN] Enviaria NPS (3min pos-venda) para %s", phone)
            else:
                try:
                    await uazapi.send_text(
                        inst["api_url"], inst["api_token"], inst["instance_name"], phone, msg
                    )
                    ativos += 1
                except Exception as e:
                    logger.error("Erro enviando NPS 3min para %s: %s", phone, e)

        if ativos > 0:
            logger.info("Enviadas %d mensagens de NPS pós-venda (3 min)", ativos)


async def job_loyalty_2d_notification():
    """
    Notifica o cliente sobre os pontos ganhos 2 dias após a compra.
    """
    async with registrar_automacao("fidelidade_aviso_2d"):
        db = get_supabase()
        
        # Janela de 2 dias (entre 48h e 72h atrás)
        now = datetime.now(timezone.utc)
        start_48h = (now - timedelta(hours=72)).isoformat()
        end_48h = (now - timedelta(hours=48)).isoformat()

        # Busca vendas confirmadas nesse período
        # NOTA: Usamos sales_entries pois é o gatilho da compra
        sales_res = (
            db.table("sales_entries")
            .select("id, customer_id, value")
            .eq("status", "confirmado")
            .gte("created_at", start_48h)
            .lte("created_at", end_48h)
            .execute()
        )
        sales = sales_res.data or []
        if not sales:
            return

        # Busca configuração de fidelidade
        config_res = db.table("fidelidade_config").select("*").limit(1).execute()
        if not config_res.data:
            return
        config = config_res.data[0]
        msg_template = config.get("msg_template", "Olá {nome}! Você ganhou {pontos} pontos! Saldo: {total} pts.")

        instance_res = db.table("whatsapp_instances").select("*").eq("status", "connected").limit(1).execute()
        if not instance_res.data:
            return
        inst = instance_res.data[0]

        count = 0
        for sale in sales:
            # Verifica se já notificamos sobre esta venda (2d)
            dup_check = db.table("loyalty_notifications").select("id").eq("reference_id", sale["id"]).eq("notification_type", "notice_2d").execute()
            if dup_check.data:
                continue

            # Dados do cliente e saldo
            cl_res = db.table("clients").select("id, name, phone").eq("id", sale["customer_id"]).execute()
            if not cl_res.data or not cl_res.data[0].get("phone"):
                continue
            client = cl_res.data[0]
            
            ponto_res = db.table("cliente_pontos").select("pontos_total").eq("cliente_id", client["id"]).execute()
            if not ponto_res.data:
                continue
            total_pontos = float(ponto_res.data[0]["pontos_total"])

            # Pontos ganhos nesta venda específica
            item_res = db.table("pontos_historico").select("pontos").eq("venda_id", sale["id"]).eq("tipo", "ganho").execute()
            pontos_ganhos = float(item_res.data[0]["pontos"]) if item_res.data else (float(sale["value"]) * 0.1)

            # Personaliza mensagem
            msg = msg_template.replace("{nome}", client["name"].split()[0]) \
                              .replace("{pontos}", f"{pontos_ganhos:.2f}") \
                              .replace("{total}", f"{total_pontos:.2f}")

            if DRY_RUN:
                logger.info("[DRY_RUN] Enviaria aviso 2d para %s: %s", client["phone"], msg)
            else:
                try:
                    await uazapi.send_text(inst["api_url"], inst["api_token"], inst["instance_name"], client["phone"], msg)
                    db.table("loyalty_notifications").insert({
                        "customer_id": client["id"],
                        "reference_id": sale["id"],
                        "notification_type": "notice_2d"
                    }).execute()
                    count += 1
                except Exception as e:
                    logger.error("Erro no aviso 2d para %s: %s", client["phone"], e)

        if count > 0:
            logger.info("Enviados %d avisos de pontos (2 dias pós-venda)", count)


async def job_loyalty_expiration_warning():
    """
    Avisa o cliente que seus pontos expiram em 15 dias (se não comprar).
    Roda quando ultima_compra foi há 15 dias.
    """
    async with registrar_automacao("fidelidade_aviso_expiracao"):
        db = get_supabase()
        
        # Janela de 15 dias atrás
        cutoff_start = (datetime.now(timezone.utc) - timedelta(days=16)).isoformat()
        cutoff_end = (datetime.now(timezone.utc) - timedelta(days=15)).isoformat()

        wallets_res = (
            db.table("cliente_pontos")
            .select("*, cliente:clients(id, name, phone)")
            .gt("pontos_total", 0)
            .gte("ultima_compra", cutoff_start)
            .lte("ultima_compra", cutoff_end)
            .execute()
        )
        wallets = wallets_res.data or []
        if not wallets:
            return

        instance_res = db.table("whatsapp_instances").select("*").eq("status", "connected").limit(1).execute()
        if not instance_res.data:
            return
        inst = instance_res.data[0]

        count = 0
        for w in wallets:
            client = w["cliente"]
            if not client or not client.get("phone"):
                continue

            # Verifica se já notificamos (evita resend se rodar 2x)
            dup_check = db.table("loyalty_notifications").select("id").eq("customer_id", client["id"]).eq("notification_type", "warning_15d").gte("sent_at", (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()).execute()
            if dup_check.data:
                continue

            pts = float(w["pontos_total"])
            first_name = client["name"].split()[0]
            msg = f"Oi {first_name}! Notamos que você tem {pts:.2f} pontos acumulados no nosso Programa de Fidelidade. ✨\n\nPassando para avisar que eles expiram em 15 dias se não forem utilizados. Que tal aproveitar para garantir aquele item que você estava namorando? 🛍️"

            if DRY_RUN:
                logger.info("[DRY_RUN] Enviaria aviso expiração para %s: %s", client["phone"], msg)
            else:
                try:
                    await uazapi.send_text(inst["api_url"], inst["api_token"], inst["instance_name"], client["phone"], msg)
                    db.table("loyalty_notifications").insert({
                        "customer_id": client["id"],
                        "notification_type": "warning_15d"
                    }).execute()
                    count += 1
                except Exception as e:
                    logger.error("Erro no aviso expiração para %s: %s", client["phone"], e)

        if count > 0:
            logger.info("Enviados %d avisos de expiração de pontos (15 dias s/ compra)", count)

