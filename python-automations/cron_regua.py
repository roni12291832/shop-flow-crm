from __future__ import annotations
"""
Cron de Régua de Relacionamento — 2 tipos:

1. ANIVERSARIANTES (birthday)
   - Sem limite de envio
   - Roda qualquer dia da semana
   - Envia para TODOS que fazem aniversário no dia atual

2. CAMPANHA PARA COMPRADORES (no_purchase / buyers)
   - Apenas Segunda a Sábado
   - 40 mensagens/dia: 20 manhã (08h–12h) + 20 tarde (13h–18h)
   - Distribuição aleatória dentro de cada slot
   - Delay aleatório 60–180s entre mensagens (anti-ban)
   - Cada pessoa recebe variação diferente (15 variações obrigatórias)
   - Rastreia quem já recebeu a campanha (não repete)
   - Desativa automaticamente quando campanha encerra ou todos receberam

Roda via APScheduler a cada 30 minutos (main.py).
"""
import asyncio
import math
import random
from datetime import datetime, timedelta, date, timezone

from core import logger, DRY_RUN, registrar_automacao, alertar_dono
from supabase_client import get_supabase
from uazapi_client import uazapi

# ─── Constantes ───────────────────────────────────────────────────────────────
BRT = timezone(timedelta(hours=-3))

# Janela de disparos para Compradores
MORNING_START    = 8    # 08:00 BRT
MORNING_END      = 12   # 12:00 BRT  (última msg sai antes das 12h)
AFTERNOON_START  = 13   # 13:00 BRT
AFTERNOON_END    = 18   # 18:00 BRT  (última msg sai antes das 18h)

MORNING_QUOTA    = 20   # máx 20 mensagens pela manhã
AFTERNOON_QUOTA  = 20   # máx 20 mensagens à tarde
DAILY_QUOTA      = MORNING_QUOTA + AFTERNOON_QUOTA  # 40 total

CRON_INTERVAL    = 30   # minutos entre execuções do cron (APScheduler)
MIN_VARIATIONS   = 15   # anti-ban: mínimo obrigatório de variações
MIN_DELAY_SEC    = 60   # delay mínimo entre mensagens (1 min)
MAX_DELAY_SEC    = 180  # delay máximo entre mensagens (3 min)


# ─── Helpers de tempo ─────────────────────────────────────────────────────────

def _is_weekday() -> bool:
    """True se hoje for Segunda(0) a Sábado(5). Domingo(6) = False."""
    return datetime.now(BRT).weekday() < 6


def _get_current_slot() -> str | None:
    """Retorna 'morning', 'afternoon' ou None se fora da janela de disparos."""
    h = datetime.now(BRT).hour
    if MORNING_START <= h < MORNING_END:
        return "morning"
    if AFTERNOON_START <= h < AFTERNOON_END:
        return "afternoon"
    return None


def _minutes_until_slot_end(slot: str) -> int:
    """Minutos restantes até o fim do slot atual."""
    now = datetime.now(BRT)
    end_h = MORNING_END if slot == "morning" else AFTERNOON_END
    slot_end = now.replace(hour=end_h, minute=0, second=0, microsecond=0)
    return max(0, int((slot_end - now).total_seconds() / 60))


def _get_batch_size(slot_quota: int, already_sent: int, minutes_until_end: int) -> int:
    """
    Calcula quantas mensagens enviar nesta execução do cron para distribuir
    de forma natural ao longo do slot (sem sobrecarregar uma única execução).
    """
    remaining = slot_quota - already_sent
    if remaining <= 0:
        return 0
    # Quantas execuções restam neste slot?
    runs_left = max(1, math.ceil(minutes_until_end / CRON_INTERVAL))
    # Média por execução + jitter de ±1
    base = math.ceil(remaining / runs_left)
    jitter = random.randint(0, 1)
    return min(remaining, base + jitter)


# ─── Helpers de banco ─────────────────────────────────────────────────────────

def _get_variations(db, rule: dict) -> list[str]:
    """
    Busca variações de mensagem para a regra.
    Ordem de prioridade:
      1. Tabela relationship_message_variations (via wizard)
      2. message_template separado por ||| (legado)
    """
    try:
        res = (
            db.table("relationship_message_variations")
            .select("content")
            .eq("rule_id", rule["id"])
            .execute()
        )
        items = [v["content"] for v in (res.data or []) if v.get("content")]
        if len(items) >= MIN_VARIATIONS:
            return items
    except Exception as e:
        logger.warning("Erro ao buscar relationship_message_variations: %s", e)

    # Fallback: ||| no message_template
    raw = rule.get("message_template", "")
    if raw:
        parts = [p.strip() for p in raw.split("|||") if p.strip()]
        if len(parts) >= MIN_VARIATIONS:
            return parts

    return []


