from __future__ import annotations
"""
Cron de Régua de Relacionamento.
Processa as regras ativas e dispara mensagens para os clientes elegíveis.
Roda via APScheduler (main.py) ou diretamente: python cron_regua.py
"""
import asyncio
import random
from datetime import datetime, timedelta, date

from core import logger, DRY_RUN, registrar_automacao, alertar_dono
from supabase_client import get_supabase
from uazapi_client import uazapi


def _random_delay() -> int:
    """Delay aleatório anti-ban: 3s, 10s, 16s, 22s ou 30s."""
    return random.choice([3, 10, 16, 22, 30])


async def process_rule(rule: dict, wp_config: dict) -> None:
    """Processa uma régua individual e faz os disparos."""
    db = get_supabase()
    logger.info("Processando regra: %s | Tipo: %s", rule["name"], rule["trigger_event"])

    today = date.today()
    target_date = today - timedelta(days=rule["delay_days"])
    eligible_clients: list[dict] = []

    # ─── Coleta clientes elegíveis ────────────────────────────────────────
    if rule["trigger_event"] == "after_purchase":
        response = db.table("clients").select("*").not_.is_("last_purchase", "null").execute()
        for c in response.data or []:
            lp = c.get("last_purchase")
            if lp:
                lp_date = datetime.fromisoformat(lp.split("T")[0]).date()
                if lp_date == target_date:
                    eligible_clients.append(c)

    elif rule["trigger_event"] == "no_purchase":
        response = db.table("clients").select("*").execute()
        for c in response.data or []:
            lp = c.get("last_purchase")
            created = c.get("created_at")
            reference_date = None
            if lp:
                reference_date = datetime.fromisoformat(lp.split("T")[0]).date()
            elif created:
                reference_date = datetime.fromisoformat(created.split("T")[0]).date()
            if reference_date == target_date:
                eligible_clients.append(c)

    elif rule["trigger_event"] == "birthday":
        bday_target = today + timedelta(days=rule["delay_days"])
        response = db.table("clients").select("*").not_.is_("birth_date", "null").execute()
        for c in response.data or []:
            bd = c.get("birth_date")
            if bd:
                try:
                    bd_date = datetime.fromisoformat(bd.split("T")[0]).date()
                    if bd_date.month == bday_target.month and bd_date.day == bday_target.day:
                        eligible_clients.append(c)
                except Exception:
                    pass

    elif rule["trigger_event"] == "manual":
        return

    logger.info("Encontrados %d clientes elegíveis para regra '%s'", len(eligible_clients), rule["name"])
    if not eligible_clients:
        return

    raw_message = rule.get("message_template", "")
    if not raw_message:
        logger.warning("Regra '%s' sem message_template — ignorada", rule["name"])
        return

    messages_list = [m.strip() for m in raw_message.split("|||") if m.strip()]

    if rule["channel"] == "whatsapp" and len(messages_list) < 15:
        logger.warning(
            "ABORTADO: regra '%s' tem %d variações (mínimo 15 para Anti-Ban)",
            rule["name"], len(messages_list),
        )
        return

    # ─── Disparos ─────────────────────────────────────────────────────────
    if rule["channel"] != "whatsapp":
        logger.info("Canal '%s' não suportado — apenas whatsapp", rule["channel"])
        return

    logger.info("Iniciando disparos WhatsApp para regra '%s'...", rule["name"])
    results = {"sent": 0, "failed": 0}
    random.shuffle(eligible_clients)

    for i, client in enumerate(eligible_clients):
        # Verifica se já recebeu hoje
        try:
            exec_check = (
                db.table("relationship_executions")
                .select("id")
                .eq("rule_id", rule["id"])
                .eq("customer_id", client["id"])
                .gte("created_at", str(today))
                .execute()
            )
            if exec_check.data:
                logger.info("Cliente %s já recebeu disparo hoje — pulando", client["name"])
                continue
        except Exception as e:
            logger.warning("Erro ao checar execução anterior para %s: %s", client["name"], e)

        phone = client.get("phone", "")
        if not phone:
            continue

        msg_template = random.choice(messages_list)
        personalized_msg = uazapi._personalize_message(msg_template, client)

        logger.info(
            "Preparando envio para %s (variação %d/%d)",
            client["name"], messages_list.index(msg_template) + 1, len(messages_list),
        )

        status = "sucesso"
        if DRY_RUN:
            logger.info("[DRY_RUN] Enviaria para %s: %.60s...", client["name"], personalized_msg)
            results["sent"] += 1
        else:
            resp = await uazapi.send_text(
                api_url=wp_config["api_url"],
                api_token=wp_config["api_token"],
                instance_name=wp_config["instance_name"],
                phone=phone,
                message=personalized_msg,
            )
            if "error" in resp:
                status = "falha"
                results["failed"] += 1
                logger.error("Erro ao enviar para %s: %s", phone, resp["error"])
            else:
                results["sent"] += 1

        # Registra execução no banco
        try:
            db.table("relationship_executions").insert({
                "rule_id": rule["id"],
                "customer_id": client["id"],
                "scheduled_for": str(datetime.now()),
                "sent_at": str(datetime.now()) if status == "sucesso" else None,
                "status": "concluido" if status == "sucesso" else "falhou",
                "message_sent": personalized_msg if not DRY_RUN else f"[DRY_RUN] {personalized_msg}",
            }).execute()
        except Exception as e:
            logger.error("Erro ao salvar log de execução para %s: %s", client["name"], e)

        if i < len(eligible_clients) - 1:
            delay = _random_delay()
            logger.info("Aguardando %ds antes do próximo envio (Anti-Ban)...", delay)
            await asyncio.sleep(delay)

    logger.info(
        "Disparos concluídos para regra '%s' | Sucesso: %d | Falhas: %d",
        rule["name"], results["sent"], results["failed"],
    )


async def main() -> None:
    """Ponto de entrada principal — processa todas as réguas ativas."""
    async with registrar_automacao("cron_regua_relacionamento"):
        logger.info("Iniciando Cron de Réguas de Relacionamento | DRY_RUN=%s", DRY_RUN)

        db = get_supabase()

        # Busca instância WhatsApp ativa
        wp_res = (
            db.table("whatsapp_instances")
            .select("*")
            .eq("status", "connected")
            .limit(1)
            .execute()
        )
        if not wp_res.data:
            logger.error("Nenhuma instância WhatsApp com status='open'. Abortando disparos.")
            return

        wp_config = wp_res.data[0]

        # Busca réguas ativas
        rules_res = db.table("relationship_rules").select("*").eq("active", True).execute()
        active_rules = rules_res.data or []

        if not active_rules:
            logger.info("Nenhuma régua de relacionamento ativa.")
            return

        logger.info("Encontradas %d réguas ativas.", len(active_rules))

        for rule in active_rules:
            try:
                await process_rule(rule, wp_config)
            except Exception as e:
                logger.error("Erro ao processar regra '%s': %s", rule["name"], e)
                await alertar_dono(f"Erro na régua '{rule['name']}': {e}")


if __name__ == "__main__":
    asyncio.run(main())
