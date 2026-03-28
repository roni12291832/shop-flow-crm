import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Heart, ShoppingBag, ArrowLeft, ArrowRight, Check,
  Sparkles, Trash2, Plus, Calendar, Clock, Info,
  AlertCircle, CheckCircle2, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PYTHON_BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const MIN_VARIATIONS = 15;

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface RuleFormData {
  name: string;
  trigger_event: "birthday" | "no_purchase";
  channel: "whatsapp";
  message_template: string;
  active: boolean;
  campaign_start: string;   // ISO datetime string
  campaign_end: string;     // ISO datetime string
  variations: string[];     // as 15 variações
}

interface RuleWizardProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: RuleFormData) => Promise<void>;
  initialData?: Partial<RuleFormData> & { id?: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countWorkingDays(startIso: string, endIso: string): number {
  if (!startIso || !endIso) return 0;
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (end <= start) return 0;
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      if (cur.getDay() !== 0) count++; // exclui domingo
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  } catch {
    return 0;
  }
}

function toLocalDatetimeInput(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function fromLocalDatetimeInput(local: string): string {
  if (!local) return "";
  return new Date(local).toISOString();
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function RuleWizard({ open, onClose, onSave, initialData }: RuleWizardProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [generatingVariations, setGeneratingVariations] = useState(false);

  const defaultStart = () => {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    return d.toISOString();
  };
  const defaultEnd = () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    d.setHours(18, 0, 0, 0);
    return d.toISOString();
  };

  const [form, setForm] = useState<RuleFormData>({
    name: initialData?.name || "",
    trigger_event: initialData?.trigger_event || "birthday",
    channel: "whatsapp",
    message_template: initialData?.message_template || "",
    active: initialData?.active ?? true,
    campaign_start: initialData?.campaign_start || defaultStart(),
    campaign_end: initialData?.campaign_end || defaultEnd(),
    variations: initialData?.variations || [],
  });

  // Base message para enviar ao Jarvis
  const [baseMessage, setBaseMessage] = useState(
    initialData?.message_template?.split("|||")[0]?.trim() || "",
  );

  useEffect(() => {
    if (open && initialData) {
      setForm({
        name: initialData.name || "",
        trigger_event: initialData.trigger_event || "birthday",
        channel: "whatsapp",
        message_template: initialData.message_template || "",
        active: initialData.active ?? true,
        campaign_start: initialData.campaign_start || defaultStart(),
        campaign_end: initialData.campaign_end || defaultEnd(),
        variations: initialData.variations || [],
      });
      const base = initialData.message_template?.split("|||")[0]?.trim() || "";
      setBaseMessage(base);
      setStep(1);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = <K extends keyof RuleFormData>(key: K, value: RuleFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  // ─── Jarvis: gera 15 variações ────────────────────────────────────────────

  const handleGenerateVariations = async () => {
    if (!baseMessage.trim()) {
      toast.error("Escreva a mensagem base primeiro");
      return;
    }
    setGeneratingVariations(true);
    try {
      const resp = await fetch(`${PYTHON_BACKEND_URL}/jarvis/variations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: baseMessage.trim(), count: MIN_VARIATIONS }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const vars: string[] = data.variations || [];
      if (vars.length === 0) throw new Error("Nenhuma variação retornada");
      update("variations", vars);
      // Salva também no message_template como referência
      update("message_template", baseMessage.trim());
      toast.success(`${vars.length} variações geradas pelo Jarvis! ✨`);
    } catch (err) {
      toast.error("Erro ao gerar variações. Verifique o backend.");
      console.error(err);
    } finally {
      setGeneratingVariations(false);
    }
  };

  const updateVariation = (idx: number, text: string) => {
    const updated = [...form.variations];
    updated[idx] = text;
    update("variations", updated);
  };

  const removeVariation = (idx: number) => {
    update("variations", form.variations.filter((_, i) => i !== idx));
  };

  const addVariation = () => {
    update("variations", [...form.variations, ""]);
  };

  // ─── Validação ────────────────────────────────────────────────────────────

  const canGoNext = () => {
    if (step === 1) {
      if (!form.name.trim()) return false;
      if (form.trigger_event === "no_purchase") {
        if (!form.campaign_start || !form.campaign_end) return false;
        if (new Date(form.campaign_end) <= new Date(form.campaign_start)) return false;
      }
      return true;
    }
    if (step === 2) {
      const validVars = form.variations.filter(v => v.trim().length > 0);
      return validVars.length >= MIN_VARIATIONS;
    }
    return true;
  };

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        ...form,
        variations: form.variations.filter(v => v.trim().length > 0),
      });
      // Reset
      setStep(1);
      setBaseMessage("");
      setForm({
        name: "",
        trigger_event: "birthday",
        channel: "whatsapp",
        message_template: "",
        active: true,
        campaign_start: defaultStart(),
        campaign_end: defaultEnd(),
        variations: [],
      });
    } finally {
      setSaving(false);
    }
  };

  // ─── Cálculo da campanha ──────────────────────────────────────────────────

  const workingDays = form.trigger_event === "no_purchase"
    ? countWorkingDays(form.campaign_start, form.campaign_end)
    : 0;
  const estimatedMessages = workingDays * 40;
  const validVariationsCount = form.variations.filter(v => v.trim().length > 0).length;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { onClose(); setStep(1); } }}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {initialData?.id ? "Editar Régua" : "Nova Régua de Relacionamento"}
          </DialogTitle>
          {/* Progress bar */}
          <div className="flex gap-2 mt-2">
            {[1, 2, 3].map(s => (
              <div
                key={s}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  s <= step ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {step === 1 ? "Configuração" : step === 2 ? "Mensagens" : "Revisão"}
          </p>
        </DialogHeader>

        {/* ── Step 1: Tipo + Configuração ── */}
        {step === 1 && (
          <div className="space-y-5 py-1">
            {/* Nome */}
            <div>
              <Label className="text-foreground">Nome da régua</Label>
              <Input
                className="mt-1.5"
                placeholder="Ex: Feliz Aniversário clientes, Campanha Verão 2026..."
                value={form.name}
                onChange={e => update("name", e.target.value)}
              />
            </div>

            {/* Tipo */}
            <div>
              <Label className="text-foreground mb-2 block">Tipo de envio</Label>
              <div className="grid grid-cols-2 gap-3">
                {/* Birthday */}
                <Card
                  className={cn(
                    "p-4 cursor-pointer transition-all border-2",
                    form.trigger_event === "birthday"
                      ? "border-rose-500 bg-rose-500/10"
                      : "border-border hover:border-rose-300",
                  )}
                  onClick={() => update("trigger_event", "birthday")}
                >
                  <Heart className="h-6 w-6 text-rose-500 mb-2" />
                  <p className="text-sm font-semibold text-foreground">Aniversariantes</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Envia para todos que fazem aniversário no dia. Sem limite de mensagens.
                  </p>
                  <Badge className="mt-2 bg-rose-500/10 text-rose-500 border-rose-500/30 text-[10px]">
                    Sem limite • Qualquer dia
                  </Badge>
                </Card>

                {/* Buyers */}
                <Card
                  className={cn(
                    "p-4 cursor-pointer transition-all border-2",
                    form.trigger_event === "no_purchase"
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-border hover:border-amber-300",
                  )}
                  onClick={() => update("trigger_event", "no_purchase")}
                >
                  <ShoppingBag className="h-6 w-6 text-amber-500 mb-2" />
                  <p className="text-sm font-semibold text-foreground">Campanha para Compradores</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Envia para todos que já compraram. 40 mensagens/dia, Seg–Sáb.
                  </p>
                  <Badge className="mt-2 bg-amber-500/10 text-amber-500 border-amber-500/30 text-[10px]">
                    40/dia • Seg–Sáb • 08–12h e 13–18h
                  </Badge>
                </Card>
              </div>
            </div>

            {/* Campaign dates — só para compradores */}
            {form.trigger_event === "no_purchase" && (
              <div className="space-y-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                <div className="flex items-center gap-2 text-amber-600">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm font-medium">Período da Campanha</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Início</Label>
                    <Input
                      type="datetime-local"
                      className="mt-1 text-xs"
                      value={toLocalDatetimeInput(form.campaign_start)}
                      onChange={e => update("campaign_start", fromLocalDatetimeInput(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Término</Label>
                    <Input
                      type="datetime-local"
                      className="mt-1 text-xs"
                      value={toLocalDatetimeInput(form.campaign_end)}
                      onChange={e => update("campaign_end", fromLocalDatetimeInput(e.target.value))}
                    />
                  </div>
                </div>

                {/* Estimativa */}
                {workingDays > 0 && (
                  <div className="bg-background/60 rounded-md p-3 border border-amber-500/20">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">Dias úteis (Seg–Sáb):</span>
                      <span className="font-semibold text-foreground">{workingDays} dias</span>
                    </div>
                    <div className="flex justify-between items-center text-xs mt-1">
                      <span className="text-muted-foreground">Máx. mensagens totais:</span>
                      <span className="font-semibold text-amber-600">{estimatedMessages.toLocaleString("pt-BR")} msgs</span>
                    </div>
                    <div className="flex justify-between items-center text-xs mt-1">
                      <span className="text-muted-foreground">Por dia:</span>
                      <span className="text-foreground">20 manhã + 20 tarde</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      💡 Cada comprador recebe apenas 1 mensagem por campanha. Se você tiver mais compradores que o limite, alguns não receberão.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Info Birthday */}
            {form.trigger_event === "birthday" && (
              <div className="flex items-start gap-2 p-3 bg-rose-500/5 border border-rose-500/20 rounded-lg text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
                <p>
                  A régua de aniversário roda todos os dias e envia automaticamente para todos os clientes
                  que fazem aniversário naquele dia. Sem limite de envio — todos recebem a mensagem.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Mensagens ── */}
        {step === 2 && (
          <div className="space-y-4 py-1">
            {/* Mensagem base + botão Jarvis */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-foreground">Mensagem base</Label>
                <span className="text-[10px] text-muted-foreground">O Jarvis vai criar {MIN_VARIATIONS} variações a partir desta</span>
              </div>
              <Textarea
                placeholder={
                  form.trigger_event === "birthday"
                    ? "Ex: Olá {nome}! 🎂 Hoje é um dia especial! Feliz aniversário! A nossa equipe te deseja um dia incrível. 🥳"
                    : "Ex: Olá {nome}! Temos novidades incríveis para você. Confira as últimas coleções da nossa loja! 👗"
                }
                value={baseMessage}
                onChange={e => setBaseMessage(e.target.value)}
                rows={3}
                className="text-sm"
              />
              <div className="flex gap-1.5 mt-2 flex-wrap">
                <Badge
                  variant="secondary"
                  className="cursor-pointer hover:bg-primary/20 text-xs"
                  onClick={() => setBaseMessage(prev => prev + "{nome}")}
                >
                  + Nome
                </Badge>
              </div>
            </div>

            {/* Botão Jarvis */}
            <Button
              className="w-full gap-2 gradient-primary text-primary-foreground"
              onClick={handleGenerateVariations}
              disabled={generatingVariations || !baseMessage.trim()}
            >
              {generatingVariations ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Gerando com Jarvis...</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Gerar {MIN_VARIATIONS} Variações com Jarvis</>
              )}
            </Button>

            {/* Status das variações */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {validVariationsCount >= MIN_VARIATIONS ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                )}
                <span className="text-sm font-medium">
                  {validVariationsCount} de {MIN_VARIATIONS} variações
                  {validVariationsCount >= MIN_VARIATIONS ? " ✓" : " (mínimo necessário)"}
                </span>
              </div>
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={addVariation}>
                <Plus className="h-3 w-3" /> Adicionar
              </Button>
            </div>

            {/* Anti-ban info */}
            <div className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs">
              <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                <strong className="text-primary">Anti-bloqueio WhatsApp:</strong> cada cliente recebe
                uma variação diferente selecionada aleatoriamente. Com {MIN_VARIATIONS}+ variações,
                o padrão de envio parece manual para o WhatsApp.
              </p>
            </div>

            {/* Lista de variações */}
            {form.variations.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {form.variations.map((variation, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <span className="text-[10px] font-bold text-primary bg-primary/10 rounded px-1.5 py-1 shrink-0 mt-1">
                      #{idx + 1}
                    </span>
                    <Textarea
                      value={variation}
                      onChange={e => updateVariation(idx, e.target.value)}
                      rows={2}
                      className="text-xs flex-1 resize-none"
                      placeholder={`Variação ${idx + 1}...`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive shrink-0 mt-1"
                      onClick={() => removeVariation(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {form.variations.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>Escreva a mensagem base e clique em "Gerar com Jarvis"</p>
                <p className="text-xs mt-1">ou adicione variações manualmente</p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Revisão ── */}
        {step === 3 && (
          <div className="space-y-4 py-1">
            <Card className="p-4 bg-secondary/50 border-border space-y-3">
              <div className="flex items-center gap-2">
                {form.trigger_event === "birthday"
                  ? <Heart className="h-4 w-4 text-rose-500" />
                  : <ShoppingBag className="h-4 w-4 text-amber-500" />
                }
                <p className="text-sm font-semibold text-foreground">{form.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Tipo</p>
                  <p className="text-foreground font-medium">
                    {form.trigger_event === "birthday" ? "Aniversariantes" : "Compradores"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Canal</p>
                  <p className="text-foreground font-medium">WhatsApp</p>
                </div>
                {form.trigger_event === "no_purchase" && (
                  <>
                    <div>
                      <p className="text-muted-foreground">Início</p>
                      <p className="text-foreground font-medium">
                        {new Date(form.campaign_start).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Término</p>
                      <p className="text-foreground font-medium">
                        {new Date(form.campaign_end).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Dias úteis</p>
                      <p className="text-foreground font-medium">{workingDays} dias</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Máx. mensagens</p>
                      <p className="text-amber-600 font-bold">{estimatedMessages.toLocaleString("pt-BR")}</p>
                    </div>
                  </>
                )}
                {form.trigger_event === "birthday" && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Envio</p>
                    <p className="text-foreground font-medium">Automático • Todo dia • Sem limite</p>
                  </div>
                )}
              </div>

              {/* Variações */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs text-muted-foreground">Variações de mensagem</p>
                  <Badge variant={validVariationsCount >= MIN_VARIATIONS ? "default" : "destructive"} className="text-[10px]">
                    {validVariationsCount} variações
                  </Badge>
                </div>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {form.variations.filter(v => v.trim()).slice(0, 3).map((v, i) => (
                    <div key={i} className="bg-background/50 rounded p-1.5 border border-border/30 text-[11px] text-muted-foreground truncate">
                      <span className="text-primary font-bold mr-1.5">#{i + 1}</span>{v}
                    </div>
                  ))}
                  {validVariationsCount > 3 && (
                    <p className="text-[10px] text-muted-foreground text-center">
                      + {validVariationsCount - 3} variações adicionais
                    </p>
                  )}
                </div>
              </div>

              {/* Regras de envio */}
              {form.trigger_event === "no_purchase" && (
                <div className="bg-amber-500/10 rounded p-2 border border-amber-500/20">
                  <p className="text-[11px] text-amber-700 font-medium mb-1">Regras de envio:</p>
                  <ul className="text-[11px] text-muted-foreground space-y-0.5">
                    <li>• Manhã: 20 mensagens distribuídas das 08h às 12h</li>
                    <li>• Tarde: 20 mensagens distribuídas das 13h às 18h</li>
                    <li>• Delay aleatório de 1–3 min entre mensagens</li>
                    <li>• Cada comprador recebe variação diferente</li>
                    <li>• Nunca envia no domingo</li>
                  </ul>
                </div>
              )}
            </Card>

            <div className="flex items-center justify-between">
              <Label className="text-foreground">Ativar imediatamente</Label>
              <Switch checked={form.active} onCheckedChange={v => update("active", v)} />
            </div>
          </div>
        )}

        {/* ── Botões de navegação ── */}
        <div className="flex justify-between pt-2 border-t border-border mt-2">
          <Button
            variant="outline"
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            {step === 1 ? "Cancelar" : "Voltar"}
          </Button>

          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canGoNext()} className="gap-1.5">
              Próximo
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              disabled={saving || validVariationsCount < MIN_VARIATIONS}
              className="gap-1.5 gradient-primary text-primary-foreground"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
              ) : (
                <><Check className="h-4 w-4" /> Salvar Régua</>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
