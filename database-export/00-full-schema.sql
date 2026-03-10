-- =============================================
-- StoreCRM - Schema Completo para Supabase
-- Gerado em: 2026-03-10
-- =============================================

-- ========== ENUMS ==========

CREATE TYPE public.app_role AS ENUM ('admin', 'gerente', 'vendedor', 'atendimento', 'super_admin');
CREATE TYPE public.conversation_status AS ENUM ('aberta', 'em_atendimento', 'aguardando', 'finalizada');
CREATE TYPE public.execution_status AS ENUM ('scheduled', 'sent', 'failed', 'cancelled');
CREATE TYPE public.goal_period_type AS ENUM ('daily', 'weekly', 'monthly');
CREATE TYPE public.lead_origin AS ENUM ('whatsapp', 'instagram', 'facebook', 'google', 'indicacao', 'loja_fisica', 'site', 'outro');
CREATE TYPE public.loss_reason AS ENUM ('preco', 'cliente_desistiu', 'concorrencia', 'sem_resposta', 'outro');
CREATE TYPE public.message_sender_type AS ENUM ('cliente', 'atendente', 'ia');
CREATE TYPE public.nps_category AS ENUM ('promotor', 'neutro', 'detrator');
CREATE TYPE public.nps_status AS ENUM ('sent', 'responded', 'expired');
CREATE TYPE public.nps_trigger AS ENUM ('after_sale', 'after_conversation', 'manual', 'scheduled');
CREATE TYPE public.payment_method AS ENUM ('pix', 'credito', 'debito', 'dinheiro', 'boleto', 'crediario');
CREATE TYPE public.pipeline_stage AS ENUM ('lead_recebido', 'contato_iniciado', 'cliente_interessado', 'negociacao', 'proposta_enviada', 'venda_fechada', 'perdido');
CREATE TYPE public.rule_channel AS ENUM ('whatsapp', 'sms', 'email');
CREATE TYPE public.rule_trigger_event AS ENUM ('after_purchase', 'no_purchase', 'birthday', 'manual');
CREATE TYPE public.sale_status AS ENUM ('confirmado', 'pendente', 'cancelado');
CREATE TYPE public.task_priority AS ENUM ('alta', 'media', 'baixa');
CREATE TYPE public.task_status AS ENUM ('pendente', 'em_andamento', 'concluido');

-- ========== TABELAS ==========

-- 1. TENANTS
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  logo_url text,
  primary_color text DEFAULT '#2563eb',
  secondary_color text DEFAULT '#1e40af',
  plan_type text DEFAULT 'basic',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- 2. PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. USER_ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'vendedor',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. CLIENTS
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  birth_date date,
  gender text,
  city text,
  origin lead_origin DEFAULT 'outro',
  tags text[],
  notes text,
  responsible_id uuid,
  last_purchase timestamptz,
  ticket_medio numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- 5. OPPORTUNITIES
CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  stage pipeline_stage NOT NULL DEFAULT 'lead_recebido',
  estimated_value numeric DEFAULT 0,
  probability integer DEFAULT 0,
  responsible_id uuid,
  loss_reason loss_reason,
  loss_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

-- 6. SALES_ENTRIES
CREATE TABLE public.sales_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  customer_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  value numeric NOT NULL DEFAULT 0,
  payment_method payment_method NOT NULL DEFAULT 'pix',
  status sale_status NOT NULL DEFAULT 'confirmado',
  sold_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_entries ENABLE ROW LEVEL SECURITY;

-- 7. GOALS
CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid,
  target_value numeric NOT NULL DEFAULT 0,
  period_type goal_period_type NOT NULL DEFAULT 'daily',
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

