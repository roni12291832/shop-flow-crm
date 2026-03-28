from __future__ import annotations
"""
stages.py — Fonte única de verdade para os estágios do pipeline.

Importar em TODOS os módulos que referenciam estágios.
Evita inconsistências entre nomes antigos (lead_recebido, cliente_interessado)
e os nomes atuais definidos no banco de dados.
"""

STAGE_ORDER: list[str] = [
    "lead_novo",
    "contato_iniciado",
    "interessado",
    "comprador",
    "perdido",
    "desqualificado",
]

VALID_STAGES: frozenset[str] = frozenset(STAGE_ORDER)

# Estágios que encerram o ciclo — não entram em follow-up automático
TERMINAL_STAGES: frozenset[str] = frozenset({"perdido", "desqualificado"})

# Estágios ativos no funil (recebem follow-up)
ACTIVE_STAGES: frozenset[str] = frozenset({"contato_iniciado", "interessado", "comprador"})

# Estágios sem limite diário de follow-up
UNLIMITED_STAGES: frozenset[str] = frozenset({"comprador"})
