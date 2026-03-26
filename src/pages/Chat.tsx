import { useEffect, useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Bot, Send, Plus, Trash2, WifiOff, Wifi, Phone, User, ArrowLeft, Paperclip, MapPin, Image, FileText, MoreVertical, Loader2 } from "lucide-react";
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
import { useIsMobile } from "@/hooks/use-mobile";

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
const PYTHON_BACKEND_URL = "https://artificial-vivian-ggenciaglobalnexus-d093d570.koyeb.app";

// ---------- Tipos ----------
interface WpInstance {
  api_url: string;
  api_token: string;
  instance_name: string;
  instance_token: string | null;
  status: string;
}

interface WaChat {
  id: string;
  phone: string;
  name: string;
  last_message: string;
  last_message_at: number | string | null;
  unread_count: number;
  is_group: boolean;
  crm_client_id?: string | null;
}

interface WaMessage {
  id: string;
  from_me: boolean;
  text: string;
  timestamp: number | string | null;
  type?: string;
  source?: string;
  sender_type?: string;
  media_url?: string;
  mimetype?: string;
}

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

// ---------- Helpers ----------
function normalizeChat(raw: any): WaChat {
  // UAZAPI GO V2: JID real está em wa_chatid, não em id (que é ID interno)
  const jid = raw.wa_chatid || raw.remoteJid || raw.jid || "";
  const rawPhone = raw.phone || "";
  const phone = jid
    ? jid.replace("@s.whatsapp.net", "").replace("@c.us", "").replace("@g.us", "")
    : rawPhone.replace(/\D/g, "");
  return {
    id: jid,
    phone,
    name: raw.name || raw.wa_contactName || raw.wa_name || `WhatsApp ${phone.slice(-4)}`,
    last_message: raw.wa_lastMessageType || "",
    last_message_at: raw.wa_lastMsgTimestamp || null,
    unread_count: raw.wa_unreadCount || 0,
    is_group: raw.wa_isGroup === true,
  };
}

function normalizeMessage(raw: any): WaMessage {
  // UAZAPI GO V2: campos diretos no objeto
  const text =
    raw.text ||
    raw.body ||
    raw.message?.conversation ||
    raw.message?.extendedTextMessage?.text ||
    raw.message?.imageMessage?.caption ||
    raw.message?.videoMessage?.caption ||
    "";

  return {
    id: raw.messageid || raw.id || raw.key?.id || Math.random().toString(36),
    from_me: raw.fromMe ?? raw.key?.fromMe ?? false,
    text,
    timestamp: raw.messageid?.endsWith("crm") ? raw.timestamp : (raw.messageTimestamp || raw.t || raw.timestamp),
    type: raw.messageType || (raw.message?.imageMessage ? "image" : raw.message?.videoMessage ? "video" : raw.message?.audioMessage ? "audio" : raw.message?.documentMessage ? "document" : "text"),
    source: "whatsapp",
    media_url: raw.message?.imageMessage?.url || raw.message?.videoMessage?.url || raw.message?.audioMessage?.url || raw.message?.documentMessage?.url,
    mimetype: raw.message?.imageMessage?.mimetype || raw.message?.videoMessage?.mimetype || raw.message?.audioMessage?.mimetype || raw.message?.documentMessage?.mimetype,
  };
}

