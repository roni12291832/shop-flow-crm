import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Star, Settings, Users, History, Gift, Trophy, Wallet,
  TrendingUp, Clock, Search, Plus, CheckCircle2, Smartphone,
  Target, Zap, Crown, Medal, Ticket, Award
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Loyalty() {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<any>(null);
  const [wallets, setWallets] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState({
    totalClientes: 0,
    clientesBronze: 0,
    clientesPrata: 0,
    clientesOuro: 0,
    totalPontosAtivos: 0,
    totalPontosResgatados: 0,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Config
      const { data: configData } = await supabase.from("fidelidade_config" as any).select("*").maybeSingle();
      setConfig(configData);

      // 2. Wallets with client info
      const { data: walletData } = await (supabase as any)
        .from("cliente_pontos")
        .select("*, cliente:clients(id, name, phone, avatar_url)")
        .order("pontos_total", { ascending: false });
      setWallets(walletData || []);

      // 3. Real stats
      const ws = walletData || [];
      setStats({
        totalClientes: ws.length,
        clientesBronze: ws.filter((w: any) => w.nivel_atual === "Bronze").length,
        clientesPrata:  ws.filter((w: any) => w.nivel_atual === "Prata").length,
        clientesOuro:   ws.filter((w: any) => w.nivel_atual === "Ouro").length,
        totalPontosAtivos: ws.reduce((s: number, w: any) => s + (w.pontos_total || 0), 0),
        totalPontosResgatados: 0, // será atualizado abaixo
      });

      // Pontos resgatados (tipo = 'resgate' na tabela pontos_historico)
      const { data: resgatados } = await (supabase as any)
        .from("pontos_historico")
        .select("pontos")
        .eq("tipo", "resgate");
      const totalResgatados = (resgatados || []).reduce((s: number, r: any) => s + (r.pontos || 0), 0);
      setStats(prev => ({ ...prev, totalPontosResgatados: totalResgatados }));
    } catch (e) {
      toast.error("Erro ao carregar módulo de fidelidade.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleUpdateConfig = async (newConfig: any) => {
    try {
      const { error } = await (supabase as any).from("fidelidade_config").update(newConfig).eq("id", config.id);
      if (error) throw error;
      toast.success("Configuração atualizada!");
      fetchData();
    } catch (e) {
      toast.error("Erro ao atualizar.");
    }
  };

  const pctOuro = stats.totalClientes > 0 ? Math.round((stats.clientesOuro / stats.totalClientes) * 100) : 0;

  return (
    <div className="p-4 md:p-8 space-y-6 bg-background min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star className="h-6 w-6 text-amber-500 fill-amber-500" /> Programa de Fidelidade
          </h1>
          <p className="text-muted-foreground">Retenha seus melhores clientes com gamificação e recompensas.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={fetchData}><History className="h-4 w-4" /> Atualizar</Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Clientes Bronze", value: stats.clientesBronze, icon: Medal, color: "text-orange-500", bg: "bg-orange-50" },
          { label: "Clientes Prata",  value: stats.clientesPrata,  icon: Award,  color: "text-slate-500", bg: "bg-slate-50" },
          { label: "Clientes Ouro",   value: stats.clientesOuro,   icon: Crown,  color: "text-amber-500", bg: "bg-amber-50" },
          { label: "Pontos Ativos",   value: stats.totalPontosAtivos.toLocaleString("pt-BR"), icon: Zap, color: "text-primary", bg: "bg-primary/5" },
        ].map(s => (
          <div key={s.label} className="bg-card border rounded-2xl p-4 flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", s.bg)}>
              <s.icon className={cn("h-5 w-5", s.color)} />
            </div>
            <div>
              <p className="text-xl font-bold leading-tight">{s.value}</p>
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="wallets" className="w-full">
            <TabsList className="bg-muted p-1 rounded-xl">
              <TabsTrigger value="wallets" className="gap-2"><Users className="h-4 w-4" /> Carteiras</TabsTrigger>
              <TabsTrigger value="ranking" className="gap-2"><Trophy className="h-4 w-4" /> Ranking VIP</TabsTrigger>
              <TabsTrigger value="config" className="gap-2"><Settings className="h-4 w-4" /> Regras</TabsTrigger>
            </TabsList>

            <TabsContent value="wallets" className="mt-6 space-y-4">
              <div className="flex items-center gap-4 bg-card p-4 rounded-xl border">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cliente..."
                    className="pl-9"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <Badge variant="outline" className="shrink-0">{wallets.length} clientes</Badge>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />
                  ))}
                </div>
              ) : wallets.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Star className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Nenhum cliente com pontos ainda.</p>
                  <p className="text-xs mt-1">Os pontos são creditados automaticamente a cada venda confirmada.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {wallets
                    .filter(w => w.cliente?.name?.toLowerCase().includes(search.toLowerCase()))
                    .map(wallet => <WalletCard key={wallet.id} wallet={wallet} />)
                  }
                </div>
              )}
            </TabsContent>

            <TabsContent value="ranking" className="mt-6">
              <div className="bg-card border rounded-3xl overflow-hidden shadow-xl">
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-8 text-white flex justify-between items-center">
                  <div>
                    <h3 className="text-xl font-black flex items-center gap-2 uppercase tracking-tighter">
                      <Medal className="h-6 w-6" /> Top Clientes Fiéis
                    </h3>
                    <p className="text-xs opacity-80 font-bold uppercase tracking-widest mt-1">Acúmulo de pontos ShopFlow</p>
                  </div>
                  <Crown className="h-10 w-10 opacity-20 rotate-12" />
                </div>
                <div className="p-4 space-y-2">
                  {wallets.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground text-sm">Nenhum cliente no ranking ainda.</div>
                  ) : wallets.slice(0, 10).map((w, index) => (
                    <div key={w.id} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-muted/50 transition-all border border-transparent hover:border-border">
                      <span className={cn(
                        "text-lg font-black w-8 h-8 flex items-center justify-center rounded-full shrink-0",
                        index === 0 ? "bg-amber-100 text-amber-600" :
                        index === 1 ? "bg-slate-100 text-slate-600" :
                        index === 2 ? "bg-orange-100 text-orange-600" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {index + 1}
                      </span>
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary shrink-0">
                        {w.cliente?.name?.[0] || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">{w.cliente?.name || "—"}</p>
                        <Badge variant="outline" className="text-[10px] h-4 font-black">{w.nivel_atual}</Badge>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-black text-primary">{w.pontos_total} PTS</p>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Saldo</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="config" className="mt-6">
              <ConfigLoyalty config={config} onSave={handleUpdateConfig} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          {/* Real stats card */}
          <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-8 rounded-3xl text-white shadow-lg relative overflow-hidden group">
            <Crown className="absolute -bottom-4 -right-4 h-32 w-32 opacity-10 group-hover:rotate-12 transition-all duration-500" />
            <div className="relative z-10">
              <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-2">Clientes VIP (Ouro)</p>
              <h3 className="text-3xl font-black mb-1">{stats.clientesOuro}</h3>
              <p className="text-sm opacity-80 mb-6">de {stats.totalClientes} total ({pctOuro}% são Ouro)</p>

              <div className="w-full bg-white/20 rounded-full h-2 mb-6">
                <div
                  className="bg-white rounded-full h-2 transition-all duration-700"
                  style={{ width: `${pctOuro}%` }}
                />
              </div>

              <div className="mt-4 flex gap-3">
                <div className="flex-1 bg-white/10 p-3 rounded-2xl border border-white/10 text-center backdrop-blur-sm">
                  <p className="text-xl font-black">{stats.totalPontosAtivos.toLocaleString("pt-BR")}</p>
                  <p className="text-[10px] uppercase font-bold opacity-80">Pts Ativos</p>
                </div>
                <div className="flex-1 bg-white/10 p-3 rounded-2xl border border-white/10 text-center backdrop-blur-sm">
                  <p className="text-xl font-black">{stats.totalPontosResgatados.toLocaleString("pt-BR")}</p>
                  <p className="text-[10px] uppercase font-bold opacity-80">Pts Resgatados</p>
                </div>
              </div>
            </div>
          </div>

          {/* Breakdown by tier */}
          <div className="bg-card border rounded-3xl p-6 shadow-sm">
            <h3 className="text-sm font-bold mb-4 uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" /> Distribuição por Nível
            </h3>
            <div className="space-y-4">
              {[
                { label: "Ouro",   count: stats.clientesOuro,  color: "bg-amber-400", desc: "1.500+ pts" },
                { label: "Prata",  count: stats.clientesPrata,  color: "bg-slate-400", desc: "500–1.499 pts" },
                { label: "Bronze", count: stats.clientesBronze, color: "bg-orange-300", desc: "0–499 pts" },
              ].map(tier => (
                <div key={tier.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold">{tier.label} <span className="text-muted-foreground font-normal">({tier.desc})</span></span>
                    <span className="text-muted-foreground">{tier.count} clientes</span>
                  </div>
                  <Progress
                    value={stats.totalClientes > 0 ? (tier.count / stats.totalClientes) * 100 : 0}
                    className="h-2"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WalletCard({ wallet }: { wallet: any }) {
  const tierStyles: any = {
    Bronze: { border: "border-orange-200", bg: "bg-orange-50/30", badge: "border-orange-300 text-orange-700 bg-orange-50" },
    Prata:  { border: "border-slate-300",  bg: "bg-slate-50/30",  badge: "border-slate-300  text-slate-700  bg-slate-50" },
    Ouro:   { border: "border-amber-400",  bg: "bg-amber-50/50",  badge: "border-amber-400  text-amber-700  bg-amber-50" },
  };
  const style = tierStyles[wallet.nivel_atual] || tierStyles.Bronze;

  return (
    <div className={cn("p-5 rounded-2xl border transition-all hover:shadow-md group relative overflow-hidden", style.border, style.bg)}>
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white border flex items-center justify-center font-bold text-lg group-hover:scale-110 transition-transform shadow-sm">
            {wallet.cliente?.name?.[0] || "?"}
          </div>
          <div>
            <p className="font-bold text-foreground">{wallet.cliente?.name || "—"}</p>
            <p className="text-xs text-muted-foreground">{wallet.cliente?.phone || ""}</p>
          </div>
        </div>
        <Badge className={cn("font-black text-[10px] uppercase border", style.badge)}>
          {wallet.nivel_atual}
        </Badge>
      </div>

      <div className="flex items-end justify-between relative z-10">
        <div>
          <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Saldo de Pontos</p>
          <p className="text-2xl font-black text-foreground">
            {wallet.pontos_total} <span className="text-sm font-bold opacity-50">PTS</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Última compra</p>
          <p className="text-xs font-semibold text-muted-foreground">
            {wallet.ultima_compra ? new Date(wallet.ultima_compra).toLocaleDateString("pt-BR") : "—"}
          </p>
        </div>
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
          <div className="bg-muted/50 p-6 rounded-2xl border border-dashed text-center">
            <p className="text-sm font-medium text-muted-foreground mb-2">A cada <span className="font-black text-foreground">R$ 1,00</span> gasto, o cliente ganha:</p>
            <span className="text-5xl font-black text-primary">1 PONTO</span>
            <p className="text-xs text-muted-foreground mt-3">Creditado automaticamente via trigger SQL</p>
          </div>
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl dark:bg-emerald-950/20 dark:border-emerald-900">
            <Gift className="h-4 w-4 text-emerald-500" />
            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">Double Points para aniversariantes!</p>
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
                <label className="text-xs font-bold uppercase text-muted-foreground">Pontos para 1 Desconto</label>
                <span className="font-black text-primary">{ptsDesconto} Pts</span>
              </div>
              <Slider defaultValue={[ptsDesconto]} max={500} step={50} onValueChange={(v) => setPtsDesconto(v[0])} />
            </div>
            <div className="space-y-4">
              <div className="flex justify-between">
                <label className="text-xs font-bold uppercase text-muted-foreground">Valor do Desconto</label>
                <span className="font-black text-primary">R$ {valDesconto}</span>
              </div>
              <Slider defaultValue={[valDesconto]} max={50} step={5} onValueChange={(v) => setValDesconto(v[0])} />
            </div>
            <div className="space-y-4">
              <div className="flex justify-between">
                <label className="text-xs font-bold uppercase text-muted-foreground">Validade dos Pontos</label>
                <span className="font-black text-primary">{validade} dias</span>
              </div>
              <Slider defaultValue={[validade]} min={30} max={365} step={30} onValueChange={(v) => setValidade(v[0])} />
            </div>
          </div>
        </div>
      </div>

      <div className="p-8 bg-muted/40 rounded-3xl border border-dashed flex flex-col md:flex-row items-center gap-6">
        <div className="bg-primary p-4 rounded-full text-primary-foreground">
          <Smartphone className="h-8 w-8" />
        </div>
        <div className="flex-1 space-y-1">
          <h4 className="font-bold flex items-center gap-2">WhatsApp Marketing Automatizado <Badge className="bg-emerald-500">ATIVO</Badge></h4>
          <p className="text-sm text-muted-foreground">O sistema notifica o cliente via WhatsApp assim que os pontos são creditados.</p>
        </div>
        <Button onClick={() => onSave({ pontos_por_desconto: ptsDesconto, valor_desconto: valDesconto, validade_dias: validade })}>
          Salvar Alterações
        </Button>
      </div>
    </div>
  );
}
