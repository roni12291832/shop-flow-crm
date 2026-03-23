import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Package, Clock, Heart, Hand, MessageSquare, Mail, Smartphone, ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface RuleFormData {
  name: string;
  trigger_event: "after_purchase" | "no_purchase" | "birthday" | "manual";
  delay_days: number;
  channel: "whatsapp" | "sms" | "email";
  message_template: string;
  active: boolean;
}

interface RuleWizardProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: RuleFormData) => void;
  initialData?: Partial<RuleFormData> & { id?: string };
}

const TRIGGER_OPTIONS = [
  { value: "after_purchase" as const, icon: Package, label: "Após uma compra", desc: "Dispara X dias depois da compra", color: "text-accent" },
  { value: "no_purchase" as const, icon: Clock, label: "Cliente sem comprar", desc: "Dispara quando inativo por X dias", color: "text-warning" },
  { value: "birthday" as const, icon: Heart, label: "Aniversário", desc: "Envia no dia ou X dias antes", color: "text-destructive" },
  { value: "manual" as const, icon: Hand, label: "Manual", desc: "Seleção manual de clientes", color: "text-muted-foreground" },
];

const CHANNEL_OPTIONS = [
  { value: "whatsapp" as const, icon: MessageSquare, label: "WhatsApp" },
  { value: "email" as const, icon: Mail, label: "Email" },
  { value: "sms" as const, icon: Smartphone, label: "SMS" },
];

const VARIABLES = [
  { key: "{{nome}}", label: "+Nome" },
  { key: "{{produto}}", label: "+Produto" },
  { key: "{{loja}}", label: "+Loja" },
  { key: "{{telefone}}", label: "+Telefone" },
  { key: "{{data_compra}}", label: "+DataCompra" },
];

const PREVIEW_DATA: Record<string, string> = {
  "{{nome}}": "Maria Silva",
  "{{produto}}": "Vestido Floral",
  "{{loja}}": "Loja Premium",
  "{{telefone}}": "(11) 99999-0001",
  "{{data_compra}}": "05/03/2026",
};

