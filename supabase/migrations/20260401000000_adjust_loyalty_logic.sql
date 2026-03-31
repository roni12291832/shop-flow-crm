-- ===========================================================
-- Ajuste da Lógica de Fidelidade: R$ 1 = 0.10 PONTOS (1 pt = R$ 1)
-- Mensagem de validade de 30 dias
-- ===========================================================

-- 1. Alterar colunas para numeric para suportar decimais
ALTER TABLE public.cliente_pontos ALTER COLUMN pontos_total TYPE numeric;
ALTER TABLE public.pontos_historico ALTER COLUMN pontos TYPE numeric;
ALTER TABLE public.loyalty_transactions ALTER COLUMN pontos TYPE numeric;

-- 2. Atualizar Configuração Default
UPDATE public.fidelidade_config 
SET 
  reais_por_ponto = 0.1,
  pontos_por_desconto = 10,
  validade_dias = 30,
  niveis = '[
    {"nome": "Bronze", "min": 0,   "max": 49,   "cor": "#cd7f32"},
    {"nome": "Prata",  "min": 50,  "max": 149,  "cor": "#c0c0c0"},
    {"nome": "Ouro",   "min": 150, "max": 9999, "cor": "#ffd700"}
  ]'::jsonb
WHERE id = (SELECT id FROM public.fidelidade_config LIMIT 1);

-- 3. Tabela de rastreamento de notificações enviadas
CREATE TABLE IF NOT EXISTS public.loyalty_notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  reference_id uuid, -- venda_id ou similar
  notification_type text NOT NULL, -- 'notice_2d', 'warning_15d'
  sent_at timestamptz DEFAULT now()
);

-- 4. Função do trigger atualizada com nova proporção e níveis
CREATE OR REPLACE FUNCTION public.process_loyalty_on_sale()
RETURNS TRIGGER AS $$
DECLARE
  v_pts_ganhos numeric;
  v_total_atual numeric;
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

  -- Calcula pontos: R$ 1 = 0.1 pontos (arredondado para 2 casas)
  v_pts_ganhos := ROUND(COALESCE(NEW.value, 0) * COALESCE(v_config.reais_por_ponto, 0.1) * v_mult, 2);

  IF v_pts_ganhos <= 0 THEN RETURN NEW; END IF;

  -- Upsert da carteira
  INSERT INTO public.cliente_pontos (cliente_id, pontos_total, ultima_compra, nivel_atual)
  VALUES (NEW.customer_id, v_pts_ganhos, now(), 'Bronze')
  ON CONFLICT (cliente_id) DO UPDATE SET
    pontos_total = public.cliente_pontos.pontos_total + v_pts_ganhos,
    ultima_compra = now(),
    updated_at = now()
  RETURNING pontos_total INTO v_total_atual;

  -- Calcula nível com novos thresholds (10x menores)
  IF v_total_atual >= 150 THEN v_nivel := 'Ouro';
  ELSIF v_total_atual >= 50 THEN v_nivel := 'Prata';
  ELSE v_nivel := 'Bronze';
  END IF;
  UPDATE public.cliente_pontos SET nivel_atual = v_nivel WHERE cliente_id = NEW.customer_id;

  -- Registra no histórico
  INSERT INTO public.pontos_historico (cliente_id, venda_id, tipo, pontos, descricao, expira_em)
  VALUES (
    NEW.customer_id, NEW.id, 'ganho',
    v_pts_ganhos,
    'Pontos ganhos na compra — R$ ' || ROUND(COALESCE(NEW.value, 0), 2)::text,
    now() + (COALESCE(v_config.validade_dias, 30) || ' days')::interval
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
