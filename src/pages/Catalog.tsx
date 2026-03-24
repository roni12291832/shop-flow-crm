import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  Package, 
  Grid3X3, 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  BarChart3,
  Tag,
  Truck,
  Layers,
  Save,
  Trash2,
  Image as ImageIcon,
  Barcode,
  History
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
  DialogFooter
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Types based on requirements
interface ProductBase {
  id: string;
  nome: string;
  categoria: string;
  colecao: string;
  fornecedor_id: string | null;
  preco_base: number;
  custo_base: number;
  skus?: ProductSku[];
}

interface ProductSku {
  id: string;
  produto_id: string;
  cor: string;
  tamanho: string;
  sku: string;
  codigo_barras: string | null;
  preco: number;
  custo: number;
  estoque_atual: number;
  estoque_minimo: number;
}

export default function Catalog() {
  const [products, setProducts] = useState<ProductBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStock, setFilterStock] = useState("all");
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductBase | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      // Note: We use "produtos" and "produto_skus" as requested. 
      // Ensuring tables exist (Simulated check or implementation via code if possible)
      const { data, error } = await supabase
        .from("produtos")
        .select(`
          *,
          skus:produto_skus(*)
        `)
        .order("nome");

      if (error) throw error;
      setProducts(data || []);
    } catch (e: any) {
      console.error(e);
      // Fallback for demo if tables are not ready
      toast.error("Erro ao carregar catálogo. Certifique-se que as tabelas 'produtos' e 'produto_skus' foram criadas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.nome.toLowerCase().includes(search.toLowerCase()) || 
                         p.skus?.some(s => s.sku.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = filterCategory === "all" || p.categoria === filterCategory;
    const hasLowStock = p.skus?.some(s => s.estoque_atual <= s.estoque_minimo);
    const matchesStock = filterStock === "all" || (filterStock === "low" && hasLowStock);
    
    return matchesSearch && matchesCategory && matchesStock;
  });

  return (
    <div className="p-4 md:p-8 space-y-6 bg-background min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" /> Catálogo com Grades
          </h1>
          <p className="text-muted-foreground">Gestão de produtos base e variações (SKUs)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => fetchProducts()}>
            <History className="h-4 w-4" /> Atualizar
          </Button>
          <Button className="gap-2" onClick={() => setIsAddingProduct(true)}>
            <Plus className="h-4 w-4" /> Novo Produto
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-card border border-border p-4 rounded-xl shadow-sm">
        <div className="relative col-span-1 md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nome ou SKU..." 
            className="pl-9" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger>
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Categorias</SelectItem>
            <SelectItem value="jeans">Calças Jeans</SelectItem>
            <SelectItem value="camisa">Camisas</SelectItem>
            <SelectItem value="acessorio">Acessórios</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStock} onValueChange={setFilterStock}>
          <SelectTrigger>
            <SelectValue placeholder="Estoque" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos itens</SelectItem>
            <SelectItem value="low">Estoque Baixo ⚠️</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Product List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filteredProducts.length > 0 ? (
          filteredProducts.map(p => (
            <ProductCard key={p.id} product={p} onRefresh={fetchProducts} />
          ))
        ) : (
          <div className="bg-card border border-dashed border-border rounded-2xl p-20 text-center">
            <Grid3X3 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
            <p className="text-muted-foreground">Nenhum produto encontrado.</p>
            <Button variant="link" onClick={() => setIsAddingProduct(true)}>Adicionar seu primeiro produto</Button>
          </div>
        )}
      </div>

      {/* Add Product Dialog */}
      {isAddingProduct && (
        <AddProductDialog 
          isOpen={isAddingProduct} 
          onClose={() => setIsAddingProduct(false)} 
          onSuccess={fetchProducts}
        />
      )}
    </div>
  );
}

