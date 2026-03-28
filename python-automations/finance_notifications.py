from __future__ import annotations
"""
Notificações Financeiras — envia alertas de contas a pagar e vencidas ao admin.
Roda todo dia às 08h via APScheduler.
"""
import logging
from datetime import datetime, timedelta
import pytz

from core import logger, DRY_RUN, registrar_automacao
from supabase_client import get_supabase
from uazapi_client import uazapi
from config import get_settings

BRASILIA = pytz.timezone("America/Sao_Paulo")


async def job_finance_notifications():
    """
    Verifica contas vencidas e que vencem em 3 dias.
    Envia resumo financeiro via WhatsApp para o admin.
    """
    async with registrar_automacao("finance_notifications"):
        logger.info("Verificando notificações financeiras...")
        db = get_supabase()
        s = get_settings()

        now_br = datetime.now(BRASILIA)
        today = now_br.date()
        in_3_days = today + timedelta(days=3)

        # Contas vencendo nos próximos 3 dias
        try:
            due_soon_res = (
                db.table("lancamentos")
                .select("*")
                .eq("type", "saida")
                .eq("status", "pendente")
                .lte("due_date", in_3_days.isoformat())
                .gte("due_date", today.isoformat())
                .execute()
            )
            due_soon = due_soon_res.data or []
        except Exception as e:
            logger.warning("Erro ao buscar contas a vencer (coluna due_date pode não existir): %s", e)
            due_soon = []

        # Contas vencidas (não pagas)
        try:
            overdue_res = (
                db.table("lancamentos")
                .select("*")
                .eq("type", "saida")
                .eq("status", "pendente")
                .lt("due_date", today.isoformat())
                .execute()
            )
            overdue = overdue_res.data or []
        except Exception as e:
            logger.warning("Erro ao buscar contas vencidas: %s", e)
            overdue = []

        if not due_soon and not overdue:
            logger.info("Nenhuma notificação financeira para enviar hoje")
            return

        # Montar mensagem
        msg_parts = [f"💰 *Resumo Financeiro — {today.strftime('%d/%m/%Y')}*\n"]

        if overdue:
            total_overdue = sum(float(l.get("value", 0) or l.get("amount", 0) or 0) for l in overdue)
            msg_parts.append(f"🔴 *Contas VENCIDAS:* {len(overdue)} — R$ {total_overdue:,.2f}")
            for item in overdue[:5]:
                desc = item.get("description", item.get("categoria", "Sem descrição"))
                val = float(item.get("value", item.get("amount", 0)) or 0)
                msg_parts.append(f"  • {desc} — R$ {val:,.2f}")
            if len(overdue) > 5:
                msg_parts.append(f"  ...e mais {len(overdue) - 5}")

        if due_soon:
            total_soon = sum(float(l.get("value", 0) or l.get("amount", 0) or 0) for l in due_soon)
            msg_parts.append(f"\n🟡 *Vencem em 3 dias:* {len(due_soon)} — R$ {total_soon:,.2f}")
            for item in due_soon[:5]:
                desc = item.get("description", item.get("categoria", "Sem descrição"))
                val = float(item.get("value", item.get("amount", 0)) or 0)
                due = item.get("due_date", "")
                msg_parts.append(f"  • {desc} — R$ {val:,.2f} (vence {due})")

        msg_parts.append("\n_Acesse o módulo Financeiro para detalhes._")
        message = "\n".join(msg_parts)

        # Buscar instância WhatsApp
        instance_res = (
            db.table("whatsapp_instances")
            .select("api_url, api_token, instance_name")
            .eq("status", "connected")
            .limit(1)
            .execute()
        )
        if not instance_res.data:
            logger.warning("Sem instância WhatsApp para notificações financeiras")
            return

        inst = instance_res.data[0]
        if not s.admin_phone:
            logger.warning("ADMIN_PHONE não configurado — notificação financeira não enviada")
            return

        if DRY_RUN:
            logger.info("[DRY_RUN] Notificação financeira: %s", message[:100])
            return

        await uazapi.send_text(
            api_url=inst["api_url"],
            api_token=inst["api_token"],
            instance_name=inst["instance_name"],
            phone=s.admin_phone,
            message=message,
        )
        logger.info("Notificação financeira enviada para %s", s.admin_phone)
