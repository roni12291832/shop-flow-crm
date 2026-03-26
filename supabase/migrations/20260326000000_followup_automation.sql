-- Sistema de Follow-Up Automático
-- Sequências de mensagens automáticas para leads novos no Pipeline

-- Templates de sequência (configurados pelo usuário)
CREATE TABLE IF NOT EXISTS public.followup_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Etapas de cada template (step 1 → após N horas do lead_novo, step 2 → após M horas do step 1, etc.)
CREATE TABLE IF NOT EXISTS public.followup_steps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES public.followup_templates(id) ON DELETE CASCADE,
  step_number  int NOT NULL DEFAULT 1,
  delay_hours  int NOT NULL DEFAULT 1,  -- horas após o passo anterior (ou criação do lead para step 1)
  message      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, step_number)
);

-- Follow-ups agendados por cliente (gerados automaticamente quando lead entra em lead_novo)
CREATE TABLE IF NOT EXISTS public.followup_schedules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  step_id        uuid NOT NULL REFERENCES public.followup_steps(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE CASCADE,
  scheduled_for  timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'pending', -- pending | sent | cancelled | skipped
  sent_at        timestamptz,
  cancel_reason  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_schedules_status ON public.followup_schedules(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_followup_schedules_client ON public.followup_schedules(client_id, status);

-- Log histórico de disparos (para métricas no dashboard)
CREATE TABLE IF NOT EXISTS public.followup_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid REFERENCES public.clients(id),
  step_id      uuid REFERENCES public.followup_steps(id),
  message_sent text,
  status       text NOT NULL, -- sent | failed | skipped
  error        text,
  sent_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS: acesso livre para o serviço (sem RLS por enquanto, igual ao resto do projeto)
ALTER TABLE public.followup_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage followup_templates"
  ON public.followup_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage followup_steps"
  ON public.followup_steps FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage followup_schedules"
  ON public.followup_schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage followup_logs"
  ON public.followup_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Insere template padrão de boas-vindas para novos leads
INSERT INTO public.followup_templates (name, is_active)
VALUES ('Sequência Lead Novo (Padrão)', true)
ON CONFLICT DO NOTHING;
