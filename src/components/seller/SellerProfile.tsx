import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, Monitor } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function SellerProfile() {
  const { profile, roles, signOut, hasRole } = useAuth();
  const navigate = useNavigate();
  const isAdmin = hasRole("admin") || hasRole("gerente");

  const ROLE_LABELS: Record<string, string> = {
    admin: "Administrador", gerente: "Gerente", vendedor: "Vendedor", atendimento: "Atendimento",
  };

  return (
    <div className="px-5 pt-8 pb-4 space-y-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-foreground">Meu Perfil</h1>

      <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary">
          {profile?.name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "U"}
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-foreground">{profile?.name || "Usuário"}</p>
          <p className="text-sm text-muted-foreground">{profile?.email}</p>
          <span className="inline-block mt-2 text-xs font-semibold px-3 py-1 rounded-full bg-primary/20 text-primary">
            {roles.length > 0 ? ROLE_LABELS[roles[0]] || roles[0] : "Vendedor"}
          </span>
        </div>
      </div>

      {isAdmin && (
        <Button variant="outline" className="w-full gap-2" onClick={() => navigate("/")}>
          <Monitor className="h-4 w-4" /> Modo Administrador
        </Button>
      )}

      <Button variant="destructive" className="w-full gap-2" onClick={signOut}>
        <LogOut className="h-4 w-4" /> Sair
      </Button>
    </div>
  );
}
