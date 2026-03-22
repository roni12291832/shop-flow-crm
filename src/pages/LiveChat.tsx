import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Loader2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

// This is a public route: /livechat
export default function LiveChat() {
  const [tenantInfo, setTenantInfo] = useState<{ company_name: string; primary_color: string | null }>({
    company_name: "Atendimento",
    primary_color: "#2563eb"
  });
  
  const [step, setStep] = useState<"form" | "chat">("form");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  
  const [clientId, setClientId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial loaded state (tenant settings can be implemented in a future single-settings table here)
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Listen for agent/AI replies
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`livechat-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const newMsg = payload.new;
        // Only add if it's not from us (to avoid duplicate from our local state)
        if (newMsg.sender_type !== "client") {
          setMessages(prev => [...prev, newMsg]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  const startChat = async () => {
    if (!name || !phone) return;
    setLoading(true);
    
    // 1. Find or create client
    let foundClientId = "";
    const { data: existingClient } = await supabase.from("clients").select("id").eq("phone", phone).maybeSingle();
    
    if (existingClient) {
      foundClientId = existingClient.id;
    } else {
      const { data: newClient } = await supabase.from("clients").insert({
                name,
        phone,
        origin: "site"
      }).select("id").single();
      if (newClient) foundClientId = newClient.id;
    }

    setClientId(foundClientId);

    // 2. Find open conversation or create new
    const { data: openConv } = await supabase.from("conversations")
      .select("id")
      
      .eq("client_id", foundClientId)
      .neq("status", "finalizada")
      .maybeSingle();

    let convId = "";
    if (openConv) {
      convId = openConv.id;
    } else {
      const { data: newConv } = await supabase.from("conversations").insert({
                client_id: foundClientId,
        status: "aberta"
      }).select("id").single();
      if (newConv) convId = newConv.id;
    }

    setConversationId(convId);
    
    // Fetch previous messages
    const { data: prevMsgs } = await supabase.from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
      
    if (prevMsgs && prevMsgs.length > 0) {
      setMessages(prevMsgs);
    } else {
      // First welcome message by AI locally
      const welcome = {
        id: "welcome-1",
        content: `Olá ${name}! Em que posso te ajudar hoje?`,
        sender_type: "ia",
        created_at: new Date().toISOString()
      };
      setMessages([welcome]);
      // Actually insert it so backend has it
      await supabase.from("messages").insert({
                conversation_id: convId,
        content: welcome.content,
        sender_type: "ia"
      });
    }

    setStep("chat");
    setLoading(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || !conversationId) return;
    
    const content = input.trim();
    setInput("");
    
    const tempMsg = {
      id: "temp-" + Date.now(),
      content,
      sender_type: "cliente",
      created_at: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, tempMsg]);
    
    await supabase.from("messages").insert({
            conversation_id: conversationId,
      content,
      sender_type: "cliente"
    });
    
    await supabase.from("conversations").update({
      last_message: content,
      last_message_at: new Date().toISOString()
    }).eq("id", conversationId);
  };

  if (!tenantInfo) {
    return <div className="h-screen flex items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-gray-400" /></div>;
  }

  const primaryColor = tenantInfo.primary_color || "#2563eb";

  return (
    <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white shadow-2xl relative">
      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-3 text-white shadow-md z-10" style={{ backgroundColor: primaryColor }}>
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0 border border-white/20">
          <Bot className="h-6 w-6 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-base leading-tight">Atendimento Inteligente</h3>
          <p className="text-white/80 text-xs">{tenantInfo.company_name}</p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative bg-[#f0f2f5]">
        {step === "form" ? (
          <div className="p-6 h-full flex items-center justify-center pb-24">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm">
              <div className="text-center mb-6">
                <MessageSquare className="h-10 w-10 mx-auto mb-3 text-gray-400" />
                <h2 className="text-lg font-bold text-gray-900">Iniciar Conversa</h2>
                <p className="text-sm text-gray-500 mt-1">Prencha seus dados para começarmos</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-700 uppercase mb-1 block">Seu Nome</label>
                  <Input placeholder="Como podemos te chamar?" value={name} onChange={e => setName(e.target.value)} className="bg-gray-50 border-gray-200" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 uppercase mb-1 block">Seu WhatsApp</label>
                  <Input placeholder="(00) 00000-0000" value={phone} onChange={e => setPhone(e.target.value)} className="bg-gray-50 border-gray-200" />
                </div>
                <Button 
                  className="w-full mt-2 font-semibold shadow-md" 
                  style={{ backgroundColor: primaryColor }} 
                  onClick={startChat}
                  disabled={!name || !phone || loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Começar Agora"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, i) => {
                const isClient = msg.sender_type === "cliente";
                return (
                  <div key={msg.id || i} className={cn("flex", isClient ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2 text-[14px] leading-relaxed relative shadow-sm",
                      isClient
                        ? "text-white rounded-br-sm"
                        : "bg-white text-gray-800 border border-gray-100 rounded-bl-sm"
                    )} style={isClient ? { backgroundColor: primaryColor } : {}}>
                      {msg.content}
                      <p className={cn(
                        "text-[10px] mt-1 text-right",
                        isClient ? "text-white/70" : "text-gray-400"
                      )}>
                        {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-white border-t border-gray-200 px-4 py-3 flex gap-2">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
                placeholder="Digite sua mensagem..."
                className="rounded-full bg-gray-50 border-gray-200 text-[14px] px-4"
              />
              <Button
                size="icon"
                onClick={sendMessage}
                disabled={!input.trim()}
                className="shrink-0 rounded-full h-10 w-10 shadow-md"
                style={{ backgroundColor: primaryColor }}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
      
      {/* Powered by */}
      <div className="absolute bottom-2 left-0 right-0 text-center text-[10px] font-medium text-gray-400">
        ⚡ Powered by Shop Flow CRM
      </div>
    </div>
  );
}
