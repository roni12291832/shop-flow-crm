from __future__ import annotations
"""
Rotas REST para o sistema de Follow-Up Automático.
Permite ao frontend gerenciar templates, steps e visualizar métricas.
"""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core import logger
from supabase_client import get_supabase
from followup_engine import schedule_followup_for_lead, cancel_pending_for_client

router = APIRouter(prefix="/followup", tags=["Follow-Up"])

BRT = timezone(timedelta(hours=-3))


# ─── Schemas ──────────────────────────────────────────────────────────────────

class StepBody(BaseModel):
    step_number: int
    delay_hours: int
    message: str


class TemplateBody(BaseModel):
    name: str
    is_active: bool = True
    steps: list[StepBody] = []


class ScheduleBody(BaseModel):
    client_id: str
    opportunity_id: str | None = None


# ─── Templates ────────────────────────────────────────────────────────────────

@router.get("/templates")
async def list_templates():
    """Lista todos os templates com seus steps."""
    db = get_supabase()
    templates = db.table("followup_templates").select("*").order("created_at").execute()
    result = []
    for tmpl in templates.data or []:
        steps = (
            db.table("followup_steps")
            .select("*")
            .eq("template_id", tmpl["id"])
            .order("step_number")
            .execute()
        )
        result.append({**tmpl, "steps": steps.data or []})
    return {"templates": result}


@router.post("/templates")
async def create_template(body: TemplateBody):
    """Cria um novo template com seus steps."""
    db = get_supabase()
    res = db.table("followup_templates").insert({
        "name": body.name,
        "is_active": body.is_active,
    }).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Erro ao criar template")
    template_id = res.data[0]["id"]

    if body.steps:
        step_rows = [
            {
                "template_id": template_id,
                "step_number": s.step_number,
                "delay_hours": s.delay_hours,
                "message": s.message,
            }
            for s in body.steps
        ]
        db.table("followup_steps").insert(step_rows).execute()

    return {"status": "ok", "template_id": template_id}


@router.put("/templates/{template_id}")
async def update_template(template_id: str, body: TemplateBody):
    """Atualiza template e recria seus steps."""
    db = get_supabase()
    db.table("followup_templates").update({
        "name": body.name,
        "is_active": body.is_active,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", template_id).execute()

    # Recria steps
    db.table("followup_steps").delete().eq("template_id", template_id).execute()
    if body.steps:
        step_rows = [
            {
                "template_id": template_id,
                "step_number": s.step_number,
                "delay_hours": s.delay_hours,
                "message": s.message,
            }
            for s in body.steps
        ]
        db.table("followup_steps").insert(step_rows).execute()

    return {"status": "ok"}


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str):
    """Remove um template e todos os seus steps."""
    db = get_supabase()
    db.table("followup_templates").delete().eq("id", template_id).execute()
    return {"status": "ok"}


# ─── Agendamentos manuais ──────────────────────────────────────────────────────

@router.post("/schedule")
async def schedule_manually(body: ScheduleBody):
    """Agenda manualmente a sequência de follow-up para um cliente."""
    created = await schedule_followup_for_lead(body.client_id, body.opportunity_id)
    return {"status": "ok", "scheduled": created}


@router.post("/cancel/{client_id}")
async def cancel_client_followups(client_id: str, reason: str = "manual"):
    """Cancela todos os follow-ups pendentes de um cliente."""
    cancelled = await cancel_pending_for_client(client_id, reason)
    return {"status": "ok", "cancelled": cancelled}


# ─── Métricas ─────────────────────────────────────────────────────────────────

@router.get("/metrics")
async def get_metrics():
    """Retorna métricas do sistema de follow-up."""
    db = get_supabase()
    today_brt = datetime.now(BRT).date().isoformat()

    try:
        pending  = db.table("followup_schedules").select("id", count="exact").eq("status", "pending").execute()
        sent_res = db.table("followup_logs").select("id", count="exact").eq("status", "sent").gte("sent_at", f"{today_brt}T00:00:00-03:00").execute()
        total_sent = db.table("followup_logs").select("id", count="exact").eq("status", "sent").execute()
        failed = db.table("followup_logs").select("id", count="exact").eq("status", "failed").execute()
        cancelled = db.table("followup_schedules").select("id", count="exact").eq("status", "cancelled").execute()

        # Últimos 10 disparos
        recent = (
            db.table("followup_logs")
            .select("client_id, message_sent, status, sent_at, error")
            .order("sent_at", desc=True)
            .limit(10)
            .execute()
        )

        return {
            "pending": pending.count or 0,
            "sent_today": sent_res.count or 0,
            "sent_total": total_sent.count or 0,
            "failed_total": failed.count or 0,
            "cancelled_total": cancelled.count or 0,
            "daily_limit": 25,
            "recent_logs": recent.data or [],
        }
    except Exception as e:
        logger.error("Erro ao buscar métricas de follow-up: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
