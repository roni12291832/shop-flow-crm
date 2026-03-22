-- ============================================
-- FASE 6.3: Automação Nativa de Pipeline e Cliente
-- ============================================

-- Função que executa a automação pós-venda
CREATE OR REPLACE FUNCTION public.handle_post_purchase_automation()
RETURNS TRIGGER AS $$
BEGIN
  -- Se a venda foi confirmada (agora ou já estava e sofreu update)
  IF NEW.status = 'confirmado' THEN
    
    IF NEW.customer_id IS NOT NULL THEN
      -- 1. Atualizar a data da última compra do cliente
      UPDATE public.clients
      SET last_purchase = NEW.sold_at,
          updated_at = now()
      WHERE id = NEW.customer_id;

      -- 2. Mover oportunidades em aberto do cliente para "venda_fechada"
      UPDATE public.opportunities
      SET stage = 'venda_fechada',
          updated_at = now()
      WHERE client_id = NEW.customer_id
        AND stage NOT IN ('venda_fechada', 'perdido');
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para executar a automação
DROP TRIGGER IF EXISTS trg_post_purchase_automation ON public.sales_entries;
CREATE TRIGGER trg_post_purchase_automation
  AFTER INSERT OR UPDATE OF status, customer_id
  ON public.sales_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_post_purchase_automation();
