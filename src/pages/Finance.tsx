import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  FileText, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Wallet, 
  BarChart3, 
  ArrowUpRight, 
  ArrowDownRight, 
  Activity, 
  CreditCard, 
  Banknote, 
  Layers,
  MoreVertical,
  History,
  Lock,
  Unlock,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  AreaChart, 
  Area,
  PieChart,
  Pie,
  Cell
} from "recharts";

export default function Finance() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [showClosingDialog, setShowClosingDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("flow");

  // Metrics
  const [summary, setSummary] = useState({
    entradas: 0,
    saidas: 0,
    pendentes: 0,
    vencendo_hoje: 0,
    recebidos: 0
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: lancamentosData, error } = await (supabase
        .from("lancamentos" as any)
        .select("*")
        .order("data_vencimento", { ascending: false }) as any);

      if (error) throw error;
      setData(lancamentosData || []);

      // Calculate Metrics
      const totalEntradas = lancamentosData?.filter(d => d.tipo === 'entrada' && d.status === 'pago').reduce((a, b) => a + b.valor, 0) || 0;
      const totalSaidas = lancamentosData?.filter(d => d.tipo === 'saida' && d.status === 'pago').reduce((a, b) => a + b.valor, 0) || 0;
      const totalPendentes = lancamentosData?.filter(d => d.status === 'pendente').reduce((a, b) => a + b.valor, 0) || 0;
      
      const hoje = new Date().toISOString().split('T')[0];
      const vencendoHoje = lancamentosData?.filter(d => d.data_vencimento === hoje && d.status === 'pendente').length || 0;

      setSummary({
        entradas: totalEntradas,
        saidas: totalSaidas,
        pendentes: totalPendentes,
        vencendo_hoje: vencendoHoje,
        recebidos: totalEntradas
      });
    } catch (e: any) {
      toast.error("Erro ao carregar dados financeiros.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="p-4 md:p-8 space-y-6 bg-background min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" /> Financeiro Operacional
          </h1>
          <p className="text-muted-foreground">Gestão de fluxo de caixa, contas a pagar/receber e DRE.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setShowClosingDialog(true)}>
            <Lock className="h-4 w-4" /> Fechar Caixa
          </Button>
          <Button className="gap-2" onClick={() => setShowTransactionDialog(true)}>
            <Plus className="h-4 w-4" /> Novo Lançamento
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Entradas (Mês)" value={summary.entradas} icon={<TrendingUp className="text-emerald-500" />} trend="+12%" type="entrada" />
        <MetricCard title="Saídas (Mês)" value={summary.saidas} icon={<TrendingDown className="text-rose-500" />} trend="+5%" type="saida" />
        <MetricCard title="Saldo em Aberto" value={summary.pendentes} icon={<Clock className="text-amber-500" />} type="normal" />
        <MetricCard title="Vencendo Hoje" value={summary.vencendo_hoje} count={true} icon={<AlertCircle className="text-rose-500" />} type="alert" />
      </div>

      <Tabs defaultValue="flow" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="bg-muted p-1 rounded-xl">
          <TabsTrigger value="flow" className="gap-2">Fluxo de Caixa</TabsTrigger>
          <TabsTrigger value="receivable" className="gap-2">Contas a Receber</TabsTrigger>
          <TabsTrigger value="payable" className="gap-2">Contas a Pagar</TabsTrigger>
          <TabsTrigger value="dre" className="gap-2">DRE Simplificado</TabsTrigger>
        </TabsList>

        <TabsContent value="flow" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-card border rounded-2xl p-6 shadow-sm">
              <h3 className="font-bold mb-6 flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Projeção Dia a Dia (Próximos 30 dias)
              </h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={generateProjData()}>
                    <defs>
                      <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                    <YAxis fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => `R$ ${v/1000}k`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: '8px' }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Area type="monotone" dataKey="saldo" stroke="#3b82f6" fillOpacity={1} fill="url(#colorSaldo)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-4">
              <RecentActivity lancamentos={data.slice(0, 5)} />
              <div className="bg-card border rounded-2xl p-6 shadow-sm">
                <h3 className="text-sm font-bold mb-4 uppercase tracking-widest text-muted-foreground">Formas de Recebimento</h3>
                <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={generatePieData()} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5}>
                                <Cell fill="#10b981" />
                                <Cell fill="#3b82f6" />
                                <Cell fill="#f59e0b" />
                            </Pie>
                            <Tooltip 
                              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: '8px' }}
                              labelStyle={{ color: "hsl(var(--foreground))" }}
                              itemStyle={{ color: "hsl(var(--foreground))" }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="receivable" className="mt-6">
          <TransactionTable data={data.filter(d => d.tipo === 'entrada')} onUpdate={fetchData} />
        </TabsContent>

        <TabsContent value="payable" className="mt-6">
          <TransactionTable data={data.filter(d => d.tipo === 'saida')} onUpdate={fetchData} />
        </TabsContent>

        <TabsContent value="dre" className="mt-6">
          <DREView data={data} />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {showTransactionDialog && (
          <AddTransactionDialog 
            isOpen={showTransactionDialog} 
            onClose={() => setShowTransactionDialog(false)} 
            onSuccess={fetchData}
          />
      )}

      {showClosingDialog && (
          <CashClosingDialog
            isOpen={showClosingDialog}
            onClose={() => setShowClosingDialog(false)}
            onSuccess={fetchData}
            summary={summary}
          />
      )}
    </div>
  );
}

