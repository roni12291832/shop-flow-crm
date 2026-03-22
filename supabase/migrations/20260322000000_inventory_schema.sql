-- ============================================
-- FASE 1: Controle de Estoque
-- ============================================

-- Enum para tipo de movimentação
CREATE TYPE public.inventory_movement_type AS ENUM ('entrada', 'saida', 'ajuste');

-- Tabela de Produtos
CREATE TABLE public.products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
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
CREATE TABLE public.inventory_movements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
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
CREATE INDEX idx_products_tenant ON public.products(tenant_id);
CREATE INDEX idx_products_sku ON public.products(tenant_id, sku);
CREATE INDEX idx_products_category ON public.products(tenant_id, category);
CREATE INDEX idx_inventory_movements_product ON public.inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_tenant ON public.inventory_movements(tenant_id);

-- RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Products RLS policies
CREATE POLICY "Users can view products of their tenant"
  ON public.products FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Admin/Gerente can insert products"
  ON public.products FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Admin/Gerente can update products"
  ON public.products FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Admin can delete products"
  ON public.products FOR DELETE
  USING (tenant_id = public.get_user_tenant_id());

-- Inventory Movements RLS policies
CREATE POLICY "Users can view movements of their tenant"
  ON public.inventory_movements FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can insert movements of their tenant"
  ON public.inventory_movements FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

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

CREATE TRIGGER trg_update_stock
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_product_stock();
