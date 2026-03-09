
-- Create NPS enums
DO $$ BEGIN
  CREATE TYPE public.nps_trigger AS ENUM ('after_sale', 'after_conversation', 'manual', 'scheduled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.nps_category AS ENUM ('promotor', 'neutro', 'detrator');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.nps_status AS ENUM ('sent', 'responded', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create nps_surveys table
CREATE TABLE public.nps_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  customer_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  triggered_by nps_trigger NOT NULL DEFAULT 'manual',
  reference_id uuid,
  sent_at timestamptz DEFAULT now(),
  responded_at timestamptz,
  score integer CHECK (score >= 0 AND score <= 10),
  comment text,
  category nps_category,
  status nps_status NOT NULL DEFAULT 'sent',
  unique_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_nps_surveys_token ON public.nps_surveys(unique_token);

ALTER TABLE public.nps_surveys ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view surveys in their tenant
CREATE POLICY "Users can view nps_surveys in tenant" ON public.nps_surveys
  FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());

-- Admins/gerentes can insert surveys
CREATE POLICY "Admins can insert nps_surveys" ON public.nps_surveys
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

-- Admins can update surveys
CREATE POLICY "Admins can update nps_surveys" ON public.nps_surveys
  FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- Allow anon to read a survey by token (for public page)
CREATE POLICY "Anon can read survey by token" ON public.nps_surveys
  FOR SELECT TO anon USING (true);

-- Allow anon to update survey score (for public response)
CREATE POLICY "Anon can respond to survey" ON public.nps_surveys
  FOR UPDATE TO anon USING (true)
  WITH CHECK (true);

-- Create nps_settings table
CREATE TABLE public.nps_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) UNIQUE,
  auto_send_after_sale boolean NOT NULL DEFAULT false,
  auto_send_after_conversation boolean NOT NULL DEFAULT false,
  delay_hours integer NOT NULL DEFAULT 24,
  message_template text DEFAULT 'Oi {{nome}}! Como foi sua experiência na {{loja}}? Avalie em 1 clique: {{link}}',
  ask_comment_from_score integer NOT NULL DEFAULT 7,
  webhook_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nps_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view nps_settings in tenant" ON public.nps_settings
  FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Admins can insert nps_settings" ON public.nps_settings
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update nps_settings" ON public.nps_settings
  FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));
