import { useEffect, useState } from "react";
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
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

const ORIGINS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "google", label: "Google" },
  { value: "indicacao", label: "Indicação" },
  { value: "loja_fisica", label: "Loja Física" },
  { value: "site", label: "Site" },
  { value: "outro", label: "Outro" },
];

interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  origin: string | null;
  tags: string[] | null;
  ticket_medio: number | null;
  created_at: string;
}

export default function Clients() {
  const { tenantId } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "", origin: "outro", notes: "" });

  const fetchClients = async () => {
    if (!tenantId) return;
    const { data } = await supabase.from("clients").select("id, name, phone, email, city, origin, tags, ticket_medio, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false });
    if (data) setClients(data as Client[]);
  };

  useEffect(() => { fetchClients(); }, [tenantId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    const { error } = await supabase.from("clients").insert({
      tenant_id: tenantId, name: form.name, phone: form.phone || null,
      email: form.email || null, city: form.city || null, origin: form.origin as any, notes: form.notes || null,
    });
    if (error) toast.error("Erro ao criar cliente");
    else { toast.success("Cliente criado!"); setDialogOpen(false); setForm({ name: "", phone: "", email: "", city: "", origin: "outro", notes: "" }); fetchClients(); }
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Novo Cliente</Button>
          </DialogTrigger>
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

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Cliente", "Telefone", "Cidade", "Origem", "Tags", "Ticket Médio", "Ações"].map(h => (
                <th key={h} className="px-5 py-3.5 text-left text-muted-foreground text-[12px] font-semibold uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-border/20 hover:bg-border/40 transition-colors cursor-pointer">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-[11px] font-bold text-white">
                      {c.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <span className="text-foreground font-semibold text-sm">{c.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-muted-foreground text-[13px]">{c.phone || "—"}</td>
                <td className="px-5 py-3.5 text-muted-foreground text-[13px]">{c.city || "—"}</td>
                <td className="px-5 py-3.5">
                  <Badge variant="secondary" className="text-[12px] bg-primary/20 text-primary border-0">
                    {ORIGINS.find(o => o.value === c.origin)?.label || c.origin || "—"}
                  </Badge>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-1.5">
                    {(c.tags || []).map(tag => (
                      <span key={tag} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        tag === "VIP" ? "bg-warning/20 text-warning" : "bg-secondary text-muted-foreground"
                      }`}>{tag}</span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3.5 text-accent font-bold text-sm">
                  R${(c.ticket_medio || 0).toLocaleString("pt-BR")}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-2">
                    <button className="bg-primary/20 text-primary border-0 rounded-lg px-3 py-1.5 text-[12px] hover:bg-primary/30 transition-colors">Ver</button>
                    <button className="bg-accent/20 text-accent border-0 rounded-lg px-3 py-1.5 text-[12px] hover:bg-accent/30 transition-colors">Chat</button>
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
  );
}
