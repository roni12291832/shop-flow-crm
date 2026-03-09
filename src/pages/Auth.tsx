import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { BarChart3, Users, TrendingUp, MessageSquare } from "lucide-react";

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    if (error) toast.error(error.message);
    else navigate("/");
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signUp(signupEmail, signupPassword, signupName);
    if (error) toast.error(error.message);
    else toast.success("Conta criada! Verifique seu email para confirmar.");
    setLoading(false);
  };

  const features = [
    { icon: Users, title: "Gestão de Clientes", desc: "Centralize todos os seus contatos" },
    { icon: TrendingUp, title: "Pipeline de Vendas", desc: "Acompanhe cada oportunidade" },
    { icon: MessageSquare, title: "WhatsApp Integrado", desc: "Atenda direto do CRM" },
    { icon: BarChart3, title: "Relatórios Inteligentes", desc: "Dados para decisões melhores" },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left */}
      <div className="hidden lg:flex lg:w-1/2 gradient-primary items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        </div>
        <div className="relative z-10 text-white max-w-md">
          <h1 className="text-4xl font-extrabold mb-4">CRM para Lojas Físicas</h1>
          <p className="text-lg text-white/80 mb-10">Controle vendas, atendimento e performance da sua equipe em um só lugar.</p>
          <div className="space-y-6">
            {features.map((f) => (
              <div key={f.title} className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm"><f.icon className="h-5 w-5" /></div>
                <div><h3 className="font-semibold">{f.title}</h3><p className="text-sm text-white/70">{f.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <span className="text-2xl font-extrabold text-foreground">StoreCRM</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-card border border-border rounded-xl p-1 mb-6">
            <button onClick={() => setTab("login")} className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>Entrar</button>
            <button onClick={() => setTab("signup")} className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>Criar Conta</button>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            {tab === "login" ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="mb-4"><h2 className="text-lg font-bold text-foreground">Bem-vindo de volta</h2><p className="text-sm text-muted-foreground">Entre com sua conta</p></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" placeholder="seu@email.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required /></div>
                <div className="space-y-2"><Label>Senha</Label><Input type="password" placeholder="••••••••" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required /></div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</Button>
              </form>
            ) : (
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="mb-4"><h2 className="text-lg font-bold text-foreground">Crie sua conta</h2><p className="text-sm text-muted-foreground">Comece a gerenciar sua loja</p></div>
                <div className="space-y-2"><Label>Nome</Label><Input placeholder="Seu nome" value={signupName} onChange={(e) => setSignupName(e.target.value)} required /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" placeholder="seu@email.com" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required /></div>
                <div className="space-y-2"><Label>Senha</Label><Input type="password" placeholder="Mínimo 6 caracteres" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required minLength={6} /></div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? "Criando..." : "Criar Conta"}</Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
