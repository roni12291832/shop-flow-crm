import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GoalGauge } from "@/components/metas/GoalGauge";
import { GoalComparisonCard } from "@/components/metas/GoalComparisonCard";
import { SalesRankingTable } from "@/components/metas/SalesRankingTable";
import { QuickSaleModal } from "@/components/metas/QuickSaleModal";
import { Button } from "@/components/ui/button";
import { Plus, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, startOfMonth, endOfMonth, subMonths, addMonths, isWithinInterval, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SellerRanking {
  name: string; target: number; realized: number; avatar: string;
}

export default function Goals() {
  const {  user, hasRole } = useAuth();
  const navigate = useNavigate();
  const isAdmin = hasRole("admin");
  const isGerente = hasRole("gerente");

  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [monthSales, setMonthSales] = useState(0);
  const [monthGoal, setMonthGoal] = useState(0);
  const [weekSales, setWeekSales] = useState(0);
  const [weekGoal, setWeekGoal] = useState(0);
  const [prevMonthSales, setPrevMonthSales] = useState(0);
  const [dailyData, setDailyData] = useState<{ day: string; value: number }[]>([]);
  const [sellers, setSellers] = useState<SellerRanking[]>([]);
  const [monthlyHistory, setMonthlyHistory] = useState<{ month: string; realized: number; target: number }[]>([]);

  const fetchData = useCallback(async () => {
    
    const monthStart = startOfMonth(selectedMonth);
    const monthEnd = endOfMonth(selectedMonth);
    const prevMonthStart = startOfMonth(subMonths(selectedMonth, 1));
    const prevMonthEnd = endOfMonth(subMonths(selectedMonth, 1));

    // Fetch sales for selected month + previous month
    const { data: allSales } = await supabase.from("sales_entries")
      .select("value, sold_at, user_id, status")
      
      .eq("status", "confirmado")
      .gte("sold_at", prevMonthStart.toISOString())
      .lte("sold_at", monthEnd.toISOString());

    const sales = allSales || [];
    const mSales = sales.filter(s => {
      const d = new Date(s.sold_at);
      return isWithinInterval(d, { start: monthStart, end: monthEnd });
    }).reduce((sum, s) => sum + Number(s.value), 0);

    const pMSales = sales.filter(s => {
      const d = new Date(s.sold_at);
      return isWithinInterval(d, { start: prevMonthStart, end: prevMonthEnd });
    }).reduce((sum, s) => sum + Number(s.value), 0);

    setMonthSales(mSales);
    setPrevMonthSales(pMSales);

    // Current week within selected month
    const now = new Date();
    const wStart = startOfWeek(now, { weekStartsOn: 0 });
    const wEnd = endOfWeek(now, { weekStartsOn: 0 });
    const wSales = sales.filter(s => {
      const d = new Date(s.sold_at);
      return isWithinInterval(d, { start: wStart, end: wEnd });
    }).reduce((sum, s) => sum + Number(s.value), 0);
    setWeekSales(wSales);

    // Daily breakdown for selected month
    const daysInMonth = monthEnd.getDate();
    const daily = Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(monthStart);
      d.setDate(i + 1);
      const ds = d.toISOString().split("T")[0];
      const dayVal = sales.filter(s => s.sold_at?.startsWith(ds)).reduce((sum, s) => sum + Number(s.value), 0);
      return { day: String(i + 1), value: dayVal };
    });
    setDailyData(daily);

    // Fetch goals
    const monthStartStr = monthStart.toISOString().split("T")[0];
    const monthEndStr = monthEnd.toISOString().split("T")[0];

    const { data: goals } = await supabase.from("goals")
      .select("*");

    const goalsArr = goals || [];
    const monthlyGoal = goalsArr.find((g: any) => g.period_type === "monthly" && !g.user_id && g.start_date <= monthEndStr && g.end_date >= monthStartStr);
    const weeklyGoal = goalsArr.find((g: any) => g.period_type === "weekly" && !g.user_id);

    setMonthGoal(monthlyGoal ? Number(monthlyGoal.target_value) : 0);
    setWeekGoal(weeklyGoal ? Number(weeklyGoal.target_value) : 0);

    // Seller ranking for selected month
    const { data: profiles } = await supabase.from("profiles").select("user_id, name");
    const sellerGoals = goalsArr.filter((g: any) => g.user_id && g.period_type === "monthly" && g.start_date <= monthEndStr && g.end_date >= monthStartStr);

    const monthSalesArr = sales.filter(s => {
      const d = new Date(s.sold_at);
      return isWithinInterval(d, { start: monthStart, end: monthEnd });
    });

    const sellersData = (profiles || []).map((p: any) => {
      const sg = sellerGoals.find((g: any) => g.user_id === p.user_id);
      const sellerTotal = monthSalesArr.filter(s => s.user_id === p.user_id).reduce((sum, s) => sum + Number(s.value), 0);
      return {
        name: p.name,
        target: sg ? Number(sg.target_value) : 0,
        realized: sellerTotal,
        avatar: p.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase(),
      };
    }).filter((s: any) => s.target > 0 || s.realized > 0);
    setSellers(sellersData);

    // Monthly history (last 6 months)
    const { data: allHistSales } = await supabase.from("sales_entries")
      .select("value, sold_at, status")
      
      .eq("status", "confirmado")
      .gte("sold_at", subMonths(monthStart, 5).toISOString());

    const histSales = allHistSales || [];
    const history = Array.from({ length: 6 }, (_, i) => {
      const m = subMonths(selectedMonth, 5 - i);
      const ms = startOfMonth(m);
      const me = endOfMonth(m);
      const realized = histSales.filter(s => {
        const d = new Date(s.sold_at);
        return isWithinInterval(d, { start: ms, end: me });
      }).reduce((sum, s) => sum + Number(s.value), 0);
      const mGoal = goalsArr.find((g: any) => g.period_type === "monthly" && !g.user_id && g.start_date <= me.toISOString().split("T")[0] && g.end_date >= ms.toISOString().split("T")[0]);
      return {
        month: format(m, "MMM/yy", { locale: ptBR }),
        realized,
        target: mGoal ? Number(mGoal.target_value) : 0,
      };
    });
    setMonthlyHistory(history);
  }, [selectedMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
        const channel = supabase
      .channel("sales-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_entries" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const pctMonth = monthGoal > 0 ? Math.round((monthSales / monthGoal) * 100) : 0;

  return (
    <div className="p-4 md:p-7 space-y-7 animate-fade-in">
      {/* Header with month selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-foreground font-bold text-lg capitalize">
            {format(selectedMonth, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          {(isAdmin || isGerente) && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/metas/configurar")}>
              <Settings className="h-4 w-4" /> Configurar Metas
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => setSaleModalOpen(true)}>
            <Plus className="h-4 w-4" /> Registrar Venda
          </Button>
        </div>
      </div>

      {/* Main gauge */}
      <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center gap-3">
        <GoalGauge current={monthSales} target={monthGoal} size={240} />
        <p className="text-muted-foreground text-sm">Meta mensal: R${monthGoal.toLocaleString("pt-BR")}</p>
      </div>

      {/* Comparison cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GoalComparisonCard title="Esta Semana" realized={weekSales} target={weekGoal} dailyData={dailyData.slice(0, 7)} />
        <GoalComparisonCard title="Este Mês" realized={monthSales} target={monthGoal} previousRealized={prevMonthSales} dailyData={dailyData} />
        <div className="bg-card border border-border rounded-2xl p-5">
          <h4 className="text-foreground font-bold text-sm mb-3">Desempenho Mensal</h4>
          <div className="text-2xl font-extrabold text-foreground mb-1">{pctMonth}%</div>
          <p className="text-muted-foreground text-xs mb-4">da meta atingida</p>
          <div className="space-y-2">
            {monthlyHistory.map((h) => {
              const pct = h.target > 0 ? Math.min((h.realized / h.target) * 100, 100) : 0;
              return (
                <div key={h.month}>
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span className="text-muted-foreground capitalize">{h.month}</span>
                    <span className="text-foreground font-semibold">R${h.realized.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="bg-border rounded h-1.5">
                    <div className="h-1.5 rounded transition-all duration-500" style={{
                      width: `${pct}%`,
                      background: pct >= 100 ? "hsl(var(--chart-2))" : pct >= 70 ? "hsl(var(--chart-3))" : "hsl(var(--destructive))"
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Ranking */}
      <SalesRankingTable sellers={sellers} />

      <QuickSaleModal open={saleModalOpen} onOpenChange={setSaleModalOpen} onSaleCreated={fetchData} />
    </div>
  );
}
