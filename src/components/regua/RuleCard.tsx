import { Heart, ShoppingBag, MessageSquare, Pencil, Copy, Trash2, Calendar } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface RuleCardProps {
  rule: {
    id: string;
    name: string;
    trigger_event: string;
    channel: string;
    active: boolean;
    message_template: string;
    campaign_start?: string;
    campaign_end?: string;
  };
  executionCount: number;
  onToggle: (id: string, active: boolean) => void;
  onEdit: (rule: any) => void;
  onDuplicate: (rule: any) => void;
  onDelete: (id: string) => void;
}

function formatDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function RuleCard({ rule, executionCount, onToggle, onEdit, onDuplicate, onDelete }: RuleCardProps) {
  const isBirthday = rule.trigger_event === "birthday";

  // Preview da primeira variação
  const firstVariation = (rule.message_template || "").split("|||")[0]?.trim() || "";

  const now = new Date();
  const isExpired = rule.campaign_end ? new Date(rule.campaign_end) < now : false;
  const isNotStarted = rule.campaign_start ? new Date(rule.campaign_start) > now : false;

  return (
    <Card className={`p-4 border-2 transition-colors ${
      rule.active && !isExpired ? "border-border hover:border-primary/30" : "border-border/40 opacity-70"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Header: ícone + nome + switch */}
          <div className="flex items-center gap-2 mb-2">
            {isBirthday
              ? <Heart className="h-4 w-4 text-rose-500 shrink-0" />
              : <ShoppingBag className="h-4 w-4 text-amber-500 shrink-0" />
            }
            <h3 className="font-semibold text-foreground truncate text-sm">{rule.name}</h3>
            <Switch
              checked={rule.active}
              onCheckedChange={checked => onToggle(rule.id, checked)}
              className="shrink-0"
            />
          </div>

          {/* Badges de status */}
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            <Badge
              variant="secondary"
              className={`text-[10px] h-5 ${isBirthday
                ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                : "bg-amber-500/10 text-amber-600 border-amber-500/20"
              }`}
            >
              {isBirthday ? "Aniversariantes" : "Compradores"}
            </Badge>

            <Badge variant="secondary" className="text-[10px] h-5">
              <MessageSquare className="h-2.5 w-2.5 mr-1" />
              WhatsApp
            </Badge>

            {!isBirthday && isExpired && (
              <Badge variant="destructive" className="text-[10px] h-5">Encerrada</Badge>
            )}
            {!isBirthday && isNotStarted && (
              <Badge variant="secondary" className="text-[10px] h-5 bg-blue-500/10 text-blue-600">Aguardando início</Badge>
            )}
            {!isBirthday && !isExpired && !isNotStarted && rule.active && (
              <Badge variant="secondary" className="text-[10px] h-5 bg-emerald-500/10 text-emerald-600">Em andamento</Badge>
            )}
          </div>

          {/* Datas da campanha (só para compradores) */}
          {!isBirthday && (rule.campaign_start || rule.campaign_end) && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-2">
              <Calendar className="h-3 w-3" />
              <span>{formatDate(rule.campaign_start)} → {formatDate(rule.campaign_end)}</span>
            </div>
          )}

          {/* Preview da mensagem */}
          {firstVariation && (
            <p className="text-xs text-muted-foreground line-clamp-1 italic">
              "{firstVariation.slice(0, 70)}{firstVariation.length > 70 ? "..." : ""}"
            </p>
          )}

          {/* Contagem de disparos */}
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {executionCount} disparos
            </Badge>
            {!isBirthday && (
              <span className="text-[10px] text-muted-foreground">40/dia • Seg–Sáb • 08–12h + 13–18h</span>
            )}
            {isBirthday && (
              <span className="text-[10px] text-muted-foreground">Sem limite • Todo dia</span>
            )}
          </div>
        </div>

        {/* Ações */}
        <div className="flex flex-col gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(rule)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDuplicate(rule)}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(rule.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
