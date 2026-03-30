// Dashboard updated at 23:18
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  TrendingUp, 
  DollarSign, 
  UserPlus,
  Calendar,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  CheckSquare,
  Package,
  ShoppingCart,
  Users,
  AlertTriangle,
  RefreshCw,
  Percent,
  TrendingDown
} from "lucide-react";
import { 
  format, 
  startOfMonth, 
  startOfToday, 
  subDays, 
  endOfDay, 
  startOfYesterday, 
  subMonths,
  eachDayOfInterval,
  parseISO
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, PieChart, Pie
} from "recharts";
import { BirthdayDashboardWidget } from "@/components/datas/BirthdayDashboardWidget";
import { NpsDashboardWidget } from "@/components/nps/NpsDashboardWidget";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CHART_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

interface DashboardData {
  finance: {
    monthlyRevenue: number;
    prevMonthlyRevenue: number;
    avgTicket: number;
    grossMargin: number;
    operatingCost: number;
  };
  sales: {
    dailyRevenue: { day: string; value: number }[];
    topProducts: { name: string; sales: number; revenue: number }[];
  };
  stock: {
    lowStockItems: { name: string; current: number; min: number }[];
  };
  recentOrders: { id: string; client: string; status: string; value: number; date: string }[];
  performance: {
    lojaFisica: { current: number; goal: number };
    online: { current: number; goal: number };
  };
  team: {
    newClients: number;
    loyaltyRate: number;
    nps: number;
    sellers: { name: string; sales: number; revenue: number }[];
  };
  birthdays: { name: string; date: string }[];
  tasks: { id: string; title: string; status: string }[];
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const now = new Date();
    const monthStart = startOfMonth(now);
    const prevMonthStart = startOfMonth(subMonths(now, 1));
    const prevMonthEnd = endOfDay(subDays(monthStart, 1));

