from __future__ import annotations
"""
Motor de Follow-Up Automático.

Processa a fila de mensagens agendadas (followup_schedules) e dispara
via UAZAPI respeitando:
  - Janela horária 08h–18h (horário de Brasília, UTC-3)
  - Limite de 25 mensagens/dia (anti-bloqueio WhatsApp)
  - Delays aleatórios entre 3–30s entre envios
  - Cancelamento automático se cliente respondeu ou avançou no Pipeline

Chamado pelo APScheduler a cada hora em main.py.
"""

import asyncio
import random
from datetime import datetime, timezone, timedelta

from core import logger, DRY_RUN, registrar_automacao, alertar_dono
from supabase_client import get_supabase
from uazapi_client import uazapi

# Brasil = UTC-3 fixo (sem DST desde 2019)
BRT = timezone(timedelta(hours=-3))

# Janela horária permitida (horário Brasília)
WINDOW_START_HOUR = 8   # 08:00
WINDOW_END_HOUR   = 18  # 18:00 (não envia às 18h em diante)

# Limite diário de disparos (todas as conversas somadas)
DAILY_LIMIT = 25

# Stages que indicam que o lead evoluiu ou foi fechado — cancela follow-ups
CANCEL_STAGES = {"interessado", "comprador", "perdido", "desqualificado"}


def _is_within_window() -> bool:
    """Verifica se estamos dentro da janela de envio 08h–18h (BRT)."""
    now_brt = datetime.now(BRT)
    return WINDOW_START_HOUR <= now_brt.hour < WINDOW_END_HOUR


def _sent_today(db) -> int:
    """Conta quantas mensagens já foram enviadas hoje via followup."""
    today_brt = datetime.now(BRT).date().isoformat()
    res = (
        db.table("followup_logs")
        .select("id", count="exact")
        .eq("status", "sent")
        .gte("sent_at", f"{today_brt}T00:00:00-03:00")
        .execute()
    )
    return res.count or 0


def _personalize(message: str, client: dict) -> str:
    """Substitui variáveis de template pela info real do cliente."""
    name = client.get("name", "").split()[0] if client.get("name") else "Olá"
    return (
        message
        .replace("{nome}", name)
        .replace("{name}", name)
        .replace("{phone}", client.get("phone", ""))
    )


async def cancel_pending_for_client(client_id: str, reason: str = "cliente_respondeu") -> int:
    """
    Cancela todos os follow-ups pendentes de um cliente.
    Chamado pelo webhook quando o cliente envia uma mensagem.
    Retorna quantos foram cancelados.
    """
    db = get_supabase()
    try:
        res = (
            db.table("followup_schedules")
            .update({"status": "cancelled", "cancel_reason": reason})
            .eq("client_id", client_id)
            .eq("status", "pending")
            .execute()
        )
        cancelled = len(res.data or [])
        if cancelled:
            logger.info(
                "Follow-ups cancelados para cliente %s (%d agendamentos, motivo: %s)",
                client_id, cancelled, reason,
            )
        return cancelled
    except Exception as e:
        logger.warning("Erro ao cancelar follow-ups do cliente %s: %s", client_id, e)
        return 0


