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
import { ClientDetailDrawer } from "@/components/crm/ClientDetailDrawer";

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
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [manualValue, setManualValue] = useState("");
  const [useProducts, setUseProducts] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [missingInfoOpen, setMissingInfoOpen] = useState(false);
  const [ncForm, setNcForm] = useState({ name: "", phone: "", email: "", city: "", origin: "loja_fisica", birth_date: "" });

  useEffect(() => {
    supabase.from("clients").select("id, name, phone, email, city, birth_date").order("name")
      .then(({ data }) => setClients(data || []));
    supabase.from("products").select("id, name, sell_price, current_stock, unit")
      .eq("active", true).order("name")
      .then(({ data }) => setProducts((data as any[]) || []));
  }, []);

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
    if (!selectedClient || totalValue <= 0 || !user) return;
    
    // Check missing info needed for loyalty and registration
    if (!selectedClient.phone || !selectedClient.email || !selectedClient.city || !selectedClient.birth_date) {
      toast.warning("Complete o cadastro do cliente antes de finalizar a venda.");
      setMissingInfoOpen(true);
      return;
    }

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

    if (error) { 
      toast.error(`Erro ao registrar: ${error.message}`); 
      console.error("Sale insert error:", error);
      setSaving(false); 
      return; 
    }

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
        toast.warning("Venda registrada mas houve erro ao baixar estoque");
      }
    }

    // ─── Crédito de Pontos de Fidelidade ─────────────────────────────
    try {
      // O trigger SQL já cuida de creditar os pontos automaticamente via:
      //   trg_process_loyalty_on_sale → process_loyalty_on_sale()
      // O código abaixo é um fallback extra para exibir feedback ao vendedor.
      const { data: walletAfter } = await (supabase as any)
        .from("cliente_pontos")
        .select("pontos_total, nivel_atual")
        .eq("cliente_id", selectedClient.id)
        .maybeSingle();

      if (walletAfter?.pontos_total > 0) {
        const bonus = Math.floor(totalValue); // ~1 pt por R$1
        toast.info(`+${bonus} ponto(s) de fidelidade para ${selectedClient.name}! Total: ${walletAfter.pontos_total} pts (${walletAfter.nivel_atual})`, { duration: 4000 });
      }
    } catch {
      // silencioso — o trigger SQL é a fonte da verdade
    }
    // ─────────────────────────────────────────────────────────────────

    setSaving(false);
    setSuccess(true);
    toast.success("Venda registrada!");
    setTimeout(() => onSaleCreated(), 1500);
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ncForm.name) return;
    const { data, error } = await supabase.from("clients").insert({
      name: ncForm.name,
      phone: ncForm.phone || null,
      email: ncForm.email || null,
      city: ncForm.city || null,
      birth_date: ncForm.birth_date || null,
      origin: ncForm.origin as any
    }).select("id, name, phone, email, city, birth_date").single();

    if (error) { toast.error("Erro ao criar cliente"); return; }
    toast.success("Cliente salvo!");
    setClients(prev => [...prev, data]);
    setSelectedClient(data);
    setNewClientOpen(false);
    setNcForm({ name: "", phone: "", email: "", city: "", origin: "loja_fisica", birth_date: "" });
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
    <div className="px-4 pt-6 pb-24 space-y-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent tracking-tight">Nova Venda</h1>
      </div>

      {/* Mode toggle */}
      <div className="flex p-1.5 bg-secondary/40 rounded-2xl border border-white/5 backdrop-blur-md">
        <button onClick={() => setUseProducts(false)}
          className={cn("flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-300",
            !useProducts ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-[1.02]" : "text-muted-foreground hover:text-foreground"
          )}>💰 Valor Manual</button>
        <button onClick={() => setUseProducts(true)}
          className={cn("flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-300 flex items-center justify-center gap-2",
            useProducts ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-[1.02]" : "text-muted-foreground hover:text-foreground"
          )}><Package className="h-4 w-4" /> Produtos</button>
      </div>

      {/* Value - manual mode */}
      {!useProducts && (
        <div className="relative group overflow-hidden bg-card/40 backdrop-blur-xl border border-white/10 rounded-[28px] p-8 text-center transition-all hover:border-primary/30">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <p className="text-xs text-muted-foreground font-semibold mb-3 uppercase tracking-widest">Valor da Venda</p>
          <div className="flex items-center justify-center gap-2 relative z-10">
            <span className="text-3xl text-primary/70 font-bold">R$</span>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={manualValue}
              onChange={e => setManualValue(e.target.value)}
              className="text-6xl font-black h-20 text-center border-none bg-transparent shadow-none focus-visible:ring-0 max-w-[240px] tracking-tight p-0 text-foreground"
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
      <div className="space-y-3">
        <label className="text-sm font-bold text-foreground/80 uppercase tracking-wide ml-1">Cliente</label>
        {selectedClient ? (
          <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-2xl px-5 py-4">
            <span className="text-primary font-bold text-base">{selectedClient.name}</span>
            <button className="text-primary/60 hover:text-destructive transition-colors p-2 bg-background/50 rounded-full" onClick={() => setSelectedClient(null)}>
              <X className="h-4 w-4" />
            </button>
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
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Telefone</Label>
                      <Input value={ncForm.phone} onChange={e => setNcForm({...ncForm, phone: e.target.value})} placeholder="DD NÚMERO" />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" value={ncForm.email} onChange={e => setNcForm({...ncForm, email: e.target.value})} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Cidade</Label>
                      <Input value={ncForm.city} onChange={e => setNcForm({...ncForm, city: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Nascimento</Label>
                      <Input type="date" value={ncForm.birth_date} onChange={e => setNcForm({...ncForm, birth_date: e.target.value})} />
                    </div>
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
      <div className="space-y-3">
        <label className="text-sm font-bold text-foreground/80 uppercase tracking-wide ml-1">Pagamento</label>
        <div className="grid grid-cols-3 gap-3">
          {PAYMENT_METHODS.map(pm => (
            <button key={pm.value} onClick={() => setPaymentMethod(pm.value)}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-2xl py-4 text-xs font-bold transition-all duration-200",
                paymentMethod === pm.value
                  ? "bg-primary border-2 border-primary shadow-lg shadow-primary/25 text-primary-foreground scale-[1.02]"
                  : "bg-card/50 border-2 border-white/5 text-muted-foreground hover:bg-secondary hover:border-white/10"
              )}>
              <span className="text-2xl mb-0.5">{pm.icon}</span>
              {pm.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-3">
        <label className="text-sm font-bold text-foreground/80 uppercase tracking-wide ml-1">Observação</label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} 
          className="bg-card/50 border-white/10 rounded-2xl resize-none focus-visible:ring-primary/50" 
          placeholder="Detalhes opcionais sobre a venda..." />
      </div>

      <div className="pt-4">
        <Button onClick={handleSubmit} disabled={saving || !selectedClient || totalValue <= 0}
          className="w-full h-16 text-lg font-black tracking-wide gap-3 rounded-2xl bg-gradient-to-r from-primary to-accent hover:opacity-90 shadow-[0_8px_30px_rgba(var(--primary-rgb),0.3)] transition-all active:scale-[0.98] border-0">
          <Check className="h-6 w-6" /> Confirmar {totalValue > 0 && `— R$ ${totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
        </Button>
      </div>

      <ClientDetailDrawer 
        clientId={selectedClient?.id || null} 
        open={missingInfoOpen} 
        onOpenChange={setMissingInfoOpen}
        onUpdate={() => {
          supabase.from("clients").select("id, name, phone, email, city, birth_date").eq("id", selectedClient?.id).single()
            .then(({ data }) => {
              if (data) {
                setSelectedClient(data);
                const updatedClients = clients.map(c => c.id === data.id ? data : c);
                setClients(updatedClients);
              }
              setMissingInfoOpen(false);
            });
        }} 
      />
    </div>
  );
}
