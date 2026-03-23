-- ============================================
-- FASE 1: Controle de Estoque (Single-Tenant)
-- ============================================

-- Enum para tipo de movimentação
DO $$ BEGIN
    CREATE TYPE public.inventory_movement_type AS ENUM ('entrada', 'saida', 'ajuste');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Tabela de Produtos
CREATE TABLE IF NOT EXISTS public.products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  sku text,
  description text,
  category text,
  cost_price numeric DEFAULT 0,
  sell_price numeric DEFAULT 0,
  current_stock integer DEFAULT 0,
  min_stock integer DEFAULT 5,
  unit text DEFAULT 'un',
  image_url text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de Movimentações de Estoque
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type public.inventory_movement_type NOT NULL,
  quantity integer NOT NULL,
  unit_cost numeric DEFAULT 0,
  reference_type text, -- 'venda', 'compra', 'ajuste_manual'
  reference_id uuid,
  notes text,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON public.inventory_movements(product_id);

-- RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Products RLS policies (Universal Single-Tenant)
DROP POLICY IF EXISTS "Universal access for authenticated users" ON public.products;
CREATE POLICY "Universal access for authenticated users"
  ON public.products FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Inventory Movements RLS policies (Universal Single-Tenant)
DROP POLICY IF EXISTS "Universal access for authenticated users" ON public.inventory_movements;
CREATE POLICY "Universal access for authenticated users"
  ON public.inventory_movements FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Trigger to update current_stock on movements
CREATE OR REPLACE FUNCTION public.update_product_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'entrada' THEN
    UPDATE public.products SET current_stock = current_stock + NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
  ELSIF NEW.type = 'saida' THEN
    UPDATE public.products SET current_stock = current_stock - NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
  ELSIF NEW.type = 'ajuste' THEN
    -- For adjustments, quantity is the final absolute stock value
    UPDATE public.products SET current_stock = NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_stock ON public.inventory_movements;
CREATE TRIGGER trg_update_stock
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_product_stock();
