from __future__ import annotations
"""
NPS Agent — Processa respostas de feedback via IA e classifica automaticamente.
Usa GPT-4o-mini para extrair nota, sentimento e temas do feedback do cliente.
"""
import json
import logging
import re
from datetime import datetime, timezone

from openai import AsyncOpenAI
from fastapi import APIRouter
from config import get_settings
from supabase_client import get_supabase

logger = logging.getLogger("shopflow")
router = APIRouter(prefix="/nps", tags=["NPS"])


def _parse_gpt_json(content: str) -> dict:
    """Extrai JSON da resposta GPT de forma robusta (suporta markdown e texto extra)."""
    content = content.strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    match = re.search(r"\{[^{}]+\}", content, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Nenhum JSON válido em: {content[:120]}")


async def process_nps_response(survey_id: str, raw_response: str) -> dict:
    """
    Analisa uma resposta de NPS em texto livre com GPT-4o-mini.
    Extrai: nota (0-10), classificação, sentimento e temas mencionados.
    """
    if not raw_response or not raw_response.strip():
        return {"error": "resposta vazia"}

    try:
        s = get_settings()
        client = AsyncOpenAI(api_key=s.openai_api_key)

        prompt = f"""Você é um analisador de NPS para uma loja de roupas.
Analise a resposta do cliente e extraia as informações.
Retorne SOMENTE JSON:
{{
  "score": 0-10,
  "classification": "promotor|neutro|detrator",
  "sentiment": "positivo|neutro|negativo",
  "themes": ["tema1", "tema2"],
  "summary": "resumo de 1 frase"
}}

Regras de classificação:
- promotor: nota 9 ou 10
- neutro: nota 7 ou 8
- detrator: nota 0 a 6
- Se a nota não for mencionada explicitamente, infira pelo sentimento geral

Resposta do cliente: {raw_response}"""

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=300,
        )

        content = response.choices[0].message.content
        if not content:
            return {"error": "resposta vazia do GPT"}

        try:
            result = _parse_gpt_json(content)
        except ValueError as e:
            logger.warning("NPS Agent: JSON inválido do GPT — %s", e)
            return {"error": f"JSON inválido: {e}"}

        # ─── Validação do score ──────────────────────────────────────────
        raw_score = result.get("score")
        if raw_score is not None:
            try:
                score = int(float(raw_score))  # aceita "8.5" → 8
                score = max(0, min(10, score))  # clamp entre 0-10
            except (ValueError, TypeError):
                score = None
        else:
            score = None

        valid_classifications = {"promotor", "neutro", "detrator"}
        classification = result.get("classification", "")
        if classification not in valid_classifications:
            # Infere da nota se a classificação do GPT for inválida
            if score is not None:
                if score >= 9:
                    classification = "promotor"
                elif score >= 7:
                    classification = "neutro"
                else:
                    classification = "detrator"
            else:
                classification = None

        valid_sentiments = {"positivo", "neutro", "negativo"}
        sentiment = result.get("sentiment", "")
        if sentiment not in valid_sentiments:
            sentiment = None

        # Atualizar no banco — colunas garantidas pela migration 20260328000002
        db = get_supabase()
        db.table("nps_surveys").update({
            "score":          score,
            "classification": classification,
            "sentiment":      sentiment,
            "themes":         result.get("themes") if isinstance(result.get("themes"), list) else None,
            "summary":        str(result.get("summary", ""))[:500] if result.get("summary") else None,
            "status":         "responded",
            "responded_at":   datetime.now(timezone.utc).isoformat(),
            "processed_at":   datetime.now(timezone.utc).isoformat(),
        }).eq("id", survey_id).execute()

        logger.info(
            "NPS processado: survey=%s score=%s classification=%s",
            survey_id, result.get("score"), result.get("classification"),
        )
        return result

    except Exception as e:
        logger.warning("NPS Agent falhou: %s", e)
        return {"error": str(e)}


@router.post("/submit/{survey_id}")
async def submit_nps(survey_id: str, request: dict):
    """Recebe resposta pública do cliente e processa com IA."""
    raw_response = request.get("response", "") or request.get("feedback", "")
    if not raw_response:
        return {"error": "Envie a resposta no campo 'response'"}
    result = await process_nps_response(survey_id, raw_response)
    return {"status": "ok", "result": result}


@router.get("/analytics")
async def nps_analytics():
    """Retorna métricas NPS processadas pela IA."""
    db = get_supabase()
    try:
        res = (
            db.table("nps_surveys")
            .select("score, classification, sentiment, themes, summary, responded_at")
            .eq("status", "responded")
            .order("responded_at", desc=True)
            .limit(100)
            .execute()
        )
        surveys = res.data or []

        if not surveys:
            return {"total": 0, "avg_score": 0, "promotors": 0, "detrators": 0, "neutros": 0}

        scores = [s["score"] for s in surveys if s.get("score") is not None]
        avg_score = sum(scores) / len(scores) if scores else 0

        by_class = {"promotor": 0, "neutro": 0, "detrator": 0}
        for s in surveys:
            c = s.get("classification", "")
            if c in by_class:
                by_class[c] += 1

        total = len(surveys)
        nps_score = round(
            ((by_class["promotor"] - by_class["detrator"]) / total * 100) if total else 0
        )

        return {
            "total": total,
            "avg_score": round(avg_score, 1),
            "nps_score": nps_score,
            "promotors": by_class["promotor"],
            "neutros": by_class["neutro"],
            "detrators": by_class["detrator"],
            "recent": surveys[:10],
        }
    except Exception as e:
        return {"error": str(e)}
