from __future__ import annotations
"""
Motor de Follow-Up por Etapa do Pipeline.

Regras:
  - Disparos somente 08h–18h (horário Brasília, UTC-3)
  - Máximo 25 leads/dia POR ETAPA (não total)
  - Delay aleatório entre envios (anti-ban)
  - Variação de mensagem diferente por lead (dentro do mesmo step)
  - Nunca repete a mesma variação ao mesmo lead no mesmo step
  - Cancela tudo quando lead muda de etapa
  - Após step 4 de contato_iniciado sem resposta → move para perdido automaticamente
  - Jitter aleatório no horário agendado (±delay_jitter_hours)
"""
import asyncio
import random
from datetime import datetime, timezone, timedelta

from core import logger, DRY_RUN, registrar_automacao, alertar_dono
from supabase_client import get_supabase
from uazapi_client import uazapi

BRT = timezone(timedelta(hours=-3))
WINDOW_START = 8   # 08h BRT
WINDOW_END   = 18  # 18h BRT
DAILY_LIMIT_PER_STEP = 25          # 25 por step por dia (contato_iniciado e interessado)
STAGES_UNLIMITED    = {"comprador"} # Comprador: sem limite diário


def _is_within_window() -> bool:
    h = datetime.now(BRT).hour
    return WINDOW_START <= h < WINDOW_END


def _sent_today_for_step(db, step_id: str) -> int:
    """Conta quantos follow-ups já foram enviados hoje para um step específico."""
    today = datetime.now(BRT).date().isoformat()
    res = (
        db.table("stage_followup_logs")
        .select("id", count="exact")
        .eq("step_id", step_id)
        .eq("status", "sent")
        .gte("sent_at", f"{today}T00:00:00-03:00")
        .execute()
    )
    return res.count or 0


def _pick_variation(db, step_id: str, already_used: set[str]) -> dict | None:
    """Escolhe variação aleatória não usada anteriormente por este lead neste step."""
    all_vars = (
        db.table("stage_followup_messages")
        .select("id, message")
        .eq("step_id", step_id)
        .execute()
    )
    available = [v for v in (all_vars.data or []) if v["id"] not in already_used]
    if not available:
        # Todas usadas — permite reusar
        available = all_vars.data or []
    if not available:
        return None
    return random.choice(available)


def _get_gmb_link(db) -> str:
    """Busca o link do Google Meu Negócio cadastrado nas configurações do tenant."""
    try:
        res = db.table("tenants").select("google_mybusiness_url").limit(1).execute()
        if res.data and res.data[0].get("google_mybusiness_url"):
            return res.data[0]["google_mybusiness_url"]
    except Exception:
        pass
    return ""


def _personalize(message: str, client: dict, gmb_link: str = "") -> str:
    first = (client.get("name") or "").split()[0] or "Olá"
    return (
        message
        .replace("{nome}", first)
        .replace("{name}", first)
        .replace("{gmb_link}", gmb_link)
    )


def _schedule_time(base: datetime, jitter_hours: int) -> datetime:
    """Aplica jitter aleatório ao tempo agendado para variar horários de disparo."""
    if jitter_hours <= 0:
        return base
    delta_minutes = random.randint(-jitter_hours * 60, jitter_hours * 60)
    return base + timedelta(minutes=delta_minutes)


