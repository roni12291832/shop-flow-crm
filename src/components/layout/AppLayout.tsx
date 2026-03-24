import { ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { Button } from "@/components/ui/button";
import { Bell, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

const PAGE_TITLES: Record<string, { title: string; sub: string }> = {
  "/": { title: "Dashboard", sub: "Visão geral do negócio" },
  "/clients": { title: "Clientes", sub: "Base de Clientes" },
  "/pipeline": { title: "Pipeline", sub: "Gestão de Oportunidades" },
  "/chat": { title: "WhatsApp", sub: "Central de Atendimento" },
  "/tasks": { title: "Tarefas", sub: "Gestão de Atividades" },
  "/ranking": { title: "Ranking", sub: "Gamificação de Vendedores" },
  "/fidelidade": { title: "Programa de Fidelidade", sub: "Retenção e Recompensas" },
  "/reports": { title: "Relatórios", sub: "Análise de Dados" },
  "/financeiro": { title: "Financeiro Operacional", sub: "Gestão de Fluxo de Caixa e DRE" },
  "/notifications": { title: "Notificações", sub: "Alertas do Sistema" },
  "/settings": { title: "Configurações", sub: "Personalização" },
  "/metas": { title: "Metas", sub: "Controle de Metas e Vendas" },
  "/metas/configurar": { title: "Configurar Metas", sub: "Definição de Metas por Período" },
  "/catalogo": { title: "Catálogo", sub: "Gestão de Produtos e Grades" },
  "/trocas": { title: "Trocas & Devoluções", sub: "Fluxo de Logística Reversa" },
};

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const pageInfo = PAGE_TITLES[location.pathname] || { title: "CRM", sub: "" };
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);
      setUnreadCount(count || 0);
    };
    fetchUnread();

    const channel = supabase
      .channel("topbar-notif")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, (payload) => {
        fetchUnread();
        if (payload.eventType === "INSERT") {
          const n = payload.new as any;
          toast.info(n.title, { description: n.message });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <div className={`h-[60px] bg-card border-b border-border flex items-center justify-between px-7 flex-shrink-0 ${isMobile ? "pl-14" : ""}`}>
          <div className="flex items-center gap-2.5">
            <span className="text-foreground font-bold text-lg">{pageInfo.title}</span>
            <span className="text-muted-foreground text-[13px] hidden sm:inline">{pageInfo.sub}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-[13px] border-border bg-background hover:bg-secondary"
              onClick={() => navigate("/notifications")}
            >
              <Bell className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Notificações</span>
              {unreadCount > 0 && (
                <span className="bg-destructive text-destructive-foreground text-[10px] rounded-full px-1.5 py-0.5 font-bold ml-1">{unreadCount}</span>
              )}
            </Button>
            <Button size="sm" className="gap-1.5 text-[13px]">
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Novo Lead</span>
            </Button>
          </div>
        </div>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
