import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GoalGauge } from "@/components/metas/GoalGauge";
import { GoalComparisonCard } from "@/components/metas/GoalComparisonCard";
import { SalesRankingTable } from "@/components/metas/SalesRankingTable";
import { QuickSaleModal } from "@/components/metas/QuickSaleModal";
import { Button } from "@/components/ui/button";
import { Plus, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SellerRanking {
  name: string; target: number; realized: number; avatar: string;
}

export default function Goals() {
  const { tenantId, user, hasRole } = useAuth();
  const navigate = useNavigate();
  const isAdmin = hasRole("admin");
  const isGerente = hasRole("gerente");

  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [todaySales, setTodaySales] = useState(0);
  const [todayGoal, setTodayGoal] = useState(0);
  const [weekSales, setWeekSales] = useState(0);
  const [weekGoal, setWeekGoal] = useState(0);
  const [monthSales, setMonthSales] = useState(0);
  const [monthGoal, setMonthGoal] = useState(0);
  const [prevWeekSales, setPrevWeekSales] = useState(0);
  const [prevMonthSales, setPrevMonthSales] = useState(0);
  const [dailyData, setDailyData] = useState<{ day: string; value: number }[]>([]);
  const [sellers, setSellers] = useState<SellerRanking[]>([]);
  const [activeTab, setActiveTab] = useState<"today" | "week" | "month">("today");

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevWeek = new Date(startOfWeek);
    startOfPrevWeek.setDate(startOfPrevWeek.getDate() - 7);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Fetch sales
    const { data: allSales } = await supabase.from("sales_entries")
      .select("value, sold_at, user_id, status")
      .eq("tenant_id", tenantId)
      .eq("status", "confirmado")
      .gte("sold_at", startOfPrevMonth.toISOString());

    const sales = allSales || [];
    const todayS = sales.filter(s => s.sold_at?.startsWith(todayStr)).reduce((sum, s) => sum + Number(s.value), 0);
    const weekS = sales.filter(s => new Date(s.sold_at) >= startOfWeek).reduce((sum, s) => sum + Number(s.value), 0);
    const monthS = sales.filter(s => new Date(s.sold_at) >= startOfMonth).reduce((sum, s) => sum + Number(s.value), 0);
    const prevWkS = sales.filter(s => { const d = new Date(s.sold_at); return d >= startOfPrevWeek && d < startOfWeek; }).reduce((sum, s) => sum + Number(s.value), 0);
    const prevMoS = sales.filter(s => { const d = new Date(s.sold_at); return d >= startOfPrevMonth && d <= endOfPrevMonth; }).reduce((sum, s) => sum + Number(s.value), 0);

    setTodaySales(todayS); setWeekSales(weekS); setMonthSales(monthS);
    setPrevWeekSales(prevWkS); setPrevMonthSales(prevMoS);

    // Daily data for last 7 days
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now); d.setDate(d.getDate() - (6 - i));
      const ds = d.toISOString().split("T")[0];
      const dayVal = sales.filter(s => s.sold_at?.startsWith(ds)).reduce((sum, s) => sum + Number(s.value), 0);
      return { day: d.toLocaleDateString("pt-BR", { weekday: "short" }), value: dayVal };
    });
    setDailyData(last7);

    // Fetch goals
    const { data: goals } = await supabase.from("goals")
      .select("*").eq("tenant_id", tenantId);

    const goalsArr = goals || [];
    const dailyGoal = goalsArr.find((g: any) => g.period_type === "daily" && !g.user_id && g.start_date <= todayStr && g.end_date >= todayStr);
    const weeklyGoal = goalsArr.find((g: any) => g.period_type === "weekly" && !g.user_id && g.start_date <= todayStr && g.end_date >= todayStr);
    const monthlyGoal = goalsArr.find((g: any) => g.period_type === "monthly" && !g.user_id && g.start_date <= todayStr && g.end_date >= todayStr);

    setTodayGoal(dailyGoal ? Number(dailyGoal.target_value) : 0);
    setWeekGoal(weeklyGoal ? Number(weeklyGoal.target_value) : 0);
    setMonthGoal(monthlyGoal ? Number(monthlyGoal.target_value) : 0);

    // Seller ranking
    const { data: profiles } = await supabase.from("profiles").select("user_id, name").eq("tenant_id", tenantId);
    const sellerGoals = goalsArr.filter((g: any) => g.user_id && g.period_type === "daily" && g.start_date <= todayStr && g.end_date >= todayStr);

    const sellersData = (profiles || []).map((p: any) => {
      const sg = sellerGoals.find((g: any) => g.user_id === p.user_id);
      const sellerSales = sales.filter(s => s.sold_at?.startsWith(todayStr) && s.user_id === p.user_id).reduce((sum, s) => sum + Number(s.value), 0);
      return {
        name: p.name,
        target: sg ? Number(sg.target_value) : 0,
        realized: sellerSales,
        avatar: p.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase(),
      };
    }).filter((s: any) => s.target > 0 || s.realized > 0);

    setSellers(sellersData);
  }, [tenantId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel("sales-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_entries" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, fetchData]);

  return (
    <div className="p-4 md:p-7 space-y-7 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {(["today", "week", "month"] as const).map(t => (
            <Button key={t} variant={activeTab === t ? "default" : "outline"} size="sm" onClick={() => setActiveTab(t)}>
              {t === "today" ? "Hoje" : t === "week" ? "Semana" : "Mês"}
            </Button>
          ))}
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
      <div className="bg-card border border-border rounded-2xl p-8 flex justify-center">
        <GoalGauge
          current={activeTab === "today" ? todaySales : activeTab === "week" ? weekSales : monthSales}
          target={activeTab === "today" ? todayGoal : activeTab === "week" ? weekGoal : monthGoal}
          size={240}
        />
      </div>

      {/* Comparison cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GoalComparisonCard title="Hoje" realized={todaySales} target={todayGoal} dailyData={[]} />
        <GoalComparisonCard title="Esta Semana" realized={weekSales} target={weekGoal} previousRealized={prevWeekSales} dailyData={dailyData} />
        <GoalComparisonCard title="Este Mês" realized={monthSales} target={monthGoal} previousRealized={prevMonthSales} dailyData={[]} />
      </div>

      {/* Ranking */}
      <SalesRankingTable sellers={sellers} />

      <QuickSaleModal open={saleModalOpen} onOpenChange={setSaleModalOpen} onSaleCreated={fetchData} />
    </div>
  );
}
