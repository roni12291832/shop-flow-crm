from __future__ import annotations
"""
Rotas de Campanha — Sistema inteligente de disparos em massa com anti-bloqueio.
"""
from typing import Optional

from pydantic import BaseModel, field_validator
from fastapi import APIRouter, HTTPException

from core import logger, DRY_RUN, registrar_automacao, alertar_dono
from supabase_client import get_supabase
from uazapi_client import uazapi

router = APIRouter(prefix="/campaigns", tags=["Campanhas"])

# Stages do Pipeline (sincronizados com o Frontend)
VALID_STAGES = [
    "lead_novo",
    "contato_iniciado",
    "interessado",
    "comprador",
    "perdido",
    "desqualificado",
]


class CampaignRequest(BaseModel):
    """
    Payload para disparo de campanha.
    O campo `messages` DEVE conter pelo menos 15 variações diferentes
    para evitar bloqueio do WhatsApp.
    """
    name: str
    messages: list[str]
    target_stages: list[str]
    target_origins: Optional[list[str]] = None
    min_delay_seconds: int = 15
    max_delay_seconds: int = 60

    @field_validator("messages")
    @classmethod
    def validate_messages(cls, v):
        if len(v) < 15:
            raise ValueError(
                "OBRIGATÓRIO: você precisa enviar pelo menos 15 variações de mensagem "
                "para evitar bloqueio do WhatsApp.\n\n"
                "💡 Dica: Cole esse comando no ChatGPT para gerar rapidamente:\n"
                '   "Gere 15 variações dessa mensagem para mim: [SUA MENSAGEM AQUI]"'
            )
        unique = set(v)
        if len(unique) < 15:
            raise ValueError(
                f"Você tem mensagens DUPLICADAS! Foram encontradas apenas {len(unique)} "
                f"variações únicas de {len(v)} enviadas. Todas devem ser diferentes."
            )
        return v

    @field_validator("target_stages")
    @classmethod
    def validate_stages(cls, v):
        for stage in v:
            if stage not in VALID_STAGES:
                raise ValueError(f"Etapa '{stage}' inválida. Válidas: {VALID_STAGES}")
        return v


class CampaignResponse(BaseModel):
    status: str
    campaign_name: str
    total_contacts: int
    sent: int
    failed: int
    errors: list
    chatgpt_tip: str = (
        '💡 Para gerar suas 15 variações, cole isso no ChatGPT:\n'
        '"Gere 15 variações dessa mensagem para mim: [SUA MENSAGEM AQUI]"'
    )


@router.post("/dispatch", response_model=CampaignResponse)
async def dispatch_campaign(campaign: CampaignRequest):
    """
    Dispara campanha de mensagens em massa com proteção anti-bloqueio.

    Regras de funcionamento:
    1. O sistema seleciona TODOS os leads/clientes das etapas escolhidas
    2. Para cada contato, escolhe 1 mensagem ALEATÓRIA das 15+ variações
    3. Personaliza a mensagem com dados do CRM ({nome}, {telefone}, {email}, {origem})
    4. Envia com delay ALEATÓRIO entre 15-60 segundos entre cada envio
    5. A ordem de envio é EMBARALHADA aleatoriamente

    Variáveis disponíveis nas mensagens:
    - {nome} → Nome do cliente
    - {telefone} → Telefone do cliente
    - {email} → Email do cliente
    - {origem} → Origem do lead (whatsapp, loja_fisica, etc)
    """
    db = get_supabase()

    # ─── Validação e coleta de dados (fora do registrar_automacao) ────────
    opps_res = db.table("opportunities").select("client_id").in_("stage", campaign.target_stages).execute()
    client_ids = list(set(opp["client_id"] for opp in (opps_res.data or []) if opp.get("client_id")))

    if not client_ids:
        raise HTTPException(
            status_code=404,
            detail=f"Nenhum contato encontrado nas etapas: {campaign.target_stages}",
        )

    clients_res = db.table("clients").select("id, name, phone, email, origin").in_("id", client_ids).execute()
    contacts = clients_res.data or []

    if campaign.target_origins:
        contacts = [c for c in contacts if c.get("origin") in campaign.target_origins]

    contacts_with_phone = [c for c in contacts if c.get("phone")]
    if not contacts_with_phone:
        raise HTTPException(
            status_code=404,
            detail="Nenhum contato com telefone cadastrado nas etapas selecionadas.",
        )

    instance_res = (
        db.table("whatsapp_instances")
        .select("api_url, api_token, instance_name")
        .eq("status", "connected")
        .limit(1)
        .execute()
    )
    if not instance_res.data:
        raise HTTPException(status_code=500, detail="Nenhuma instância WhatsApp com status='open' no CRM.")

    inst = instance_res.data[0]

    # ─── Disparo (dentro do registrar_automacao) ──────────────────────────
    async with registrar_automacao(
        "disparo_campanha",
        {"nome": campaign.name, "total_contatos": len(contacts_with_phone), "etapas": campaign.target_stages},
    ):
        logger.info(
            "Disparando campanha '%s' para %d contatos com %d variações",
            campaign.name, len(contacts_with_phone), len(campaign.messages),
        )

        if DRY_RUN:
            logger.info(
                "[DRY_RUN] Simulando disparo de '%s': %d contatos, %d variações",
                campaign.name, len(contacts_with_phone), len(campaign.messages),
            )
            return CampaignResponse(
                status="dry_run",
                campaign_name=campaign.name,
                total_contacts=len(contacts_with_phone),
                sent=0,
                failed=0,
                errors=[],
            )

        results = await uazapi.send_bulk_campaign(
            api_url=inst["api_url"],
            api_token=inst["api_token"],
            instance_name=inst["instance_name"],
            contacts=contacts_with_phone,
            messages=campaign.messages,
            min_delay=campaign.min_delay_seconds,
            max_delay=campaign.max_delay_seconds,
        )

        try:
            db.table("activities").insert({
                "type": "campaign_dispatch",
                "description": (
                    f"Campanha '{campaign.name}': {results['sent']} enviadas, {results['failed']} falhas"
                ),
            }).execute()
        except Exception:
            pass  # Não crítico

        return CampaignResponse(
            status="completed",
            campaign_name=campaign.name,
            total_contacts=len(contacts_with_phone),
            sent=results["sent"],
            failed=results["failed"],
            errors=results.get("errors", [])[:10],
        )


@router.get("/preview/{stage}")
async def preview_campaign_contacts(stage: str):
    """
    Preview: mostra quantos contatos seriam atingidos na campanha
    para uma determinada etapa do pipeline.
    """
    if stage not in VALID_STAGES:
        raise HTTPException(status_code=400, detail=f"Etapa inválida. Válidas: {VALID_STAGES}")

    db = get_supabase()

    opps_res = db.table("opportunities").select("client_id").eq("stage", stage).execute()
    client_ids = list(set(opp["client_id"] for opp in (opps_res.data or []) if opp.get("client_id")))

    if not client_ids:
        return {"stage": stage, "total": 0, "with_phone": 0, "contacts": []}

    clients_res = db.table("clients").select("id, name, phone, origin").in_("id", client_ids).execute()
    contacts = clients_res.data or []
    with_phone = [c for c in contacts if c.get("phone")]

    return {
        "stage": stage,
        "total": len(contacts),
        "with_phone": len(with_phone),
        "contacts": [{"name": c["name"], "phone": c["phone"][:6] + "****"} for c in with_phone[:20]],
    }
