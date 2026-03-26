-- ============================================================
-- CORREÇÃO: Enum pipeline_stage + tabela tenants
-- ============================================================

-- 1. Adiciona os valores corretos ao enum pipeline_stage
--    (ADD VALUE IF NOT EXISTS é seguro — não falha se já existir)
ALTER TYPE public.pipeline_stage ADD VALUE IF NOT EXISTS 'lead_novo';
ALTER TYPE public.pipeline_stage ADD VALUE IF NOT EXISTS 'interessado';
ALTER TYPE public.pipeline_stage ADD VALUE IF NOT EXISTS 'comprador';
ALTER TYPE public.pipeline_stage ADD VALUE IF NOT EXISTS 'desqualificado';
ALTER TYPE public.pipeline_stage ADD VALUE IF NOT EXISTS 'perdido';

-- 2. Recria a tabela tenants (foi dropada na migration single_tenant_refactor)
CREATE TABLE IF NOT EXISTS public.tenants (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name     text        NOT NULL DEFAULT 'Minha Empresa',
  logo_url         text,
  primary_color    text        DEFAULT '#6366f1',
  secondary_color  text        DEFAULT '#8b5cf6',
  google_mybusiness_url text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Garante que existe pelo menos uma linha (single-tenant)
INSERT INTO public.tenants (company_name)
SELECT 'Minha Empresa'
WHERE NOT EXISTS (SELECT 1 FROM public.tenants);

-- RLS: usuários autenticados gerenciam livremente (sistema single-tenant)
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users manage tenants" ON public.tenants;
CREATE POLICY "Authenticated users manage tenants"
  ON public.tenants FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
