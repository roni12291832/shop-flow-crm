from __future__ import annotations
"""
Jarvis — Agente de IA para análise de dados e respostas inteligentes.
Usa OpenAI GPT-4o-mini como motor de inteligência.
"""
import logging
from datetime import datetime, timedelta
from openai import AsyncOpenAI
from config import get_settings
from supabase_client import get_supabase

logger = logging.getLogger("jarvis")

SYSTEM_PROMPT = """Você é um assistente inteligente especializado em análise de dados e vendas para lojas de roupas.

Você analisa dados de um sistema ERP completo que inclui:
- Vendas
- CRM (pipeline e leads)
- Financeiro
- Tráfego pago (Google Ads e Meta Ads)

Seu objetivo é gerar insights práticos e acionáveis para aumentar o faturamento e melhorar a performance da empresa.

REGRAS DE RESPOSTA:
- Responda em português (Brasil)
- Máximo de 3 frases por resposta
- Linguagem simples, direta e sem jargões técnicos
- Tom simpático, profissional e persuasivo
- Sempre focar em ação prática

NUNCA:
- Invente dados ou informações
- Faça promessas irreais
- Responda sem base nos dados fornecidos

SE FALTAR INFORMAÇÃO:
- Diga claramente que precisa verificar mais dados antes de concluir

ANÁLISES QUE VOCÊ DEVE FAZER:
- Identificar gargalos no funil de vendas
- Analisar pipeline do CRM (leads, etapas, conversão)
- Avaliar desempenho de campanhas pagas (ROI, custo por lead, conversão)
- Analisar faturamento, lucro, custos e tendências
- Avaliar desempenho individual de vendedores
- Identificar produtos com baixa e alta saída
- Sugerir melhorias para aumentar conversão e ticket médio

CLASSIFICAÇÃO DE PRIORIDADE:
Para cada resposta, classifique o impacto da recomendação como:
- ALTO: impacta diretamente o faturamento ou está causando perda significativa de vendas
- MÉDIO: melhora desempenho, mas não é crítico
- BAIXO: otimizações menores ou ajustes finos

FORMATO DA RESPOSTA:
Responda sempre neste formato:

Prioridade: [ALTO | MÉDIO | BAIXO]  
Insight: [o principal insight encontrado]  
Problema: [o que está errado ou pode melhorar]  
Ação: [o que deve ser feito de forma clara e direta]

Sempre termine incentivando o próximo passo do usuário (ex: analisar mais dados, ajustar campanha, falar com time, etc).
"""


