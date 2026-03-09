interface NpsDistributionChartProps {
  distribution: number[]; // array of 11 values (index 0-10)
}

export function NpsDistributionChart({ distribution }: NpsDistributionChartProps) {
  const max = Math.max(...distribution, 1);

  const getColor = (i: number) => {
    if (i <= 6) return "hsl(var(--destructive))";
    if (i <= 8) return "hsl(var(--warning))";
    return "hsl(var(--chart-2))";
  };

  return (
    <div className="space-y-2">
      <div className="text-foreground font-bold text-base mb-4">Distribuição de Notas</div>
      {distribution.map((count, i) => {
        const pct = (count / max) * 100;
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="text-sm font-bold w-6 text-right text-muted-foreground">{i}</span>
            <div className="flex-1 bg-border rounded h-5 relative">
              <div
                className="h-5 rounded transition-all duration-700 flex items-center justify-end pr-2"
                style={{ width: `${Math.max(pct, 2)}%`, background: getColor(i) }}
              >
                {count > 0 && (
                  <span className="text-[10px] font-bold text-white">{count}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex gap-4 mt-3 text-[11px]">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "hsl(var(--destructive))" }} /> Detratores (0-6)</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "hsl(var(--warning))" }} /> Neutros (7-8)</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "hsl(var(--chart-2))" }} /> Promotores (9-10)</span>
      </div>
    </div>
  );
}
