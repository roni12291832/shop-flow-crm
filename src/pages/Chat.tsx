import { useEffect, useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Bot, Send, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STATUS_COLORS: Record<string, string> = {
  aberta: "hsl(var(--chart-1))",
  em_atendimento: "hsl(var(--chart-2))",
  aguardando: "hsl(var(--chart-3))",
  finalizada: "hsl(var(--muted-foreground))",
};

const STAGES = [
  { value: "lead_novo", label: "Lead Novo" },
  { value: "contato_iniciado", label: "Contato Iniciado" },
  { value: "interessado", label: "Interessado" },
  { value: "comprador", label: "Comprador" },
  { value: "perdido", label: "Perdido" },
  { value: "desqualificado", label: "Desqualificado" },
];

interface Conversation {
  id: string;
  client_id: string | null;
  responsible_id: string | null;
  status: string;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
  client_name?: string;
}

interface Message {
  id: string;
  conversation_id: string;
  content: string;
  sender_type: string;
  sender_id: string | null;
  created_at: string;
}

interface Client {
  id: string;
  name: string;
  phone: string | null;
  ticket_medio: number | null;
  origin: string | null;
}

export default function Chat() {
  const {  user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [clientOpp, setClientOpp] = useState<{ id: string, stage: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [newConvClientId, setNewConvClientId] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = async () => {
        const { data: convs } = await supabase
      .from("conversations")
      .select("*")
      
      .order("last_message_at", { ascending: false });

    const { data: clientsData } = await supabase
      .from("clients")
      .select("id, name, phone, ticket_medio, origin")
      ;

    const { data: profilesData } = await supabase
      .from("profiles")
      .select("user_id, name")
      ;

    const pMap: Record<string, string> = {};
    (profilesData || []).forEach((p: any) => { pMap[p.user_id] = p.name; });
    setProfileMap(pMap);

    const clientMap: Record<string, string> = {};
    (clientsData || []).forEach((c: any) => { clientMap[c.id] = c.name; });
    setClients((clientsData || []) as Client[]);

    const mapped = (convs || []).map((c: any) => ({
      ...c,
      client_name: c.client_id ? clientMap[c.client_id] || "Cliente" : "Sem cliente",
    }));
    setConversations(mapped);

    if (!activeConvId && mapped.length > 0) {
      setActiveConvId(mapped[0].id);
    }
  };

  const fetchMessages = async (convId: string) => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    setMessages((data || []) as Message[]);
    
    // Also fetch the client's latest opportunity if they exist
    const conv = conversations.find(c => c.id === convId);
    if (conv?.client_id) {
      const { data: opps } = await supabase
        .from("opportunities")
        .select("id, stage")
        
        .eq("client_id", conv.client_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      setClientOpp(opps || null);
    } else {
      setClientOpp(null);
    }
  };

  useEffect(() => { fetchConversations(); }, []);
  useEffect(() => { if (activeConvId) fetchMessages(activeConvId); }, [activeConvId, conversations.length]);

  // Realtime subscriptions
  useEffect(() => {
        const channel = supabase
      .channel("chat-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        fetchConversations();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const newMsg = payload.new as Message;
        if (newMsg.conversation_id === activeConvId) {
          setMessages(prev => [...prev, newMsg]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!msg.trim() || !activeConvId || !user) return;
    const content = msg.trim();
    setMsg("");

    await supabase.from("messages").insert({
      conversation_id: activeConvId,
            content,
      sender_type: "atendente" as any,
      sender_id: user.id,
    });

    await supabase.from("conversations").update({
      last_message: content,
      last_message_at: new Date().toISOString(),
      status: "em_atendimento" as any,
    }).eq("id", activeConvId);

    // Fetch WhatsApp config directly from DB instead of using N8N Webhooks
    const { data: wpConfig } = await supabase
      .from("whatsapp_instances")
      .select("api_url, api_token, instance_name, status")
      
      .maybeSingle();

    if (activeClient && wpConfig && wpConfig.status === "connected") {
      try {
        if (aiMode) {
          toast.info("A IA assumirá a resposta em breve (Funct. não atrelada ainda)");
        } else {
          const phoneDigits = activeClient.phone?.replace(/\D/g, "") || "";
          const formattedPhone = phoneDigits.startsWith("55") ? phoneDigits : `55${phoneDigits}`;

          const res = await fetch(`${wpConfig.api_url}/message/sendText/${wpConfig.instance_name}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": wpConfig.api_token
            },
            body: JSON.stringify({
              number: `${formattedPhone}@s.whatsapp.net`,
              text: content
            })
          });
          
          if (!res.ok) {
            console.error("Failed to send to UZAPI", await res.text());
            toast.error("Erro ao enviar mensagem para a API do WhatsApp (Verifique o log)");
          }
        }
      } catch (e) {
        console.error("Failed to trigger WhatsApp API", e);
        toast.error("Falha de conexão com a API do WhatsApp");
      }
    } else if (activeClient && (!wpConfig || wpConfig.status !== "connected")) {
      toast.warning("WhatsApp não está conectado. Mensagem salva apenas no CRM.");
    }
  };

  const createConversation = async () => {
    if (!user || !newConvClientId) return;
    const { error } = await supabase.from("conversations").insert({
            client_id: newConvClientId,
      responsible_id: user.id,
      status: "aberta" as any,
    });
    if (error) toast.error("Erro ao criar conversa");
    else {
      toast.success("Conversa criada!");
      setNewConvOpen(false);
      setNewConvClientId("");
      fetchConversations();
    }
  };

  const handleStageChange = async (newStage: string) => {
    if (!activeClient || !user) return;
    
    if (clientOpp) {
      // Update existing
      const { error } = await supabase.from("opportunities").update({ stage: newStage as any }).eq("id", clientOpp.id);
      if (error) toast.error("Erro ao atualizar etapa.");
      else {
        toast.success("Etapa CRM atualizada!");
        setClientOpp({ ...clientOpp, stage: newStage });
      }
    } else {
      // Create new
      const { data, error } = await supabase.from("opportunities").insert({
                client_id: activeClient.id,
        title: `Oportunidade - ${activeClient.name}`,
        stage: newStage as any,
        responsible_id: user.id,
      }).select("id, stage").single();
      
      if (error) toast.error("Erro ao criar oportunidade.");
      else {
        toast.success("Oportunidade criada no CRM!");
        setClientOpp(data);
      }
    }
  };

  const deleteConversation = async () => {
    if (!activeConvId) return;
    if (confirm("Tem certeza que deseja apagar essa conversa?")) {
      await supabase.from("messages").delete().eq("conversation_id", activeConvId);
      const { error } = await supabase.from("conversations").delete().eq("id", activeConvId);
      if (error) {
        toast.error("Erro ao apagar conversa.");
        return;
      }
      setActiveConvId(null);
      fetchConversations();
      toast.success("Conversa apagada");
    }
  };

  const activeConv = conversations.find(c => c.id === activeConvId);
  const activeClient = clients.find(c => c.id === activeConv?.client_id);
  const filtered = conversations.filter(c =>
    c.client_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatTime = (date: string | null) => {
    if (!date) return "";
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "agora";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  };

  return (
    <div className="flex h-[calc(100vh-60px)] animate-fade-in">
      {/* Sidebar conversas */}
      <div className="w-[280px] border-r border-border flex flex-col bg-card">
        <div className="p-4 border-b border-border flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-10 bg-background border-border text-[13px]" placeholder="Buscar conversa..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <Dialog open={newConvOpen} onOpenChange={setNewConvOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="outline" className="shrink-0"><Plus className="h-4 w-4" /></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova Conversa</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select value={newConvClientId} onValueChange={setNewConvClientId}>
                    <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button onClick={createConversation} className="w-full" disabled={!newConvClientId}>Iniciar Conversa</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Nenhuma conversa</div>
          ) : filtered.map((c) => {
            const color = STATUS_COLORS[c.status] || STATUS_COLORS.finalizada;
            const isActive = c.id === activeConvId;
            return (
              <div key={c.id} onClick={() => setActiveConvId(c.id)}
                className={`px-4 py-3.5 cursor-pointer flex items-center gap-2.5 border-b border-border/20 transition-colors ${isActive ? "bg-border/60" : "hover:bg-border/30"}`}>
                <div className="w-[38px] h-[38px] rounded-full gradient-primary flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                  {c.client_name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2) || "??"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between">
                    <span className="text-foreground font-semibold text-[13px]">{c.client_name}</span>
                    <span className="text-muted-foreground text-[11px]">{formatTime(c.last_message_at)}</span>
                  </div>
                  <div className="text-muted-foreground text-[12px] truncate">{c.last_message || "Nova conversa"}</div>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: color + "22", color }}>{c.status?.replace("_", " ")}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat */}
      {activeConv ? (
        <div className="flex-1 flex flex-col">
          <div className="px-5 py-3.5 border-b border-border flex justify-between items-center bg-card">
            <div>
              <div className="text-foreground font-bold">{activeConv.client_name}</div>
              <div className="text-muted-foreground text-[12px]">{activeConv.status?.replace("_", " ")}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={deleteConversation} title="Apagar Conversa">
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button variant={aiMode ? "default" : "outline"} size="sm" className="gap-1.5 text-[12px]" onClick={() => setAiMode(!aiMode)}>
                <Bot className="h-4 w-4" /> {aiMode ? "IA Ativa" : "Ativar IA"}
              </Button>
            </div>
          </div>

          <div className="flex-1 p-5 overflow-y-auto flex flex-col gap-3">
            {aiMode && (
              <div className="bg-primary/10 border border-primary/30 rounded-[10px] px-3.5 py-2.5 text-primary text-[12px] text-center">
                🤖 IA assumiu a conversa — respondendo automaticamente via N8N
              </div>
            )}
            {messages.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Nenhuma mensagem ainda. Envie a primeira!
              </div>
            )}
            {messages.map((m) => {
              const isAgent = m.sender_type === "atendente" || m.sender_type === "ia";
              const senderName = isAgent && m.sender_id ? profileMap[m.sender_id] : null;
              return (
                <div key={m.id} className={isAgent ? "self-end" : "self-start"}>
                  <div className={`rounded-xl px-3.5 py-2.5 max-w-[70%] ${isAgent ? "bg-primary rounded-br-md" : "bg-border rounded-bl-md"}`}>
                    {isAgent && senderName && (
                      <div className={`text-[10px] font-semibold mb-0.5 ${isAgent ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                        {m.sender_type === "ia" ? "🤖 IA" : senderName}
                      </div>
                    )}
                    <span className={`text-[13px] ${isAgent ? "text-primary-foreground" : "text-foreground"}`}>{m.content}</span>
                    <div className={`text-[10px] mt-1 ${isAgent ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                      {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {isAgent && " ✓✓"}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="px-4 py-3.5 border-t border-border flex gap-2.5 items-center bg-card">
            <Input className="flex-1 bg-background border-border text-[13px]" placeholder="Digite uma mensagem..."
              value={msg} onChange={e => setMsg(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") sendMessage(); }} />
            <Button size="sm" className="gap-1.5" onClick={sendMessage}><Send className="h-4 w-4" /></Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Selecione ou crie uma conversa para começar
        </div>
      )}

      {/* Client info panel */}
      {activeConv && activeClient && (
        <div className="w-[220px] border-l border-border p-4 overflow-y-auto bg-card">
          <div className="text-center mb-4">
            <div className="w-[52px] h-[52px] rounded-full gradient-primary mx-auto mb-2 flex items-center justify-center text-white font-bold">
              {activeClient.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>
            <div className="text-foreground font-bold text-sm">{activeClient.name}</div>
          </div>
          {[
            ["Telefone", activeClient.phone || "—"],
            ["Ticket Médio", `R$ ${(activeClient.ticket_medio || 0).toLocaleString("pt-BR")}`],
            ["Origem", activeClient.origin || "—"],
          ].map(([k, v]) => (
            <div key={k} className="mb-3">
              <div className="text-muted-foreground text-[11px] uppercase tracking-wider mb-0.5">{k}</div>
              <div className="text-foreground text-[13px] font-semibold">{v}</div>
            </div>
          ))}

          <div className="mt-4 mb-3 border-t border-border pt-4">
            <div className="text-muted-foreground text-[11px] uppercase tracking-wider mb-1">Etapa no CRM</div>
            <Select value={clientOpp?.stage || ""} onValueChange={handleStageChange}>
              <SelectTrigger className="h-8 text-xs bg-sidebar text-foreground border-border/60">
                <SelectValue placeholder="Selecione a etapa" />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map(s => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" size="sm" className="w-full mt-2 text-[12px] border-primary/40 text-primary hover:bg-primary/10">+ Criar Tarefa</Button>
          <Button variant="outline" size="sm" className="w-full mt-2 text-[12px] border-accent/40 text-accent hover:bg-accent/10">+ Criar Oportunidade</Button>
        </div>
      )}
    </div>
  );
}
