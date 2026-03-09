
-- Payment method enum
CREATE TYPE public.payment_method AS ENUM ('pix', 'credito', 'debito', 'dinheiro', 'boleto', 'crediario');

-- Sale status enum
CREATE TYPE public.sale_status AS ENUM ('confirmado', 'pendente', 'cancelado');

-- Goal period type enum
CREATE TYPE public.goal_period_type AS ENUM ('daily', 'weekly', 'monthly');

-- Goals table
CREATE TABLE public.goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID,
  period_type goal_period_type NOT NULL DEFAULT 'daily',
  target_value NUMERIC NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Sales entries table
CREATE TABLE public.sales_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  customer_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  payment_method payment_method NOT NULL DEFAULT 'pix',
  status sale_status NOT NULL DEFAULT 'confirmado',
  sold_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies for goals
CREATE POLICY "Users can view goals in tenant"
  ON public.goals FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Admins can insert goals"
  ON public.goals FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update goals"
  ON public.goals FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete goals"
  ON public.goals FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));

-- RLS policies for sales_entries
CREATE POLICY "Users can view sales in tenant"
  ON public.sales_entries FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can insert sales in tenant"
  ON public.sales_entries FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can update own sales"
  ON public.sales_entries FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND user_id = auth.uid());

CREATE POLICY "Admins can delete sales"
  ON public.sales_entries FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));

-- Enable realtime for sales_entries
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_entries;
