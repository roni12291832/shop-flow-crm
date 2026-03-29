import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { RuleCard } from "@/components/regua/RuleCard";
import { RuleWizard, type RuleFormData } from "@/components/regua/RuleWizard";
import { ExecutionTimeline } from "@/components/regua/ExecutionTimeline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Heart, ShoppingBag, Send, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Rule {
  id: string;
  name: string;
  trigger_event: "birthday" | "no_purchase";
  channel: string;
  active: boolean;
  message_template: string;
  campaign_start?: string | null;
  campaign_end?: string | null;
  media_urls?: string[] | null;
}

interface Execution {
  id: string;
  scheduled_for: string;
  sent_at: string | null;
  status: string;
  message_sent: string | null;
  rule_id: string;
  customer_id: string;
  customer: { name: string; phone: string | null } | null;
  rule: { name: string; channel: string } | null;
}

export default function RelationshipRules() {
  const { hasRole } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [executionCounts, setExecutionCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any>();

  const canManage = hasRole("admin") || hasRole("gerente");

  // ─── Fetch ─────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: rulesData }, { data: execData }] = await Promise.all([
      supabase.from("relationship_rules").select("*").order("created_at", { ascending: false }),
      supabase
        .from("relationship_executions")
        .select("*, rule:relationship_rules(name, channel), customer:clients(name, phone)")
        .order("scheduled_for", { ascending: false })
        .limit(100),
    ]);

    if (rulesData) setRules(rulesData as Rule[]);

    if (execData) {
      setExecutions(execData as unknown as Execution[]);
      const counts: Record<string, number> = {};
      execData.forEach((e: any) => {
        counts[e.rule_id] = (counts[e.rule_id] || 0) + 1;
      });
      setExecutionCounts(counts);
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Toggle ────────────────────────────────────────────────────────────────

  const handleToggle = async (id: string, active: boolean) => {
    const { error } = await supabase.from("relationship_rules").update({ active }).eq("id", id);
    if (error) { toast.error("Erro ao atualizar régua"); return; }
    setRules(prev => prev.map(r => r.id === id ? { ...r, active } : r));
    toast.success(active ? "Régua ativada" : "Régua desativada");
  };

  // ─── Upload de mídia para Supabase Storage ────────────────────────────────

  const uploadPendingMedia = async (pendingMedia: RuleFormData["pendingMedia"]): Promise<string[]> => {
    const uploaded: string[] = [];
    for (const item of pendingMedia) {
      try {
        const ext = item.file.name.split(".").pop()?.toLowerCase() || (item.type === "video" ? "mp4" : "jpg");
        const path = `rule-media/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from("rule-media").upload(path, item.file, {
          contentType: item.file.type,
          upsert: false,
        });
        if (error) {
          toast.warning(`Falha ao enviar "${item.file.name}": ${error.message}`);
          continue;
        }
        const { data: { publicUrl } } = supabase.storage.from("rule-media").getPublicUrl(path);
        uploaded.push(publicUrl);
      } catch (e) {
        toast.warning(`Erro ao enviar mídia: ${e}`);
      }
    }
    return uploaded;
  };

  // ─── Save (cria ou atualiza régua + variações + mídia) ────────────────────

  const handleSave = async (data: RuleFormData) => {
    const { variations, pendingMedia, ...ruleData } = data;

    // 1. Upload de mídias pendentes (novas fotos/vídeo)
    let allMediaUrls = [...(ruleData.media_urls || [])];
    if (pendingMedia && pendingMedia.length > 0) {
      toast.info(`Enviando ${pendingMedia.length} arquivo(s)...`);
      const newUrls = await uploadPendingMedia(pendingMedia);
      allMediaUrls = [...allMediaUrls, ...newUrls];
    }
    ruleData.media_urls = allMediaUrls;

    let ruleId: string | null = null;

    if (editingRule?.id) {
      // Atualiza régua existente
      const { error } = await supabase
        .from("relationship_rules")
        .update(ruleData as any)
        .eq("id", editingRule.id);

      if (error) { toast.error(`Erro ao atualizar: ${error.message}`); return; }
      ruleId = editingRule.id;
      toast.success("Régua atualizada!");
    } else {
      // Cria nova régua
      const { data: inserted, error } = await supabase
        .from("relationship_rules")
        .insert([ruleData as any])
        .select("id")
        .single();

      if (error || !inserted) { toast.error(`Erro ao criar régua: ${error?.message}`); return; }
      ruleId = inserted.id;
    }

    // Salva variações na tabela relationship_message_variations
    if (ruleId && variations.length > 0) {
      try {
        // Remove variações antigas
        await (supabase as any).from("relationship_message_variations").delete().eq("rule_id", ruleId);

        // Insere novas variações
        const rows = variations.map((content, idx) => ({
          rule_id: ruleId,
          content: content.trim(),
          variation_number: idx + 1,
        }));
        const { error: varError } = await (supabase as any)
          .from("relationship_message_variations")
          .insert(rows);

        if (varError) {
          toast.warning(`Régua salva, mas erro nas variações: ${varError.message}`);
        } else {
          toast.success(`${variations.length} variações salvas!`);
        }
      } catch (e) {
        toast.warning("Régua salva, mas falha ao salvar variações. Verifique o banco.");
        console.error("Erro ao salvar variações:", e);
      }
    }

    setWizardOpen(false);
    setEditingRule(undefined);
    fetchData();
  };

  // ─── Edit (carrega também as variações) ───────────────────────────────────

  const handleEdit = async (rule: Rule) => {
    try {
      let variations: string[] = [];
      try {
        const { data: varData } = await (supabase as any)
          .from("relationship_message_variations")
          .select("content, variation_number")
          .eq("rule_id", rule.id)
          .order("variation_number", { ascending: true });

        variations = (varData || []).map((v: any) => v.content || "");
      } catch {
        // Fallback: pega do message_template com |||
        variations = (rule.message_template || "").split("|||").map((s: string) => s.trim()).filter(Boolean);
      }
      setEditingRule({ ...rule, variations, media_urls: (rule as any).media_urls || [], pendingMedia: [] });
    } catch {
      // If anything fails, still open wizard with whatever data we have
      setEditingRule({ ...rule, variations: [], media_urls: (rule as any).media_urls || [], pendingMedia: [] });
    } finally {
      setWizardOpen(true);
    }
  };

  // ─── Duplicate ─────────────────────────────────────────────────────────────

  const handleDuplicate = async (rule: Rule) => {
    const { id, ...rest } = rule;
    const { data: dup, error } = await supabase
      .from("relationship_rules")
      .insert([{ ...rest, name: `${rest.name} (cópia)`, active: false } as any])
      .select("id")
      .single();

    if (error || !dup) { toast.error("Erro ao duplicar"); return; }

    // Copia variações
    try {
      const { data: varData } = await (supabase as any)
        .from("relationship_message_variations")
        .select("content, variation_number")
        .eq("rule_id", id);

      if (varData && varData.length > 0) {
        const rows = varData.map((v: any) => ({ rule_id: dup.id, content: v.content, variation_number: v.variation_number }));
        await (supabase as any).from("relationship_message_variations").insert(rows);
      }
    } catch { /* não crítico */ }

    toast.success("Régua duplicada!");
    fetchData();
  };

  // ─── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    // Variações são deletadas via CASCADE (FK no banco) ou manualmente
    try {
      await (supabase as any).from("relationship_message_variations").delete().eq("rule_id", id);
    } catch { /* não crítico se não tiver CASCADE */ }

    const { error } = await supabase.from("relationship_rules").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Régua excluída");
    fetchData();
  };

  // ─── Stats ─────────────────────────────────────────────────────────────────

  const birthdayRules = rules.filter(r => r.trigger_event === "birthday");
  const buyersRules = rules.filter(r => r.trigger_event === "no_purchase");
  const totalSentToday = executions.filter(e =>
    e.sent_at && new Date(e.sent_at).toDateString() === new Date().toDateString()
  ).length;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Régua de Relacionamento</h1>
          <p className="text-sm text-muted-foreground">Automação de mensagens para compradores e aniversariantes</p>
        </div>
        {canManage && (
          <Button onClick={() => { setEditingRule(undefined); setWizardOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Régua
          </Button>
        )}
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 flex items-center gap-3">
          <Heart className="h-8 w-8 text-rose-500 bg-rose-500/10 rounded-lg p-1.5 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Aniversário</p>
            <p className="text-lg font-bold text-foreground">{birthdayRules.filter(r => r.active).length} ativa{birthdayRules.filter(r => r.active).length !== 1 ? "s" : ""}</p>
          </div>
        </Card>
        <Card className="p-3 flex items-center gap-3">
          <ShoppingBag className="h-8 w-8 text-amber-500 bg-amber-500/10 rounded-lg p-1.5 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Compradores</p>
            <p className="text-lg font-bold text-foreground">{buyersRules.filter(r => r.active).length} ativa{buyersRules.filter(r => r.active).length !== 1 ? "s" : ""}</p>
          </div>
        </Card>
        <Card className="p-3 flex items-center gap-3">
          <Send className="h-8 w-8 text-primary bg-primary/10 rounded-lg p-1.5 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Enviados hoje</p>
            <p className="text-lg font-bold text-foreground">{totalSentToday}</p>
          </div>
        </Card>
      </div>

      {/* Aviso de regras */}
      <Card className="p-3 bg-primary/5 border-primary/20">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <div>
            <span className="text-primary font-medium">Regras de envio para Compradores:</span>
            {" "}20 mensagens das 08h–12h + 20 mensagens das 13h–18h = <strong>40/dia</strong>.
            Apenas Seg–Sáb. Cada cliente recebe variação diferente. Delay de 1–3 min entre envios.
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lista de Réguas */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Réguas Configuradas</h2>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <div key={i} className="h-28 bg-muted/50 animate-pulse rounded-xl" />)}
            </div>
          ) : rules.length === 0 ? (
            <Card className="p-8 text-center">
              <ShoppingBag className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">Nenhuma régua configurada</p>
              {canManage && (
                <Button variant="outline" size="sm" className="mt-3"
                  onClick={() => { setEditingRule(undefined); setWizardOpen(true); }}>
                  Criar primeira régua
                </Button>
              )}
            </Card>
          ) : (
            <div className="space-y-3">
              {rules.map(rule => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  executionCount={executionCounts[rule.id] || 0}
                  onToggle={handleToggle}
                  onEdit={handleEdit}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Timeline de Disparos</h2>
          <ExecutionTimeline executions={executions} loading={loading} />
        </div>
      </div>

      {/* Wizard */}
      <RuleWizard
        key={editingRule?.id || "new-rule"}
        open={wizardOpen}
        onClose={() => { setWizardOpen(false); setEditingRule(undefined); }}
        onSave={handleSave}
        initialData={editingRule}
      />
    </div>
  );
}
