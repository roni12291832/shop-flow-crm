-- ============================================
-- Módulo: Catálogo com Grades
-- ============================================

-- Tabela de Produtos Base
CREATE TABLE IF NOT EXISTS public.produtos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  categoria text,
  colecao text,
  fornecedor_id uuid, -- Referência futura para tabela de fornecedores
  preco_base numeric DEFAULT 0,
  custo_base numeric DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de SKUs (Variações)
CREATE TABLE IF NOT EXISTS public.produto_skus (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  cor text NOT NULL,
  tamanho text NOT NULL,
  sku text UNIQUE NOT NULL,
  codigo_barras text UNIQUE,
  preco numeric DEFAULT 0,
  custo numeric DEFAULT 0,
  estoque_atual integer DEFAULT 0,
  estoque_minimo integer DEFAULT 2,
  image_url text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON public.produtos(categoria);
CREATE INDEX IF NOT EXISTS idx_produto_skus_produto_id ON public.produto_skus(produto_id);
CREATE INDEX IF NOT EXISTS idx_produto_skus_sku ON public.produto_skus(sku);
CREATE INDEX IF NOT EXISTS idx_produto_skus_barcode ON public.produto_skus(codigo_barras);

-- RLS (Row Level Security)
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_skus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Universal access for authenticated users" ON public.produtos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Universal access for authenticated users" ON public.produto_skus FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Comentários para documentação
COMMENT ON TABLE public.produtos IS 'Tabela que armazena os produtos base (sem variações individuais).';
COMMENT ON TABLE public.produto_skus IS 'Tabela que armazena os itens individuais (variações de cor/tamanho) com estoque próprio.';