export function RuleWizard({ open, onClose, onSave, initialData }: RuleWizardProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<RuleFormData>({
    name: initialData?.name || "",
    trigger_event: initialData?.trigger_event || "after_purchase",
    delay_days: initialData?.delay_days || 3,
    channel: initialData?.channel || "whatsapp",
    message_template: initialData?.message_template || "",
    active: initialData?.active ?? true,
  });

  const [isGenerating, setIsGenerating] = useState(false);

  const updateForm = (key: keyof RuleFormData, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const insertVariable = (variable: string) => {
    updateForm("message_template", form.message_template + variable);
  };

  const handleGenerateVariations = async () => {
    if (!form.message_template) return;
    setIsGenerating(true);
    try {
      const resp = await fetch(`http://localhost:8000/jarvis/variations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: form.message_template }),
      });
      const data = await resp.json();
      if (data.variations) {
        updateForm("message_template", data.variations);
      }
    } catch (error) {
      console.error("Erro ao gerar variações:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const previewMessage = () => {
    let msg = form.message_template;
    Object.entries(PREVIEW_DATA).forEach(([key, val]) => {
      msg = msg.split(key).join(val);
    });
    return msg;
  };

  const canNext = () => {
    if (step === 1) return form.name.trim() !== "";
    if (step === 2) return form.message_template.trim() !== "";
    return true;
  };

  const handleSave = () => {
    onSave(form);
    setStep(1);
    setForm({ name: "", trigger_event: "after_purchase", delay_days: 3, channel: "whatsapp", message_template: "", active: true });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setStep(1); } }}>
      <DialogContent className="sm:max-w-[560px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {initialData?.id ? "Editar Régua" : "Nova Régua de Relacionamento"}
          </DialogTitle>
          <div className="flex gap-2 mt-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  s <= step ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>
        </DialogHeader>

        {/* Step 1 - Trigger */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-foreground">Nome da régua</Label>
              <Input
                placeholder="Ex: Satisfação pós-compra"
                value={form.name}
                onChange={(e) => updateForm("name", e.target.value)}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label className="text-foreground mb-2 block">Tipo de gatilho</Label>
              <div className="grid grid-cols-2 gap-2">
                {TRIGGER_OPTIONS.map((opt) => (
                  <Card
                    key={opt.value}
                    className={cn(
                      "p-3 cursor-pointer transition-all border-2",
                      form.trigger_event === opt.value
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/30"
                    )}
                    onClick={() => updateForm("trigger_event", opt.value)}
                  >
                    <opt.icon className={cn("h-5 w-5 mb-1", opt.color)} />
                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-foreground">
                {form.trigger_event === "birthday" ? "Dias antes do aniversário" : "Dias após o evento"}
              </Label>
              <Input
                type="number"
                min={0}
                value={form.delay_days}
                onChange={(e) => updateForm("delay_days", parseInt(e.target.value) || 0)}
                className="mt-1.5 w-32"
              />
            </div>
          </div>
        )}

        {/* Step 2 - Message */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-foreground mb-2 block">Canal de envio</Label>
              <div className="flex gap-2">
                {CHANNEL_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={form.channel === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => updateForm("channel", opt.value)}
                    className="gap-1.5"
                  >
                    <opt.icon className="h-4 w-4" />
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-foreground">Mensagem</Label>
              <div className="flex items-center justify-between gap-1.5 mt-1.5 mb-2">
                <div className="flex gap-1.5 flex-wrap">
                  {VARIABLES.map((v) => (
                    <Badge
                      key={v.key}
                      variant="secondary"
                      className="cursor-pointer hover:bg-primary/20 text-xs"
                      onClick={() => insertVariable(v.key)}
                    >
                      {v.label}
                    </Badge>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] gap-1 bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary"
                  onClick={handleGenerateVariations}
                  disabled={isGenerating || !form.message_template}
                >
                  <Sparkles className={cn("h-3 w-3", isGenerating && "animate-spin")} />
                  {isGenerating ? "Gerando..." : "Gerar 15 variações com Jarvis"}
                </Button>
              </div>
              <Textarea
                placeholder="Escreva sua mensagem aqui... Use ||| para separar variações."
                value={form.message_template}
                onChange={(e) => updateForm("message_template", e.target.value)}
                rows={form.message_template.includes("|||") ? 5 : 4}
                className="font-mono text-xs"
              />
              
              {form.message_template.includes("|||") && (
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto border border-border/50 rounded-md p-2 bg-secondary/20">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">🔍 Lista de Variações (O robô enviará apenas 1 destas para cada pessoa):</p>
                  {form.message_template.split("|||").filter(m => m.trim()).map((m, idx) => (
                    <div key={idx} className="text-[10px] p-1.5 bg-background rounded border border-border/30 flex gap-2">
                      <span className="text-primary font-bold">#{idx + 1}</span>
                      <span className="text-muted-foreground truncate">{m.trim()}</span>
                    </div>
                  ))}
                </div>
              )}
              
              {form.channel === "sms" && (
                <p className="text-xs text-muted-foreground mt-1">
                  {form.message_template.length}/160 caracteres
                </p>
              )}
              {form.channel === "whatsapp" && (
                <div className="bg-primary/10 border border-primary/20 rounded-md p-3 mt-2 text-xs text-primary/80">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold text-primary">Sistema Anti-Bloqueio WhatsApp:</p>
                    {form.message_template.includes("|||") && (
                      <Badge variant="outline" className="bg-primary/20 border-primary/30 text-[10px] h-5">
                        {form.message_template.split("|||").filter(m => m.trim()).length} variações detectadas
                      </Badge>
                    )}
                  </div>
                  <p className="opacity-80">
                    O sistema rotacionará as mensagens e aplicará delays aleatórios (3s a 30s) para cada cliente.
                  </p>
                </div>
              )}
            </div>

            {form.message_template && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-foreground text-xs">👀 Preview (Exemplo de 1 variação)</Label>
                  {form.message_template.includes("|||") && (
                    <p className="text-[10px] text-muted-foreground">O sistema escolhe 1 por cliente aleatoriamente</p>
                  )}
                </div>
                <Card className="p-3 bg-secondary/30 border-border border-dashed">
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {(() => {
                      const variants = form.message_template.split("|||").filter(m => m.trim());
                      let msg = variants[0] || ""; // Show first as example
                      Object.entries(PREVIEW_DATA).forEach(([key, val]) => {
                        msg = msg.split(key).join(val);
                      });
                      return msg;
                    })()}
                  </p>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Step 3 - Review */}
        {step === 3 && (
          <div className="space-y-4 py-2">
            <Card className="p-4 bg-secondary/50 border-border space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Régua</p>
                <p className="text-sm font-semibold text-foreground">{form.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Gatilho</p>
                <p className="text-sm text-foreground">
                  {TRIGGER_OPTIONS.find((t) => t.value === form.trigger_event)?.label} • {form.delay_days} dias
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Canal</p>
                <p className="text-sm text-foreground">
                  {CHANNEL_OPTIONS.find((c) => c.value === form.channel)?.label}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Mensagem</p>
                <div className="bg-background/50 p-2 rounded border border-border mt-1">
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {(() => {
                        const variants = form.message_template.split("|||").filter(m => m.trim());
                        let msg = variants[0] || "";
                        Object.entries(PREVIEW_DATA).forEach(([key, val]) => {
                          msg = msg.split(key).join(val);
                        });
                        return msg;
                      })()}
                  </p>
                  {form.message_template.includes("|||") && (
                    <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
                      <span className="text-[10px] text-primary font-medium flex items-center gap-1">
                         <Sparkles className="h-2.5 w-2.5" />
                         Contém {form.message_template.split("|||").filter(m => m.trim()).length} variações seguras
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <div className="flex items-center justify-between">
              <Label className="text-foreground">Ativar imediatamente</Label>
              <Switch checked={form.active} onCheckedChange={(v) => updateForm("active", v)} />
            </div>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button
            variant="outline"
            onClick={() => (step > 1 ? setStep(step - 1) : onClose())}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            {step === 1 ? "Cancelar" : "Voltar"}
          </Button>

          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext()} className="gap-1.5">
              Próximo
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSave} className="gap-1.5 gradient-primary text-primary-foreground">
              <Check className="h-4 w-4" />
              Salvar Régua
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