def _count_slot_sends_today(db, rule_id: str, slot: str) -> int:
    """Conta mensagens enviadas com sucesso hoje neste slot (morning ou afternoon)."""
    today = datetime.now(BRT).date().isoformat()
    start_h = MORNING_START if slot == "morning" else AFTERNOON_START
    end_h   = MORNING_END   if slot == "morning" else AFTERNOON_END
    start_dt = f"{today}T{start_h:02d}:00:00-03:00"
    end_dt   = f"{today}T{end_h:02d}:00:00-03:00"
    try:
        res = (
            db.table("relationship_executions")
            .select("id", count="exact")
            .eq("rule_id", rule_id)
            .eq("status", "concluido")
            .gte("sent_at", start_dt)
            .lt("sent_at", end_dt)
            .execute()
        )
        return res.count or 0
    except Exception:
        return 0


def _get_pending_clients(db, rule_id: str, all_clients: list[dict]) -> list[dict]:
    """Filtra clientes que ainda não receberam esta campanha (qualquer envio bem-sucedido)."""
    if not all_clients:
        return []
    try:
        res = (
            db.table("relationship_executions")
            .select("customer_id")
            .eq("rule_id", rule_id)
            .eq("status", "concluido")
            .execute()
        )
        already_sent = {r["customer_id"] for r in (res.data or [])}
        return [c for c in all_clients if c["id"] not in already_sent]
    except Exception as e:
        logger.warning("Erro ao buscar execuções da campanha: %s", e)
        return all_clients


def _personalize(message: str, client: dict) -> str:
    """Substitui variáveis da mensagem com dados do cliente."""
    name = client.get("name", "") or ""
    for token in ("{nome}", "{{nome}}"):
        message = message.replace(token, name)
    return message


# ─── Helpers de mídia ─────────────────────────────────────────────────────────

def _get_media_urls(rule: dict) -> list[str]:
    """Retorna lista de URLs de mídia da regra (campo media_urls do banco)."""
    raw = rule.get("media_urls") or []
    if isinstance(raw, str):
        import json
        try:
            raw = json.loads(raw)
        except Exception:
            return []
    return [u for u in raw if isinstance(u, str) and u.startswith("http")]


def _is_video_url(url: str) -> bool:
    return bool(url and url.lower().split("?")[0].rsplit(".", 1)[-1] in ("mp4", "mov", "avi", "webm", "mkv"))


async def _send_with_media(
    phone: str,
    text: str,
    media_urls: list[str],
    wp_config: dict,
) -> bool | str:
    """
    Envia mídia + texto.

    Lógica:
      - 1 vídeo → envia vídeo com texto como legenda
      - 1 foto  → envia foto com texto como legenda
      - 2–4 fotos → envia 1ª foto com legenda; demais fotos sem legenda (delay 2–5s)

    Retorna True (sucesso), False (falha) ou str com error_code crítico.
    """
    token = wp_config.get("instance_token") or wp_config["api_token"]
    api_url = wp_config["api_url"]
    api_token = wp_config["api_token"]

    first_url = media_urls[0]
    media_type = "video" if _is_video_url(first_url) else "image"

    # Envia primeiro item com legenda
    resp = await uazapi.send_media(
        api_url=api_url,
        api_token=api_token,
        phone=phone,
        media_type=media_type,
        file=first_url,
        text=text,
        instance_token=token,
    )
    error_code = resp.get("error_code") if "error" in resp else None
    if error_code in ("rate_limit", "auth_error"):
        return error_code

    result_ok = "error" not in resp

    # Fotos adicionais (sem legenda)
    for extra_url in media_urls[1:]:
        await asyncio.sleep(random.randint(2, 5))
        resp2 = await uazapi.send_media(
            api_url=api_url,
            api_token=api_token,
            phone=phone,
            media_type="image",
            file=extra_url,
            instance_token=token,
        )
        ec2 = resp2.get("error_code") if "error" in resp2 else None
        if ec2 in ("rate_limit", "auth_error"):
            return ec2  # para o loop imediatamente

    return result_ok


# ─── Dispatch ─────────────────────────────────────────────────────────────────

