import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function NpsDashboardWidget() {
    const navigate = useNavigate();
  const [nps, setNps] = useState<number | null>(null);
  const [prevNps, setPrevNps] = useState<number | null>(null);
  const [recentDetractors, setRecentDetractors] = useState(0);

  useEffect(() => {
        const fetch = async () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000).toISOString();
      const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString();

      const [currentRes, prevRes, detRes] = await Promise.all([
        supabase.from("nps_surveys").select("score, category").eq("status", "responded").gte("responded_at", thirtyDaysAgo),
        supabase.from("nps_surveys").select("score, category").eq("status", "responded").gte("responded_at", sixtyDaysAgo).lt("responded_at", thirtyDaysAgo),
        supabase.from("nps_surveys").select("id", { count: "exact" }).eq("category", "detrator").gte("responded_at", threeDaysAgo),
      ]);

      const calcNps = (data: any[]) => {
        if (!data || data.length === 0) return null;
        const promotors = data.filter(d => d.category === "promotor").length;
        const detractors = data.filter(d => d.category === "detrator").length;
        return Math.round(((promotors - detractors) / data.length) * 100);
      };

      setNps(calcNps(currentRes.data || []));
      setPrevNps(calcNps(prevRes.data || []));
      setRecentDetractors(detRes.count || 0);
    };
    fetch();
  }, []);

  const getColor = () => {
    if (nps === null) return "text-muted-foreground";
    if (nps < 0) return "text-destructive";
    if (nps < 30) return "text-warning";
    if (nps < 70) return "text-accent";
    return "text-chart-6";
  };

  const diff = nps !== null && prevNps !== null ? nps - prevNps : null;

  return (
    <div className="bg-card border border-border rounded-2xl p-6 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/nps")}>
      <div className="text-foreground font-bold text-base mb-3">📊 NPS da Loja</div>
      {nps !== null ? (
        <>
          <div className={`text-3xl font-extrabold ${getColor()}`}>
            {nps > 0 ? `+${nps}` : nps}
          </div>
          {diff !== null && (
            <div className="flex items-center gap-1 mt-1 text-xs">
              {diff >= 0 ? <TrendingUp className="h-3 w-3 text-accent" /> : <TrendingDown className="h-3 w-3 text-destructive" />}
              <span className={diff >= 0 ? "text-accent" : "text-destructive"}>
                {diff >= 0 ? "+" : ""}{diff} pontos vs mês anterior
              </span>
            </div>
          )}
          {recentDetractors > 0 && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-destructive">
              <AlertTriangle className="h-3 w-3" />
              {recentDetractors} detrator(es) nos últimos 3 dias
            </div>
          )}
        </>
      ) : (
        <div className="text-muted-foreground text-sm">Sem dados ainda</div>
      )}
      <span className="text-primary text-xs mt-2 block">Ver detalhes →</span>
    </div>
  );
}
