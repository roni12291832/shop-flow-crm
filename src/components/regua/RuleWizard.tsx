import { useState, useEffect, useRef } from "react";
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
  Sparkles, Trash2, Plus, Info, AlertCircle, CheckCircle2,
  Loader2, Image, Video, Upload, X, Film, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PYTHON_BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const MIN_VARIATIONS = 15;
const MAX_PHOTOS = 4;

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Arquivo de mídia pendente de upload (só existe na memória do wizard) */
export interface PendingMedia {
  file: File;
  preview: string;  // object URL para preview
  type: "image" | "video";
}

export interface RuleFormData {
  name: string;
  trigger_event: "birthday" | "no_purchase";
  channel: "whatsapp";
  message_template: string;
  active: boolean;
  campaign_start: string;   // ISO datetime string
  campaign_end: string;     // ISO datetime string
  variations: string[];     // as 15 variações
  media_urls: string[];     // URLs públicas já salvas (do Supabase Storage)
  pendingMedia: PendingMedia[];  // arquivos ainda não enviados
}

interface RuleWizardProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: RuleFormData) => Promise<void>;
  initialData?: Partial<RuleFormData> & { id?: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countWorkingDays(startIso: string | null | undefined, endIso: string | null | undefined): number {
  if (!startIso || !endIso) return 0;
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
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

function toLocalDatetimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
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
  const [renderError, setRenderError] = useState<string | null>(null);

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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<RuleFormData>({
    name: "",
    trigger_event: "birthday",
    channel: "whatsapp",
    message_template: "",
    active: true,
    campaign_start: (() => { const d = new Date(); d.setHours(8, 0, 0, 0); return d.toISOString(); })(),
    campaign_end: (() => { const d = new Date(); d.setDate(d.getDate() + 30); d.setHours(18, 0, 0, 0); return d.toISOString(); })(),
    variations: [],
    media_urls: [],
    pendingMedia: [],
  });

  // Base message para enviar ao Jarvis
  const [baseMessage, setBaseMessage] = useState(
    initialData?.message_template?.split("|||")[0]?.trim() || "",
  );

  useEffect(() => {
    if (!open) return;
    setRenderError(null);
    if (initialData) {
      setForm({
        name: initialData.name || "",
        trigger_event: initialData.trigger_event || "birthday",
        channel: "whatsapp",
        message_template: initialData.message_template || "",
        active: initialData.active ?? true,
        campaign_start: initialData.campaign_start || defaultStart(),
        campaign_end: initialData.campaign_end || defaultEnd(),
        variations: initialData.variations || [],
        media_urls: initialData.media_urls || [],
        pendingMedia: [],
      });
      const base = initialData.message_template?.split("|||")[0]?.trim() || "";
      setBaseMessage(base);
    } else {
      setForm({
        name: "",
        trigger_event: "birthday",
        channel: "whatsapp",
        message_template: "",
        active: true,
        campaign_start: defaultStart(),
        campaign_end: defaultEnd(),
        variations: [],
        media_urls: [],
        pendingMedia: [],
      });
      setBaseMessage("");
    }
    setStep(1);
  }, [open]); // eslint-disable-line

  // ─── Media handlers ───────────────────────────────────────────────────────

  const hasVideo = form.pendingMedia.some(m => m.type === "video")
    || form.media_urls.some(u => /\.(mp4|mov|avi|webm|mkv)$/i.test(u));

  const totalMediaCount = form.media_urls.length + form.pendingMedia.length;

  const handleMediaSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newMedia: PendingMedia[] = [];

    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");

      if (!isVideo && !isImage) {
        toast.error(`Arquivo "${file.name}" não é imagem ou vídeo`);
        continue;
      }

      // Regras:
      // - Se já tem vídeo → não adiciona mais nada
      // - Se está adicionando vídeo → só se não houver nada ainda
      // - Máximo de 4 fotos

      if (hasVideo) {
        toast.warning("Já existe um vídeo. Remova-o para adicionar outra mídia.");
        break;
      }

      if (isVideo) {
        if (totalMediaCount + newMedia.length > 0) {
          toast.warning("Para adicionar vídeo, remova todas as fotos primeiro.");
          break;
        }
        newMedia.push({ file, preview: URL.createObjectURL(file), type: "video" });
        break; // só 1 vídeo
      }

      if (isImage) {
        const currentPhotos = form.media_urls.filter(u => !/\.(mp4|mov|avi|webm|mkv)$/i.test(u)).length
          + form.pendingMedia.filter(m => m.type === "image").length
          + newMedia.filter(m => m.type === "image").length;

        if (currentPhotos >= MAX_PHOTOS) {
          toast.warning(`Máximo de ${MAX_PHOTOS} fotos atingido.`);
          break;
        }
        newMedia.push({ file, preview: URL.createObjectURL(file), type: "image" });
      }
    }

    if (newMedia.length > 0) {
      update("pendingMedia", [...form.pendingMedia, ...newMedia]);
    }
  };

  const removePendingMedia = (idx: number) => {
    const removed = form.pendingMedia[idx];
    URL.revokeObjectURL(removed.preview);
    update("pendingMedia", form.pendingMedia.filter((_, i) => i !== idx));
  };

  const removeSavedMedia = (url: string) => {
    update("media_urls", form.media_urls.filter(u => u !== url));
  };

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
      // Limpa object URLs antes de resetar
      form.pendingMedia.forEach(m => URL.revokeObjectURL(m.preview));
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
        media_urls: [],
        pendingMedia: [],
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

  if (renderError) {
    return (
      <Dialog open={open} onOpenChange={o => { if (!o) { onClose(); setStep(1); } }}>
        <DialogContent className="sm:max-w-[400px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Erro ao carregar</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">{renderError}</p>
          </div>
          <div className="flex justify-end pt-2 border-t border-border">
            <Button variant="outline" onClick={onClose}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

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

            {/* ─── Seção de Mídia ─── */}
            <div className="border-t border-border/50 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-foreground">Fotos ou Vídeo</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Opcional. Até 4 fotos <strong>ou</strong> 1 vídeo — enviados junto com a mensagem.
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {totalMediaCount}/{hasVideo ? "1 vídeo" : `${MAX_PHOTOS} fotos`}
                </Badge>
              </div>

              {/* Preview das mídias já salvas + pendentes */}
              {(form.media_urls.length > 0 || form.pendingMedia.length > 0) && (
                <div className="grid grid-cols-4 gap-2">
                  {/* URLs já salvas no banco */}
                  {form.media_urls.map((url, i) => {
                    const isVid = /\.(mp4|mov|avi|webm|mkv)$/i.test(url);
                    return (
                      <div key={`saved-${i}`} className="relative group aspect-square">
                        {isVid ? (
                          <div className="w-full h-full bg-muted rounded-lg flex flex-col items-center justify-center border border-border">
                            <Film className="h-6 w-6 text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground mt-1">Vídeo</span>
                          </div>
                        ) : (
                          <img src={url} alt="" className="w-full h-full object-cover rounded-lg border border-border" />
                        )}
                        <button
                          onClick={() => removeSavedMedia(url)}
                          className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}

                  {/* Arquivos pendentes (ainda não enviados) */}
                  {form.pendingMedia.map((media, i) => (
                    <div key={`pending-${i}`} className="relative group aspect-square">
                      {media.type === "video" ? (
                        <div className="w-full h-full bg-muted rounded-lg flex flex-col items-center justify-center border border-border border-dashed">
                          <Film className="h-6 w-6 text-primary" />
                          <span className="text-[9px] text-muted-foreground mt-1">{media.file.name.slice(0, 12)}</span>
                        </div>
                      ) : (
                        <img src={media.preview} alt="" className="w-full h-full object-cover rounded-lg border border-border" />
                      )}
                      {/* Badge "novo" */}
                      <span className="absolute bottom-0.5 left-0.5 bg-primary text-primary-foreground text-[8px] px-1 rounded">novo</span>
                      <button
                        onClick={() => removePendingMedia(i)}
                        className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}

                  {/* Slot de adicionar (se ainda cabe) */}
                  {!hasVideo && totalMediaCount < MAX_PHOTOS && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    >
                      <Plus className="h-5 w-5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              )}

              {/* Botão de upload quando não há nada */}
              {totalMediaCount === 0 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-lg py-6 flex flex-col items-center gap-2 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  <div className="flex gap-3">
                    <Image className="h-6 w-6 text-muted-foreground" />
                    <Video className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Clique para selecionar fotos ou vídeo
                  </p>
                  <p className="text-xs text-muted-foreground opacity-70">
                    Até 4 fotos (JPG, PNG, WebP) <strong>ou</strong> 1 vídeo (MP4, MOV)
                  </p>
                </button>
              )}

              {/* Input escondido */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/x-msvideo,video/webm"
                multiple={!hasVideo && totalMediaCount < MAX_PHOTOS}
                className="hidden"
                onChange={e => handleMediaSelect(e.target.files)}
                onClick={e => { (e.target as HTMLInputElement).value = ""; }}
              />

              {/* Info de como a mídia é enviada */}
              {totalMediaCount > 0 && (
                <div className="flex items-start gap-2 p-2.5 bg-blue-500/5 border border-blue-500/20 rounded-md text-[11px] text-muted-foreground">
                  <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                  <p>
                    {hasVideo
                      ? "O vídeo será enviado com a mensagem como legenda."
                      : form.media_urls.length + form.pendingMedia.length === 1
                        ? "A foto será enviada com a mensagem como legenda."
                        : `A 1ª foto terá a mensagem como legenda. As demais (${totalMediaCount - 1}) são enviadas em seguida com intervalo de 2–5s.`
                    }
                  </p>
                </div>
              )}
            </div>
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

              {/* Mídia */}
              {(form.media_urls.length > 0 || form.pendingMedia.length > 0) && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Mídia</p>
                  <div className="flex items-center gap-2">
                    {form.pendingMedia.some(m => m.type === "video") || form.media_urls.some(u => /\.(mp4|mov|avi|webm|mkv)$/i.test(u))
                      ? <Film className="h-4 w-4 text-blue-500" />
                      : <Image className="h-4 w-4 text-blue-500" />
                    }
                    <span className="text-xs text-foreground">
                      {hasVideo ? "1 vídeo" : `${totalMediaCount} foto${totalMediaCount > 1 ? "s" : ""}`}
                      {form.pendingMedia.length > 0 && ` (${form.pendingMedia.length} novo${form.pendingMedia.length > 1 ? "s" : ""})`}
                    </span>
                  </div>
                </div>
              )}

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
                    {(form.media_urls.length + form.pendingMedia.length) > 0 && (
                      <li>• {hasVideo ? "Vídeo" : `${totalMediaCount} foto${totalMediaCount > 1 ? "s" : ""}`} enviado{hasVideo ? "" : "s"} junto com a mensagem</li>
                    )}
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