async def on_stage_change(
    client_id: str,
    opportunity_id: str,
    new_stage: str,
    old_stage: str | None = None,
) -> dict:
    """
    Chamado quando uma oportunidade muda de etapa.
    1. Cancela TODOS os schedules pendentes anteriores
    2. Cria novos schedules para a nova etapa (se aplicável)
    """
    db = get_supabase()
    cancelled = 0

    # 1. Cancela pendentes de qualquer etapa anterior
    try:
        res = (
            db.table("stage_followup_schedules")
            .update({"status": "cancelled", "cancel_reason": f"stage_changed_to_{new_stage}"})
            .eq("opportunity_id", opportunity_id)
            .eq("status", "pending")
            .execute()
        )
        cancelled = len(res.data or [])
        if cancelled:
            logger.info(
                "Cancelados %d follow-ups pendentes para opp %s (mudou de %s → %s)",
                cancelled, opportunity_id, old_stage, new_stage,
            )
    except Exception as e:
        logger.warning("Erro ao cancelar follow-ups anteriores: %s", e)

    # 2. Estágios que NÃO entram em follow-up
    if new_stage in ("lead_novo", "perdido", "desqualificado"):
        return {"scheduled": 0, "cancelled": cancelled}

    # 3. Busca steps da nova etapa
    steps_res = (
        db.table("stage_followup_steps")
        .select("id, step_number, delay_hours, delay_jitter_hours, min_variations")
        .eq("stage", new_stage)
        .order("step_number")
        .execute()
    )
    steps = steps_res.data or []
    if not steps:
        logger.info("Nenhum step configurado para etapa '%s'", new_stage)
        return {"scheduled": 0, "cancelled": cancelled}

    # 4. Verifica variações mínimas
    inserts = []
    now_utc = datetime.now(timezone.utc)

    for step in steps:
        # Verifica quantidade de variações
        count_res = (
            db.table("stage_followup_messages")
            .select("id", count="exact")
            .eq("step_id", step["id"])
            .execute()
        )
        var_count = count_res.count or 0
        if var_count < step["min_variations"]:
            logger.warning(
                "Step %d de '%s' tem %d/%d variações — skip (adicione mais mensagens)",
                step["step_number"], new_stage, var_count, step["min_variations"],
            )
            continue

        # Busca variação já usada por este cliente neste step
        used_res = (
            db.table("stage_followup_schedules")
            .select("message_variation_id")
            .eq("client_id", client_id)
            .eq("step_id", step["id"])
            .not_.is_("message_variation_id", "null")
            .execute()
        )
        already_used = {r["message_variation_id"] for r in (used_res.data or [])}
        variation = _pick_variation(db, step["id"], already_used)

        base_time = now_utc + timedelta(hours=step["delay_hours"])
        scheduled = _schedule_time(base_time, step.get("delay_jitter_hours", 1))

        inserts.append({
            "client_id": client_id,
            "opportunity_id": opportunity_id,
            "step_id": step["id"],
            "stage": new_stage,
            "step_number": step["step_number"],
            "scheduled_for": scheduled.isoformat(),
            "status": "pending",
            "message_variation_id": variation["id"] if variation else None,
        })

    if not inserts:
        return {"scheduled": 0, "cancelled": cancelled}

    if DRY_RUN:
        logger.info("[DRY_RUN] Criaria %d agendamentos para opp %s na etapa '%s'", len(inserts), opportunity_id, new_stage)
        return {"scheduled": len(inserts), "cancelled": cancelled}

    res = db.table("stage_followup_schedules").insert(inserts).execute()
    created = len(res.data or [])
    logger.info("Criados %d agendamentos para opp %s na etapa '%s'", created, opportunity_id, new_stage)
    return {"scheduled": created, "cancelled": cancelled}


