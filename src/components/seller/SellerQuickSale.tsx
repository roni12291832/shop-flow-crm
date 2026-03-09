import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function SellerQuickSale({ onSaleCreated }: Props) {
  const { tenantId, user } = useAuth();
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [value, setValue] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from("clients").select("id, name").eq("tenant_id", tenantId).order("name")
      .then(({ data }) => setClients(data || []));
  }, [tenantId]);

  const filtered = clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 6);

  const handleSubmit = async () => {
    if (!selectedClient || !value || !tenantId || !user) return;
    setSaving(true);
    const { error } = await supabase.from("sales_entries").insert({
      tenant_id: tenantId,
      user_id: user.id,
      customer_id: selectedClient.id,
      value: parseFloat(value.replace(/[^\d.,]/g, "").replace(",", ".")) || 0,
      payment_method: paymentMethod as any,
      status: "confirmado" as any,
      notes: notes || null,
    });
    setSaving(false);
    if (error) { toast.error("Erro ao registrar"); return; }
    setSuccess(true);
    toast.success("Venda registrada!");
    setTimeout(() => onSaleCreated(), 1500);
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

      {/* Value - prominent */}
      <div className="bg-card border border-border rounded-2xl p-6 text-center">
        <p className="text-xs text-muted-foreground font-semibold mb-2 uppercase tracking-wide">Valor da Venda</p>
        <div className="flex items-center justify-center gap-1">
          <span className="text-2xl text-muted-foreground font-bold">R$</span>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={value}
            onChange={e => setValue(e.target.value)}
            className="text-4xl font-bold h-16 text-center border-none bg-transparent shadow-none focus-visible:ring-0 max-w-[200px]"
          />
        </div>
      </div>

      {/* Client */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">Cliente</label>
        {selectedClient ? (
          <div className="flex items-center justify-between bg-secondary rounded-xl px-4 py-3">
            <span className="text-foreground font-medium text-sm">{selectedClient.name}</span>
            <button className="text-muted-foreground text-xs hover:text-destructive" onClick={() => setSelectedClient(null)}>✕</button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            {search && filtered.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl overflow-hidden z-10 shadow-lg">
                {filtered.map(c => (
                  <button key={c.id} onClick={() => { setSelectedClient(c); setSearch(""); }}
                    className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-secondary transition-colors border-b border-border/50 last:border-0">
                    {c.name}
                  </button>
                ))}
              </div>
            )}
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

      <Button onClick={handleSubmit} disabled={saving || !selectedClient || !value}
        className="w-full h-14 text-base font-bold gap-2 rounded-xl">
        ✓ Confirmar Venda
      </Button>
    </div>
  );
}
