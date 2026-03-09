import { BarChart, Bar, ResponsiveContainer, Tooltip } from "recharts";

interface GoalComparisonCardProps {
  title: string;
  realized: number;
  target: number;
  previousRealized?: number;
  dailyData: { day: string; value: number }[];
}

export function GoalComparisonCard({ title, realized, target, previousRealized, dailyData }: GoalComparisonCardProps) {
  const pct = target > 0 ? Math.round((realized / target) * 100) : 0;
  const diff = previousRealized && previousRealized > 0
    ? Math.round(((realized - previousRealized) / previousRealized) * 100)
    : null;

  const color = pct >= 100 ? "hsl(var(--chart-2))" : pct >= 75 ? "hsl(var(--chart-1))" : pct >= 50 ? "hsl(var(--chart-3))" : "hsl(var(--destructive))";

  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3">
      <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">{title}</div>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-extrabold text-foreground font-serif">R${realized.toLocaleString("pt-BR")}</div>
          <div className="text-xs text-muted-foreground">Meta: R${target.toLocaleString("pt-BR")}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold" style={{ color }}>{pct}%</div>
          {diff !== null && (
            <div className={`text-xs font-semibold ${diff >= 0 ? "text-chart-2" : "text-destructive"}`}>
              {diff >= 0 ? "↑" : "↓"} {Math.abs(diff)}% vs anterior
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-border rounded h-2">
        <div className="h-2 rounded transition-all duration-700" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>

      {/* Mini chart */}
      {dailyData.length > 0 && (
        <div className="h-16 mt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData}>
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                formatter={(v: number) => [`R$${v.toLocaleString("pt-BR")}`, "Valor"]}
              />
              <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
