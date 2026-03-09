import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { Button } from "@/components/ui/button";
import { Bell, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PAGE_TITLES: Record<string, { title: string; sub: string }> = {
  "/": { title: "Dashboard", sub: "Visão geral do negócio" },
  "/clients": { title: "Clientes", sub: "Base de Clientes" },
  "/pipeline": { title: "Pipeline", sub: "Gestão de Oportunidades" },
  "/chat": { title: "WhatsApp", sub: "Central de Atendimento" },
  "/tasks": { title: "Tarefas", sub: "Gestão de Atividades" },
  "/ranking": { title: "Ranking", sub: "Gamificação de Vendedores" },
  "/reports": { title: "Relatórios", sub: "Análise de Dados" },
  "/notifications": { title: "Notificações", sub: "Alertas do Sistema" },
  "/settings": { title: "Configurações", sub: "Personalização" },
};

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const pageInfo = PAGE_TITLES[location.pathname] || { title: "CRM", sub: "" };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="h-[60px] bg-card border-b border-border flex items-center justify-between px-7 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-foreground font-bold text-lg">{pageInfo.title}</span>
            <span className="text-muted-foreground text-[13px]">{pageInfo.sub}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-[13px] border-border bg-background hover:bg-secondary"
              onClick={() => navigate("/notifications")}
            >
              <Bell className="h-3.5 w-3.5" />
              Notificações
              <span className="bg-destructive text-destructive-foreground text-[10px] rounded-full px-1.5 py-0.5 font-bold ml-1">5</span>
            </Button>
            <Button size="sm" className="gap-1.5 text-[13px]">
              <Plus className="h-3.5 w-3.5" />
              Novo Lead
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