async function fetchUazapi(url: string, token: string, method = "GET", body?: any) {
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "token": token,
  };
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ========== COMPONENT ==========
export default function Chat() {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  // WhatsApp instance config
  const [wpConfig, setWpConfig] = useState<WpInstance | null>(null);
  const [wpConnected, setWpConnected] = useState<boolean | null>(null);

  // WhatsApp conversations (from UAZAPI)
  const [waChats, setWaChats] = useState<WaChat[]>([]);
  const [waMessages, setWaMessages] = useState<WaMessage[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // CRM data
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [clientOpp, setClientOpp] = useState<{ id: string; stage: string } | null>(null);

  // UI state
  const [msg, setMsg] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [newConvClientId, setNewConvClientId] = useState("");
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ---------- Load WhatsApp config ----------
  useEffect(() => {
    supabase
      .from("whatsapp_instances")
      .select("api_url, api_token, instance_name, instance_token, status")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setWpConfig(data as WpInstance);
          setWpConnected(data.status === "connected");
        } else {
          setWpConnected(false);
        }
      });
  }, []);

  // ---------- Fetch WhatsApp chats from UAZAPI ----------
  const fetchWhatsAppChats = useCallback(async () => {
    if (!wpConfig) { setChatError("wpConfig não carregado do banco"); return; }
    if (wpConfig.status !== "connected") { setChatError(`Status da instância: "${wpConfig.status}" (precisa ser "connected")`); return; }

    const token = wpConfig.instance_token || wpConfig.api_token;
    if (!token) { setChatError("Token não encontrado no banco de dados"); return; }

    setLoadingChats(true);
    setChatError(null);

    try {
      const url = `${wpConfig.api_url.replace(/\/$/, "")}/chat/find`;
      console.log("[WA] POST", url, "token:", token.slice(0, 8) + "...");
      const data = await fetchUazapi(url, token, "POST", { limit: 50 });
      console.log("[WA] chat/find response:", data);

      const rawChats = Array.isArray(data) ? data : (data.chats || data.data || data.result || []);

      if (rawChats.length === 0) {
        setChatError(`API retornou 0 conversas. Resposta: ${JSON.stringify(data).slice(0, 200)}`);
      }

      const normalized: WaChat[] = rawChats
        .map(normalizeChat)
        .filter((c: WaChat) => !c.is_group && c.phone.length >= 10);

      // Enrich with CRM client names
      const phones = normalized.map(c => c.phone);
      if (phones.length > 0) {
        const { data: crmClients } = await supabase
          .from("clients")
          .select("id, phone, name")
          .in("phone", phones);

        const crmMap: Record<string, { id: string; name: string }> = {};
        (crmClients || []).forEach(c => { crmMap[c.phone] = { id: c.id, name: c.name }; });

        normalized.forEach(chat => {
          const crm = crmMap[chat.phone];
          if (crm) {
            chat.name = crm.name;
            chat.crm_client_id = crm.id;
          }
        });
      }

      // Sort by last_message_at descending
      normalized.sort((a, b) => {
        const ta = typeof a.last_message_at === "number" ? a.last_message_at : 0;
        const tb = typeof b.last_message_at === "number" ? b.last_message_at : 0;
        return tb - ta;
      });

      setWaChats(normalized);
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.error("Erro ao buscar chats UAZAPI:", e);
      setChatError(`Erro ao chamar UAZAPI: ${msg}. URL: ${wpConfig.api_url}/chat/find`);
    }
    setLoadingChats(false);
  }, [wpConfig]);

  // ---------- Fetch CRM conversations (fallback) ----------
  const fetchCrmConversations = useCallback(async () => {
    const { data: convs } = await supabase
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false });

    const { data: clientsData } = await supabase
      .from("clients")
      .select("id, name, phone, ticket_medio, origin");

    const { data: profilesData } = await supabase
      .from("profiles")
      .select("user_id, name");

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
  }, []);

  // ---------- Initial load ----------
  useEffect(() => {
    fetchCrmConversations();
  }, [fetchCrmConversations]);

  useEffect(() => {
    if (wpConnected) {
      fetchWhatsAppChats();
      // Refresh every 30s
      const interval = setInterval(fetchWhatsAppChats, 30000);
      return () => clearInterval(interval);
    }
  }, [wpConnected, fetchWhatsAppChats]);

  // ---------- Fetch messages for selected WhatsApp chat ----------
  const fetchWhatsAppMessages = useCallback(async (chatId: string) => {
    if (!wpConfig) return;
    const token = wpConfig.instance_token || wpConfig.api_token;
    const fullJid = chatId.includes("@") ? chatId : `${chatId}@s.whatsapp.net`;

    try {
      const url = `${wpConfig.api_url.replace(/\/$/, "")}/message/find`;
      const data = await fetchUazapi(url, token, "POST", { chatid: fullJid, limit: 50 });

      const rawMsgs = Array.isArray(data) ? data : (data.messages || data.data || []);
      const normalized = rawMsgs.map(normalizeMessage).filter((m: WaMessage) => m.text);

      // Also fetch CRM messages for this contact
      const phone = fullJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
      const { data: clientData } = await supabase
        .from("clients")
        .select("id")
        .eq("phone", phone)
        .limit(1)
        .maybeSingle();

      let crmMsgs: WaMessage[] = [];
      if (clientData) {
        const { data: dbMsgs } = await supabase
          .from("messages")
          .select("id, content, is_from_client, created_at, sender_type")
          .eq("client_id", clientData.id)
          .order("created_at", { ascending: true })
          .limit(50);

        crmMsgs = (dbMsgs || []).map(m => ({
          id: `crm-${m.id}`,
          from_me: !m.is_from_client,
          text: m.content || "",
          timestamp: m.created_at,
          source: "crm",
          sender_type: m.sender_type,
        }));

        // Also load opportunity
        const { data: opp } = await supabase
          .from("opportunities")
          .select("id, stage")
          .eq("client_id", clientData.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setClientOpp(opp || null);
      } else {
        setClientOpp(null);
      }

      // Merge and deduplicate: prefer WhatsApp messages, add CRM-only messages
      const waIds = new Set(normalized.map((m: WaMessage) => m.id));
      const merged = [...normalized, ...crmMsgs.filter(m => !waIds.has(m.id))];

      // Sort by timestamp
      merged.sort((a, b) => {
        const ta = typeof a.timestamp === "number" ? a.timestamp :
          typeof a.timestamp === "string" ? new Date(a.timestamp).getTime() / 1000 : 0;
        const tb = typeof b.timestamp === "number" ? b.timestamp :
          typeof b.timestamp === "string" ? new Date(b.timestamp).getTime() / 1000 : 0;
        return ta - tb;
      });

      setWaMessages(merged);
    } catch (e) {
      console.error("Erro ao buscar mensagens:", e);
      setWaMessages([]);
    }
  }, [wpConfig]);

  // ---------- Fetch CRM messages ----------
  const fetchCrmMessages = useCallback(async (convId: string) => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    setMessages((data || []) as Message[]);

    const conv = conversations.find(c => c.id === convId);
    if (conv?.client_id) {
      const { data: opp } = await supabase
        .from("opportunities")
        .select("id, stage")
        .eq("client_id", conv.client_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setClientOpp(opp || null);
    }
  }, [conversations]);

  // Load messages when chat changes
  useEffect(() => {
    if (activeChatId) {
      fetchWhatsAppMessages(activeChatId);
    }
  }, [activeChatId, fetchWhatsAppMessages]);

  useEffect(() => {
    if (activeConvId) fetchCrmMessages(activeConvId);
  }, [activeConvId, fetchCrmMessages]);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel("chat-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        fetchCrmConversations();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        // Refresh WhatsApp messages if active chat matches
        if (activeChatId) {
          fetchWhatsAppMessages(activeChatId);
        }
        // Also update CRM messages
        const newMsg = payload.new as Message;
        if (newMsg.conversation_id === activeConvId) {
          setMessages(prev => [...prev, newMsg]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeChatId, activeConvId, fetchCrmConversations, fetchWhatsAppMessages]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [waMessages, messages]);

  // ---------- Send message via UAZAPI ----------
  const sendWhatsAppMessage = async () => {
    if (!msg.trim() || !activeChatId || !wpConfig) return;
    const content = msg.trim();
    setMsg("");

    const token = wpConfig.instance_token || wpConfig.api_token;
    const phone = activeChatId.replace("@s.whatsapp.net", "").replace("@c.us", "");
    const formattedPhone = phone.startsWith("55") ? phone : `55${phone}`;

    try {
      const sendUrl = `${wpConfig.api_url.replace(/\/$/, "")}/send/text`;
      await fetchUazapi(sendUrl, token, "POST", {
        number: formattedPhone,
        text: content,
      });

      // Add to local state immediately
      setWaMessages(prev => [...prev, {
        id: `local-${Date.now()}`,
        from_me: true,
        text: content,
        timestamp: Math.floor(Date.now() / 1000),
        source: "local",
      }]);

      // Save to Supabase if client exists
      const activeChat = waChats.find(c => c.id === activeChatId);
      if (activeChat?.crm_client_id) {
        // Find or create conversation
        const { data: convData } = await supabase
          .from("conversations")
          .select("id")
          .eq("client_id", activeChat.crm_client_id)
          .in("status", ["aberta", "em_atendimento", "aguardando"] as any)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const convId = convData?.id;

        if (convId) {
          await supabase.from("messages").insert({
            conversation_id: convId,
            client_id: activeChat.crm_client_id,
            content,
            sender_type: "atendente" as any,
            sender_id: user?.id,
            channel: "whatsapp" as any,
            is_from_client: false,
          });

          await supabase.from("conversations").update({
            last_message: content,
            last_message_at: new Date().toISOString(),
            status: "em_atendimento" as any,
          }).eq("id", convId);
        }
      }
    } catch (e) {
      console.error("Erro ao enviar:", e);
      toast.error("Erro ao enviar mensagem");
    }
  };

  // ---------- Send CRM-only message ----------
  const sendCrmMessage = async () => {
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

    // Send via WhatsApp if connected
    const activeConv = conversations.find(c => c.id === activeConvId);
    const activeClient = clients.find(c => c.id === activeConv?.client_id);

    if (activeClient?.phone && wpConfig && wpConfig.status === "connected") {
      try {
        const token = wpConfig.instance_token || wpConfig.api_token;
        const phone = activeClient.phone.replace(/\D/g, "");
        const formattedPhone = phone.startsWith("55") ? phone : `55${phone}`;
        const sendUrl = `${wpConfig.api_url.replace(/\/$/, "")}/send/text`;

        await fetchUazapi(sendUrl, token, "POST", {
          number: formattedPhone,
          text: content,
        });
      } catch (e) {
        console.error("WhatsApp send failed:", e);
        toast.warning("Mensagem salva no CRM, mas falhou no WhatsApp");
      }
    }
  };
  
  const sendMediaWhatsApp = async (file: File) => {
    if (!activeChatId || !wpConfig) return;
    setIsUploading(true);
    
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      const type = file.type.startsWith("image/") ? "image" : 
                   file.type.startsWith("video/") ? "video" : 
                   file.type.startsWith("audio/") ? "audio" : "document";
      
      try {
        const phone = activeChatId.replace(/\D/g, "");
        const formattedPhone = phone.startsWith("55") ? phone : `55${phone}`;
        
        const res = await fetch(`${PYTHON_BACKEND_URL}/whatsapp/conversations/send-media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instance_token: wpConfig.instance_token || wpConfig.api_token,
            phone: formattedPhone,
            media_type: type,
            media_base64: base64,
            caption: file.name
          })
        });
        
        if (!res.ok) throw new Error("Erro no backend");
        
        toast.success("Mídia enviada!");
        fetchWhatsAppMessages(activeChatId);
      } catch (e) {
        console.error("Erro ao enviar mídia:", e);
        toast.error("Erro ao enviar mídia");
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };
  
  const sendLocationWhatsApp = () => {
    if (!activeChatId || !wpConfig) return;
    
    if (!navigator.geolocation) {
      toast.error("Geolocalização não suportada no seu navegador");
      return;
    }
    
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const phone = activeChatId.replace(/\D/g, "");
        const formattedPhone = phone.startsWith("55") ? phone : `55${phone}`;
        
        const res = await fetch(`${PYTHON_BACKEND_URL}/whatsapp/conversations/send-location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instance_token: wpConfig.instance_token || wpConfig.api_token,
            phone: formattedPhone,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            address: "Minha Localização"
          })
        });
        
        if (!res.ok) throw new Error("Erro no backend");
        
        toast.success("Localização enviada!");
        fetchWhatsAppMessages(activeChatId);
      } catch (e) {
        toast.error("Erro ao enviar localização");
      }
    });
  };
  
  const deleteWhatsAppMessage = async (messageId: string) => {
    if (!activeChatId || !wpConfig) return;
    if (!confirm("Apagar mensagem para TODOS?")) return;
    
    try {
      const res = await fetch(`${PYTHON_BACKEND_URL}/whatsapp/messages/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instance_token: wpConfig.instance_token || wpConfig.api_token,
          message_id: messageId,
          phone: activeChatId,
          all: true
        })
      });
      
      if (!res.ok) throw new Error("Erro ao apagar");
      
      toast.success("Mensagem apagada!");
      setWaMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (e) {
      toast.error("Erro ao apagar mensagem");
    }
  };

  const handleSend = () => {
    if (activeChatId) sendWhatsAppMessage();
    else if (activeConvId) sendCrmMessage();
  };

  // ---------- CRM operations ----------
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
      fetchCrmConversations();
    }
  };

  const handleStageChange = async (newStage: string) => {
    const activeChat = waChats.find(c => c.id === activeChatId);
    const clientId = activeChat?.crm_client_id || conversations.find(c => c.id === activeConvId)?.client_id;
    if (!clientId || !user) return;

    if (clientOpp) {
      const { error } = await supabase.from("opportunities").update({ stage: newStage as any }).eq("id", clientOpp.id);
      if (error) toast.error("Erro ao atualizar etapa.");
      else {
        toast.success("Etapa CRM atualizada!");
        setClientOpp({ ...clientOpp, stage: newStage });
      }
    } else {
      const client = clients.find(c => c.id === clientId);
      const { data, error } = await supabase.from("opportunities").insert({
        client_id: clientId,
        title: `Oportunidade - ${client?.name || "Cliente"}`,
        stage: newStage as any,
        responsible_id: user.id,
      }).select("id, stage").single();

      if (error) toast.error("Erro ao criar oportunidade.");
      else {
        toast.success("Oportunidade criada!");
        setClientOpp(data);
      }
    }
  };

  const deleteConversation = async () => {
    if (!activeConvId) return;
    if (!confirm("Apagar esta conversa?")) return;
    await supabase.from("messages").delete().eq("conversation_id", activeConvId);
    await supabase.from("conversations").delete().eq("id", activeConvId);
    setActiveConvId(null);
    fetchCrmConversations();
    toast.success("Conversa apagada");
  };

  // ---------- Computed ----------
  const activeWaChat = waChats.find(c => c.id === activeChatId);
  const activeConv = conversations.find(c => c.id === activeConvId);
  const activeClientFromConv = clients.find(c => c.id === activeConv?.client_id);
  const activeClientFromChat = activeWaChat?.crm_client_id
    ? clients.find(c => c.id === activeWaChat.crm_client_id)
    : null;
  const activeClient = activeClientFromChat || activeClientFromConv;

  const isUsingWhatsApp = !!activeChatId;
  const hasActiveChat = !!activeChatId || !!activeConvId;

  // Filter chats
  const filteredWaChats = waChats.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  const filteredConvs = conversations.filter(c =>
    c.client_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatTime = (ts: number | string | null) => {
    if (!ts) return "";
    const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "agora";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  };

  const formatMsgTime = (ts: number | string | null) => {
    if (!ts) return "";
    const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const selectWaChat = (chatId: string) => {
    setActiveChatId(chatId);
    setActiveConvId(null);
    if (isMobile) setShowMobileChat(true);
  };

  const selectCrmConv = (convId: string) => {
    setActiveConvId(convId);
    setActiveChatId(null);
    if (isMobile) setShowMobileChat(true);
  };

  // ---------- Render ----------
  const chatName = activeWaChat?.name || activeConv?.client_name || "";

  // Sidebar content
  const renderSidebar = () => (
    <div className="flex flex-col h-full bg-card">
      {/* Search + New */}
      <div className="p-3 border-b border-border flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-10 bg-background border-border text-[13px]" placeholder="Buscar..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
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

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {/* WhatsApp chats (real) */}
        {wpConnected && filteredWaChats.length > 0 && (
          <>
            <div className="px-4 py-2 text-[10px] font-bold text-chart-2 uppercase tracking-wider flex items-center gap-1">
              <Wifi className="h-3 w-3" /> WhatsApp ({filteredWaChats.length})
            </div>
            {filteredWaChats.map(chat => {
              const isActive = chat.id === activeChatId;
              return (
                <div key={chat.id} onClick={() => selectWaChat(chat.id)}
                  className={`px-4 py-3 cursor-pointer flex items-center gap-2.5 border-b border-border/20 transition-colors ${isActive ? "bg-chart-2/10" : "hover:bg-border/30"}`}>
                  <div className="w-[38px] h-[38px] rounded-full bg-chart-2/20 flex items-center justify-center text-[11px] font-bold text-chart-2 shrink-0">
                    {chat.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between">
                      <span className="text-foreground font-semibold text-[13px] truncate">{chat.name}</span>
                      <span className="text-muted-foreground text-[11px] shrink-0">{formatTime(chat.last_message_at)}</span>
                    </div>
                    <div className="text-muted-foreground text-[12px] truncate">{chat.last_message || "..."}</div>
                  </div>
                  {chat.unread_count > 0 && (
                    <span className="bg-chart-2 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                      {chat.unread_count}
                    </span>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* CRM conversations (internal) */}
        {filteredConvs.length > 0 && (
          <>
            <div className="px-4 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              CRM ({filteredConvs.length})
            </div>
            {filteredConvs.map(conv => {
              const isActive = conv.id === activeConvId;
              const color = STATUS_COLORS[conv.status] || STATUS_COLORS.finalizada;
              return (
                <div key={conv.id} onClick={() => selectCrmConv(conv.id)}
                  className={`px-4 py-3 cursor-pointer flex items-center gap-2.5 border-b border-border/20 transition-colors ${isActive ? "bg-border/60" : "hover:bg-border/30"}`}>
                  <div className="w-[38px] h-[38px] rounded-full gradient-primary flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                    {conv.client_name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "??"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between">
                      <span className="text-foreground font-semibold text-[13px]">{conv.client_name}</span>
                      <span className="text-muted-foreground text-[11px]">{formatTime(conv.last_message_at)}</span>
                    </div>
                    <div className="text-muted-foreground text-[12px] truncate">{conv.last_message || "Nova conversa"}</div>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: color + "22", color }}>
                      {conv.status?.replace("_", " ")}
                    </span>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {loadingChats && (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando conversas...</div>
        )}

        {chatError && (
          <div className="p-4 mx-3 mt-2 bg-destructive/10 border border-destructive/30 rounded-xl text-xs text-destructive font-mono break-all">
            <strong>Erro ao carregar conversas:</strong><br />{chatError}
          </div>
        )}

        {!loadingChats && filteredWaChats.length === 0 && filteredConvs.length === 0 && !chatError && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {wpConnected ? "Nenhuma conversa encontrada" : "WhatsApp desconectado"}
          </div>
        )}
      </div>
    </div>
  );

  // Message area
  const renderMessages = () => {
    const displayMessages = isUsingWhatsApp ? waMessages : messages.map(m => ({
      id: m.id,
      from_me: m.sender_type === "atendente" || m.sender_type === "ia" || m.sender_type === "agent",
      text: m.content,
      timestamp: m.created_at,
      source: "crm" as const,
      sender_type: m.sender_type,
    }));

    return (
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex justify-between items-center bg-card shrink-0">
          <div className="flex items-center gap-3">
            {isMobile && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowMobileChat(false)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="w-9 h-9 rounded-full bg-chart-2/20 flex items-center justify-center text-xs font-bold text-chart-2">
              {chatName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?"}
            </div>
            <div>
              <div className="text-foreground font-bold text-sm">{chatName}</div>
              <div className="text-muted-foreground text-[11px]">
                {isUsingWhatsApp && activeWaChat && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {activeWaChat.phone}
                  </span>
                )}
                {!isUsingWhatsApp && activeConv && (
                  <span>{activeConv.status?.replace("_", " ")}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {!isUsingWhatsApp && activeConvId && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={deleteConversation} title="Apagar">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button variant={aiMode ? "default" : "outline"} size="sm" className="gap-1 text-[12px]" onClick={() => setAiMode(!aiMode)}>
              <Bot className="h-3.5 w-3.5" /> {aiMode ? "IA Ativa" : "IA"}
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-2" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}>
          {displayMessages.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Nenhuma mensagem. Envie a primeira!
            </div>
          )}
          {displayMessages.map(m => {
            const isMe = m.from_me;
            const isMedia = m.type === "image" || m.type === "video";
            
            return (
              <div key={m.id} className={`flex group ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`relative rounded-xl px-3.5 py-2 max-w-[75%] shadow-sm ${
                  isMe
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-card border border-border rounded-bl-sm"
                }`}>
                  {isMe && isUsingWhatsApp && (
                    <button 
                      onClick={() => deleteWhatsAppMessage(m.id)}
                      className="absolute -left-8 top-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  
                  {m.sender_type === "ia" || m.sender_type === "agent" ? (
                    <div className="text-[10px] font-semibold mb-0.5 opacity-70">Bot</div>
                  ) : null}
                  
                  {isMedia && m.media_url && (
                    <div className="mb-2 rounded-lg overflow-hidden border border-border/20">
                      {m.type === "image" ? (
                         <img src={m.media_url} alt="imagem" className="max-w-full h-auto cursor-pointer" onClick={() => window.open(m.media_url)} />
                      ) : (
                         <video src={m.media_url} controls className="max-w-full h-auto" />
                      )}
                    </div>
                  )}
                  
                  {m.type === "audio" && (
                    <audio src={m.media_url} controls className="max-w-full h-8 mb-2" />
                  )}
                  
                  {m.type === "document" && (
                     <div className="flex items-center gap-2 mb-2 p-2 bg-background/20 rounded border border-border/10 cursor-pointer" onClick={() => window.open(m.media_url)}>
                        <FileText className="h-4 w-4" />
                        <span className="text-[11px] truncate">{m.text || "Documento"}</span>
                     </div>
                  )}

                  {m.type !== "image" && m.type !== "video" && m.type !== "audio" && m.type !== "document" && (
                    <span className="text-[13px] whitespace-pre-wrap break-words">{m.text}</span>
                  )}
                  
                  {isMedia && m.text && (
                     <p className="text-[13px] mt-1 whitespace-pre-wrap break-words border-t border-border/10 pt-1">{m.text}</p>
                  )}
                  
                  <div className={`text-[10px] mt-1 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                    {formatMsgTime(m.timestamp)}
                    {isMe && " \u2713\u2713"}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area improved with media/location */}
        <div className="px-4 py-3 border-t border-border bg-card shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={e => e.target.files?.[0] && sendMediaWhatsApp(e.target.files[0])}
            />
            
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => fileInputRef.current?.click()} title="Anexo">
              <Paperclip className="h-4 w-4" />
            </Button>
            
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = "image/*"; fileInputRef.current.click(); } }} title="Imagem">
              <Image className="h-4 w-4" />
            </Button>

            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={sendLocationWhatsApp} title="Enviar Localização">
              <MapPin className="h-4 w-4" />
            </Button>
            
            <Input className="flex-1 bg-background border-border text-[13px]"
              placeholder={isUploading ? "Enviando arquivo..." : "Digite uma mensagem..."}
              value={msg} onChange={e => setMsg(e.target.value)}
              disabled={isUploading}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            />
            <Button size="sm" className="gap-1.5" onClick={handleSend} disabled={!msg.trim() || isUploading}>
              {loadingChats || isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Client info panel
  const renderClientPanel = () => {
    if (!activeClient) return null;
    return (
      <div className="w-[220px] border-l border-border p-4 overflow-y-auto bg-card hidden lg:block">
        <div className="text-center mb-4">
          <div className="w-[52px] h-[52px] rounded-full gradient-primary mx-auto mb-2 flex items-center justify-center text-white font-bold">
            {activeClient.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>
          <div className="text-foreground font-bold text-sm">{activeClient.name}</div>
        </div>
        {[
          ["Telefone", activeClient.phone || "\u2014"],
          ["Ticket Medio", `R$ ${(activeClient.ticket_medio || 0).toLocaleString("pt-BR")}`],
          ["Origem", activeClient.origin || "\u2014"],
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
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {STAGES.map(s => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] animate-fade-in">
      {/* Status banner */}
      {wpConnected === false && (
        <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs font-medium shrink-0">
          <WifiOff className="h-3.5 w-3.5" />
          WhatsApp desconectado — mensagens salvas apenas no CRM.
          <a href="/whatsapp-connect" className="underline ml-1">Conectar</a>
        </div>
      )}
      {wpConnected === true && (
        <div className="flex items-center gap-2 px-4 py-2 bg-chart-2/10 border-b border-chart-2/20 text-chart-2 text-xs font-medium shrink-0">
          <Wifi className="h-3.5 w-3.5" />
          WhatsApp conectado — conversas em tempo real.
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        {(!isMobile || !showMobileChat) && (
          <div className={`${isMobile ? "w-full" : "w-[300px]"} border-r border-border flex flex-col`}>
            {renderSidebar()}
          </div>
        )}

        {/* Chat area */}
        {(!isMobile || showMobileChat) && hasActiveChat ? (
          <>
            {renderMessages()}
            {renderClientPanel()}
          </>
        ) : !isMobile && !hasActiveChat ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <User className="h-16 w-16 mx-auto mb-3 opacity-30" />
              <p>Selecione uma conversa para começar</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
