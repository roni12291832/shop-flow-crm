import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, X, Send, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export function AiAssistant() {
  const {  user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  // Add welcome message on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: "assistant",
        content: `Olá ${profile?.name?.split(" ")[0] || ""}! 👋\n\nSou o **Jarvis**, seu assistente inteligente do CRM.\n\nPosso te ajudar com:\n• Análise de vendas e métricas\n• Informações sobre clientes\n• Status do pipeline\n• Situação do estoque\n• Sugestões para o negócio\n\nO que você gostaria de saber?`,
        timestamp: new Date(),
      }]);
    }
  }, [open]);

  const gatherCrmContext = async () => {

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const today = now.toISOString().split("T")[0];

    const [
      clientsRes, oppsRes, salesRes, tasksRes, productsRes, npsRes
    ] = await Promise.all([
      // count via head:true é muito mais rápido que count:"exact" (não carrega dados)
      supabase.from("clients").select("id, name, origin, last_purchase, ticket_medio, created_at", { count: "exact", head: false }).limit(50),
      supabase.from("opportunities").select("id, stage, estimated_value, title, created_at").limit(200),
      supabase.from("sales_entries").select("id, value, payment_method, status, sold_at, user_id")
        .eq("status", "confirmado").gte("sold_at", startOfMonth).limit(200),
      supabase.from("tasks").select("id, title, status, due_date, priority")
        .eq("status", "pendente").order("due_date", { ascending: true }).limit(10),
      supabase.from("products").select("id, name, current_stock, min_stock, sell_price, category")
        .eq("active", true).limit(100),
      supabase.from("nps_surveys").select("score, category, created_at")
        .eq("status", "responded").order("created_at", { ascending: false }).limit(20),
    ]);

    const clients = clientsRes.data || [];
    const opps = oppsRes.data || [];
    const sales = salesRes.data || [];
    const tasks = tasksRes.data || [];
    const products = productsRes.data || [];
    const nps = npsRes.data || [];

    const totalClients = clientsRes.count || clients.length;
    const totalRevenue = sales.reduce((s, e) => s + Number(e.value || 0), 0);
    const avgTicket = sales.length > 0 ? totalRevenue / sales.length : 0;

    // Pipeline breakdown
    const stageCounts: Record<string, number> = {};
    opps.forEach(o => { stageCounts[o.stage] = (stageCounts[o.stage] || 0) + 1; });

    // Low stock products
    const lowStock = products.filter(p => p.current_stock <= p.min_stock);

    // NPS score
    const avgNps = nps.length > 0 ? (nps.reduce((s, n) => s + (n.score || 0), 0) / nps.length).toFixed(1) : "N/A";

    // Overdue tasks
    const overdue = tasks.filter(t => t.due_date && t.due_date < today);

    return `
DADOS DO CRM (${new Date().toLocaleDateString("pt-BR")}):

📊 RESUMO:
- Total de clientes: ${totalClients}
- Vendas este mês: ${sales.length} (R$ ${totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})
- Ticket médio: R$ ${avgTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- NPS médio: ${avgNps}

🔄 PIPELINE:
${Object.entries(stageCounts).map(([stage, count]) => `- ${stage}: ${count}`).join("\n") || "- Nenhuma oportunidade"}

📋 TAREFAS PENDENTES: ${tasks.length}
${overdue.length > 0 ? `⚠️ ${overdue.length} tarefas atrasadas!` : "✅ Nenhuma tarefa atrasada"}
${tasks.slice(0, 5).map(t => `- ${t.title} (${t.priority}) - ${t.due_date || "sem prazo"}`).join("\n")}

📦 ESTOQUE:
- Total produtos ativos: ${products.length}
${lowStock.length > 0 ? `⚠️ ${lowStock.length} produtos com estoque baixo:\n${lowStock.map(p => `  - ${p.name}: ${p.current_stock}/${p.min_stock}`).join("\n")}` : "✅ Todos os produtos com estoque adequado"}

👥 CLIENTES RECENTES:
${clients.slice(0, 5).map(c => `- ${c.name} (${c.origin || "sem origem"})${c.last_purchase ? ` - última compra: ${new Date(c.last_purchase).toLocaleDateString("pt-BR")}` : ""}`).join("\n")}
    `.trim();
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: "user", content: input.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Gather CRM context
      const crmContext = await gatherCrmContext();

      // Build conversation history for the AI
      const conversationMessages = messages
        .slice(-6)
        .map(m => ({ role: m.role, content: m.content }));
      conversationMessages.push({ role: "user", content: userMsg.content });

      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/jarvis/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversationMessages,
          crmContext,
          userName: profile?.name || "Usuário",
        }),
      });

      if (!response.ok) throw new Error("Falha na comunicação com o Jarvis");

      const data = await response.json();

      const assistantMsg: Message = {
        role: "assistant",
        content: data?.response || "Desculpe, não consegui processar sua pergunta. Tente novamente.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error("AI Assistant error:", err);
      const errorMsg: Message = {
        role: "assistant",
        content: "⚠️ Desculpe, ocorreu um erro ao processar sua mensagem. Verifique se a Edge Function `ai-assistant` está configurada no Supabase.\n\nPara configurar:\n1. Crie uma Edge Function `ai-assistant` no Supabase\n2. Configure sua API key de IA como secret\n3. O assistente estará pronto para uso!",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    }

    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Format markdown-like content to simple HTML
  const formatMessage = (content: string) => {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-6 right-6 z-[100] w-14 h-14 rounded-full shadow-lg transition-all duration-300 flex items-center justify-center group",
          open
            ? "bg-card border border-border text-muted-foreground hover:text-foreground"
            : "gradient-primary text-white hover:scale-110 shadow-glow"
        )}
        style={!open ? { animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" } : undefined}
      >
        {open ? (
          <X className="h-5 w-5" />
        ) : (
          <Sparkles className="h-6 w-6" />
        )}
      </button>

      {/* Chat Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-[99] w-[380px] max-w-[calc(100vw-48px)] h-[520px] max-h-[calc(100vh-140px)] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="gradient-primary px-5 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Jarvis AI</h3>
              <p className="text-white/70 text-[11px]">Assistente inteligente do CRM</p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-white/60 text-[10px]">Online</span>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-secondary text-foreground rounded-bl-sm"
                )}>
                  <div dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
                  <p className={cn(
                    "text-[10px] mt-1",
                    msg.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground"
                  )}>
                    {msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-secondary rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-[13px] text-muted-foreground">Analisando...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border px-3 py-3 flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte ao Jarvis..."
              className="text-[13px] border-border"
              disabled={loading}
            />
            <Button
              size="icon"
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="shrink-0 h-9 w-9"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
