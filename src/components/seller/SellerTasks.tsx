import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CheckSquare, Calendar, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  responsible_id: string | null;
}

export function SellerTasks() {
  const {  user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState("pendente");

  const fetchTasks = async () => {
    if (!tenantId || !user) return;
    // Fetch tasks assigned to this seller OR general (no responsible)
    const { data } = await supabase
      .from("tasks")
      .select("id, title, description, status, priority, due_date, responsible_id")
      
      .or(`responsible_id.eq.${user.id},responsible_id.is.null`)
      .order("due_date", { ascending: true, nullsFirst: false });
    setTasks((data || []) as Task[]);
  };

  useEffect(() => { fetchTasks(); }, [tenantId, user]);

  const updateStatus = async (id: string, newStatus: string) => {
    await supabase.from("tasks").update({ status: newStatus as any }).eq("id", id);
    fetchTasks();
  };

  const nextStatus = (current: string) => {
    if (current === "pendente") return "em_andamento";
    if (current === "em_andamento") return "concluido";
    return "pendente";
  };

  const filtered = tasks.filter(t => filter === "all" ? true : t.status === filter);
  const sorted = [...filtered].sort((a, b) => {
    const pOrder: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
    return (pOrder[a.priority] ?? 1) - (pOrder[b.priority] ?? 1);
  });

  const counts = {
    all: tasks.length,
    pendente: tasks.filter(t => t.status === "pendente").length,
    em_andamento: tasks.filter(t => t.status === "em_andamento").length,
    concluido: tasks.filter(t => t.status === "concluido").length,
  };

  return (
    <div className="px-5 pt-8 pb-4 space-y-5 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-foreground">Minhas Tarefas</h1>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: "pendente", label: "Pendentes" },
          { key: "em_andamento", label: "Em Andamento" },
          { key: "concluido", label: "Concluídas" },
          { key: "all", label: "Todas" },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all",
              filter === f.key
                ? "bg-primary/20 text-primary border-primary/40"
                : "bg-card text-muted-foreground border-border"
            )}
          >
            {f.label} <span className="opacity-60 ml-0.5">{counts[f.key as keyof typeof counts]}</span>
          </button>
        ))}
      </div>

      {/* Task list */}
      {sorted.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
          <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhuma tarefa</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(task => {
            const sConf = STATUS_CONFIG[task.status] || STATUS_CONFIG.pendente;
            const pConf = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.media;
            const next = nextStatus(task.status);
            const nextLabel = STATUS_CONFIG[next]?.label || next;

            return (
              <div
                key={task.id}
                className="bg-card border border-border rounded-xl p-4 active:scale-[0.98] transition-all"
                style={{ borderLeft: `3px solid ${pConf.color}` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm text-foreground">{task.title}</h3>
                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: sConf.color + "22", color: sConf.color }}
                      >
                        {sConf.label}
                      </span>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase"
                        style={{ background: pConf.color + "22", color: pConf.color }}
                      >
                        {pConf.label}
                      </span>
                      {task.due_date && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Calendar className="h-3 w-3" />
                          {new Date(task.due_date).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                      {!task.responsible_id && (
                        <span className="text-[10px] text-muted-foreground italic">Geral</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => updateStatus(task.id, next)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-lg shrink-0"
                  >
                    {nextLabel} <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