-- 8. TASKS
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status task_status NOT NULL DEFAULT 'pendente',
  priority task_priority NOT NULL DEFAULT 'media',
  due_date timestamptz,
  responsible_id uuid,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 9. CONVERSATIONS
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  responsible_id uuid,
  status conversation_status NOT NULL DEFAULT 'aberta',
  last_message text,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- 10. MESSAGES
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  content text NOT NULL,
  sender_type message_sender_type NOT NULL DEFAULT 'cliente',
  sender_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 11. ACTIVITIES
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  type text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- 12. NOTIFICATIONS
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text,
  read boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 13. NPS_SETTINGS
CREATE TABLE public.nps_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  auto_send_after_sale boolean NOT NULL DEFAULT false,
  auto_send_after_conversation boolean NOT NULL DEFAULT false,
  delay_hours integer NOT NULL DEFAULT 24,
  message_template text DEFAULT 'Oi {{nome}}! Como foi sua experiência na {{loja}}? Avalie em 1 clique: {{link}}',
  webhook_url text,
  ask_comment_from_score integer NOT NULL DEFAULT 7,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nps_settings ENABLE ROW LEVEL SECURITY;

-- 14. NPS_SURVEYS
CREATE TABLE public.nps_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  score integer,
  category nps_category,
  comment text,
  status nps_status NOT NULL DEFAULT 'sent',
  triggered_by nps_trigger NOT NULL DEFAULT 'manual',
  unique_token uuid NOT NULL DEFAULT gen_random_uuid(),
  reference_id uuid,
  sent_at timestamptz DEFAULT now(),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nps_surveys ENABLE ROW LEVEL SECURITY;

-- 15. RELATIONSHIP_RULES
CREATE TABLE public.relationship_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_event rule_trigger_event NOT NULL DEFAULT 'after_purchase',
  delay_days integer NOT NULL DEFAULT 3,
  channel rule_channel NOT NULL DEFAULT 'whatsapp',
  message_template text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.relationship_rules ENABLE ROW LEVEL SECURITY;

-- 16. RELATIONSHIP_EXECUTIONS
CREATE TABLE public.relationship_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.relationship_rules(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  status execution_status NOT NULL DEFAULT 'scheduled',
  message_sent text,
  n8n_execution_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.relationship_executions ENABLE ROW LEVEL SECURITY;

-- 17. BIRTHDAY_CAMPAIGNS
CREATE TABLE public.birthday_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  year integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.birthday_campaigns ENABLE ROW LEVEL SECURITY;

-- 18. SPECIAL_DATES
CREATE TABLE public.special_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  date date NOT NULL,
  message_template text DEFAULT '',
  segment_tags text[] DEFAULT '{}',
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.special_dates ENABLE ROW LEVEL SECURITY;

-- ========== FUNÇÕES ==========

-- Função para obter tenant_id do usuário logado
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- Função para verificar role do usuário
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ========== RLS POLICIES ==========

-- TENANTS
CREATE POLICY "Users can view own tenant" ON public.tenants FOR SELECT TO authenticated USING (id = get_user_tenant_id());
CREATE POLICY "Super admin can view all tenants" ON public.tenants FOR SELECT TO authenticated USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins can update own tenant" ON public.tenants FOR UPDATE TO authenticated USING (id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));

-- PROFILES
CREATE POLICY "Users can view profiles in tenant" ON public.profiles FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Super admin can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- USER_ROLES
CREATE POLICY "Users can view roles in tenant" ON public.user_roles FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Super admin can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));

-- CLIENTS
CREATE POLICY "Users can view clients in tenant" ON public.clients FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Super admin can view all clients" ON public.clients FOR SELECT TO authenticated USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users can insert clients in tenant" ON public.clients FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can update clients in tenant" ON public.clients FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can delete clients in tenant" ON public.clients FOR DELETE TO authenticated USING (tenant_id = get_user_tenant_id());

-- OPPORTUNITIES
CREATE POLICY "Users can view opportunities in tenant" ON public.opportunities FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can insert opportunities in tenant" ON public.opportunities FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can update opportunities in tenant" ON public.opportunities FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can delete opportunities in tenant" ON public.opportunities FOR DELETE TO authenticated USING (tenant_id = get_user_tenant_id());

