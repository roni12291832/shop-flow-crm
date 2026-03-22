import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { Building2, Users, TrendingUp, Search, ArrowLeft, Eye } from "lucide-react";

interface TenantInfo {
  id: string;
  company_name: string;
  plan_type: string | null;
  created_at: string;
  member_count: number;
  client_count: number;
}

export default function AdminPanel() {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState({ totalTenants: 0, totalUsers: 0, totalClients: 0 });
  const isSuperAdmin = roles.includes("super_admin");

  useEffect(() => {
    if (!loading && !isSuperAdmin) {
      navigate("/");
    }
  }, [loading, isSuperAdmin, navigate]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const fetchStats = async () => {
      const { count: profilesCount } = await supabase.from("profiles").select("*", { count: "exact", head: true });
      const { count: clientsCount } = await supabase.from("clients").select("*", { count: "exact", head: true });
      const { count: salesCount } = await supabase.from("opportunities").select("*", { count: "exact", head: true }).eq("status", "ganho");

      setStats({
        totalTenants: 1, // Single project now
        totalUsers: profilesCount || 0,
        totalClients: clientsCount || 0,
      });

      // Dummy tenant list since UI mapping expects at least the current one
      setTenants([{
        id: "1",
        company_name: "Projeto Único CRM",
        plan_type: "premium",
        created_at: new Date().toISOString(),
        member_count: profilesCount || 0,
        client_count: clientsCount || 0,
      }]);
    };
    fetchStats();
  }, [isSuperAdmin]);

  if (loading) return <div className="flex h-screen items-center justify-center bg-background"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!isSuperAdmin) return null;

  const filtered = tenants.filter(t => t.company_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="h-5 w-5" /></Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Painel Super Admin</h1>
              <p className="text-sm text-muted-foreground">Gestão de todos os tenants do SaaS</p>
            </div>
          </div>
          <Badge className="bg-destructive/20 text-destructive border-0 text-xs font-bold">SUPER ADMIN</Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center"><Building2 className="h-5 w-5 text-primary" /></div>
              <span className="text-muted-foreground text-sm">Tenants Ativos</span>
            </div>
            <div className="text-3xl font-extrabold text-foreground">{stats.totalTenants}</div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-chart-2/20 flex items-center justify-center"><Users className="h-5 w-5 text-chart-2" /></div>
              <span className="text-muted-foreground text-sm">Usuários Totais</span>
            </div>
            <div className="text-3xl font-extrabold text-foreground">{stats.totalUsers}</div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-chart-3/20 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-chart-3" /></div>
              <span className="text-muted-foreground text-sm">Clientes Cadastrados</span>
            </div>
            <div className="text-3xl font-extrabold text-foreground">{stats.totalClients}</div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-10 bg-card border-border" placeholder="Buscar tenant..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Tenants table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {["Empresa", "Plano", "Membros", "Clientes", "Criado em"].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-muted-foreground text-[12px] font-semibold uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="border-b border-border/20 hover:bg-border/40 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                        {t.company_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="text-foreground font-semibold text-sm block">{t.company_name}</span>
                        <span className="text-muted-foreground text-[11px]">{t.id.slice(0, 8)}...</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant="secondary" className="text-[12px] bg-primary/20 text-primary border-0">
                      {t.plan_type || "basic"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-foreground font-semibold text-sm">{t.member_count}</td>
                  <td className="px-5 py-3.5 text-foreground font-semibold text-sm">{t.client_count}</td>
                  <td className="px-5 py-3.5 text-muted-foreground text-[13px]">
                    {new Date(t.created_at).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">Nenhum tenant encontrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
