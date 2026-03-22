import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { Download, DollarSign, TrendingUp, Users, FileText, CalendarDays, CreditCard, Receipt } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const COLORS = ["hsl(239, 84%, 67%)", "hsl(160, 84%, 39%)", "hsl(38, 92%, 50%)", "hsl(280, 65%, 60%)", "hsl(340, 75%, 55%)", "hsl(200, 70%, 50%)"];

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX", credito: "Crédito", debito: "Débito",
  dinheiro: "Dinheiro", boleto: "Boleto", crediario: "Crediário",
};

type DateRange = "month" | "last30" | "last90";

export default function Reports() {
    const [sales, setSales] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [activeTab, setActiveTab] = useState("pagamento");
  const printRef = useRef<HTMLDivElement>(null);

  const getDateRange = () => {
    const now = new Date();
    if (dateRange === "month") return { start: startOfMonth(now), end: endOfMonth(now) };
    if (dateRange === "last30") return { start: subMonths(now, 1), end: now };
    return { start: subMonths(now, 3), end: now };
  };

  useEffect(() => {
        const { start, end } = getDateRange();
    const fetch = async () => {
      const [salesRes, profilesRes] = await Promise.all([
        supabase.from("sales_entries").select("*")
          .gte("sold_at", start.toISOString()).lte("sold_at", end.toISOString()),
        supabase.from("profiles").select("user_id, name"),
      ]);
      setSales(salesRes.data || []);
      setProfiles(profilesRes.data || []);
    };
    fetch();
  }, [tenantId, dateRange]);

  const confirmed = sales.filter((s: any) => s.status === "confirmado");
  const totalRevenue = confirmed.reduce((s: number, e: any) => s + Number(e.value || 0), 0);
  const totalSales = confirmed.length;
  const avgTicket = totalSales > 0 ? totalRevenue / totalSales : 0;
  const cancelled = sales.filter((s: any) => s.status === "cancelado").length;

  // By payment method
  const paymentMap: Record<string, { method: string; count: number; revenue: number }> = {};
  confirmed.forEach((s: any) => {
    const m = s.payment_method || "pix";
    if (!paymentMap[m]) paymentMap[m] = { method: PAYMENT_LABELS[m] || m, count: 0, revenue: 0 };
    paymentMap[m].count++;
    paymentMap[m].revenue += Number(s.value || 0);
  });
  const paymentData = Object.values(paymentMap).sort((a, b) => b.revenue - a.revenue);

  // By seller
  const sellerMap: Record<string, { name: string; count: number; revenue: number }> = {};
  confirmed.forEach((s: any) => {
    const p = profiles.find((pr: any) => pr.user_id === s.user_id);
    const name = p?.name || "Sem vendedor";
    if (!sellerMap[name]) sellerMap[name] = { name, count: 0, revenue: 0 };
    sellerMap[name].count++;
    sellerMap[name].revenue += Number(s.value || 0);
  });
  const sellerData = Object.values(sellerMap).sort((a, b) => b.revenue - a.revenue);

  // Daily
  const { start, end } = getDateRange();
  const days = eachDayOfInterval({ start, end });
  const dailyMap: Record<string, number> = {};
  days.forEach(d => { dailyMap[format(d, "dd/MM")] = 0; });
  confirmed.forEach((s: any) => {
    const key = format(parseISO(s.sold_at), "dd/MM");
    if (dailyMap[key] !== undefined) dailyMap[key] += Number(s.value || 0);
  });
  const dailyData = Object.entries(dailyMap).map(([day, revenue]) => ({ day, revenue }));

  const exportCSV = (data: any[], filename: string) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]).join(",");
    const rows = data.map(d => Object.values(d).join(",")).join("\n");
    const blob = new Blob([`${headers}\n${rows}`], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${filename}.csv`; a.click();
  };

  const exportPDF = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Relatório Fiscal</title>
      <style>body{font-family:sans-serif;padding:24px;color:#222}
      table{width:100%;border-collapse:collapse;margin:16px 0}
      th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}
      th{background:#f5f5f5;font-weight:600}
      h1{font-size:18px}h2{font-size:15px;margin-top:24px}
      .summary{display:flex;gap:24px;margin:16px 0}
      .card{border:1px solid #ddd;border-radius:8px;padding:16px;flex:1}
      .card-label{font-size:12px;color:#666}.card-value{font-size:18px;font-weight:700}
      </style></head><body>
      <h1>Relatório Fiscal — ${dateRange === "month" ? format(new Date(), "MMMM yyyy", { locale: ptBR }) : dateRange === "last30" ? "Últimos 30 dias" : "Últimos 90 dias"}</h1>
      <div class="summary">
        <div class="card"><div class="card-label">Receita Total</div><div class="card-value">R$ ${totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div></div>
        <div class="card"><div class="card-label">Vendas</div><div class="card-value">${totalSales}</div></div>
        <div class="card"><div class="card-label">Ticket Médio</div><div class="card-value">R$ ${avgTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div></div>
        <div class="card"><div class="card-label">Cancelamentos</div><div class="card-value">${cancelled}</div></div>
      </div>
      <h2>Por Forma de Pagamento</h2>
      <table><tr><th>Método</th><th>Vendas</th><th>Receita</th></tr>
      ${paymentData.map(p => `<tr><td>${p.method}</td><td>${p.count}</td><td>R$ ${p.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td></tr>`).join("")}
      </table>
      <h2>Por Vendedor</h2>
      <table><tr><th>Vendedor</th><th>Vendas</th><th>Receita</th></tr>
      ${sellerData.map(s => `<tr><td>${s.name}</td><td>${s.count}</td><td>R$ ${s.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td></tr>`).join("")}
      </table>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const tabs = [
    { key: "pagamento", label: "Pagamento", icon: CreditCard },
    { key: "vendedores", label: "Vendedores", icon: Users },
    { key: "diario", label: "Diário", icon: CalendarDays },
  ];

  const dateRanges: { key: DateRange; label: string }[] = [
    { key: "month", label: "Mês atual" },
    { key: "last30", label: "30 dias" },
    { key: "last90", label: "90 dias" },
  ];

  return (
    <div ref={printRef} className="p-7 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" /> Relatório Fiscal
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Resumo financeiro do período</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs border-border" onClick={() => exportCSV(activeTab === "pagamento" ? paymentData : activeTab === "vendedores" ? sellerData : dailyData, `relatorio-${activeTab}`)}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs border-border" onClick={exportPDF}>
            <FileText className="h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </div>

      {/* Date range */}
      <div className="flex gap-2">
        {dateRanges.map(dr => (
          <button key={dr.key} onClick={() => setDateRange(dr.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              dateRange === dr.key ? "bg-primary/20 text-primary border-primary/40" : "bg-card text-muted-foreground border-border hover:bg-secondary"
            }`}>{dr.label}</button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Receita Total", value: `R$ ${totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "hsl(var(--chart-2))" },
          { label: "Vendas Confirmadas", value: totalSales, icon: TrendingUp, color: "hsl(var(--chart-1))" },
          { label: "Ticket Médio", value: `R$ ${avgTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "hsl(var(--chart-3))" },
          { label: "Cancelamentos", value: cancelled, icon: FileText, color: "hsl(var(--chart-4))" },
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
            className={`px-4 py-2 rounded-[10px] text-[13px] font-semibold transition-all border flex items-center gap-1.5 ${
              activeTab === t.key ? "bg-primary/20 text-primary border-primary/40" : "bg-card text-muted-foreground border-border hover:bg-secondary"
            }`}>
            <t.icon className="h-3.5 w-3.5" />{t.label}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="text-foreground font-bold text-base mb-6">
          {activeTab === "pagamento" ? "Receita por Forma de Pagamento" : activeTab === "vendedores" ? "Receita por Vendedor" : "Receita Diária"}
        </h3>

        {activeTab === "pagamento" && (paymentData.length > 0 ? (
          <div className="grid lg:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={paymentData} cx="50%" cy="50%" innerRadius={55} outerRadius={100} paddingAngle={4} dataKey="revenue"
                  label={({ method, percent }) => `${method} ${(percent * 100).toFixed(0)}%`}>
                  {paymentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, color: "hsl(var(--foreground))" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {paymentData.map((p, i) => (
                <div key={p.method} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-sm font-medium text-foreground">{p.method}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">R$ {p.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-muted-foreground">{p.count} vendas</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : <EmptyChart />)}

        {activeTab === "vendedores" && (sellerData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={sellerData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" width={120} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, color: "hsl(var(--foreground))" }} />
              <Bar dataKey="revenue" fill="hsl(var(--chart-1))" radius={[0, 6, 6, 0]} name="Receita" />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyChart />)}

        {activeTab === "diario" && (dailyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} interval={Math.max(0, Math.floor(dailyData.length / 10))} />
              <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, color: "hsl(var(--foreground))" }} />
              <Line type="monotone" dataKey="revenue" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3, fill: "hsl(var(--chart-2))" }} name="Receita" />
            </LineChart>
          </ResponsiveContainer>
        ) : <EmptyChart />)}
      </div>

      {/* Detail table */}
      {activeTab !== "diario" && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-foreground font-bold text-sm">Detalhamento</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  {activeTab === "pagamento" ? (
                    <><th className="px-6 py-3 text-left text-muted-foreground font-medium">Método</th>
                    <th className="px-6 py-3 text-right text-muted-foreground font-medium">Vendas</th>
                    <th className="px-6 py-3 text-right text-muted-foreground font-medium">Receita</th>
                    <th className="px-6 py-3 text-right text-muted-foreground font-medium">% Total</th></>
                  ) : (
                    <><th className="px-6 py-3 text-left text-muted-foreground font-medium">Vendedor</th>
                    <th className="px-6 py-3 text-right text-muted-foreground font-medium">Vendas</th>
                    <th className="px-6 py-3 text-right text-muted-foreground font-medium">Receita</th>
                    <th className="px-6 py-3 text-right text-muted-foreground font-medium">Ticket Médio</th></>
                  )}
                </tr>
              </thead>
              <tbody>
                {(activeTab === "pagamento" ? paymentData : sellerData).map((row: any, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-3 text-foreground font-medium">{row.method || row.name}</td>
                    <td className="px-6 py-3 text-right text-foreground">{row.count}</td>
                    <td className="px-6 py-3 text-right text-foreground font-semibold">R$ {row.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="px-6 py-3 text-right text-muted-foreground">
                      {activeTab === "pagamento"
                        ? `${totalRevenue > 0 ? ((row.revenue / totalRevenue) * 100).toFixed(1) : 0}%`
                        : `R$ ${row.count > 0 ? (row.revenue / row.count).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "0,00"}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
