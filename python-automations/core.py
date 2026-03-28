from __future__ import annotations
"""
core.py — Módulo base obrigatório do ShopFlow CRM.
Importar em TODOS os módulos de automação.

REGRAS EMBUTIDAS:
  1. Logs salvos em logs/shopflow.log + terminal com data/hora
     → setup_logging() chamado automaticamente ao importar este módulo.
     → Remova o basicConfig() do main.py para evitar conflito.

  2. Erros sempre alertam o dono via WhatsApp
     → await alertar_dono("mensagem de erro")
     → Usa ADMIN_PHONE do .env + primeira instância WhatsApp ativa no banco.

  3. Chamadas de API externa com @retry_api
     → 3 tentativas, espera exponencial (2s → 4s → 8s)
     → Só faz retry em erros de rede/timeout/HTTP (não em erros de lógica).
     → ATENÇÃO: o método decorado NÃO deve capturar HTTPError internamente;
       deixe a exceção propagar para o retry funcionar.

  4. Toda automação registra início/fim em automacoes_log
     → async with registrar_automacao("nome_da_automacao", {"chave": "valor"}):
     → Em caso de erro: atualiza status, grava mensagem e chama alertar_dono().

  5. DRY_RUN — testa sem executar ações reais
     → Defina DRY_RUN=true no .env para ativar.
     → Use o padrão: if DRY_RUN: logger.info("[DRY_RUN] faria X"); return
     → registrar_automacao() e alertar_dono() respeitam DRY_RUN automaticamente.

EXEMPLO DE USO:
    from core import logger, DRY_RUN, retry_api, registrar_automacao, alertar_dono

    @retry_api
    async def buscar_dados_externos(url: str) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
            resp.raise_for_status()   # ← deixa propagar para o retry
            return resp.json()

    async def minha_automacao():
        async with registrar_automacao("minha_automacao", {"contexto": "exemplo"}):
            if DRY_RUN:
                logger.info("[DRY_RUN] Enviaria mensagem para 100 clientes")
                return
            dados = await buscar_dados_externos("https://api.exemplo.com/dados")
            # ... lógica real aqui
"""

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

# Detecta ambiente de produção (Koyeb define KOYEB_SERVICE_NAME automaticamente)
IS_PRODUCTION: bool = bool(
    os.getenv("KOYEB_SERVICE_NAME")
    or os.getenv("ENV", "").lower() == "production"
)

import httpx
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from config import get_settings
from supabase_client import get_supabase


# ─── 5. DRY_RUN ──────────────────────────────────────────────────────────────
# Defina DRY_RUN=true no .env para simular automações sem executar nada real.
DRY_RUN: bool = os.getenv("DRY_RUN", "false").lower() in ("1", "true", "yes")


