import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { RuleCard } from "@/components/regua/RuleCard";
import { RuleWizard } from "@/components/regua/RuleWizard";
import { ExecutionTimeline } from "@/components/regua/ExecutionTimeline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Zap } from "lucide-react";
import { toast } from "sonner";

interface Rule {
  id: string;
  name: string;
  trigger_event: string;
  delay_days: number;
  channel: string;
  active: boolean;
  message_template: string;
  tenant_id: string;
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
  const { tenantId, hasRole } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [executionCounts, setExecutionCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<(Partial<Rule> & { id?: string }) | undefined>();

  const canManage = hasRole("admin") || hasRole("gerente");

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    const [{ data: rulesData }, { data: execData }] = await Promise.all([
      supabase
        .from("relationship_rules")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),
      supabase
        .from("relationship_executions")
        .select("*, rule:relationship_rules(name, channel), customer:clients(name, phone)")
        .eq("tenant_id", tenantId)
        .order("scheduled_for", { ascending: true })
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
  }, [tenantId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggle = async (id: string, active: boolean) => {
    const { error } = await supabase
      .from("relationship_rules")
      .update({ active })
      .eq("id", id);

    if (error) {
      toast.error("Erro ao atualizar régua");
      return;
    }
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, active } : r)));
    toast.success(active ? "Régua ativada" : "Régua desativada");
  };

  const handleSave = async (data: any) => {
    if (!tenantId) return;

    if (editingRule?.id) {
      const { error } = await supabase
        .from("relationship_rules")
        .update(data)
        .eq("id", editingRule.id);

      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Régua atualizada!");
    } else {
      const { error } = await supabase
        .from("relationship_rules")
        .insert({ ...data, tenant_id: tenantId });

      if (error) { toast.error("Erro ao criar régua"); return; }
      toast.success("Régua criada!");
    }

    setWizardOpen(false);
    setEditingRule(undefined);
    fetchData();
  };

  const handleDuplicate = async (rule: Rule) => {
    if (!tenantId) return;
    const { id, tenant_id, ...rest } = rule;
    const { error } = await supabase
      .from("relationship_rules")
      .insert({ ...rest, tenant_id: tenantId, name: `${rest.name} (cópia)`, active: false });

    if (error) { toast.error("Erro ao duplicar"); return; }
    toast.success("Régua duplicada!");
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("relationship_rules").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Régua excluída");
    fetchData();
  };

  const handleEdit = (rule: Rule) => {
    setEditingRule(rule);
    setWizardOpen(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Régua de Relacionamento</h1>
          <p className="text-sm text-muted-foreground">Automação de mensagens pós-venda</p>
        </div>
        {canManage && (
          <Button onClick={() => { setEditingRule(undefined); setWizardOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Régua
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Rules */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Réguas Configuradas
          </h2>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 bg-muted/50 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : rules.length === 0 ? (
            <Card className="p-8 text-center">
              <Zap className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">Nenhuma régua configurada</p>
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => { setEditingRule(undefined); setWizardOpen(true); }}
                >
                  Criar primeira régua
                </Button>
              )}
            </Card>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
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

        {/* Right: Timeline */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Zap className="h-5 w-5 text-accent" />
            Timeline de Disparos
          </h2>
          <ExecutionTimeline executions={executions} loading={loading} />
        </div>
      </div>

      {/* Wizard */}
      <RuleWizard
        open={wizardOpen}
        onClose={() => { setWizardOpen(false); setEditingRule(undefined); }}
        onSave={handleSave}
        initialData={editingRule}
      />
    </div>
  );
}
