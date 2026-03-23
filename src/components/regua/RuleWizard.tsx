import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Package, Clock, Heart, Hand, MessageSquare, Mail, Smartphone, ArrowLeft, ArrowRight, Check } from "lucide-react";
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

  const updateForm = (key: keyof RuleFormData, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const insertVariable = (variable: string) => {
    updateForm("message_template", form.message_template + variable);
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
              <div className="flex gap-1.5 mt-1.5 mb-2 flex-wrap">
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
              <Textarea
                placeholder="Escreva sua mensagem aqui..."
                value={form.message_template}
                onChange={(e) => updateForm("message_template", e.target.value)}
                rows={4}
              />
              {form.channel === "sms" && (
                <p className="text-xs text-muted-foreground mt-1">
                  {form.message_template.length}/160 caracteres
                </p>
              )}
              {form.channel === "whatsapp" && (
                <div className="bg-primary/10 border border-primary/20 rounded-md p-3 mt-2 text-xs text-primary/80">
                  <p className="font-semibold mb-1">Evite Bloqueios no WhatsApp (OBRIGATÓRIO):</p>
                  Crie pelo menos <strong>15 variações</strong> diferentes desta mensagem e separe-as por <code>|||</code>. O sistema vai rotacionar as mensagens e aplicar delays (3s a 30s) aleatórios pra cada cliente.
                  <p className="mt-1">💡 <strong>Dica:</strong> Peça ao Jarvis no Chat ou Relatórios para "Gerar 15 variações da mensagem de pós venda para régua e separar com |||".</p>
                </div>
              )}
            </div>

            {form.message_template && (
              <div>
                <Label className="text-foreground text-xs">Preview</Label>
                <Card className="p-3 mt-1 bg-secondary/50 border-border">
                  <p className="text-sm text-foreground whitespace-pre-wrap">{previewMessage()}</p>
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
                <p className="text-sm text-foreground whitespace-pre-wrap">{previewMessage()}</p>
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
