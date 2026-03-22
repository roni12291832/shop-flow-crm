import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Trophy, TrendingUp, Medal } from "lucide-react";

interface RankEntry {
  userId: string;
  name: string;
  avatar: string;
  totalSales: number;
  salesCount: number;
  closedDeals: number;
  conversionRate: number;
  points: number;
}

export function SellerRanking() {
  const {  user } = useAuth();
  const [ranking, setRanking] = useState<RankEntry[]>([]);
  const [myPosition, setMyPosition] = useState(0);
  const [period, setPeriod] = useState<"month" | "all">("month");

  useEffect(() => {
    if (!user) return;

    const fetchRanking = async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      let salesQuery = supabase.from("sales_entries")
        .select("user_id, value")
        
        .eq("status", "confirmado");

      if (period === "month") {
        salesQuery = salesQuery.gte("sold_at", startOfMonth);
      }

      let oppsQuery = supabase.from("opportunities")
        .select("responsible_id, stage, estimated_value")
        ;

      if (period === "month") {
        oppsQuery = oppsQuery.gte("created_at", startOfMonth);
      }

      const [{ data: sales }, { data: profiles }, { data: opps }, { data: tasks }] = await Promise.all([
        salesQuery,
        supabase.from("profiles").select("user_id, name"),
        oppsQuery,
        supabase.from("tasks").select("responsible_id, status").eq("status", "concluido"),
      ]);

      const profileMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p.name; });

      const salesTotals: Record<string, { total: number; count: number }> = {};
      (sales || []).forEach((s: any) => {
        if (!salesTotals[s.user_id]) salesTotals[s.user_id] = { total: 0, count: 0 };
        salesTotals[s.user_id].total += Number(s.value);
        salesTotals[s.user_id].count++;
      });

      const rankList: RankEntry[] = (profiles || []).map((p: any) => {
        const userOpps = (opps || []).filter((o: any) => o.responsible_id === p.user_id);
        const closed = userOpps.filter((o: any) => o.stage === "venda_fechada");
        const conv = userOpps.length > 0 ? (closed.length / userOpps.length) * 100 : 0;
        const completedTasks = (tasks || []).filter((t: any) => t.responsible_id === p.user_id).length;
        const salesInfo = salesTotals[p.user_id] || { total: 0, count: 0 };
        const points = closed.length * 50 + completedTasks * 10 + userOpps.length * 5 + salesInfo.count * 20;

        return {
          userId: p.user_id,
          name: p.name,
          avatar: p.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase(),
          totalSales: salesInfo.total,
          salesCount: salesInfo.count,
          closedDeals: closed.length,
          conversionRate: Math.round(conv),
          points,
        };
      }).sort((a, b) => b.points - a.points);

      setRanking(rankList);
      const pos = rankList.findIndex(r => r.userId === user.id);
      setMyPosition(pos >= 0 ? pos + 1 : 0);
    };

    fetchRanking();
  }, [user, period]);

  const medals = ["🥇", "🥈", "🥉"];
  const podium = ranking.slice(0, 3);
  const podiumOrder = podium.length >= 3 ? [podium[1], podium[0], podium[2]] : podium;
  const heights = ["h-28", "h-36", "h-24"];

  return (
    <div className="px-5 pt-8 pb-4 space-y-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Ranking</h1>
        </div>
        {myPosition > 0 && (
          <span className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">
            Você: {myPosition}º lugar
          </span>
        )}
      </div>

      {/* Period toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setPeriod("month")}
          className={`flex-1 py-2 text-sm font-medium rounded-xl transition-all ${
            period === "month"
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-muted-foreground"
          }`}
        >
          Este Mês
        </button>
        <button
          onClick={() => setPeriod("all")}
          className={`flex-1 py-2 text-sm font-medium rounded-xl transition-all ${
            period === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-muted-foreground"
          }`}
        >
          Geral
        </button>
      </div>

      {/* Podium */}
      {podium.length >= 3 && (
        <div className="flex items-end justify-center gap-3 pt-4">
          {podiumOrder.map((v, i) => {
            const isMe = v.userId === user?.id;
            return (
              <div key={v.userId} className="flex flex-col items-center flex-1">
                <span className="text-2xl mb-1">{medals[i]}</span>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground ${
                  isMe ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
                } gradient-primary`}>
                  {v.avatar}
                </div>
                <p className="text-xs font-semibold text-foreground mt-1 text-center truncate w-full">{v.name.split(" ")[0]}</p>
                <p className="text-[10px] text-muted-foreground">{v.points}pts</p>
                <div className={`w-full ${heights[i]} bg-primary/10 rounded-t-xl mt-2 flex items-end justify-center pb-2 border border-primary/20`}>
                  <span className="text-xs font-bold text-primary">
                    R$ {v.totalSales.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full ranking list */}
      <div className="space-y-2">
        {ranking.map((r, i) => {
          const isMe = r.userId === user?.id;
          return (
            <div
              key={r.userId}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                isMe ? "bg-primary/5 border-primary/30 shadow-sm" : "bg-card border-border"
              }`}
            >
              <span className={`text-sm font-bold w-7 text-center ${
                i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-amber-600" : "text-muted-foreground"
              }`}>
                {i < 3 ? medals[i] : `${i + 1}º`}
              </span>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground gradient-primary ${
                isMe ? "ring-2 ring-primary" : ""
              }`}>
                {r.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {r.name} {isMe && <span className="text-primary text-[10px]">(você)</span>}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {r.salesCount} vendas · {r.conversionRate}% conv.
                </p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${i === 0 ? "text-yellow-500" : "text-foreground"}`}>{r.points}pts</p>
                <p className="text-[10px] text-muted-foreground">
                  R$ {r.totalSales.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          );
        })}
        {ranking.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Trophy className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhum vendedor registrado</p>
          </div>
        )}
      </div>
    </div>
  );
}