async def schedule_followup_for_lead(
    client_id: str,
    opportunity_id: str | None = None,
) -> int:
    """
    Cria agendamentos de follow-up para um lead recém-criado.
    Busca o template ativo e agenda cada step conforme delay_hours.
    Retorna quantos agendamentos foram criados.
    """
    db = get_supabase()

    # Verifica se já tem agendamentos pendentes para este cliente
    existing = (
        db.table("followup_schedules")
        .select("id")
        .eq("client_id", client_id)
        .eq("status", "pending")
        .limit(1)
        .execute()
    )
    if existing.data:
        logger.info("Cliente %s já tem follow-ups agendados — ignorando", client_id)
        return 0

    # Busca template ativo
    tmpl_res = (
        db.table("followup_templates")
        .select("id")
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if not tmpl_res.data:
        logger.info("Nenhum template de follow-up ativo — sequência não criada para cliente %s", client_id)
        return 0

    template_id = tmpl_res.data[0]["id"]

    # Busca steps do template ordenados por step_number
    steps_res = (
        db.table("followup_steps")
        .select("id, step_number, delay_hours")
        .eq("template_id", template_id)
        .order("step_number")
        .execute()
    )
    steps = steps_res.data or []
    if not steps:
        logger.info("Template %s sem steps — nenhum agendamento criado", template_id)
        return 0

    now = datetime.now(timezone.utc)
    accumulated_hours = 0
    inserts = []

    for step in steps:
        accumulated_hours += step["delay_hours"]
        scheduled_for = now + timedelta(hours=accumulated_hours)
        inserts.append({
            "client_id": client_id,
            "step_id": step["id"],
            "opportunity_id": opportunity_id,
            "scheduled_for": scheduled_for.isoformat(),
            "status": "pending",
        })

    if DRY_RUN:
        logger.info("[DRY_RUN] Criaria %d agendamentos para cliente %s", len(inserts), client_id)
        return len(inserts)

    res = db.table("followup_schedules").insert(inserts).execute()
    created = len(res.data or [])
    logger.info("Criados %d agendamentos de follow-up para cliente %s", created, client_id)
    return created


async def job_process_followups() -> None:
    """
    Job principal — processa todos os follow-ups pendentes e devidos.
    Chamado pelo APScheduler a cada hora.
    """
    async with registrar_automacao("followup_engine"):
        if not _is_within_window():
            logger.info(
                "Follow-up: fora da janela horária (08h–18h BRT) — aguardando próxima execução"
            )
            return

        db = get_supabase()

        sent_today = _sent_today(db)
        if sent_today >= DAILY_LIMIT:
            logger.info(
                "Follow-up: limite diário atingido (%d/%d) — aguardando amanhã",
                sent_today, DAILY_LIMIT,
            )
            return

        remaining = DAILY_LIMIT - sent_today
        now_utc = datetime.now(timezone.utc).isoformat()

        # Busca follow-ups pendentes com scheduled_for <= agora
        pending_res = (
            db.table("followup_schedules")
            .select("id, client_id, step_id, opportunity_id")
            .eq("status", "pending")
            .lte("scheduled_for", now_utc)
            .order("scheduled_for")
            .limit(remaining)
            .execute()
        )
        pending = pending_res.data or []

        if not pending:
            logger.info("Follow-up: nenhum agendamento pendente no momento")
            return

        logger.info("Follow-up: %d agendamentos para processar (limite restante: %d)", len(pending), remaining)

        # Busca instância WhatsApp conectada
        wp_res = (
            db.table("whatsapp_instances")
            .select("api_url, api_token, instance_name, instance_token")
            .eq("status", "connected")
            .limit(1)
            .execute()
        )
        if not wp_res.data:
            logger.warning("Follow-up: nenhuma instância WhatsApp conectada — abortando")
            return

        wp = wp_res.data[0]

        for i, schedule in enumerate(pending):
            client_id    = schedule["client_id"]
            step_id      = schedule["step_id"]
            opp_id       = schedule.get("opportunity_id")
            schedule_id  = schedule["id"]

            # Verifica se o cliente avançou para um stage que cancela o follow-up
            if opp_id:
                opp_res = (
                    db.table("opportunities")
                    .select("stage")
                    .eq("id", opp_id)
                    .limit(1)
                    .execute()
                )
                if opp_res.data:
                    stage = opp_res.data[0]["stage"]
                    if stage in CANCEL_STAGES:
                        db.table("followup_schedules").update({
                            "status": "cancelled",
                            "cancel_reason": f"stage_{stage}",
                        }).eq("id", schedule_id).execute()
                        logger.info(
                            "Follow-up %s cancelado: oportunidade em stage '%s'",
                            schedule_id, stage,
                        )
                        continue

            # Busca dados do cliente e mensagem do step
            client_res = (
                db.table("clients")
                .select("id, name, phone")
                .eq("id", client_id)
                .limit(1)
                .execute()
            )
            step_res = (
                db.table("followup_steps")
                .select("message, step_number")
                .eq("id", step_id)
                .limit(1)
                .execute()
            )

            if not client_res.data or not step_res.data:
                db.table("followup_schedules").update({
                    "status": "cancelled",
                    "cancel_reason": "dados_nao_encontrados",
                }).eq("id", schedule_id).execute()
                continue

            client = client_res.data[0]
            step   = step_res.data[0]
            phone  = client.get("phone", "")
            if not phone:
                db.table("followup_schedules").update({
                    "status": "cancelled",
                    "cancel_reason": "sem_telefone",
                }).eq("id", schedule_id).execute()
                continue

            message = _personalize(step["message"], client)

            # Envia
            status = "sent"
            error  = None
            if DRY_RUN:
                logger.info(
                    "[DRY_RUN] Follow-up step %d para %s (%s): %.60s...",
                    step["step_number"], client["name"], phone, message,
                )
            else:
                try:
                    resp = await uazapi.send_text(
                        api_url=wp["api_url"],
                        api_token=wp["api_token"],
                        instance_name=wp["instance_name"],
                        phone=phone,
                        message=message,
                        instance_token=wp.get("instance_token"),
                    )
                    if "error" in resp:
                        status = "failed"
                        error  = str(resp["error"])
                        logger.error(
                            "Follow-up falhou para %s (%s): %s",
                            client["name"], phone, error,
                        )
                    else:
                        logger.info(
                            "Follow-up step %d enviado para %s (%s)",
                            step["step_number"], client["name"], phone,
                        )
                except Exception as e:
                    status = "failed"
                    error  = str(e)
                    logger.error("Exceção ao enviar follow-up para %s: %s", phone, e)

            sent_at = datetime.now(timezone.utc).isoformat()

            # Atualiza schedule
            db.table("followup_schedules").update({
                "status": status,
                "sent_at": sent_at if status == "sent" else None,
                "cancel_reason": error if status == "failed" else None,
            }).eq("id", schedule_id).execute()

            # Registra no log
            try:
                db.table("followup_logs").insert({
                    "client_id": client_id,
                    "step_id": step_id,
                    "message_sent": message,
                    "status": status,
                    "error": error,
                    "sent_at": sent_at,
                }).execute()
            except Exception as e:
                logger.warning("Erro ao salvar followup_log: %s", e)

            # Delay anti-ban (exceto no último)
            if i < len(pending) - 1 and not DRY_RUN and status == "sent":
                delay = random.choice([3, 8, 14, 21, 28])
                logger.info("Anti-ban: aguardando %ds antes do próximo follow-up...", delay)
                await asyncio.sleep(delay)
