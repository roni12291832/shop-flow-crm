import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { LossReasonDialog } from "@/components/crm/LossReasonDialog";

const STAGES = [
  { value: "lead_recebido", label: "Lead Recebido", color: "hsl(var(--chart-1))" },
  { value: "contato_iniciado", label: "Contato Iniciado", color: "hsl(var(--chart-4))" },
  { value: "cliente_interessado", label: "Interessado", color: "hsl(var(--chart-4))" },
  { value: "negociacao", label: "Negociação", color: "hsl(var(--chart-3))" },
  { value: "proposta_enviada", label: "Proposta Enviada", color: "hsl(var(--chart-7))" },
  { value: "venda_fechada", label: "Venda Fechada", color: "hsl(var(--chart-2))" },
  { value: "perdido", label: "Perdido", color: "hsl(var(--destructive))" },
];

interface Opportunity { id: string; title: string; estimated_value: number; stage: string; client_name?: string; }
interface Client { id: string; name: string; }

export default function Pipeline() {
  const { tenantId, user } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: "", client_id: "", estimated_value: "", stage: "lead_recebido" });
  const [lossDialogOpen, setLossDialogOpen] = useState(false);
  const [pendingLossId, setPendingLossId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({ id: "", title: "", estimated_value: "" });

  const fetchData = async () => {
    if (!tenantId) return;
    const [oppsRes, clientsRes] = await Promise.all([
      supabase.from("opportunities").select("*").eq("tenant_id", tenantId),
      supabase.from("clients").select("id, name").eq("tenant_id", tenantId),
    ]);
    const clientMap: Record<string, string> = {};
    (clientsRes.data || []).forEach((c: any) => { clientMap[c.id] = c.name; });
    setOpportunities((oppsRes.data || []).map((o: any) => ({ ...o, client_name: clientMap[o.client_id] || "Cliente" })));
    setClients((clientsRes.data || []) as Client[]);
  };

  useEffect(() => { fetchData(); }, [tenantId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !user) return;
    const { error } = await supabase.from("opportunities").insert({
      tenant_id: tenantId, title: form.title, client_id: form.client_id,
      estimated_value: parseFloat(form.estimated_value) || 0, stage: form.stage as any, responsible_id: user.id,
    });
    if (error) toast.error("Erro ao criar oportunidade");
    else { toast.success("Oportunidade criada!"); setDialogOpen(false); setForm({ title: "", client_id: "", estimated_value: "", stage: "lead_recebido" }); fetchData(); }
  };

  const moveStage = async (oppId: string, newStage: string) => {
    if (newStage === "perdido") {
      setPendingLossId(oppId);
      setLossDialogOpen(true);
      return;
    }
    await supabase.from("opportunities").update({ stage: newStage as any }).eq("id", oppId);
    fetchData();
  };

  const confirmLoss = async (reason: string, notes: string) => {
    if (!pendingLossId) return;
    await supabase.from("opportunities").update({
      stage: "perdido" as any, loss_reason: reason as any, loss_notes: notes || null,
    }).eq("id", pendingLossId);
    setLossDialogOpen(false);
    setPendingLossId(null);
    toast.info("Oportunidade marcada como perdida");
    fetchData();
  };

  const openEdit = (opp: Opportunity) => {
    setEditForm({ id: opp.id, title: opp.title, estimated_value: String(opp.estimated_value) });
    setEditDialogOpen(true);
  };

  const handleEdit = async () => {
    const { error } = await supabase.from("opportunities").update({
      title: editForm.title, estimated_value: parseFloat(editForm.estimated_value) || 0,
    }).eq("id", editForm.id);
    if (error) toast.error("Erro ao atualizar");
    else { toast.success("Atualizado!"); setEditDialogOpen(false); fetchData(); }
  };

  return (
    <div className="p-7 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">{opportunities.length} oportunidades ativas</p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Nova Oportunidade</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Oportunidade</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2"><Label>Título *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
              <div className="space-y-2"><Label>Cliente *</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Valor (R$)</Label><Input type="number" step="0.01" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} /></div>
              <Button type="submit" className="w-full">Criar Oportunidade</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3.5 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const stageOpps = opportunities.filter((o) => o.stage === stage.value);
          const stageTotal = stageOpps.reduce((s, o) => s + Number(o.estimated_value || 0), 0);
          return (
            <div key={stage.value} className="min-w-[220px] flex-1 bg-card border border-border rounded-[14px] p-4" style={{ borderTop: `3px solid ${stage.color}` }}>
              <div className="flex justify-between items-center mb-4">
                <span className="text-foreground font-bold text-[13px]">{stage.label}</span>
                <span className="text-[12px] font-bold rounded-full px-2 py-0.5" style={{ background: stage.color + "22", color: stage.color }}>{stageOpps.length}</span>
              </div>
              <div className="text-muted-foreground text-[12px] mb-4">R${stageTotal.toLocaleString("pt-BR")}</div>
              <div className="space-y-2">
                {stageOpps.slice(0, 5).map((opp) => (
                  <div key={opp.id} className="bg-background border border-border rounded-[10px] p-3 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => openEdit(opp)}>
                    <div className="text-foreground text-[12px] font-semibold mb-1">{opp.title}</div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-[11px]">{opp.client_name}</span>
                      <span className="text-[11px] font-semibold" style={{ color: stage.color }}>R${Number(opp.estimated_value).toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="flex gap-1 flex-wrap mt-2" onClick={e => e.stopPropagation()}>
                      {STAGES.filter(s => s.value !== opp.stage).slice(0, 3).map(s => (
                        <button key={s.value} onClick={() => moveStage(opp.id, s.value)}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors">
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <LossReasonDialog open={lossDialogOpen} onOpenChange={setLossDialogOpen} onConfirm={confirmLoss} />

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Oportunidade</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Título</Label><Input value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} /></div>
            <div className="space-y-2"><Label>Valor (R$)</Label><Input type="number" step="0.01" value={editForm.estimated_value} onChange={e => setEditForm({ ...editForm, estimated_value: e.target.value })} /></div>
            <Button onClick={handleEdit} className="w-full">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
