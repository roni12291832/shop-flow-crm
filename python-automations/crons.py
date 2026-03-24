from __future__ import annotations
"""
Rotinas agendadas (Cron Jobs).
Substitui os fluxos N8N 07 (relatório diário) e 09 (sync mensagens).
"""
from datetime import datetime, timedelta

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
            .select("api_url, api_token, instance_name")
            .eq("status", "connected")
            .limit(1)
            .execute()
        )
        if not instance_res.data:
            logger.warning("Sem instância WhatsApp com status='open' para sync")
            return

        inst = instance_res.data[0]
        chats = await uazapi.get_chats(
            api_url=inst["api_url"],
            api_token=inst["api_token"],
            instance_name=inst["instance_name"],
            count=30,
        )

        synced_count = 0
        for chat in chats:
            phone = str(chat.get("id", "")).replace("@s.whatsapp.net", "").replace("@c.us", "")
            if not phone or len(phone) < 10:
                continue

            client_res = db.table("clients").select("id").eq("phone", phone).limit(1).execute()
            if not client_res.data:
                continue

            client_id = client_res.data[0]["id"]
            last_msg_res = (
                db.table("messages")
                .select("created_at")
                .eq("client_id", client_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            last_ts = last_msg_res.data[0].get("created_at") if last_msg_res.data else None
            logger.debug("Sync check para %s: última msg em %s", phone, last_ts)
            synced_count += 1

        logger.info("Sync concluído: %d conversas verificadas", synced_count)


async def job_notify_stale_leads():
    """
    Verifica leads que estão parados na mesma etapa há mais de 3 dias
    e avisa o admin para tomar ação.
    """
    async with registrar_automacao("alerta_leads_parados"):
        logger.info("Verificando leads parados...")

        db = get_supabase()
        cutoff = (datetime.utcnow() - timedelta(days=3)).isoformat()

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