function MetricCard({ title, value, count, icon, trend, type }: any) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
      <div className="flex justify-between items-start mb-3">
        <div className="p-2 rounded-lg bg-muted">{icon}</div>
        {trend && (
            <Badge variant="outline" className={cn(
                "h-5 text-[10px] font-bold",
                type === 'entrada' ? "text-emerald-600 bg-emerald-50 border-emerald-100" : "text-rose-600 bg-rose-50 border-rose-100"
            )}>
                {trend}
            </Badge>
        )}
      </div>
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
        <p className="text-xl font-black mt-1">
          {count ? value : `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
        </p>
      </div>
    </div>
  );
}

function TransactionTable({ data, onUpdate }: { data: any[], onUpdate: () => void }) {
    const handleToggleStatus = async (item: any) => {
        const newStatus = item.status === 'pago' ? 'pendente' : 'pago';
        const dataPagamento = newStatus === 'pago' ? new Date().toISOString().split('T')[0] : null;

        try {
            const { error } = await (supabase
                .from("lancamentos" as any)
                .update({ status: newStatus, data_pagamento: dataPagamento })
                .eq("id", item.id) as any);
            
            if (error) throw error;
            toast.success("Lançamento atualizado!");
            onUpdate();
        } catch (e) {
            toast.error("Erro ao atualizar lançamento.");
        }
    };

    return (
        <div className="bg-card border rounded-2xl overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-muted/30">
                <div className="flex gap-2">
                    <Input placeholder="Filtrar por descrição..." className="max-w-xs h-9 text-sm" />
                    <Button variant="outline" size="sm" className="h-9 gap-1.5"><Filter className="h-3.5 w-3.5" /> Filtros</Button>
                </div>
            </div>
            <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-xs font-bold uppercase text-muted-foreground border-b border-border">
                    <tr>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Descrição / Categoria</th>
                        <th className="px-6 py-4">Vencimento</th>
                        <th className="px-6 py-4">Valor</th>
                        <th className="px-6 py-4 text-right">Ação</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {data.map(item => {
                        const isOverdue = new Date(item.data_vencimento) < new Date() && item.status === 'pendente';
                        return (
                            <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                                <td className="px-6 py-4">
                                    <button onClick={() => handleToggleStatus(item)}>
                                        {item.status === 'pago' ? (
                                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                        ) : (
                                            <div className={cn("h-5 w-5 rounded-full border-2", isOverdue ? "border-rose-500 animate-pulse" : "border-slate-300")} />
                                        )}
                                    </button>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className="font-bold">{item.descricao}</span>
                                        <Badge variant="outline" className="text-[10px] w-fit h-4 mt-1 font-bold lowercase">{item.categoria}</Badge>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={cn("text-xs font-medium", isOverdue && "text-rose-500 font-bold")}>
                                        {new Date(item.data_vencimento).toLocaleDateString()}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-bold text-foreground">
                                    R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"><MoreVertical className="h-4 w-4" /></Button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function RecentActivity({ lancamentos }: { lancamentos: any[] }) {
    return (
        <div className="bg-card border rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-bold mb-4 uppercase tracking-widest text-muted-foreground">Atividade Recente</h3>
            <div className="space-y-4">
                {lancamentos.map(l => (
                    <div key={l.id} className="flex items-center gap-3">
                        <div className={cn(
                            "p-2 rounded-lg",
                            l.tipo === 'entrada' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                        )}>
                            {l.tipo === 'entrada' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">{l.descricao}</p>
                            <p className="text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</p>
                        </div>
                        <p className={cn("text-sm font-black", l.tipo === 'entrada' ? "text-emerald-500" : "text-rose-500")}>
                            {l.tipo === 'entrada' ? '+' : '-'} R$ {l.valor}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}

function DREView({ data }: { data: any[] }) {
    const receitaBruta = data.filter(d => d.tipo === 'entrada' && d.status === 'pago').reduce((a, b) => a + b.valor, 0);
    const custosVar = receitaBruta * 0.4; // Exemplo de CMV
    const despesasFixas = data.filter(d => d.tipo === 'saida' && d.status === 'pago' && ['aluguel', 'pessoal', 'infraestrutura'].includes(d.categoria)).reduce((a, b) => a + b.valor, 0);
    const despesasVar = data.filter(d => d.tipo === 'saida' && d.status === 'pago' && !['aluguel', 'pessoal', 'infraestrutura'].includes(d.categoria)).reduce((a, b) => a + b.valor, 0);
    const resultado = receitaBruta - custosVar - despesasFixas - despesasVar;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-card border rounded-3xl p-8 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5"><FileText className="h-24 w-24" /></div>
                <h3 className="text-xl font-bold mb-8 flex items-center gap-3">
                    <BarChart3 className="h-6 w-6 text-primary" /> Demonstrativo de Resultados (Mês Atual)
                </h3>
                
                <div className="space-y-4">
                    <DRERow label="(+) Receita Operacional Bruta" value={receitaBruta} bold={true} />
                    <DRERow label="(-) Deduções e Devoluções" value={0} color="text-rose-500" />
                    <div className="h-px bg-border my-2" />
                    <DRERow label="(=) RECEITA LÍQUIDA" value={receitaBruta} />
                    <DRERow label="(-) Custos de Mercadorias (CMV)" value={custosVar} color="text-rose-500" />
                    <div className="h-px bg-border my-2" />
                    <DRERow label="(=) LUCRO BRUTO" value={receitaBruta - custosVar} bold={true} />
                    <DRERow label="(-) Despesas Fixas" value={despesasFixas} color="text-rose-500" />
                    <DRERow label="(-) Despesas Variáveis" value={despesasVar} color="text-rose-500" />
                    <div className="h-px bg-border my-2" />
                    <div className="flex justify-between items-center pt-4 border-t-2 border-primary border-dashed">
                        <span className="font-black text-lg">LUCRO LÍQUIDO (Margem Final)</span>
                        <span className={cn("text-2xl font-black", resultado >= 0 ? "text-emerald-500" : "text-rose-500")}>
                            R$ {resultado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <div className="bg-primary p-8 rounded-3xl text-primary-foreground shadow-glow">
                    <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-2">Margem Líquida Real</p>
                    <p className="text-4xl font-black">{receitaBruta > 0 ? ((resultado/receitaBruta)*100).toFixed(1) : 0}%</p>
                    <div className="mt-6 flex gap-4">
                        <div className="flex-1 bg-white/10 p-4 rounded-2xl border border-white/10">
                            <p className="text-[10px] font-bold uppercase opacity-80">Receita</p>
                            <p className="text-sm font-bold">R$ {receitaBruta.toLocaleString()}</p>
                        </div>
                        <div className="flex-1 bg-white/10 p-4 rounded-2xl border border-white/10">
                            <p className="text-[10px] font-bold uppercase opacity-80">Custos totais</p>
                            <p className="text-sm font-bold">R$ {(custosVar+despesasFixas+despesasVar).toLocaleString()}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-card border rounded-3xl p-8 flex flex-col items-center justify-center text-center space-y-4">
                    <Activity className="h-10 w-10 text-primary animate-pulse" />
                    <h4 className="font-bold">Análise do Jarvis Finance</h4>
                    <p className="text-sm text-muted-foreground px-6">
                        Seu custo operacional ({((despesasFixas/receitaBruta)*100).toFixed(0)}%) está dentro da meta para o setor têxtil.
                        O saldo projetado indica saúde financeira para os próximos 30 dias.
                    </p>
                    <Button variant="outline" className="rounded-full gap-2">Ver Análise Completa</Button>
                </div>
            </div>
        </div>
    );
}

function DRERow({ label, value, bold, color }: any) {
    return (
        <div className="flex justify-between text-sm py-1">
            <span className={cn(bold ? "font-bold text-foreground" : "text-muted-foreground")}>{label}</span>
            <span className={cn("font-bold", color ? color : "text-foreground")}>
                R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
        </div>
    );
}

function AddTransactionDialog({ isOpen, onClose, onSuccess }: any) {
    const [tipo, setTipo] = useState<any>('saida');
    const [categoria, setCategoria] = useState<any>('fornecedor');
    const [valor, setValor] = useState(0);
    const [desc, setDesc] = useState("");
    const [venc, setVenc] = useState(new Date().toISOString().split('T')[0]);

    const handleSave = async () => {
        try {
            const { error } = await (supabase.from("lancamentos" as any).insert({
                tipo,
                categoria,
                valor,
                descricao: desc,
                data_vencimento: venc,
                status: 'pendente'
            }) as any);
            if (error) throw error;
            toast.success("Lançamento criado!");
            onSuccess();
            onClose();
        } catch (e) {
            toast.error("Erro ao salvar.");
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader><DialogTitle>Novo Lançamento Financeiro</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant={tipo === 'entrada' ? 'default' : 'outline'} onClick={() => setTipo('entrada')} className="gap-2"><ArrowUpRight className="h-4 w-4" /> Entrada</Button>
                        <Button variant={tipo === 'saida' ? 'destructive' : 'outline'} onClick={() => setTipo('saida')} className="gap-2"><ArrowDownRight className="h-4 w-4" /> Saída</Button>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase">Descrição</label>
                        <Input placeholder="Aluguel Março, Compra Tecido..." value={desc} onChange={e => setDesc(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase">Valor (R$)</label>
                            <Input type="number" value={valor} onChange={e => setValor(Number(e.target.value))} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase">Vencimento</label>
                            <Input type="date" value={venc} onChange={e => setVenc(e.target.value)} />
                        </div>
                    </div>
                </div>
                <DialogFooter><Button onClick={handleSave}>Confirmar Lançamento</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function CashClosingDialog({ isOpen, onClose, onSuccess, summary }: any) {
    const [entradas, setEntradas] = useState(summary.entradas);
    const [saidas, setSaidas] = useState(summary.saidas);

    const handleClose = async () => {
        try {
            const { error } = await (supabase.from("fechamentos_caixa" as any).insert({
                data: new Date().toISOString().split('T')[0],
                total_entradas: entradas,
                total_saidas: saidas,
                saldo_fechamento: entradas - saidas
            }) as any);
            if (error) throw error;
            toast.success("Caixa fechado com sucesso!");
            onSuccess();
            onClose();
        } catch (e) {
            toast.error("Caixa deste dia já foi fechado.");
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="text-center">
                <DialogHeader className="items-center">
                    <div className="bg-primary/10 p-4 rounded-full mb-4">
                        <Lock className="h-8 w-8 text-primary" />
                    </div>
                    <DialogTitle>Fechamento de Caixa Diário</DialogTitle>
                    <DialogDescription>Confirme os valores totais movimentados hoje para conciliação.</DialogDescription>
                </DialogHeader>
                <div className="py-6 space-y-4">
                    <div className="flex justify-between items-center text-sm">
                        <span className="font-bold flex items-center gap-2"><ArrowUpRight className="h-4 w-4 text-emerald-500" /> Total Entradas</span>
                        <span className="font-black text-emerald-600">R$ {entradas.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="font-bold flex items-center gap-2"><ArrowDownRight className="h-4 w-4 text-rose-500" /> Total Saídas</span>
                        <span className="font-black text-rose-600">R$ {saidas.toLocaleString()}</span>
                    </div>
                    <div className="h-px bg-border " />
                    <div className="flex justify-between items-center">
                        <span className="font-black">SALDO OPERACIONAL</span>
                        <span className="text-2xl font-black text-primary">R$ {(entradas - saidas).toLocaleString()}</span>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        <p className="text-[10px] text-amber-700 text-left">Certifique-se de que os valores físicos batem com os lançados antes de concluir o fechamento irrevogável.</p>
                    </div>
                </div>
                <DialogFooter className="sm:justify-center">
                    <Button className="w-full h-12 text-lg font-bold" onClick={handleClose}>Concluir Fechamento</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// Helpers
function generateProjData() {
    return [
        { name: "24/Mar", saldo: 12400 },
        { name: "26/Mar", saldo: 13500 },
        { name: "28/Mar", saldo: 12100 },
        { name: "30/Mar", saldo: 15400 },
        { name: "02/Abr", saldo: 18900 },
        { name: "04/Abr", saldo: 17200 },
        { name: "06/Abr", saldo: 22000 },
    ];
}

function generatePieData() {
    return [
        { name: "Pix", value: 6500 },
        { name: "Cartão", value: 3200 },
        { name: "Dinheiro", value: 1200 },
    ];
}
