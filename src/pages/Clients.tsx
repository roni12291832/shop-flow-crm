import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Upload, FileSpreadsheet, X } from "lucide-react";
import { toast } from "sonner";
import { ClientDetailDrawer } from "@/components/crm/ClientDetailDrawer";

const ORIGINS = [
  { value: "whatsapp", label: "WhatsApp" }, { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" }, { value: "google", label: "Google" },
  { value: "indicacao", label: "Indicação" }, { value: "loja_fisica", label: "Loja Física" },
  { value: "site", label: "Site" }, { value: "outro", label: "Outro" },
];

interface Client {
  id: string; name: string; phone: string | null; email: string | null;
  city: string | null; origin: string | null; tags: string[] | null;
  ticket_medio: number | null; created_at: string;
  score: number | null; temperature: string | null;
}

interface ImportRow {
  name: string; phone?: string; email?: string; city?: string; origin?: string;
}

export default function Clients() {
    const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "", origin: "outro", notes: "" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [importData, setImportData] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchClients = async () => {
        const { data } = await supabase.from("clients").select("id, name, phone, email, city, origin, tags, ticket_medio, score, temperature, created_at").order("created_at", { ascending: false });
    if (data) setClients(data as Client[]);
  };

  useEffect(() => { fetchClients(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
        const { error } = await supabase.from("clients").insert({
       name: form.name, phone: form.phone || null,
      email: form.email || null, city: form.city || null, origin: form.origin as any, notes: form.notes || null,
    });
    if (error) toast.error("Erro ao criar cliente");
    else { toast.success("Cliente criado!"); setDialogOpen(false); setForm({ name: "", phone: "", email: "", city: "", origin: "outro", notes: "" }); fetchClients(); }
  };

  const openDetail = (id: string) => { setSelectedClientId(id); setDrawerOpen(true); };

  const parseCSV = (text: string): ImportRow[] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headerLine = lines[0].toLowerCase();
    const separator = headerLine.includes(";") ? ";" : ",";
    const headers = headerLine.split(separator).map(h => h.trim().replace(/"/g, ""));

    const nameIdx = headers.findIndex(h => ["nome", "name", "cliente"].includes(h));
    const phoneIdx = headers.findIndex(h => ["telefone", "phone", "celular", "tel", "whatsapp"].includes(h));
    const emailIdx = headers.findIndex(h => ["email", "e-mail"].includes(h));
    const cityIdx = headers.findIndex(h => ["cidade", "city"].includes(h));
    const originIdx = headers.findIndex(h => ["origem", "origin", "canal"].includes(h));

    if (nameIdx === -1) { toast.error("Coluna 'Nome' não encontrada na planilha"); return []; }

    return lines.slice(1).map(line => {
      const cols = line.split(separator).map(c => c.trim().replace(/^"|"$/g, ""));
      return {
        name: cols[nameIdx] || "",
        phone: phoneIdx >= 0 ? cols[phoneIdx] : undefined,
        email: emailIdx >= 0 ? cols[emailIdx] : undefined,
        city: cityIdx >= 0 ? cols[cityIdx] : undefined,
        origin: originIdx >= 0 ? cols[originIdx] : undefined,
      };
    }).filter(r => r.name.length > 0);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) { toast.error("Nenhum dado válido encontrado"); return; }
      setImportData(rows);
      toast.success(`${rows.length} clientes encontrados na planilha`);
    };
    reader.readAsText(file, "UTF-8");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImport = async () => {
    if (importData.length === 0) return;
    setImporting(true);

    const validOrigins = ORIGINS.map(o => o.value);
    const toInsert = importData.map(r => ({
            name: r.name,
      phone: r.phone || null,
      email: r.email || null,
      city: r.city || null,
      origin: (validOrigins.includes(r.origin?.toLowerCase() || "") ? r.origin!.toLowerCase() : "outro") as any,
    }));

    // Insert in batches of 50
    let imported = 0;
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      const { error } = await supabase.from("clients").insert(batch);
      if (error) { toast.error(`Erro no lote ${Math.floor(i / 50) + 1}: ${error.message}`); break; }
      imported += batch.length;
    }

    setImporting(false);
    if (imported > 0) {
      toast.success(`${imported} clientes importados com sucesso!`);
      setImportData([]);
      setImportDialogOpen(false);
      fetchClients();
    }
  };

  const removeImportRow = (idx: number) => {
    setImportData(prev => prev.filter((_, i) => i !== idx));
  };

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.city?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  return (
    <div className="p-7 space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-10 bg-card border-border" placeholder="Buscar clientes..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Upload className="h-4 w-4" /> Importar
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Importar Clientes via Planilha</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="bg-secondary/50 border border-border rounded-xl p-4 text-sm text-muted-foreground space-y-2">
                <p className="font-semibold text-foreground">Formato aceito: CSV (.csv)</p>
                <p>A planilha deve ter cabeçalho com pelo menos a coluna <strong>Nome</strong>.</p>
                <p>Colunas opcionais: <strong>Telefone</strong>, <strong>Email</strong>, <strong>Cidade</strong>, <strong>Origem</strong></p>
                <p className="text-xs">Separadores aceitos: vírgula (,) ou ponto e vírgula (;)</p>
              </div>

              <div>
                <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
                <Button variant="outline" className="w-full gap-2 h-20 border-dashed border-2" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-5 w-5" />
                  <div className="text-left">
                    <div className="font-semibold">Selecionar arquivo CSV</div>
                    <div className="text-xs text-muted-foreground">Clique para escolher o arquivo</div>
                  </div>
                </Button>
              </div>

              {importData.length > 0 && (
                <>
                  <div className="border border-border rounded-xl overflow-hidden">
                    <div className="bg-secondary/50 px-4 py-2 text-sm font-semibold text-foreground">
                      Pré-visualização ({importData.length} clientes)
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            {["Nome", "Telefone", "Email", "Cidade", "Origem", ""].map(h => (
                              <th key={h} className="px-3 py-2 text-left text-muted-foreground text-[11px] font-semibold uppercase">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importData.slice(0, 50).map((r, i) => (
                            <tr key={i} className="border-b border-border/20">
                              <td className="px-3 py-1.5 text-foreground font-medium">{r.name}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{r.phone || "—"}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{r.email || "—"}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{r.city || "—"}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{r.origin || "outro"}</td>
                              <td className="px-3 py-1.5">
                                <button onClick={() => removeImportRow(i)} className="text-muted-foreground hover:text-destructive">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {importData.length > 50 && (
                        <p className="text-center text-xs text-muted-foreground py-2">... e mais {importData.length - 50} clientes</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setImportData([])}>Limpar</Button>
                    <Button className="flex-1 gap-2" onClick={handleImport} disabled={importing}>
                      {importing ? "Importando..." : `Importar ${importData.length} Clientes`}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Novo Cliente</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Cliente</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2"><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-9999" /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Cidade</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                <div className="space-y-2"><Label>Origem</Label>
                  <Select value={form.origin} onValueChange={(v) => setForm({ ...form, origin: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ORIGINS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" className="w-full">Cadastrar Cliente</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {["Cliente", "Telefone", "Origem", "Temperatura", "Score", "Tags", "Ticket Médio", "Ações"].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-muted-foreground text-[12px] font-semibold uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border/20 hover:bg-border/40 transition-colors cursor-pointer" onClick={() => openDetail(c.id)}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-[11px] font-bold text-white">
                        {c.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <span className="text-foreground font-semibold text-sm">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground text-[13px]">{c.phone || "—"}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant="secondary" className="text-[12px] bg-primary/20 text-primary border-0">
                      {ORIGINS.find(o => o.value === c.origin)?.label || c.origin || "—"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-1 text-[13px] font-medium">
                      {c.temperature === "quente" && <span className="text-destructive">🔥 Quente</span>}
                      {c.temperature === "morno" && <span className="text-warning">🌤️ Morno</span>}
                      {(c.temperature === "frio" || !c.temperature) && <span className="text-muted-foreground">❄️ Frio</span>}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-foreground font-bold text-sm">{c.score || 0} pts</td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-1.5">
                      {(c.tags || []).map(tag => (
                        <span key={tag} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          tag === "VIP" ? "bg-warning/20 text-warning" : "bg-secondary text-muted-foreground"
                        }`}>{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-accent font-bold text-sm">R${(c.ticket_medio || 0).toLocaleString("pt-BR")}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      <button onClick={() => openDetail(c.id)} className="bg-primary/20 text-primary border-0 rounded-lg px-3 py-1.5 text-[12px] hover:bg-primary/30 transition-colors">Ver</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">Nenhum cliente encontrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ClientDetailDrawer clientId={selectedClientId} open={drawerOpen} onOpenChange={setDrawerOpen} onUpdate={fetchClients} />
    </div>
  );
}
