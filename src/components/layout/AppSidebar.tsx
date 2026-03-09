import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  BarChart3, Users, Kanban, MessageSquare, CheckSquare,
  Trophy, FileText, Settings, LogOut, Bell, Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const navItems = [
  { icon: Home, label: "Dashboard", path: "/" },
  { icon: Users, label: "Clientes", path: "/clients" },
  { icon: Kanban, label: "Pipeline", path: "/pipeline" },
  { icon: MessageSquare, label: "WhatsApp", path: "/chat", badge: true },
  { icon: CheckSquare, label: "Tarefas", path: "/tasks" },
  { icon: Trophy, label: "Ranking", path: "/ranking" },
  { icon: FileText, label: "Relatórios", path: "/reports" },
  { icon: Bell, label: "Notificações", path: "/notifications" },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut } = useAuth();

  return (
    <div className="flex flex-col h-screen w-[220px] bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex-shrink-0">
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
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-primary/20 text-primary border border-primary/40"
                    : "text-sidebar-foreground hover:bg-sidebar-accent border border-transparent"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className={cn(isActive && "font-bold")}>{item.label}</span>
                {item.badge && (
                  <span className="ml-auto bg-accent text-accent-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    3
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Bottom - Settings & User */}
      <div className="px-3 pb-4 space-y-1 border-t border-sidebar-border pt-3">
        <button
          onClick={() => navigate("/settings")}
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
            <p className="text-[11px] text-muted-foreground">Gerente</p>
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
