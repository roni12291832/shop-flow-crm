from __future__ import annotations
"""
Cron de Régua de Relacionamento.
Processa regras ativas baseadas em eventos (after_purchase, no_purchase, birthday).
Gera variações automáticas via OpenAI se não houver suficiente no banco.
Roda via APScheduler (main.py) — a cada 30 minutos.
"""
import asyncio
import json
import re
import random
from datetime import datetime, timedelta, date, timezone

from openai import AsyncOpenAI
from core import logger, DRY_RUN, registrar_automacao, alertar_dono
from supabase_client import get_supabase
from uazapi_client import uazapi
from config import get_settings

MIN_VARIATIONS = 15  # Anti-ban WhatsApp

# Janela de disparo: 08h–18h Brasília (UTC-3 fixo — SP não usa mais horário de verão)
BRT = timezone(timedelta(hours=-3))
WINDOW_START = 8
WINDOW_END   = 18


def _is_within_window() -> bool:
    """Retorna True se estiver dentro da janela de disparo (08h-18h BRT)."""
    return WINDOW_START <= datetime.now(BRT).hour < WINDOW_END


def _parse_gpt_json(content: str) -> dict:
    """
    Extrai JSON da resposta do GPT de forma robusta.
    Lida com: JSON puro, JSON em bloco ```json```, JSON embutido em texto.
    """
    content = content.strip()
    # Nível 1: parse direto
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass
    # Nível 2: extrai bloco ```json ... ``` ou ``` ... ```
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    # Nível 3: encontra qualquer { ... } no texto
    match = re.search(r"\{[^{}]+\}", content, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Nenhum JSON válido encontrado em: {content[:120]}")


def _random_delay() -> int:
    """Delay aleatório anti-ban: entre 15 e 60 segundos."""
    return random.randint(15, 60)


async def _generate_and_save_variations(rule: dict, db, openai_client) -> list[str]:
    """
    Gera MIN_VARIATIONS variações via GPT e salva no banco.
    Chamada tanto no job de pré-geração (06h) quanto como último recurso no disparo.
    """
    base = rule.get("message_template", "")
    if not base:
        logger.warning("Regra '%s' sem message_template — impossível gerar variações", rule["name"])
        return []

    logger.info("Gerando %d variações para regra '%s' com IA...", MIN_VARIATIONS, rule["name"])
    try:
        prompt = f"""Gere exatamente {MIN_VARIATIONS} variações diferentes desta mensagem de WhatsApp para uma loja de roupas.
Cada variação deve ter tom e estrutura ligeiramente diferentes, mas transmitir a mesma mensagem.
Use as variáveis {{nome}} e {{produto}} onde fizer sentido.
Retorne SOMENTE um JSON: {{"variations": ["msg1", "msg2", ...]}}

Mensagem base: {base}"""

        resp = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,  # Reduzido de 0.9 para variações mais coerentes
            max_tokens=2500,
        )
        content = resp.choices[0].message.content or ""
        try:
            result = _parse_gpt_json(content)
        except ValueError as parse_err:
            logger.warning("Erro ao parsear JSON de variações para '%s': %s", rule["name"], parse_err)
            return []
        generated = result.get("variations", [])

        if len(generated) >= MIN_VARIATIONS:
            # Insere PRIMEIRO as novas, depois apaga as antigas — se o insert falhar,
            # as variações antigas permanecem intactas (nunca ficamos sem variações).
            try:
                rows = [{"rule_id": rule["id"], "content": v} for v in generated]
                insert_res = db.table("relationship_message_variations").insert(rows).execute()
                if insert_res.data:
                    # Insert OK → agora apaga as antigas (que não incluem as recém-inseridas)
                    new_ids = [r["id"] for r in insert_res.data]
                    db.table("relationship_message_variations").delete().eq(
                        "rule_id", rule["id"]
                    ).not_.in_("id", new_ids).execute()
                    logger.info("Variações salvas no banco para regra '%s' (%d)", rule["name"], len(generated))
                else:
                    logger.warning("Insert de variações retornou vazio para regra '%s'", rule["name"])
            except Exception as save_err:
                logger.warning("Erro ao salvar variações: %s", save_err)
            return generated

    except Exception as e:
        logger.warning("Erro ao gerar variações com IA para regra '%s': %s", rule["name"], e)

    return []