    try {
      // 1. Fetch Sales (2 meses para comparação, limitado a 500 registros)
      const { data: sales } = await supabase.from("sales_entries")
        .select("*, clients(name, origin)")
        .gte("sold_at", prevMonthStart.toISOString())
        .order("sold_at", { ascending: false })
        .limit(500);

      const confirmedSales = (sales || []).filter(s => s.status === "confirmado");
      const currentMonthSales = confirmedSales.filter(s => new Date(s.sold_at) >= monthStart);
      const prevMonthSales = confirmedSales.filter(s => {
        const d = new Date(s.sold_at);
        return d >= prevMonthStart && d <= prevMonthEnd;
      });

      const currentRevenue = currentMonthSales.reduce((acc, s) => acc + Number(s.value), 0);
      const prevRevenue = prevMonthSales.reduce((acc, s) => acc + Number(s.value), 0);

      // 2. Fetch Products and Movements (Inventory & Margin)
      const [{ data: products }, { data: movements }] = await Promise.all([
        supabase.from("products").select("*").limit(200),
        supabase.from("inventory_movements").select("*, products(name)")
          .gte("created_at", monthStart.toISOString()).limit(300),
      ]);

      const lowStock = (products || []).filter(p => p.active && p.current_stock <= p.min_stock);
      
      // Calculate Top Products from movements (saida)
      const salesMovements = (movements || []).filter(m => m.type === "saida");
      const prodMap: Record<string, { name: string; sales: number; revenue: number }> = {};
      salesMovements.forEach(m => {
        const name = (m.products as any)?.name || "Desconhecido";
        if (!prodMap[name]) prodMap[name] = { name, sales: 0, revenue: 0 };
        prodMap[name].sales += m.quantity;
        // revenue is estimated if not directly in movement
        const prod = (products || []).find(p => p.id === m.product_id);
        prodMap[name].revenue += m.quantity * (prod?.sell_price || 0);
      });
      const topProducts = Object.values(prodMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

      // Calculate Margin
      const totalCost = salesMovements.reduce((acc, m) => {
        const prod = (products || []).find(p => p.id === m.product_id);
        return acc + (m.quantity * (prod?.cost_price || 0));
      }, 0);
      const estimatedTotalRevenue = salesMovements.reduce((acc, m) => {
        const prod = (products || []).find(p => p.id === m.product_id);
        return acc + (m.quantity * (prod?.sell_price || 0));
      }, 0);
      const margin = estimatedTotalRevenue > 0 ? ((estimatedTotalRevenue - totalCost) / estimatedTotalRevenue) * 100 : 0;

      // 3. Daily Stats for Chart
      const days = eachDayOfInterval({ start: monthStart, end: now });
      const dailyData = days.map(day => {
        const dayStr = format(day, "dd/MM");
        const val = currentMonthSales
          .filter(s => format(parseISO(s.sold_at), "yyyy-MM-dd") === format(day, "yyyy-MM-dd"))
          .reduce((acc, s) => acc + Number(s.value), 0);
        return { day: dayStr, value: val };
      });

      // 4. Team & Client Performance
      const { data: profiles } = await supabase.from("profiles").select("*").limit(50);
      const { data: clients } = await supabase.from("clients").select("id, name, origin, ticket_medio, last_purchase, created_at").limit(200);
      const { data: npsSurveys } = await supabase.from("nps_surveys").select("score, category, responded_at").eq("status", "responded").limit(100);

      const newClients = (clients || []).filter(c => new Date(c.created_at) >= monthStart).length;
      
      // Loyalty: Clients with more than 1 sale
      const clientSaleCount: Record<string, number> = {};
      confirmedSales.forEach(s => { if (s.customer_id) clientSaleCount[s.customer_id] = (clientSaleCount[s.customer_id] || 0) + 1; });
      const loyalClients = Object.values(clientSaleCount).filter(count => count > 1).length;
      const loyaltyRate = (clients || []).length > 0 ? (loyalClients / (clients || []).length) * 100 : 0;

      // NPS
      const promoters = (npsSurveys || []).filter(s => s.category === "promotor").length;
      const detractors = (npsSurveys || []).filter(s => s.category === "detrator").length;
      const npsScore = (npsSurveys || []).length > 0 ? Math.round(((promoters - detractors) / (npsSurveys || []).length) * 100) : 0;

      // Seller Performance
      const sellerMap: Record<string, { name: string; sales: number; revenue: number }> = {};
      currentMonthSales.forEach(s => {
        const profile = (profiles || []).find(p => p.user_id === s.user_id);
        const name = profile?.name || "Outros";
        if (!sellerMap[name]) sellerMap[name] = { name, sales: 0, revenue: 0 };
        sellerMap[name].sales++;
        sellerMap[name].revenue += Number(s.value);
      });
      const topSellers = Object.values(sellerMap).sort((a, b) => b.revenue - a.revenue);

      // 5. Store Performance (Fisica vs Online)
      const fisicaRevenue = currentMonthSales.filter(s => (s.clients as any)?.origin === "loja_fisica" || (s.clients as any)?.origin === "indicacao").reduce((acc, s) => acc + Number(s.value), 0);
      const onlineRevenue = currentMonthSales.filter(s => ["whatsapp", "site", "instagram", "facebook", "google"].includes((s.clients as any)?.origin || "")).reduce((acc, s) => acc + Number(s.value), 0);

      // Goals (Simplified)
      const { data: goals } = await supabase.from("goals").select("*").eq("period_type", "monthly").gte("end_date", now.toISOString());
      const storeGoalValue = goals?.find(g => !g.user_id)?.target_value || 50000;

      // 6. Tasks
      const { data: tasks } = await supabase.from("tasks").select("*").eq("status", "pendente").limit(5);

      setData({
        finance: {
          monthlyRevenue: currentRevenue,
          prevMonthlyRevenue: prevRevenue,
          avgTicket: currentMonthSales.length > 0 ? currentRevenue / currentMonthSales.length : 0,
          grossMargin: Math.round(margin),
          operatingCost: 15000, // Placeholder or fetch if table exists
        },
        sales: {
          dailyRevenue: dailyData,
          topProducts: topProducts
        },
        stock: {
          lowStockItems: lowStock.map(p => ({ name: p.name, current: p.current_stock, min: p.min_stock }))
        },
        recentOrders: currentMonthSales.slice(0, 5).map(s => ({
          id: s.id.slice(0, 8),
          client: (s.clients as any)?.name || "Cliente Final",
          status: s.status,
          value: Number(s.value),
          date: format(new Date(s.sold_at), "dd/MM/yy HH:mm")
        })),
        performance: {
          lojaFisica: { current: fisicaRevenue, goal: storeGoalValue * 0.6 },
          online: { current: onlineRevenue, goal: storeGoalValue * 0.4 }
        },
        team: {
          newClients,
          loyaltyRate: Math.round(loyaltyRate),
          nps: npsScore,
          sellers: topSellers
        },
        birthdays: [], // Managed by widget
        tasks: (tasks || []).map(t => ({ id: t.id, title: t.title, status: t.status }))
      });

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const revenueVariation = data.finance.prevMonthlyRevenue > 0 
    ? ((data.finance.monthlyRevenue - data.finance.prevMonthlyRevenue) / data.finance.prevMonthlyRevenue) * 100 
    : 0;

  return (
    <div className="p-4 md:p-8 space-y-8 bg-background min-h-screen animate-fade-in overflow-y-auto pb-20">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard Geral</h1>
          <p className="text-muted-foreground">Monitoramento em tempo real do seu negócio</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          <div className="flex items-center gap-2 bg-card border border-border px-3 py-1.5 rounded-lg text-sm font-medium shadow-sm">
            <Calendar className="w-4 h-4 text-primary" />
            <span>{format(new Date(), "MMMM yyyy", { locale: ptBR })}</span>
          </div>
        </div>
      </div>

      {/* Row 1: Key Financials */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          title="Faturamento (Mês)" 
          value={formatBRL(data.finance.monthlyRevenue)} 
          icon={<DollarSign className="w-5 h-5" />}
          trend={`${revenueVariation.toFixed(1)}%`}
          trendType={revenueVariation >= 0 ? "up" : "down"}
          footer={`vs ${formatBRL(data.finance.prevMonthlyRevenue)} mês ant.`}
        />
        <MetricCard 
          title="Ticket Médio" 
          value={formatBRL(data.finance.avgTicket)} 
          icon={<ShoppingCart className="w-5 h-5" />}
          trend="+5%" 
          trendType="up"
          footer="Valor médio por venda"
        />
        <MetricCard 
          title="Margem Bruta" 
          value={`${data.finance.grossMargin}%`} 
          icon={<Percent className="w-5 h-5" />}
          trendType="neutral"
          footer="Média de lucro bruto"
        />
        <MetricCard 
          title="Custo Operacional" 
          value={formatBRL(data.finance.operatingCost)} 
          icon={<TrendingDown className="w-5 h-5" />}
          trend="Fixo" 
          trendType="neutral"
          footer="Estimativa mensal"
        />
      </div>

      {/* Row 2: Vendas - Chart & Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" /> Faturamento Diário
            </h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.sales.dailyRevenue}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `R$${v}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: '12px' }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  itemStyle={{ color: "hsl(var(--foreground))" }}
                  formatter={(v: number) => [formatBRL(v), "Faturamento"]}
                />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 2, stroke: "hsl(var(--background))" }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" /> Top Produtos (Mês)
          </h3>
          <div className="space-y-4">
            {data.sales.topProducts.length > 0 ? data.sales.topProducts.map((p, i) => (
              <div key={i} className="flex items-center justify-between group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.sales} unidades vendidas</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{formatBRL(p.revenue)}</p>
                </div>
              </div>
            )) : <p className="text-sm text-muted-foreground text-center py-10">Nenhuma venda registrada</p>}
          </div>
        </div>
      </div>

      {/* Row 3: Alerts & Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alerts */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" /> Alertas de Estoque Baixo
          </h3>
          <div className="space-y-3">
            {data.stock.lowStockItems.length > 0 ? data.stock.lowStockItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-500/20 p-2 rounded-lg">
                    <Package className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">Reposição necessária</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-amber-600">{item.current} <span className="text-muted-foreground font-normal text-xs">/ min {item.min}</span></p>
                </div>
              </div>
            )) : <div className="text-center py-6 text-muted-foreground text-sm">Estoque saudável! ✅</div>}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm overflow-hidden">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary" /> Pedidos Recentes
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="pb-2 font-medium">PEDIDO</th>
                  <th className="pb-2 font-medium">CLIENTE</th>
                  <th className="pb-2 font-medium">VALOR</th>
                  <th className="pb-2 font-medium text-right">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {data.recentOrders.map((o) => (
                  <tr key={o.id} className="text-sm hover:bg-muted/30">
                    <td className="py-3 font-mono text-xs">{o.id}</td>
                    <td className="py-3 font-medium uppercase text-xs">{o.client}</td>
                    <td className="py-3">{formatBRL(o.value)}</td>
                    <td className="py-3 text-right">
                      <Badge variant={o.status === "confirmado" ? "default" : "outline"} className="text-[10px] uppercase">
                        {o.status === "confirmado" ? "Concluído" : o.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Row 4: Store Performance & Team */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Lojas */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" /> Desempenho por Canal
          </h3>
          <div className="space-y-6">
            <PerformanceRow 
              label="Loja Física" 
              current={data.performance.lojaFisica.current} 
              goal={data.performance.lojaFisica.goal} 
              color="bg-indigo-500"
            />
            <PerformanceRow 
              label="Canal Online (WhatsApp/Insta/Site)" 
              current={data.performance.online.current} 
              goal={data.performance.online.goal} 
              color="bg-emerald-500"
            />
          </div>
        </div>

        {/* Clientes e Equipe */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> Saúde da Base e Equipe
          </h3>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <HealthStat label="Novos Clientes" value={data.team.newClients.toString()} sub="Este mês" />
            <HealthStat label="Fidelização" value={`${data.team.loyaltyRate}%`} sub="Taxa de retorno" />
            <HealthStat label="NPS Geral" value={data.team.nps > 0 ? `+${data.team.nps}` : data.team.nps.toString()} sub="Satisfação" />
          </div>
          <div className="space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Ranking Geral (Mês)</p>
            {data.team.sellers.map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground w-4">{i+1}º</span>
                  <span className="text-sm font-medium">{s.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-primary">{formatBRL(s.revenue)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Final Row: Birthday & NPS & Tasks Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <BirthdayDashboardWidget />
        <NpsDashboardWidget />
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-base flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" /> Tarefas de Hoje
            </h3>
            <button onClick={() => navigate("/tasks")} className="text-xs text-primary font-medium">Ver todas →</button>
          </div>
          <div className="space-y-3">
            {data.tasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 text-sm p-2 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="truncate">{t.title}</span>
              </div>
            ))}
            {data.tasks.length === 0 && <p className="text-center py-6 text-muted-foreground text-sm">Sem pendências 🎉</p>}
          </div>
        </div>
      </div>

    </div>
  );
}

function MetricCard({ title, value, icon, trend, trendType, footer }: any) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
      <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12 group-hover:bg-primary/10 transition-colors" />
      <div className="flex justify-between items-start mb-4">
        <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-0.5 text-xs font-bold px-2 py-1 rounded-full ${
            trendType === 'up' ? 'bg-emerald-500/10 text-emerald-500' : 
            trendType === 'down' ? 'bg-rose-500/10 text-rose-500' : 'bg-muted text-muted-foreground'
          }`}>
            {trendType === 'up' && <ArrowUpRight className="w-3 h-3" />}
            {trendType === 'down' && <ArrowDownRight className="w-3 h-3" />}
            {trend}
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{value}</h2>
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
          {footer}
        </p>
      </div>
    </div>
  );
}

function PerformanceRow({ label, current, goal, color }: any) {
  const percent = Math.min((current / goal) * 100, 100);
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(current)} <span className="text-xs text-muted-foreground font-normal">/ {Math.round(percent)}% da meta</span></span>
      </div>
      <div className="h-4 w-full bg-muted rounded-full overflow-hidden p-0.5">
        <div 
          className={`h-full ${color} rounded-full transition-all duration-1000 shadow-sm`} 
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function HealthStat({ label, value, sub }: any) {
  return (
    <div className="text-center p-3 rounded-2xl bg-muted/30 border border-border/50">
      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">{label}</p>
      <p className="text-xl font-black text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}