async def _auto_move_expired(db) -> int:
    """Verifica steps com auto_move_to e move oportunidades sem resposta."""
    now_utc = datetime.now(timezone.utc).isoformat()
    moved = 0

    # Busca steps com auto_move_to configurado
    steps_res = (
        db.table("stage_followup_steps")
        .select("id, stage, auto_move_to")
        .not_.is_("auto_move_to", "null")
        .execute()
    )

    for step in (steps_res.data or []):
        # Acha schedules desse step que foram enviados E a opp ainda está na mesma etapa
        sent_res = (
            db.table("stage_followup_schedules")
            .select("opportunity_id")
            .eq("step_id", step["id"])
            .eq("status", "sent")
            .execute()
        )
        for sched in (sent_res.data or []):
            opp_id = sched["opportunity_id"]
            # Verifica se a opp ainda está na etapa original
            opp_res = (
                db.table("opportunities")
                .select("id, stage, client_id")
                .eq("id", opp_id)
                .eq("stage", step["stage"])
                .limit(1)
                .execute()
            )
            if not opp_res.data:
                continue  # já avançou

            # Verifica se ainda tem schedules pendentes para esta opp (lead respondeu = teria sido cancelado)
            pending_res = (
                db.table("stage_followup_schedules")
                .select("id")
                .eq("opportunity_id", opp_id)
                .eq("status", "pending")
                .limit(1)
                .execute()
            )
            if pending_res.data:
                continue  # ainda tem pendentes, não mover

            # Busca quando o último step foi enviado para esta opp
            last_sent_res = (
                db.table("stage_followup_schedules")
                .select("sent_at")
                .eq("opportunity_id", opp_id)
                .eq("step_id", step["id"])
                .eq("status", "sent")
                .order("sent_at", desc=True)
                .limit(1)
                .execute()
            )
            if not last_sent_res.data or not last_sent_res.data[0].get("sent_at"):
                continue

            last_sent_at = last_sent_res.data[0]["sent_at"]
            client_id = opp_res.data[0]["client_id"]

            # Verifica se o cliente enviou QUALQUER mensagem APÓS o envio do último step.
            # Se sim, ele respondeu — não deve ser movido para "perdido".
            client_response_res = (
                db.table("messages")
                .select("id")
                .eq("client_id", client_id)
                .eq("is_from_client", True)
                .gte("created_at", last_sent_at)
                .limit(1)
                .execute()
            )
            if client_response_res.data:
                logger.info(
                    "Opp %s: cliente respondeu após step final — não movendo para '%s'",
                    opp_id, step["auto_move_to"],
                )
                continue  # cliente respondeu, não mover

            # Sem pendentes, sem resposta após o último step → move
            if not DRY_RUN:
                db.table("opportunities").update({
                    "stage": step["auto_move_to"],
                }).eq("id", opp_id).execute()
                db.table("stage_followup_logs").insert({
                    "client_id": opp_res.data[0]["client_id"],
                    "opportunity_id": opp_id,
                    "step_id": step["id"],
                    "stage": step["stage"],
                    "status": "auto_moved",
                    "message_sent": f"Auto-movido para '{step['auto_move_to']}'",
                }).execute()
                logger.info("Opp %s auto-movida de '%s' para '%s'", opp_id, step["stage"], step["auto_move_to"])
                moved += 1

    return moved


async def cancel_pending_for_opportunity(opportunity_id: str, reason: str = "respondeu") -> int:
    """Cancela todos os follow-ups pendentes de uma oportunidade (quando cliente responde)."""
    db = get_supabase()
    try:
        res = (
            db.table("stage_followup_schedules")
            .update({"status": "cancelled", "cancel_reason": reason})
            .eq("opportunity_id", opportunity_id)
            .eq("status", "pending")
            .execute()
        )
        count = len(res.data or [])
        if count:
            logger.info("Cancelados %d follow-ups para opp %s (%s)", count, opportunity_id, reason)
        return count
    except Exception as e:
        logger.warning("Erro ao cancelar follow-ups: %s", e)
        return 0


async def cancel_pending_for_client(client_id: str, reason: str = "respondeu") -> int:
    """Cancela todos os follow-ups pendentes de um cliente (quando responde via webhook)."""
    db = get_supabase()
    try:
        res = (
            db.table("stage_followup_schedules")
            .update({"status": "cancelled", "cancel_reason": reason})
            .eq("client_id", client_id)
            .eq("status", "pending")
            .execute()
        )
        count = len(res.data or [])
        if count:
            logger.info("Cancelados %d follow-ups para cliente %s (%s)", count, client_id, reason)
        return count
    except Exception as e:
        logger.warning("Erro ao cancelar follow-ups do cliente: %s", e)
        return 0


