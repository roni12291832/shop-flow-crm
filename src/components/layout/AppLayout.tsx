import { ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { ThemeToggle } from "@/components/ui/theme-toggle";

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
  "/follow-up": { title: "Follow-Up Automático", sub: "Sequências para Leads Novos" },
};

const ORIGENS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "google", label: "Google" },
  { value: "indicacao", label: "Indicação" },
  { value: "loja_fisica", label: "Loja Física" },
  { value: "site", label: "Site" },
  { value: "outro", label: "Outro" },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const pageInfo = PAGE_TITLES[location.pathname] || { title: "CRM", sub: "" };
  const [unreadCount, setUnreadCount] = useState(0);

  // ─── Novo Lead Dialog ────────────────────────────────────────────────
  const [novoLeadOpen, setNovoLeadOpen] = useState(false);
  const [leadForm, setLeadForm] = useState({ name: "", phone: "", origin: "outro" });
  const [savingLead, setSavingLead] = useState(false);

  const handleNovoLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !leadForm.name.trim()) return;
    setSavingLead(true);
    try {
      // 1. Cria o contato na tabela clients
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .insert({ name: leadForm.name.trim(), phone: leadForm.phone || null, origin: leadForm.origin as any })
        .select()
        .single();

      if (clientError || !clientData) throw new Error(clientError?.message || "Erro ao criar contato");

      // 2. Cria a oportunidade em "lead_novo" — aparece no Pipeline, NÃO na página Clientes
      const { error: oppError } = await supabase.from("opportunities").insert({
        title: `Lead Manual — ${leadForm.name.trim()}`,
        client_id: clientData.id,
        stage: "lead_novo" as any,
        estimated_value: 0,
        responsible_id: user.id,
      });

      if (oppError) throw new Error(oppError.message);

      toast.success(`Lead "${leadForm.name}" adicionado ao Pipeline!`);
      setNovoLeadOpen(false);
      setLeadForm({ name: "", phone: "", origin: "outro" });
      // Redireciona para o Pipeline para ver o lead recém-criado
      navigate("/pipeline");
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setSavingLead(false);
    }
  };

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
            <ThemeToggle />
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
            <Button size="sm" className="gap-1.5 text-[13px]" onClick={() => setNovoLeadOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Novo Lead</span>
            </Button>
          </div>
        </div>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Dialog — Novo Lead */}
      <Dialog open={novoLeadOpen} onOpenChange={setNovoLeadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Novo Lead
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleNovoLead} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              O lead será criado diretamente na coluna <strong>Lead Novo</strong> do Pipeline.
              Ele só aparecerá em <em>Clientes</em> quando chegar na etapa <strong>Comprador</strong>.
            </p>
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={leadForm.name}
                onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })}
                placeholder="Nome completo"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone / WhatsApp</Label>
              <Input
                value={leadForm.phone}
                onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div className="space-y-2">
              <Label>Origem</Label>
              <Select value={leadForm.origin} onValueChange={(v) => setLeadForm({ ...leadForm, origin: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORIGENS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setNovoLeadOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={savingLead}>
                {savingLead ? "Criando..." : "Criar Lead"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
