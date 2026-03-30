-- ============================================
-- Módulo: Programa de Fidelidade
-- ============================================

-- Tabela de Configuração de Fidelidade (Single Row)
CREATE TABLE IF NOT EXISTS public.fidelidade_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reais_por_ponto numeric DEFAULT 1, -- R$ 1 = X pontos
  pontos_por_desconto integer DEFAULT 100, -- 100 pontos = R$ 5
  valor_desconto numeric DEFAULT 5,
  validade_dias integer DEFAULT 180,
  niveis jsonb DEFAULT '[
    {"nome": "Bronze", "min": 0, "max": 499, "cor": "#cd7f32"},
    {"nome": "Prata", "min": 500, "max": 1499, "cor": "#c0c0c0"},
    {"nome": "Ouro", "min": 1500, "max": 999999, "cor": "#ffd700"}
  ]'::jsonb,
  msg_template text DEFAULT 'Olá {nome}! Você acabou de ganhar {pontos} pontos no programa de fidelidade da ShopFlow! Seu saldo atual é de {total} pontos.',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Inserir configuração inicial se não existir
INSERT INTO public.fidelidade_config (reais_por_ponto) 
SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM public.fidelidade_config);

-- Tabela de Carteira de Pontos do Cliente
CREATE TABLE IF NOT EXISTS public.cliente_pontos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clients(id) UNIQUE,
  pontos_total integer DEFAULT 0,
  nivel_atual text DEFAULT 'Bronze',
  ultima_compra timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de Histórico de Pontos
CREATE TABLE IF NOT EXISTS public.pontos_historico (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clients(id),
  venda_id uuid REFERENCES public.sales_entries(id),
  tipo text NOT NULL CHECK (tipo IN ('ganho', 'resgate', 'expirado')),
  pontos integer NOT NULL,
  descricao text,
  expira_em timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_fidelidade_cliente ON public.cliente_pontos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pontos_historico_cliente ON public.pontos_historico(cliente_id);

-- RLS
ALTER TABLE public.fidelidade_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_pontos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pontos_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Universal access for authenticated users" ON public.fidelidade_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Universal access for authenticated users" ON public.cliente_pontos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Universal access for authenticated users" ON public.pontos_historico FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Função para calcular e atribuir pontos na venda
CREATE OR REPLACE FUNCTION public.process_loyalty_on_sale()
RETURNS TRIGGER AS $$
DECLARE
  v_pts_ganhos integer;
  v_total_atual integer;
  v_nivel text;
  v_config RECORD;
  v_cliente RECORD;
  v_mult integer := 1;
BEGIN
  -- 1. Carregar Configuração
  SELECT * INTO v_config FROM public.fidelidade_config LIMIT 1;
  
  -- 2. Verificar se é aniversário do cliente
  SELECT * INTO v_cliente FROM public.clients WHERE id = NEW.customer_id;
  IF v_cliente.birth_date IS NOT NULL AND 
     EXTRACT(MONTH FROM v_cliente.birth_date) = EXTRACT(MONTH FROM CURRENT_DATE) AND 
     EXTRACT(DAY FROM v_cliente.birth_date) = EXTRACT(DAY FROM CURRENT_DATE) THEN
     v_mult := 2; -- Pontos em Dobro!
  END IF;

  -- 3. Calcular Pontos (R$1 = X pontos)
  v_pts_ganhos := FLOOR(NEW.total * v_config.reais_por_ponto * v_mult);

  -- 4. Criar ou Atualizar Carteira
  INSERT INTO public.cliente_pontos (cliente_id, pontos_total, ultima_compra, nivel_atual)
  VALUES (NEW.customer_id, v_pts_ganhos, now(), 'Bronze')
  ON CONFLICT (cliente_id) DO UPDATE SET 
    pontos_total = public.cliente_pontos.pontos_total + v_pts_ganhos,
    ultima_compra = now(),
    updated_at = now()
  RETURNING pontos_total INTO v_total_atual;

  -- 5. Atualizar Nível (Lógica simples baseada no total - pode ser expandida)
  IF v_total_atual >= 1500 THEN v_nivel := 'Ouro';
  ELSIF v_total_atual >= 500 THEN v_nivel := 'Prata';
  ELSE v_nivel := 'Bronze';
  END IF;

  UPDATE public.cliente_pontos SET nivel_atual = v_nivel WHERE cliente_id = NEW.customer_id;

  -- 6. Registrar Histórico
  INSERT INTO public.pontos_historico (cliente_id, venda_id, tipo, pontos, descricao, expira_em)
  VALUES (
    NEW.customer_id, 
    NEW.id, 
    'ganho', 
    v_pts_ganhos, 
    'Pontos ganhos na venda #' || NEW.id,
    now() + (v_config.validade_dias || ' days')::interval
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_process_loyalty_on_sale ON public.sales_entries;

CREATE TRIGGER trg_process_loyalty_on_sale
  AFTER INSERT OR UPDATE OF status ON public.sales_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.process_loyalty_on_sale();
