-- Drop old generic followup tables (replaced by stage-based system)
DROP TABLE IF EXISTS public.followup_logs CASCADE;
DROP TABLE IF EXISTS public.followup_schedules CASCADE;
DROP TABLE IF EXISTS public.followup_steps CASCADE;
DROP TABLE IF EXISTS public.followup_templates CASCADE;

-- Steps config per stage (timing definitions — edited via Python API)
CREATE TABLE IF NOT EXISTS public.stage_followup_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage           text NOT NULL CHECK (stage IN ('contato_iniciado', 'interessado', 'comprador')),
  step_number     int  NOT NULL,
  delay_hours     int  NOT NULL,                   -- hours since stage entry (not previous step)
  delay_jitter_hours int NOT NULL DEFAULT 1,       -- random ±jitter applied to scheduled_for (anti-ban)
  min_variations  int  NOT NULL DEFAULT 15,
  auto_move_to    text DEFAULT NULL,               -- if not null: after sending this step, if no response, move opp to this stage
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(stage, step_number)
);

-- Message variations per step
CREATE TABLE IF NOT EXISTS public.stage_followup_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id          uuid NOT NULL REFERENCES public.stage_followup_steps(id) ON DELETE CASCADE,
  variation_number int  NOT NULL,
  message          text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(step_id, variation_number)
);

-- Scheduled follow-up per client/opportunity
CREATE TABLE IF NOT EXISTS public.stage_followup_schedules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  opportunity_id      uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  step_id             uuid NOT NULL REFERENCES public.stage_followup_steps(id),
  stage               text NOT NULL,
  step_number         int  NOT NULL,
  scheduled_for       timestamptz NOT NULL,
  status              text NOT NULL DEFAULT 'pending',  -- pending | sent | cancelled | skipped
  message_variation_id uuid REFERENCES public.stage_followup_messages(id),
  sent_at             timestamptz,
  cancel_reason       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sfschedules_status     ON public.stage_followup_schedules(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_sfschedules_client     ON public.stage_followup_schedules(client_id, status);
CREATE INDEX IF NOT EXISTS idx_sfschedules_opp        ON public.stage_followup_schedules(opportunity_id, status);

-- Historical log of all dispatches
CREATE TABLE IF NOT EXISTS public.stage_followup_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid REFERENCES public.clients(id),
  opportunity_id uuid REFERENCES public.opportunities(id),
  step_id        uuid REFERENCES public.stage_followup_steps(id),
  stage          text,
  step_number    int,
  message_sent   text,
  status         text NOT NULL,   -- sent | failed | skipped | auto_moved
  error          text,
  sent_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.stage_followup_steps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_followup_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_followup_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_followup_logs      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_stage_steps"     ON public.stage_followup_steps;
DROP POLICY IF EXISTS "auth_stage_messages"  ON public.stage_followup_messages;
DROP POLICY IF EXISTS "auth_stage_schedules" ON public.stage_followup_schedules;
DROP POLICY IF EXISTS "auth_stage_logs"      ON public.stage_followup_logs;

CREATE POLICY "auth_stage_steps"     ON public.stage_followup_steps     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_stage_messages"  ON public.stage_followup_messages  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_stage_schedules" ON public.stage_followup_schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_stage_logs"      ON public.stage_followup_logs      FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Default step timings
INSERT INTO public.stage_followup_steps (stage, step_number, delay_hours, delay_jitter_hours, min_variations, auto_move_to) VALUES
('contato_iniciado', 1,   4,  1, 15, NULL),
('contato_iniciado', 2,  24,  2, 15, NULL),
('contato_iniciado', 3,  72,  4, 15, NULL),
('contato_iniciado', 4, 240,  6, 15, 'perdido'),
('interessado',      1,  24,  2, 15, NULL),
('interessado',      2,  96,  4, 15, NULL),
('interessado',      3, 336,  8, 15, NULL),
('interessado',      4, 696, 12, 15, NULL),
('comprador',        1,   1,  0,  5, NULL)
ON CONFLICT (stage, step_number) DO NOTHING;