function ProductCard({ product, onRefresh }: { product: ProductBase, onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const totalStock = product.skus?.reduce((acc, s) => acc + s.estoque_atual, 0) || 0;
  const variationsCount = product.skus?.length || 0;
  const hasLowStock = product.skus?.some(s => s.estoque_atual <= s.estoque_minimo);

  return (
    <div className={cn(
      "bg-card border rounded-2xl transition-all overflow-hidden",
      expanded ? "border-primary shadow-md" : "border-border hover:border-muted-foreground/30"
    )}>
      <div 
        className="p-5 flex items-center justify-between cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4">
          <div className="bg-secondary/50 p-3 rounded-xl">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-lg">{product.nome}</h3>
            <div className="flex gap-2 items-center mt-1">
              <Badge variant="outline" className="text-[10px] h-5 uppercase">
                {product.categoria}
              </Badge>
              <span className="text-xs text-muted-foreground">• {variationsCount} variações na grade</span>
              {hasLowStock && (
                <div className="flex items-center gap-1 text-amber-500 text-xs font-bold pulse">
                  <AlertCircle className="h-3 w-3" /> Estoque Crítico
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right hidden md:block">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Preço Base</p>
            <p className="font-bold text-primary">R$ {product.preco_base.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="text-right hidden md:block border-l pl-6">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Estoque Total</p>
            <p className="font-bold">{totalStock} un.</p>
          </div>
          <Button variant="ghost" size="icon">
            {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-muted/20 animate-slide-down">
          <div className="p-4">
            <div className="flex justify-between items-center mb-4 px-2">
              <h4 className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                <Grid3X3 className="h-4 w-4" /> Detalhamento da Grade (Variantes)
              </h4>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" /> Adicionar SKU
              </Button>
            </div>
            
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-xs font-bold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Variante (Cor / Tamanho)</th>
                    <th className="px-4 py-3">SKU / Barcode</th>
                    <th className="px-4 py-3">Preço</th>
                    <th className="px-4 py-3">Estoque</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {product.skus?.map(s => (
                    <tr key={s.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-3 h-3 rounded-full border border-black/10")} style={{ backgroundColor: getColorInHex(s.cor) }} />
                          <span className="font-medium">{s.cor}</span> 
                          <span className="text-muted-foreground mx-1">/</span>
                          <Badge variant="secondary" className="font-black h-5">{s.tamanho}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <div className="flex flex-col">
                          <span>{s.sku}</span>
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Barcode className="h-3 w-3" /> {s.codigo_barras || '---'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold">R$ {s.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "font-bold",
                            s.estoque_atual <= s.estoque_minimo ? "text-rose-500" : "text-emerald-500"
                          )}>
                            {s.estoque_atual}
                          </span>
                          <span className="text-[10px] text-muted-foreground">/ min {s.estoque_minimo}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button className="text-muted-foreground hover:text-primary"><MoreHorizontal className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                  {(!product.skus || product.skus.length === 0) && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">Sem variações cadastradas.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Logic to help translate color names to hex for the dot
function getColorInHex(color: string) {
  const colors: Record<string, string> = {
    "Preto": "#000000",
    "Branco": "#FFFFFF",
    "Azul": "#3b82f6",
    "Vermelho": "#ef4444",
    "Verde": "#22c55e",
    "Amarelo": "#eab308",
    "Rosa": "#ec4899",
    "Roxo": "#a855f7",
    "Cinza": "#6b7280",
    "Marrom": "#78350f"
  };
  return colors[color] || "#cbd5e1";
}

function AddProductDialog({ isOpen, onClose, onSuccess }: any) {
  const [step, setStep] = useState(1);
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [precoBase, setPrecoBase] = useState(0);
  const [custoBase, setCustoBase] = useState(0);
  
  // Grid config
  const [selectedCores, setSelectedCores] = useState<string[]>([]);
  const [selectedTamanhos, setSelectedTamanhos] = useState<string[]>([]);
  const [generatedSkus, setGeneratedSkus] = useState<any[]>([]);

  const CORES = ["Preto", "Branco", "Azul", "Vermelho", "Verde", "Rosa", "Cinza", "Jeans"];
  const TAMANHOS = ["PP", "P", "M", "G", "GG", "U"];

  const generateSkus = () => {
    if (selectedCores.length === 0 || selectedTamanhos.length === 0) {
      toast.error("Selecione pelo menos uma cor e um tamanho.");
      return;
    }
    
    const newSkus = [];
    for (const cor of selectedCores) {
      for (const tam of selectedTamanhos) {
        newSkus.push({
          cor,
          tamanho: tam,
          sku: `${nome.slice(0,3).toUpperCase()}-${cor.slice(0,2).toUpperCase()}-${tam}`,
          preco: precoBase,
          custo: custoBase,
          estoque_atual: 0,
          estoque_minimo: 2
        });
      }
    }
    setGeneratedSkus(newSkus);
    setStep(2);
  };

  const handleSave = async () => {
    try {
      const { data: baseProduct, error: baseError } = await supabase
        .from("produtos")
        .insert({
          nome,
          categoria,
          preco_base: precoBase,
          custo_base: custoBase,
          colecao: "Verão 2024", // Example
        })
        .select()
        .single();

      if (baseError) throw baseError;

      const skusToInsert = generatedSkus.map(s => ({
        ...s,
        produto_id: baseProduct.id
      }));

      const { error: skusError } = await supabase
        .from("produto_skus")
        .insert(skusToInsert);

      if (skusError) throw skusError;

      toast.success("Produto e grade criados com sucesso!");
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{step === 1 ? "Cadastro de Produto Base" : "Ajuste de Grade"}</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <label className="text-sm font-bold">Nome do Produto</label>
                <Input placeholder="Ex: Calça Jeans Slim Masculina" value={nome} onChange={e => setNome(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold">Categoria</label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jeans">Calças Jeans</SelectItem>
                    <SelectItem value="camisa">Camisas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold">Custo Base</label>
                <Input type="number" placeholder="0.00" value={custoBase} onChange={e => setCustoBase(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold">Preço de Venda Base</label>
                <Input type="number" placeholder="0.00" value={precoBase} onChange={e => setPrecoBase(Number(e.target.value))} />
              </div>
            </div>

            <div className="space-y-4 border-t pt-4">
              <h4 className="text-sm font-bold text-primary flex items-center gap-2">
                <Grid3X3 className="h-4 w-4" /> Configuração da Grade
              </h4>
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase text-muted-foreground">Cores Disponíveis</label>
                <div className="flex flex-wrap gap-2">
                  {CORES.map(c => (
                    <Badge 
                      key={c}
                      variant={selectedCores.includes(c) ? "default" : "outline"}
                      className="cursor-pointer py-1.5 px-3 hover:bg-primary/20"
                      onClick={() => selectedCores.includes(c) ? setSelectedCores(prev => prev.filter(x => x !== c)) : setSelectedCores(prev => [...prev, c])}
                    >
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase text-muted-foreground">Tamanhos Disponíveis</label>
                <div className="flex flex-wrap gap-2">
                  {TAMANHOS.map(t => (
                    <Badge 
                      key={t}
                      variant={selectedTamanhos.includes(t) ? "default" : "outline"}
                      className="cursor-pointer py-1.5 px-3 hover:bg-primary/20"
                      onClick={() => selectedTamanhos.includes(t) ? setSelectedTamanhos(prev => prev.filter(x => x !== t)) : setSelectedTamanhos(prev => [...prev, t])}
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={generateSkus} disabled={!nome || !categoria}>Próximo: Revisar SKUs</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="max-h-[50vh] overflow-y-auto rounded-xl border">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-3">VARIANTE</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3">PREÇO</th>
                    <th className="p-3">EST. MIN.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {generatedSkus.map((s, i) => (
                    <tr key={i}>
                      <td className="p-3 font-bold">{s.cor} / {s.tamanho}</td>
                      <td className="p-3"><Input className="h-8 text-xs font-mono" value={s.sku} onChange={e => {
                        const next = [...generatedSkus];
                        next[i].sku = e.target.value;
                        setGeneratedSkus(next);
                      }} /></td>
                      <td className="p-3"><Input className="h-8 text-xs" type="number" value={s.preco} onChange={e => {
                        const next = [...generatedSkus];
                        next[i].preco = Number(e.target.value);
                        setGeneratedSkus(next);
                      }} /></td>
                      <td className="p-3"><Input className="h-8 text-xs" type="number" value={s.estoque_minimo} onChange={e => {
                        const next = [...generatedSkus];
                        next[i].estoque_minimo = Number(e.target.value);
                        setGeneratedSkus(next);
                      }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
              <Button onClick={handleSave}>Salvar Produto e {generatedSkus.length} SKUs</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
