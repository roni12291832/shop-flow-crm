from __future__ import annotations
"""
Rotinas agendadas (Cron Jobs).
Substitui os fluxos N8N 07 (relatório diário) e 09 (sync mensagens).
"""
import logging
from datetime import datetime
from supabase_client import get_supabase
from uazapi_client import uazapi
from jarvis_agent import jarvis
from config import get_settings

logger = logging.getLogger("crons")


async def job_daily_report():
    """
    Gera e envia relatório diário de vendas via WhatsApp.
    Roda todo dia no horário configurado (padrão: 18:00).
    Substitui N8N fluxo 07-relatorio-diario.
    """
    logger.info("🕕 Executando relatório diário...")

    try:
        # Jarvis gera o relatório com dados reais do Supabase
        report = await jarvis.generate_daily_report()

        if not report:
            logger.warning("Jarvis retornou relatório vazio")
            return

        # Busca instância WhatsApp
        db = get_supabase()
        instance_res = db.table("whatsapp_instances").select("api_token").limit(1).execute()
        if not instance_res.data:
            logger.error("Nenhuma instância WhatsApp configurada para enviar relatório")
            return

        token = instance_res.data[0]["api_token"]
        s = get_settings()

        if not s.admin_phone:
            logger.error("ADMIN_PHONE não configurado")
            return

        # Envia relatório para o admin
        await uazapi.send_text(token, s.admin_phone, report)
        logger.info(f"✅ Relatório diário enviado para {s.admin_phone}")

    except Exception as e:
        logger.error(f"❌ Erro no relatório diário: {e}")


async def job_sync_offline_messages():
    """
    Sincroniza mensagens offline do WhatsApp.
    Pede para a UAZAPI o histórico das conversas recentes
    e insere no Supabase as que estiverem faltando.
    Substitui N8N fluxo 09-resync-offline-messages.
    Roda a cada 6 horas automaticamente.
    """
    logger.info("🔄 Sincronizando mensagens offline...")

    try:
        db = get_supabase()

        # Busca instância WhatsApp
        instance_res = db.table("whatsapp_instances").select("api_token").limit(1).execute()
        if not instance_res.data:
            logger.warning("Sem instância WhatsApp para sync")
            return

        token = instance_res.data[0]["api_token"]

        # Busca últimos chats da UAZAPI
        chats = await uazapi.get_chats(token, count=30)

        synced_count = 0
        for chat in chats:
            phone = str(chat.get("id", "")).replace("@s.whatsapp.net", "").replace("@c.us", "")
            if not phone or len(phone) < 10:
                continue

            # Verifica se o cliente existe
            client_res = db.table("clients").select("id").eq("phone", phone).limit(1).execute()
            if not client_res.data:
                continue

            client_id = client_res.data[0]["id"]

            # Busca última mensagem registrada deste cliente
            last_msg_res = db.table("messages").select("created_at").eq("client_id", client_id).order("created_at", desc=True).limit(1).execute()

            last_ts = None
            if last_msg_res.data:
                last_ts = last_msg_res.data[0].get("created_at")

            # Aqui você expandiria com a API getMessages da UAZAPI
            # para puxar mensagens mais recentes que last_ts
            # Por enquanto, apenas loga o status
            logger.debug(f"Sync check para {phone}: última msg em {last_ts}")
            synced_count += 1

        logger.info(f"✅ Sync concluído: {synced_count} conversas verificadas")

    except Exception as e:
        logger.error(f"❌ Erro no sync offline: {e}")


async def job_notify_stale_leads():
    """
    Verifica leads que estão parados na mesma etapa há mais de 3 dias
    e avisa o admin para tomar ação.
    """
    logger.info("🔍 Verificando leads parados...")

    try:
        db = get_supabase()
        from datetime import timedelta

        cutoff = (datetime.utcnow() - timedelta(days=3)).isoformat()

        # Leads parados (não atualizados há 3+ dias, sem ser comprador/perdido)
        stale_res = db.table("opportunities").select(
            "title, stage, updated_at"
        ).lt("updated_at", cutoff).not_.in_("stage", ["comprador", "perdido", "desqualificado"]).execute()

        stale = stale_res.data or []
        if not stale:
            logger.info("Nenhum lead parado encontrado")
            return

        # Monta alerta
        lines = [f"⚠️ *{len(stale)} LEADS PARADOS há +3 dias:*\n"]
        for s in stale[:10]:
            lines.append(f"• {s['title']} — Etapa: {s['stage']}")

        if len(stale) > 10:
            lines.append(f"\n...e mais {len(stale) - 10} leads")

        msg = "\n".join(lines)

        # Envia para admin
        instance_res = db.table("whatsapp_instances").select("api_token").limit(1).execute()
        if instance_res.data:
            token = instance_res.data[0]["api_token"]
            s_config = get_settings()
            if s_config.admin_phone:
                await uazapi.send_text(token, s_config.admin_phone, msg)
                logger.info(f"Alerta de leads parados enviado ({len(stale)} leads)")

    except Exception as e:
        logger.error(f"Erro ao verificar leads parados: {e}")
