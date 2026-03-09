import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Users, TrendingUp, DollarSign, Target, AlertTriangle, Info, Clock, User, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BirthdayDashboardWidget } from "@/components/datas/BirthdayDashboardWidget";

const STAGE_LABELS: Record<string, string> = {
  lead_recebido: "Lead Recebido", contato_iniciado: "Contato Iniciado",
  cliente_interessado: "Interessado", negociacao: "Negociação",
  proposta_enviada: "Proposta Enviada", venda_fechada: "Venda Fechada", perdido: "Perdido",
};
const STAGE_COLORS: Record<string, string> = {
  lead_recebido: "hsl(var(--chart-1))", contato_iniciado: "hsl(var(--chart-4))",
  cliente_interessado: "hsl(var(--chart-4))", negociacao: "hsl(var(--chart-3))",
  proposta_enviada: "hsl(var(--chart-7))", venda_fechada: "hsl(var(--chart-2))",
  perdido: "hsl(var(--destructive))",
};
const PRIORITY_COLORS: Record<string, string> = {
  alta: "hsl(var(--destructive))", media: "hsl(var(--chart-3))", baixa: "hsl(var(--chart-1))",
};

const DATE_FILTERS = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "all", label: "Tudo" },
];

interface Metrics {
  totalClients: number; totalOpportunities: number; totalRevenue: number;
  conversionRate: number; pendingTasks: number;
  pipelineData: { stage: string; count: number; value: number; color: string }[];
  ranking: { name: string; points: number; sales: number; conversion: number; avatar: string }[];
  tasks: { title: string; client: string; due: string; priority: string; status: string }[];
  alerts: { type: string; text: string }[];
}

