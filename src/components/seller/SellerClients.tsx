import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Search, User, Phone, MapPin, Calendar } from "lucide-react";

interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  origin: string | null;
  last_purchase: string | null;
  ticket_medio: number | null;
  tags: string[] | null;
  created_at: string;
}

const ORIGIN_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook",
  google: "Google", indicacao: "Indicação", loja_fisica: "Loja Física",
  site: "Site", outro: "Outro",
};

export function SellerClients() {
  const {  user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !user) return;
    const fetchClients = async () => {
      setLoading(true);
      // Get clients assigned to this seller, or all if no responsible filter
      const { data } = await supabase
        .from("clients")
        .select("id, name, phone, email, city, origin, last_purchase, ticket_medio, tags, created_at")
        
        .order("name");
      setClients((data as Client[]) || []);
      setLoading(false);
    };
    fetchClients();
  }, [tenantId, user]);

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || "").includes(search) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-5 pt-8 pb-4 space-y-5 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-foreground">Meus Clientes</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, telefone ou email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} clientes encontrados</p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <User className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum cliente encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <div key={c.id} className="bg-card border border-border rounded-xl px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground text-sm">{c.name}</span>
                {c.origin && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {ORIGIN_LABELS[c.origin] || c.origin}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {c.phone && (
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>
                )}
                {c.city && (
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{c.city}</span>
                )}
                {c.last_purchase && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Última compra: {new Date(c.last_purchase).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </div>
              {c.tags && c.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {c.tags.map(tag => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
