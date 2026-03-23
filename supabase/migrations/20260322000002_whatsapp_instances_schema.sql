-- ============================================
-- FASE 6: Configuração WhatsApp Banco de Dados (Single-Tenant)
-- ============================================

CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  api_url text NOT NULL,
  api_token text NOT NULL,
  instance_name text NOT NULL,
  status text DEFAULT 'disconnected',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Universal Single-Tenant)
DROP POLICY IF EXISTS "Universal access for authenticated users" ON public.whatsapp_instances;
CREATE POLICY "Universal access for authenticated users"
  ON public.whatsapp_instances FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS update_whatsapp_instances_updated_at ON public.whatsapp_instances;
CREATE TRIGGER update_whatsapp_instances_updated_at 
  BEFORE UPDATE ON public.whatsapp_instances 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
