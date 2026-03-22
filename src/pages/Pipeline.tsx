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
import { Send } from "lucide-react";

const STAGES = [
  { value: "lead_recebido", label: "Lead Recebido", color: "hsl(var(--chart-1))" },
  { value: "contato_iniciado", label: "Contato Iniciado", color: "hsl(var(--chart-4))" },
  { value: "cliente_interessado", label: "Interessado", color: "hsl(var(--chart-4))" },
  { value: "negociacao", label: "Negociação", color: "hsl(var(--chart-3))" },
  { value: "proposta_enviada", label: "Proposta Enviada", color: "hsl(var(--chart-7))" },
  { value: "venda_fechada", label: "Venda Fechada", color: "hsl(var(--chart-2))" },
  { value: "perdido", label: "Perdido", color: "hsl(var(--destructive))" },
];

interface Opportunity { id: string; title: string; estimated_value: number; stage: string; client_name?: string; client_phone?: string; origin?: string; }
interface Client { id: string; name: string; phone: string; origin: string; }

export default function Pipeline() {
  const {  user } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: "", client_id: "", estimated_value: "", stage: "lead_recebido" });
  const [lossDialogOpen, setLossDialogOpen] = useState(false);
  const [pendingLossId, setPendingLossId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({ id: "", title: "", estimated_value: "" });

  // Bulk Message State
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkStage, setBulkStage] = useState<{ value: string; label: string } | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [bulkSending, setBulkSending] = useState(false);

  const fetchData = async () => {
        const [oppsRes, clientsRes] = await Promise.all([
      supabase.from("opportunities").select("*"),
      supabase.from("clients").select("id, name, phone, origin"),
    ]);
    const clientMap: Record<string, Client> = {};
    (clientsRes.data || []).forEach((c: any) => { clientMap[c.id] = c; });
    setOpportunities((oppsRes.data || []).map((o: any) => ({
      ...o,
      client_name: clientMap[o.client_id]?.name || "Cliente",
      client_phone: clientMap[o.client_id]?.phone || "",
      origin: clientMap[o.client_id]?.origin || "outro"
    })));
    setClients((clientsRes.data || []) as Client[]);
  };

  useEffect(() => { fetchData(); }, [tenantId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !user) return;
    const { error } = await supabase.from("opportunities").insert({
       title: form.title, client_id: form.client_id,
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

  const openBulkMessage = (stage: { value: string; label: string }) => {
    setBulkStage(stage);
    setBulkText("");
    setBulkDialogOpen(true);
  };

  const handleSendBulk = async () => {
    if (!bulkStage || !bulkText) return;
    const targetOpps = opportunities.filter(o => o.stage === bulkStage.value && o.client_phone);
    if (targetOpps.length === 0) {
      toast.error("Nenhum contato com telefone nesta etapa!");
      return;
    }

    const webhookUrl = localStorage.getItem(`whatsapp_n8n_send_webhook_${tenantId}`);
    if (!webhookUrl) {
      toast.error("URL do Webhook N8N não configurada! Ajuste em Conectar WhatsApp.");
      return;
    }

    setBulkSending(true);
    let successCount = 0;
    
    // Process purely client-side firing webhooks for each lead
    for (const opp of targetOpps) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ number: opp.client_phone, text: bulkText })
        });
        successCount++;
      } catch (err) {
        console.error("Erro ao enviar msg mkt:", err);
      }
    }

    setBulkSending(false);
    setBulkDialogOpen(false);
    toast.success(`Mensagens enviadas para ${successCount} leads!`);
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
            <div key={stage.value} className="min-w-[220px] max-w-[280px] flex-shrink-0 flex flex-col bg-card border border-border rounded-[14px] p-4" style={{ height: "calc(100vh - 180px)", borderTop: `3px solid ${stage.color}` }}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-foreground font-bold text-[13px]">{stage.label}</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => openBulkMessage(stage)} className="text-muted-foreground hover:text-primary transition-colors cursor-pointer" title="Disparo em Massa para esta coluna">
                    <Send className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[12px] font-bold rounded-full px-2 py-0.5" style={{ background: stage.color + "22", color: stage.color }}>{stageOpps.length}</span>
                </div>
              </div>
              <div className="text-muted-foreground text-[12px] mb-4">R${stageTotal.toLocaleString("pt-BR")}</div>
              
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {stageOpps.map((opp) => (
                  <div key={opp.id} className="bg-background border border-border rounded-[10px] p-3 shadow-sm cursor-pointer hover:border-primary/30 transition-colors" onClick={() => openEdit(opp)}>
                    <div className="text-foreground text-[12px] font-semibold mb-1">{opp.title}</div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-muted-foreground text-[11px] truncate flex-1 pr-2">{opp.client_name}</span>
                      <span className="text-[11px] font-semibold" style={{ color: stage.color }}>R${Number(opp.estimated_value).toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                       <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border/50 uppercase tracking-wide">
                          {opp.origin === "whatsapp" ? "WPP" : opp.origin === "loja_fisica" ? "LOJA" : opp.origin?.substring(0, 4) || "OUTR"}
                       </span>
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
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Disparo em Massa: {bulkStage?.label}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Esta mensagem será enviada pelo WhatsApp para todos os {opportunities.filter(o => o.stage === bulkStage?.value && o.client_phone).length} leads com telefone nesta coluna.
            </p>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <textarea
                className="w-full flex min-h-[120px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Ex: Olá! Vimos que você se interessou..."
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
              />
            </div>
            <Button onClick={handleSendBulk} disabled={bulkSending || !bulkText} className="w-full gap-2">
              {bulkSending ? "Enviando..." : <><Send className="h-4 w-4" /> Enviar Disparo</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
