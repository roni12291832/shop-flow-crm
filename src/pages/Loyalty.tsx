import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  Star, 
  Settings, 
  Users, 
  History, 
  Gift, 
  Trophy, 
  Wallet, 
  TrendingUp, 
  Calendar, 
  Clock, 
  Search, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Smartphone, 
  MessageSquare, 
  Target, 
  Zap, 
  Crown, 
  Medal, 
  ArrowUpRight, 
  ArrowDownRight,
  Filter,
  Ticket,
  Percent
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
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Loyalty() {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<any>(null);
  const [wallets, setWallets] = useState<any[]>([]);
  const [ranking, setRanking] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Get Config
      const { data: configData } = await supabase.from("fidelidade_config").select("*").single();
      setConfig(configData);

      // 2. Get Wallets
      const { data: walletData } = await supabase
        .from("cliente_pontos")
        .select(`*, cliente:clients(id, name, phone, avatar_url)`)
        .order("pontos_total", { ascending: false });
      
      setWallets(walletData || []);
      setRanking(walletData?.slice(0, 5) || []);
    } catch (e) {
      toast.error("Erro ao carregar módulo de fidelidade.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdateConfig = async (newConfig: any) => {
      try {
          const { error } = await supabase.from("fidelidade_config").update(newConfig).eq("id", config.id);
          if (error) throw error;
          toast.success("Configuração atualizada!");
          fetchData();
      } catch (e) {
          toast.error("Erro ao atualizar.");
      }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 bg-background min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star className="h-6 w-6 text-amber-500 fill-amber-500" /> Programa de Fidelidade
          </h1>
          <p className="text-muted-foreground">Retenha seus melhores clientes com gamificação e recompensas.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={fetchData}><History className="h-4 w-4" /> Atualizar</Button>
          <Button className="gap-2 group"><Gift className="h-4 w-4 group-hover:scale-110 transition-transform" /> Resgatar Pontos</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="wallets" className="w-full">
            <TabsList className="bg-muted p-1 rounded-xl">
              <TabsTrigger value="wallets" className="gap-2"><Users className="h-4 w-4" /> Carteiras</TabsTrigger>
              <TabsTrigger value="ranking" className="gap-2"><Trophy className="h-4 w-4" /> Ranking VIP</TabsTrigger>
              <TabsTrigger value="config" className="gap-2"><Settings className="h-4 w-4" /> Regras</TabsTrigger>
            </TabsList>

            <TabsContent value="wallets" className="mt-6 space-y-6">
                <div className="flex items-center gap-4 bg-card p-4 rounded-xl border">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Buscar cliente por nome ou CPF..." 
                            className="pl-9" 
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {wallets.filter(w => w.cliente?.name.toLowerCase().includes(search.toLowerCase())).map(wallet => (
                        <WalletCard key={wallet.id} wallet={wallet} />
                    ))}
                </div>
            </TabsContent>

            <TabsContent value="ranking" className="mt-6">
                <div className="bg-card border rounded-3xl overflow-hidden shadow-xl">
                    <div className="bg-primary p-8 text-primary-foreground flex justify-between items-center bg-gradient-to-r from-primary to-primary/80">
                        <div>
                            <h3 className="text-xl font-black flex items-center gap-2 uppercase tracking-tighter">
                                <Medal className="h-6 w-6" /> Top Clientes Fiéis
                            </h3>
                            <p className="text-xs opacity-80 font-bold uppercase tracking-widest mt-1">Acúmulo de pontos ShopFlow</p>
                        </div>
                        <Crown className="h-10 w-10 opacity-20 rotate-12" />
                    </div>
                    <div className="p-4 space-y-2">
                        {wallets.slice(0, 10).map((w, index) => (
                            <div key={w.id} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-muted/50 transition-all border border-transparent hover:border-border">
                                <span className={cn(
                                    "text-lg font-black w-8 h-8 flex items-center justify-center rounded-full",
                                    index === 0 ? "bg-amber-100 text-amber-600" : "bg-muted text-muted-foreground"
                                )}>
                                    {index + 1}
                                </span>
                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                                    {w.cliente.name[0]}
                                </div>
                                <div className="flex-1">
                                    <p className="font-bold">{w.cliente.name}</p>
                                    <Badge variant="outline" className="text-[10px] h-4 font-black">{w.nivel_atual}</Badge>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-black text-primary">{w.pontos_total} PTS</p>
                                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Saldo Disponível</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="config" className="mt-6">
                <ConfigLoyalty 
                    config={config} 
                    onSave={handleUpdateConfig} 
                />
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-8 rounded-3xl text-white shadow-glow relative overflow-hidden group">
                <Crown className="absolute -bottom-4 -right-4 h-32 w-32 opacity-10 group-hover:rotate-12 transition-all duration-500" />
                <div className="relative z-10">
                    <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-2">Meta do Mês (Programa)</p>
                    <h3 className="text-2xl font-black mb-6">Novos Clientes VIP</h3>
                    
                    <div className="space-y-4">
                        <div className="flex justify-between text-xs font-bold">
                            <span>24/40 Clientes no Ouro</span>
                            <span>60%</span>
                        </div>
                        <Progress value={60} className="h-3 bg-white/20 border border-white/10 shadow-inner rounded-full" />
                    </div>
                    
                    <div className="mt-8 flex gap-3">
                        <div className="flex-1 bg-white/10 p-3 rounded-2xl border border-white/10 text-center backdrop-blur-sm">
                            <p className="text-xl font-black">1.2k</p>
                            <p className="text-[10px] uppercase font-bold opacity-80">Pts Resgatados</p>
                        </div>
                        <div className="flex-1 bg-white/10 p-3 rounded-2xl border border-white/10 text-center backdrop-blur-sm">
                            <p className="text-xl font-black">R$ 450</p>
                            <p className="text-[10px] uppercase font-bold opacity-80">Em Descontos</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-card border rounded-3xl p-6 shadow-sm">
                 <h3 className="text-sm font-bold mb-4 uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Target className="h-4 w-4" /> Resgates Pendentes (Loja)
                 </h3>
                 <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                        <div className="bg-blue-50 p-2 rounded-lg text-blue-500"><Smartphone className="h-4 w-4" /></div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">Marcos Silveira</p>
                            <p className="text-[10px] text-muted-foreground uppercase">Solicitou cupom via WhatsApp</p>
                        </div>
                        <Button size="sm" className="h-7 text-[10px] font-bold">LIBERAR</Button>
                    </div>
                 </div>
            </div>
        </div>
      </div>
    </div>
  );
}

function WalletCard({ wallet }: { wallet: any }) {
    const tierColors: any = {
        Bronze: "border-orange-200 bg-orange-50/30 text-orange-700",
        Prata: "border-slate-300 bg-slate-50/30 text-slate-700",
        Ouro: "border-amber-400 bg-amber-50/50 text-amber-700 shadow-amber-100/30"
    };

    return (
        <div className={cn(
            "p-5 rounded-2xl border transition-all hover:shadow-md group relative overflow-hidden",
            tierColors[wallet.nivel_atual]
        )}>
            <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-white border flex items-center justify-center font-bold text-lg group-hover:scale-110 transition-transform shadow-sm">
                        {wallet.cliente.name[0]}
                    </div>
                    <div>
                        <p className="font-bold text-foreground">{wallet.cliente.name}</p>
                        <p className="text-xs text-muted-foreground">{wallet.cliente.phone}</p>
                    </div>
                </div>
                <Badge className={cn("font-black text-[10px] uppercase", tierColors[wallet.nivel_atual])}>
                    {wallet.nivel_atual}
                </Badge>
            </div>

            <div className="flex items-end justify-between relative z-10">
                <div>
                   <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Saldo de Pontos</p>
                   <p className="text-2xl font-black text-foreground">{wallet.pontos_total} <span className="text-sm font-bold opacity-50">PTS</span></p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/50"><TrendingUp className="h-4 w-4" /></Button>
            </div>
            
            <div className="absolute top-0 right-0 p-2 opacity-5 scale-150 rotate-12 group-hover:rotate-0 transition-transform duration-700">
                <Medal className="h-32 w-32" />
            </div>
        </div>
    );
}

function ConfigLoyalty({ config, onSave }: any) {
    const [ptsDesconto, setPtsDesconto] = useState(config?.pontos_por_desconto || 100);
    const [valDesconto, setValDesconto] = useState(config?.valor_desconto || 5);
    const [validade, setValidade] = useState(config?.validade_dias || 180);

    return (
        <div className="bg-card border rounded-3xl p-8 space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2.5 rounded-xl text-primary"><Zap className="h-5 w-5" /></div>
                        <h4 className="font-black text-lg uppercase tracking-tighter">Regras de Ganho</h4>
                    </div>
                    <div className="space-y-4">
                        <div className="bg-muted/50 p-6 rounded-2xl border border-dashed text-center">
                            <p className="text-sm font-medium text-muted-foreground mb-4">A cada <span className="font-black text-foreground">R$ 1,00</span> gasto, o cliente ganha:</p>
                            <span className="text-5xl font-black text-primary">1 PONTO</span>
                        </div>
                        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                            <Gift className="h-4 w-4 text-emerald-500" />
                            <p className="text-[10px] font-bold text-emerald-700 uppercase">Double Points ativado para aniversariantes!</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2.5 rounded-xl text-primary"><Ticket className="h-5 w-5" /></div>
                        <h4 className="font-black text-lg uppercase tracking-tighter">Regras de Resgate</h4>
                    </div>
                    <div className="space-y-8">
                        <div className="space-y-4">
                            <div className="flex justify-between">
                                <label className="text-xs font-bold uppercase text-muted-foreground">Pontos por Desconto</label>
                                <span className="font-black text-primary">{ptsDesconto} Pts</span>
                            </div>
                            <Slider 
                                defaultValue={[ptsDesconto]} 
                                max={500} 
                                step={50} 
                                className="z-10" 
                                onValueChange={(v) => setPtsDesconto(v[0])}
                            />
                        </div>
                        <div className="space-y-4">
                            <div className="flex justify-between">
                                <label className="text-xs font-bold uppercase text-muted-foreground">Valor do Desconto (R$)</label>
                                <span className="font-black text-primary">R$ {valDesconto}</span>
                            </div>
                            <Slider 
                                defaultValue={[valDesconto]} 
                                max={50} 
                                step={5} 
                                onValueChange={(v) => setValDesconto(v[0])}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-8 bg-muted/40 rounded-3xl border border-dashed flex flex-col md:flex-row items-center gap-6">
                 <div className="bg-primary p-4 rounded-full text-primary-foreground shadow-glow"><Smartphone className="h-8 w-8" /></div>
                 <div className="flex-1 space-y-1">
                     <h4 className="font-bold flex items-center gap-2">WhatsApp Marketing Automatizado <Badge className="bg-emerald-500">ATIVO</Badge></h4>
                     <p className="text-sm text-muted-foreground">O sistema enviará uma mensagem assim que os pontos forem creditados. Você pode editar o template do Jarvis para falar sobre o programa.</p>
                 </div>
                 <Button onClick={() => onSave({ pontos_por_desconto: ptsDesconto, valor_desconto: valDesconto, validade_dias: validade })}>
                     Salvar Alterações
                 </Button>
            </div>
        </div>
    );
}