-- SALES_ENTRIES
CREATE POLICY "Users can view sales in tenant" ON public.sales_entries FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can insert sales in tenant" ON public.sales_entries FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can update own sales" ON public.sales_entries FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant_id() AND user_id = auth.uid());
CREATE POLICY "Admins can delete sales" ON public.sales_entries FOR DELETE TO authenticated USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));

-- GOALS
CREATE POLICY "Users can view goals in tenant" ON public.goals FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Admins can insert goals" ON public.goals FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update goals" ON public.goals FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete goals" ON public.goals FOR DELETE TO authenticated USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));

-- TASKS
CREATE POLICY "Users can view tasks in tenant" ON public.tasks FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can insert tasks in tenant" ON public.tasks FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can update tasks in tenant" ON public.tasks FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can delete tasks in tenant" ON public.tasks FOR DELETE TO authenticated USING (tenant_id = get_user_tenant_id());

-- CONVERSATIONS
CREATE POLICY "Users can view conversations in tenant" ON public.conversations FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can insert conversations in tenant" ON public.conversations FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can update conversations in tenant" ON public.conversations FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can delete conversations in tenant" ON public.conversations FOR DELETE TO authenticated USING (tenant_id = get_user_tenant_id());

-- MESSAGES
CREATE POLICY "Users can view messages in tenant" ON public.messages FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can insert messages in tenant" ON public.messages FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id());

-- ACTIVITIES
CREATE POLICY "Users can view activities in tenant" ON public.activities FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can insert activities in tenant" ON public.activities FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id());

-- NOTIFICATIONS
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid() AND tenant_id = get_user_tenant_id());
CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- NPS_SETTINGS
CREATE POLICY "Users can view nps_settings in tenant" ON public.nps_settings FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Admins can insert nps_settings" ON public.nps_settings FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update nps_settings" ON public.nps_settings FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));

-- NPS_SURVEYS
CREATE POLICY "Users can view nps_surveys in tenant" ON public.nps_surveys FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Admins can insert nps_surveys" ON public.nps_surveys FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));
CREATE POLICY "Admins can update nps_surveys" ON public.nps_surveys FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Anon can read pending survey" ON public.nps_surveys FOR SELECT TO anon USING (status = 'sent');
CREATE POLICY "Anon can respond to pending survey" ON public.nps_surveys FOR UPDATE TO anon USING (status = 'sent') WITH CHECK (status = 'responded');

-- RELATIONSHIP_RULES
CREATE POLICY "Users can view rules in tenant" ON public.relationship_rules FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Admins can insert rules" ON public.relationship_rules FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));
CREATE POLICY "Admins can update rules" ON public.relationship_rules FOR UPDATE USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));
CREATE POLICY "Admins can delete rules" ON public.relationship_rules FOR DELETE USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

-- RELATIONSHIP_EXECUTIONS
CREATE POLICY "Users can view executions in tenant" ON public.relationship_executions FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Admins can insert executions" ON public.relationship_executions FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));
CREATE POLICY "Admins can update executions" ON public.relationship_executions FOR UPDATE USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));
CREATE POLICY "Admins can delete executions" ON public.relationship_executions FOR DELETE USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

-- BIRTHDAY_CAMPAIGNS
CREATE POLICY "Users can view birthday_campaigns in tenant" ON public.birthday_campaigns FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can insert birthday_campaigns" ON public.birthday_campaigns FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "Users can update birthday_campaigns" ON public.birthday_campaigns FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant_id());

-- SPECIAL_DATES
CREATE POLICY "Users can view special_dates in tenant" ON public.special_dates FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Admins can insert special_dates" ON public.special_dates FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));
CREATE POLICY "Admins can update special_dates" ON public.special_dates FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));
CREATE POLICY "Admins can delete special_dates" ON public.special_dates FOR DELETE TO authenticated USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

-- ========== STORAGE ==========

-- Criar bucket público para logos
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true);

-- ========== REALTIME (opcional) ==========
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
