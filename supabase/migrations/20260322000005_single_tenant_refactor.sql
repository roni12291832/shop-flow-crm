-- ==============================================================================
-- FASE 7: MIGRAÇÃO PARA ARQUITETURA SINGLE-TENANT (100% INDIVIDUAL)
-- Objetivo: Remover completamente a coluna tenant_id de todas as tabelas,
--           dropar a tabela tenants, remover a função get_user_tenant_id,
--           e aplicar RLS (Row Level Security) focado num projeto único.
-- ==============================================================================

DO $$ 
DECLARE
    t text;
    p record;
    tables_to_refactor text[] := ARRAY[
        'ad_accounts', 'ad_campaigns', 'ad_metrics', 'ad_metrics_daily', 'activities', 'clients', 'conversations', 
        'goals', 'inventory_movements', 'messages', 'metrics', 'notifications', 
        'nps_surveys', 'opportunities', 'pipelines', 'products', 'profiles', 
        'sales_entries', 'tasks', 'user_roles', 'whatsapp_instances', 'relationship_rules',
        'relationship_executions'
    ];
BEGIN
    -- 1. DROP ALL POLICIES on tables that might have tenant-based RLS
    FOR p IN (
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = ANY(tables_to_refactor)
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    END LOOP;

    -- 2. DROP tenant_id column from all tables, drop foreign keys gracefully
    FOREACH t IN ARRAY tables_to_refactor
    LOOP
        -- Checa se a tabela realmente existe no banco de dados antes de aplicar políticas
        IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
            EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS tenant_id CASCADE', t);
            
            -- 3. Create a universal policy for authenticated users
            EXECUTE format('CREATE POLICY "Universal access for authenticated users" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
        END IF;
    END LOOP;

    -- 4. DROP the master tenants table
    DROP TABLE IF EXISTS public.tenants CASCADE;

    -- 5. DROP the helper function
    DROP FUNCTION IF EXISTS public.get_user_tenant_id() CASCADE;

END $$;
