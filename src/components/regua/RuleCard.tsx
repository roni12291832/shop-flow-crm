import { Package, Clock, Heart, Hand, MessageSquare, Mail, Smartphone, Pencil, Copy, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const TRIGGER_CONFIG: Record<string, { icon: typeof Package; label: string; color: string }> = {
  after_purchase: { icon: Package, label: "Após compra", color: "text-accent" },
  no_purchase: { icon: Clock, label: "Sem comprar", color: "text-warning" },
  birthday: { icon: Heart, label: "Aniversário", color: "text-destructive" },
  manual: { icon: Hand, label: "Manual", color: "text-muted-foreground" },
};

const CHANNEL_CONFIG: Record<string, { icon: typeof MessageSquare; label: string }> = {
  whatsapp: { icon: MessageSquare, label: "WhatsApp" },
  email: { icon: Mail, label: "Email" },
  sms: { icon: Smartphone, label: "SMS" },
};

interface RuleCardProps {
  rule: {
    id: string;
    name: string;
    trigger_event: string;
    delay_days: number;
    channel: string;
    active: boolean;
    message_template: string;
  };
  executionCount: number;
  onToggle: (id: string, active: boolean) => void;
  onEdit: (rule: any) => void;
  onDuplicate: (rule: any) => void;
  onDelete: (id: string) => void;
}

export function RuleCard({ rule, executionCount, onToggle, onEdit, onDuplicate, onDelete }: RuleCardProps) {
  const trigger = TRIGGER_CONFIG[rule.trigger_event] || TRIGGER_CONFIG.manual;
  const channel = CHANNEL_CONFIG[rule.channel] || CHANNEL_CONFIG.whatsapp;
  const TriggerIcon = trigger.icon;
  const ChannelIcon = channel.icon;

  return (
    <Card className="p-4 bg-card border-border hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-foreground truncate">{rule.name}</h3>
            <Switch
              checked={rule.active}
              onCheckedChange={(checked) => onToggle(rule.id, checked)}
            />
          </div>

          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
            <span className={`flex items-center gap-1 ${trigger.color}`}>
              <TriggerIcon className="h-3.5 w-3.5" />
              {trigger.label} • {rule.delay_days} dias
            </span>
            <span className="flex items-center gap-1">
              <ChannelIcon className="h-3.5 w-3.5" />
              {channel.label}
            </span>
          </div>

          <p className="text-xs text-muted-foreground line-clamp-2">
            {rule.message_template.includes("|||") 
              ? `[${rule.message_template.split("|||").filter(m => m.trim()).length} Variações] ${rule.message_template.split("|||")[0]}...`
              : rule.message_template}
          </p>

          <div className="mt-2">
            <Badge variant="secondary" className="text-xs">
              {executionCount} disparos
            </Badge>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(rule)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDuplicate(rule)}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(rule.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
