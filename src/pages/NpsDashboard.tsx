import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { NpsGauge } from "@/components/nps/NpsGauge";
import { NpsDistributionChart } from "@/components/nps/NpsDistributionChart";
import { NpsEvolutionChart } from "@/components/nps/NpsEvolutionChart";
import { NpsFeedCard } from "@/components/nps/NpsFeedCard";
import { Settings, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PERIOD_FILTERS = [
  { key: "7d", label: "7 dias", days: 7 },
  { key: "30d", label: "30 dias", days: 30 },
  { key: "3m", label: "3 meses", days: 90 },
  { key: "6m", label: "6 meses", days: 180 },
  { key: "1y", label: "1 ano", days: 365 },
];

const CATEGORY_FILTERS = ["Todos", "Promotores", "Neutros", "Detratores"];

export default function NpsDashboard() {
  const { tenantId, hasRole } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState("30d");
  const [catFilter, setCatFilter] = useState("Todos");
  const [surveys, setSurveys] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Record<string, any>>({});
  const [evolution, setEvolution] = useState<{ month: string; nps: number }[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    const fetchData = async () => {
      const days = PERIOD_FILTERS.find(p => p.key === period)?.days || 30;
      const from = new Date(Date.now() - days * 86400000).toISOString();

      const { data: surveyData } = await supabase
        .from("nps_surveys")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("status", "responded")
        .gte("responded_at", from)
        .order("responded_at", { ascending: false });

      setSurveys(surveyData || []);

      // Fetch customers
      const ids = [...new Set((surveyData || []).map(s => s.customer_id))];
      if (ids.length > 0) {
        const { data: clientData } = await supabase
          .from("clients")
          .select("id, name, phone")
          .in("id", ids);
        const map: Record<string, any> = {};
        (clientData || []).forEach(c => { map[c.id] = c; });
        setCustomers(map);
      }

      // Evolution - last 6 months
      const sixMonths = new Date(Date.now() - 180 * 86400000).toISOString();
      const { data: evoData } = await supabase
        .from("nps_surveys")
        .select("responded_at, category")
        .eq("tenant_id", tenantId)
        .eq("status", "responded")
        .gte("responded_at", sixMonths)
        .order("responded_at", { ascending: true });

      if (evoData && evoData.length > 0) {
        const byMonth: Record<string, any[]> = {};
        evoData.forEach(s => {
          const month = new Date(s.responded_at!).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
          if (!byMonth[month]) byMonth[month] = [];
          byMonth[month].push(s);
        });
        const evo = Object.entries(byMonth).map(([month, items]) => {
          const promotors = items.filter(i => i.category === "promotor").length;
          const detractors = items.filter(i => i.category === "detrator").length;
          const nps = Math.round(((promotors - detractors) / items.length) * 100);
          return { month, nps };
        });
        setEvolution(evo);
      }
    };
    fetchData();
  }, [tenantId, period]);

  const total = surveys.length;
  const promotors = surveys.filter(s => s.category === "promotor").length;
  const neutros = surveys.filter(s => s.category === "neutro").length;
  const detractors = surveys.filter(s => s.category === "detrator").length;
  const npsScore = total > 0 ? Math.round(((promotors - detractors) / total) * 100) : 0;

  const distribution = Array.from({ length: 11 }, (_, i) => surveys.filter(s => s.score === i).length);

  const catMap: Record<string, string | undefined> = { "Promotores": "promotor", "Neutros": "neutro", "Detratores": "detrator" };
  const filteredFeed = catFilter === "Todos" ? surveys : surveys.filter(s => s.category === catMap[catFilter]);

  return (
    <div className="p-4 md:p-7 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl md:text-2xl font-bold text-foreground">NPS & Avaliações</h1>
        <div className="flex gap-2">
          {PERIOD_FILTERS.map(f => (
            <Button key={f.key} size="sm" variant={period === f.key ? "default" : "outline"} className="text-xs" onClick={() => setPeriod(f.key)}>
              {f.label}
            </Button>
          ))}
          {hasRole("admin") && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate("/nps/configurar")}>
              <Settings className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* NPS Gauge + Category Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
        <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center justify-center">
          <NpsGauge score={npsScore} />
          <div className="text-muted-foreground text-xs mt-2">{total} avaliações no período</div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-2xl p-5 text-center">
            <div className="text-3xl font-extrabold text-accent">{total > 0 ? Math.round((promotors / total) * 100) : 0}%</div>
            <div className="text-xs text-muted-foreground mt-1">Promotores</div>
            <div className="text-sm text-accent font-semibold">{promotors}</div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5 text-center">
            <div className="text-3xl font-extrabold text-warning">{total > 0 ? Math.round((neutros / total) * 100) : 0}%</div>
            <div className="text-xs text-muted-foreground mt-1">Neutros</div>
            <div className="text-sm text-warning font-semibold">{neutros}</div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5 text-center">
            <div className="text-3xl font-extrabold text-destructive">{total > 0 ? Math.round((detractors / total) * 100) : 0}%</div>
            <div className="text-xs text-muted-foreground mt-1">Detratores</div>
            <div className="text-sm text-destructive font-semibold">{detractors}</div>
          </div>
        </div>
      </div>

      {/* Distribution + Evolution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-card border border-border rounded-2xl p-6">
          <NpsDistributionChart distribution={distribution} />
        </div>
        <div className="bg-card border border-border rounded-2xl p-6">
          <NpsEvolutionChart data={evolution} />
        </div>
      </div>

      {/* Feed */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <span className="text-foreground font-bold text-base">Respostas Recentes</span>
          <div className="flex gap-1">
            {CATEGORY_FILTERS.map(c => (
              <Button key={c} size="sm" variant={catFilter === c ? "default" : "outline"} className="text-xs" onClick={() => setCatFilter(c)}>
                {c}
              </Button>
            ))}
          </div>
        </div>
        {filteredFeed.length > 0 ? (
          <div className="space-y-3">
            {filteredFeed.slice(0, 20).map(s => {
              const customer = customers[s.customer_id];
              return (
                <NpsFeedCard
                  key={s.id}
                  customerName={customer?.name || "Cliente"}
                  score={s.score}
                  comment={s.comment}
                  respondedAt={s.responded_at}
                  category={s.category}
                  phone={customer?.phone || null}
                  isNew={new Date(s.responded_at).getTime() > Date.now() - 86400000}
                />
              );
            })}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8 text-sm">Nenhuma avaliação recebida no período</div>
        )}
      </div>
    </div>
  );
}
