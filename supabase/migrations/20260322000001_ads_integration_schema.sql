-- ============================================
-- FASE 4: Integração Google Ads & Meta Ads (Single-Tenant)
-- ============================================

-- Tabela de Contas de Anúncios
CREATE TABLE IF NOT EXISTS public.ad_accounts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  platform text NOT NULL CHECK (platform IN ('google', 'meta')),
  account_id text NOT NULL,
  account_name text,
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de Campanhas
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  platform_campaign_id text NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'active',
  objective text,
  budget_daily numeric DEFAULT 0,
  budget_total numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de Métricas de Anúncios (diárias por campanha)
CREATE TABLE IF NOT EXISTS public.ad_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  date date NOT NULL,
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  ctr numeric DEFAULT 0,
  cpc numeric DEFAULT 0,
  cpm numeric DEFAULT 0,
  spend numeric DEFAULT 0,
  conversions integer DEFAULT 0,
  conversion_value numeric DEFAULT 0,
  roas numeric DEFAULT 0,
  reach integer DEFAULT 0,
  frequency numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_account ON public.ad_campaigns(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_campaign ON public.ad_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_date ON public.ad_metrics(date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_metrics_unique ON public.ad_metrics(campaign_id, date);

-- RLS
ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Universal Single-Tenant)
DROP POLICY IF EXISTS "Universal access for authenticated users" ON public.ad_accounts;
CREATE POLICY "Universal access for authenticated users" ON public.ad_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Universal access for authenticated users" ON public.ad_campaigns;
CREATE POLICY "Universal access for authenticated users" ON public.ad_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Universal access for authenticated users" ON public.ad_metrics;
CREATE POLICY "Universal access for authenticated users" ON public.ad_metrics FOR ALL TO authenticated USING (true) WITH CHECK (true);
