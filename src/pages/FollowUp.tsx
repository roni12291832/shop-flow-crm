import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus, Trash2, Save, AlertTriangle, CheckCircle2, BarChart2,
  Zap, RefreshCw, Clock, X, Bot, ChevronDown, ChevronUp,
  Star, HelpCircle, ExternalLink, Database,
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

// ─── Help Modal Content ────────────────────────────────────────────────────

function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <HelpCircle className="h-5 w-5 text-primary" />
            Como configurar o Follow-Up Automático
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          {/* Passo 1 */}
          <div className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">1</span>
              Rodar as migrations no Supabase (obrigatório)
            </div>
            <p className="text-muted-foreground">
              Acesse o <strong>Supabase → SQL Editor</strong> e rode as duas migrations na ordem:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground pl-2">
              <li><code className="bg-muted px-1 rounded text-xs">20260326000003_fix_pipeline_stage_enum.sql</code> — corrige enum e recria tabela de configurações</li>
              <li><code className="bg-muted px-1 rounded text-xs">20260326000001_stage_followup_system.sql</code> — cria as tabelas de follow-up e os 9 steps padrão</li>
            </ol>
            <p className="text-amber-600 text-xs flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Enquanto as migrations não forem rodadas, a página exibe erro 404.
            </p>
          </div>

          {/* Passo 2 */}
          <div className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">2</span>
              Configurar o Google Meu Negócio
            </div>
            <p className="text-muted-foreground">
              Cole o link da sua página de avaliações do Google no campo <strong>"Google Meu Negócio"</strong> acima das abas.
            </p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground pl-2">
              <li>Acesse <strong>Google Meu Negócio</strong> (business.google.com)</li>
              <li>Vá em <strong>Receber avaliações → Compartilhar link de avaliação</strong></li>
              <li>Copie o link e cole no campo desta página</li>
              <li>Clique em <strong>Salvar GMB</strong></li>
            </ol>
            <p className="text-muted-foreground text-xs">
              Nas mensagens do step "Comprador", use <code className="bg-muted px-1 rounded">{"{gmb_link}"}</code> que será substituído automaticamente pelo link.
            </p>
          </div>

          {/* Passo 3 */}
          <div className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">3</span>
              Cadastrar as variações de mensagem
            </div>
            <p className="text-muted-foreground">
              Cada etapa do pipeline tem steps com agendamentos automáticos. Cada step precisa de um mínimo de variações para evitar bloqueio no WhatsApp (mensagens repetidas = ban).
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-2">
              <li><strong>Contato Iniciado:</strong> 4 steps (4h / 1d / 3d / 10d → perdido)</li>
              <li><strong>Interessado:</strong> 4 steps (1d / 4d / 14d / 29d)</li>
              <li><strong>Comprador:</strong> 1 step (1h — satisfação + GMB)</li>
            </ul>
            <p className="text-muted-foreground text-xs">
              Clique no step para expandir → escreva mensagens ou use o <strong>Jarvis (IA)</strong> para gerar variações automaticamente.
            </p>
          </div>

          {/* Passo 4 */}
          <div className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">4</span>
              Variáveis disponíveis nas mensagens
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["{nome}", "Nome do lead"],
                ["{name}", "Mesmo que {nome}"],
                ["{gmb_link}", "Link Google Avaliações (só Comprador)"],
              ].map(([v, d]) => (
                <div key={v} className="bg-muted/40 rounded p-2">
                  <code className="text-primary text-xs font-mono">{v}</code>
                  <p className="text-muted-foreground text-xs mt-0.5">{d}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Passo 5 */}
          <div className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">5</span>
              Regras automáticas do sistema
            </div>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-2">
              <li>Mensagens enviadas apenas entre <strong>08h–18h BRT</strong></li>
              <li>Máximo de <strong>25 mensagens por etapa por dia</strong></li>
              <li>Quando o lead responde, todos os follow-ups pendentes são <strong>cancelados automaticamente</strong></li>
              <li>Quando o lead muda de etapa, follow-ups da etapa anterior são <strong>cancelados</strong> e os da nova etapa são <strong>agendados</strong></li>
              <li>Cada lead recebe uma variação diferente (aleatoriedade anti-ban)</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Component ────────────────────────────────────────────────────────────

export default function FollowUp() {
  const [config, setConfig] = useState<StageConfig>({});
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<Record<string, string[]>>({});
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [baseMessages, setBaseMessages] = useState<Record<string, string>>({});
  const [helpOpen, setHelpOpen] = useState(false);

  // Google Meu Negócio
  const [gmbUrl, setGmbUrl] = useState("");
  const [savingGmb, setSavingGmb] = useState(false);

  // Load GMB from Supabase
  const [tenantId, setTenantId] = useState<string | null>(null);
  useEffect(() => {
    supabase.from("tenants").select("id, google_mybusiness_url").single().then(({ data }) => {
      if (data) {
        setTenantId(data.id);
        if (data.google_mybusiness_url) setGmbUrl(data.google_mybusiness_url);
      }
    });
  }, []);

  async function saveGmb() {
    if (!tenantId) { toast.error("Configuração não carregada ainda"); return; }
    setSavingGmb(true);
    const { error } = await supabase.from("tenants").update({ google_mybusiness_url: gmbUrl } as any).eq("id", tenantId);
    setSavingGmb(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success("Link do Google Meu Negócio salvo!");
  }

  const load = useCallback(async () => {
    setLoading(true);
    setBackendError(null);
    try {
      const [cfgData, mData] = await Promise.all([
        apiFetch("/followup/config"),
        apiFetch("/followup/metrics").catch(() => null),
      ]);
      setConfig(cfgData);
      if (mData) setMetrics(mData);
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
      setBackendError(e.message);
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
      // Salva direto no Supabase — evita dependência do backend Python para CRUD simples
      const { error: delError } = await supabase
        .from("stage_followup_messages")
        .delete()
        .eq("step_id", step.id);
      if (delError) throw new Error(delError.message);

      const rows = msgs.map((message, i) => ({
        step_id: step.id,
        variation_number: i + 1,
        message: message.trim(),
      }));
      const { error: insError } = await supabase
        .from("stage_followup_messages")
        .insert(rows);
      if (insError) throw new Error(insError.message);

      toast.success(`Step ${step.step_number} de "${STAGE_LABELS[step.stage]}" salvo com ${msgs.length} variações!`);
      load();
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    }
    setSaving(null);
  }

  async function generateWithJarvis(step: Step) {
    const base = baseMessages[step.id] || "";
    if (!base.trim()) { toast.error("Digite uma mensagem base para gerar variações"); return; }
    setGenerating(step.id);
    try {
      const data = await apiFetch("/jarvis/variations", "POST", {
        message: `Gere ${step.min_variations} variações desta mensagem de follow-up para leads na etapa "${STAGE_LABELS[step.stage]}" (step ${step.step_number}, ${delayLabel(step.delay_hours)}). Mantenha o mesmo objetivo mas com palavras, estrutura e tom diferentes. Mensagem base: "${base}"`,
      });
      const variations: string[] = (data.variations || "")
        .split(/\|\|\||\n/)
        .map((v: string) => v.trim().replace(/^\d+\.\s*/, ""))
        .filter((v: string) => v.length > 0);

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

        {isExpanded && (
          <div className="p-4 space-y-3">
            {!hasMin && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>Adicione pelo menos <strong>{step.min_variations}</strong> variações para ativar este step (anti-bloqueio WhatsApp)</span>
              </div>
            )}

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

            <div className="space-y-2">
              {msgs.map((msg, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <span className="text-xs text-muted-foreground w-5 mt-2.5 flex-shrink-0 text-right">{idx + 1}</span>
                  <Textarea
                    rows={2}
                    placeholder={`Variação ${idx + 1} — use {nome} ou {gmb_link}`}
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
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Follow-Up Automático por Etapa
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure as mensagens para cada etapa do pipeline • 08h–18h • máx 25/etapa/dia
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)} className="gap-1.5">
            <HelpCircle className="h-3.5 w-3.5" />
            Como configurar
          </Button>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Atualizar
          </Button>
        </div>
      </div>

      {/* Google Meu Negócio */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Star className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-sm font-medium">Google Meu Negócio</p>
                <p className="text-xs text-muted-foreground">
                  Link da página de avaliações. Use <code className="bg-muted px-1 rounded">{"{gmb_link}"}</code> nas mensagens do step "Comprador" para enviar automaticamente.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="https://g.page/r/sua-empresa/review"
                  value={gmbUrl}
                  onChange={e => setGmbUrl(e.target.value)}
                  className="text-sm"
                />
                <Button size="sm" onClick={saveGmb} disabled={savingGmb} className="flex-shrink-0 gap-1.5">
                  <Save className="h-3.5 w-3.5" />
                  {savingGmb ? "Salvando..." : "Salvar GMB"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backend error banner */}
      {backendError && (
        <div className="border border-destructive/40 bg-destructive/5 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-destructive font-medium text-sm">
            <Database className="h-4 w-4" />
            Configuração necessária — tabelas não encontradas
          </div>
          <p className="text-xs text-muted-foreground">
            O backend retornou: <code className="bg-muted px-1 rounded">{backendError}</code>
          </p>
          <p className="text-xs text-muted-foreground">
            Para resolver, rode as migrations no <strong>Supabase → SQL Editor</strong> na seguinte ordem:
          </p>
          <ol className="text-xs text-muted-foreground list-decimal list-inside pl-2 space-y-0.5">
            <li><code className="bg-muted px-1 rounded">20260326000003_fix_pipeline_stage_enum.sql</code></li>
            <li><code className="bg-muted px-1 rounded">20260326000001_stage_followup_system.sql</code></li>
          </ol>
          <Button size="sm" variant="outline" onClick={() => setHelpOpen(true)} className="gap-1.5 mt-1">
            <HelpCircle className="h-3.5 w-3.5" />
            Ver passo a passo completo
          </Button>
        </div>
      )}

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
      ) : !backendError ? (
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
                  {stage === "comprador" && "Disparado quando o lead vira comprador. Envia mensagem de satisfação e redireciona para avaliação no Google. Use {gmb_link} nas mensagens."}
                </p>
                {(config[stage] || []).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                    Nenhum step configurado. Rode as migrations no Supabase.
                  </div>
                ) : (
                  (config[stage] || []).map(step => renderStep(step))
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      ) : null}

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
