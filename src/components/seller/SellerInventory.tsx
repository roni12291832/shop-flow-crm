import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  sell_price: number;
  current_stock: number;
  min_stock: number;
  unit: string;
  active: boolean;
}

export function SellerInventory() {
    const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
        const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, category, sell_price, current_stock, min_stock, unit, active")
        
        .eq("active", true)
        .order("name");
      setProducts((data as Product[]) || []);
      setLoading(false);
    };
    fetch();
  }, [tenantId]);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-5 pt-8 pb-4 space-y-5 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
        <Package className="h-5 w-5 text-primary" /> Estoque
      </h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} produtos ativos</p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum produto encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => {
            const isLow = p.current_stock <= p.min_stock;
            const isOut = p.current_stock === 0;
            return (
              <div key={p.id} className="bg-card border border-border rounded-xl px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground text-sm truncate">{p.name}</span>
                      {p.category && <Badge variant="outline" className="text-[10px] shrink-0">{p.category}</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {p.sku && <span className="text-[10px] text-muted-foreground font-mono">{p.sku}</span>}
                      <span className="text-xs font-semibold text-primary">
                        R$ {p.sell_price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  <div className="text-right ml-3">
                    <div className={cn("text-lg font-bold", isOut ? "text-destructive" : isLow ? "text-yellow-500" : "text-foreground")}>
                      {p.current_stock}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{p.unit}</span>
                  </div>
                </div>
                {isLow && !isOut && (
                  <div className="flex items-center gap-1 mt-1.5 text-yellow-600 text-[11px]">
                    <AlertTriangle className="h-3 w-3" /> Estoque baixo (mín: {p.min_stock})
                  </div>
                )}
                {isOut && (
                  <div className="flex items-center gap-1 mt-1.5 text-destructive text-[11px]">
                    <AlertTriangle className="h-3 w-3" /> Produto esgotado
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
