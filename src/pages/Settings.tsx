import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Save, Building2, User, Palette, Users, Shield, UserPlus } from "lucide-react";
import { toast } from "sonner";

interface TeamMember { user_id: string; name: string; email: string; role: string; }
const ROLE_LABELS: Record<string, string> = { admin: "Administrador", gerente: "Gerente", vendedor: "Vendedor", atendimento: "Atendimento" };

export default function Settings() {
  const { tenantId, profile, user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [tenant, setTenant] = useState({ company_name: "", logo_url: "", primary_color: "#6366f1", secondary_color: "#8b5cf6" });
  const [profileForm, setProfileForm] = useState({ name: "", email: "" });
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", password: "", name: "", role: "vendedor" });
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    const fetch_ = async () => {
      const { data: t } = await supabase.from("tenants").select("company_name, logo_url, primary_color, secondary_color").eq("id", tenantId).single();
      if (t) setTenant({ company_name: t.company_name || "", logo_url: t.logo_url || "", primary_color: t.primary_color || "#6366f1", secondary_color: t.secondary_color || "#8b5cf6" });
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("user_id, name, email").eq("tenant_id", tenantId),
        supabase.from("user_roles").select("user_id, role").eq("tenant_id", tenantId),
      ]);
      if (profiles && roles) {
        const roleMap: Record<string, string> = {};
        roles.forEach((r: any) => { roleMap[r.user_id] = r.role; });
        setTeam(profiles.map((p: any) => ({ ...p, role: roleMap[p.user_id] || "vendedor" })));
      }
    };
    fetch_();
  }, [tenantId]);

  useEffect(() => { if (profile) setProfileForm({ name: profile.name, email: profile.email }); }, [profile]);

  const saveTenant = async () => {
    if (!tenantId || !isAdmin) return;
    setSaving(true);
    const { error } = await supabase.from("tenants").update({ company_name: tenant.company_name, logo_url: tenant.logo_url || null, primary_color: tenant.primary_color, secondary_color: tenant.secondary_color }).eq("id", tenantId);
    setSaving(false);
    if (error) toast.error("Erro ao salvar"); else toast.success("Configurações salvas!");
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ name: profileForm.name }).eq("user_id", user.id);
    setSaving(false);
    if (error) toast.error("Erro ao atualizar"); else toast.success("Perfil atualizado!");
  };

  const inviteMember = async () => {
    if (!tenantId) return;
    setInviting(true);
    const { error } = await supabase.auth.signUp({
      email: inviteForm.email,
      password: inviteForm.password,
      options: { data: { name: inviteForm.name, tenant_id: tenantId } },
    });
    setInviting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Membro convidado! Ele receberá um email de confirmação.");
      setInviteOpen(false);
      setInviteForm({ email: "", password: "", name: "", role: "vendedor" });
      // Refresh team
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("user_id, name, email").eq("tenant_id", tenantId),
        supabase.from("user_roles").select("user_id, role").eq("tenant_id", tenantId),
      ]);
      if (profiles && roles) {
        const roleMap: Record<string, string> = {};
        roles.forEach((r: any) => { roleMap[r.user_id] = r.role; });
        setTeam(profiles.map((p: any) => ({ ...p, role: roleMap[p.user_id] || "vendedor" })));
      }
    }
  };

  const changeRole = async (userId: string, newRole: string) => {
    if (!tenantId) return;
    const { error } = await supabase.from("user_roles").update({ role: newRole as any }).eq("user_id", userId).eq("tenant_id", tenantId);
    if (error) toast.error("Erro ao alterar role");
    else {
      toast.success("Role atualizado!");
      setTeam(prev => prev.map(m => m.user_id === userId ? { ...m, role: newRole } : m));
    }
  };

  const tabs = [
    { key: "profile", label: "Perfil", icon: User },
    ...(isAdmin ? [
      { key: "company", label: "Empresa", icon: Building2 },
      { key: "team", label: "Equipe", icon: Users },
    ] : []),
  ];

  return (
    <div className="p-7 space-y-6 animate-fade-in">
      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-[10px] text-[13px] font-semibold transition-all border flex items-center gap-1.5 ${
              activeTab === t.key ? "bg-primary/20 text-primary border-primary/40" : "bg-card text-muted-foreground border-border hover:bg-secondary"
            }`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {activeTab === "profile" && (
        <div className="bg-card border border-border rounded-2xl p-6 max-w-lg space-y-4">
          <h3 className="text-foreground font-bold text-base">Meu Perfil</h3>
          <div className="space-y-2"><Label>Nome</Label><Input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>Email</Label><Input value={profileForm.email} disabled className="bg-secondary" /></div>
          <Button onClick={saveProfile} disabled={saving} className="gap-1.5"><Save className="h-4 w-4" /> Salvar</Button>
        </div>
      )}

      {activeTab === "company" && isAdmin && (
        <div className="bg-card border border-border rounded-2xl p-6 max-w-lg space-y-4">
          <h3 className="text-foreground font-bold text-base">Dados da Empresa</h3>
          <div className="space-y-2"><Label>Nome da Empresa</Label><Input value={tenant.company_name} onChange={(e) => setTenant({ ...tenant, company_name: e.target.value })} /></div>
          <div className="space-y-2"><Label>URL do Logo</Label><Input value={tenant.logo_url} onChange={(e) => setTenant({ ...tenant, logo_url: e.target.value })} placeholder="https://..." /></div>
          <Separator className="bg-border" />
          <Label className="flex items-center gap-1.5"><Palette className="h-4 w-4" /> Personalização</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Cor Primária</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={tenant.primary_color} onChange={(e) => setTenant({ ...tenant, primary_color: e.target.value })} className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent" />
                <Input value={tenant.primary_color} onChange={(e) => setTenant({ ...tenant, primary_color: e.target.value })} className="font-mono text-sm" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Cor Secundária</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={tenant.secondary_color} onChange={(e) => setTenant({ ...tenant, secondary_color: e.target.value })} className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent" />
                <Input value={tenant.secondary_color} onChange={(e) => setTenant({ ...tenant, secondary_color: e.target.value })} className="font-mono text-sm" />
              </div>
            </div>
          </div>
          <Button onClick={saveTenant} disabled={saving} className="gap-1.5"><Save className="h-4 w-4" /> Salvar</Button>
        </div>
      )}

      {activeTab === "team" && isAdmin && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-foreground font-bold text-base flex items-center gap-2"><Shield className="h-4 w-4" /> Equipe</h3>
            <Button size="sm" className="gap-1.5" onClick={() => setInviteOpen(true)}><UserPlus className="h-4 w-4" /> Convidar</Button>
          </div>
          {team.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum membro</p>
          ) : team.map(m => (
            <div key={m.user_id} className="flex items-center justify-between p-3 rounded-xl hover:bg-secondary/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-xs font-bold text-white">{m.name.charAt(0).toUpperCase()}</div>
                <div><p className="text-sm font-semibold text-foreground">{m.name}</p><p className="text-xs text-muted-foreground">{m.email}</p></div>
              </div>
              {m.user_id === user?.id ? (
                <Badge variant="outline" className="border-border text-muted-foreground">{ROLE_LABELS[m.role] || m.role}</Badge>
              ) : (
                <Select value={m.role} onValueChange={v => changeRole(m.user_id, v)}>
                  <SelectTrigger className="w-36 bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="gerente">Gerente</SelectItem>
                    <SelectItem value="vendedor">Vendedor</SelectItem>
                    <SelectItem value="atendimento">Atendimento</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}

          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Convidar Membro</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>Nome *</Label><Input value={inviteForm.name} onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Email *</Label><Input type="email" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} /></div>
                <div className="space-y-2"><Label>Senha Inicial *</Label><Input type="password" value={inviteForm.password} onChange={e => setInviteForm({ ...inviteForm, password: e.target.value })} /></div>
                <div className="space-y-2"><Label>Role</Label>
                  <Select value={inviteForm.role} onValueChange={v => setInviteForm({ ...inviteForm, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vendedor">Vendedor</SelectItem>
                      <SelectItem value="atendimento">Atendimento</SelectItem>
                      <SelectItem value="gerente">Gerente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={inviteMember} disabled={inviting || !inviteForm.email || !inviteForm.name || !inviteForm.password} className="w-full">
                  {inviting ? "Convidando..." : "Enviar Convite"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
