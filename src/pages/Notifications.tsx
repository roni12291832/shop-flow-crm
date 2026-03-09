import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";

interface Notification { id: string; title: string; message: string | null; read: boolean; created_at: string; }

export default function Notifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const fetch_ = async () => {
    if (!user) return;
    const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (data) setNotifications(data as Notification[]);
  };

  useEffect(() => { fetch_(); }, [user]);

  const markAsRead = async (id: string) => { await supabase.from("notifications").update({ read: true }).eq("id", id); fetch_(); };
  const markAllRead = async () => { if (!user) return; await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false); toast.success("Todas marcadas como lidas"); fetch_(); };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="p-7 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">{unreadCount > 0 ? `${unreadCount} não lidas` : "Tudo em dia!"}</p>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} className="gap-1.5 text-[12px] border-border">
            <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {notifications.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
            <BellOff className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>Nenhuma notificação</p>
          </div>
        ) : notifications.map(n => (
          <div key={n.id} onClick={() => !n.read && markAsRead(n.id)}
            className={`bg-card border rounded-xl p-4 flex items-start gap-3 cursor-pointer transition-colors ${
              !n.read ? "border-primary/30 hover:border-primary/50" : "border-border opacity-60"
            }`}>
            <div className={`mt-0.5 p-1.5 rounded-lg ${!n.read ? "bg-primary/10" : "bg-secondary"}`}>
              <Bell className={`h-4 w-4 ${!n.read ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className={`text-sm ${!n.read ? "font-bold text-foreground" : "font-medium text-muted-foreground"}`}>{n.title}</h3>
                {!n.read && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">Nova</span>}
              </div>
              {n.message && <p className="text-[13px] text-muted-foreground mt-0.5">{n.message}</p>}
              <p className="text-[11px] text-muted-foreground mt-1">
                {new Date(n.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            {!n.read && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}>
                <Check className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
