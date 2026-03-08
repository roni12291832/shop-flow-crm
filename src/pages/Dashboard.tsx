import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Users,
  TrendingUp,
  DollarSign,
  Target,
  AlertTriangle,
  Clock,
  MessageSquare,
} from "lucide-react";
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

const COLORS = [
  "hsl(217, 91%, 60%)",
  "hsl(151, 55%, 42%)",
  "hsl(38, 92%, 50%)",
  "hsl(280, 65%, 60%)",
  "hsl(340, 75%, 55%)",
  "hsl(200, 70%, 50%)",
  "hsl(0, 70%, 55%)",
];

const STAGE_LABELS: Record<string, string> = {
  lead_recebido: "Lead Recebido",
  contato_iniciado: "Contato Iniciado",
  cliente_interessado: "Interessado",
  negociacao: "Negociação",
  proposta_enviada: "Proposta Enviada",
  venda_fechada: "Venda Fechada",
  perdido: "Perdido",
};

interface Metrics {
  totalClients: number;
  totalOpportunities: number;
  totalRevenue: number;
  conversionRate: number;
  pendingTasks: number;
  pipelineData: { name: string; value: number }[];
  originData: { name: string; value: number }[];
  monthlyData: { month: string; revenue: number; leads: number }[];
}

export default function Dashboard() {
  const { tenantId, profile } = useAuth();
  const [metrics, setMetrics] = useState<Metrics>({
    totalClients: 0,
    totalOpportunities: 0,
    totalRevenue: 0,
    conversionRate: 0,
    pendingTasks: 0,
    pipelineData: [],
    originData: [],
    monthlyData: [],
  });

  useEffect(() => {
    if (!tenantId) return;

    const fetchMetrics = async () => {
      const [clientsRes, oppsRes, tasksRes] = await Promise.all([
        supabase.from("clients").select("id, origin", { count: "exact" }).eq("tenant_id", tenantId),
        supabase.from("opportunities").select("id, stage, estimated_value").eq("tenant_id", tenantId),
        supabase.from("tasks").select("id, status").eq("tenant_id", tenantId).eq("status", "pendente"),
      ]);

      const clients = clientsRes.data || [];
      const opps = oppsRes.data || [];
      const pendingTasks = tasksRes.data?.length || 0;

      const closedDeals = opps.filter((o) => o.stage === "venda_fechada");
      const totalRevenue = closedDeals.reduce((sum, o) => sum + Number(o.estimated_value || 0), 0);
      const conversionRate = opps.length > 0 ? (closedDeals.length / opps.length) * 100 : 0;

      // Pipeline data
      const stageCounts: Record<string, number> = {};
      opps.forEach((o) => {
        stageCounts[o.stage] = (stageCounts[o.stage] || 0) + 1;
      });
      const pipelineData = Object.entries(stageCounts).map(([stage, count]) => ({
        name: STAGE_LABELS[stage] || stage,
        value: count,
      }));

      // Origin data
      const originCounts: Record<string, number> = {};
      clients.forEach((c) => {
        const origin = (c.origin as string) || "outro";
        originCounts[origin] = (originCounts[origin] || 0) + 1;
      });
      const originData = Object.entries(originCounts).map(([origin, count]) => ({
        name: origin,
        value: count,
      }));

      setMetrics({
        totalClients: clients.length,
        totalOpportunities: opps.length,
        totalRevenue,
        conversionRate,
        pendingTasks,
        pipelineData,
        originData,
        monthlyData: [
          { month: "Jan", revenue: 0, leads: 0 },
          { month: "Fev", revenue: 0, leads: 0 },
          { month: "Mar", revenue: totalRevenue, leads: clients.length },
        ],
      });
    };

    fetchMetrics();
  }, [tenantId]);

  const statCards = [
    {
      title: "Clientes",
      value: metrics.totalClients,
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Oportunidades",
      value: metrics.totalOpportunities,
      icon: Target,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      title: "Receita",
      value: `R$ ${metrics.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      title: "Conversão",
      value: `${metrics.conversionRate.toFixed(1)}%`,
      icon: TrendingUp,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Olá, {profile?.name?.split(" ")[0] || "Usuário"} 👋
        </h1>
        <p className="text-muted-foreground">Aqui está o resumo do seu negócio hoje.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="border-none shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alerts */}
      {metrics.pendingTasks > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <span className="text-sm font-medium">
              Você tem <strong>{metrics.pendingTasks} tarefas pendentes</strong> para hoje.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline de Vendas</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.pipelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={metrics.pipelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(217, 91%, 60%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Target className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhuma oportunidade cadastrada ainda</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Origin Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads por Origem</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.originData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={metrics.originData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {metrics.originData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhum cliente cadastrado ainda</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
