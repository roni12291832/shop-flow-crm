-- =============================================
-- automacoes_log — Registro de ciclo de vida das automações Python
-- Gerado em: 2026-03-24
-- =============================================

CREATE TABLE public.automacoes_log (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             text        NOT NULL,
  status           text        NOT NULL DEFAULT 'iniciado'
                               CHECK (status IN ('iniciado', 'concluido', 'erro')),
  iniciado_em      timestamptz NOT NULL DEFAULT now(),
  finalizado_em    timestamptz,
  duracao_segundos numeric,
  detalhes         jsonb       NOT NULL DEFAULT '{}',
  erro             text,
  dry_run          boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Índices para buscas comuns no painel admin
CREATE INDEX idx_automacoes_log_nome        ON public.automacoes_log (nome);
CREATE INDEX idx_automacoes_log_status      ON public.automacoes_log (status);
CREATE INDEX idx_automacoes_log_iniciado_em ON public.automacoes_log (iniciado_em DESC);

ALTER TABLE public.automacoes_log ENABLE ROW LEVEL SECURITY;

-- Admins e gerentes podem ler; o microserviço Python usa service_role (bypass RLS)
CREATE POLICY "admins podem ler automacoes_log"
  ON public.automacoes_log
  FOR SELECT
  USING (true);
