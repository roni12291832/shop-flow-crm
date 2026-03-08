import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, DollarSign, User } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

const STAGES = [
  { value: "lead_recebido", label: "Lead Recebido", color: "bg-blue-500" },
  { value: "contato_iniciado", label: "Contato Iniciado", color: "bg-cyan-500" },
  { value: "cliente_interessado", label: "Interessado", color: "bg-emerald-500" },
  { value: "negociacao", label: "Negociação", color: "bg-yellow-500" },
  { value: "proposta_enviada", label: "Proposta Enviada", color: "bg-orange-500" },
  { value: "venda_fechada", label: "Venda Fechada", color: "bg-green-600" },
  { value: "perdido", label: "Perdido", color: "bg-red-500" },
];

interface Opportunity {
  id: string;
  title: string;
  estimated_value: number;
  stage: string;
  probability: number;
  client_id: string;
  client_name?: string;
  created_at: string;
}

interface Client {
  id: string;
  name: string;
}

export default function Pipeline() {
  const { tenantId, user } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    client_id: "",
    estimated_value: "",
    stage: "lead_recebido",
  });

  const fetchData = async () => {
    if (!tenantId) return;
    const [oppsRes, clientsRes] = await Promise.all([
      supabase.from("opportunities").select("*").eq("tenant_id", tenantId),
      supabase.from("clients").select("id, name").eq("tenant_id", tenantId),
    ]);
    
    const clientMap: Record<string, string> = {};
    (clientsRes.data || []).forEach((c: any) => { clientMap[c.id] = c.name; });
    
    const opps = (oppsRes.data || []).map((o: any) => ({
      ...o,
      client_name: clientMap[o.client_id] || "Cliente",
    }));
    
    setOpportunities(opps);
    setClients((clientsRes.data || []) as Client[]);
  };

  useEffect(() => {
    fetchData();
  }, [tenantId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !user) return;
    const { error } = await supabase.from("opportunities").insert({
      tenant_id: tenantId,
      title: form.title,
      client_id: form.client_id,
      estimated_value: parseFloat(form.estimated_value) || 0,
      stage: form.stage as any,
      responsible_id: user.id,
    });
    if (error) {
      toast.error("Erro ao criar oportunidade");
    } else {
      toast.success("Oportunidade criada!");
      setDialogOpen(false);
      setForm({ title: "", client_id: "", estimated_value: "", stage: "lead_recebido" });
      fetchData();
    }
  };

  const moveStage = async (oppId: string, newStage: string) => {
    const { error } = await supabase
      .from("opportunities")
      .update({ stage: newStage as any })
      .eq("id", oppId);
    if (!error) fetchData();
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pipeline de Vendas</h1>
          <p className="text-muted-foreground">
            {opportunities.length} oportunidades ativas
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Nova Oportunidade
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Oportunidade</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  placeholder="Ex: Venda de produto X"
                />
              </div>
              <div className="space-y-2">
                <Label>Cliente *</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor Estimado (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.estimated_value}
                  onChange={(e) => setForm({ ...form, estimated_value: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <Button type="submit" className="w-full">
                Criar Oportunidade
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Kanban Board */}
      <ScrollArea className="w-full">
        <div className="flex gap-4 pb-4 min-w-max">
          {STAGES.map((stage) => {
            const stageOpps = opportunities.filter((o) => o.stage === stage.value);
            const stageTotal = stageOpps.reduce((s, o) => s + Number(o.estimated_value || 0), 0);

            return (
              <div
                key={stage.value}
                className="w-72 flex-shrink-0"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                    <h3 className="text-sm font-semibold">{stage.label}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {stageOpps.length}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  R$ {stageTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>

                <div className="space-y-2">
                  {stageOpps.map((opp) => (
                    <Card
                      key={opp.id}
                      className="border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <CardContent className="p-3 space-y-2">
                        <p className="font-medium text-sm">{opp.title}</p>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          {opp.client_name}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-success">
                          <DollarSign className="h-3 w-3" />
                          R$ {Number(opp.estimated_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </div>
                        {/* Quick move buttons */}
                        <div className="flex gap-1 flex-wrap pt-1">
                          {STAGES.filter((s) => s.value !== opp.stage && s.value !== "perdido").map((s) => (
                            <button
                              key={s.value}
                              onClick={() => moveStage(opp.id, s.value)}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {stageOpps.length === 0 && (
                    <div className="border border-dashed rounded-lg p-6 text-center text-xs text-muted-foreground">
                      Nenhuma oportunidade
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
