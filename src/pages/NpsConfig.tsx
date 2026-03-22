import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function NpsConfig() {
    const navigate = useNavigate();
  const [settings, setSettings] = useState({
    auto_send_after_sale: false,
    auto_send_after_conversation: false,
    delay_hours: 24,
    message_template: "Oi {{nome}}! Como foi sua experiência na {{loja}}? Avalie em 1 clique: {{link}}",
    ask_comment_from_score: 7,
    webhook_url: "",
  });
  const [existing, setExisting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
        const fetch = async () => {
      const { data } = await supabase
        .from("nps_settings")
        .select("*")
        
        .single();
      if (data) {
        setSettings({
          auto_send_after_sale: data.auto_send_after_sale,
          auto_send_after_conversation: data.auto_send_after_conversation,
          delay_hours: data.delay_hours,
          message_template: data.message_template || "",
          ask_comment_from_score: data.ask_comment_from_score,
          webhook_url: data.webhook_url || "",
        });
        setExisting(true);
      }
    };
    fetch();
  }, [tenantId]);

  const handleSave = async () => {
        setSaving(true);
    try {
      const payload = { ...settings, };
      if (existing) {
        await supabase.from("nps_settings").update(payload);
      } else {
        await supabase.from("nps_settings").insert(payload);
        setExisting(true);
      }
      toast({ title: "Configurações salvas!" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const preview = settings.message_template
    .replace(/\{\{nome\}\}/g, "João Silva")
    .replace(/\{\{loja\}\}/g, "Loja XYZ")
    .replace(/\{\{link\}\}/g, "https://app.exemplo.com/nps/abc123");

  return (
    <div className="p-4 md:p-7 space-y-6 animate-fade-in max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/nps")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold text-foreground">Configurar NPS</h1>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-semibold">Enviar automaticamente após venda confirmada</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Dispara pesquisa NPS após cada venda</p>
          </div>
          <Switch checked={settings.auto_send_after_sale} onCheckedChange={v => setSettings(s => ({ ...s, auto_send_after_sale: v }))} />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-semibold">Enviar automaticamente após conversa finalizada</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Dispara pesquisa ao finalizar conversa no chat</p>
          </div>
          <Switch checked={settings.auto_send_after_conversation} onCheckedChange={v => setSettings(s => ({ ...s, auto_send_after_conversation: v }))} />
        </div>

        <div>
          <Label>Após quantas horas enviar?</Label>
          <Input type="number" min={1} max={168} value={settings.delay_hours}
            onChange={e => setSettings(s => ({ ...s, delay_hours: Math.max(1, Math.min(168, parseInt(e.target.value) || 24)) }))}
            className="w-32 mt-1" />
        </div>

        <div>
          <Label>Pedir comentário para notas abaixo de</Label>
          <Select value={String(settings.ask_comment_from_score)} onValueChange={v => setSettings(s => ({ ...s, ask_comment_from_score: parseInt(v) }))}>
            <SelectTrigger className="w-32 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 10 }, (_, i) => (
                <SelectItem key={i} value={String(i)}>{i}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Mensagem WhatsApp</Label>
          <div className="flex flex-wrap gap-1 my-2">
            {["nome", "loja", "link"].map(v => (
              <button key={v}
                onClick={() => setSettings(s => ({ ...s, message_template: s.message_template + `{{${v}}}` }))}
                className="px-2 py-1 text-[10px] bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors">
                +{v}
              </button>
            ))}
          </div>
          <Textarea value={settings.message_template}
            onChange={e => setSettings(s => ({ ...s, message_template: e.target.value.slice(0, 500) }))}
            rows={3} maxLength={500} />
        </div>

        {settings.message_template && (
          <div className="bg-secondary/30 border border-border rounded-lg p-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Preview</span>
            <p className="text-sm mt-1 text-foreground">{preview}</p>
          </div>
        )}

        <div>
          <Label>URL do Webhook N8N</Label>
          <Input value={settings.webhook_url} onChange={e => setSettings(s => ({ ...s, webhook_url: e.target.value.slice(0, 500) }))}
            placeholder="https://n8n.exemplo.com/webhook/nps" className="mt-1" maxLength={500} />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </div>
    </div>
  );
}
