import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MessageSquare, Mail, Smartphone, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  scheduled: { label: "Agendado", variant: "outline", icon: Clock },
  sent: { label: "Enviado", variant: "default", icon: CheckCircle2 },
  failed: { label: "Falhou", variant: "destructive", icon: XCircle },
  cancelled: { label: "Cancelado", variant: "secondary", icon: XCircle },
};

const CHANNEL_ICON: Record<string, typeof MessageSquare> = {
  whatsapp: MessageSquare,
  email: Mail,
  sms: Smartphone,
};

interface Execution {
  id: string;
  scheduled_for: string;
  sent_at: string | null;
  status: string;
  message_sent: string | null;
  customer: { name: string; phone: string | null } | null;
  rule: { name: string; channel: string } | null;
}

interface ExecutionTimelineProps {
  executions: Execution[];
  loading: boolean;
}

const FILTERS = [
  { key: "all", label: "Todos" },
  { key: "today", label: "Hoje" },
  { key: "week", label: "Esta Semana" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
];

export function ExecutionTimeline({ executions, loading }: ExecutionTimelineProps) {
  const [filter, setFilter] = useState("all");

  const filtered = executions.filter((e) => {
    if (filter === "today") {
      return new Date(e.scheduled_for).toDateString() === new Date().toDateString();
    }
    if (filter === "week") {
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const d = new Date(e.scheduled_for);
      return d >= now && d <= weekFromNow;
    }
    if (filter === "whatsapp") return e.rule?.channel === "whatsapp";
    if (filter === "email") return e.rule?.channel === "email";
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-muted/50 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.key)}
            className="text-xs"
          >
            {f.label}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhum disparo encontrado</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((exec) => {
            const status = STATUS_CONFIG[exec.status] || STATUS_CONFIG.scheduled;
            const StatusIcon = status.icon;
            const ChannelIcon = CHANNEL_ICON[exec.rule?.channel || "whatsapp"] || MessageSquare;

            return (
              <Card key={exec.id} className="p-3 bg-card border-border">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <ChannelIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-foreground truncate">
                        {exec.customer?.name || "Cliente"}
                      </span>
                      <Badge variant={status.variant} className="text-[10px] gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {exec.rule?.name} • {exec.message_sent?.slice(0, 60) || "Mensagem pendente"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(exec.scheduled_for), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