async def _get_or_generate_variations(rule: dict, db, openai_client) -> list[str]:
    """
    Busca variações salvas no banco para a regra.
    Só chama IA se não houver suficiente — o job de pré-geração (06h) deve ter
    garantido que as variações já estão no banco antes dos disparos.
    """
    # 1. Tenta buscar da tabela relationship_message_variations
    try:
        var_res = (
            db.table("relationship_message_variations")
            .select("content")
            .eq("rule_id", rule["id"])
            .execute()
        )
        variations = [v["content"] for v in (var_res.data or [])]
    except Exception:
        variations = []

    # 2. Fallback: divide message_template por ||| (formato legado)
    if len(variations) < MIN_VARIATIONS:
        raw = rule.get("message_template", "")
        if raw:
            parts = [p.strip() for p in raw.split("|||") if p.strip()]
            if len(parts) >= MIN_VARIATIONS:
                return parts

    # 3. Último recurso: gera com IA agora (lento, pode falhar)
    if len(variations) < MIN_VARIATIONS:
        logger.warning(
            "Regra '%s' sem variações suficientes (%d/%d) — gerando em tempo real (job 06h não rodou?)",
            rule["name"], len(variations), MIN_VARIATIONS,
        )
        variations = await _generate_and_save_variations(rule, db, openai_client)

    return variations


async def job_ensure_variations() -> None:
    """
    Job de pré-geração: garante que todas as réguas ativas têm variações suficientes.
    Roda às 06h todo dia via APScheduler — antes da janela de disparos (08h-18h).
    Separa a geração de IA do momento do disparo para máxima robustez.
    """
    logger.info("job_ensure_variations: verificando variações de todas as réguas ativas")
    db = get_supabase()
    s = get_settings()
    openai_client = AsyncOpenAI(api_key=s.openai_api_key)

    rules_res = db.table("relationship_rules").select("*").eq("active", True).execute()
    active_rules = rules_res.data or []

    if not active_rules:
        logger.info("job_ensure_variations: nenhuma régua ativa")
        return

    for rule in active_rules:
        try:
            count_res = (
                db.table("relationship_message_variations")
                .select("id", count="exact")
                .eq("rule_id", rule["id"])
                .execute()
            )
            count = count_res.count or 0
            if count < MIN_VARIATIONS:
                logger.info(
                    "Régua '%s' tem %d/%d variações — gerando agora",
                    rule["name"], count, MIN_VARIATIONS,
                )
                await _generate_and_save_variations(rule, db, openai_client)
            else:
                logger.info("Régua '%s': %d variações OK", rule["name"], count)
        except Exception as e:
            logger.error("Erro ao verificar variações da régua '%s': %s", rule.get("name"), e)


async def _already_sent_today(db, rule_id: str, client_id: str) -> bool:
    """Verifica se já foi disparado para este cliente hoje."""
    today = date.today().isoformat()
    try:
        check = (
            db.table("relationship_executions")
            .select("id")
            .eq("rule_id", rule_id)
            .eq("customer_id", client_id)
            .gte("scheduled_for", today)
            .execute()
        )
        return bool(check.data)
    except Exception:
        return False


async def _dispatch_to_client(
    rule: dict,
    client: dict,
    variations: list[str],
    wp_config: dict,
    db,
) -> bool | str:
    """
    Envia uma variação aleatória de mensagem para o cliente.

    Retorna:
      True        — enviado com sucesso
      False       — erro genérico (continua o loop)
      "rate_limit" — rate limit da UAZAPI (deve parar o loop imediatamente)
    """
    phone = client.get("phone", "")
    if not phone:
        return False

    variation = random.choice(variations)
    personalized = uazapi._personalize_message(variation, client)

    if DRY_RUN:
        logger.info("[DRY_RUN] Enviaria para %s: %.60s...", client.get("name"), personalized)
        success = True
        error_code = None
    else:
        resp = await uazapi.send_text(
            api_url=wp_config["api_url"],
            api_token=wp_config["api_token"],
            instance_name=wp_config["instance_name"],
            phone=phone,
            message=personalized,
            instance_token=wp_config.get("instance_token"),
        )
        error_code = resp.get("error_code") if "error" in resp else None
        success = "error" not in resp

        # Rate limit ou auth error — sinaliza para parar o loop
        if error_code in ("rate_limit", "auth_error"):
            logger.warning(
                "Régua '%s': %s — interrompendo disparos para %s",
                rule["name"], error_code, client.get("name"),
            )
            # Registra a tentativa antes de retornar
            try:
                db.table("relationship_executions").insert({
                    "rule_id": rule["id"],
                    "customer_id": client["id"],
                    "scheduled_for": datetime.now(timezone.utc).isoformat(),
                    "sent_at": None,
                    "status": "falhou",
                    "message_sent": personalized,
                }).execute()
            except Exception:
                pass
            return error_code  # sentinel para o chamador parar o loop

    # Registrar execução
    try:
        db.table("relationship_executions").insert({
            "rule_id": rule["id"],
            "customer_id": client["id"],
            "scheduled_for": datetime.now(timezone.utc).isoformat(),
            "sent_at": datetime.now(timezone.utc).isoformat() if success else None,
            "status": "concluido" if success else "falhou",
            "message_sent": personalized if not DRY_RUN else f"[DRY_RUN] {personalized}",
        }).execute()
    except Exception as e:
        logger.warning("Erro ao salvar execução para %s: %s", client.get("name"), e)

    return success


