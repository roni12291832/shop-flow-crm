-- ============================================
-- FASE 6: Configuração WhatsApp Banco de Dados
-- ============================================

CREATE TABLE public.whatsapp_instances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  api_url text NOT NULL,
  api_token text NOT NULL,
  instance_name text NOT NULL,
  status text DEFAULT 'disconnected',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indices
CREATE INDEX idx_whatsapp_instances_tenant ON public.whatsapp_instances(tenant_id);

-- RLS
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view whatsapp instances of their tenant"
  ON public.whatsapp_instances FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Admin/Gerente can insert/update whatsapp instances"
  ON public.whatsapp_instances FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));

-- Trigger to update updated_at
CREATE TRIGGER update_whatsapp_instances_updated_at 
  BEFORE UPDATE ON public.whatsapp_instances 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
