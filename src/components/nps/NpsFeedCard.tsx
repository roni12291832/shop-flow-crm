import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";

interface NpsFeedCardProps {
  customerName: string;
  score: number;
  comment: string | null;
  respondedAt: string;
  category: string;
  phone: string | null;
  isNew?: boolean;
}

export function NpsFeedCard({ customerName, score, comment, respondedAt, category, phone, isNew }: NpsFeedCardProps) {
  const initials = customerName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  const scoreColor = category === "promotor"
    ? "bg-accent/20 text-accent"
    : category === "neutro"
    ? "bg-warning/20 text-warning"
    : "bg-destructive/20 text-destructive";

  const categoryLabel = category === "promotor" ? "Promotor" : category === "neutro" ? "Neutro" : "Detrator";

  const openWhatsApp = () => {
    if (!phone) return;
    const cleaned = phone.replace(/\D/g, "");
    window.open(`https://wa.me/55${encodeURIComponent(cleaned)}`, "_blank");
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex gap-4">
      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-foreground font-semibold text-sm">{customerName}</span>
          <Badge className={`${scoreColor} border-0 text-[10px]`}>{score} — {categoryLabel}</Badge>
          {isNew && <Badge className="bg-primary/20 text-primary border-0 text-[9px]">NOVO</Badge>}
        </div>
        {comment && <p className="text-muted-foreground text-sm mb-1">{comment}</p>}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-[11px]">
            {new Date(respondedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
          {category === "detrator" && phone && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openWhatsApp}>
              <MessageSquare className="h-3 w-3" /> Contatar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
