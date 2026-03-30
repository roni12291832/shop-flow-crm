import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GoalGauge } from "@/components/metas/GoalGauge";
import { TrendingUp, DollarSign, ShoppingBag, Target, Trophy, Star, ChevronRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface RankEntry { name: string; total: number; userId: string; }

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX", credito: "Crédito", debito: "Débito",
  dinheiro: "Dinheiro", boleto: "Boleto", crediario: "Crediário",
};

export function SellerHome() {
  const { user, profile } = useAuth();
  const [todaySales, setTodaySales] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [monthSales, setMonthSales] = useState(0);
  const [todayGoal, setTodayGoal] = useState(0);
  const [monthGoal, setMonthGoal] = useState(0);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [ranking, setRanking] = useState<RankEntry[]>([]);
  const [myPosition, setMyPosition] = useState(0);
  const [loyaltyWallet, setLoyaltyWallet] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const fetchData = async () => {
      // Own sales
      const { data: sales } = await supabase.from("sales_entries")
        .select("value, sold_at, status, payment_method, created_at, customer_id")
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

      // Goals
      const { data: goals } = await supabase.from("goals")
        .select("*")
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .gte("end_date", todayStr)
        .lte("start_date", todayStr);
      const g = goals || [];
      const dailyIndividual = g.find((x: any) => x.period_type === "daily" && x.user_id === user.id);
      const dailyStore = g.find((x: any) => x.period_type === "daily" && !x.user_id);
      const monthlyIndividual = g.find((x: any) => x.period_type === "monthly" && x.user_id === user.id);
      const monthlyStore = g.find((x: any) => x.period_type === "monthly" && !x.user_id);
      setTodayGoal(Number((dailyIndividual || dailyStore)?.target_value || 0));
      setMonthGoal(Number((monthlyIndividual || monthlyStore)?.target_value || 0));

      // Ranking
      const { data: allSales } = await supabase.from("sales_entries")
        .select("user_id, value")
        .eq("status", "confirmado")
        .gte("sold_at", startOfMonth);
      const { data: profiles } = await supabase.from("profiles").select("user_id, name");
      const profileMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p.name; });
      const totals: Record<string, number> = {};
      (allSales || []).forEach((s: any) => {
        totals[s.user_id] = (totals[s.user_id] || 0) + Number(s.value);
      });
      const rankList: RankEntry[] = Object.entries(totals)
        .map(([userId, total]) => ({ userId, total, name: profileMap[userId] || "—" }))
        .sort((a, b) => b.total - a.total);
      setRanking(rankList.slice(0, 5));
      const pos = rankList.findIndex(r => r.userId === user.id);
      setMyPosition(pos >= 0 ? pos + 1 : 0);

      // Loyalty wallet do vendedor
      const lastSale = s[0];
      if (lastSale?.customer_id) {
        const { data: wallet } = await (supabase as any)
          .from("cliente_pontos")
          .select("pontos_total, nivel_atual")
          .eq("cliente_id", lastSale.customer_id)
          .maybeSingle();
        if (wallet) setLoyaltyWallet(wallet);
      }
    };
    fetchData();

    const channel = supabase.channel("seller-home")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_entries" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "☀️ Bom dia";
    if (h < 18) return "⛅ Boa tarde";
    return "🌙 Boa noite";
  };

  const todayPct = todayGoal > 0 ? Math.min(100, (todaySales / todayGoal) * 100) : 0;
  const monthPct = monthGoal > 0 ? Math.min(100, (monthSales / monthGoal) * 100) : 0;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Hero Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#0c0c10] via-background to-background px-5 pt-12 pb-24 border-b border-white/5">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/20 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-accent/20 blur-[80px] rounded-full translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative z-10 flex justify-between items-start">
          <div>
            <p className="text-muted-foreground font-semibold uppercase tracking-widest text-[10px]">{greeting()}</p>
            <h1 className="text-4xl font-black text-foreground mt-1 tracking-tight">
              {profile?.name?.split(" ")[0] || "Vendedor"}
            </h1>
          </div>
          {myPosition > 0 && (
            <div className="inline-flex items-center gap-1.5 bg-card/60 backdrop-blur-md border border-white/10 rounded-2xl px-3 py-1.5 shadow-xl">
              <Trophy className="h-4 w-4 text-primary" />
              <span className="text-foreground text-xs font-bold">#{myPosition}º lugar</span>
            </div>
          )}
        </div>
      </div>

      {/* Main content — overlaps hero */}
      <div className="relative -mt-10 px-4 pb-20 space-y-5">
        {/* Goal card */}
        <div className="bg-card/40 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
          <div className="relative z-10 flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Meta de Hoje</p>
              {todayGoal > 0 && (
                <p className="text-xs font-medium text-muted-foreground mt-0.5">
                  <span className="text-foreground font-bold">R$ {todaySales.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}</span>
                  {" / "}
                  R$ {todayGoal.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                </p>
              )}
            </div>
            <div className={cn(
              "px-3 py-1 rounded-xl text-xs font-bold border",
              todayPct >= 100 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
              todayPct >= 60  ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                                "bg-rose-500/10 text-rose-400 border-rose-500/20"
            )}>
              {todayGoal > 0 ? `${Math.round(todayPct)}%` : "Sem meta"}
            </div>
          </div>
          <div className="relative z-10 flex justify-center pb-2">
            <GoalGauge current={todaySales} target={todayGoal} size={160} />
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              label: "Vendas Hoje",
              value: todayCount,
              sub: todayCount === 1 ? "venda" : "vendas",
              icon: ShoppingBag,
              color: "blue",
            },
            {
              label: "Receita Hoje",
              value: `R$ ${todaySales.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`,
              sub: "faturado",
              icon: DollarSign,
              color: "emerald",
            },
            {
              label: "Mês Atual",
              value: `R$ ${monthSales.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`,
              sub: monthGoal > 0 ? `${Math.round(monthPct)}% da meta` : "total do mês",
              icon: TrendingUp,
              color: "violet",
            },
            {
              label: "Meta Mensal",
              value: monthGoal > 0 ? `${Math.round(monthPct)}%` : "—",
              sub: monthGoal > 0 ? `Meta: R$ ${monthGoal.toLocaleString("pt-BR")}` : "Sem meta definida",
              icon: Target,
              color: "amber",
            },
          ].map(s => (
            <div key={s.label} className="group relative overflow-hidden bg-card/30 backdrop-blur-xl border border-white/5 rounded-[24px] p-5 shadow-lg transition-all duration-300 hover:bg-card/50 hover:border-white/10">
              <div className={cn(
                "absolute -top-4 -right-4 w-20 h-20 opacity-20 blur-2xl rounded-full transition-all duration-500 group-hover:opacity-40 group-hover:scale-150",
                s.color === "blue" ? "bg-blue-500" : s.color === "emerald" ? "bg-emerald-500" : s.color === "violet" ? "bg-violet-500" : "bg-amber-500"
              )} />
              <div className={cn(
                "relative z-10 w-10 h-10 rounded-[14px] flex items-center justify-center mb-4 transition-transform group-hover:scale-110",
                s.color === "blue" ? "bg-blue-500/15 text-blue-400" : s.color === "emerald" ? "bg-emerald-500/15 text-emerald-400" : s.color === "violet" ? "bg-violet-500/15 text-violet-400" : "bg-amber-500/15 text-amber-500"
              )}>
                <s.icon className="h-5 w-5" />
              </div>
              <p className="relative z-10 text-[22px] font-black text-foreground tracking-tight">{s.value}</p>
              <p className="relative z-10 text-[11px] font-bold text-muted-foreground mt-0.5 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Ranking */}
        {ranking.length > 0 && (
          <div className="bg-card/40 backdrop-blur-xl border border-white/5 rounded-[32px] overflow-hidden shadow-lg relative">
            <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/10 blur-[60px] rounded-full pointer-events-none" />
            
            <div className="relative z-10 flex items-center justify-between px-6 py-5 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[14px] bg-amber-500/15 flex items-center justify-center ring-1 ring-amber-500/20">
                  <Trophy className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground tracking-wide">Ranking do Mês</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Top Vendedores</p>
                </div>
              </div>
              {myPosition > 0 && (
                <span className="text-xs font-black tracking-wide text-amber-500 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full">
                  Você: #{myPosition}
                </span>
              )}
            </div>
            <div className="p-3 relative z-10">
              {ranking.map((r, i) => (
                <div
                  key={r.userId}
                  className={cn(
                    "flex items-center gap-4 px-4 py-3.5 rounded-[20px] transition-all",
                    r.userId === user?.id ? "bg-white/5 shadow-inner" : "hover:bg-white/5"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0",
                    i === 0 ? "bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.5)]" :
                    i === 1 ? "bg-slate-300 text-slate-800" :
                    i === 2 ? "bg-orange-300/80 text-orange-900" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-bold truncate", r.userId === user?.id ? "text-primary" : "text-foreground")}>
                      {r.name} {r.userId === user?.id && "• Você"}
                    </p>
                  </div>
                  <p className="text-[15px] font-black tracking-tight text-foreground whitespace-nowrap">
                    R$ {r.total.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent sales */}
        {recentSales.length > 0 && (
          <div className="bg-card/40 backdrop-blur-xl border border-white/5 rounded-[32px] overflow-hidden shadow-lg">
            <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5">
              <div className="w-10 h-10 rounded-[14px] bg-emerald-500/15 flex items-center justify-center ring-1 ring-emerald-500/20">
                <Zap className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground tracking-wide">Vendas Recentes</p>
                <p className="text-xs text-muted-foreground mt-0.5">Últimas transações</p>
              </div>
            </div>
            <div className="p-3">
              {recentSales.map((s, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3.5 rounded-[20px] hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-card border border-white/5 flex items-center justify-center shadow-sm">
                      <DollarSign className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-[15px] font-black tracking-tight text-foreground">
                        R$ {Number(s.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs font-medium text-muted-foreground mt-0.5">
                        {PAYMENT_LABELS[s.payment_method] || s.payment_method} <span className="mx-1">•</span> {new Date(s.sold_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fidelidade do último cliente */}
        {loyaltyWallet && (
          <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 rounded-[32px] p-6 text-white shadow-[0_15px_30px_rgba(245,158,11,0.3)]">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/20 blur-3xl rounded-full mix-blend-overlay" />
            <div className="relative z-10 flex items-center gap-2 mb-4">
              <Star className="h-5 w-5 fill-white" />
              <p className="text-[11px] font-black uppercase tracking-widest opacity-90">Fidelidade — Último Cliente</p>
            </div>
            <p className="relative z-10 text-4xl font-black tracking-tighter drop-shadow-md">{loyaltyWallet.pontos_total} pts</p>
            <p className="relative z-10 text-sm font-bold opacity-90 mt-1">Nível {loyaltyWallet.nivel_atual}</p>
          </div>
        )}
      </div>
    </div>
  );
}
