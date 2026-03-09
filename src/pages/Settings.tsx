import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Building2, User, Palette, Users, Shield, Save } from "lucide-react";
import { toast } from "sonner";

interface TenantSettings {
  company_name: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
}

interface TeamMember {
  user_id: string;
  name: string;
  email: string;
  role: string;
}

export default function Settings() {
  const { tenantId, profile, user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [tenant, setTenant] = useState<TenantSettings>({
    company_name: "",
    logo_url: "",
    primary_color: "#2563eb",
    secondary_color: "#1e40af",
  });
  const [profileForm, setProfileForm] = useState({ name: "", email: "" });
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId) return;

    const fetchSettings = async () => {
      const { data: tenantData } = await supabase
        .from("tenants")
        .select("company_name, logo_url, primary_color, secondary_color")
        .eq("id", tenantId)
        .single();

      if (tenantData) {
        setTenant({
          company_name: tenantData.company_name || "",
          logo_url: tenantData.logo_url || "",
          primary_color: tenantData.primary_color || "#2563eb",
          secondary_color: tenantData.secondary_color || "#1e40af",
        });
      }

      // Fetch team members
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .eq("tenant_id", tenantId);

      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("tenant_id", tenantId);

      if (profiles && roles) {
        const roleMap: Record<string, string> = {};
        roles.forEach((r: any) => { roleMap[r.user_id] = r.role; });
        setTeam(profiles.map((p: any) => ({
          ...p,
          role: roleMap[p.user_id] || "vendedor",
        })));
      }
    };

    fetchSettings();
  }, [tenantId]);

  useEffect(() => {
    if (profile) {
      setProfileForm({ name: profile.name, email: profile.email });
    }
  }, [profile]);

  const saveTenant = async () => {
    if (!tenantId || !isAdmin) return;
    setSaving(true);
    const { error } = await supabase
      .from("tenants")
      .update({
        company_name: tenant.company_name,
        logo_url: tenant.logo_url || null,
        primary_color: tenant.primary_color,
        secondary_color: tenant.secondary_color,
      })
      .eq("id", tenantId);
    setSaving(false);
    if (error) toast.error("Erro ao salvar");
    else toast.success("Configurações salvas!");
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ name: profileForm.name })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) toast.error("Erro ao atualizar perfil");
    else toast.success("Perfil atualizado!");
  };

  const ROLE_LABELS: Record<string, string> = {
    admin: "Administrador",
    gerente: "Gerente",
    vendedor: "Vendedor",
    atendimento: "Atendimento",
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Gerencie sua conta e empresa</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" className="gap-1.5"><User className="h-4 w-4" /> Perfil</TabsTrigger>
          {isAdmin && (
            <>
              <TabsTrigger value="company" className="gap-1.5"><Building2 className="h-4 w-4" /> Empresa</TabsTrigger>
              <TabsTrigger value="team" className="gap-1.5"><Users className="h-4 w-4" /> Equipe</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Meu Perfil</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={profileForm.email} disabled className="bg-muted" />
              </div>
              <Button onClick={saveProfile} disabled={saving} className="gap-1.5">
                <Save className="h-4 w-4" /> Salvar Perfil
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="company" className="mt-4 space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Dados da Empresa</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome da Empresa</Label>
                  <Input value={tenant.company_name} onChange={(e) => setTenant({ ...tenant, company_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>URL do Logo</Label>
                  <Input value={tenant.logo_url} onChange={(e) => setTenant({ ...tenant, logo_url: e.target.value })} placeholder="https://..." />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Palette className="h-4 w-4" /> Personalização</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Cor Primária</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={tenant.primary_color}
                          onChange={(e) => setTenant({ ...tenant, primary_color: e.target.value })}
                          className="w-10 h-10 rounded cursor-pointer border-0"
                        />
                        <Input value={tenant.primary_color} onChange={(e) => setTenant({ ...tenant, primary_color: e.target.value })} className="font-mono text-sm" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Cor Secundária</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={tenant.secondary_color}
                          onChange={(e) => setTenant({ ...tenant, secondary_color: e.target.value })}
                          className="w-10 h-10 rounded cursor-pointer border-0"
                        />
                        <Input value={tenant.secondary_color} onChange={(e) => setTenant({ ...tenant, secondary_color: e.target.value })} className="font-mono text-sm" />
                      </div>
                    </div>
                  </div>
                </div>
                <Button onClick={saveTenant} disabled={saving} className="gap-1.5">
                  <Save className="h-4 w-4" /> Salvar Configurações
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="team" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Equipe
                </CardTitle>
              </CardHeader>
              <CardContent>
                {team.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhum membro encontrado</p>
                ) : (
                  <div className="space-y-3">
                    {team.map((m) => (
                      <div key={m.user_id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-xs font-bold text-white">
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{m.name}</p>
                            <p className="text-xs text-muted-foreground">{m.email}</p>
                          </div>
                        </div>
                        <Badge variant="outline">{ROLE_LABELS[m.role] || m.role}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
