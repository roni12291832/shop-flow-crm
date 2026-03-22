-- ============================================
-- FASE 6.5: Lead Scoring Inteligente
-- ============================================

-- Adiciona campos de scoring na tabela clients
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS temperature TEXT DEFAULT 'frio';

-- Função para calcular a temperatura com base no score
CREATE OR REPLACE FUNCTION public.calculate_lead_temperature()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.score < 30 THEN
    NEW.temperature := 'frio';
  ELSIF NEW.score < 70 THEN
    NEW.temperature := 'morno';
  ELSE
    NEW.temperature := 'quente';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger que roda ANTES de salvar o cliente para sempre manter a temperatura de acordo com o score
DROP TRIGGER IF EXISTS trg_calc_temperature ON public.clients;
CREATE TRIGGER trg_calc_temperature
  BEFORE INSERT OR UPDATE OF score
  ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_lead_temperature();


-- =======================================================
-- REGRAS DE PONTUAÇÃO AUTOMÁTICA
-- =======================================================

-- 1. Ganha pontos ao enviar mensagem (+5 por mensagem recebida do cliente)
CREATE OR REPLACE FUNCTION public.score_on_message()
RETURNS TRIGGER AS $$
DECLARE
  client_id_found uuid;
BEGIN
  IF NEW.sender_type = 'cliente' THEN
    -- Descobrir quem é o cliente dessa conversa
    SELECT client_id INTO client_id_found
    FROM public.conversations
    WHERE id = NEW.conversation_id;

    IF client_id_found IS NOT NULL THEN
      UPDATE public.clients
      SET score = score + 5
      WHERE id = client_id_found;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_score_on_message ON public.messages;
CREATE TRIGGER trg_score_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.score_on_message();


-- 2. Ganha pontos ao evoluir no Pipeline
CREATE OR REPLACE FUNCTION public.score_on_pipeline_change()
RETURNS TRIGGER AS $$
DECLARE
  points INTEGER := 0;
BEGIN
  -- Se o stage mudou
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.stage IS DISTINCT FROM NEW.stage) THEN
    CASE NEW.stage
      WHEN 'contato_iniciado' THEN points := 10;
      WHEN 'cliente_interessado' THEN points := 20;
      WHEN 'negociacao' THEN points := 50;
      WHEN 'proposta_enviada' THEN points := 70;
      WHEN 'venda_fechada' THEN points := 100;
      ELSE points := 0;
    END CASE;

    IF points > 0 THEN
      UPDATE public.clients
      SET score = GREATEST(score, points) -- Não acumula infinito se ele ficar indo e voltando, apenas atinge o teto da etapa
      WHERE id = NEW.client_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_score_on_pipeline ON public.opportunities;
CREATE TRIGGER trg_score_on_pipeline
  AFTER INSERT OR UPDATE OF stage
  ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.score_on_pipeline_change();


-- 3. Ganha pontos ao comprar direto (Sales Entries)
CREATE OR REPLACE FUNCTION public.score_on_purchase()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'confirmado' AND NEW.customer_id IS NOT NULL THEN
    UPDATE public.clients
    SET score = GREATEST(score, 100)
    WHERE id = NEW.customer_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_score_on_purchase ON public.sales_entries;
CREATE TRIGGER trg_score_on_purchase
  AFTER INSERT OR UPDATE OF status
  ON public.sales_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.score_on_purchase();
