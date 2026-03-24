import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  History, 
  Search, 
  RefreshCw, 
  Ticket, 
  Package, 
  User, 
  FileText, 
  Plus, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Filter, 
  ArrowRightLeft,
  Calendar,
  Layers,
  SearchCode,
  Tag,
  Store,
  CreditCard,
  Barcode
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

export default function Exchanges() {
  const [exchanges, setExchanges] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpeningRequest, setIsOpeningRequest] = useState(false);
  const [search, setSearch] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: exchangesData } = await supabase
        .from("trocas")
        .select(`
          *,
          cliente:clients(name, phone),
          venda:sales_entries(id, payment_method, total),
          itens:troca_itens(
            sku_devolvido:produto_skus!troca_itens_sku_devolvido_id_fkey(cor, tamanho, sku, produto:produtos(nome)),
            sku_novo:produto_skus!troca_itens_sku_novo_id_fkey(cor, tamanho, sku, produto:produtos(nome)),
            quantidade,
            diferenca_valor
          )
        `)
        .order("data", { ascending: false });

      const { data: vouchersData } = await supabase
        .from("vales_troca")
        .select(`*, cliente:clients(name)`)
        .order("created_at", { ascending: false });

      setExchanges(exchangesData || []);
      setVouchers(vouchersData || []);
    } catch (e: any) {
      toast.error("Erro ao carregar dados de trocas.");
      console.error(e);
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
            <RefreshCw className="h-6 w-6 text-primary" /> Trocas & Devoluções
          </h1>
          <p className="text-muted-foreground">Gerencie o fluxo completo de logística reversa e créditos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={fetchData}>
            <History className="h-4 w-4" /> Atualizar
          </Button>
          <Button className="gap-2" onClick={() => setIsOpeningRequest(true)}>
            <Plus className="h-4 w-4" /> Nova Solicitação
          </Button>
        </div>
      </div>

      <Tabs defaultValue="exchanges" className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="exchanges" className="gap-2">
            <ArrowRightLeft className="h-4 w-4" /> Trocas / Devoluções
          </TabsTrigger>
          <TabsTrigger value="vouchers" className="gap-2">
            <Ticket className="h-4 w-4" /> Vales-Troca Ativos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="exchanges" className="mt-6 space-y-6">
          <div className="flex gap-4 items-center bg-card p-4 rounded-xl border border-border">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por cliente ou ID..." 
                className="pl-9" 
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4">
            {loading ? (
              <div className="p-10 flex justify-center"><RefreshCw className="animate-spin h-8 w-8 text-muted-foreground" /></div>
            ) : exchanges.length === 0 ? (
              <div className="p-10 text-center border-2 border-dashed rounded-3xl">
                <p className="text-muted-foreground">Nenhuma troca registrada ainda.</p>
              </div>
            ) : (
              exchanges.map((ex) => (
                <ExchangeCard key={ex.id} exchange={ex} onRefresh={fetchData} />
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="vouchers" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {vouchers.map(v => (
                    <VoucherCard key={v.id} voucher={v} />
                ))}
            </div>
        </TabsContent>
      </Tabs>

      {/* Opening Exchange Request Manager */}
      {isOpeningRequest && (
        <ExchangeRequestDialog 
          isOpen={isOpeningRequest} 
          onClose={() => setIsOpeningRequest(false)} 
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}

function ExchangeCard({ exchange, onRefresh }: { exchange: any, onRefresh: () => void }) {
  const statusColors: any = {
    pendente: "bg-amber-100 text-amber-700 border-amber-200",
    aprovada: "bg-emerald-100 text-emerald-700 border-emerald-200",
    recusada: "bg-rose-100 text-rose-700 border-rose-200",
    concluida: "bg-blue-100 text-blue-700 border-blue-200"
  };

  const handleUpdateStatus = async (status: string) => {
    try {
      const { error } = await supabase
        .from("trocas")
        .update({ status })
        .eq("id", exchange.id);
      
      if (error) throw error;
      toast.success(`Troca ${status}!`);
      onRefresh();
    } catch (e) {
      toast.error("Erro ao atualizar status.");
    }
  };

  return (
    <div className="bg-card border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all">
      <div className="p-5 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-lg text-primary">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold">SOL-{exchange.id.slice(0, 5).toUpperCase()}</span>
              <Badge className={cn("text-[10px] font-bold h-5", statusColors[exchange.status])}>
                {exchange.status.toUpperCase()}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{new Date(exchange.data).toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
            <div className="text-right">
                <span className="text-xs text-muted-foreground uppercase tracking-widest block font-bold">Cliente</span>
                <span className="font-bold">{exchange.cliente?.name}</span>
            </div>
            {exchange.status === 'pendente' && (
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-8 border-rose-200 text-rose-600 font-bold" onClick={() => handleUpdateStatus('recusada')}>RECUSAR</Button>
                    <Button size="sm" className="h-8 font-bold" onClick={() => handleUpdateStatus('aprovada')}>APROVAR</Button>
                </div>
            )}
        </div>
      </div>
      
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-8 bg-muted/30">
        <div className="space-y-4">
            <h4 className="text-xs font-black text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-3 w-3" /> DEVOLVIDO PELO CLIENTE
            </h4>
            {exchange.itens?.map((it: any, i: number) => (
                <div key={i} className="flex items-center gap-3 bg-card p-3 rounded-xl border border-rose-100 shadow-sm shadow-rose-100/30">
                    <div className="bg-rose-50 p-2 rounded-lg"><ArrowRightLeft className="h-4 w-4 text-rose-500 rotate-90" /></div>
                    <div className="flex-1">
                        <p className="text-sm font-bold">{it.sku_devolvido.produto.nome}</p>
                        <p className="text-xs text-muted-foreground">{it.sku_devolvido.cor} / {it.sku_devolvido.tamanho} (SKU: {it.sku_devolvido.sku})</p>
                    </div>
                    <Badge variant="secondary" className="font-black">MOTIVO: {exchange.motivo.toUpperCase()}</Badge>
                </div>
            ))}
        </div>

        <div className="space-y-4">
            <h4 className="text-xs font-black text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3" /> NOVO DESTINO
            </h4>
            {exchange.itens?.some((it: any) => it.sku_novo) ? (
                exchange.itens.filter((it: any) => it.sku_novo).map((it: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 bg-card p-3 rounded-xl border border-emerald-100 shadow-sm shadow-emerald-100/30">
                        <div className="bg-emerald-50 p-2 rounded-lg"><Plus className="h-4 w-4 text-emerald-500" /></div>
                        <div className="flex-1">
                            <p className="text-sm font-bold">{it.sku_novo.produto.nome}</p>
                            <p className="text-xs text-muted-foreground">{it.sku_novo.cor} / {it.sku_novo.tamanho}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase">Dif.</p>
                            <p className={cn("text-sm font-black", it.diferenca_valor > 0 ? "text-primary" : "text-amber-600")}>
                                R$ {it.diferenca_valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                    </div>
                ))
            ) : (
                <div className="flex items-center gap-3 bg-card p-6 rounded-xl border border-blue-100 border-dashed justify-center text-center">
                    <div>
                        <Ticket className="h-8 w-8 text-blue-300 mx-auto mb-2" />
                        <p className="text-sm font-bold text-blue-600">CLIENTE OPTOU POR VALE-TROCA</p>
                        <p className="text-xs text-muted-foreground">Crédito gerado automaticamente</p>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}

function VoucherCard({ voucher }: { voucher: any }) {
    const isExpired = new Date(voucher.validade) < new Date();
    const isUsed = !!voucher.usado_em;

    return (
        <div className={cn(
            "bg-card border rounded-2xl p-5 relative overflow-hidden transition-all",
            isUsed ? "opacity-60 bg-muted grayscale" : "hover:border-primary shadow-sm"
        )}>
            <div className="flex justify-between items-start mb-4">
                <div className="bg-blue-50 p-2 rounded-lg text-blue-500">
                    <Ticket className="h-5 w-5" />
                </div>
                <div className="text-right">
                    <p className="text-[10px] uppercase font-black text-muted-foreground">Valor do Voucher</p>
                    <p className="text-xl font-black text-primary">R$ {voucher.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
                        <User className="h-3 w-3" /> Beneficiário
                    </h4>
                    <p className="text-sm font-bold">{voucher.cliente?.name}</p>
                </div>

                <div className="bg-muted/50 p-3 rounded-xl border border-dashed flex justify-between items-center">
                    <div>
                        <p className="text-[10px] font-black text-muted-foreground uppercase">Código</p>
                        <p className="font-mono text-sm font-bold tracking-tighter">{voucher.codigo}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8"><Layers className="h-4 w-4" /></Button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-dashed">
                    <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] font-bold text-muted-foreground">EXPIRA EM {new Date(voucher.validade).toLocaleDateString()}</span>
                    </div>
                    {isUsed ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">USADO</Badge>
                    ) : isExpired ? (
                        <Badge variant="destructive">EXPIRADO</Badge>
                    ) : (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200">ATIVO</Badge>
                    )}
                </div>
            </div>
            
            {/* Decorações do Ticket */}
            <div className="absolute top-1/2 -left-2 -translate-y-1/2 w-4 h-4 rounded-full bg-background border" />
            <div className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-4 rounded-full bg-background border" />
        </div>
    );
}

function ExchangeRequestDialog({ isOpen, onClose, onSuccess }: any) {
  const [step, setStep] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [foundSale, setFoundSale] = useState<any>(null);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [motivo, setMotivo] = useState("");
  const [tipoTroca, setTipoTroca] = useState<"produto" | "vale">("produto");
  const [searching, setSearching] = useState(false);

  // For product exchange
  const [allSkus, setAllSkus] = useState<any[]>([]);
  const [newSku, setNewSku] = useState<string | null>(null);

  const searchSale = async () => {
    if (!searchQuery) return;
    setSearching(true);
    try {
      // Find sale by id or customer phone/name
      const { data, error } = await supabase
        .from("sales_entries")
        .select(`
            *,
            cliente:clients(id, name, phone),
            venda_itens:sales_entries_itens(
                quantity, 
                unit_price, 
                sku_id:produto_skus(id, sku, cor, tamanho, produto:produtos(nome))
            )
        `)
        .or(`id.eq.${searchQuery},customer_id.in.(select id from clients where phone ilike '%${searchQuery}%' or name ilike '%${searchQuery}%')`)
        .single();

      if (error) throw error;
      setFoundSale(data);
      setStep(2);
    } catch (e) {
      toast.error("Venda não encontrada ou erro na busca.");
    } finally {
      setSearching(false);
    }
  };

  const loadSkus = async () => {
      const { data } = await supabase.from("produto_skus").select("id, sku, cor, tamanho, preco, produto:produtos(nome)");
      setAllSkus(data || []);
  };

  useEffect(() => {
    if (step === 3 && tipoTroca === "produto") loadSkus();
  }, [step, tipoTroca]);

  const toggleItem = (item: any) => {
    setSelectedItems(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]);
  };

  const handleFinish = async () => {
    try {
      // 1. Create Exchange Record
      const { data: exchange, error: exError } = await supabase
        .from("trocas")
        .insert({
          venda_id: foundSale.id,
          cliente_id: foundSale.cliente.id,
          motivo,
          status: 'pendente'
        })
        .select()
        .single();

      if (exError) throw exError;

      // 2. Create Exchange Items
      const totalDevolvido = selectedItems.reduce((acc, it) => acc + (it.unit_price * it.quantity), 0);
      
      const itemsToInsert = selectedItems.map(it => {
          let diferenca = 0;
          let idNovo = null;
          
          if (tipoTroca === "produto") {
              const sku = allSkus.find(s => s.id === newSku);
              diferenca = sku.preco - it.unit_price;
              idNovo = newSku;
          }

          return {
              troca_id: exchange.id,
              sku_devolvido_id: it.sku_id.id,
              sku_novo_id: idNovo,
              quantidade: it.quantity,
              diferenca_valor: diferenca
          };
      });

      const { error: itemError } = await supabase.from("troca_itens").insert(itemsToInsert);
      if (itemError) throw itemError;

      // 3. If Voucher
      if (tipoTroca === "vale") {
          const { error: vError } = await supabase.from("vales_troca").insert({
              troca_id: exchange.id,
              cliente_id: foundSale.cliente.id,
              codigo: "VALE-" + Math.random().toString(36).substring(7).toUpperCase(),
              valor: totalDevolvido,
              validade: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
          });
          if (vError) throw vError;
      }

      toast.success("Solicitação de troca enviada para aprovação!");
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error("Erro ao finalizar: " + e.message);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nova Troca ou Devolução</DialogTitle>
          <DialogDescription>Siga o fluxo para registrar o retorno de produtos ao estoque.</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <label className="text-sm font-bold flex items-center gap-2">
                <SearchCode className="h-4 w-4" /> LOCALIZAR VENDA
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="CPF, Nome ou ID da Venda..." className="pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                <Button onClick={searchSale} disabled={searching}>
                    {searching ? "Buscando..." : <Search className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">Busque no histórico pela nota fiscal ou dados do cliente.</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 py-4 animate-slide-right">
            <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 mb-4">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-[10px] font-black uppercase text-primary">Venda Localizada</p>
                        <p className="text-sm font-bold">{foundSale.cliente?.name}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] h-5">ID: {foundSale.id.slice(0, 8)}</Badge>
                </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-bold uppercase text-muted-foreground">Selecione os itens para trocar</label>
              <div className="space-y-2 max-h-[30vh] overflow-y-auto">
                {foundSale.venda_itens?.map((it: any, i: number) => (
                  <div 
                    key={i} 
                    className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                        selectedItems.includes(it) ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/30"
                    )}
                    onClick={() => toggleItem(it)}
                  >
                    <div className={cn("w-5 h-5 rounded-md border flex items-center justify-center", selectedItems.includes(it) ? "bg-primary border-primary" : "bg-muted")}>
                        {selectedItems.includes(it) && <CheckCircle2 className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-bold">{it.sku_id.produto.nome}</p>
                        <p className="text-xs text-muted-foreground">{it.sku_id.cor} / {it.sku_id.tamanho} (x{it.quantity})</p>
                    </div>
                    <p className="font-bold text-sm">R$ {it.unit_price}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-bold">Motivo da Troca</label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger><SelectValue placeholder="Selecione o motivo..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tamanho">Tamanho Errado</SelectItem>
                  <SelectItem value="defeito">Defeito de Fabricação</SelectItem>
                  <SelectItem value="desistencia">Desistência / Arrependimento</SelectItem>
                  <SelectItem value="cor">Cor / Modelo não agradou</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
              <Button onClick={() => setStep(3)} disabled={selectedItems.length === 0 || !motivo}>Continuar</Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 py-4 animate-slide-right">
             <div className="space-y-4">
               <label className="text-sm font-bold uppercase text-muted-foreground tracking-widest text-center block">Qual o próximo passo?</label>
               <div className="grid grid-cols-2 gap-4">
                  <div 
                    className={cn(
                        "p-6 rounded-2xl border-2 text-center cursor-pointer transition-all space-y-3",
                        tipoTroca === "produto" ? "border-primary bg-primary/5 shadow-glow-sm" : "border-border hover:bg-muted"
                    )}
                    onClick={() => setTipoTroca("produto")}
                  >
                      <ArrowRightLeft className={cn("h-8 w-8 mx-auto", tipoTroca === "produto" ? "text-primary" : "text-muted-foreground")} />
                      <p className="text-sm font-bold">Trocar por Produto</p>
                  </div>
                  <div 
                    className={cn(
                        "p-6 rounded-2xl border-2 text-center cursor-pointer transition-all space-y-3",
                        tipoTroca === "vale" ? "border-primary bg-primary/5 shadow-glow-sm" : "border-border hover:bg-muted"
                    )}
                    onClick={() => setTipoTroca("vale")}
                  >
                        <Ticket className={cn("h-8 w-8 mx-auto", tipoTroca === "vale" ? "text-primary" : "text-muted-foreground")} />
                        <p className="text-sm font-bold">Gerar Vale-Troca</p>
                  </div>
               </div>
             </div>

             {tipoTroca === "produto" && (
                 <div className="space-y-3 animate-slide-up">
                    <label className="text-sm font-bold">Buscar Novo Item no Catálogo</label>
                    <Select value={newSku || ""} onValueChange={setNewSku}>
                        <SelectTrigger><SelectValue placeholder="Escolha a nova variante..." /></SelectTrigger>
                        <SelectContent>
                            {allSkus.map(s => (
                                <SelectItem key={s.id} value={s.id}>
                                    {s.produto.nome} - {s.cor} / {s.tamanho} (R$ {s.preco})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                 </div>
             )}

             {tipoTroca === "vale" && (
                 <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 text-center animate-pulse-subtle">
                     <p className="text-sm font-bold text-blue-600">Um Vale-Troca vitalício será gerado</p>
                     <p className="text-xs text-blue-500">Valor total: R$ {selectedItems.reduce((acc, it) => acc + (it.unit_price * it.quantity), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                 </div>
             )}

             <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>Voltar</Button>
                <Button onClick={handleFinish} disabled={tipoTroca === 'produto' && !newSku}>Finalizar Solicitação</Button>
             </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