# ─── 1. LOGGING ──────────────────────────────────────────────────────────────
_LOG_DIR = Path("logs")
_LOG_FILE = _LOG_DIR / "shopflow.log"
_LOG_FMT = logging.Formatter(
    "%(asctime)s | %(name)-20s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
_LOGGING_INITIALIZED = False


def setup_logging() -> logging.Logger:
    global _LOGGING_INITIALIZED
    if _LOGGING_INITIALIZED:
        return logging.getLogger("shopflow")
    _LOGGING_INITIALIZED = True

    shopflow_logger = logging.getLogger("shopflow")
    shopflow_logger.setLevel(logging.DEBUG)

    # Handler de terminal (sempre funciona)
    _LOG_FMT = logging.Formatter(
        "%(asctime)s | %(name)-20s | %(levelname)-8s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(_LOG_FMT)
    
    root = logging.getLogger()
    root.setLevel(logging.DEBUG)
    root.addHandler(console_handler)

    # Em produção (Koyeb): só console — stdout é capturado pelo painel do Koyeb.
    # Em desenvolvimento: adiciona arquivo rotativo local.
    if not IS_PRODUCTION:
        try:
            log_dir = Path("logs")
            log_dir.mkdir(parents=True, exist_ok=True)
            log_file = log_dir / "shopflow.log"
            file_handler = TimedRotatingFileHandler(
                log_file,
                when="midnight",
                interval=1,
                backupCount=30,
                encoding="utf-8",
            )
            file_handler.setLevel(logging.DEBUG)
            file_handler.setFormatter(_LOG_FMT)
            root.addHandler(file_handler)
            shopflow_logger.info("Logging em arquivo: %s", log_file)
        except Exception as e:
            shopflow_logger.warning("Falha ao criar log em arquivo: %s", e)

    # Handler Supabase: persiste logs ERROR+ no banco para consulta pós-redeploy
    root.addHandler(_SupabaseLogHandler())

    shopflow_logger.info("Logging inicializado | IS_PRODUCTION=%s | DRY_RUN=%s", IS_PRODUCTION, DRY_RUN)
    return shopflow_logger


class _SupabaseLogHandler(logging.Handler):
    """
    Salva logs de nível ERROR ou superior na tabela system_logs do Supabase.
    Resolve o problema de logs efêmeros em produção (Koyeb apaga /tmp no redeploy).
    Criado pela migration 20260328000002.
    """

    def __init__(self):
        super().__init__(level=logging.ERROR)
        self.setFormatter(_LOG_FMT)

    def emit(self, record: logging.LogRecord) -> None:
        # Nunca lança exceção — um log handler não pode gerar novos erros
        try:
            from supabase_client import get_supabase  # import local evita circular
            db = get_supabase()
            db.table("system_logs").insert({
                "level":      record.levelname,
                "logger":     record.name,
                "message":    self.format(record),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
        except Exception:
            pass  # silencia — não pode logar erro do logger

logger = setup_logging()


# ─── 2. ALERTAR DONO ─────────────────────────────────────────────────────────
async def alertar_dono(mensagem: str) -> None:
    """
    Envia mensagem de alerta no WhatsApp do número em ADMIN_PHONE (.env).
    Usa a primeira instância WhatsApp com status='open' encontrada no banco.

    - Em DRY_RUN apenas loga, sem enviar.
    - Nunca levanta exceção — erros internos são logados e descartados para
      não mascarar o erro original que gerou o alerta.

    Args:
        mensagem: texto do alerta (será truncado em 500 chars se necessário).
    """
    mensagem = mensagem[:500]
    _log = logging.getLogger("shopflow.alertar_dono")

    if DRY_RUN:
        _log.info("[DRY_RUN] alertar_dono | msg=%s", mensagem)
        return

    s = get_settings()
    if not s.admin_phone:
        _log.warning("ADMIN_PHONE não configurado no .env — alerta não enviado")
        return

    try:
        db = get_supabase()
        res = (
            db.table("whatsapp_instances")
            .select("api_url, api_token, instance_name")
            .eq("status", "connected")
            .limit(1)
            .execute()
        )
        if not res.data:
            _log.warning(
                "alertar_dono: nenhuma instância WhatsApp com status='open' — "
                "configure uma instância ativa em /whatsapp-connect"
            )
            return

        inst = res.data[0]

        # Import local para evitar dependência circular (uazapi importa config)
        from uazapi_client import uazapi  # noqa: PLC0415

        texto = (
            f"🚨 *ShopFlow CRM — Alerta Automático*\n\n"
            f"{mensagem}\n\n"
            f"_{datetime.now().strftime('%d/%m/%Y %H:%M:%S')}_"
        )
        await uazapi.send_text(
            api_url=inst["api_url"],
            api_token=inst["api_token"],
            instance_name=inst["instance_name"],
            phone=s.admin_phone,
            message=texto,
        )
        _log.info("Alerta enviado ao dono | phone=%s", s.admin_phone)

    except Exception as exc:  # noqa: BLE001
        # Não relança — alertar_dono() é chamada em except, não pode gerar novo erro
        _log.error("Falha ao enviar alerta ao dono: %s", exc)


# ─── 3. RETRY PARA APIs EXTERNAS ─────────────────────────────────────────────
# Erros que justificam uma nova tentativa (problemas de rede/servidor, não lógica)
_RETRYABLE_ERRORS = (
    httpx.TimeoutException,       # timeout de conexão ou leitura
    httpx.ConnectError,           # falha de DNS ou recusa de conexão
    httpx.RemoteProtocolError,    # resposta malformada do servidor
    httpx.HTTPStatusError,        # 4xx/5xx — incluindo rate limit 429
)

_retry_logger = logging.getLogger("shopflow.retry")

retry_api = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),  # 2s → 4s → 8s
    retry=retry_if_exception_type(_RETRYABLE_ERRORS),
    before_sleep=before_sleep_log(_retry_logger, logging.WARNING),
    reraise=True,  # relança a exceção após esgotar tentativas
)
"""
Decorator @retry_api para qualquer função que chame uma API externa.

Aplica 3 tentativas com espera exponencial (2s, 4s, 8s).
Só faz retry em erros de rede/HTTP — erros de lógica (ValueError, KeyError)
propagam imediatamente.

IMPORTANTE: o método decorado NÃO deve capturar httpx.HTTPError internamente.
Deixe a exceção propagar para o mecanismo de retry atuar.

Uso:
    @retry_api
    async def chamar_api_pagamento(payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post("https://api.pagamento.com/cobrar", json=payload)
            resp.raise_for_status()  # ← propaga HTTPStatusError → retry atua
            return resp.json()
"""


# ─── 4. REGISTRO DE AUTOMAÇÕES ────────────────────────────────────────────────
@asynccontextmanager
async def registrar_automacao(nome: str, detalhes: dict | None = None):
    """
    Context manager assíncrono que registra o ciclo de vida de uma automação
    na tabela 'automacoes_log' do Supabase.

    Fluxo:
      1. Insere linha com status='iniciado' e timestamp de início.
      2. Yield — executa o bloco da automação.
      3a. Sucesso: atualiza para status='concluido' com duração em segundos.
      3b. Erro: atualiza para status='erro', salva mensagem, chama alertar_dono()
          e relança a exceção original (não suprime o erro).

    Em DRY_RUN: registra normalmente no banco, mas marca dry_run=true.

    Args:
        nome:     nome único da automação (ex: "regua_pos_venda", "campanha_nps").
        detalhes: dict opcional com contexto extra (ex: tenant_id, quantidade).

    Uso:
        async with registrar_automacao("disparo_aniversariantes", {"total": 42}):
            if DRY_RUN:
                logger.info("[DRY_RUN] Enviaria 42 mensagens de aniversário")
                return
            await enviar_mensagens(clientes)
    """
    _auto_log = logging.getLogger(f"shopflow.auto.{nome}")
    db = get_supabase()
    log_id: str | None = None
    inicio = datetime.now(timezone.utc)

    _auto_log.info(
        "Iniciando | DRY_RUN=%s | detalhes=%s", DRY_RUN, detalhes
    )

    # ── Registra início no banco ──
    try:
        res = (
            db.table("automacoes_log")
            .insert(
                {
                    "nome": nome,
                    "status": "iniciado",
                    "iniciado_em": inicio.isoformat(),
                    "detalhes": detalhes or {},
                    "dry_run": DRY_RUN,
                }
            )
            .execute()
        )
        log_id = res.data[0]["id"] if res.data else None
        _auto_log.debug("Registro criado no banco | log_id=%s", log_id)
    except Exception as exc:  # noqa: BLE001
        _auto_log.warning("Falha ao registrar início no banco: %s", exc)

    # ── Executa a automação ──
    try:
        yield

        # Sucesso
        fim = datetime.now(timezone.utc)
        duracao = round((fim - inicio).total_seconds(), 2)
        _auto_log.info("Concluida | duracao=%.2fs", duracao)

        if log_id:
            try:
                db.table("automacoes_log").update(
                    {
                        "status": "concluido",
                        "finalizado_em": fim.isoformat(),
                        "duracao_segundos": duracao,
                    }
                ).eq("id", log_id).execute()
            except Exception as exc:  # noqa: BLE001
                _auto_log.warning("Falha ao registrar conclusão no banco: %s", exc)

    except Exception as exc:
        # Erro: registra no banco, alerta dono e relança
        fim = datetime.now(timezone.utc)
        duracao = round((fim - inicio).total_seconds(), 2)
        erro_str = str(exc)[:1000]

        _auto_log.error("Falhou | duracao=%.2fs | erro=%s", duracao, erro_str)

        if log_id:
            try:
                db.table("automacoes_log").update(
                    {
                        "status": "erro",
                        "finalizado_em": fim.isoformat(),
                        "duracao_segundos": duracao,
                        "erro": erro_str,
                    }
                ).eq("id", log_id).execute()
            except Exception as db_exc:  # noqa: BLE001
                _auto_log.warning("Falha ao registrar erro no banco: %s", db_exc)

        await alertar_dono(
            f"*Automacao:* `{nome}`\n"
            f"*Erro:* {erro_str[:300]}\n"
            f"*Duracao:* {duracao:.2f}s"
        )
        raise  # relança — não suprime o erro original
