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
import { Plus, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { LossReasonDialog } from "@/components/crm/LossReasonDialog";

const PYTHON_BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function notifyStageChange(clientId: string, opportunityId: string, newStage: string, oldStage?: string) {
  try {
    await fetch(`${PYTHON_BACKEND_URL}/followup/on-stage-change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, opportunity_id: opportunityId, new_stage: newStage, old_stage: oldStage }),
    });
  } catch { /* silent — follow-up is not critical for UX */ }
}

const STAGES = [
  { value: "lead_novo", label: "Lead Novo", color: "hsl(var(--chart-1))" },
  { value: "contato_iniciado", label: "Contato Iniciado", color: "hsl(var(--chart-4))" },
  { value: "interessado", label: "Interessado", color: "hsl(var(--chart-3))" },
  { value: "comprador", label: "Comprador", color: "hsl(var(--chart-2))" },
  { value: "perdido", label: "Perdido", color: "hsl(var(--destructive))" },
  { value: "desqualificado", label: "Desqualificado", color: "hsl(var(--muted-foreground))" },
];

interface Opportunity { id: string; title: string; estimated_value: number; stage: string; client_id?: string; client_name?: string; client_phone?: string; client_email?: string; client_city?: string; client_notes?: string; origin?: string; }
interface Client { id: string; name: string; phone: string; email?: string; city?: string; notes?: string; origin: string; }

export default function Pipeline() {
  const {  user } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: "", client_id: "", estimated_value: "", stage: "lead_novo" });
  const [lossDialogOpen, setLossDialogOpen] = useState(false);
  const [pendingLossId, setPendingLossId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({ id: "", title: "", estimated_value: "", client_id: "", client_name: "", client_phone: "", client_email: "", client_city: "", client_notes: "", origin: "" });

  const fetchData = async () => {
        const [oppsRes, clientsRes] = await Promise.all([
      supabase.from("opportunities").select("*"),
      supabase.from("clients").select("id, name, phone, email, city, notes, origin"),
    ]);
    const clientMap: Record<string, Client> = {};
    (clientsRes.data || []).forEach((c: any) => { clientMap[c.id] = c; });
    setOpportunities((oppsRes.data || []).map((o: any) => ({
      ...o,
      client_name: clientMap[o.client_id]?.name || "Cliente",
      client_phone: clientMap[o.client_id]?.phone || "",
      client_email: clientMap[o.client_id]?.email || "",
      client_city: clientMap[o.client_id]?.city || "",
      client_notes: clientMap[o.client_id]?.notes || "",
      origin: clientMap[o.client_id]?.origin || "outro"
    })));
    setClients((clientsRes.data || []) as Client[]);
  };

  useEffect(() => {
    fetchData();

    // Realtime — atualiza pipeline automaticamente quando leads chegam ou mudam de etapa
    const channel = supabase
      .channel("pipeline-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "opportunities" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            toast.info("🔔 Novo lead no pipeline!");
            fetchData();
          }
          if (payload.eventType === "UPDATE") {
            fetchData();
          }
          if (payload.eventType === "DELETE") {
            fetchData();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("opportunities").insert({
       title: form.title, client_id: form.client_id,
      estimated_value: parseFloat(form.estimated_value) || 0, stage: form.stage as any, responsible_id: user.id,
    });
    if (error) toast.error("Erro ao criar oportunidade");
    else { toast.success("Oportunidade criada!"); setDialogOpen(false); setForm({ title: "", client_id: "", estimated_value: "", stage: "lead_novo" }); fetchData(); }
  };

  const moveStage = async (oppId: string, newStage: string) => {
    if (newStage === "perdido") {
      setPendingLossId(oppId);
      setLossDialogOpen(true);
      return;
    }
    const opp = opportunities.find(o => o.id === oppId);
    await supabase.from("opportunities").update({ stage: newStage as any }).eq("id", oppId);
    if (opp?.client_id) {
      notifyStageChange(opp.client_id, oppId, newStage, opp.stage);
    }
    fetchData();
  };

  const confirmLoss = async (reason: string, notes: string) => {
    if (!pendingLossId) return;
    const opp = opportunities.find(o => o.id === pendingLossId);
    await supabase.from("opportunities").update({
      stage: "perdido" as any, loss_reason: reason as any, loss_notes: notes || null,
    }).eq("id", pendingLossId);
    if (opp?.client_id) {
      notifyStageChange(opp.client_id, pendingLossId, "perdido", opp.stage);
    }
    setLossDialogOpen(false);
    setPendingLossId(null);
    toast.info("Oportunidade marcada como perdida");
    fetchData();
  };

  const openEdit = (opp: Opportunity) => {
    setEditForm({
      id: opp.id,
      title: opp.title,
      estimated_value: String(opp.estimated_value),
      client_id: opp.client_id || "",
      client_name: opp.client_name || "",
      client_phone: opp.client_phone || "",
      client_email: opp.client_email || "",
      client_city: opp.client_city || "",
      client_notes: opp.client_notes || "",
      origin: opp.origin || "outro",
    });
    setEditDialogOpen(true);
  };

  const handleEdit = async () => {
    const oppUpdate = supabase.from("opportunities").update({
      title: editForm.title, estimated_value: parseFloat(editForm.estimated_value) || 0,
    }).eq("id", editForm.id);

    const promises: any[] = [oppUpdate];

    if (editForm.client_id) {
      const clientUpdate = supabase.from("clients").update({
        name: editForm.client_name,
        phone: editForm.client_phone,
        email: editForm.client_email || null,
        city: editForm.client_city || null,
        notes: editForm.client_notes || null,
        origin: editForm.origin as any,
      }).eq("id", editForm.client_id);
      promises.push(clientUpdate);
    }

    const results = await Promise.all(promises);
    const hasError = results.some((r: any) => r.error);
    if (hasError) toast.error("Erro ao atualizar");
    else { toast.success("Lead atualizado!"); setEditDialogOpen(false); fetchData(); }
  };

  const handleDragStart = (e: React.DragEvent, oppId: string) => {
    e.dataTransfer.setData("oppId", oppId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, newStage: string) => {
    e.preventDefault();
    const oppId = e.dataTransfer.getData("oppId");
    if (oppId) {
      moveStage(oppId, newStage);
    }
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
              <div className="space-y-2"><Label>Valor da negociação (R$)</Label><Input type="number" step="0.01" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} /></div>
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
            <div key={stage.value} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, stage.value)} className="min-w-[220px] max-w-[280px] flex-shrink-0 flex flex-col bg-card border border-border rounded-[14px] p-4" style={{ height: "calc(100vh - 180px)", borderTop: `3px solid ${stage.color}` }}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-foreground font-bold text-[13px]">{stage.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-bold rounded-full px-2 py-0.5" style={{ background: stage.color + "22", color: stage.color }}>{stageOpps.length}</span>
                </div>
              </div>
              <div className="text-muted-foreground text-[12px] mb-4">R${stageTotal.toLocaleString("pt-BR")}</div>
              
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {stageOpps.map((opp) => (
                  <div key={opp.id} draggable onDragStart={(e) => handleDragStart(e, opp.id)} className="bg-background border border-border rounded-[10px] p-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-primary/30 transition-colors" onClick={() => openEdit(opp)}>
                    <div className="text-foreground text-[12px] font-semibold mb-1">{opp.title}</div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-muted-foreground text-[11px] truncate flex-1 pr-2">{opp.client_name}</span>
                      <span className="text-[11px] font-semibold" style={{ color: stage.color }}>R${Number(opp.estimated_value).toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                       {opp.origin === "whatsapp" ? (
                         <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/30 flex items-center gap-1 shadow-sm">
                           <MessageCircle className="h-3 w-3" /> WhatsApp
                         </span>
                       ) : (
                         <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border/50 uppercase tracking-wide">
                            {opp.origin === "loja_fisica" ? "LOJA" : opp.origin?.substring(0, 8) || "OUTR"}
                         </span>
                       )}
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Lead</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Dados do Cliente</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2"><Label>Nome</Label><Input value={editForm.client_name} onChange={e => setEditForm({ ...editForm, client_name: e.target.value })} placeholder="Nome completo" /></div>
              <div className="space-y-1.5"><Label>Telefone</Label><Input value={editForm.client_phone} onChange={e => setEditForm({ ...editForm, client_phone: e.target.value })} placeholder="5511999999999" /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={editForm.client_email} onChange={e => setEditForm({ ...editForm, client_email: e.target.value })} placeholder="email@exemplo.com" /></div>
              <div className="space-y-1.5"><Label>Cidade</Label><Input value={editForm.client_city} onChange={e => setEditForm({ ...editForm, client_city: e.target.value })} placeholder="São Paulo" /></div>
              <div className="space-y-1.5">
                <Label>Origem</Label>
                <Select value={editForm.origin} onValueChange={v => setEditForm({ ...editForm, origin: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="loja_fisica">Loja Física</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="indicacao">Indicação</SelectItem>
                    <SelectItem value="site">Site</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2"><Label>Observações</Label>
                <textarea className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={editForm.client_notes} onChange={e => setEditForm({ ...editForm, client_notes: e.target.value })} placeholder="Anotações sobre o cliente..." />
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider pt-2 border-t border-border">Oportunidade</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2"><Label>Título</Label><Input value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Valor da negociação (R$)</Label><Input type="number" step="0.01" value={editForm.estimated_value} onChange={e => setEditForm({ ...editForm, estimated_value: e.target.value })} /></div>
            </div>
            <Button onClick={handleEdit} className="w-full">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
