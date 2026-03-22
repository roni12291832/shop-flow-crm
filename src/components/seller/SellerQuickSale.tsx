import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, Search, Plus, Package, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const ORIGINS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "loja_fisica", label: "Loja Física" },
  { value: "instagram", label: "Instagram" },
  { value: "outro", label: "Outro" }
];

const PAYMENT_METHODS = [
  { value: "pix", label: "PIX", icon: "💚" },
  { value: "credito", label: "Crédito", icon: "💳" },
  { value: "debito", label: "Débito", icon: "💳" },
  { value: "dinheiro", label: "Dinheiro", icon: "💵" },
  { value: "boleto", label: "Boleto", icon: "🏦" },
  { value: "crediario", label: "Crediário", icon: "📝" },
];

interface Props {
  onSaleCreated: () => void;
}

interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  stock: number;
}

export function SellerQuickSale({ onSaleCreated }: Props) {
  const {  user } = useAuth();
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; sell_price: number; current_stock: number; unit: string }[]>([]);
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [manualValue, setManualValue] = useState("");
  const [useProducts, setUseProducts] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [ncForm, setNcForm] = useState({ name: "", phone: "", origin: "loja_fisica" });

  useEffect(() => {
        supabase.from("clients").select("id, name").order("name")
      .then(({ data }) => setClients(data || []));
    supabase.from("products").select("id, name, sell_price, current_stock, unit")
      .eq("active", true).order("name")
      .then(({ data }) => setProducts((data as any[]) || []));
  }, [tenantId]);

  const filtered = clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 6);
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) && p.current_stock > 0
  ).slice(0, 8);

  const totalValue = useProducts
    ? cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    : parseFloat(manualValue.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;

  const addToCart = (p: typeof products[0]) => {
    const existing = cart.find(c => c.productId === p.id);
    if (existing) {
      if (existing.quantity >= p.current_stock) {
        toast.error("Estoque insuficiente!");
        return;
      }
      setCart(cart.map(c => c.productId === p.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, {
        productId: p.id,
        productName: p.name,
        quantity: 1,
        unitPrice: p.sell_price,
        stock: p.current_stock,
      }]);
    }
    setProductSearch("");
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(c => c.productId !== productId));
  };

  const updateCartQty = (productId: string, qty: number) => {
    const item = cart.find(c => c.productId === productId);
    if (!item) return;
    if (qty > item.stock) { toast.error("Estoque insuficiente!"); return; }
    if (qty <= 0) { removeFromCart(productId); return; }
    setCart(cart.map(c => c.productId === productId ? { ...c, quantity: qty } : c));
  };

  const handleSubmit = async () => {
    if (!selectedClient || totalValue <= 0 || !tenantId || !user) return;
    setSaving(true);

    // Create sale entry
    const { data: sale, error } = await supabase.from("sales_entries").insert({
            user_id: user.id,
      customer_id: selectedClient.id,
      value: totalValue,
      payment_method: paymentMethod as any,
      status: "confirmado" as any,
      notes: notes || null,
    }).select("id").single();

    if (error) { toast.error("Erro ao registrar"); setSaving(false); return; }

    // Create inventory movements for cart items
    if (useProducts && cart.length > 0 && sale) {
      const movements = cart.map(item => ({
                product_id: item.productId,
        type: "saida" as const,
        quantity: item.quantity,
        unit_cost: item.unitPrice,
        reference_type: "venda",
        reference_id: sale.id,
        notes: `Venda para ${selectedClient.name}`,
        user_id: user.id,
      }));

      const { error: mvError } = await supabase.from("inventory_movements").insert(movements);
      if (mvError) {
        console.error("Erro ao baixar estoque:", mvError);
        // Don't fail the sale entirely, just warn
        toast.warning("Venda registrada mas houve erro ao baixar estoque");
      }
    }

    setSaving(false);
    setSuccess(true);
    toast.success("Venda registrada!");
    setTimeout(() => onSaleCreated(), 1500);
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ncForm.name || !tenantId) return;
    const { data, error } = await supabase.from("clients").insert({
            name: ncForm.name,
      phone: ncForm.phone || null,
      origin: ncForm.origin as any
    }).select("id, name").single();

    if (error) { toast.error("Erro ao criar cliente"); return; }
    toast.success("Cliente salvo!");
    setClients(prev => [...prev, data]);
    setSelectedClient(data);
    setNewClientOpen(false);
    setNcForm({ name: "", phone: "", origin: "loja_fisica" });
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 animate-fade-in">
        <div className="w-24 h-24 rounded-full bg-accent/20 flex items-center justify-center animate-scale-in">
          <Check className="h-12 w-12 text-accent" />
        </div>
        <p className="text-xl font-bold text-foreground">Venda registrada!</p>
      </div>
    );
  }

  return (
    <div className="px-5 pt-8 pb-4 space-y-5 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-foreground">Nova Venda</h1>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button onClick={() => setUseProducts(false)}
          className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all",
            !useProducts ? "bg-primary/20 text-primary border-primary/40" : "bg-card text-muted-foreground border-border"
          )}>💰 Valor Manual</button>
        <button onClick={() => setUseProducts(true)}
          className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-1.5",
            useProducts ? "bg-primary/20 text-primary border-primary/40" : "bg-card text-muted-foreground border-border"
          )}><Package className="h-4 w-4" /> Produtos</button>
      </div>

      {/* Value - manual mode */}
      {!useProducts && (
        <div className="bg-card border border-border rounded-2xl p-6 text-center">
          <p className="text-xs text-muted-foreground font-semibold mb-2 uppercase tracking-wide">Valor da Venda</p>
          <div className="flex items-center justify-center gap-1">
            <span className="text-2xl text-muted-foreground font-bold">R$</span>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={manualValue}
              onChange={e => setManualValue(e.target.value)}
              className="text-4xl font-bold h-16 text-center border-none bg-transparent shadow-none focus-visible:ring-0 max-w-[200px]"
            />
          </div>
        </div>
      )}

      {/* Products mode */}
      {useProducts && (
        <div className="space-y-3">
          {/* Product search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar produto..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="pl-9" />
            {productSearch && filteredProducts.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl overflow-hidden z-20 shadow-lg max-h-[200px] overflow-y-auto">
                {filteredProducts.map(p => (
                  <button key={p.id} onClick={() => addToCart(p)}
                    className="w-full text-left px-4 py-3 hover:bg-secondary transition-colors border-b border-border/50 last:border-0">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-sm font-medium text-foreground">{p.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">({p.current_stock} {p.unit})</span>
                      </div>
                      <span className="text-sm font-semibold text-primary">R$ {p.sell_price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cart */}
          {cart.length > 0 ? (
            <div className="space-y-2">
              {cart.map(item => (
                <div key={item.productId} className="flex items-center gap-2 bg-secondary/50 rounded-xl px-3 py-2 border border-border">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">R$ {item.unitPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} × {item.quantity}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="w-7 h-7 rounded-lg bg-card border border-border text-sm font-bold"
                      onClick={() => updateCartQty(item.productId, item.quantity - 1)}>−</button>
                    <span className="w-8 text-center text-sm font-bold text-foreground">{item.quantity}</span>
                    <button className="w-7 h-7 rounded-lg bg-card border border-border text-sm font-bold"
                      onClick={() => updateCartQty(item.productId, item.quantity + 1)}>+</button>
                  </div>
                  <span className="text-sm font-bold text-foreground w-20 text-right">
                    R$ {(item.quantity * item.unitPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                  <button onClick={() => removeFromCart(item.productId)} className="text-destructive hover:bg-destructive/10 rounded p-1">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex justify-between items-center px-3 py-2 bg-primary/5 rounded-xl border border-primary/20">
                <span className="text-sm font-semibold text-foreground">Total</span>
                <span className="text-lg font-bold text-primary">R$ {totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Busque e adicione produtos
            </div>
          )}
        </div>
      )}

      {/* Client */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">Cliente</label>
        {selectedClient ? (
          <div className="flex items-center justify-between bg-secondary rounded-xl px-4 py-3">
            <span className="text-foreground font-medium text-sm">{selectedClient.name}</span>
            <button className="text-muted-foreground text-xs hover:text-destructive" onClick={() => setSelectedClient(null)}>✕</button>
          </div>
        ) : (
          <div className="flex gap-2 relative">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              {search && filtered.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl overflow-hidden z-20 shadow-lg">
                  {filtered.map(c => (
                    <button key={c.id} onClick={() => { setSelectedClient(c); setSearch(""); }}
                      className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-secondary transition-colors border-b border-border/50 last:border-0 border-none outline-none">
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Dialog open={newClientOpen} onOpenChange={setNewClientOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon" className="shrink-0"><Plus className="h-4 w-4"/></Button>
              </DialogTrigger>
              <DialogContent className="max-w-[400px]">
                <DialogHeader><DialogTitle>Novo Cliente</DialogTitle></DialogHeader>
                <form onSubmit={handleCreateClient} className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>Nome *</Label>
                    <Input autoFocus value={ncForm.name} onChange={e => setNcForm({...ncForm, name: e.target.value})} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone (WhatsApp)</Label>
                    <Input value={ncForm.phone} onChange={e => setNcForm({...ncForm, phone: e.target.value})} placeholder="DD NÚMERO" />
                  </div>
                  <div className="space-y-2">
                    <Label>Origem</Label>
                    <Select value={ncForm.origin} onValueChange={v => setNcForm({...ncForm, origin: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ORIGINS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full mt-2">Salvar & Selecionar</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Payment method */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">Pagamento</label>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map(pm => (
            <button key={pm.value} onClick={() => setPaymentMethod(pm.value)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl py-3 text-xs font-semibold border transition-all",
                paymentMethod === pm.value
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "bg-card border-border text-muted-foreground hover:bg-secondary"
              )}>
              <span className="text-xl">{pm.icon}</span>
              {pm.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">Observação</label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Opcional..." />
      </div>

      <Button onClick={handleSubmit} disabled={saving || !selectedClient || totalValue <= 0}
        className="w-full h-14 text-base font-bold gap-2 rounded-xl">
        ✓ Confirmar Venda {totalValue > 0 && `— R$ ${totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
      </Button>
    </div>
  );
}
