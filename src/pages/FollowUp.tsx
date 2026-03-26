import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus, Trash2, Save, AlertTriangle, CheckCircle2, BarChart2,
  Zap, RefreshCw, Clock, Send, X, Bot, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

const PYTHON_BACKEND_URL = "https://artificial-vivian-ggenciaglobalnexus-d093d570.koyeb.app";

// ─── Types ─────────────────────────────────────────────────────────────────

interface StepMessage { id: string; variation_number: number; message: string; }
interface Step {
  id: string;
  stage: string;
  step_number: number;
  delay_hours: number;
  min_variations: number;
  auto_move_to: string | null;
  messages: StepMessage[];
  message_count: number;
  has_minimum: boolean;
}
interface StageConfig { [stage: string]: Step[]; }
interface Metrics {
  stages: Record<string, { label: string; pending: number; sent_today: number; daily_limit: number; sent_total: number }>;
  recent_logs: { client_id: string; stage: string; step_number: number; message_sent: string; status: string; sent_at: string; error?: string }[];
  total_pending: number;
  auto_moved_today: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function apiFetch(path: string, method = "GET", body?: any) {
  const res = await fetch(`${PYTHON_BACKEND_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`); }
  return res.json();
}

function delayLabel(h: number): string {
  if (h < 24) return `${h}h após entrar na etapa`;
  const d = Math.floor(h / 24);
  const rem = h % 24;
  return rem === 0 ? `${d} dia${d > 1 ? "s" : ""} após entrar na etapa` : `${d}d ${rem}h após entrar na etapa`;
}

const STAGE_LABELS: Record<string, string> = {
  contato_iniciado: "Contato Iniciado",
  interessado: "Interessado",
  comprador: "Comprador",
};

const STAGE_COLORS: Record<string, string> = {
  contato_iniciado: "text-blue-500",
  interessado: "text-yellow-500",
  comprador: "text-green-500",
};

// ─── Component ────────────────────────────────────────────────────────────