async def job_process_followups() -> None:
    """Job principal — processa fila de follow-ups. Roda a cada hora via APScheduler."""
    async with registrar_automacao("stage_followup_engine"):
        if not _is_within_window():
            logger.info("Follow-up: fora da janela 08h–18h BRT — aguardando")
            return

        db = get_supabase()

        # Auto-move leads expirados
        moved = await _auto_move_expired(db)
        if moved:
            logger.info("Follow-up: %d leads auto-movidos por expiração", moved)

        # Busca instância WA conectada
        wp_res = (
            db.table("whatsapp_instances")
            .select("api_url, api_token, instance_name, instance_token")
            .eq("status", "connected")
            .limit(1)
            .execute()
        )
        if not wp_res.data:
            logger.warning("Follow-up: nenhuma instância WhatsApp conectada")
            return
        wp = wp_res.data[0]

        now_utc = datetime.now(timezone.utc).isoformat()
        gmb_link = _get_gmb_link(db)

        for stage in ("contato_iniciado", "interessado", "comprador"):
            unlimited = stage in STAGES_UNLIMITED

            # Busca steps ativos desta etapa para aplicar limite por step
            steps_res = (
                db.table("stage_followup_steps")
                .select("id, step_number")
                .eq("stage", stage)
                .order("step_number")
                .execute()
            )
            step_ids = [s["id"] for s in (steps_res.data or [])]

            if not step_ids:
                continue

            # Calcula o limite total disponível somando o restante de cada step
            # Comprador: ilimitado → usa 9999 como teto para não bloquear nada
            if unlimited:
                total_remaining = 9999
            else:
                total_remaining = sum(
                    max(0, DAILY_LIMIT_PER_STEP - _sent_today_for_step(db, sid))
                    for sid in step_ids
                )

            if total_remaining <= 0:
                logger.info(
                    "Follow-up '%s': limite diário atingido (%d/step × %d steps)",
                    stage, DAILY_LIMIT_PER_STEP, len(step_ids),
                )
                continue

            pending_res = (
                db.table("stage_followup_schedules")
                .select("id, client_id, opportunity_id, step_id, step_number, message_variation_id")
                .eq("stage", stage)
                .eq("status", "pending")
                .lte("scheduled_for", now_utc)
                .order("scheduled_for")
                .limit(total_remaining)
                .execute()
            )
            pending = pending_res.data or []
            if not pending:
                continue

            # Controla limite individual por step durante o processamento
            step_sent_counts: dict[str, int] = {
                sid: _sent_today_for_step(db, sid) for sid in step_ids
            }

            logger.info(
                "Follow-up '%s': %d agendamentos para processar (%s)",
                stage, len(pending), "ilimitado" if unlimited else f"{DAILY_LIMIT_PER_STEP}/step",
            )

            for i, sched in enumerate(pending):
                # Verifica limite por step (exceto comprador que é ilimitado)
                step_id = sched["step_id"]
                if not unlimited:
                    already_sent = step_sent_counts.get(step_id, 0)
                    if already_sent >= DAILY_LIMIT_PER_STEP:
                        logger.info(
                            "Follow-up step %d '%s': limite de %d/dia atingido — pulando",
                            sched["step_number"], stage, DAILY_LIMIT_PER_STEP,
                        )
                        continue

                # ─── Lock otimista ────────────────────────────────────────────
                # Tenta marcar como "processing" com double-check no status.
                # Se outro processo já pegou este schedule, o UPDATE retorna 0 linhas.
                lock_res = (
                    db.table("stage_followup_schedules")
                    .update({
                        "status": "processing",
                        "processing_started_at": datetime.now(timezone.utc).isoformat(),
                    })
                    .eq("id", sched["id"])
                    .eq("status", "pending")  # só atualiza se ainda estiver pending
                    .execute()
                )
                if not lock_res.data:
                    logger.info("Schedule %s já processado por outro processo — pulando", sched["id"])
                    continue

                client_res = (
                    db.table("clients").select("id, name, phone").eq("id", sched["client_id"]).limit(1).execute()
                )
                if not client_res.data:
                    db.table("stage_followup_schedules").update({"status": "cancelled", "cancel_reason": "cliente_nao_encontrado"}).eq("id", sched["id"]).execute()
                    continue

                client = client_res.data[0]
                phone = client.get("phone", "")
                if not phone:
                    db.table("stage_followup_schedules").update({"status": "cancelled", "cancel_reason": "sem_telefone"}).eq("id", sched["id"]).execute()
                    continue

                # Busca mensagem da variação pre-alocada
                var_id = sched.get("message_variation_id")
                message_text = None
                if var_id:
                    var_res = db.table("stage_followup_messages").select("message").eq("id", var_id).limit(1).execute()
                    if var_res.data:
                        message_text = _personalize(var_res.data[0]["message"], client, gmb_link)

                if not message_text:
                    # Fallback: escolhe qualquer variação
                    step_msgs = db.table("stage_followup_messages").select("message").eq("step_id", sched["step_id"]).execute()
                    if step_msgs.data:
                        message_text = _personalize(random.choice(step_msgs.data)["message"], client, gmb_link)
                    else:
                        db.table("stage_followup_schedules").update({"status": "skipped", "cancel_reason": "sem_mensagens"}).eq("id", sched["id"]).execute()
                        logger.warning("Follow-up step %d de '%s' sem mensagens cadastradas — pulando", sched["step_number"], stage)
                        continue

                status = "sent"
                error  = None

                if DRY_RUN:
                    logger.info("[DRY_RUN] Follow-up step %d '%s' para %s: %.60s...", sched["step_number"], stage, client["name"], message_text)
                else:
                    try:
                        resp = await uazapi.send_text(
                            api_url=wp["api_url"],
                            api_token=wp["api_token"],
                            instance_name=wp["instance_name"],
                            phone=phone,
                            message=message_text,
                            instance_token=wp.get("instance_token"),
                        )
                        if "error" in resp:
                            status = "failed"
                            error_code = resp.get("error_code", "unknown")
                            error = str(resp["error"])
                            logger.error("Follow-up falhou para %s: %s (%s)", phone, error, error_code)

                            # Reação específica por tipo de erro
                            if error_code == "rate_limit":
                                logger.warning("Rate limit UAZAPI — interrompendo batch de follow-up")
                                db.table("stage_followup_schedules").update({
                                    "status": "pending",  # devolve para fila
                                }).eq("id", sched["id"]).execute()
                                break  # para o loop inteiro
                            elif error_code == "auth_error":
                                await alertar_dono("⚠️ Token WhatsApp inválido! Follow-up interrompido. Reconecte a instância no CRM.")
                                break
                            elif error_code == "not_found":
                                # Número inválido — cancela todos follow-ups deste cliente
                                await cancel_pending_for_client(client["id"], "numero_invalido_uazapi")
                        else:
                            logger.info("Follow-up step %d '%s' enviado para %s (%s)", sched["step_number"], stage, client["name"], phone)
                    except Exception as e:
                        status = "failed"
                        error = str(e)
                        logger.error("Exceção no follow-up para %s: %s", phone, e)

                sent_at = datetime.now(timezone.utc).isoformat()
                # Atualiza status final (sai de "processing" para "sent" ou "failed")
                db.table("stage_followup_schedules").update({
                    "status": status,
                    "sent_at": sent_at if status == "sent" else None,
                    "cancel_reason": error if status == "failed" else None,
                    "processing_started_at": None,
                }).eq("id", sched["id"]).execute()

                # Atualiza contador local por step para respeitar limite durante este job
                if status == "sent" and not unlimited:
                    step_sent_counts[step_id] = step_sent_counts.get(step_id, 0) + 1

                try:
                    db.table("stage_followup_logs").insert({
                        "client_id": sched["client_id"],
                        "opportunity_id": sched["opportunity_id"],
                        "step_id": sched["step_id"],
                        "stage": stage,
                        "step_number": sched["step_number"],
                        "message_sent": message_text,
                        "status": status,
                        "error": error,
                        "sent_at": sent_at,
                    }).execute()
                except Exception as e:
                    logger.warning("Erro ao salvar log: %s", e)

                if i < len(pending) - 1 and not DRY_RUN and status == "sent":
                    delay = random.choice([4, 9, 15, 22, 31, 45])
                    logger.info("Anti-ban: aguardando %ds...", delay)
                    await asyncio.sleep(delay)
