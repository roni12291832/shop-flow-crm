import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import { Download, DollarSign, TrendingUp, Users, FileText } from "lucide-react";

const COLORS = ["hsl(239, 84%, 67%)", "hsl(160, 84%, 39%)", "hsl(38, 92%, 50%)", "hsl(280, 65%, 60%)", "hsl(340, 75%, 55%)", "hsl(200, 70%, 50%)"];

export default function Reports() {
  const { tenantId } = useAuth();
  const [salesData, setSalesData] = useState<any[]>([]);
  const [clientData, setClientData] = useState<any[]>([]);
  const [sellerData, setSellerData] = useState<any[]>([]);
  const [totals, setTotals] = useState({ revenue: 0, deals: 0, clients: 0, avgTicket: 0 });
  const [activeTab, setActiveTab] = useState("vendas");

  useEffect(() => {
    if (!tenantId) return;
    const fetchReports = async () => {
      const [oppsRes, clientsRes, profilesRes] = await Promise.all([
        supabase.from("opportunities").select("*").eq("tenant_id", tenantId),
        supabase.from("clients").select("*").eq("tenant_id", tenantId),
        supabase.from("profiles").select("user_id, name").eq("tenant_id", tenantId),
      ]);
      const opps = oppsRes.data || []; const clients = clientsRes.data || []; const profiles = profilesRes.data || [];
      const closed = opps.filter((o: any) => o.stage === "venda_fechada");
      const totalRevenue = closed.reduce((s: number, o: any) => s + Number(o.estimated_value || 0), 0);
      const avgTicket = closed.length > 0 ? totalRevenue / closed.length : 0;
      setTotals({ revenue: totalRevenue, deals: closed.length, clients: clients.length, avgTicket });

      const originMap: Record<string, number> = {};
      clients.forEach((c: any) => { const o = c.origin || "outro"; originMap[o] = (originMap[o] || 0) + 1; });
      setClientData(Object.entries(originMap).map(([name, value]) => ({ name, value })));

      const sellerMap: Record<string, { name: string; deals: number; revenue: number }> = {};
      closed.forEach((o: any) => {
        const profile = profiles.find((p: any) => p.user_id === o.responsible_id);
        const name = profile?.name || "Sem responsável";
        if (!sellerMap[name]) sellerMap[name] = { name, deals: 0, revenue: 0 };
        sellerMap[name].deals++; sellerMap[name].revenue += Number(o.estimated_value || 0);
      });
      setSellerData(Object.values(sellerMap));

      const monthlyMap: Record<string, number> = {};
      closed.forEach((o: any) => {
        const month = new Date(o.created_at).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
        monthlyMap[month] = (monthlyMap[month] || 0) + Number(o.estimated_value || 0);
      });
      setSalesData(Object.entries(monthlyMap).map(([month, revenue]) => ({ month, revenue })));
    };
    fetchReports();
  }, [tenantId]);

  const exportCSV = (data: any[], filename: string) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]).join(",");
    const rows = data.map(d => Object.values(d).join(",")).join("\n");
    const blob = new Blob([`${headers}\n${rows}`], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${filename}.csv`; a.click();
  };

  const tabs = [
    { key: "vendas", label: "Vendas" },
    { key: "clientes", label: "Clientes" },
    { key: "vendedores", label: "Vendedores" },
  ];

  return (
    <div className="p-7 space-y-6 animate-fade-in">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Receita Total", value: `R$ ${totals.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "hsl(var(--chart-2))" },
          { label: "Vendas Fechadas", value: totals.deals, icon: TrendingUp, color: "hsl(var(--chart-1))" },
          { label: "Total Clientes", value: totals.clients, icon: Users, color: "hsl(var(--chart-4))" },
          { label: "Ticket Médio", value: `R$ ${totals.avgTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "hsl(var(--chart-3))" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm">{s.label}</p>
              <p className="text-xl font-bold text-foreground mt-1">{s.value}</p>
            </div>
            <s.icon className="h-8 w-8 opacity-40" style={{ color: s.color }} />
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-[10px] text-[13px] font-semibold transition-all border ${
              activeTab === t.key ? "bg-primary/20 text-primary border-primary/40" : "bg-card text-muted-foreground border-border hover:bg-secondary"
            }`}>{t.label}</button>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-foreground font-bold text-base">
            {activeTab === "vendas" ? "Receita Mensal" : activeTab === "clientes" ? "Clientes por Origem" : "Vendas por Vendedor"}
          </h3>
          <Button variant="outline" size="sm" className="gap-1.5 text-[12px] border-border"
            onClick={() => exportCSV(activeTab === "vendas" ? salesData : activeTab === "clientes" ? clientData : sellerData, activeTab)}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </div>

        {activeTab === "vendas" && (salesData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ background: "hsl(228, 25%, 8%)", border: "1px solid hsl(var(--border))", borderRadius: 10, color: "hsl(var(--foreground))" }} />
              <Line type="monotone" dataKey="revenue" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--chart-1))" }} />
            </LineChart>
          </ResponsiveContainer>
        ) : <EmptyChart />)}

        {activeTab === "clientes" && (clientData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={clientData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {clientData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(228, 25%, 8%)", border: "1px solid hsl(var(--border))", borderRadius: 10, color: "hsl(var(--foreground))" }} />
            </PieChart>
          </ResponsiveContainer>
        ) : <EmptyChart />)}

        {activeTab === "vendedores" && (sellerData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sellerData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ background: "hsl(228, 25%, 8%)", border: "1px solid hsl(var(--border))", borderRadius: 10, color: "hsl(var(--foreground))" }} />
              <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} name="Receita" />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyChart />)}
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
      <div className="text-center"><FileText className="h-10 w-10 mx-auto mb-2 opacity-40" /><p className="text-sm">Nenhum dado disponível</p></div>
    </div>
  );
}
