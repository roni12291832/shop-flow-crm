import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Save, Trash2, Kanban, CheckSquare } from "lucide-react";
import { toast } from "sonner";

const ORIGINS = [
  { value: "whatsapp", label: "WhatsApp" }, { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" }, { value: "google", label: "Google" },
  { value: "indicacao", label: "Indicação" }, { value: "loja_fisica", label: "Loja Física" },
  { value: "site", label: "Site" }, { value: "outro", label: "Outro" },
];

interface ClientDetailDrawerProps {
  clientId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export function ClientDetailDrawer({ clientId, open, onOpenChange, onUpdate }: ClientDetailDrawerProps) {
  const { tenantId } = useAuth();
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "", origin: "outro", notes: "", tags: "" });
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!clientId || !open) return;
    const fetch_ = async () => {
      const [{ data: client }, { data: opps }, { data: tks }] = await Promise.all([
        supabase.from("clients").select("*").eq("id", clientId).single(),
        supabase.from("opportunities").select("id, title, stage, estimated_value").eq("client_id", clientId),
        supabase.from("tasks").select("id, title, status, due_date").eq("client_id", clientId),
      ]);
      if (client) {
        setForm({
          name: client.name || "", phone: client.phone || "", email: client.email || "",
          city: client.city || "", origin: client.origin || "outro", notes: client.notes || "",
          tags: (client.tags || []).join(", "),
        });
      }
      setOpportunities(opps || []);
      setTasks(tks || []);
    };
    fetch_();
  }, [clientId, open]);

  const handleSave = async () => {
    if (!clientId) return;
    setSaving(true);
    const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
    const { error } = await supabase.from("clients").update({
      name: form.name, phone: form.phone || null, email: form.email || null,
      city: form.city || null, origin: form.origin as any, notes: form.notes || null, tags,
    }).eq("id", clientId);
    setSaving(false);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Cliente atualizado!"); onUpdate(); }
  };

  const handleDelete = async () => {
    if (!clientId) return;
    const { error } = await supabase.from("clients").delete().eq("id", clientId);
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Cliente excluído!"); onOpenChange(false); onUpdate(); }
  };

  const STAGE_LABELS: Record<string, string> = {
    lead_recebido: "Lead", contato_iniciado: "Contato", cliente_interessado: "Interessado",
    negociacao: "Negociação", proposta_enviada: "Proposta", venda_fechada: "Fechada", perdido: "Perdido",
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalhes do Cliente</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 mt-6">
          <div className="space-y-2"><Label>Nome *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Telefone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-2"><Label>Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Cidade</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
            <div className="space-y-2"><Label>Origem</Label>
              <Select value={form.origin} onValueChange={v => setForm({ ...form, origin: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ORIGINS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2"><Label>Tags (separadas por vírgula)</Label><Input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="VIP, Recorrente" /></div>
          <div className="space-y-2"><Label>Notas</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} /></div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1 gap-1.5"><Save className="h-4 w-4" /> Salvar</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon"><Trash2 className="h-4 w-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
                  <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Opportunities */}
          <div>
            <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5 mb-2"><Kanban className="h-4 w-4" /> Oportunidades ({opportunities.length})</h4>
            {opportunities.length === 0 ? <p className="text-muted-foreground text-xs">Nenhuma oportunidade</p> : (
              <div className="space-y-1.5">
                {opportunities.map(o => (
                  <div key={o.id} className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2">
                    <span className="text-foreground text-xs font-medium">{o.title}</span>
                    <Badge variant="secondary" className="text-[10px]">{STAGE_LABELS[o.stage] || o.stage}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tasks */}
          <div>
            <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5 mb-2"><CheckSquare className="h-4 w-4" /> Tarefas ({tasks.length})</h4>
            {tasks.length === 0 ? <p className="text-muted-foreground text-xs">Nenhuma tarefa</p> : (
              <div className="space-y-1.5">
                {tasks.map(t => (
                  <div key={t.id} className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2">
                    <span className="text-foreground text-xs font-medium">{t.title}</span>
                    <Badge variant="secondary" className="text-[10px]">{t.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
