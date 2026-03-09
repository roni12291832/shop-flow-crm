import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, CheckSquare, Clock, Loader2, Calendar, User } from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG = {
  pendente: { label: "Pendente", color: "bg-warning/10 text-warning border-warning/30" },
  em_andamento: { label: "Em Andamento", color: "bg-primary/10 text-primary border-primary/30" },
  concluido: { label: "Concluído", color: "bg-success/10 text-success border-success/30" },
};

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "pendente" | "em_andamento" | "concluido";
  due_date: string | null;
  client_id: string | null;
  responsible_id: string | null;
  created_at: string;
}

interface Client {
  id: string;
  name: string;
}

export default function Tasks() {
  const { tenantId, user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    due_date: "",
    client_id: "",
    status: "pendente" as string,
  });

  const fetchData = async () => {
    if (!tenantId) return;
    const [tasksRes, clientsRes] = await Promise.all([
      supabase.from("tasks").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      supabase.from("clients").select("id, name").eq("tenant_id", tenantId),
    ]);
    if (tasksRes.data) setTasks(tasksRes.data as Task[]);
    if (clientsRes.data) setClients(clientsRes.data as Client[]);
  };

  useEffect(() => { fetchData(); }, [tenantId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !user) return;
    const { error } = await supabase.from("tasks").insert({
      tenant_id: tenantId,
      title: form.title,
      description: form.description || null,
      due_date: form.due_date || null,
      client_id: form.client_id || null,
      responsible_id: user.id,
      status: form.status as any,
    });
    if (error) {
      toast.error("Erro ao criar tarefa");
    } else {
      toast.success("Tarefa criada!");
      setDialogOpen(false);
      setForm({ title: "", description: "", due_date: "", client_id: "", status: "pendente" });
      fetchData();
    }
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("tasks").update({ status: status as any }).eq("id", id);
    fetchData();
  };

  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  const counts = {
    all: tasks.length,
    pendente: tasks.filter((t) => t.status === "pendente").length,
    em_andamento: tasks.filter((t) => t.status === "em_andamento").length,
    concluido: tasks.filter((t) => t.status === "concluido").length,
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tarefas</h1>
          <p className="text-muted-foreground">{tasks.length} tarefas registradas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Nova Tarefa</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Tarefa</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="Ex: Ligar para cliente" />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Detalhes da tarefa..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data Limite</Label>
                  <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" className="w-full">Criar Tarefa</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { key: "all", label: "Todas" },
          { key: "pendente", label: "Pendentes" },
          { key: "em_andamento", label: "Em Andamento" },
          { key: "concluido", label: "Concluídas" },
        ].map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.key)}
            className="gap-1.5"
          >
            {f.label}
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">
              {counts[f.key as keyof typeof counts]}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              <CheckSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nenhuma tarefa encontrada</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((task) => {
            const config = STATUS_CONFIG[task.status];
            const client = clients.find((c) => c.id === task.client_id);
            return (
              <Card key={task.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium truncate">{task.title}</h3>
                      <Badge variant="outline" className={`text-[10px] ${config.color}`}>
                        {config.label}
                      </Badge>
                    </div>
                    {task.description && (
                      <p className="text-sm text-muted-foreground truncate">{task.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      {task.due_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(task.due_date).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                      {client && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {client.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <Select value={task.status} onValueChange={(v) => updateStatus(task.id, v)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="em_andamento">Em Andamento</SelectItem>
                      <SelectItem value="concluido">Concluído</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
