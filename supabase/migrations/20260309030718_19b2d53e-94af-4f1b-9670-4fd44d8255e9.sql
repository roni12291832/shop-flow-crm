
-- Add birth_date and gender to clients
ALTER TABLE public.clients 
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS gender text;

-- Create special_dates table
CREATE TABLE public.special_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  date date NOT NULL,
  segment_tags text[] DEFAULT '{}',
  message_template text DEFAULT '',
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.special_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view special_dates in tenant" ON public.special_dates
  FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Admins can insert special_dates" ON public.special_dates
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

CREATE POLICY "Admins can update special_dates" ON public.special_dates
  FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

CREATE POLICY "Admins can delete special_dates" ON public.special_dates
  FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

-- Create birthday_campaigns table
CREATE TABLE public.birthday_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  customer_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  year integer NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id, year)
);

ALTER TABLE public.birthday_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view birthday_campaigns in tenant" ON public.birthday_campaigns
  FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can insert birthday_campaigns" ON public.birthday_campaigns
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can update birthday_campaigns" ON public.birthday_campaigns
  FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id());
