from __future__ import annotations
"""
Shop Flow CRM — Microserviço Python de Automações
Substitui 100% do N8N com FastAPI + APScheduler.

Para rodar:
  pip install -r requirements.txt
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.jobstores.memory import MemoryJobStore

# core deve ser importado primeiro — inicializa o sistema de logs para todos os módulos
from core import logger
from config import get_settings
from webhooks import router as webhooks_router
from campaigns import router as campaigns_router
from whatsapp_router import router as whatsapp_router
from crons import (
    job_daily_report, job_sync_offline_messages, job_notify_stale_leads, 
    job_send_post_sale_nps, job_loyalty_2d_notification, job_loyalty_expiration_warning
)
from finance_notifications import job_finance_notifications
from jarvis_agent import jarvis
_IMPORT_ERROR = None
try:
    from followup_engine import job_process_followups
    from followup_router import router as followup_router
    _FOLLOWUP_ENABLED = True
except Exception as _fe:
    import logging as _logging
    import traceback
    _logging.getLogger("shopflow").error("FALHA ao importar followup: %s", _fe)
    _IMPORT_ERROR = traceback.format_exc()
    followup_router = None  # type: ignore
    job_process_followups = None  # type: ignore
    _FOLLOWUP_ENABLED = False

try:
    from cron_regua import main as job_regua_relacionamento, job_ensure_variations
    _REGUA_ENABLED = True
except Exception as _re:
    import logging as _logging
    _logging.getLogger("shopflow").warning("FALHA ao importar cron_regua: %s", _re)
    job_regua_relacionamento = None
    _REGUA_ENABLED = False

try:
    from nps_agent import router as nps_router
    _NPS_ENABLED = True
except Exception as _ne:
    nps_router = None
    _NPS_ENABLED = False


async def _start_whatsapp_client():
    """
    Inicia o cliente WhatsApp (neonize) em background ao subir o servidor.
    Aguarda 10s para deixar o servidor estabilizar antes de iniciar o neonize.
    """
    await asyncio.sleep(10)  # deixa o servidor subir completamente primeiro
    try:
        from whatsapp_client import wa_client
        if not wa_client.connected and not (wa_client._thread and wa_client._thread.is_alive()):
            wa_client.start()
            logger.info("✅ WhatsApp client (neonize) iniciado")
        else:
            logger.info("WhatsApp client já está rodando")
    except Exception as e:
        import traceback
        logger.warning("⚠️  Falha ao iniciar WhatsApp client: %s\n%s", e, traceback.format_exc())

# ─── Scheduler ────────────────────────────────────────────────────────
# Inicializado no lifespan para suportar SQLAlchemy job store (distributed locking)
scheduler: AsyncIOScheduler | None = None


def _build_scheduler() -> AsyncIOScheduler:
    """
    Cria o scheduler com o job store mais robusto disponível.

    Se DATABASE_URL estiver configurado → usa SQLAlchemyJobStore (PostgreSQL).
    O APScheduler usa SELECT FOR UPDATE internamente, garantindo que apenas
    UMA instância (de N réplicas no Koyeb) execute cada job por vez.

    Sem DATABASE_URL → cai para MemoryJobStore com coalesce=True para ao
    menos evitar execuções em cascata na mesma instância.
    """
    s = get_settings()

    job_defaults = {
        "coalesce": True,       # se atrasou, roda apenas 1x ao retornar
        "max_instances": 1,     # nunca executa a mesma job em paralelo
        "misfire_grace_time": 60,  # aceita até 60s de atraso antes de descartar
    }

    if s.database_url:
        try:
            from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
            jobstores = {"default": SQLAlchemyJobStore(url=s.database_url)}
            sched = AsyncIOScheduler(jobstores=jobstores, job_defaults=job_defaults, timezone="UTC")
            logger.info("✅ Scheduler: PostgreSQL Job Store ativo (distributed locking habilitado)")
            return sched
        except Exception as e:
            logger.warning("⚠️  Falha ao criar PostgreSQL Job Store: %s — usando MemoryJobStore", e)

    logger.warning(
        "⚠️  DATABASE_URL não configurado — usando MemoryJobStore. "
        "Se rodar múltiplas instâncias no Koyeb, jobs serão duplicados. "
        "Configure DATABASE_URL (PostgreSQL do Supabase) para corrigir."
    )
    return AsyncIOScheduler(
        jobstores={"default": MemoryJobStore()},
        job_defaults=job_defaults,
        timezone="UTC",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Inicia o scheduler ao subir o servidor, desliga ao parar."""
    global scheduler
    s = get_settings()
    scheduler = _build_scheduler()

    # Relatório diário
    scheduler.add_job(
        job_daily_report,
        CronTrigger(hour=s.report_hour, minute=s.report_minute),
        id="daily_report",
        name="Relatório Diário de Vendas",
        replace_existing=True,
    )

    # Sync offline a cada 6 horas
    scheduler.add_job(
        job_sync_offline_messages,
        IntervalTrigger(hours=6),
        id="sync_offline",
        name="Sync Mensagens Offline",
        replace_existing=True,
    )

    # Verificar leads parados a cada 12 horas
    scheduler.add_job(
        job_notify_stale_leads,
        IntervalTrigger(hours=12),
        id="stale_leads",
        name="Alerta Leads Parados",
        replace_existing=True,
    )

    # Follow-up automático — MODO TESTE: a cada 2 minutos (produção: hours=1)
    if _FOLLOWUP_ENABLED and job_process_followups:
        scheduler.add_job(
            job_process_followups,
            IntervalTrigger(minutes=2),  # TODO: voltar para hours=1 após teste
            id="followup_engine",
            name="Motor de Follow-Up Automático",
            replace_existing=True,
        )

    # Motor de NPS pós-venda (a cada 1 minuto)
    scheduler.add_job(
        job_send_post_sale_nps,
        IntervalTrigger(minutes=1),
        id="nps_after_sale",
        name="NPS Pós-Venda Automático",
        replace_existing=True,
    )

    # Notificações de Fidelidade (2 dias pós-venda)
    scheduler.add_job(
        job_loyalty_2d_notification,
        IntervalTrigger(minutes=60), # Roda a cada hora para verificar a janela
        id="loyalty_2d_notice",
        name="Aviso de Pontos (2 dias)",
        replace_existing=True,
    )

    # Aviso de expiração de pontos (15 dias sem compra)
    scheduler.add_job(
        job_loyalty_expiration_warning,
        CronTrigger(hour=9, minute=0, timezone="America/Sao_Paulo"),
        id="loyalty_exp_warning",
        name="Aviso Expiração Fidelidade",
        replace_existing=True,
    )

    # Régua de relacionamento — a cada 30 minutos
    if _REGUA_ENABLED and job_regua_relacionamento:
        scheduler.add_job(
            job_regua_relacionamento,
            IntervalTrigger(minutes=30),
            id="regua_relacionamento",
            name="Régua de Relacionamento",
            replace_existing=True,
        )
        # Pré-geração de variações — todo dia às 06h (antes da janela de disparos)
        scheduler.add_job(
            job_ensure_variations,
            CronTrigger(hour=6, minute=0, timezone="America/Sao_Paulo"),
            id="ensure_variations",
            name="Pré-geração de Variações Anti-Ban",
            replace_existing=True,
        )

    # Notificações financeiras — 8h todo dia
    scheduler.add_job(
        job_finance_notifications,
        CronTrigger(hour=8, minute=0, timezone="America/Sao_Paulo"),
        id="finance_notifications",
        name="Notificações Financeiras",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("🚀 Scheduler iniciado com 6 jobs agendados")
    logger.info(f"   📊 Relatório diário: {s.report_hour}:{s.report_minute:02d}")
    logger.info("   🔄 Sync offline: a cada 6h")
    logger.info("   ⚠️  Leads parados: a cada 12h")
    logger.info("   📲 Follow-up automático: a cada 1h")
    logger.info(f"   🌐 CORS origin: {_allowed_origins}")

    # Inicia cliente WhatsApp (neonize)
    asyncio.create_task(_start_whatsapp_client())

    yield

    scheduler.shutdown()
    logger.info("Scheduler desligado")


# ─── App FastAPI ──────────────────────────────────────────────────────
app = FastAPI(
    title="Shop Flow CRM — Automações Python",
    description=(
        "Microserviço de automações que substitui o N8N.\n\n"
        "**Funcionalidades:**\n"
        "- 📩 Recepção de webhooks do WhatsApp (UAZAPI)\n"
        "- 🤖 Jarvis IA (respostas automáticas + relatórios)\n"
        "- 📢 Disparos em massa com anti-bloqueio (15 variações obrigatórias)\n"
        "- 📊 Relatório diário automático via WhatsApp\n"
        "- 🔄 Sincronização de mensagens offline\n"
    ),
    version="1.3.0",
    lifespan=lifespan,
)

# CORS para o frontend React poder chamar
_s = get_settings()
_allowed_origins = (
    [_s.frontend_url]
    if _s.frontend_url
    else ["*"]  # fallback em dev — defina FRONTEND_URL em produção
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=bool(_s.frontend_url),  # credentials só com origem específica
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Rotas ────────────────────────────────────────────────────────────
app.include_router(webhooks_router)
app.include_router(campaigns_router)
app.include_router(whatsapp_router)
if _FOLLOWUP_ENABLED and followup_router:
    app.include_router(followup_router)
else:
    # Caso falhe a importação, cria rotas fantasmas para reportar o erro no frontend
    @app.get("/followup/config")
    @app.get("/followup/metrics")
    async def followup_error_report():
        raise HTTPException(
            status_code=503, 
            detail={
                "error": "Sistema de Follow-Up desativado por erro de inicialização",
                "traceback": _IMPORT_ERROR
            }
        )

if _NPS_ENABLED and nps_router:
    app.include_router(nps_router)


@app.get("/")
async def root():
    """Health check e informações do serviço."""
    jobs = [
        {"id": job.id, "name": job.name, "next_run": str(job.next_run_time)}
        for job in (scheduler.get_jobs() if scheduler else [])
    ]
    return {
        "service": "Shop Flow CRM Automações",
        "status": "online",
        "version": "1.3.0",
        "followup_enabled": _FOLLOWUP_ENABLED,
        "import_error": _IMPORT_ERROR if _IMPORT_ERROR else None,
        "scheduled_jobs": jobs,
    }


@app.post("/jarvis/ask")
async def jarvis_ask(request: dict):
    """
    Endpoint para o frontend perguntar algo ao Jarvis.
    Body: {
        "messages": [{"role": "user", "content": "..."}],
        "crmContext": "...",
        "userName": "..."
    }
    """
    messages = request.get("messages", [])
    crm_context = request.get("crmContext", "")
    user_name = request.get("userName", "Usuário")

    if not messages:
        return {"error": "Envie mensagens no campo 'messages'"}

    # O último item é a pergunta do usuário
    user_question = messages[-1].get("content", "")
    history = messages[:-1]

    answer = await jarvis.analyze_query(user_question, history=history, external_context=crm_context, user_name=user_name)
    return {"answer": answer, "response": answer} # Retorna nos dois formatos para compatibilidade


@app.post("/jarvis/variations")
async def jarvis_variations(request: dict):
    """Gera variações de uma mensagem para a régua."""
    base_message = request.get("message", "")
    count = request.get("count", 15)
    if not base_message:
        return {"error": "Envie a mensagem base no campo 'message'"}
    
    variations = await jarvis.generate_message_variations(base_message, count=count)
    return {"variations": variations}


@app.post("/jarvis/report")
async def jarvis_report_now():
    """Força a geração e envio do relatório diário agora (manual)."""
    await job_daily_report()
    return {"status": "ok", "message": "Relatório enviado!"}



@app.get("/health")
async def health():
    return {"status": "healthy"}
