from __future__ import annotations
"""
WhatsApp Watcher Agent — Analisa mensagens recebidas e move leads no funil automaticamente.
Usa GPT-4o-mini para classificar a intenção do cliente com base no histórico da conversa.
"""
import json
import logging
from datetime import datetime, timezone
from openai import AsyncOpenAI
from config import get_settings

logger = logging.getLogger("shopflow")

# Ordem do funil — usada para comparar estágios e só avançar para frente
STAGE_ORDER = ["lead_novo", "contato_iniciado", "interessado", "comprador", "perdido", "desqualificado"]

SYSTEM_PROMPT = """Você é um analisador de intenção de leads para uma loja de roupas.
Com base na mensagem recebida e no histórico da conversa, retorne SOMENTE um JSON:

{
  "stage": "lead_novo|contato_iniciado|interessado|comprador|perdido",
  "confidence": 0.0-1.0,
  "reason": "explicação curta"
}

Regras:
- "lead_novo": primeira mensagem genérica, sem contexto de compra, apenas cumprimento
- "contato_iniciado": respondeu à abordagem mas sem interesse claro em produto específico
- "interessado": perguntou sobre produto específico, tamanho, cor, preço, estoque, prazo de entrega
- "comprador": confirmou compra, pediu pix/link de pagamento, informou endereço de entrega, agradeceu pela compra
- "perdido": disse que não quer, achou caro, desistiu explicitamente, bloqueou ou foi grosseiro

Responda APENAS com o JSON, sem texto adicional, sem markdown."""


async def analyze_and_move_lead(
    client_id: str,
    opportunity_id: str,
    current_stage: str,
    new_message: str,
    message_history: list,
    db,
) -> dict:
    """
    Analisa a mensagem do cliente e decide se deve mover o lead de etapa.

    - Só move se a nova etapa for mais avançada no funil
    - Exceção: "perdido" pode sempre ser marcado
    - Requer confidence >= 0.7 para mover
    - Retorna dict com {"moved": bool, "new_stage": str, "reason": str}
    """
    if not new_message or not new_message.strip():
        return {"moved": False, "reason": "mensagem vazia"}

    try:
        s = get_settings()
        client = AsyncOpenAI(api_key=s.openai_api_key)

        # Monta histórico para o prompt
        history_lines = []
        for m in message_history[-10:]:
            # Suporta tanto o formato {"is_from_client": bool} quanto {"direction": "inbound"}
            is_client = m.get("is_from_client", m.get("direction") == "inbound")
            role = "Cliente" if is_client else "Loja"
            content = m.get("content", m.get("text", ""))
            if content:
                history_lines.append(f"{role}: {content}")

        history_text = "\n".join(history_lines) if history_lines else "(sem histórico anterior)"

        user_prompt = f"""Histórico da conversa:
{history_text}

Nova mensagem do cliente: {new_message}

Etapa atual: {current_stage}"""

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=150,
        )

        content = response.choices[0].message.content
        if not content:
            return {"moved": False, "reason": "resposta vazia do GPT"}

        result = json.loads(content.strip())
        suggested_stage = result.get("stage", "")
        confidence = float(result.get("confidence", 0.0))
        reason = result.get("reason", "")

        if not suggested_stage or suggested_stage not in STAGE_ORDER:
            logger.warning("Watcher: estágio sugerido inválido '%s'", suggested_stage)
            return {"moved": False, "reason": f"estágio inválido: {suggested_stage}"}

        # Verificar se deve mover
        current_idx = STAGE_ORDER.index(current_stage) if current_stage in STAGE_ORDER else 0
        suggested_idx = STAGE_ORDER.index(suggested_stage)

        # Condições para mover:
        # 1. É "perdido" (pode sempre ser marcado)
        # 2. Avança no funil (suggested_idx > current_idx)
        # 3. Confiança suficiente
        should_move = (
            suggested_stage != current_stage and
            confidence >= 0.7 and
            (suggested_stage == "perdido" or suggested_idx > current_idx)
        )

        if not should_move:
            logger.info(
                "Watcher: não mover %s → %s (confidence=%.2f, should_move=%s)",
                current_stage, suggested_stage, confidence, should_move,
            )
            return {"moved": False, "suggested": suggested_stage, "confidence": confidence, "reason": reason}

        # Atualizar etapa no Supabase
        db.table("opportunities").update({
            "stage": suggested_stage,
            "ai_last_analyzed": datetime.now(timezone.utc).isoformat(),
            "ai_suggested_stage": suggested_stage,
        }).eq("id", opportunity_id).execute()

        # Log da automação
        try:
            db.table("automacoes_log").insert({
                "automation_name": "whatsapp_watcher",
                "status": "sucesso",
                "context": json.dumps({
                    "client_id": client_id,
                    "opportunity_id": opportunity_id,
                    "from_stage": current_stage,
                    "to_stage": suggested_stage,
                    "confidence": confidence,
                    "reason": reason,
                }),
                "started_at": datetime.now(timezone.utc).isoformat(),
                "ended_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
        except Exception as log_err:
            logger.warning("Watcher: erro ao salvar log (não crítico): %s", log_err)

        logger.info(
            "Watcher: lead movido %s → %s (confidence=%.2f) | %s",
            current_stage, suggested_stage, confidence, reason,
        )
        return {"moved": True, "new_stage": suggested_stage, "confidence": confidence, "reason": reason}

    except json.JSONDecodeError as e:
        logger.warning("Watcher: GPT retornou JSON inválido — %s", e)
        return {"moved": False, "reason": f"JSON inválido: {e}"}
    except Exception as e:
        logger.warning("Watcher: falhou (não crítico) — %s", e)
        return {"moved": False, "reason": str(e)}