class JarvisAgent:
    """Agente de IA com contexto completo do CRM."""

    def __init__(self):
        s = get_settings()
        self.client = AsyncOpenAI(api_key=s.openai_api_key)
        self.db = get_supabase()

    async def generate_daily_report(self) -> str:
        """Gera relatório diário completo de vendas e performance."""
        context = await self._collect_daily_context()

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"""
Gere um relatório diário de vendas completo e visualmente bonito para WhatsApp baseado nestes dados:

{context}

O relatório deve conter:
1. 📊 Resumo do dia (vendas, ticket médio, total)
2. 🏆 Top 3 vendedores do dia
3. 📈 Pipeline (quantos leads em cada etapa)
4. ⚠️ Alertas (estoque baixo, leads parados, etc.)
5. 💡 Sugestões rápidas de ação para amanhã

Formate para leitura no WhatsApp (linhas curtas, emojis, negrito com asterisco).
"""},
        ]

        response = await self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=2000,
        )
        return response.choices[0].message.content

    async def analyze_query(self, user_question: str, history: list = None, external_context: str = "", user_name: str = "Usuário") -> str:
        """Responde perguntas do admin sobre o CRM com dados reais."""
        # Se recebeu contexto externo do frontend, usa ele. Se não, coleta do banco.
        context = external_context if external_context else await self._collect_full_context()

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]
        
        # Adiciona histórico se existir
        if history:
            for msg in history[-5:]: # Pega os últimos 5
                messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})

        messages.append({"role": "user", "content": f"""
Olá, sou o {user_name}. Tenho uma dúvida sobre o CRM.

Contexto atual do CRM:
{context}

Minha pergunta: {user_question}

Responda de forma completa e amigável, como se estivéssemos conversando. Use os dados acima para embasar sua resposta.
"""})

        response = await self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=1500,
        )
        return response.choices[0].message.content

    async def auto_reply_lead(self, client_name: str, client_message: str, client_history: list) -> str:
        """Gera resposta automática para lead no chat."""
        history_text = "\n".join(
            [f"{'Lead' if m.get('is_from_client') else 'Loja'}: {m.get('content', '')}" for m in client_history[-10:]]
        )

        messages = [
            {"role": "system", "content": """Você é um assistente de vendas inteligente.
Responda de forma simpática, profissional e persuasiva.
Nunca invente preços ou promessas. Se não souber, diga que vai verificar.
Mantenha as respostas curtas (máximo 3 frases) para WhatsApp.
Sempre tente engajar o cliente para avançar na jornada de compra."""},
            {"role": "user", "content": f"""
Nome do cliente: {client_name}
Histórico recente da conversa:
{history_text}

Última mensagem do cliente: {client_message}

Gere uma resposta adequada:
"""},
        ]

        response = await self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.8,
            max_tokens=300,
        )
        return response.choices[0].message.content

    async def analyze_client_intent(self, client_message: str) -> bool:
        """Avalia se a mensagem do cliente demonstra interesse em algum produto."""
        messages = [
            {"role": "system", "content": """Você é um classificador de intenção. 
Avalie se a mensagem do cliente expressa interesse em comprar, quer saber preço, pergunta sobre um produto específico, ou demonstra intenção de compra de qualquer forma.
Responda APENAS "SIM" se for interesse, ou "NAO" caso contrário (por exemplo: um simples 'oi', erro, mensagem vazia, ou assunto não relacionado)."""},
            {"role": "user", "content": f"Mensagem do cliente: {client_message}"}
        ]

        response = await self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.0,
            max_tokens=10,
        )
        return "SIM" in response.choices[0].message.content.strip().upper()

    async def generate_message_variations(self, base_message: str, count: int = 15) -> str:
        """Gera variações de uma mensagem para evitar bloqueio no WhatsApp."""
        messages = [
            {"role": "system", "content": f"""Você é um especialista em Copywriting para vendas e proteção Anti-Ban de WhatsApp.
Seu objetivo é gerar exatamente {count} variações extremamente diversificadas de uma mesma mensagem base.

REGRAS CRÍTICAS:
1. Mantenha o mesmo sentido, mas alterne saudações (Olá, Oi, Tudo bem?, Como vai?), sinônimos, ordem das frases e emojis.
2. Use as mesmas variáveis que encontrar na base (ex: {{{{nome}}}}, {{{{produto}}}}). NÃO as invente ou mude.
3. Separe cada variação APENAS pela sequência " ||| " (três barras verticais com espaços).
4. O resultado deve ser UM ÚNICO TEXTO longo contendo as {count} versões separadas por |||.
5. Não numere as versões no texto."""},
            {"role": "user", "content": f"MENSAGEM BASE:\n{base_message}"}
        ]

        response = await self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.9,
            max_tokens=2500,
        )
        return response.choices[0].message.content.strip()

    # ─── Coletores de Contexto ────────────────────────────────────────────

    async def _collect_daily_context(self) -> str:
        """Coleta dados do dia para o relatório diário."""
        today = datetime.utcnow().strftime("%Y-%m-%d")
        yesterday = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")

        # Vendas do dia
        sales_res = self.db.table("sales_entries").select("*").gte("created_at", f"{today}T00:00:00").execute()
        sales = sales_res.data or []
        total_sales = sum(float(s.get("value", 0)) for s in sales)

        # Vendas de ontem (para comparação)
        yesterday_sales_res = self.db.table("sales_entries").select("*").gte("created_at", f"{yesterday}T00:00:00").lt("created_at", f"{today}T00:00:00").execute()
        yesterday_sales = yesterday_sales_res.data or []
        yesterday_total = sum(float(s.get("value", 0)) for s in yesterday_sales)

        # Pipeline
        pipeline_res = self.db.table("opportunities").select("stage").execute()
        pipeline_data = pipeline_res.data or []
        stage_counts = {}
        for opp in pipeline_data:
            stage = opp.get("stage", "desconhecido")
            stage_counts[stage] = stage_counts.get(stage, 0) + 1

        # Clientes novos
        new_clients_res = self.db.table("clients").select("id").gte("created_at", f"{today}T00:00:00").execute()
        new_clients = len(new_clients_res.data or [])

        # Estoque baixo
        low_stock_res = self.db.table("products").select("name, current_stock, min_stock").execute()
        low_stock = [p for p in (low_stock_res.data or []) if (p.get("current_stock", 0) or 0) <= (p.get("min_stock", 0) or 0)]

        return f"""
VENDAS HOJE: {len(sales)} vendas | Total: R$ {total_sales:,.2f} | Ticket médio: R$ {(total_sales / len(sales) if sales else 0):,.2f}
VENDAS ONTEM: {len(yesterday_sales)} vendas | Total: R$ {yesterday_total:,.2f}
NOVOS CLIENTES HOJE: {new_clients}
PIPELINE: {stage_counts}
PRODUTOS COM ESTOQUE BAIXO: {len(low_stock)} - {', '.join([p['name'] for p in low_stock[:5]])}
"""

    async def _collect_full_context(self) -> str:
        """Coleta contexto completo para perguntas do admin."""
        daily = await self._collect_daily_context()

        # Total de clientes
        clients_res = self.db.table("clients").select("id, temperature", count="exact").execute()
        total_clients = clients_res.count or 0

        # Temperatura dos leads
        temps = {}
        for c in (clients_res.data or []):
            t = c.get("temperature", "frio")
            temps[t] = temps.get(t, 0) + 1

        # NPS recente
        nps_res = self.db.table("nps_surveys").select("score").eq("status", "responded").order("responded_at", desc=True).limit(50).execute()
        nps_scores = [s.get("score", 0) for s in (nps_res.data or [])]
        avg_nps = sum(nps_scores) / len(nps_scores) if nps_scores else 0

        return f"""{daily}
TOTAL CLIENTES: {total_clients}
TEMPERATURAS: {temps}
NPS MÉDIO (últimos 50): {avg_nps:.1f}
"""


# Instância global
jarvis = JarvisAgent()