export default function Dashboard() {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const [dateFilter, setDateFilter] = useState("30d");
  const [metrics, setMetrics] = useState<Metrics>({
    totalClients: 0, totalOpportunities: 0, totalRevenue: 0, conversionRate: 0,
    pendingTasks: 0, pipelineData: [], ranking: [], tasks: [], alerts: [],
  });

  useEffect(() => {
    if (!tenantId) return;
    const fetchMetrics = async () => {
      const dateFrom = dateFilter === "all" ? undefined : new Date(Date.now() - (dateFilter === "7d" ? 7 : dateFilter === "30d" ? 30 : 90) * 86400000).toISOString();

      let oppsQuery = supabase.from("opportunities").select("id, stage, estimated_value, responsible_id, created_at").eq("tenant_id", tenantId);
      if (dateFrom) oppsQuery = oppsQuery.gte("created_at", dateFrom);

      const [clientsRes, oppsRes, tasksRes, profilesRes, completedTasksRes] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact" }).eq("tenant_id", tenantId),
        oppsQuery,
        supabase.from("tasks").select("id, title, status, due_date, client_id, priority").eq("tenant_id", tenantId).eq("status", "pendente").order("due_date", { ascending: true }).limit(4),
        supabase.from("profiles").select("user_id, name").eq("tenant_id", tenantId),
        supabase.from("tasks").select("responsible_id, status").eq("tenant_id", tenantId).eq("status", "concluido"),
      ]);

      const clients = clientsRes.data || []; const opps = oppsRes.data || [];
      const pendingTasks = tasksRes.data || []; const profiles = profilesRes.data || [];
      const completedTasks = completedTasksRes.data || [];

      const closedDeals = opps.filter((o) => o.stage === "venda_fechada");
      const totalRevenue = closedDeals.reduce((sum, o) => sum + Number(o.estimated_value || 0), 0);
      const conversionRate = opps.length > 0 ? (closedDeals.length / opps.length) * 100 : 0;

      const stageCounts: Record<string, { count: number; value: number }> = {};
      opps.forEach((o) => {
        if (!stageCounts[o.stage]) stageCounts[o.stage] = { count: 0, value: 0 };
        stageCounts[o.stage].count++; stageCounts[o.stage].value += Number(o.estimated_value || 0);
      });
      const pipelineData = Object.entries(stageCounts).map(([stage, data]) => ({
        stage: STAGE_LABELS[stage] || stage, count: data.count, value: data.value,
        color: STAGE_COLORS[stage] || "hsl(var(--muted-foreground))",
      }));

      const ranking = profiles.map((p) => {
        const userOpps = opps.filter((o) => o.responsible_id === p.user_id);
        const userClosed = userOpps.filter((o) => o.stage === "venda_fechada");
        const userCompletedTasks = completedTasks.filter((t) => t.responsible_id === p.user_id).length;
        const points = userClosed.length * 50 + userCompletedTasks * 10 + userOpps.length * 5;
        const conversion = userOpps.length > 0 ? (userClosed.length / userOpps.length) * 100 : 0;
        return { name: p.name, points, sales: userClosed.length, conversion: Math.round(conversion), avatar: p.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() };
      }).sort((a, b) => b.points - a.points).slice(0, 5);

      const clientIds = pendingTasks.map(t => t.client_id).filter(Boolean);
      let clientMap: Record<string, string> = {};
      if (clientIds.length > 0) {
        const { data: taskClients } = await supabase.from("clients").select("id, name").in("id", clientIds);
        (taskClients || []).forEach((c: any) => { clientMap[c.id] = c.name; });
      }
      const tasks = pendingTasks.map(t => ({
        title: t.title, client: t.client_id ? (clientMap[t.client_id] || "—") : "—",
        due: t.due_date ? new Date(t.due_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Sem prazo",
        priority: (t as any).priority || "media", status: t.status,
      }));

      const alerts: { type: string; text: string }[] = [];
      const noResponseLeads = opps.filter(o => o.stage === "lead_recebido").length;
      if (noResponseLeads > 0) alerts.push({ type: "warning", text: `${noResponseLeads} leads sem resposta` });
      if (pendingTasks.length > 0) alerts.push({ type: "info", text: `${pendingTasks.length} follow-ups pendentes para hoje` });

      setMetrics({ totalClients: clients.length, totalOpportunities: opps.length, totalRevenue, conversionRate, pendingTasks: pendingTasks.length, pipelineData, ranking, tasks, alerts });
    };
    fetchMetrics();
  }, [tenantId, dateFilter]);

  const statCards = [
    { label: "Leads no Mês", value: metrics.totalClients, sub: `${metrics.totalOpportunities} oportunidades`, color: "hsl(var(--chart-1))", icon: "◈" },
    { label: "Atendidos", value: metrics.totalOpportunities, sub: `${metrics.totalClients} clientes`, color: "hsl(var(--chart-4))", icon: "◎" },
    { label: "Vendas", value: metrics.pipelineData.find(p => p.stage === "Venda Fechada")?.count || 0, sub: "este mês", color: "hsl(var(--chart-2))", icon: "◆" },
    { label: "Receita", value: `R$${metrics.totalRevenue.toLocaleString("pt-BR")}`, sub: "total fechado", color: "hsl(var(--chart-3))", icon: "⬟" },
    { label: "Conversão", value: `${metrics.conversionRate.toFixed(1)}%`, sub: "leads → vendas", color: "hsl(var(--chart-7))", icon: "⬡" },
  ];

  const maxPipelineValue = Math.max(...metrics.pipelineData.map(s => s.value), 1);

  return (
    <div className="p-4 md:p-7 space-y-7 animate-fade-in">
      {/* Date filter */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {DATE_FILTERS.map(f => (
            <Button key={f.key} variant={dateFilter === f.key ? "default" : "outline"} size="sm" className="text-[12px]" onClick={() => setDateFilter(f.key)}>
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Alerts */}
      {metrics.alerts.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          {metrics.alerts.map((a, i) => (
            <div key={i} className={`flex-1 rounded-xl px-4 py-3 text-[13px] flex items-center gap-2.5 border ${
              a.type === "danger" ? "bg-destructive/10 border-destructive/40 text-destructive" :
              a.type === "warning" ? "bg-warning/10 border-warning/40 text-warning" :
              "bg-primary/10 border-primary/40 text-primary"
            }`}>
              {a.type === "warning" ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
              {a.text}
            </div>
          ))}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-2xl p-4 md:p-6 relative overflow-hidden">
            <div className="absolute -top-5 -right-5 w-20 h-20 rounded-full opacity-10" style={{ background: stat.color }} />
            <span className="text-[22px] md:text-[26px] mb-1 block">{stat.icon}</span>
            <span className="text-muted-foreground text-[11px] md:text-[12px] tracking-wider uppercase">{stat.label}</span>
            <div className="text-xl md:text-[32px] font-extrabold mt-1 font-serif">{stat.value}</div>
            {stat.sub && <span className="text-[11px] md:text-[12px]" style={{ color: stat.color }}>{stat.sub}</span>}
          </div>
        ))}
      </div>

      {/* Pipeline + Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="text-foreground font-bold text-base mb-5">Pipeline de Vendas</div>
          {metrics.pipelineData.length > 0 ? metrics.pipelineData.map((stage, i) => {
            const pct = (stage.value / maxPipelineValue) * 100;
            return (
              <div key={i} className="mb-3.5">
                <div className="flex justify-between mb-1.5">
                  <span className="text-muted-foreground text-[13px]">{stage.stage}</span>
                  <div className="flex gap-4">
                    <span className="text-muted-foreground text-[12px]">{stage.count} deals</span>
                    <span className="text-[12px] font-semibold" style={{ color: stage.color }}>R${stage.value.toLocaleString("pt-BR")}</span>
                  </div>
                </div>
                <div className="bg-border rounded h-1.5">
                  <div className="h-1.5 rounded transition-all duration-700" style={{ width: `${pct}%`, background: stage.color }} />
                </div>
              </div>
            );
          }) : (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              <div className="text-center"><Target className="h-10 w-10 mx-auto mb-2 opacity-40" /><p>Nenhuma oportunidade ainda</p></div>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="text-foreground font-bold text-base mb-5">🏆 Ranking do Mês</div>
          {metrics.ranking.length > 0 ? metrics.ranking.map((v, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5" style={{ borderBottom: i < metrics.ranking.length - 1 ? "1px solid hsl(var(--border))" : "none" }}>
              <span className="font-extrabold text-[15px] w-5 text-center">
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
              </span>
              <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-[11px] font-bold text-white">{v.avatar}</div>
              <div className="flex-1">
                <div className="text-foreground text-[13px] font-semibold">{v.name}</div>
                <div className="text-muted-foreground text-[11px]">{v.sales} vendas · {v.conversion}% conv.</div>
              </div>
              <span className={`font-bold text-sm ${i === 0 ? "text-warning" : "text-primary"}`}>{v.points}pts</span>
            </div>
          )) : (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Nenhum vendedor registrado</div>
          )}
        </div>
      </div>

      {/* Birthday Widget + Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-5">
        <BirthdayDashboardWidget />

      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex justify-between mb-5">
          <span className="text-foreground font-bold text-base">Tarefas de Hoje</span>
          <button onClick={() => navigate("/tasks")} className="text-primary text-[13px] hover:underline">Ver todas →</button>
        </div>
        {metrics.tasks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {metrics.tasks.map((t, i) => {
              const pColor = PRIORITY_COLORS[t.priority] || "hsl(var(--muted-foreground))";
              return (
                <div key={i} className="bg-background border border-border rounded-xl p-3.5" style={{ borderLeft: `3px solid ${pColor}` }}>
                  <div className="text-foreground text-[13px] font-semibold mb-1.5">{t.title}</div>
                  <div className="text-muted-foreground text-[11px] mb-2 flex items-center gap-1"><User className="h-3 w-3" /> {t.client}</div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-[11px] flex items-center gap-1"><Clock className="h-3 w-3" /> {t.due}</span>
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full" style={{ background: pColor + "22", color: pColor }}>{t.priority}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8 text-sm">Nenhuma tarefa pendente 🎉</div>
        )}
      </div>
    </div>
  );
}
