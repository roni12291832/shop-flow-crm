import { MessageSquare, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface BirthdayCardProps {
  name: string;
  phone: string | null;
  birthDate: string;
  avatarInitials: string;
  sent: boolean;
  onSendWhatsApp: () => void;
  onViewProfile: () => void;
}

export function BirthdayCard({ name, phone, birthDate, avatarInitials, sent, onSendWhatsApp, onViewProfile }: BirthdayCardProps) {
  const formattedDate = new Date(birthDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
        {avatarInitials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-foreground font-semibold text-sm truncate">{name}</div>
        <div className="text-muted-foreground text-xs">🎂 {formattedDate}</div>
        {phone && <div className="text-muted-foreground text-xs">{phone}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {sent ? (
          <Badge variant="secondary" className="text-[10px] bg-accent/20 text-accent border-0">Enviado ✓</Badge>
        ) : (
          <Button size="sm" variant="outline" className="text-xs h-8" onClick={onSendWhatsApp}>
            <MessageSquare className="h-3 w-3 mr-1" /> WhatsApp
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onViewProfile}>
          <User className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
