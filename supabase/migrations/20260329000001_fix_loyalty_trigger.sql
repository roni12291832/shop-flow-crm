-- ===========================================================
-- Módulo de Fidelidade COMPLETO — cria tudo do zero se não existir
-- ===========================================================

-- 1. Tabela de Configuração (single row)
CREATE TABLE IF NOT EXISTS public.fidelidade_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reais_por_ponto numeric DEFAULT 1,
  pontos_por_desconto integer DEFAULT 100,
  valor_desconto numeric DEFAULT 5,
  validade_dias integer DEFAULT 180,
  niveis jsonb DEFAULT '[
    {"nome": "Bronze", "min": 0,    "max": 499,    "cor": "#cd7f32"},
    {"nome": "Prata",  "min": 500,  "max": 1499,   "cor": "#c0c0c0"},
    {"nome": "Ouro",   "min": 1500, "max": 999999, "cor": "#ffd700"}
  ]'::jsonb,
  msg_template text DEFAULT 'Olá {nome}! Você ganhou {pontos} pontos de fidelidade! Saldo: {total} pts.',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Carteira de Pontos do Cliente
CREATE TABLE IF NOT EXISTS public.cliente_pontos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  pontos_total integer DEFAULT 0,
  nivel_atual text DEFAULT 'Bronze',
  ultima_compra timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(cliente_id)
);

-- 3. Histórico de Pontos
CREATE TABLE IF NOT EXISTS public.pontos_historico (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  venda_id uuid REFERENCES public.sales_entries(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('ganho', 'resgate', 'expirado')),
  pontos integer NOT NULL,
  descricao text,
  expira_em timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 4. Transações de Fidelidade (tabela adicional rica)
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('credito', 'debito', 'expiracao')),
  pontos integer NOT NULL,
  descricao text,
  referencia_id uuid,
  created_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_fidelidade_cliente ON public.cliente_pontos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pontos_historico_cliente ON public.pontos_historico(cliente_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_cliente ON public.loyalty_transactions(cliente_id);

-- RLS
ALTER TABLE public.fidelidade_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_pontos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pontos_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_fidelidade_config" ON public.fidelidade_config;
DROP POLICY IF EXISTS "auth_all_cliente_pontos" ON public.cliente_pontos;
DROP POLICY IF EXISTS "auth_all_pontos_historico" ON public.pontos_historico;
DROP POLICY IF EXISTS "auth_all_loyalty_transactions" ON public.loyalty_transactions;

CREATE POLICY "auth_all_fidelidade_config" ON public.fidelidade_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_cliente_pontos" ON public.cliente_pontos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_pontos_historico" ON public.pontos_historico FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_loyalty_transactions" ON public.loyalty_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Garante row inicial de config
INSERT INTO public.fidelidade_config (reais_por_ponto, pontos_por_desconto, valor_desconto, validade_dias)
SELECT 1, 100, 5, 180
WHERE NOT EXISTS (SELECT 1 FROM public.fidelidade_config);

-- 6. Função do trigger (usa NEW.value — coluna correta de sales_entries)
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
  -- Só processa vendas confirmadas
  IF NEW.status <> 'confirmado' THEN
    RETURN NEW;
  END IF;

  -- Carrega configuração
  SELECT * INTO v_config FROM public.fidelidade_config LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Verifica aniversário do cliente (pontos em dobro)
  SELECT * INTO v_cliente FROM public.clients WHERE id = NEW.customer_id;
  IF FOUND AND v_cliente.birth_date IS NOT NULL AND
     EXTRACT(MONTH FROM v_cliente.birth_date) = EXTRACT(MONTH FROM CURRENT_DATE) AND
     EXTRACT(DAY FROM v_cliente.birth_date) = EXTRACT(DAY FROM CURRENT_DATE) THEN
     v_mult := 2;
  END IF;

  -- Calcula pontos: R$ 1 = reais_por_ponto pontos
  v_pts_ganhos := FLOOR(COALESCE(NEW.value, 0) * COALESCE(v_config.reais_por_ponto, 1) * v_mult);

  IF v_pts_ganhos <= 0 THEN RETURN NEW; END IF;

  -- Upsert da carteira
  INSERT INTO public.cliente_pontos (cliente_id, pontos_total, ultima_compra, nivel_atual)
  VALUES (NEW.customer_id, v_pts_ganhos, now(), 'Bronze')
  ON CONFLICT (cliente_id) DO UPDATE SET
    pontos_total = public.cliente_pontos.pontos_total + v_pts_ganhos,
    ultima_compra = now(),
    updated_at = now()
  RETURNING pontos_total INTO v_total_atual;

  -- Calcula nível
  IF v_total_atual >= 1500 THEN v_nivel := 'Ouro';
  ELSIF v_total_atual >= 500 THEN v_nivel := 'Prata';
  ELSE v_nivel := 'Bronze';
  END IF;
  UPDATE public.cliente_pontos SET nivel_atual = v_nivel WHERE cliente_id = NEW.customer_id;

  -- Registra no histórico
  INSERT INTO public.pontos_historico (cliente_id, venda_id, tipo, pontos, descricao, expira_em)
  VALUES (
    NEW.customer_id, NEW.id, 'ganho',
    v_pts_ganhos,
    'Pontos ganhos na compra — R$ ' || ROUND(COALESCE(NEW.value, 0), 2)::text,
    now() + (COALESCE(v_config.validade_dias, 180) || ' days')::interval
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recria o trigger
DROP TRIGGER IF EXISTS trg_process_loyalty_on_sale ON public.sales_entries;
CREATE TRIGGER trg_process_loyalty_on_sale
  AFTER INSERT OR UPDATE OF status ON public.sales_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.process_loyalty_on_sale();

-- 7. View de estatísticas
CREATE OR REPLACE VIEW public.fidelidade_stats AS
SELECT
  COUNT(DISTINCT cp.cliente_id) AS total_clientes,
  COUNT(DISTINCT CASE WHEN cp.nivel_atual = 'Bronze' THEN cp.cliente_id END) AS clientes_bronze,
  COUNT(DISTINCT CASE WHEN cp.nivel_atual = 'Prata'  THEN cp.cliente_id END) AS clientes_prata,
  COUNT(DISTINCT CASE WHEN cp.nivel_atual = 'Ouro'   THEN cp.cliente_id END) AS clientes_ouro,
  COALESCE(SUM(cp.pontos_total), 0) AS total_pontos_ativos,
  COALESCE(SUM(CASE WHEN ph.tipo = 'resgate' THEN ph.pontos ELSE 0 END), 0) AS total_pontos_resgatados
FROM public.cliente_pontos cp
LEFT JOIN public.pontos_historico ph ON ph.cliente_id = cp.cliente_id;