export default function FollowUp() {
  const [config, setConfig] = useState<StageConfig>({});
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<Record<string, string[]>>({});
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [baseMessages, setBaseMessages] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgData, mData] = await Promise.all([
        apiFetch("/followup/config"),
        apiFetch("/followup/metrics").catch(() => null),
      ]);
      setConfig(cfgData);
      if (mData) setMetrics(mData);
      // Initialize local messages from loaded config
      const local: Record<string, string[]> = {};
      for (const steps of Object.values(cfgData) as Step[][]) {
        for (const step of steps) {
          local[step.id] = step.messages.map((m: StepMessage) => m.message);
          if (local[step.id].length === 0) {
            local[step.id] = Array(step.min_variations).fill("");
          }
        }
      }
      setLocalMessages(local);
    } catch (e: any) {
      toast.error("Erro ao carregar configurações: " + e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleStep(stepId: string) {
    setExpandedSteps(prev => {
      const n = new Set(prev);
      n.has(stepId) ? n.delete(stepId) : n.add(stepId);
      return n;
    });
  }

  function updateMsg(stepId: string, idx: number, value: string) {
    setLocalMessages(prev => {
      const msgs = [...(prev[stepId] || [])];
      msgs[idx] = value;
      return { ...prev, [stepId]: msgs };
    });
  }

  function addRow(stepId: string) {
    setLocalMessages(prev => ({ ...prev, [stepId]: [...(prev[stepId] || []), ""] }));
  }

  function removeRow(stepId: string, idx: number) {
    setLocalMessages(prev => {
      const msgs = (prev[stepId] || []).filter((_, i) => i !== idx);
      return { ...prev, [stepId]: msgs };
    });
  }

  async function saveStep(step: Step) {
    const msgs = (localMessages[step.id] || []).filter(m => m.trim());
    if (msgs.length < step.min_variations) {
      toast.error(`Mínimo ${step.min_variations} variações para este step. Você tem ${msgs.length}.`);
      return;
    }
    setSaving(step.id);
    try {
      await apiFetch(`/followup/config/${step.id}/messages`, "PUT", msgs);
      toast.success(`Step ${step.step_number} de "${STAGE_LABELS[step.stage]}" salvo com ${msgs.length} variações!`);
      load();
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    }
    setSaving(null);
  }

  async function generateWithJarvis(step: Step) {
    const base = baseMessages[step.id] || "";
    if (!base.trim()) {
      toast.error("Digite uma mensagem base para gerar variações");
      return;
    }
    setGenerating(step.id);
    try {
      const data = await apiFetch("/jarvis/variations", "POST", {
        message: `Gere ${step.min_variations} variações desta mensagem de follow-up para leads na etapa "${STAGE_LABELS[step.stage]}" (step ${step.step_number}, ${delayLabel(step.delay_hours)}). Mantenha o mesmo objetivo mas com palavras, estrutura e tom diferentes. Mensagem base: "${base}"`,
      });
      const variations: string[] = (data.variations || "").split("\n").filter((v: string) => v.trim());
      if (variations.length > 0) {
        setLocalMessages(prev => ({ ...prev, [step.id]: variations }));
        toast.success(`${variations.length} variações geradas pelo Jarvis!`);
      } else {
        toast.error("Jarvis não retornou variações válidas");
      }
    } catch (e: any) {
      toast.error("Erro ao gerar com Jarvis: " + e.message);
    }
    setGenerating(null);
  }

  function renderStep(step: Step) {
    const msgs = localMessages[step.id] || [];
    const filledMsgs = msgs.filter(m => m.trim());
    const hasMin = filledMsgs.length >= step.min_variations;
    const isExpanded = expandedSteps.has(step.id);

    return (
      <div key={step.id} className="border border-border rounded-lg overflow-hidden">
        {/* Step header */}
        <button
          className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
          onClick={() => toggleStep(step.id)}
        >
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-bold flex-shrink-0">
            {step.step_number}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">{delayLabel(step.delay_hours)}</span>
              {step.auto_move_to && (
                <Badge variant="destructive" className="text-[10px]">
                  → {step.auto_move_to} se sem resposta
                </Badge>
              )}
            </div>
          </div>
          <Badge variant={hasMin ? "default" : "destructive"} className="text-[10px] ml-auto mr-2">
            {filledMsgs.length}/{step.min_variations} variações
            {hasMin ? <CheckCircle2 className="h-3 w-3 ml-1 inline" /> : <AlertTriangle className="h-3 w-3 ml-1 inline" />}
          </Badge>
          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {/* Step body */}
        {isExpanded && (
          <div className="p-4 space-y-3">
            {!hasMin && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>Adicione pelo menos <strong>{step.min_variations}</strong> variações para ativar este step (anti-bloqueio WhatsApp)</span>
              </div>
            )}

            {/* Gerar com Jarvis */}
            <div className="flex gap-2">
              <Input
                placeholder="Digite uma mensagem base para gerar variações com IA..."
                value={baseMessages[step.id] || ""}
                onChange={e => setBaseMessages(prev => ({ ...prev, [step.id]: e.target.value }))}
                className="text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateWithJarvis(step)}
                disabled={generating === step.id}
                className="flex-shrink-0 gap-1.5"
              >
                <Bot className="h-3.5 w-3.5" />
                {generating === step.id ? "Gerando..." : "Jarvis"}
              </Button>
            </div>

            {/* Variações */}
            <div className="space-y-2">
              {msgs.map((msg, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <span className="text-xs text-muted-foreground w-5 mt-2.5 flex-shrink-0 text-right">{idx + 1}</span>
                  <Textarea
                    rows={2}
                    placeholder={`Variação ${idx + 1} — use {nome} para personalizar`}
                    value={msg}
                    onChange={e => updateMsg(step.id, idx, e.target.value)}
                    className="text-sm resize-none flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 mt-1 text-muted-foreground hover:text-destructive flex-shrink-0"
                    onClick={() => removeRow(step.id, idx)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button variant="outline" size="sm" onClick={() => addRow(step.id)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />Adicionar variação
              </Button>
              <Button
                size="sm"
                onClick={() => saveStep(step)}
                disabled={saving === step.id}
                className="gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                {saving === step.id ? "Salvando..." : "Salvar mensagens"}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Follow-Up Automático por Etapa
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure as mensagens de follow-up para cada etapa do pipeline • 08h–18h • máx 25/etapa/dia
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Atualizar
        </Button>
      </div>

      {/* Métricas */}
      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Object.entries(metrics.stages).map(([stage, data]) => (
            <Card key={stage}>
              <CardContent className="pt-4 pb-3">
                <p className={`text-xs font-medium mb-2 ${STAGE_COLORS[stage]}`}>{data.label}</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pendentes</span>
                  <span className="font-bold">{data.pending}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Enviados hoje</span>
                  <span className="font-bold">{data.sent_today}/{data.daily_limit}</span>
                </div>
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.min(100, (data.sent_today / data.daily_limit) * 100)}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs por etapa */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Carregando configurações...</div>
      ) : (
        <Tabs defaultValue="contato_iniciado">
          <TabsList className="mb-4">
            {["contato_iniciado", "interessado", "comprador"].map(stage => {
              const steps = config[stage] || [];
              const allOk = steps.length > 0 && steps.every(s => s.has_minimum);
              return (
                <TabsTrigger key={stage} value={stage} className="gap-2">
                  {STAGE_LABELS[stage]}
                  {allOk
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  }
                </TabsTrigger>
              );
            })}
          </TabsList>

          {["contato_iniciado", "interessado", "comprador"].map(stage => (
            <TabsContent key={stage} value={stage}>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {stage === "contato_iniciado" && "Disparado quando o lead é movido para 'Contato Iniciado'. Após o último step sem resposta, o lead vai automaticamente para 'Perdido'."}
                  {stage === "interessado" && "Disparado quando o lead avança para 'Interessado'. Todos os follow-ups de etapas anteriores são cancelados automaticamente."}
                  {stage === "comprador" && "Disparado quando o lead vira comprador. Envia mensagem de satisfação e redireciona para avaliação no Google."}
                </p>
                {(config[stage] || []).map(step => renderStep(step))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Logs recentes */}
      {metrics && metrics.recent_logs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="h-4 w-4" />
              Últimos disparos
              {metrics.auto_moved_today > 0 && (
                <Badge variant="secondary" className="text-[10px]">{metrics.auto_moved_today} auto-movidos hoje</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {metrics.recent_logs.map((log, i) => (
                <div key={i} className="flex items-center gap-3 text-xs py-1.5 border-b border-border last:border-0">
                  <Badge
                    variant={log.status === "sent" ? "default" : log.status === "failed" ? "destructive" : "secondary"}
                    className="text-[10px] flex-shrink-0"
                  >
                    {log.status}
                  </Badge>
                  <span className={`flex-shrink-0 font-medium ${STAGE_COLORS[log.stage] || ""}`}>
                    {STAGE_LABELS[log.stage] || log.stage} #{log.step_number}
                  </span>
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
    </div>
  );
}
