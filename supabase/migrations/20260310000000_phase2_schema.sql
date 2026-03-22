-- Alter tasks table to make client_id optional
ALTER TABLE tasks ALTER COLUMN client_id DROP NOT NULL;

-- Create metas (goals) table
CREATE TABLE IF NOT EXISTS public.metas (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE, -- if null, it's a general store goal
    periodo text NOT NULL, -- 'diaria', 'mensal', etc.
    tipo text NOT NULL, -- 'vendas_valor', 'vendas_qtd', 'leads', 'atendimentos'
    valor_meta numeric NOT NULL,
    valor_atual numeric DEFAULT 0,
    data_inicio date NOT NULL,
    data_fim date NOT NULL,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    PRIMARY KEY(id)
);
ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage metas from their tenant" ON public.metas FOR ALL USING (tenant_id = public.get_user_tenant_id());

-- Create ranking_points table for Gamification
CREATE TABLE IF NOT EXISTS public.ranking_points (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    pontos integer NOT NULL,
    tipo_acao text NOT NULL, -- 'venda', 'follow_up', 'cadastro_cliente', 'video_instagram'
    descricao text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    PRIMARY KEY(id)
);
ALTER TABLE public.ranking_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view ranking from their tenant" ON public.ranking_points FOR ALL USING (tenant_id = public.get_user_tenant_id());

-- Create tenant_settings table for Google My Business and other configs
CREATE TABLE IF NOT EXISTS public.tenant_settings (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE PRIMARY KEY,
    google_my_business_url text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage settings from their tenant" ON public.tenant_settings FOR ALL USING (tenant_id = public.get_user_tenant_id());

-- Create campaign_logs table (Regua de Relacionamento)
CREATE TABLE IF NOT EXISTS public.campaign_logs (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    campaign_name text NOT NULL, -- e.g., 'Aniversario', 'Pos-Venda-7-Dias'
    sent_at timestamp with time zone default timezone('utc'::text, now()) not null,
    PRIMARY KEY(id),
    UNIQUE(tenant_id, client_id, campaign_name) -- Ensures no duplicate messages per campaign per client
);
ALTER TABLE public.campaign_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view campaign logs from their tenant" ON public.campaign_logs FOR ALL USING (tenant_id = public.get_user_tenant_id());

-- Add origin column to clients table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'origin') THEN
        ALTER TABLE public.clients ADD COLUMN origin text DEFAULT 'manual';
    END IF;
END $$;
