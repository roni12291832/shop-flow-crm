from __future__ import annotations
"""
Cron de Régua de Relacionamento.
Processa regras ativas baseadas em eventos (after_purchase, no_purchase, birthday).
Gera variações automáticas via OpenAI se não houver suficiente no banco.
Roda via APScheduler (main.py) — a cada 30 minutos.
"""
import asyncio
import json
import random
from datetime import datetime, timedelta, date, timezone

from openai import AsyncOpenAI
from core import logger, DRY_RUN, registrar_automacao, alertar_dono
from supabase_client import get_supabase
from uazapi_client import uazapi
from config import get_settings

MIN_VARIATIONS = 15  # Anti-ban WhatsApp


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
        result = json.loads(content.strip())
        generated = result.get("variations", [])

        if len(generated) >= MIN_VARIATIONS:
            # Apaga variações antigas antes de inserir as novas
            try:
                db.table("relationship_message_variations").delete().eq("rule_id", rule["id"]).execute()
                rows = [{"rule_id": rule["id"], "content": v} for v in generated]
                db.table("relationship_message_variations").insert(rows).execute()
                logger.info("Variações salvas no banco para regra '%s' (%d)", rule["name"], len(generated))
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
) -> bool:
    """Envia uma variação aleatória de mensagem para o cliente."""
    phone = client.get("phone", "")
    if not phone:
        return False

    variation = random.choice(variations)
    personalized = uazapi._personalize_message(variation, client)

    if DRY_RUN:
        logger.info("[DRY_RUN] Enviaria para %s: %.60s...", client.get("name"), personalized)
        success = True
    else:
        resp = await uazapi.send_text(
            api_url=wp_config["api_url"],
            api_token=wp_config["api_token"],
            instance_name=wp_config["instance_name"],
            phone=phone,
            message=personalized,
            instance_token=wp_config.get("instance_token"),
        )
        success = "error" not in resp

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
        try:
            # Todos compradores
            buyer_res = (
                db.table("opportunities")
                .select("client_id")
                .eq("stage", "comprador")
                .execute()
            )
            buyer_ids = list({b["client_id"] for b in (buyer_res.data or [])})

            for client_id in buyer_ids:
                # Última compra
                last_sale_res = (
                    db.table("sales_entries")
                    .select("created_at")
                    .eq("client_id", client_id)
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                if not last_sale_res.data:
                    continue
                last_sale_date = datetime.fromisoformat(
                    last_sale_res.data[0]["created_at"].split("T")[0]
                ).date()
                if last_sale_date <= cutoff:
                    client_res = db.table("clients").select("*").eq("id", client_id).limit(1).execute()
                    if client_res.data:
                        eligible_clients.append(client_res.data[0])
        except Exception as e:
            logger.warning("Erro ao buscar clientes no_purchase: %s", e)

    elif rule["trigger_event"] == "birthday":
        # Aniversários hoje (considera delay_days como antecipação)
        bday_target = today + timedelta(days=delay_days)
        try:
            clients_res = (
                db.table("clients")
                .select("*")
                .not_.is_("birth_date", "null")
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

        success = await _dispatch_to_client(rule, client, variations, wp_config, db)
        if success:
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
