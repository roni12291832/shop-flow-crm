import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { Download, FileText, Users, DollarSign, MessageSquare, TrendingUp } from "lucide-react";

const COLORS = [
  "hsl(217, 91%, 60%)", "hsl(151, 55%, 42%)", "hsl(38, 92%, 50%)",
  "hsl(280, 65%, 60%)", "hsl(340, 75%, 55%)", "hsl(200, 70%, 50%)",
];

export default function Reports() {
  const { tenantId } = useAuth();
  const [salesData, setSalesData] = useState<any[]>([]);
  const [clientData, setClientData] = useState<any[]>([]);
  const [sellerData, setSellerData] = useState<any[]>([]);
  const [totals, setTotals] = useState({ revenue: 0, deals: 0, clients: 0, avgTicket: 0 });

  useEffect(() => {
    if (!tenantId) return;

    const fetchReports = async () => {
      const [oppsRes, clientsRes, profilesRes] = await Promise.all([
        supabase.from("opportunities").select("*").eq("tenant_id", tenantId),
        supabase.from("clients").select("*").eq("tenant_id", tenantId),
        supabase.from("profiles").select("user_id, name").eq("tenant_id", tenantId),
      ]);

      const opps = oppsRes.data || [];
      const clients = clientsRes.data || [];
      const profiles = profilesRes.data || [];

      const closed = opps.filter((o: any) => o.stage === "venda_fechada");
      const totalRevenue = closed.reduce((s: number, o: any) => s + Number(o.estimated_value || 0), 0);
      const avgTicket = closed.length > 0 ? totalRevenue / closed.length : 0;

      setTotals({
        revenue: totalRevenue,
        deals: closed.length,
        clients: clients.length,
        avgTicket,
      });

      // Origin breakdown
      const originMap: Record<string, number> = {};
      clients.forEach((c: any) => {
        const o = c.origin || "outro";
        originMap[o] = (originMap[o] || 0) + 1;
      });
      setClientData(Object.entries(originMap).map(([name, value]) => ({ name, value })));

      // Sales by seller
      const sellerMap: Record<string, { name: string; deals: number; revenue: number }> = {};
      closed.forEach((o: any) => {
        const profile = profiles.find((p: any) => p.user_id === o.responsible_id);
        const name = profile?.name || "Sem responsável";
        if (!sellerMap[name]) sellerMap[name] = { name, deals: 0, revenue: 0 };
        sellerMap[name].deals++;
        sellerMap[name].revenue += Number(o.estimated_value || 0);
      });
      setSellerData(Object.values(sellerMap));

      // Monthly revenue (simplified)
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
    if (data.length === 0) return;
    const headers = Object.keys(data[0]).join(",");
    const rows = data.map((d) => Object.values(d).join(",")).join("\n");
    const blob = new Blob([`${headers}\n${rows}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">Análise completa do seu negócio</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Receita Total", value: `R$ ${totals.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "text-success" },
          { label: "Vendas Fechadas", value: totals.deals, icon: TrendingUp, color: "text-primary" },
          { label: "Total Clientes", value: totals.clients, icon: Users, color: "text-accent" },
          { label: "Ticket Médio", value: `R$ ${totals.avgTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "text-warning" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold mt-1">{s.value}</p>
              </div>
              <s.icon className={`h-8 w-8 ${s.color} opacity-50`} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="vendas">
        <TabsList>
          <TabsTrigger value="vendas">Vendas</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
        </TabsList>

        <TabsContent value="vendas" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Receita Mensal</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportCSV(salesData, "receita_mensal")} className="gap-1.5">
                <Download className="h-4 w-4" /> CSV
              </Button>
            </CardHeader>
            <CardContent>
              {salesData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={salesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`} />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(217, 91%, 60%)" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Nenhum dado de vendas ainda</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clientes" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Clientes por Origem</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportCSV(clientData, "clientes_origem")} className="gap-1.5">
                <Download className="h-4 w-4" /> CSV
              </Button>
            </CardHeader>
            <CardContent>
              {clientData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={clientData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {clientData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <p className="text-sm">Nenhum cliente cadastrado</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vendedores" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Vendas por Vendedor</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportCSV(sellerData, "vendas_vendedor")} className="gap-1.5">
                <Download className="h-4 w-4" /> CSV
              </Button>
            </CardHeader>
            <CardContent>
              {sellerData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={sellerData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`} />
                    <Bar dataKey="revenue" fill="hsl(151, 55%, 42%)" radius={[6, 6, 0, 0]} name="Receita" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <p className="text-sm">Nenhuma venda registrada</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
