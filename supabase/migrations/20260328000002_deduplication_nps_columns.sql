-- ============================================================
-- Migration: Deduplicação de webhooks + colunas NPS completas
-- Erros corrigidos: #5 (duplicatas) e #7 (dados NPS perdidos)
-- ============================================================

-- ─── 1. Deduplicação de mensagens WhatsApp ───────────────────
-- Adiciona campo para guardar o ID original da mensagem no WhatsApp.
-- O índice UNIQUE garante que mesmo se o webhook chegar 2x, o banco rejeita o duplicado.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_provider_id
  ON public.messages(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- ─── 2. Índice em clients(phone) ─────────────────────────────
-- Crítico: toda mensagem recebida faz SELECT WHERE phone = ?
-- Sem índice = full table scan em cada webhook

CREATE INDEX IF NOT EXISTS idx_clients_phone
  ON public.clients(phone);

-- ─── 3. Índice em messages(client_id, created_at) ────────────
-- Usado em histórico de conversa, Watcher Agent e Jarvis

CREATE INDEX IF NOT EXISTS idx_messages_client_created
  ON public.messages(client_id, created_at DESC);

-- ─── 4. Índice em opportunities(client_id, stage) ────────────
-- Usado em todo webhook e follow-up

CREATE INDEX IF NOT EXISTS idx_opportunities_client_stage
  ON public.opportunities(client_id, stage);

-- ─── 5. Colunas NPS completas ────────────────────────────────
-- Garante que todas as colunas de análise IA existem.
-- Sem isso, o nps_agent.py cai em fallback silencioso perdendo dados.

ALTER TABLE public.nps_surveys
  ADD COLUMN IF NOT EXISTS classification TEXT,
  ADD COLUMN IF NOT EXISTS sentiment      TEXT,
  ADD COLUMN IF NOT EXISTS themes         JSONB,
  ADD COLUMN IF NOT EXISTS summary        TEXT,
  ADD COLUMN IF NOT EXISTS processed_at   TIMESTAMPTZ;

-- ─── 6. Status "processing" no follow-up ─────────────────────
-- Necessário para o lock otimista que evita disparos duplicados

ALTER TABLE public.stage_followup_schedules
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

-- ─── 7. Log de sistema para erros críticos ───────────────────
-- Persiste logs de ERROR+ mesmo após redeploy no Koyeb

CREATE TABLE IF NOT EXISTS public.system_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level       TEXT NOT NULL,
  logger      TEXT,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Limpa logs antigos automaticamente (mantém só últimos 30 dias)
CREATE INDEX IF NOT EXISTS idx_system_logs_created
  ON public.system_logs(created_at DESC);

-- ─── 8. Limpar dados legados com nomes de estágios antigos ───
UPDATE public.opportunities
SET stage = 'lead_novo'
WHERE stage NOT IN (
  'lead_novo','contato_iniciado','interessado',
  'comprador','perdido','desqualificado'
);
