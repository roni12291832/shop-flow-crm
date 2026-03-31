-- Migration: Fix post-purchase stage name
-- Updates the trigger function to move leads to 'comprador' instead of 'venda_fechada'

CREATE OR REPLACE FUNCTION public.handle_post_purchase_automation()
RETURNS TRIGGER AS $$
BEGIN
  -- Se a venda foi confirmada
  IF NEW.status = 'confirmado' THEN
    
    IF NEW.customer_id IS NOT NULL THEN
      -- 1. Atualizar a data da última compra do cliente
      UPDATE public.clients
      SET last_purchase = NEW.sold_at,
          updated_at = now()
      WHERE id = NEW.customer_id;

      -- 2. Mover oportunidades em aberto do cliente para "comprador"
      UPDATE public.opportunities
      SET stage = 'comprador',
          updated_at = now()
      WHERE client_id = NEW.customer_id
        AND stage NOT IN ('comprador', 'perdido', 'desqualificado');
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