async def process_rule(rule: dict, wp_config: dict, openai_client) -> None:
    """Processa uma régua individual — coleta elegíveis e faz disparos."""
    db = get_supabase()
    logger.info("Processando regra: '%s' | Tipo: %s", rule["name"], rule["trigger_event"])

    today = date.today()
    delay_days = int(rule.get("delay_days", 0) or 0)
    eligible_clients: list[dict] = []

    # ─── Coleta clientes elegíveis ────────────────────────────────────
    if rule["trigger_event"] == "after_purchase":
        # Clientes que compraram exatamente delay_days atrás
        target_date = today - timedelta(days=delay_days)
        try:
            sales_res = (
                db.table("sales_entries")
                .select("client_id")
                .gte("created_at", f"{target_date.isoformat()}T00:00:00")
                .lt("created_at", f"{(target_date + timedelta(days=1)).isoformat()}T00:00:00")
                .execute()
            )
            client_ids = list({s["client_id"] for s in (sales_res.data or [])})
            if client_ids:
                clients_res = db.table("clients").select("*").in_("id", client_ids).execute()
                eligible_clients = clients_res.data or []
        except Exception as e:
            logger.warning("Erro ao buscar clientes after_purchase: %s", e)

    elif rule["trigger_event"] == "no_purchase":
        # Clientes que não compram há delay_days dias
        cutoff = today - timedelta(days=delay_days)
        cutoff_iso = f"{cutoff.isoformat()}T23:59:59"
        try:
            # Busca todas as vendas até o cutoff, agrupando por client_id
            # Uma única query em vez de N+1
            sales_res = (
                db.table("sales_entries")
                .select("client_id, created_at")
                .order("created_at", desc=True)
                .execute()
            )
            # Monta mapa: client_id → data da última compra
            last_sale_map: dict[str, str] = {}
            for sale in (sales_res.data or []):
                cid = sale.get("client_id")
                if cid and cid not in last_sale_map:
                    last_sale_map[cid] = sale["created_at"]

            # Filtra compradores cuja última compra foi antes do cutoff
            buyer_res = (
                db.table("opportunities")
                .select("client_id")
                .eq("stage", "comprador")
                .execute()
            )
            buyer_ids = list({b["client_id"] for b in (buyer_res.data or [])})

            stale_buyer_ids = []
            for cid in buyer_ids:
                last_date_str = last_sale_map.get(cid)
                if not last_date_str:
                    continue
                try:
                    last_sale_date = datetime.fromisoformat(
                        last_date_str.split("T")[0]
                    ).date()
                    if last_sale_date <= cutoff:
                        stale_buyer_ids.append(cid)
                except (ValueError, TypeError):
                    continue

            # Busca clientes elegíveis em batch (máximo 1 query em vez de N)
            if stale_buyer_ids:
                clients_res = db.table("clients").select("*").in_("id", stale_buyer_ids).execute()
                eligible_clients = clients_res.data or []
        except Exception as e:
            logger.warning("Erro ao buscar clientes no_purchase: %s", e)

    elif rule["trigger_event"] == "birthday":
        # Aniversários hoje (considera delay_days como antecipação)
        bday_target = today + timedelta(days=delay_days)
        try:
            clients_res = (
                db.table("clients")
                .select("id, name, phone, email, origin, birth_date")
                .not_.is_("birth_date", "null")
                .not_.is_("phone", "null")
                .limit(5000)
                .execute()
            )
            for c in (clients_res.data or []):
                bd_raw = c.get("birth_date")
                if not bd_raw:
                    continue
                try:
                    bd_date = datetime.fromisoformat(bd_raw.split("T")[0]).date()
                    if bd_date.month == bday_target.month and bd_date.day == bday_target.day:
                        eligible_clients.append(c)
                except Exception:
                    pass
        except Exception as e:
            logger.warning("Erro ao buscar aniversariantes: %s", e)

    elif rule["trigger_event"] == "manual":
        return

    if not eligible_clients:
        logger.info("Nenhum cliente elegível para regra '%s'", rule["name"])
        return

    logger.info("%d clientes elegíveis para regra '%s'", len(eligible_clients), rule["name"])

    # Buscar/gerar variações
    variations = await _get_or_generate_variations(rule, db, openai_client)
    if len(variations) < MIN_VARIATIONS:
        logger.warning(
            "ABORTADO: regra '%s' tem apenas %d variações (mínimo %d anti-ban)",
            rule["name"], len(variations), MIN_VARIATIONS,
        )
        return

    if rule.get("channel", "whatsapp") != "whatsapp":
        logger.info("Canal '%s' não suportado — apenas whatsapp", rule.get("channel"))
        return

    # ─── Disparos ─────────────────────────────────────────────────────
    random.shuffle(eligible_clients)
    sent = 0
    failed = 0

    for i, client in enumerate(eligible_clients):
        if await _already_sent_today(db, rule["id"], client["id"]):
            logger.info("Cliente %s já recebeu disparo hoje — pulando", client.get("name"))
            continue

        result = await _dispatch_to_client(rule, client, variations, wp_config, db)

        if result == "rate_limit":
            logger.warning("Rate limit UAZAPI — régua '%s' interrompida após %d envios", rule["name"], sent)
            await alertar_dono(f"⚠️ Rate limit da UAZAPI atingido durante régua '{rule['name']}'. {sent} mensagens enviadas antes de parar.")
            break
        elif result == "auth_error":
            logger.error("Token WhatsApp inválido — régua '%s' interrompida", rule["name"])
            await alertar_dono("⚠️ Token WhatsApp inválido! Régua de relacionamento interrompida. Reconecte a instância no CRM.")
            break
        elif result:
            sent += 1
            logger.info("Enviado para %s", client.get("name"))
        else:
            failed += 1
            logger.error("Falha ao enviar para %s", client.get("name"))

        if i < len(eligible_clients) - 1:
            delay = _random_delay()
            logger.info("Aguardando %ds (anti-ban)...", delay)
            await asyncio.sleep(delay)

    logger.info("Regra '%s' concluída | Sucesso: %d | Falhas: %d", rule["name"], sent, failed)


