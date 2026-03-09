import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";

interface Notification {
  id: string;
  title: string;
  message: string | null;
  read: boolean;
  created_at: string;
}

export default function Notifications() {
  const { user, tenantId } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setNotifications(data as Notification[]);
  };

  useEffect(() => { fetchNotifications(); }, [user]);

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    fetchNotifications();
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    toast.success("Todas marcadas como lidas");
    fetchNotifications();
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notificações</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} não lidas` : "Tudo em dia!"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} className="gap-1.5">
            <CheckCheck className="h-4 w-4" /> Marcar todas como lidas
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {notifications.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              <BellOff className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nenhuma notificação</p>
            </CardContent>
          </Card>
        ) : (
          notifications.map((n) => (
            <Card
              key={n.id}
              className={`transition-colors cursor-pointer ${!n.read ? "border-primary/30 bg-primary/5" : "opacity-70"}`}
              onClick={() => !n.read && markAsRead(n.id)}
            >
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`mt-0.5 p-1.5 rounded-lg ${!n.read ? "bg-primary/10" : "bg-muted"}`}>
                  <Bell className={`h-4 w-4 ${!n.read ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className={`text-sm ${!n.read ? "font-semibold" : "font-medium"}`}>{n.title}</h3>
                    {!n.read && <Badge className="text-[10px] px-1.5">Nova</Badge>}
                  </div>
                  {n.message && <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(n.created_at).toLocaleDateString("pt-BR", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
                {!n.read && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}>
                    <Check className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
