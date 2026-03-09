import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart3, Users, Kanban, MessageSquare, CheckSquare,
  Trophy, FileText, Settings, LogOut, Bell, Home, Menu, Target, Zap, Cake, Star, Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  vendedor: "Vendedor",
  atendimento: "Atendimento",
};

const navItems = [
  { icon: Home, label: "Dashboard", path: "/" },
  { icon: Users, label: "Clientes", path: "/clients" },
  { icon: Kanban, label: "Pipeline", path: "/pipeline" },
  { icon: MessageSquare, label: "WhatsApp", path: "/chat", badgeKey: "chat" },
  { icon: Target, label: "Metas", path: "/metas" },
  { icon: Zap, label: "Régua", path: "/regua-relacionamento" },
  { icon: Cake, label: "Datas", path: "/datas-especiais" },
  { icon: Star, label: "NPS", path: "/nps" },
  { icon: CheckSquare, label: "Tarefas", path: "/tasks" },
  { icon: Trophy, label: "Ranking", path: "/ranking" },
  { icon: FileText, label: "Relatórios", path: "/reports" },
  { icon: Bell, label: "Notificações", path: "/notifications", badgeKey: "notifications" },
  { icon: Smartphone, label: "Modo Vendedor", path: "/vendedor" },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, roles, signOut, tenantId, user } = useAuth();
  const [chatCount, setChatCount] = useState(0);
  const [notifCount, setNotifCount] = useState(0);

  const userRole = roles.length > 0 ? ROLE_LABELS[roles[0]] || roles[0] : "Usuário";

  useEffect(() => {
    if (!tenantId || !user) return;
    const fetchCounts = async () => {
      const [{ count: convCount }, { count: nCount }] = await Promise.all([
        supabase.from("conversations").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "aberta"),
        supabase.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("read", false),
      ]);
      setChatCount(convCount || 0);
      setNotifCount(nCount || 0);
    };
    fetchCounts();

    const channel = supabase
      .channel("sidebar-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => fetchCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => fetchCounts())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId, user]);

  const handleNav = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  const getBadge = (key?: string) => {
    if (key === "chat" && chatCount > 0) return chatCount;
    if (key === "notifications" && notifCount > 0) return notifCount;
    return 0;
  };

  return (
    <div className="flex flex-col h-full w-[220px] bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-[10px] gradient-primary flex items-center justify-center shadow-glow">
            <BarChart3 className="h-[18px] w-[18px] text-white" />
          </div>
          <div>
            <div className="text-[15px] font-extrabold text-foreground">StoreCRM</div>
            <div className="text-[11px] text-muted-foreground">Loja Premium</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const badge = getBadge(item.badgeKey);
            return (
              <button
                key={item.path}
                onClick={() => handleNav(item.path)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-primary/20 text-primary border border-primary/40"
                    : "text-sidebar-foreground hover:bg-sidebar-accent border border-transparent"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className={cn(isActive && "font-bold")}>{item.label}</span>
                {badge > 0 && (
                  <span className="ml-auto bg-accent text-accent-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Bottom */}
      <div className="px-3 pb-4 space-y-1 border-t border-sidebar-border pt-3">
        <button
          onClick={() => handleNav("/settings")}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-all",
            location.pathname === "/settings"
              ? "bg-primary/20 text-primary border border-primary/40"
              : "text-sidebar-foreground hover:bg-sidebar-accent border border-transparent"
          )}
        >
          <Settings className="h-4 w-4" />
          Config
        </button>

        <div className="flex items-center gap-2.5 px-3 py-3 rounded-[10px] bg-sidebar-accent mt-2">
          <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-[11px] font-bold text-white">
            {profile?.name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-foreground truncate">
              {profile?.name || "Usuário"}
            </p>
            <p className="text-[11px] text-muted-foreground">{userRole}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={signOut}
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AppSidebar() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="fixed top-3 left-3 z-50 md:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-[220px]">
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div className="flex-shrink-0 hidden md:block">
      <SidebarContent />
    </div>
  );
}
