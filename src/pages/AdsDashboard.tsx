import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, Area, AreaChart,
} from "recharts";
import {
  Megaphone, TrendingUp, MousePointerClick, DollarSign, Target,
  Eye, BarChart3, Download, CalendarDays, Users, RefreshCw,
} from "lucide-react";
import { format, subDays, subWeeks, subMonths, startOfWeek, endOfWeek, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const COLORS = ["hsl(239, 84%, 67%)", "hsl(160, 84%, 39%)", "hsl(38, 92%, 50%)", "hsl(280, 65%, 60%)", "hsl(340, 75%, 55%)", "hsl(200, 70%, 50%)"];

interface Campaign {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  budget_daily: number;
  platform: string;
}

interface DailyMetric {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversion_value: number;
  ctr: number;
  cpc: number;
  roas: number;
  reach: number;
  campaign_name: string;
  campaign_id: string;
  platform: string;
}

type DateRange = "7d" | "14d" | "30d" | "90d";
type Platform = "all" | "google" | "meta";

export default function AdsDashboard() {
    const [metrics, setMetrics] = useState<DailyMetric[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [platform, setPlatform] = useState<Platform>("all");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "campaigns" | "evolution">("overview");

  const getDateFrom = () => {
    const now = new Date();
    if (dateRange === "7d") return subDays(now, 7);
    if (dateRange === "14d") return subWeeks(now, 2);
    if (dateRange === "30d") return subMonths(now, 1);
    return subMonths(now, 3);
  };

  useEffect(() => {
        const fetchData = async () => {
      setLoading(true);
      const dateFrom = format(getDateFrom(), "yyyy-MM-dd");

      // Fetch campaigns with their account info
      const { data: campaignsData } = await supabase
        .from("ad_campaigns")
        .select("id, name, status, objective, budget_daily, ad_account_id")
        ;

      const { data: accountsData } = await supabase
        .from("ad_accounts")
        .select("id, platform")
        ;

      const accountMap: Record<string, string> = {};
      (accountsData || []).forEach((a: any) => { accountMap[a.id] = a.platform; });

      const camps: Campaign[] = ((campaignsData as any[]) || []).map((c: any) => ({
        ...c,
        platform: accountMap[c.ad_account_id] || "unknown",
      }));
      setCampaigns(camps);

      // Fetch metrics
      const { data: metricsData } = await supabase
        .from("ad_metrics")
        .select("*")
        
        .gte("date", dateFrom)
        .order("date", { ascending: true });

      const campaignMap: Record<string, Campaign> = {};
      camps.forEach(c => { campaignMap[c.id] = c; });

      const enrichedMetrics: DailyMetric[] = ((metricsData as any[]) || []).map((m: any) => ({
        ...m,
        campaign_name: campaignMap[m.campaign_id]?.name || "Campanha",
        platform: campaignMap[m.campaign_id]?.platform || "unknown",
      }));

      setMetrics(enrichedMetrics);
      setLoading(false);
    };
    fetchData();
  }, [dateRange]);

  // Filter by platform
  const filteredMetrics = platform === "all" ? metrics : metrics.filter(m => m.platform === platform);

  // Aggregate KPIs
  const totalSpend = filteredMetrics.reduce((s, m) => s + Number(m.spend || 0), 0);
  const totalImpressions = filteredMetrics.reduce((s, m) => s + Number(m.impressions || 0), 0);
  const totalClicks = filteredMetrics.reduce((s, m) => s + Number(m.clicks || 0), 0);
  const totalConversions = filteredMetrics.reduce((s, m) => s + Number(m.conversions || 0), 0);
  const totalConversionValue = filteredMetrics.reduce((s, m) => s + Number(m.conversion_value || 0), 0);
  const totalReach = filteredMetrics.reduce((s, m) => s + Number(m.reach || 0), 0);
  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const overallROAS = totalSpend > 0 ? totalConversionValue / totalSpend : 0;

  // Daily aggregate
  const dailyMap: Record<string, { date: string; spend: number; impressions: number; clicks: number; conversions: number; conversion_value: number }> = {};
  filteredMetrics.forEach(m => {
    const d = m.date;
    if (!dailyMap[d]) dailyMap[d] = { date: d, spend: 0, impressions: 0, clicks: 0, conversions: 0, conversion_value: 0 };
    dailyMap[d].spend += Number(m.spend || 0);
    dailyMap[d].impressions += Number(m.impressions || 0);
    dailyMap[d].clicks += Number(m.clicks || 0);
    dailyMap[d].conversions += Number(m.conversions || 0);
    dailyMap[d].conversion_value += Number(m.conversion_value || 0);
  });
  const dailyData = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
    ...d,
    dateLabel: format(parseISO(d.date), "dd/MM"),
    ctr: d.impressions > 0 ? ((d.clicks / d.impressions) * 100) : 0,
    roas: d.spend > 0 ? d.conversion_value / d.spend : 0,
  }));

  // Campaign aggregate
  const campaignAgg: Record<string, { name: string; platform: string; spend: number; impressions: number; clicks: number; conversions: number; conversion_value: number; ctr: number; cpc: number; roas: number }> = {};
  filteredMetrics.forEach(m => {
    const key = m.campaign_id;
    if (!campaignAgg[key]) campaignAgg[key] = { name: m.campaign_name, platform: m.platform, spend: 0, impressions: 0, clicks: 0, conversions: 0, conversion_value: 0, ctr: 0, cpc: 0, roas: 0 };
    campaignAgg[key].spend += Number(m.spend || 0);
    campaignAgg[key].impressions += Number(m.impressions || 0);
    campaignAgg[key].clicks += Number(m.clicks || 0);
    campaignAgg[key].conversions += Number(m.conversions || 0);
    campaignAgg[key].conversion_value += Number(m.conversion_value || 0);
  });
  const campaignData = Object.values(campaignAgg).map(c => ({
    ...c,
    ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
    cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
    roas: c.spend > 0 ? c.conversion_value / c.spend : 0,
  })).sort((a, b) => b.spend - a.spend);

  // Platform breakdown for pie chart
  const platformAgg: Record<string, number> = {};
  filteredMetrics.forEach(m => {
    const p = m.platform === "google" ? "Google Ads" : m.platform === "meta" ? "Meta Ads" : "Outro";
    platformAgg[p] = (platformAgg[p] || 0) + Number(m.spend || 0);
  });
  const platformData = Object.entries(platformAgg).map(([name, value]) => ({ name, value }));

  const exportCSV = () => {
    if (!campaignData.length) return;
    const headers = "Campanha,Plataforma,Investimento,Impressões,Cliques,CTR,CPC,Conversões,Valor Conversões,ROAS";
    const rows = campaignData.map(c =>
      `"${c.name}",${c.platform},${c.spend.toFixed(2)},${c.impressions},${c.clicks},${c.ctr.toFixed(2)}%,${c.cpc.toFixed(2)},${c.conversions},${c.conversion_value.toFixed(2)},${c.roas.toFixed(2)}`
    ).join("\n");
    const blob = new Blob([`${headers}\n${rows}`], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "relatorio-anuncios.csv"; a.click();
  };

  const kpiCards = [
    { label: "Investimento", value: `R$ ${totalSpend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "hsl(var(--chart-1))" },
    { label: "Impressões", value: totalImpressions.toLocaleString("pt-BR"), icon: Eye, color: "hsl(var(--chart-4))" },
    { label: "Cliques", value: totalClicks.toLocaleString("pt-BR"), icon: MousePointerClick, color: "hsl(var(--chart-2))" },
    { label: "CTR", value: `${avgCTR.toFixed(2)}%`, icon: TrendingUp, color: "hsl(var(--chart-3))" },
    { label: "CPC Médio", value: `R$ ${avgCPC.toFixed(2)}`, icon: DollarSign, color: "hsl(var(--chart-7))" },
    { label: "Conversões", value: totalConversions.toLocaleString("pt-BR"), icon: Target, color: "hsl(var(--chart-2))" },
    { label: "Receita Ads", value: `R$ ${totalConversionValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "hsl(160, 84%, 39%)" },
    { label: "ROAS", value: `${overallROAS.toFixed(2)}x`, icon: BarChart3, color: overallROAS >= 3 ? "hsl(160, 84%, 39%)" : overallROAS >= 1 ? "hsl(38, 92%, 50%)" : "hsl(var(--destructive))" },
  ];

  const dateRanges: { key: DateRange; label: string }[] = [
    { key: "7d", label: "7 dias" },
    { key: "14d", label: "14 dias" },
    { key: "30d", label: "30 dias" },
    { key: "90d", label: "90 dias" },
  ];

  const tabs = [
    { key: "overview" as const, label: "Visão Geral", icon: BarChart3 },
    { key: "campaigns" as const, label: "Campanhas", icon: Megaphone },
    { key: "evolution" as const, label: "Evolução", icon: TrendingUp },
  ];

  return (
    <div className="p-4 md:p-7 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" /> Dashboard de Anúncios
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Google Ads & Meta Ads</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1">
          {dateRanges.map(dr => (
            <button key={dr.key} onClick={() => setDateRange(dr.key)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                dateRange === dr.key ? "bg-primary/20 text-primary border-primary/40" : "bg-card text-muted-foreground border-border hover:bg-secondary"
              )}>{dr.label}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {([
            { key: "all" as const, label: "Todas" },
            { key: "google" as const, label: "Google" },
            { key: "meta" as const, label: "Meta" },
          ]).map(p => (
            <button key={p.key} onClick={() => setPlatform(p.key)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                platform === p.key ? "bg-primary/20 text-primary border-primary/40" : "bg-card text-muted-foreground border-border hover:bg-secondary"
              )}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiCards.map(kpi => (
          <div key={kpi.label} className="bg-card border border-border rounded-2xl p-4 relative overflow-hidden">
            <div className="absolute -top-5 -right-5 w-16 h-16 rounded-full opacity-10" style={{ background: kpi.color }} />
            <kpi.icon className="h-4 w-4 mb-1 opacity-50" style={{ color: kpi.color }} />
            <p className="text-muted-foreground text-[11px] uppercase tracking-wide">{kpi.label}</p>
            <p className="text-lg font-bold text-foreground mt-0.5">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={cn("px-4 py-2 rounded-[10px] text-[13px] font-semibold transition-all border flex items-center gap-1.5",
              activeTab === t.key ? "bg-primary/20 text-primary border-primary/40" : "bg-card text-muted-foreground border-border hover:bg-secondary"
            )}><t.icon className="h-3.5 w-3.5" />{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filteredMetrics.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <Megaphone className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <h3 className="text-foreground font-bold mb-1">Nenhum dado de anúncios</h3>
          <p className="text-sm text-muted-foreground mb-4">Configure suas contas de anúncios nas Configurações para começar a sincronizar dados.</p>
          <p className="text-xs text-muted-foreground">Vá em <strong>Config → Anúncios</strong> para conectar Google Ads e Meta Ads.</p>
        </div>
      ) : (
        <>
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
              {/* Daily spend chart */}
              <div className="bg-card border border-border rounded-2xl p-6">
                <h3 className="text-foreground font-bold text-base mb-5">Investimento Diário</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="dateLabel" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                    <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={v => `R$${v}`} />
                    <Tooltip
                      formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, color: "hsl(var(--foreground))" }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Area type="monotone" dataKey="spend" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.15} strokeWidth={2} name="Investimento" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Platform breakdown */}
              <div className="bg-card border border-border rounded-2xl p-6">
                <h3 className="text-foreground font-bold text-base mb-5">Distribuição por Plataforma</h3>
                {platformData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={platformData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {platformData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, color: "hsl(var(--foreground))" }}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                          itemStyle={{ color: "hsl(var(--foreground))" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 mt-2">
                      {platformData.map((p, i) => (
                        <div key={p.name} className="flex items-center justify-between px-2">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                            <span className="text-sm text-foreground">{p.name}</span>
                          </div>
                          <span className="text-sm font-semibold">R$ {p.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">Sem dados</div>
                )}
              </div>
            </div>
          )}

          {/* Campaigns Tab */}
          {activeTab === "campaigns" && (
            <div className="space-y-5">
              {/* Campaign bar chart */}
              <div className="bg-card border border-border rounded-2xl p-6">
                <h3 className="text-foreground font-bold text-base mb-5">Performance por Campanha</h3>
                <ResponsiveContainer width="100%" height={Math.max(200, campaignData.length * 50)}>
                  <BarChart data={campaignData.slice(0, 10)} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" tickFormatter={v => `R$${v}`} />
                    <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" width={150} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, color: "hsl(var(--foreground))" }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Bar dataKey="spend" fill="hsl(var(--chart-1))" radius={[0, 6, 6, 0]} name="Investimento" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Campaign table */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                  <h3 className="text-foreground font-bold text-sm">Detalhamento por Campanha</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/30">
                        <th className="px-4 py-3 text-left text-muted-foreground font-medium">Campanha</th>
                        <th className="px-4 py-3 text-center text-muted-foreground font-medium">Plataforma</th>
                        <th className="px-4 py-3 text-right text-muted-foreground font-medium">Invest.</th>
                        <th className="px-4 py-3 text-right text-muted-foreground font-medium">Impr.</th>
                        <th className="px-4 py-3 text-right text-muted-foreground font-medium">Cliques</th>
                        <th className="px-4 py-3 text-right text-muted-foreground font-medium">CTR</th>
                        <th className="px-4 py-3 text-right text-muted-foreground font-medium">CPC</th>
                        <th className="px-4 py-3 text-right text-muted-foreground font-medium">Conv.</th>
                        <th className="px-4 py-3 text-right text-muted-foreground font-medium">ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignData.map((c, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">{c.name}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="outline" className={cn("text-[10px]",
                              c.platform === "google" ? "border-blue-400 text-blue-500" : "border-blue-600 text-blue-600"
                            )}>{c.platform === "google" ? "Google" : "Meta"}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right text-foreground">R$ {c.spend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{c.impressions.toLocaleString("pt-BR")}</td>
                          <td className="px-4 py-3 text-right text-foreground">{c.clicks.toLocaleString("pt-BR")}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{c.ctr.toFixed(2)}%</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">R$ {c.cpc.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-foreground">{c.conversions}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={cn("font-bold", c.roas >= 3 ? "text-green-500" : c.roas >= 1 ? "text-yellow-500" : "text-destructive")}>
                              {c.roas.toFixed(2)}x
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Evolution Tab */}
          {activeTab === "evolution" && (
            <div className="space-y-5">
              <div className="bg-card border border-border rounded-2xl p-6">
                <h3 className="text-foreground font-bold text-base mb-5">Evolução de Cliques e Conversões</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="dateLabel" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip 
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, color: "hsl(var(--foreground))" }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="clicks" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 2 }} name="Cliques" />
                    <Line type="monotone" dataKey="conversions" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 2 }} name="Conversões" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-card border border-border rounded-2xl p-6">
                <h3 className="text-foreground font-bold text-base mb-5">Evolução do ROAS</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="dateLabel" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                    <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={v => `${v}x`} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(2)}x`}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, color: "hsl(var(--foreground))" }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Area type="monotone" dataKey="roas" stroke="hsl(160, 84%, 39%)" fill="hsl(160, 84%, 39%)" fillOpacity={0.1} strokeWidth={2} name="ROAS" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-card border border-border rounded-2xl p-6">
                <h3 className="text-foreground font-bold text-base mb-5">CTR Diário</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="dateLabel" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                    <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={v => `${v}%`} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, color: "hsl(var(--foreground))" }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Line type="monotone" dataKey="ctr" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 2 }} name="CTR" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
