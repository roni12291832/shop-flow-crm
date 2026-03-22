import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Profile { user_id: string; name: string; }
interface Goal { id: string; user_id: string | null; period_type: string; target_value: number; start_date: string; end_date: string; }

export default function GoalsConfig() {
  const {  user } = useAuth();
  const navigate = useNavigate();
  const [periodType, setPeriodType] = useState<"daily" | "weekly" | "monthly">("daily");
  const [storeGoal, setStoreGoal] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [individualGoals, setIndividualGoals] = useState<Record<string, string>>({});
  const [existingGoals, setExistingGoals] = useState<Goal[]>([]);
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const startDate = today;
  const endDate = (() => {
    const d = new Date();
    if (periodType === "daily") return today;
    if (periodType === "weekly") { d.setDate(d.getDate() + (6 - d.getDay())); return d.toISOString().split("T")[0]; }
    d.setMonth(d.getMonth() + 1, 0); return d.toISOString().split("T")[0];
  })();

  useEffect(() => {
        const fetch_ = async () => {
      const [{ data: profs }, { data: goals }] = await Promise.all([
        supabase.from("profiles").select("user_id, name"),
        supabase.from("goals").select("*").order("created_at", { ascending: false }),
      ]);
      setProfiles((profs || []) as Profile[]);
      setExistingGoals((goals || []) as Goal[]);
    };
    fetch_();
  }, [tenantId]);

  const distributeEqually = () => {
    const total = parseFloat(storeGoal) || 0;
    if (profiles.length === 0 || total === 0) return;
    const perPerson = Math.round(total / profiles.length);
    const map: Record<string, string> = {};
    profiles.forEach(p => { map[p.user_id] = String(perPerson); });
    setIndividualGoals(map);
  };

  const handleSave = async () => {
    if (!tenantId || !user) return;
    setSaving(true);

    const goalsToInsert: any[] = [];

    // Store goal
    if (storeGoal) {
      goalsToInsert.push({
         user_id: null, period_type: periodType,
        target_value: parseFloat(storeGoal), start_date: startDate, end_date: endDate, created_by: user.id,
      });
    }

    // Individual goals
    Object.entries(individualGoals).forEach(([userId, value]) => {
      if (value && parseFloat(value) > 0) {
        goalsToInsert.push({
           user_id: userId, period_type: periodType,
          target_value: parseFloat(value), start_date: startDate, end_date: endDate, created_by: user.id,
        });
      }
    });

    if (goalsToInsert.length === 0) { toast.error("Defina pelo menos uma meta"); setSaving(false); return; }

    const { error } = await supabase.from("goals").insert(goalsToInsert);
    setSaving(false);
    if (error) toast.error("Erro ao salvar metas");
    else {
      toast.success("Metas salvas com sucesso!");
      // Refresh
      const { data } = await supabase.from("goals").select("*").order("created_at", { ascending: false });
      setExistingGoals((data || []) as Goal[]);
      setStoreGoal(""); setIndividualGoals({});
    }
  };

  const PERIOD_LABELS: Record<string, string> = { daily: "Diária", weekly: "Semanal", monthly: "Mensal" };

  return (
    <div className="p-4 md:p-7 space-y-7 animate-fade-in max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/metas")}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-foreground font-bold text-xl">Configurar Metas</h1>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
        <div className="space-y-2">
          <Label>Período</Label>
          <Select value={periodType} onValueChange={v => setPeriodType(v as any)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Diária</SelectItem>
              <SelectItem value="weekly">Semanal</SelectItem>
              <SelectItem value="monthly">Mensal</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Período: {startDate} até {endDate}</p>
        </div>

        <div className="space-y-2">
          <Label>Meta da Loja (R$)</Label>
          <Input type="number" step="0.01" value={storeGoal} onChange={e => setStoreGoal(e.target.value)}
            placeholder="Ex: 8000" className="text-lg font-bold max-w-xs" />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5"><Users className="h-4 w-4" /> Metas Individuais por Vendedor</Label>
            <Button variant="outline" size="sm" onClick={distributeEqually} disabled={!storeGoal}>
              Distribuir igualmente
            </Button>
          </div>
          <div className="space-y-2">
            {profiles.map(p => (
              <div key={p.user_id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-[11px] font-bold text-white">
                  {p.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <span className="flex-1 text-sm text-foreground font-medium">{p.name}</span>
                <Input type="number" step="0.01" placeholder="R$"
                  value={individualGoals[p.user_id] || ""} onChange={e => setIndividualGoals({ ...individualGoals, [p.user_id]: e.target.value })}
                  className="w-32 text-right" />
              </div>
            ))}
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="gap-1.5"><Save className="h-4 w-4" /> Salvar Metas</Button>
      </div>

      {/* History */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="text-foreground font-bold text-base mb-4">Histórico de Metas</h3>
        {existingGoals.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma meta cadastrada</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Período", "Tipo", "Valor", "Início", "Fim"].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-muted-foreground text-[11px] font-semibold uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {existingGoals.slice(0, 20).map(g => (
                  <tr key={g.id} className="border-b border-border/20">
                    <td className="px-4 py-2 text-sm text-foreground">{PERIOD_LABELS[g.period_type] || g.period_type}</td>
                    <td className="px-4 py-2 text-sm text-muted-foreground">{g.user_id ? "Individual" : "Loja"}</td>
                    <td className="px-4 py-2 text-sm text-foreground font-semibold">R${Number(g.target_value).toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2 text-sm text-muted-foreground">{g.start_date}</td>
                    <td className="px-4 py-2 text-sm text-muted-foreground">{g.end_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