async def _dispatch(rule: dict, client: dict, variations: list[str], wp_config: dict, db) -> bool | str:
    """
    Envia uma variação aleatória (+ mídia se houver) para o cliente.
    Retorna True (sucesso), False (falha), ou str com código de erro crítico.
    """
    phone = client.get("phone", "")
    if not phone:
        logger.warning("Cliente '%s' sem telefone — pulando", client.get("name"))
        return False

    variation = random.choice(variations)
    personalized = _personalize(variation, client)
    media_urls = _get_media_urls(rule)

    if DRY_RUN:
        media_info = f" + {len(media_urls)} mídia(s)" if media_urls else ""
        logger.info("[DRY_RUN] Para %s: %.70s...%s", client.get("name"), personalized, media_info)
        result_ok = True
        error_code = None
    else:
        if media_urls:
            # Envia mídia com o texto como legenda
            result = await _send_with_media(
                phone=phone,
                text=personalized,
                media_urls=media_urls,
                wp_config=wp_config,
            )
            if isinstance(result, str):  # error_code
                return result
            result_ok = bool(result)
            error_code = None
        else:
            # Só texto
            resp = await uazapi.send_text(
                api_url=wp_config["api_url"],
                api_token=wp_config["api_token"],
                instance_name=wp_config["instance_name"],
                phone=phone,
                message=personalized,
                instance_token=wp_config.get("instance_token"),
            )
            error_code = resp.get("error_code") if "error" in resp else None
            result_ok = "error" not in resp

            if error_code in ("rate_limit", "auth_error"):
                logger.warning(
                    "Régua '%s': erro %s para %s — interrompendo",
                    rule["name"], error_code, client.get("name"),
                )
                return error_code

    # Registra execução
    try:
        db.table("relationship_executions").insert({
            "rule_id": rule["id"],
            "customer_id": client["id"],
            "scheduled_for": datetime.now(timezone.utc).isoformat(),
            "sent_at": datetime.now(timezone.utc).isoformat() if result_ok else None,
            "status": "concluido" if result_ok else "falhou",
            "message_sent": personalized if not DRY_RUN else f"[DRY_RUN] {personalized}",
        }).execute()
    except Exception as e:
        logger.warning("Erro ao registrar execução: %s", e)

    return result_ok


# ─── Aniversariantes ──────────────────────────────────────────────────────────

async def process_birthday_rule(rule: dict, wp_config: dict, db) -> None:
    """
    Processa regra de Aniversário.
    - Sem limite de envio (envia para TODOS que fazem aniversário hoje)
    - Qualquer dia da semana
    - Não reenvia para quem já recebeu hoje
    """
    today = datetime.now(BRT).date()

    # Busca todos os clientes com data de aniversário
    try:
        clients_res = (
            db.table("clients")
            .select("id, name, phone, birth_date")
            .not_.is_("birth_date", "null")
            .not_.is_("phone", "null")
            .limit(5000)
            .execute()
        )
    except Exception as e:
        logger.warning("Erro ao buscar clientes com aniversário: %s", e)
        return

    eligible = []
    for c in (clients_res.data or []):
        try:
            bd = datetime.fromisoformat(c["birth_date"].split("T")[0]).date()
            if bd.month == today.month and bd.day == today.day:
                eligible.append(c)
        except Exception:
            pass

    if not eligible:
        logger.info("Nenhum aniversariante hoje — régua '%s'", rule["name"])
        return

    # Verifica quem já recebeu a mensagem hoje
    today_start = f"{today.isoformat()}T00:00:00-03:00"
    today_end   = f"{today.isoformat()}T23:59:59-03:00"
    try:
        sent_today_res = (
            db.table("relationship_executions")
            .select("customer_id")
            .eq("rule_id", rule["id"])
            .eq("status", "concluido")
            .gte("sent_at", today_start)
            .lte("sent_at", today_end)
            .execute()
        )
        sent_ids = {r["customer_id"] for r in (sent_today_res.data or [])}
    except Exception:
        sent_ids = set()

    pending = [c for c in eligible if c["id"] not in sent_ids]

    if not pending:
        logger.info("Todos os aniversariantes já receberam mensagem hoje — '%s'", rule["name"])
        return

    variations = _get_variations(db, rule)
    if not variations:
        logger.warning("Régua '%s': sem variações — gerando uma mensagem padrão de fallback", rule["name"])
        # Fallback: usa message_template direto se disponível
        tmpl = rule.get("message_template", "")
        if tmpl:
            variations = [tmpl]
        else:
            logger.error("Régua '%s': sem mensagem configurada — abortando", rule["name"])
            return

    logger.info("%d aniversariante(s) para enviar — régua '%s'", len(pending), rule["name"])
    sent = 0
    for i, client in enumerate(pending):
        result = await _dispatch(rule, client, variations, wp_config, db)
        if result in ("rate_limit", "auth_error"):
            await alertar_dono(
                f"⚠️ {result.upper()}: régua de aniversário '{rule['name']}' interrompida após {sent} envios."
            )
            break
        elif result:
            sent += 1
        if i < len(pending) - 1:
            delay = random.randint(MIN_DELAY_SEC, MAX_DELAY_SEC)
            await asyncio.sleep(delay)

    logger.info("Birthday rule '%s' | Enviados: %d", rule["name"], sent)


