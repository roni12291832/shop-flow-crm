import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FileText } from "lucide-react";

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX", credito: "Crédito", debito: "Débito",
  dinheiro: "Dinheiro", boleto: "Boleto", crediario: "Crediário",
};

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  confirmado: { label: "Confirmado", color: "bg-accent/20 text-accent" },
  pendente: { label: "Pendente", color: "bg-warning/20 text-warning" },
  cancelado: { label: "Cancelado", color: "bg-destructive/20 text-destructive" },
};

export function SellerHistory() {
  const {  user } = useAuth();
  const [sales, setSales] = useState<any[]>([]);
  const [clients, setClients] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | "today" | "week">("all");

  useEffect(() => {
    if (!tenantId || !user) return;
    const fetch = async () => {
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());

      let query = supabase.from("sales_entries")
        .select("*")
        
        .eq("user_id", user.id)
        .order("sold_at", { ascending: false })
        .limit(50);

      if (filter === "today") {
        query = query.gte("sold_at", now.toISOString().split("T")[0]);
      } else if (filter === "week") {
        query = query.gte("sold_at", startOfWeek.toISOString());
      }

      const { data } = await query;
      setSales(data || []);

      const ids = [...new Set((data || []).map((s: any) => s.customer_id).filter(Boolean))];
      if (ids.length) {
        const { data: cls } = await supabase.from("clients").select("id, name").in("id", ids);
        const map: Record<string, string> = {};
        (cls || []).forEach((c: any) => { map[c.id] = c.name; });
        setClients(map);
      }
    };
    fetch();
  }, [tenantId, user, filter]);

  const totalConfirmed = sales.filter(s => s.status === "confirmado").reduce((sum, s) => sum + Number(s.value), 0);

  const filters: { key: typeof filter; label: string }[] = [
    { key: "today", label: "Hoje" },
    { key: "week", label: "Semana" },
    { key: "all", label: "Tudo" },
  ];

  return (
    <div className="px-5 pt-8 pb-4 space-y-5 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-foreground">Histórico de Vendas</h1>

      {/* Filters */}
      <div className="flex gap-2">
        {filters.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all border ${
              filter === f.key ? "bg-primary/20 text-primary border-primary/40" : "bg-card text-muted-foreground border-border"
            }`}>{f.label}</button>
        ))}
      </div>

      {/* Summary */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Total Confirmado</p>
          <p className="text-lg font-bold text-foreground">R$ {totalConfirmed.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </div>
        <p className="text-sm text-muted-foreground">{sales.length} vendas</p>
      </div>

      {/* Sales list */}
      {sales.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileText className="h-10 w-10 mb-2 opacity-40" />
          <p className="text-sm">Nenhuma venda encontrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sales.map((s, i) => {
            const st = STATUS_STYLES[s.status] || STATUS_STYLES.confirmado;
            return (
              <div key={i} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {clients[s.customer_id] || "Cliente"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {PAYMENT_LABELS[s.payment_method] || s.payment_method} · {new Date(s.sold_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <p className="text-sm font-bold text-foreground">R$ {Number(s.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
