import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  Search, 
  Filter, 
  Download, 
  Calendar, 
  User, 
  CreditCard, 
  Eye, 
  ShoppingBag,
  ArrowUpDown,
  MoreVertical,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX",
  credito: "Crédito",
  debito: "Débito",
  dinheiro: "Dinheiro",
  boleto: "Boleto",
  crediario: "Crediário",
};

const STATUS_STYLES: Record<string, string> = {
  confirmado: "bg-green-500/10 text-green-600 border-green-500/30",
  pendente: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  cancelado: "bg-red-500/10 text-red-600 border-red-500/30",
};

export default function Sales() {
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const fetchSales = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("sales_entries")
        .select(`
          *,
          cliente:clients(id, name, phone),
          vendedor:profiles(id, name),
          itens:sales_entries_itens(
            id,
            quantity,
            unit_price,
            sku:produto_skus(
              sku,
              cor,
              tamanho,
              produto:produtos(nome)
            )
          )
        `)
        .order("sold_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (paymentFilter !== "all") {
        query = query.eq("payment_method", paymentFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSales(data || []);
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao carregar vendas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [statusFilter, paymentFilter]);

  const filteredSales = sales.filter(s => 
    s.cliente?.name.toLowerCase().includes(search.toLowerCase()) ||
    s.id.toLowerCase().includes(search.toLowerCase()) ||
    s.vendedor?.name.toLowerCase().includes(search.toLowerCase())
  );

  const openDetails = (sale: any) => {
    setSelectedSale(sale);
    setDetailsOpen(true);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 bg-background min-h-screen animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-primary" /> Guia de Vendas
          </h1>
          <p className="text-muted-foreground">Histórico detalhado de transações e conferência</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => fetchSales()}>
            Atualizar
          </Button>
          <Button className="gap-2">
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-card border border-border p-4 rounded-xl shadow-sm">
        <div className="relative col-span-1 md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por cliente, vendedor ou ID..." 
            className="pl-9" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            <SelectItem value="confirmado">Confirmado</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Métodos</SelectItem>
            {Object.entries(PAYMENT_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sales Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[100px]">Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Método</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filteredSales.length > 0 ? (
                filteredSales.map((sale) => (
                  <TableRow key={sale.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => openDetails(sale)}>
                    <TableCell className="font-medium">
                      {new Date(sale.sold_at).toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit' })}
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(sale.sold_at).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-foreground">{sale.cliente?.name || "Consumidor Final"}</div>
                      <div className="text-xs text-muted-foreground">{sale.cliente?.phone || ""}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                          {sale.vendedor?.name?.charAt(0) || "V"}
                        </div>
                        <span className="text-sm">{sale.vendedor?.name || "Sistema"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal border-border">
                        {PAYMENT_LABELS[sale.payment_method] || sale.payment_method}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-black text-foreground">
                      R$ {sale.value?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={cn("text-[10px] uppercase font-bold", STATUS_STYLES[sale.status])}>
                        {sale.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openDetails(sale); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-20 text-muted-foreground">
                    <ShoppingBag className="h-12 w-12 mx-auto mb-4 opacity-10" />
                    <p>Nenhuma venda encontrada.</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Sale Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Detalhes da Venda
              <Badge variant="outline" className="text-[10px] font-mono">
                {selectedSale?.id.slice(0, 8)}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          
          {selectedSale && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-xl border border-border">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Cliente</p>
                  <p className="font-bold">{selectedSale.cliente?.name || "Consumidor Final"}</p>
                  <p className="text-xs text-muted-foreground">{selectedSale.cliente?.phone || ""}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Vendedor</p>
                  <p className="font-bold">{selectedSale.vendedor?.name || "Sistema"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Data/Hora</p>
                  <p className="font-medium text-sm">
                    {new Date(selectedSale.sold_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Pagamento</p>
                  <Badge className="mt-1">{PAYMENT_LABELS[selectedSale.payment_method] || selectedSale.payment_method}</Badge>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold flex items-center gap-2 mb-3 px-1">
                  <ShoppingBag className="h-4 w-4" /> Itens da Venda
                </h4>
                <div className="border rounded-xl overflow-hidden bg-card">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="h-9">Produto</TableHead>
                        <TableHead className="h-9 text-center">Qtd</TableHead>
                        <TableHead className="h-9 text-right">Preço</TableHead>
                        <TableHead className="h-9 text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedSale.itens?.length > 0 ? (
                        selectedSale.itens.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div className="font-medium text-xs">{item.sku?.produto?.nome}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {item.sku?.sku} · {item.sku?.cor} / {item.sku?.tamanho}
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-xs">{item.quantity}</TableCell>
                            <TableCell className="text-right text-xs">
                              R$ {item.unit_price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right font-bold text-xs">
                              R$ {(item.quantity * item.unit_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-4 text-xs text-muted-foreground">
                            Venda simplificada (sem itens detalhados)
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex justify-between items-center bg-primary/5 p-4 rounded-xl border border-primary/20">
                <span className="font-bold text-primary uppercase tracking-tighter">Total da Venda</span>
                <span className="text-2xl font-black text-primary">
                  R$ {selectedSale.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {selectedSale.notes && (
                <div className="bg-muted/20 p-3 rounded-lg border border-dashed border-border">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Observações</p>
                  <p className="text-sm">{selectedSale.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
