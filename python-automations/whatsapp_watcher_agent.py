from __future__ import annotations
"""
WhatsApp Watcher Agent — Analisa mensagens recebidas e move leads no funil automaticamente.
Usa GPT-4o-mini para classificar a intenção do cliente com base no histórico da conversa.
"""
import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from openai import AsyncOpenAI
from config import get_settings
from stages import STAGE_ORDER

logger = logging.getLogger("shopflow")

# Cliente OpenAI singleton — reutilizado em todas as chamadas (evita criar conexão HTTP por mensagem)
_openai_client: AsyncOpenAI | None = None


def _get_openai_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=get_settings().openai_api_key)
    return _openai_client

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


SYSTEM_PROMPT = """Você é um analisador de intenção de leads para uma loja de roupas.
Com base na mensagem recebida e no histórico da conversa, classifique o estágio atual do lead.

IMPORTANTE: você só é chamado para leads que já estão em "contato_iniciado" ou "interessado".
O estágio "lead_novo" já foi tratado pelo sistema antes de chamar você.

Retorne SOMENTE um JSON (sem texto adicional, sem markdown):

{
  "stage": "contato_iniciado|interessado|comprador|perdido",
  "confidence": 0.0-1.0,
  "reason": "explicação curta em português"
}

Classificação dos estágios:
- "contato_iniciado": conversando de forma genérica, sem perguntar sobre produto específico (ex: "oi", "tudo bem?", "ainda tem promoção?", "como funciona o site?")
- "interessado": perguntou sobre produto específico — tamanho, cor, preço, estoque, foto, medidas, prazo de entrega, formas de pagamento de um produto (ex: "tem a calça X no 40?", "quanto custa o vestido?", "tem em outras cores?")
- "comprador": confirmou que quer comprar, pediu PIX/link de pagamento, informou endereço de entrega, enviou comprovante, agradeceu pela compra (ex: "vou levar", "me passa o PIX", "meu endereço é...", "obrigada pela compra")
- "perdido": explicitamente desistiu, achou caro sem continuidade, disse que não quer mais, bloqueou ou foi grosseiro (ex: "não tenho interesse", "muito caro, obrigado", "não quero mais")

Dicas:
- Confidence >= 0.85 apenas quando tiver CERTEZA pelo contexto completo
- Confidence entre 0.7-0.84 quando a intenção é clara mas poderia ter outra interpretação
- Confidence < 0.7 quando ambíguo (o sistema não moverá o lead nesses casos)
- Prefira avançar o lead se a mensagem tiver qualquer sinal de interesse em produto específico
- "perdido" deve ser usado com parcimônia — apenas quando explícito e definitivo"""


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
        client = _get_openai_client()

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

        # Tenta até 2 vezes — GPT ocasionalmente retorna JSON malformado
        result = None
        last_error = None
        for attempt in range(2):
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
                max_tokens=150,
            )
            content = response.choices[0].message.content if response.choices else None
            if not content:
                last_error = "resposta vazia do GPT"
                if attempt == 0:
                    await asyncio.sleep(1)
                continue
            try:
                result = _parse_gpt_json(content)
                break  # sucesso
            except ValueError as e:
                last_error = str(e)
                logger.warning("Watcher: tentativa %d — JSON inválido: %s", attempt + 1, e)
                if attempt == 0:
                    await asyncio.sleep(1)

        if result is None:
            logger.warning("Watcher: 2 tentativas falharam para cliente %s — %s", client_id, last_error)
            return {"moved": False, "reason": f"json_parse_failed: {last_error}"}
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

        # Log da automação — usa o schema correto da tabela automacoes_log
        # (campos: nome, status, detalhes, iniciado_em, finalizado_em, dry_run)
        try:
            _now = datetime.now(timezone.utc).isoformat()
            db.table("automacoes_log").insert({
                "nome": "whatsapp_watcher",
                "status": "concluido",
                "detalhes": {
                    "client_id": client_id,
                    "opportunity_id": opportunity_id,
                    "from_stage": current_stage,
                    "to_stage": suggested_stage,
                    "confidence": confidence,
                    "reason": reason,
                },
                "iniciado_em": _now,
                "finalizado_em": _now,
                "dry_run": False,
            }).execute()
        except Exception as log_err:
            logger.warning("Watcher: erro ao salvar log (não crítico): %s", log_err)

        logger.info(
            "Watcher: lead movido %s → %s (confidence=%.2f) | %s",
            current_stage, suggested_stage, confidence, reason,
        )
        return {"moved": True, "new_stage": suggested_stage, "confidence": confidence, "reason": reason}

    except Exception as e:
        logger.warning("Watcher: falhou (não crítico) — %s", e)
        return {"moved": False, "reason": str(e)}
