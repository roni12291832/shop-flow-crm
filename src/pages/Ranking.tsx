import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Star, TrendingUp, DollarSign, Target, Clock } from "lucide-react";

interface SellerStats {
  user_id: string;
  name: string;
  points: number;
  closedDeals: number;
  totalRevenue: number;
  conversionRate: number;
  avgResponseTime: string;
}

export default function Ranking() {
  const { tenantId } = useAuth();
  const [sellers, setSellers] = useState<SellerStats[]>([]);

  useEffect(() => {
    if (!tenantId) return;

    const fetchRanking = async () => {
      // Get all sellers in the tenant
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name")
        .eq("tenant_id", tenantId);

      if (!profiles) return;

      // Get all opportunities
      const { data: opps } = await supabase
        .from("opportunities")
        .select("responsible_id, stage, estimated_value")
        .eq("tenant_id", tenantId);

      // Get tasks completed
      const { data: tasks } = await supabase
        .from("tasks")
        .select("responsible_id, status")
        .eq("tenant_id", tenantId)
        .eq("status", "concluido");

      const stats: SellerStats[] = profiles.map((p) => {
        const userOpps = (opps || []).filter((o) => o.responsible_id === p.user_id);
        const closedDeals = userOpps.filter((o) => o.stage === "venda_fechada");
        const totalRevenue = closedDeals.reduce((sum, o) => sum + Number(o.estimated_value || 0), 0);
        const conversionRate = userOpps.length > 0 ? (closedDeals.length / userOpps.length) * 100 : 0;
        const completedTasks = (tasks || []).filter((t) => t.responsible_id === p.user_id).length;

        // Points: deals closed * 50 + tasks * 10 + leads * 5
        const points = closedDeals.length * 50 + completedTasks * 10 + userOpps.length * 5;

        return {
          user_id: p.user_id,
          name: p.name,
          points,
          closedDeals: closedDeals.length,
          totalRevenue,
          conversionRate,
          avgResponseTime: "—",
        };
      });

      stats.sort((a, b) => b.points - a.points);
      setSellers(stats);
    };

    fetchRanking();
  }, [tenantId]);

  const getRankIcon = (index: number) => {
    if (index === 0) return <Trophy className="h-6 w-6 text-warning" />;
    if (index === 1) return <Medal className="h-6 w-6 text-muted-foreground" />;
    if (index === 2) return <Medal className="h-6 w-6 text-warning/70" />;
    return <span className="w-6 h-6 flex items-center justify-center text-sm font-bold text-muted-foreground">{index + 1}</span>;
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Gamificação</h1>
        <p className="text-muted-foreground">Ranking de desempenho da equipe</p>
      </div>

      {/* Top 3 podium */}
      {sellers.length >= 1 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {sellers.slice(0, 3).map((seller, i) => (
            <Card key={seller.user_id} className={`relative overflow-hidden ${i === 0 ? "border-warning/50 shadow-md" : ""}`}>
              {i === 0 && <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-warning to-warning/60" />}
              <CardContent className="p-5 text-center">
                <div className="mb-3">{getRankIcon(i)}</div>
                <div className="w-14 h-14 rounded-full gradient-primary mx-auto flex items-center justify-center text-lg font-bold text-white mb-3">
                  {seller.name.charAt(0).toUpperCase()}
                </div>
                <h3 className="font-bold">{seller.name}</h3>
                <p className="text-2xl font-bold text-primary mt-1">{seller.points} pts</p>
                <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                  <div className="bg-muted rounded-lg p-2">
                    <p className="text-muted-foreground">Vendas</p>
                    <p className="font-bold">{seller.closedDeals}</p>
                  </div>
                  <div className="bg-muted rounded-lg p-2">
                    <p className="text-muted-foreground">Conversão</p>
                    <p className="font-bold">{seller.conversionRate.toFixed(0)}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Full ranking table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4 text-warning" /> Ranking Completo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sellers.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Trophy className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nenhum dado de desempenho ainda</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sellers.map((seller, i) => (
                <div
                  key={seller.user_id}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="w-8 text-center">{getRankIcon(i)}</div>
                  <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-xs font-bold text-white">
                    {seller.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{seller.name}</p>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Pontos</p>
                      <p className="font-bold text-primary">{seller.points}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Vendas</p>
                      <p className="font-bold">{seller.closedDeals}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Receita</p>
                      <p className="font-bold">R$ {seller.totalRevenue.toLocaleString("pt-BR")}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Conversão</p>
                      <p className="font-bold">{seller.conversionRate.toFixed(0)}%</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
