import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, Clock, Send, X, CheckCircle2,
  AlertCircle, BarChart2, Zap, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

const PYTHON_BACKEND_URL = "https://artificial-vivian-ggenciaglobalnexus-d093d570.koyeb.app";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Step {
  id?: string;
  step_number: number;
  delay_hours: number;
  message: string;
}

interface Template {
  id: string;
  name: string;
  is_active: boolean;
  steps: Step[];
}

interface Metrics {
  pending: number;
  sent_today: number;
  sent_total: number;
  failed_total: number;
  cancelled_total: number;
  daily_limit: number;
  recent_logs: {
    client_id: string;
    message_sent: string;
    status: string;
    sent_at: string;
    error?: string;
  }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiFetch(path: string, method = "GET", body?: any) {
  const res = await fetch(`${PYTHON_BACKEND_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

const DELAY_LABELS: Record<number, string> = {
  1: "1h depois",
  2: "2h depois",
  3: "3h depois",
  6: "6h depois",
  12: "12h depois",
  24: "1 dia depois",
  48: "2 dias depois",
  72: "3 dias depois",
  96: "4 dias depois",
  120: "5 dias depois",
  168: "1 semana depois",
};

function delayLabel(h: number) {
  return DELAY_LABELS[h] || `${h}h depois`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FollowUp() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);

  // Dialog de criar/editar template
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [formName, setFormName] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formSteps, setFormSteps] = useState<Step[]>([]);

  // Confirmação de deletar
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/followup/templates");
      setTemplates(data.templates || []);
    } catch (e: any) {
      toast.error("Erro ao carregar templates: " + e.message);
    }
    setLoading(false);
  }, []);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const data = await apiFetch("/followup/metrics");
      setMetrics(data);
    } catch {
      // silencioso — métricas são opcionais
    }
    setMetricsLoading(false);
  }, []);

  useEffect(() => {
    loadTemplates();
    loadMetrics();
  }, [loadTemplates, loadMetrics]);

  // ── Abrir dialog ────────────────────────────────────────────────────────────
  function openNew() {
    setEditing(null);
    setFormName("");
    setFormActive(true);
    setFormSteps([{ step_number: 1, delay_hours: 1, message: "" }]);
    setDlgOpen(true);
  }

  function openEdit(t: Template) {
    setEditing(t);
    setFormName(t.name);
    setFormActive(t.is_active);
    setFormSteps(t.steps.length ? t.steps.map(s => ({ ...s })) : [{ step_number: 1, delay_hours: 1, message: "" }]);
    setDlgOpen(true);
  }

  // ── Step helpers ────────────────────────────────────────────────────────────
  function addStep() {
    const last = formSteps[formSteps.length - 1];
    setFormSteps(prev => [
      ...prev,
      { step_number: (last?.step_number ?? 0) + 1, delay_hours: 24, message: "" },
    ]);
  }

  function removeStep(idx: number) {
    setFormSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_number: i + 1 })));
  }

  function updateStep(idx: number, field: keyof Step, value: any) {
    setFormSteps(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }

  // ── Salvar template ─────────────────────────────────────────────────────────
  async function saveTemplate() {
    if (!formName.trim()) { toast.error("Informe o nome do template"); return; }
    if (formSteps.some(s => !s.message.trim())) { toast.error("Preencha a mensagem de todos os steps"); return; }

    const body = { name: formName.trim(), is_active: formActive, steps: formSteps };
    try {
      if (editing) {
        await apiFetch(`/followup/templates/${editing.id}`, "PUT", body);
        toast.success("Template atualizado!");
      } else {
        await apiFetch("/followup/templates", "POST", body);
        toast.success("Template criado!");
      }
      setDlgOpen(false);
      loadTemplates();
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    }
  }

  // ── Deletar template ────────────────────────────────────────────────────────
  async function confirmDelete() {
    if (!deleteId) return;
    try {
      await apiFetch(`/followup/templates/${deleteId}`, "DELETE");
      toast.success("Template removido");
      setDeleteId(null);
      loadTemplates();
    } catch (e: any) {
      toast.error("Erro ao remover: " + e.message);
    }
  }

  // ── Toggle active ───────────────────────────────────────────────────────────
  async function toggleActive(t: Template) {
    try {
      await apiFetch(`/followup/templates/${t.id}`, "PUT", {
        name: t.name,
        is_active: !t.is_active,
        steps: t.steps,
      });
      loadTemplates();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Follow-Up Automático
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sequências de mensagens para leads novos — até 25/dia, 08h–18h, anti-ban
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadTemplates(); loadMetrics(); }}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Atualizar
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Novo Template
          </Button>
        </div>
      </div>

      {/* Métricas */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <MetricCard icon={<Clock className="h-4 w-4 text-yellow-500" />} label="Pendentes" value={metrics.pending} />
          <MetricCard icon={<Send className="h-4 w-4 text-green-500" />} label="Enviados hoje" value={`${metrics.sent_today} / ${metrics.daily_limit}`} />
          <MetricCard icon={<CheckCircle2 className="h-4 w-4 text-blue-500" />} label="Total enviados" value={metrics.sent_total} />
          <MetricCard icon={<AlertCircle className="h-4 w-4 text-red-500" />} label="Falharam" value={metrics.failed_total} />
          <MetricCard icon={<X className="h-4 w-4 text-muted-foreground" />} label="Cancelados" value={metrics.cancelled_total} />
        </div>
      )}

      {/* Lista de templates */}
      {loading ? (
        <div className="flex justify-center py-12 text-muted-foreground text-sm">Carregando templates...</div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Zap className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm text-center">
              Nenhum template criado ainda.<br />
              Crie um para automatizar o follow-up de novos leads.
            </p>
            <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1.5" />Criar template</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <Card key={t.id}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <Switch checked={t.is_active} onCheckedChange={() => toggleActive(t)} />
                  <div>
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{t.steps.length} step{t.steps.length !== 1 ? "s" : ""}</p>
                  </div>
                  <Badge variant={t.is_active ? "default" : "secondary"} className="text-[10px]">
                    {t.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              {t.steps.length > 0 && (
                <CardContent>
                  <div className="relative pl-5 space-y-2">
                    {t.steps.map((s, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                          {i < t.steps.length - 1 && <div className="w-px flex-1 bg-border mt-0.5" style={{ minHeight: 20 }} />}
                        </div>
                        <div className="pb-2">
                          <p className="text-xs font-medium text-muted-foreground mb-0.5">
                            Step {s.step_number} — {delayLabel(s.delay_hours)}
                          </p>
                          <p className="text-sm leading-relaxed line-clamp-2">{s.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Logs recentes */}
      {metrics && metrics.recent_logs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="h-4 w-4" />Últimos disparos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {metrics.recent_logs.map((log, i) => (
                <div key={i} className="flex items-start gap-3 text-xs py-1.5 border-b border-border last:border-0">
                  <Badge
                    variant={log.status === "sent" ? "default" : log.status === "failed" ? "destructive" : "secondary"}
                    className="text-[10px] mt-0.5 flex-shrink-0"
                  >
                    {log.status === "sent" ? "Enviado" : log.status === "failed" ? "Falhou" : log.status}
                  </Badge>
                  <span className="flex-1 line-clamp-1 text-muted-foreground">{log.message_sent}</span>
                  <span className="text-muted-foreground/60 flex-shrink-0">
                    {new Date(log.sent_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Template" : "Novo Template de Follow-Up"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              <div className="space-y-1.5">
                <Label>Nome do template</Label>
                <Input
                  placeholder="Ex: Sequência Lead Novo"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 pb-0.5">
                <Switch checked={formActive} onCheckedChange={setFormActive} />
                <span className="text-sm">{formActive ? "Ativo" : "Inativo"}</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Sequência de mensagens</Label>
                <Button variant="outline" size="sm" onClick={addStep}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Adicionar step
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Use <code className="bg-muted px-1 rounded">{"{nome}"}</code> para personalizar com o nome do cliente.
                A sequência é suspensa automaticamente quando o cliente responder ou avançar no pipeline.
              </p>
              <div className="space-y-3">
                {formSteps.map((step, idx) => (
                  <div key={idx} className="border border-border rounded-lg p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Step {step.step_number}</span>
                      {formSteps.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => removeStep(idx)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Enviar após (horas)</Label>
                        <Input
                          type="number"
                          min={1}
                          value={step.delay_hours}
                          onChange={e => updateStep(idx, "delay_hours", parseInt(e.target.value) || 1)}
                        />
                        <p className="text-[10px] text-muted-foreground">{delayLabel(step.delay_hours)}</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Mensagem</Label>
                      <Textarea
                        rows={3}
                        placeholder={`Olá {nome}, tudo bem? Sou da [loja]...`}
                        value={step.message}
                        onChange={e => updateStep(idx, "message", e.target.value)}
                      />
                      <p className="text-[10px] text-muted-foreground">{step.message.length} caracteres</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgOpen(false)}>Cancelar</Button>
            <Button onClick={saveTemplate}>{editing ? "Salvar alterações" : "Criar template"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert de deletar */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover template?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso cancela todos os agendamentos pendentes vinculados a este template. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs text-muted-foreground">{label}</span></div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
