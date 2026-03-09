interface NpsGaugeProps {
  score: number; // -100 to 100
}

export function NpsGauge({ score }: NpsGaugeProps) {
  // Map -100..100 to 0..180 degrees
  const angle = ((score + 100) / 200) * 180;
  const clampedAngle = Math.max(0, Math.min(180, angle));

  const getColor = () => {
    if (score < 0) return "hsl(var(--destructive))";
    if (score < 30) return "hsl(var(--warning))";
    if (score < 70) return "hsl(var(--chart-2))";
    return "hsl(var(--chart-6))";
  };

  const getZone = () => {
    if (score < 0) return "Zona Crítica";
    if (score < 30) return "Zona de Melhoria";
    if (score < 70) return "Zona de Qualidade";
    return "Zona de Excelência";
  };

  const color = getColor();

  // SVG arc for semicircle gauge
  const cx = 120, cy = 110, r = 90;
  const startAngle = Math.PI;
  const endAngle = Math.PI - (clampedAngle * Math.PI) / 180;

  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);

  const largeArc = clampedAngle > 90 ? 1 : 0;

  return (
    <div className="flex flex-col items-center">
      <svg width="240" height="140" viewBox="0 0 240 140">
        {/* Background arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="hsl(var(--border))" strokeWidth="16" strokeLinecap="round"
        />
        {/* Value arc */}
        {clampedAngle > 0 && (
          <path
            d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2}`}
            fill="none" stroke={color} strokeWidth="16" strokeLinecap="round"
            className="transition-all duration-1000"
          />
        )}
        {/* Score text */}
        <text x={cx} y={cy - 10} textAnchor="middle" className="fill-foreground text-[36px] font-extrabold">
          {score > 0 ? `+${score}` : score}
        </text>
        <text x={cx} y={cy + 15} textAnchor="middle" className="fill-muted-foreground text-[12px]">
          NPS Score
        </text>
        {/* Labels */}
        <text x="20" y="135" className="fill-muted-foreground text-[10px]">-100</text>
        <text x="210" y="135" className="fill-muted-foreground text-[10px]">+100</text>
      </svg>
      <span className="text-xs font-semibold mt-1" style={{ color }}>{getZone()}</span>
    </div>
  );
}