# ─── Campanha para Compradores ────────────────────────────────────────────────

async def process_buyers_rule(rule: dict, wp_config: dict, db) -> None:
    """
    Processa campanha para Compradores.
    - Segunda a Sábado (sem domingo)
    - Slot manhã (08h–12h): 20 mensagens distribuídas
    - Slot tarde (13h–18h): 20 mensagens distribuídas
    - Delay 60–180s entre envios (anti-ban)
    - Rastreia quem já recebeu (não reenvia na mesma campanha)
    - Desativa quando campanha encerra ou todos receberam
    """
    # 1. Verifica dia da semana
    if not _is_weekday():
        logger.info("Régua '%s': domingo — sem disparos", rule["name"])
        return

    # 2. Verifica slot
    slot = _get_current_slot()
    if not slot:
        logger.info("Régua '%s': fora da janela (08–12h / 13–18h)", rule["name"])
        return

    # 3. Verifica datas da campanha
    now_brt = datetime.now(BRT)
    campaign_start = rule.get("campaign_start")
    campaign_end   = rule.get("campaign_end")

    if campaign_start:
        try:
            cs = datetime.fromisoformat(campaign_start.replace("Z", "+00:00"))
            if now_brt < cs.astimezone(BRT):
                logger.info("Régua '%s': campanha inicia em %s — aguardando", rule["name"], campaign_start[:10])
                return
        except Exception as e:
            logger.warning("Erro ao parsear campaign_start: %s", e)

    if campaign_end:
        try:
            ce = datetime.fromisoformat(campaign_end.replace("Z", "+00:00"))
            if now_brt > ce.astimezone(BRT):
                logger.info("Régua '%s': campanha encerrada em %s — desativando", rule["name"], campaign_end[:10])
                try:
                    db.table("relationship_rules").update({"active": False}).eq("id", rule["id"]).execute()
                except Exception:
                    pass
                return
        except Exception as e:
            logger.warning("Erro ao parsear campaign_end: %s", e)

    # 4. Verifica quota do slot
    slot_quota = MORNING_QUOTA if slot == "morning" else AFTERNOON_QUOTA
    already_sent = _count_slot_sends_today(db, rule["id"], slot)

    if already_sent >= slot_quota:
        logger.info(
            "Régua '%s' | Slot %s: quota atingida (%d/%d)",
            rule["name"], slot, already_sent, slot_quota,
        )
        return

    # 5. Calcula batch desta execução
    minutes_left = _minutes_until_slot_end(slot)
    batch_size = _get_batch_size(slot_quota, already_sent, minutes_left)
    if batch_size <= 0:
        return

    logger.info(
        "Régua '%s' | Slot: %s | Enviados hoje: %d/%d | Batch: %d | Tempo restante: %dmin",
        rule["name"], slot, already_sent, slot_quota, batch_size, minutes_left,
    )

    # 6. Busca compradores
    try:
        buyers_res = (
            db.table("opportunities")
            .select("client_id")
            .eq("stage", "comprador")
            .execute()
        )
        buyer_ids = list({b["client_id"] for b in (buyers_res.data or [])})
    except Exception as e:
        logger.warning("Erro ao buscar compradores: %s", e)
        return

    if not buyer_ids:
        logger.info("Nenhum comprador encontrado no CRM")
        return

    try:
        clients_res = (
            db.table("clients")
            .select("id, name, phone")
            .in_("id", buyer_ids)
            .not_.is_("phone", "null")
            .execute()
        )
        all_buyers = clients_res.data or []
    except Exception as e:
        logger.warning("Erro ao buscar dados dos compradores: %s", e)
        return

    # 7. Filtra quem ainda não recebeu esta campanha
    pending = _get_pending_clients(db, rule["id"], all_buyers)

    if not pending:
        logger.info(
            "Régua '%s': todos os compradores já receberam a campanha — desativando",
            rule["name"],
        )
        try:
            db.table("relationship_rules").update({"active": False}).eq("id", rule["id"]).execute()
        except Exception:
            pass
        return

    logger.info(
        "Régua '%s': %d compradores pendentes (total: %d)",
        rule["name"], len(pending), len(all_buyers),
    )

    # 8. Busca variações
    variations = _get_variations(db, rule)
    if len(variations) < MIN_VARIATIONS:
        logger.warning(
            "ABORTADO: régua '%s' tem apenas %d/%d variações — mínimo anti-ban não atingido. "
            "Edite a régua e gere pelo menos %d variações com o Jarvis.",
            rule["name"], len(variations), MIN_VARIATIONS, MIN_VARIATIONS,
        )
        await alertar_dono(
            f"⚠️ Campanha '{rule['name']}' abortada: apenas {len(variations)}/{MIN_VARIATIONS} variações. "
            f"Edite a régua e gere {MIN_VARIATIONS} variações com o Jarvis."
        )
        return

    # 9. Dispara batch (ordem aleatória, delays entre mensagens)
    random.shuffle(pending)
    batch = pending[:batch_size]
    sent = 0

    for i, client in enumerate(batch):
        result = await _dispatch(rule, client, variations, wp_config, db)

        if result in ("rate_limit", "auth_error"):
            await alertar_dono(
                f"⚠️ {str(result).upper()}: régua '{rule['name']}' interrompida após {sent} envios no slot {slot}."
            )
            break
        elif result:
            sent += 1
            logger.info("[%d/%d] Enviado para %s", sent, batch_size, client.get("name"))
        else:
            logger.warning("Falha ao enviar para %s", client.get("name"))

        if i < len(batch) - 1:
            delay = random.randint(MIN_DELAY_SEC, MAX_DELAY_SEC)
            logger.info("Anti-ban: aguardando %ds...", delay)
            await asyncio.sleep(delay)

    logger.info(
        "Régua '%s' | Slot %s | Enviados: %d/%d",
        rule["name"], slot, sent, batch_size,
    )


