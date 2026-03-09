import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

interface CampaignModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingCampaign?: any;
}

const AVAILABLE_TAGS = ["VIP", "Recorrente", "Novo", "Homens", "Mulheres", "Inativo"];

export function CampaignModal({ open, onClose, onSaved, editingCampaign }: CampaignModalProps) {
  const { tenantId } = useAuth();
  const [name, setName] = useState("");
  const [date, setDate] = useState<Date>();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [messageTemplate, setMessageTemplate] = useState("");
  const [estimatedClients, setEstimatedClients] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingCampaign) {
      setName(editingCampaign.name);
      setDate(new Date(editingCampaign.date + "T12:00:00"));
      setSelectedTags(editingCampaign.segment_tags || []);
      setMessageTemplate(editingCampaign.message_template || "");
    } else {
      setName(""); setDate(undefined); setSelectedTags([]); setMessageTemplate("");
    }
  }, [editingCampaign, open]);

  useEffect(() => {
    if (!tenantId || !open) return;
    const fetchEstimate = async () => {
      let query = supabase.from("clients").select("id", { count: "exact" }).eq("tenant_id", tenantId);
      if (selectedTags.length > 0) {
        query = query.overlaps("tags", selectedTags);
      }
      const { count } = await query;
      setEstimatedClients(count || 0);
    };
    fetchEstimate();
  }, [selectedTags, tenantId, open]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const insertVariable = (variable: string) => {
    setMessageTemplate(prev => prev + `{{${variable}}}`);
  };

  const handleSave = async () => {
    if (!name || !date || !tenantId) return;
    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        name,
        date: format(date, "yyyy-MM-dd"),
        segment_tags: selectedTags,
        message_template: messageTemplate,
        active: true,
      };
      if (editingCampaign) {
        await supabase.from("special_dates").update(payload).eq("id", editingCampaign.id);
      } else {
        await supabase.from("special_dates").insert(payload);
      }
      toast({ title: "Campanha salva com sucesso!" });
      onSaved();
      onClose();
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingCampaign ? "Editar Campanha" : "Nova Campanha"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Nome da Campanha</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Black Friday 2026" />
          </div>

          <div>
            <Label>Data do Disparo</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left", !date && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "dd 'de' MMMM, yyyy", { locale: ptBR }) : "Selecionar data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={setDate} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>Segmentação por Tags</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {AVAILABLE_TAGS.map(tag => (
                <button key={tag} onClick={() => toggleTag(tag)}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    selectedTags.includes(tag) ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border hover:border-primary/50"
                  )}>
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-secondary/50 rounded-lg px-4 py-3 flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-primary" />
            <span>Sua mensagem será enviada para <strong className="text-foreground">{estimatedClients}</strong> clientes</span>
          </div>

          <div>
            <Label>Mensagem</Label>
            <div className="flex flex-wrap gap-1 mb-2">
              {["nome", "loja", "telefone"].map(v => (
                <button key={v} onClick={() => insertVariable(v)}
                  className="px-2 py-1 text-[10px] bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors">
                  +{v}
                </button>
              ))}
            </div>
            <Textarea value={messageTemplate} onChange={e => setMessageTemplate(e.target.value)}
              placeholder="Ex: Oi {{nome}}! Temos uma oferta especial para você..." rows={4} />
          </div>

          {messageTemplate && (
            <div className="bg-secondary/30 border border-border rounded-lg p-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Preview</span>
              <p className="text-sm mt-1 text-foreground">
                {messageTemplate.replace(/\{\{nome\}\}/g, "Maria Silva").replace(/\{\{loja\}\}/g, "Loja XYZ").replace(/\{\{telefone\}\}/g, "(11) 99999-0001")}
              </p>
            </div>
          )}

          <Button className="w-full" onClick={handleSave} disabled={saving || !name || !date}>
            {saving ? "Salvando..." : editingCampaign ? "Atualizar Campanha" : "Agendar Campanha"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
