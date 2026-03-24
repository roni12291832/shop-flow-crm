-- ============================================
-- Módulo: Trocas & Devoluções
-- ============================================

-- Enum para motivo da troca
DO $$ BEGIN
    CREATE TYPE public.motivo_troca AS ENUM ('tamanho', 'defeito', 'desistencia', 'cor', 'outro');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enum para status da troca
DO $$ BEGIN
    CREATE TYPE public.status_troca AS ENUM ('pendente', 'aprovada', 'recusada', 'concluida');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Tabela de Trocas
CREATE TABLE IF NOT EXISTS public.trocas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  venda_id uuid REFERENCES public.sales_entries(id), -- Referência à venda original
  cliente_id uuid NOT NULL REFERENCES public.clients(id),
  motivo public.motivo_troca NOT NULL,
  status public.status_troca DEFAULT 'pendente',
  aprovado_por uuid REFERENCES auth.users(id),
  observacoes text,
  data timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de Itens da Troca
CREATE TABLE IF NOT EXISTS public.troca_itens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  troca_id uuid NOT NULL REFERENCES public.trocas(id) ON DELETE CASCADE,
  sku_devolvido_id uuid NOT NULL REFERENCES public.produto_skus(id),
  sku_novo_id uuid REFERENCES public.produto_skus(id), -- NULL se for apenas devolução/vale-troca
  quantidade integer DEFAULT 1,
  diferenca_valor numeric DEFAULT 0, -- Positivo se cliente paga, Negativo se gera crédito
  created_at timestamptz DEFAULT now()
);

-- Tabela de Vales-Troca
CREATE TABLE IF NOT EXISTS public.vales_troca (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  troca_id uuid REFERENCES public.trocas(id),
  cliente_id uuid NOT NULL REFERENCES public.clients(id),
  codigo text UNIQUE NOT NULL,
  valor numeric NOT NULL,
  validade timestamptz NOT NULL,
  usado_em timestamptz,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_trocas_cliente ON public.trocas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_trocas_venda ON public.trocas(venda_id);
CREATE INDEX IF NOT EXISTS idx_vales_codigo ON public.vales_troca(codigo);

-- RLS
ALTER TABLE public.trocas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.troca_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vales_troca ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Universal access for authenticated users" ON public.trocas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Universal access for authenticated users" ON public.troca_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Universal access for authenticated users" ON public.vales_troca FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger para devolver ao estoque automaticamente na aprovação da troca
CREATE OR REPLACE FUNCTION public.process_exchange_stock()
RETURNS TRIGGER AS $$
DECLARE
  item RECORD;
BEGIN
  -- Se a troca foi aprovada ou concluída agora
  IF (NEW.status = 'aprovada' OR NEW.status = 'concluida') AND (OLD.status = 'pendente' OR OLD.status IS NULL) THEN
    -- Para cada item na troca_itens
    FOR item IN SELECT * FROM public.troca_itens WHERE troca_id = NEW.id LOOP
      -- Devolve o item devolvido ao estoque
      UPDATE public.produto_skus 
      SET estoque_atual = estoque_atual + item.quantidade 
      WHERE id = item.sku_devolvido_id;
      
      -- Se houver um novo item saindo, remove do estoque
      IF item.sku_novo_id IS NOT NULL THEN
        UPDATE public.produto_skus 
        SET estoque_atual = estoque_atual - item.quantidade 
        WHERE id = item.sku_novo_id;
      END IF;
      
      -- Registrar movimentação no inventário (opcional, dependendo de como o sistema loga)
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_process_exchange_stock
  AFTER UPDATE OF status ON public.trocas
  FOR EACH ROW
  EXECUTE FUNCTION public.process_exchange_stock();

-- Função para alertar sobre trocas recorrentes de um produto (Qualidade)
-- Pode ser usada em uma view ou consulta direta no dashboard
CREATE OR REPLACE VIEW public.vw_alerta_qualidade_produtos AS
SELECT 
    p.nome,
    s.sku,
    COUNT(ti.id) as total_trocas
FROM public.troca_itens ti
JOIN public.produto_skus s ON ti.sku_devolvido_id = s.id
JOIN public.produtos p ON s.produto_id = p.id
GROUP BY p.nome, s.sku
HAVING COUNT(ti.id) >= 3;
