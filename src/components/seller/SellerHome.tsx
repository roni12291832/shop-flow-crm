import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GoalGauge } from "@/components/metas/GoalGauge";
import { TrendingUp, DollarSign, ShoppingBag, Target } from "lucide-react";

export function SellerHome() {
  const { tenantId, user, profile } = useAuth();
  const [todaySales, setTodaySales] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [monthSales, setMonthSales] = useState(0);
  const [todayGoal, setTodayGoal] = useState(0);
  const [monthGoal, setMonthGoal] = useState(0);
  const [recentSales, setRecentSales] = useState<any[]>([]);

  useEffect(() => {
    if (!tenantId || !user) return;
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const fetch = async () => {
      const { data: sales } = await supabase.from("sales_entries")
        .select("value, sold_at, status, payment_method, created_at")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id)
        .eq("status", "confirmado")
        .gte("sold_at", startOfMonth)
        .order("sold_at", { ascending: false });

      const s = sales || [];
      const todayS = s.filter(x => x.sold_at?.startsWith(todayStr));
      setTodaySales(todayS.reduce((sum, x) => sum + Number(x.value), 0));
      setTodayCount(todayS.length);
      setMonthSales(s.reduce((sum, x) => sum + Number(x.value), 0));
      setRecentSales(s.slice(0, 5));

      const { data: goals } = await supabase.from("goals")
        .select("*").eq("tenant_id", tenantId)
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .gte("end_date", todayStr)
        .lte("start_date", todayStr);

      const g = goals || [];
      const daily = g.find((x: any) => x.period_type === "daily");
      const monthly = g.find((x: any) => x.period_type === "monthly");
      setTodayGoal(daily ? Number(daily.target_value) : 0);
      setMonthGoal(monthly ? Number(monthly.target_value) : 0);
    };
    fetch();

    const channel = supabase.channel("seller-home")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_entries" }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, user]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  };

  const PAYMENT_LABELS: Record<string, string> = {
    pix: "PIX", credito: "Crédito", debito: "Débito",
    dinheiro: "Dinheiro", boleto: "Boleto", crediario: "Crediário",
  };

  return (
    <div className="px-5 pt-8 pb-4 space-y-6 max-w-lg mx-auto">
      {/* Greeting */}
      <div>
        <p className="text-muted-foreground text-sm">{greeting()},</p>
        <h1 className="text-2xl font-bold text-foreground">{profile?.name?.split(" ")[0] || "Vendedor"} 👋</h1>
      </div>

      {/* Goal gauge */}
      <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center">
        <p className="text-xs text-muted-foreground font-semibold mb-2 uppercase tracking-wide">Meta de Hoje</p>
        <GoalGauge current={todaySales} target={todayGoal} size={180} />
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Vendas Hoje", value: todayCount, icon: ShoppingBag, color: "hsl(var(--chart-1))" },
          { label: "Receita Hoje", value: `R$ ${todaySales.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`, icon: DollarSign, color: "hsl(var(--chart-2))" },
          { label: "Meta Mensal", value: monthGoal > 0 ? `${Math.round((monthSales / monthGoal) * 100)}%` : "—", icon: Target, color: "hsl(var(--chart-3))" },
          { label: "Receita Mês", value: `R$ ${monthSales.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`, icon: TrendingUp, color: "hsl(var(--chart-4))" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className="h-4 w-4 opacity-60" style={{ color: s.color }} />
              <span className="text-[11px] text-muted-foreground font-medium">{s.label}</span>
            </div>
            <p className="text-lg font-bold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Recent sales */}
      {recentSales.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-foreground mb-3">Vendas Recentes</h3>
          <div className="space-y-2">
            {recentSales.map((s, i) => (
              <div key={i} className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    R$ {Number(s.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {PAYMENT_LABELS[s.payment_method] || s.payment_method} · {new Date(s.sold_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="w-2 h-2 rounded-full bg-accent" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
