from __future__ import annotations
"""
NPS Agent — Processa respostas de feedback via IA e classifica automaticamente.
Usa GPT-4o-mini para extrair nota, sentimento e temas do feedback do cliente.
"""
import json
import logging
from datetime import datetime, timezone

from openai import AsyncOpenAI
from fastapi import APIRouter
from config import get_settings
from supabase_client import get_supabase

logger = logging.getLogger("shopflow")
router = APIRouter(prefix="/nps", tags=["NPS"])


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

        result = json.loads(content.strip())

        # Atualizar no banco
        db = get_supabase()
        try:
            db.table("nps_surveys").update({
                "score": result.get("score"),
                "classification": result.get("classification"),
                "sentiment": result.get("sentiment"),
                "themes": result.get("themes"),
                "summary": result.get("summary"),
                "status": "responded",
                "responded_at": datetime.now(timezone.utc).isoformat(),
                "processed_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", survey_id).execute()
        except Exception as db_err:
            logger.warning("NPS Agent: erro ao salvar no banco (colunas extras podem não existir): %s", db_err)
            # Fallback com colunas básicas
            db.table("nps_surveys").update({
                "score": result.get("score"),
                "status": "responded",
                "responded_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", survey_id).execute()

        logger.info(
            "NPS processado: survey=%s score=%s classification=%s",
            survey_id, result.get("score"), result.get("classification"),
        )
        return result

    except json.JSONDecodeError as e:
        logger.warning("NPS Agent: JSON inválido do GPT — %s", e)
        return {"error": f"JSON inválido: {e}"}
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
