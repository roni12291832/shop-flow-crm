from __future__ import annotations
"""
API REST do sistema de Follow-Up por Etapa.
Endpoints para gerenciar mensagens, ver métricas e disparar mudanças de etapa.
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core import logger
from supabase_client import get_supabase
from followup_engine import on_stage_change, cancel_pending_for_client

router = APIRouter(prefix="/followup", tags=["Follow-Up"])
BRT = timezone(timedelta(hours=-3))

STAGE_LABELS = {
    "contato_iniciado": "Contato Iniciado",
    "interessado": "Interessado",
    "comprador": "Comprador",
}


# ─── Schemas ──────────────────────────────────────────────────────────────────

class MessageBody(BaseModel):
    message: str
    variation_number: int | None = None


class StageChangeBody(BaseModel):
    client_id: str
    opportunity_id: str
    new_stage: str
    old_stage: str | None = None


class GenerateVariationsBody(BaseModel):
    step_id: str
    base_message: str
    count: int = 15


# ─── Stage config (steps + messages) ─────────────────────────────────────────

@router.get("/config")
async def get_config():
    """Retorna configuração completa de todos os steps por etapa, com variações e contagens."""
    db = get_supabase()
    steps_res = (
        db.table("stage_followup_steps")
        .select("*")
        .order("stage")
        .order("step_number")
        .execute()
    )
    result: dict[str, list] = {"contato_iniciado": [], "interessado": [], "comprador": []}

    for step in (steps_res.data or []):
        msgs_res = (
            db.table("stage_followup_messages")
            .select("id, variation_number, message")
            .eq("step_id", step["id"])
            .order("variation_number")
            .execute()
        )
        step["messages"] = msgs_res.data or []
        step["message_count"] = len(step["messages"])
        step["has_minimum"] = step["message_count"] >= step["min_variations"]
        stage = step["stage"]
        if stage in result:
            result[stage].append(step)

    return result


@router.get("/config/{stage}")
async def get_stage_config(stage: str):
    """Retorna steps e variações de uma etapa específica."""
    db = get_supabase()
    steps_res = (
        db.table("stage_followup_steps")
        .select("*")
        .eq("stage", stage)
        .order("step_number")
        .execute()
    )
    steps = []
    for step in (steps_res.data or []):
        msgs_res = (
            db.table("stage_followup_messages")
            .select("id, variation_number, message")
            .eq("step_id", step["id"])
            .order("variation_number")
            .execute()
        )
        step["messages"] = msgs_res.data or []
        step["message_count"] = len(step["messages"])
        step["has_minimum"] = step["message_count"] >= step["min_variations"]
        steps.append(step)
    return {"stage": stage, "steps": steps}


@router.put("/config/{step_id}/messages")
async def set_step_messages(step_id: str, messages: list[str]):
    """
    Substitui TODAS as variações de mensagem de um step.
    Envia array de strings: ["mensagem 1", "mensagem 2", ...]
    """
    if not messages:
        raise HTTPException(status_code=400, detail="Envie pelo menos uma mensagem")

    db = get_supabase()

    # Verifica mínimo
    step_res = db.table("stage_followup_steps").select("min_variations, stage, step_number").eq("id", step_id).limit(1).execute()
    if not step_res.data:
        raise HTTPException(status_code=404, detail="Step não encontrado")

    step = step_res.data[0]
    if len(messages) < step["min_variations"]:
        raise HTTPException(
            status_code=400,
            detail=f"Mínimo de {step['min_variations']} variações para etapa '{step['stage']}' step {step['step_number']}. Você enviou {len(messages)}."
        )

    rows = [{"step_id": step_id, "variation_number": i + 1, "message": msg.strip()} for i, msg in enumerate(messages) if msg.strip()]

    # Segurança: insere PRIMEIRO as novas, só depois apaga as antigas.
    # Se o INSERT falhar, as variações antigas permanecem intactas —
    # nunca ficamos com 0 variações para um step ativo.
    insert_res = db.table("stage_followup_messages").insert(rows).execute()
    if not insert_res.data:
        logger.warning("Insert de variações retornou vazio para step %s — variações antigas mantidas", step_id)
        raise HTTPException(status_code=500, detail="Falha ao salvar variações no banco.")

    new_ids = [r["id"] for r in insert_res.data]

    # Busca IDs das mensagens antigas que serão deletadas
    old_msgs_res = (
        db.table("stage_followup_messages")
        .select("id")
        .eq("step_id", step_id)
        .not_.in_("id", new_ids)
        .execute()
    )
    old_ids = [r["id"] for r in (old_msgs_res.data or [])]

    if old_ids:
        # ─── Desvincular schedules antes de deletar mensagens ────────────────
        # stage_followup_schedules tem FK para stage_followup_messages.
        # Se deletarmos a mensagem enquanto houver um schedule pending/processing
        # apontando para ela, o banco retorna violação de FK.
        # Solução: zera message_variation_id nos schedules que referenciam
        # as mensagens antigas — o engine tem fallback para escolher outra variação.
        db.table("stage_followup_schedules").update({
            "message_variation_id": None,
        }).in_("message_variation_id", old_ids).execute()

        # Agora pode deletar com segurança
        db.table("stage_followup_messages").delete().in_("id", old_ids).execute()

    return {"status": "ok", "saved": len(rows)}


@router.post("/config/{step_id}/messages/add")
async def add_message_variation(step_id: str, body: MessageBody):
    """Adiciona uma variação de mensagem a um step."""
    db = get_supabase()
    count_res = (
        db.table("stage_followup_messages")
        .select("variation_number")
        .eq("step_id", step_id)
        .order("variation_number", desc=True)
        .limit(1)
        .execute()
    )
    next_num = (count_res.data[0]["variation_number"] + 1) if count_res.data else 1
    db.table("stage_followup_messages").insert({
        "step_id": step_id,
        "variation_number": body.variation_number or next_num,
        "message": body.message.strip(),
    }).execute()
    return {"status": "ok"}


@router.delete("/config/{step_id}/messages/{message_id}")
async def delete_message_variation(step_id: str, message_id: str):
    """Remove uma variação específica."""
    db = get_supabase()
    db.table("stage_followup_messages").delete().eq("id", message_id).eq("step_id", step_id).execute()
    return {"status": "ok"}


# ─── Stage change trigger ─────────────────────────────────────────────────────

@router.post("/on-stage-change")
async def trigger_stage_change(body: StageChangeBody):
    """
    Chamado pelo frontend (Pipeline) e pelo webhook quando uma oportunidade muda de etapa.
    Cancela follow-ups anteriores e agenda os da nova etapa.
    """
    result = await on_stage_change(
        client_id=body.client_id,
        opportunity_id=body.opportunity_id,
        new_stage=body.new_stage,
        old_stage=body.old_stage,
    )
    return {"status": "ok", **result}


# ─── Métricas ─────────────────────────────────────────────────────────────────

@router.get("/metrics")
async def get_metrics():
    """Métricas de follow-up por etapa."""
    db = get_supabase()
    today = datetime.now(BRT).date().isoformat()

    def count_schedules(status: str, stage: str | None = None) -> int:
        q = db.table("stage_followup_schedules").select("id", count="exact").eq("status", status)
        if stage:
            q = q.eq("stage", stage)
        return q.execute().count or 0

    def count_logs_today(stage: str | None = None) -> int:
        q = (
            db.table("stage_followup_logs")
            .select("id", count="exact")
            .eq("status", "sent")
            .gte("sent_at", f"{today}T00:00:00-03:00")
        )
        if stage:
            q = q.eq("stage", stage)
        return q.execute().count or 0

    stages_data = {}
    for stage in ("contato_iniciado", "interessado", "comprador"):
        stages_data[stage] = {
            "label": STAGE_LABELS[stage],
            "pending": count_schedules("pending", stage),
            "sent_today": count_logs_today(stage),
            "daily_limit": 25,
            "sent_total": db.table("stage_followup_logs").select("id", count="exact").eq("stage", stage).eq("status", "sent").execute().count or 0,
        }

    # Últimos 15 disparos
    recent = (
        db.table("stage_followup_logs")
        .select("client_id, stage, step_number, message_sent, status, sent_at, error")
        .order("sent_at", desc=True)
        .limit(15)
        .execute()
    )

    return {
        "stages": stages_data,
        "recent_logs": recent.data or [],
        "total_pending": count_schedules("pending"),
        "auto_moved_today": db.table("stage_followup_logs").select("id", count="exact").eq("status", "auto_moved").gte("sent_at", f"{today}T00:00:00-03:00").execute().count or 0,
    }
