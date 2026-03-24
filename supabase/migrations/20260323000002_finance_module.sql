-- ============================================
-- Módulo: Financeiro Operacional
-- ============================================

-- Enum para tipo de lançamento
DO $$ BEGIN
    CREATE TYPE public.tipo_lancamento AS ENUM ('entrada', 'saida');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enum para categoria financeira
DO $$ BEGIN
    CREATE TYPE public.categoria_financeira AS ENUM ('venda', 'servico', 'aluguel', 'fornecedor', 'pessoal', 'imposto', 'marketing', 'infraestrutura', 'investimento', 'outro');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Tabela de Lançamentos
CREATE TABLE IF NOT EXISTS public.lancamentos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo public.tipo_lancamento NOT NULL,
  categoria public.categoria_financeira NOT NULL,
  descricao text NOT NULL,
  valor numeric NOT NULL,
  data_vencimento date NOT NULL,
  data_pagamento date, -- Se NULL, está pendente
  forma_pagamento text,
  venda_id uuid REFERENCES public.sales_entries(id),
  status text DEFAULT 'pendente', -- pendente, pago, cancelado
  recorrente boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de Fechamentos de Caixa
CREATE TABLE IF NOT EXISTS public.fechamentos_caixa (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  data date NOT NULL UNIQUE,
  loja_id text DEFAULT 'principal',
  saldo_abertura numeric DEFAULT 0,
  total_entradas numeric DEFAULT 0,
  total_saidas numeric DEFAULT 0,
  saldo_fechamento numeric DEFAULT 0,
  fechado_por uuid REFERENCES auth.users(id),
  observacoes text,
  created_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_lancamentos_vencimento ON public.lancamentos(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_lancamentos_status ON public.lancamentos(status);
CREATE INDEX IF NOT EXISTS idx_fechamentos_data ON public.fechamentos_caixa(data);

-- RLS
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fechamentos_caixa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Universal access for authenticated users" ON public.lancamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Universal access for authenticated users" ON public.fechamentos_caixa FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Automação: Sempre que uma venda for inserida, cria um lançamento de entrada
CREATE OR REPLACE FUNCTION public.sync_sale_to_finance()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.lancamentos (
    tipo, 
    categoria, 
    descricao, 
    valor, 
    data_vencimento, 
    data_pagamento, 
    forma_pagamento, 
    venda_id, 
    status
  ) VALUES (
    'entrada',
    'venda',
    'Venda #' || NEW.id,
    NEW.total,
    CURRENT_DATE,
    CURRENT_DATE,
    NEW.payment_method,
    NEW.id,
    'pago'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_sale_to_finance ON public.sales_entries;
CREATE TRIGGER trg_sync_sale_to_finance
  AFTER INSERT ON public.sales_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_sale_to_finance();

-- Função para calcular DRE Simplificado
-- Pode ser chamada via RPC ou usada diretamente no frontend
CREATE OR REPLACE FUNCTION public.get_dre_mensal(p_mes integer, p_ano integer)
RETURNS TABLE (
    receita_bruta numeric,
    devolucoes numeric,
    cmv numeric,
    despesas_fixas numeric,
    despesas_variaveis numeric,
    margem_liquida numeric
) AS $$
DECLARE
    v_inicio date := make_date(p_ano, p_mes, 1);
    v_fim date := (v_inicio + interval '1 month' - interval '1 day')::date;
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'entrada' AND categoria = 'venda'), 0) as receita_bruta,
        -- Aqui poderíamos integrar com a tabela de trocas se quisermos valor exato de devolução
        0.0 as devolucoes, 
        -- CMV estimado ou vindo de outra tabela (ex: 40% da receita como fallback)
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'entrada' AND categoria = 'venda'), 0) * 0.4 as cmv,
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'saida' AND categoria IN ('aluguel', 'pessoal', 'infraestrutura')), 0) as despesas_fixas,
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'saida' AND categoria NOT IN ('aluguel', 'pessoal', 'infraestrutura')), 0) as despesas_variaveis,
        (COALESCE(SUM(valor) FILTER (WHERE tipo = 'entrada'), 0) - COALESCE(SUM(valor) FILTER (WHERE tipo = 'saida'), 0)) as margem_liquida
    FROM public.lancamentos
    WHERE data_vencimento BETWEEN v_inicio AND v_fim;
END;
$$ LANGUAGE plpgsql;
