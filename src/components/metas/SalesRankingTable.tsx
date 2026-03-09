import { Badge } from "@/components/ui/badge";

interface SellerRanking {
  name: string;
  target: number;
  realized: number;
  avatar: string;
}

interface SalesRankingTableProps {
  sellers: SellerRanking[];
}

export function SalesRankingTable({ sellers }: SalesRankingTableProps) {
  const sorted = [...sellers].sort((a, b) => {
    const pctA = a.target > 0 ? a.realized / a.target : 0;
    const pctB = b.target > 0 ? b.realized / b.target : 0;
    return pctB - pctA;
  });

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-foreground font-bold text-base">🏆 Ranking de Vendedores por Meta</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["#", "Vendedor", "Meta Individual", "Realizado", "%", "Status"].map(h => (
                <th key={h} className="px-5 py-3 text-left text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">Nenhum vendedor com meta</td></tr>
            ) : sorted.map((s, i) => {
              const pct = s.target > 0 ? Math.round((s.realized / s.target) * 100) : 0;
              const statusLabel = pct >= 100 ? "Acima da Meta" : pct >= 80 ? "Na Meta" : "Abaixo da Meta";
              const statusColor = pct >= 100 ? "hsl(var(--chart-2))" : pct >= 80 ? "hsl(var(--chart-1))" : "hsl(var(--destructive))";

              return (
                <tr key={i} className="border-b border-border/20 hover:bg-border/30 transition-colors">
                  <td className="px-5 py-3 text-muted-foreground font-bold">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-[11px] font-bold text-white">{s.avatar}</div>
                      <span className="text-foreground font-semibold text-sm">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground text-sm">R${s.target.toLocaleString("pt-BR")}</td>
                  <td className="px-5 py-3 text-foreground font-semibold text-sm">R${s.realized.toLocaleString("pt-BR")}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-border rounded h-1.5 max-w-[80px]">
                        <div className="h-1.5 rounded transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: statusColor }} />
                      </div>
                      <span className="text-xs font-bold" style={{ color: statusColor }}>{pct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{ background: statusColor + "22", color: statusColor }}>
                      {statusLabel}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
