import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Check } from "lucide-react";

const PAYMENT_METHODS = [
  { value: "pix", label: "PIX", icon: "💚" },
  { value: "credito", label: "Crédito", icon: "💳" },
  { value: "debito", label: "Débito", icon: "💳" },
  { value: "dinheiro", label: "Dinheiro", icon: "💵" },
  { value: "boleto", label: "Boleto", icon: "🏦" },
  { value: "crediario", label: "Crediário", icon: "📝" },
];

interface QuickSaleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaleCreated?: () => void;
}

interface Client {
  id: string;
  name: string;
}

export function QuickSaleModal({ open, onOpenChange, onSaleCreated }: QuickSaleModalProps) {
  const {  user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [value, setValue] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    const fetchClients = async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      setClients((data || []) as Client[]);
    };
    fetchClients();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSearch(""); setSelectedClient(null); setValue(""); setPaymentMethod("pix"); setNotes(""); setSuccess(false);
    }
  }, [open]);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "n") { e.preventDefault(); onOpenChange(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpenChange]);

  const filteredClients = clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 5);

  const handleSubmit = async () => {
    if (!selectedClient || !value || !user) return;
    setSaving(true);
    const { error } = await supabase.from("sales_entries").insert({
            user_id: user.id,
      customer_id: selectedClient.id,
      value: parseFloat(value.replace(/[^\d.,]/g, "").replace(",", ".")) || 0,
      payment_method: paymentMethod as any,
      status: "confirmado" as any,
      notes: notes || null,
    });
    setSaving(false);
    if (error) { toast.error("Erro ao registrar venda"); return; }
    setSuccess(true);
    onSaleCreated?.();
    setTimeout(() => onOpenChange(false), 1500);
  };

  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-20 h-20 rounded-full bg-chart-2/20 flex items-center justify-center animate-scale-in">
              <Check className="h-10 w-10 text-chart-2" />
            </div>
            <p className="text-xl font-bold text-foreground">Venda registrada!</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Registrar Venda</DialogTitle></DialogHeader>
        <div className="space-y-5">
          {/* Client search */}
          <div className="space-y-2">
            <Label>Cliente *</Label>
            {selectedClient ? (
              <div className="flex items-center justify-between bg-secondary rounded-lg px-3 py-2">
                <span className="text-foreground font-medium text-sm">{selectedClient.name}</span>
                <button className="text-muted-foreground text-xs hover:text-destructive" onClick={() => setSelectedClient(null)}>✕</button>
              </div>
            ) : (
              <>
                <Input placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
                {search && filteredClients.length > 0 && (
                  <div className="bg-card border border-border rounded-lg max-h-32 overflow-y-auto">
                    {filteredClients.map(c => (
                      <button key={c.id} onClick={() => { setSelectedClient(c); setSearch(""); }}
                        className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors">
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Value */}
          <div className="space-y-2">
            <Label>Valor (R$) *</Label>
            <Input type="text" inputMode="decimal" placeholder="0,00" value={value}
              onChange={e => setValue(e.target.value)} className="text-2xl font-bold h-14 text-center" />
          </div>

          {/* Payment method */}
          <div className="space-y-2">
            <Label>Forma de Pagamento</Label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map(pm => (
                <button key={pm.value} onClick={() => setPaymentMethod(pm.value)}
                  className={`flex flex-col items-center gap-1 rounded-xl py-3 text-xs font-semibold border transition-all ${
                    paymentMethod === pm.value
                      ? "bg-primary/20 border-primary/40 text-primary"
                      : "bg-card border-border text-muted-foreground hover:bg-secondary"
                  }`}>
                  <span className="text-xl">{pm.icon}</span>
                  {pm.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Observação</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Opcional..." />
          </div>

          <Button onClick={handleSubmit} disabled={saving || !selectedClient || !value}
            className="w-full h-12 text-base font-bold gap-2 bg-chart-2 hover:bg-chart-2/90 text-white">
            ✓ Confirmar Venda
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