# ─── Job de pré-verificação (06h) ─────────────────────────────────────────────

async def job_ensure_variations() -> None:
    """
    Roda às 06h: verifica se todas as réguas ativas têm variações suficientes.
    Alerta o dono via WhatsApp se alguma régua estiver com poucas variações.
    """
    logger.info("job_ensure_variations: verificando réguas ativas")
    db = get_supabase()
    rules_res = db.table("relationship_rules").select("id, name, active").eq("active", True).execute()

    for rule in (rules_res.data or []):
        try:
            count_res = (
                db.table("relationship_message_variations")
                .select("id", count="exact")
                .eq("rule_id", rule["id"])
                .execute()
            )
            count = count_res.count or 0
            if count < MIN_VARIATIONS:
                logger.warning("Régua '%s': %d/%d variações", rule["name"], count, MIN_VARIATIONS)
                await alertar_dono(
                    f"⚠️ Régua de Relacionamento '{rule['name']}' tem apenas {count}/{MIN_VARIATIONS} variações. "
                    f"Edite a régua e gere as variações com o Jarvis para evitar bloqueio do WhatsApp."
                )
            else:
                logger.info("Régua '%s': %d variações ✓", rule["name"], count)
        except Exception as e:
            logger.error("Erro ao verificar variações da régua '%s': %s", rule.get("name"), e)


# ─── Entry point ──────────────────────────────────────────────────────────────

async def main() -> None:
    """Ponto de entrada — processa todas as réguas ativas."""
    async with registrar_automacao("cron_regua_relacionamento"):
        logger.info("Iniciando Cron de Réguas de Relacionamento | DRY_RUN=%s", DRY_RUN)
        db = get_supabase()

        # WhatsApp conectado?
        wp_res = (
            db.table("whatsapp_instances")
            .select("*")
            .eq("status", "connected")
            .limit(1)
            .execute()
        )
        if not wp_res.data:
            logger.warning("Sem instância WhatsApp conectada — cron abortado")
            return
        wp_config = wp_res.data[0]

        # Busca réguas ativas
        rules_res = db.table("relationship_rules").select("*").eq("active", True).execute()
        active_rules = rules_res.data or []

        if not active_rules:
            logger.info("Nenhuma régua ativa")
            return

        logger.info("%d régua(s) ativa(s)", len(active_rules))

        for rule in active_rules:
            try:
                trigger = rule.get("trigger_event", "")

                if trigger == "birthday":
                    await process_birthday_rule(rule, wp_config, db)

                elif trigger in ("no_purchase", "buyers"):
                    await process_buyers_rule(rule, wp_config, db)

                else:
                    logger.info("Tipo de gatilho '%s' não processado nesta versão", trigger)

            except Exception as e:
                logger.error("Erro na régua '%s': %s", rule.get("name"), e)
                await alertar_dono(f"Erro na régua '{rule.get('name')}': {str(e)[:300]}")


if __name__ == "__main__":
    import asyncio as _asyncio
    _asyncio.run(main())
