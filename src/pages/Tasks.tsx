import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, CheckSquare, Calendar, User, Trash2 } from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "hsl(var(--chart-3))" },
  em_andamento: { label: "Em Andamento", color: "hsl(var(--chart-1))" },
  concluido: { label: "Concluído", color: "hsl(var(--chart-2))" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  alta: { label: "Alta", color: "hsl(var(--destructive))" },
  media: { label: "Média", color: "hsl(var(--chart-3))" },
  baixa: { label: "Baixa", color: "hsl(var(--chart-1))" },
};

interface Task { id: string; title: string; description: string | null; status: string; priority: string; due_date: string | null; client_id: string | null; responsible_id: string | null; }
interface Client { id: string; name: string; }
interface ProfileItem { user_id: string; name: string; }

export default function Tasks() {
  const {  user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [members, setMembers] = useState<ProfileItem[]>([]);
  const [filter, setFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", due_date: "", client_id: "", status: "pendente", priority: "media", responsible_id: "" });

  const fetchData = async () => {
        const [t, c, m] = await Promise.all([
      supabase.from("tasks").select("*").order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("clients").select("id, name"),
      supabase.from("profiles").select("user_id, name"),
    ]);
    if (t.data) setTasks(t.data as Task[]);
    if (c.data) setClients(c.data as Client[]);
    if (m.data) setMembers(m.data as ProfileItem[]);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("tasks").insert({
       title: form.title, description: form.description || null,
      due_date: form.due_date || null, client_id: form.client_id || null,
      responsible_id: form.responsible_id || null, status: form.status as any, priority: form.priority as any,
    });
    if (error) toast.error("Erro ao criar tarefa");
    else { toast.success("Tarefa criada!"); setDialogOpen(false); setForm({ title: "", description: "", due_date: "", client_id: "", status: "pendente", priority: "media", responsible_id: "" }); fetchData(); }
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("tasks").update({ status: status as any }).eq("id", id);
    fetchData();
  };

  const deleteTask = async (id: string) => {
    await supabase.from("tasks").delete().eq("id", id);
    toast.success("Tarefa excluída");
    fetchData();
  };

  const filtered = filter === "all" ? tasks : tasks.filter(t => t.status === filter);
  const counts = { all: tasks.length, pendente: tasks.filter(t => t.status === "pendente").length, em_andamento: tasks.filter(t => t.status === "em_andamento").length, concluido: tasks.filter(t => t.status === "concluido").length };

  // Sort by priority then date
  const sorted = [...filtered].sort((a, b) => {
    const pOrder: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
    const pa = pOrder[a.priority] ?? 1;
    const pb = pOrder[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    return 0;
  });

  return (
    <div className="p-7 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">{tasks.length} tarefas registradas</p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Nova Tarefa</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Tarefa</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2"><Label>Título *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="Ex: Organização do Salão" /></div>
              <div className="space-y-2"><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Detalhes da tarefa..." /></div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Responsável</Label>
                  <Select value={form.responsible_id} onValueChange={(v) => setForm({ ...form, responsible_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Geral (Todos)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Geral (Todos da Equipe)</SelectItem>
                      {members.map(m => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Prioridade</Label>
                  <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="baixa">Baixa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Data Limite</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
                <div className="space-y-2"><Label>Vincular a Cliente (Opcional)</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Nenhum / Tarefa Interna" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhum (Tarefa Interna)</SelectItem>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button type="submit" className="w-full mt-4">Criar Tarefa</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[{ key: "all", label: "Todas" }, { key: "pendente", label: "Pendentes" }, { key: "em_andamento", label: "Em Andamento" }, { key: "concluido", label: "Concluídas" }].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-[10px] text-[13px] font-semibold transition-all border ${
              filter === f.key ? "bg-primary/20 text-primary border-primary/40" : "bg-card text-muted-foreground border-border hover:bg-secondary"
            }`}>
            {f.label} <span className="ml-1 text-[11px] opacity-70">{counts[f.key as keyof typeof counts]}</span>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {sorted.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
            <CheckSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>Nenhuma tarefa encontrada</p>
          </div>
        ) : sorted.map(task => {
          const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.pendente;
          const pConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.media;
          const client = clients.find(c => c.id === task.client_id);
          return (
            <div key={task.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4 hover:border-primary/20 transition-colors" style={{ borderLeft: `3px solid ${pConfig.color}` }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-sm text-foreground truncate">{task.title}</h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: config.color + "22", color: config.color }}>{config.label}</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase" style={{ background: pConfig.color + "22", color: pConfig.color }}>{pConfig.label}</span>
                </div>
                {task.description && <p className="text-[13px] text-muted-foreground truncate">{task.description}</p>}
                <div className="flex items-center gap-4 mt-1.5 text-[12px] text-muted-foreground">
                  {task.due_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(task.due_date).toLocaleDateString("pt-BR")}</span>}
                  {client && <span className="flex items-center gap-1"><User className="h-3 w-3" />{client.name}</span>}
                  <span className="italic">{task.responsible_id ? members.find(m => m.user_id === task.responsible_id)?.name || "—" : "Geral"}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={task.status} onValueChange={(v) => updateStatus(task.id, v)}>
                  <SelectTrigger className="w-36 bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteTask(task.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