async def main() -> None:
    """Ponto de entrada — processa todas as réguas ativas."""
    async with registrar_automacao("cron_regua_relacionamento"):
        # ─── Verificação de janela horária ──────────────────────────────────
        # Disparos só entre 08h e 18h (horário Brasília).
        # O job roda a cada 30 min, mas fora da janela retorna sem fazer nada.
        if not _is_within_window():
            logger.info(
                "Régua de relacionamento: fora da janela 08h–18h BRT (%dh) — aguardando",
                datetime.now(BRT).hour,
            )
            return

        logger.info("Iniciando Cron de Réguas de Relacionamento | DRY_RUN=%s", DRY_RUN)

        db = get_supabase()
        s = get_settings()
        openai_client = AsyncOpenAI(api_key=s.openai_api_key)

        wp_res = (
            db.table("whatsapp_instances")
            .select("*")
            .eq("status", "connected")
            .limit(1)
            .execute()
        )
        if not wp_res.data:
            logger.warning("Sem instância WhatsApp conectada — régua abortada")
            return

        wp_config = wp_res.data[0]

        rules_res = db.table("relationship_rules").select("*").eq("active", True).execute()
        active_rules = rules_res.data or []

        if not active_rules:
            logger.info("Nenhuma régua ativa")
            return

        logger.info("%d réguas ativas encontradas", len(active_rules))
        for rule in active_rules:
            try:
                await process_rule(rule, wp_config, openai_client)
            except Exception as e:
                logger.error("Erro na regra '%s': %s", rule.get("name"), e)
                await alertar_dono(f"Erro na régua '{rule.get('name')}': {e}")


if __name__ == "__main__":
    asyncio.run(main())
