-- ============================================
-- Módulo: Itens de Venda (History & Exchanges)
-- ============================================

-- Tabela de Itens de Venda
CREATE TABLE IF NOT EXISTS public.sales_entries_itens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id uuid NOT NULL REFERENCES public.sales_entries(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES public.produto_skus(id),
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_sales_items_sale_id ON public.sales_entries_itens(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_items_sku_id ON public.sales_entries_itens(sku_id);

-- Habilitar RLS
ALTER TABLE public.sales_entries_itens ENABLE ROW LEVEL SECURITY;

-- Política de acesso universal para usuários autenticados (Single-Tenant)
CREATE POLICY "Universal access for authenticated users" ON public.sales_entries_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Comentários
COMMENT ON TABLE public.sales_entries_itens IS 'Armazena os itens individuais de cada venda realizada.';
