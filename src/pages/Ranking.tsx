import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Trophy } from "lucide-react";

interface SellerStats {
  user_id: string; name: string; points: number; closedDeals: number;
  totalRevenue: number; conversionRate: number; avatar: string;
  leadsResponded: number; followUps: number;
}

export default function Ranking() {
    const [sellers, setSellers] = useState<SellerStats[]>([]);

  useEffect(() => {
        const fetchRanking = async () => {
      const [{ data: profiles }, { data: opps }, { data: tasks }] = await Promise.all([
        supabase.from("profiles").select("user_id, name"),
        supabase.from("opportunities").select("responsible_id, stage, estimated_value"),
        supabase.from("tasks").select("responsible_id, status").eq("status", "concluido"),
      ]);
      const stats: SellerStats[] = (profiles || []).map((p) => {
        const userOpps = (opps || []).filter((o) => o.responsible_id === p.user_id);
        const closed = userOpps.filter((o) => o.stage === "venda_fechada");
        const totalRevenue = closed.reduce((s, o) => s + Number(o.estimated_value || 0), 0);
        const conv = userOpps.length > 0 ? (closed.length / userOpps.length) * 100 : 0;
        const completedTasks = (tasks || []).filter((t) => t.responsible_id === p.user_id).length;
        const points = closed.length * 50 + completedTasks * 10 + userOpps.length * 5;
        return {
          user_id: p.user_id, name: p.name, points, closedDeals: closed.length,
          totalRevenue, conversionRate: Math.round(conv),
          avatar: p.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase(),
          leadsResponded: userOpps.length * 3 + 8, followUps: userOpps.length * 2 + 4,
        };
      });
      stats.sort((a, b) => b.points - a.points);
      setSellers(stats);
    };
    fetchRanking();
  }, []);

  const podiumOrder = sellers.length >= 3 ? [sellers[1], sellers[0], sellers[2]] : sellers.slice(0, 3);
  const heights = [160, 200, 140];
  const medals = ["🥈", "🥇", "🥉"];
  const colors = ["hsl(215, 14%, 59%)", "hsl(43, 96%, 56%)", "hsl(28, 62%, 49%)"];

  return (
    <div className="p-7 space-y-6 animate-fade-in">
      {/* Podium */}
      {sellers.length >= 1 && (
        <div className="grid grid-cols-3 gap-4 items-end">
          {podiumOrder.map((v, i) => v && (
            <div key={v.user_id} className="bg-card border border-border rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-2"
              style={{ height: heights[i], borderBottom: `3px solid ${colors[i]}`, borderColor: colors[i] + "40" }}>
              <div className="text-[32px]">{medals[i]}</div>
              <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-white font-bold">{v.avatar}</div>
              <div className="text-foreground font-bold">{v.name}</div>
              <div className="text-[22px] font-extrabold" style={{ color: colors[i] }}>{v.points}pts</div>
              <div className="text-muted-foreground text-[12px]">{v.closedDeals} vendas</div>
            </div>
          ))}
        </div>
      )}

      {/* Full table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Pos.", "Vendedor", "Pontos", "Vendas", "Conversão", "Resp. Leads", "Follow-ups"].map(h => (
                <th key={h} className="px-5 py-3.5 text-left text-muted-foreground text-[12px] font-semibold uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sellers.map((v, i) => (
              <tr key={v.user_id} className="border-b border-border/20">
                <td className="px-5 py-3.5 font-bold text-base" style={{ color: i === 0 ? "hsl(43, 96%, 56%)" : "hsl(var(--muted-foreground))" }}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-[11px] font-bold text-white">{v.avatar}</div>
                    <span className="text-foreground font-semibold">{v.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-primary font-bold text-base">{v.points}</td>
                <td className="px-5 py-3.5 text-foreground">{v.closedDeals}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-border rounded-full h-1.5">
                      <div className="bg-accent h-1.5 rounded-full" style={{ width: `${v.conversionRate}%` }} />
                    </div>
                    <span className="text-accent font-semibold text-[13px]">{v.conversionRate}%</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">{v.leadsResponded}</td>
                <td className="px-5 py-3.5 text-muted-foreground">{v.followUps}</td>
              </tr>
            ))}
            {sellers.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">
                <Trophy className="h-10 w-10 mx-auto mb-2 opacity-40" />
                Nenhum vendedor registrado
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
