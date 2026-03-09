
-- Enums
CREATE TYPE public.rule_trigger_event AS ENUM ('after_purchase', 'no_purchase', 'birthday', 'manual');
CREATE TYPE public.rule_channel AS ENUM ('whatsapp', 'sms', 'email');
CREATE TYPE public.execution_status AS ENUM ('scheduled', 'sent', 'failed', 'cancelled');

-- Relationship rules table
CREATE TABLE public.relationship_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  trigger_event rule_trigger_event NOT NULL DEFAULT 'after_purchase',
  delay_days INTEGER NOT NULL DEFAULT 3,
  message_template TEXT NOT NULL DEFAULT '',
  channel rule_channel NOT NULL DEFAULT 'whatsapp',
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.relationship_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view rules in tenant" ON public.relationship_rules
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Admins can insert rules" ON public.relationship_rules
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

CREATE POLICY "Admins can update rules" ON public.relationship_rules
  FOR UPDATE USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

CREATE POLICY "Admins can delete rules" ON public.relationship_rules
  FOR DELETE USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

-- Relationship executions table
CREATE TABLE public.relationship_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  rule_id UUID NOT NULL REFERENCES public.relationship_rules(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  status execution_status NOT NULL DEFAULT 'scheduled',
  message_sent TEXT,
  n8n_execution_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.relationship_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view executions in tenant" ON public.relationship_executions
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Admins can insert executions" ON public.relationship_executions
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

CREATE POLICY "Admins can update executions" ON public.relationship_executions
  FOR UPDATE USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

CREATE POLICY "Admins can delete executions" ON public.relationship_executions
  FOR DELETE USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));
