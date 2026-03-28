-- ============================================================
-- ShopFlow CRM — Batch de correções do Prompt de Qualidade
-- 2026-03-28
-- ============================================================

-- 1. Mensagens: suporte a mídia e direção
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS type text DEFAULT 'text',
    ADD COLUMN IF NOT EXISTS media_url text,
    ADD COLUMN IF NOT EXISTS direction text;

-- 2. Oportunidades: campos de análise IA
ALTER TABLE opportunities
    ADD COLUMN IF NOT EXISTS ai_last_analyzed timestamptz,
    ADD COLUMN IF NOT EXISTS ai_suggested_stage text;

-- 3. Variações de mensagens da régua de relacionamento
CREATE TABLE IF NOT EXISTS relationship_message_variations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    rule_id uuid REFERENCES relationship_rules(id) ON DELETE CASCADE,
    content text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- RLS para relationship_message_variations
ALTER TABLE relationship_message_variations ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "allow_all_relationship_message_variations"
    ON relationship_message_variations FOR ALL USING (true) WITH CHECK (true);

-- 4. Configurações da empresa (tema, logo, cores)
CREATE TABLE IF NOT EXISTS company_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid UNIQUE NOT NULL,
    company_name text,
    logo_url text,
    primary_color text DEFAULT '#6366f1',
    secondary_color text DEFAULT '#8b5cf6',
    google_business_url text,
    updated_at timestamptz DEFAULT now()
);

-- RLS para company_settings
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "allow_all_company_settings"
    ON company_settings FOR ALL USING (true) WITH CHECK (true);

-- 5. Vendas: itens em JSONB e status
ALTER TABLE sales_entries
    ADD COLUMN IF NOT EXISTS items jsonb,
    ADD COLUMN IF NOT EXISTS status text DEFAULT 'concluida',
    ADD COLUMN IF NOT EXISTS client_name text;

-- 6. Financeiro: contas a pagar
ALTER TABLE lancamentos
    ADD COLUMN IF NOT EXISTS due_date date,
    ADD COLUMN IF NOT EXISTS status text DEFAULT 'pendente',
    ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS recurring_day integer;

-- 7. NPS: análise IA
ALTER TABLE nps_surveys
    ADD COLUMN IF NOT EXISTS sentiment text,
    ADD COLUMN IF NOT EXISTS themes jsonb,
    ADD COLUMN IF NOT EXISTS summary text,
    ADD COLUMN IF NOT EXISTS processed_at timestamptz;

-- 8. Régua de relacionamento: modo de delay
ALTER TABLE relationship_rules
    ADD COLUMN IF NOT EXISTS delay_time time,
    ADD COLUMN IF NOT EXISTS delay_mode text DEFAULT 'days';

-- 9. Execuções de régua — garantir client_id (alias de customer_id)
ALTER TABLE relationship_executions
    ADD COLUMN IF NOT EXISTS client_id uuid;

-- Preencher client_id onde customer_id existe
UPDATE relationship_executions
SET client_id = customer_id
WHERE client_id IS NULL AND customer_id IS NOT NULL;

-- 10. Índices de performance
CREATE INDEX IF NOT EXISTS idx_opportunities_client_id ON opportunities(client_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_messages_client_id ON messages(client_id);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
CREATE INDEX IF NOT EXISTS idx_sales_entries_client_id ON sales_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_entries_created_at ON sales_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_relationship_executions_rule_client ON relationship_executions(rule_id, customer_id);

-- 11. Habilitar Realtime nas tabelas críticas
DO $$
BEGIN
    -- opportunities
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'opportunities'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE opportunities;
    END IF;

    -- messages
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    END IF;
END $$;

-- 12. Tabela de notificações do sistema (para central de alertas)
CREATE TABLE IF NOT EXISTS system_notifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    entity_id uuid,
    entity_type text,
    read boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE system_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "allow_all_system_notifications"
    ON system_notifications FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_system_notifications_read ON system_notifications(read);
CREATE INDEX IF NOT EXISTS idx_system_notifications_created_at ON system_notifications(created_at DESC);
