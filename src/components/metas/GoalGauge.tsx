import { useMemo } from "react";

interface GoalGaugeProps {
  current: number;
  target: number;
  size?: number;
}

export function GoalGauge({ current, target, size = 220 }: GoalGaugeProps) {
  const percentage = target > 0 ? Math.min((current / target) * 100, 150) : 0;
  const displayPct = Math.round(percentage);

  const color = useMemo(() => {
    if (percentage >= 100) return "hsl(var(--chart-2))";
    if (percentage >= 75) return "hsl(var(--chart-1))";
    if (percentage >= 50) return "hsl(var(--chart-3))";
    return "hsl(var(--destructive))";
  }, [percentage]);

  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(percentage, 100) / 100) * circumference;

  const remaining = target - current;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            stroke="hsl(var(--border))" strokeWidth="10" fill="none"
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            stroke={color} strokeWidth="10" fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-extrabold text-foreground font-serif">{displayPct}%</span>
        </div>
      </div>

      <div className="text-center space-y-1">
        <div className="text-4xl md:text-5xl font-extrabold text-foreground font-serif">
          R${current.toLocaleString("pt-BR")}
        </div>
        <div className="text-muted-foreground text-sm">
          Meta: R${target.toLocaleString("pt-BR")}
        </div>
        {percentage >= 100 ? (
          <div className="text-sm font-semibold" style={{ color }}>
            🎉 Meta batida! +R${Math.abs(remaining).toLocaleString("pt-BR")} acima
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Faltam <span className="font-semibold" style={{ color }}>R${remaining.toLocaleString("pt-BR")}</span> para bater a meta
          </div>
        )}
      </div>
    </div>
  );
}
