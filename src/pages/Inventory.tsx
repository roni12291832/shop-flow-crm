import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Package, Plus, Search, Edit, Trash2, ArrowDownCircle, ArrowUpCircle,
  AlertTriangle, BarChart3, DollarSign, Boxes, Archive,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  cost_price: number;
  sell_price: number;
  current_stock: number;
  min_stock: number;
  unit: string;
  image_url: string | null;
  active: boolean;
  created_at: string;
}

interface Movement {
  id: string;
  product_id: string;
  type: "entrada" | "saida" | "ajuste";
  quantity: number;
  unit_cost: number;
  reference_type: string | null;
  notes: string | null;
  user_id: string;
  created_at: string;
}

const CATEGORIES = ["Geral", "Eletrônicos", "Roupas", "Acessórios", "Calçados", "Beleza", "Alimentos", "Outros"];

export default function Inventory() {
  const {  user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "low" | "active" | "inactive">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [movementProduct, setMovementProduct] = useState<Product | null>(null);
  const [movementHistory, setMovementHistory] = useState<Movement[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "", sku: "", description: "", category: "Geral",
    cost_price: "", sell_price: "", current_stock: "0", min_stock: "5", unit: "un",
  });
  const [mvForm, setMvForm] = useState({
    type: "entrada" as "entrada" | "saida" | "ajuste",
    quantity: "", unit_cost: "", notes: "",
  });

  const fetchProducts = async () => {
        const { data } = await supabase
      .from("products")
      .select("*")
      
      .order("name");
    setProducts((data as Product[]) || []);
  };

  useEffect(() => { fetchProducts(); }, []);

  const filtered = products.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
        !(p.sku || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (statusFilter === "low" && p.current_stock > p.min_stock) return false;
    if (statusFilter === "active" && !p.active) return false;
    if (statusFilter === "inactive" && p.active) return false;
    return true;
  });

  const totalProducts = products.length;
  const totalValue = products.reduce((s, p) => s + (p.sell_price * p.current_stock), 0);
  const lowStock = products.filter(p => p.active && p.current_stock <= p.min_stock).length;
  const outOfStock = products.filter(p => p.active && p.current_stock === 0).length;

  const openNew = () => {
    setEditProduct(null);
    setForm({ name: "", sku: "", description: "", category: "Geral", cost_price: "", sell_price: "", current_stock: "0", min_stock: "5", unit: "un" });
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditProduct(p);
    setForm({
      name: p.name, sku: p.sku || "", description: p.description || "",
      category: p.category || "Geral", cost_price: String(p.cost_price),
      sell_price: String(p.sell_price), current_stock: String(p.current_stock),
      min_stock: String(p.min_stock), unit: p.unit,
    });
    setDialogOpen(true);
  };

  const handleSaveProduct = async () => {
    if (!form.name) return;
    setSaving(true);
    const payload: any = {
            name: form.name,
      sku: form.sku || null,
      description: form.description || null,
      category: form.category,
      cost_price: parseFloat(form.cost_price) || 0,
      sell_price: parseFloat(form.sell_price) || 0,
      min_stock: parseInt(form.min_stock) || 5,
      unit: form.unit || "un",
    };

    if (editProduct) {
      const { error } = await supabase.from("products").update(payload).eq("id", editProduct.id);
      if (error) { toast.error("Erro ao atualizar"); setSaving(false); return; }
      toast.success("Produto atualizado!");
    } else {
      payload.current_stock = parseInt(form.current_stock) || 0;
      const { error } = await supabase.from("products").insert(payload);
      if (error) { toast.error("Erro ao cadastrar"); setSaving(false); return; }
      toast.success("Produto cadastrado!");
    }
    setSaving(false);
    setDialogOpen(false);
    fetchProducts();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este produto?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Produto excluído!"); fetchProducts(); }
  };

  const toggleActive = async (p: Product) => {
    await supabase.from("products").update({ active: !p.active }).eq("id", p.id);
    fetchProducts();
  };

  const openMovement = (p: Product) => {
    setMovementProduct(p);
    setMvForm({ type: "entrada", quantity: "", unit_cost: "", notes: "" });
    setMovementOpen(true);
  };

  const handleMovement = async () => {
    if (!movementProduct || !mvForm.quantity || !user) return;
    setSaving(true);
    const qty = parseInt(mvForm.quantity) || 0;
    if (qty <= 0 && mvForm.type !== "ajuste") { toast.error("Quantidade inválida"); setSaving(false); return; }

    if (mvForm.type === "saida" && qty > movementProduct.current_stock) {
      toast.error("Estoque insuficiente!"); setSaving(false); return;
    }

    const { error } = await supabase.from("inventory_movements").insert({
            product_id: movementProduct.id,
      type: mvForm.type as any,
      quantity: qty,
      unit_cost: parseFloat(mvForm.unit_cost) || 0,
      reference_type: "ajuste_manual",
      notes: mvForm.notes || null,
      user_id: user.id,
    });

    setSaving(false);
    if (error) { toast.error("Erro ao registrar movimentação"); return; }
    toast.success("Movimentação registrada!");
    setMovementOpen(false);
    fetchProducts();
  };

  const openHistory = async (p: Product) => {
    setMovementProduct(p);
    const { data } = await supabase
      .from("inventory_movements")
      .select("*")
      .eq("product_id", p.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setMovementHistory((data as Movement[]) || []);
    setHistoryOpen(true);
  };

  const MOVEMENT_LABELS: Record<string, string> = {
    entrada: "Entrada", saida: "Saída", ajuste: "Ajuste",
  };
  const MOVEMENT_COLORS: Record<string, string> = {
    entrada: "text-green-500", saida: "text-red-500", ajuste: "text-yellow-500",
  };

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))] as string[];

  return (
    <div className="p-4 md:p-7 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> Controle de Estoque
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gerencie produtos e movimentações</p>
        </div>
        <Button onClick={openNew} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo Produto
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Produtos", value: totalProducts, icon: Boxes, color: "hsl(var(--chart-1))" },
          { label: "Valor em Estoque", value: `R$ ${totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "hsl(var(--chart-2))" },
          { label: "Estoque Baixo", value: lowStock, icon: AlertTriangle, color: "hsl(var(--chart-3))" },
          { label: "Sem Estoque", value: outOfStock, icon: Archive, color: "hsl(var(--destructive))" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">{s.label}</p>
              <p className="text-xl font-bold text-foreground mt-1">{s.value}</p>
            </div>
            <s.icon className="h-8 w-8 opacity-30" style={{ color: s.color }} />
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou SKU..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-1">
          {([
            { key: "all", label: "Todos" },
            { key: "low", label: "Estoque Baixo" },
            { key: "active", label: "Ativos" },
            { key: "inactive", label: "Inativos" },
          ] as const).map(f => (
            <button key={f.key} onClick={() => setStatusFilter(f.key)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                statusFilter === f.key ? "bg-primary/20 text-primary border-primary/40" : "bg-card text-muted-foreground border-border hover:bg-secondary"
              )}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Products table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-4 py-3 text-left text-muted-foreground font-medium">Produto</th>
                <th className="px-4 py-3 text-left text-muted-foreground font-medium hidden sm:table-cell">SKU</th>
                <th className="px-4 py-3 text-left text-muted-foreground font-medium hidden md:table-cell">Categoria</th>
                <th className="px-4 py-3 text-right text-muted-foreground font-medium">Custo</th>
                <th className="px-4 py-3 text-right text-muted-foreground font-medium">Venda</th>
                <th className="px-4 py-3 text-center text-muted-foreground font-medium">Estoque</th>
                <th className="px-4 py-3 text-center text-muted-foreground font-medium">Status</th>
                <th className="px-4 py-3 text-right text-muted-foreground font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>Nenhum produto encontrado</p>
                </td></tr>
              ) : filtered.map(p => {
                const isLow = p.active && p.current_stock <= p.min_stock;
                const isOut = p.active && p.current_stock === 0;
                return (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{p.name}</div>
                      {p.description && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{p.description}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell font-mono text-xs">{p.sku || "—"}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {p.category && <Badge variant="outline" className="text-xs">{p.category}</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">R$ {p.cost_price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">R$ {p.sell_price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("font-bold", isOut ? "text-destructive" : isLow ? "text-yellow-500" : "text-foreground")}>
                        {p.current_stock}
                      </span>
                      <span className="text-muted-foreground text-xs ml-0.5">/{p.min_stock}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {!p.active ? (
                        <Badge variant="outline" className="text-muted-foreground border-border text-xs">Inativo</Badge>
                      ) : isOut ? (
                        <Badge className="bg-destructive/10 text-destructive border border-destructive/30 text-xs">Esgotado</Badge>
                      ) : isLow ? (
                        <Badge className="bg-yellow-500/10 text-yellow-600 border border-yellow-500/30 text-xs">Baixo</Badge>
                      ) : (
                        <Badge className="bg-green-500/10 text-green-600 border border-green-500/30 text-xs">OK</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openMovement(p)} title="Movimentar">
                          <ArrowDownCircle className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openHistory(p)} title="Histórico">
                          <BarChart3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)} title="Editar">
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(p.id)} title="Excluir">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editProduct ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2"><Label>Nome *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-2"><Label>SKU</Label><Input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="Ex: PROD-001" /></div>
              <div className="space-y-2"><Label>Unidade</Label><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="un, kg, m..." /></div>
            </div>
            <div className="space-y-2"><Label>Descrição</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Preço de Custo</Label><Input type="number" step="0.01" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })} /></div>
              <div className="space-y-2"><Label>Preço de Venda</Label><Input type="number" step="0.01" value={form.sell_price} onChange={e => setForm({ ...form, sell_price: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {!editProduct && (
                <div className="space-y-2"><Label>Estoque Inicial</Label><Input type="number" value={form.current_stock} onChange={e => setForm({ ...form, current_stock: e.target.value })} /></div>
              )}
              <div className="space-y-2"><Label>Estoque Mínimo</Label><Input type="number" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: e.target.value })} /></div>
            </div>
            <Button onClick={handleSaveProduct} disabled={saving || !form.name} className="w-full">
              {saving ? "Salvando..." : editProduct ? "Atualizar" : "Cadastrar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Movement Dialog */}
      <Dialog open={movementOpen} onOpenChange={setMovementOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Movimentar Estoque</DialogTitle>
          </DialogHeader>
          {movementProduct && (
            <div className="space-y-4 pt-2">
              <div className="bg-secondary rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-foreground">{movementProduct.name}</p>
                <p className="text-xs text-muted-foreground">Estoque atual: <span className="font-bold">{movementProduct.current_stock} {movementProduct.unit}</span></p>
              </div>
              <div className="space-y-2">
                <Label>Tipo de Movimentação</Label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: "entrada" as const, label: "Entrada", icon: ArrowDownCircle, color: "text-green-500" },
                    { key: "saida" as const, label: "Saída", icon: ArrowUpCircle, color: "text-red-500" },
                    { key: "ajuste" as const, label: "Ajuste", icon: BarChart3, color: "text-yellow-500" },
                  ]).map(t => (
                    <button key={t.key} onClick={() => setMvForm({ ...mvForm, type: t.key })}
                      className={cn("flex flex-col items-center gap-1 rounded-xl py-3 text-xs font-semibold border transition-all",
                        mvForm.type === t.key ? "bg-primary/20 border-primary/40 text-primary" : "bg-card border-border text-muted-foreground hover:bg-secondary"
                      )}>
                      <t.icon className={cn("h-5 w-5", t.color)} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{mvForm.type === "ajuste" ? "Novo Estoque" : "Quantidade"}</Label>
                <Input type="number" min="0" value={mvForm.quantity} onChange={e => setMvForm({ ...mvForm, quantity: e.target.value })} />
              </div>
              {mvForm.type === "entrada" && (
                <div className="space-y-2">
                  <Label>Custo Unitário</Label>
                  <Input type="number" step="0.01" value={mvForm.unit_cost} onChange={e => setMvForm({ ...mvForm, unit_cost: e.target.value })} />
                </div>
              )}
              <div className="space-y-2">
                <Label>Observação</Label>
                <Input value={mvForm.notes} onChange={e => setMvForm({ ...mvForm, notes: e.target.value })} placeholder="Opcional..." />
              </div>
              <Button onClick={handleMovement} disabled={saving || !mvForm.quantity} className="w-full">
                {saving ? "Registrando..." : "Confirmar Movimentação"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-[500px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico — {movementProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            {movementHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma movimentação registrada</p>
            ) : movementHistory.map(m => (
              <div key={m.id} className="flex items-center justify-between bg-secondary/50 rounded-xl px-4 py-3 border border-border">
                <div className="flex items-center gap-3">
                  {m.type === "entrada" ? <ArrowDownCircle className="h-4 w-4 text-green-500" /> :
                   m.type === "saida" ? <ArrowUpCircle className="h-4 w-4 text-red-500" /> :
                   <BarChart3 className="h-4 w-4 text-yellow-500" />}
                  <div>
                    <p className={cn("text-sm font-semibold", MOVEMENT_COLORS[m.type])}>
                      {MOVEMENT_LABELS[m.type]}: {m.quantity} {movementProduct?.unit}
                    </p>
                    {m.notes && <p className="text-xs text-muted-foreground">{m.notes}</p>}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(m.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
