import { useEffect, useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search, Bot, Send, Plus, Trash2, WifiOff, Wifi, Phone,
  User, ArrowLeft, Paperclip, MapPin, Loader2, Mic,
  Image as ImageIcon, FileText, CheckCheck, Check, X,
} from "lucide-react";
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

const STAGES = [
  { value: "lead_novo", label: "Lead Novo" },
  { value: "contato_iniciado", label: "Contato Iniciado" },
  { value: "interessado", label: "Interessado" },
  { value: "comprador", label: "Comprador" },
  { value: "perdido", label: "Perdido" },
  { value: "desqualificado", label: "Desqualificado" },
];

const PYTHON_BACKEND_URL = "https://artificial-vivian-ggenciaglobalnexus-d093d570.koyeb.app";

// ---------- Interfaces ----------
interface WpInstance {
  api_url: string; api_token: string; instance_name: string;
  instance_token: string | null; status: string;
}
interface WaChat {
  id: string; phone: string; name: string;
  last_message: string; last_message_at: number | string | null;
  unread_count: number; is_group: boolean; crm_client_id?: string | null;
  avatar_url?: string | null;
}
interface WaMessage {
  id: string; from_me: boolean; text: string;
  timestamp: number | string | null; type?: string;
  source?: string; sender_type?: string;
  media_url?: string; mimetype?: string;
}
interface Client {
  id: string; name: string; phone: string | null;
  ticket_medio: number | null; origin: string | null;
  avatar_url?: string | null;
}

// ---------- Helpers ----------
function msgTypePreview(type?: string, text?: string): string {
  if (text && text.trim()) return text;
  const t = (type || "").toLowerCase().replace(/message$/, "");
  if (t.includes("image")) return "📷 Imagem";
  if (t.includes("video")) return "🎥 Vídeo";
  if (t.includes("audio") || t.includes("ptt")) return "🎤 Áudio";
  if (t.includes("document") || t.includes("doc")) return "📎 Documento";
  if (t.includes("sticker")) return "🎭 Sticker";
  if (t.includes("location")) return "📍 Localização";
  if (t.includes("contact")) return "👤 Contato";
  if (t.includes("conversation") || t.includes("extendedtext") || t.includes("text")) return "";
  return type ? `[${type}]` : "";
}

function normalizeChat(raw: any): WaChat {
  const jid = raw.wa_chatid || raw.remoteJid || raw.jid || "";
  const rawPhone = raw.phone || "";
  const phone = jid
    ? jid.replace("@s.whatsapp.net", "").replace("@c.us", "").replace("@g.us", "")
    : rawPhone.replace(/\D/g, "");

  const lastMsgRaw = raw.lastMessage || raw.lastMsg || {};
  const msgObj = lastMsgRaw?.message || {};
  const lastText =
    msgObj.conversation ||
    msgObj.extendedTextMessage?.text ||
    msgObj.imageMessage?.caption ||
    lastMsgRaw?.body || lastMsgRaw?.text || raw.preview || "";

  const lastType = raw.wa_lastMessageType || "";

  return {
    id: jid,
    phone,
    name: raw.name || raw.wa_contactName || raw.wa_name || `WhatsApp ${phone.slice(-4)}`,
    last_message: msgTypePreview(lastType, lastText),
    last_message_at: raw.wa_lastMsgTimestamp || raw.conversationTimestamp || null,
    unread_count: raw.wa_unreadCount || raw.unreadCount || 0,
    is_group: raw.wa_isGroup === true,
  };
}

function normalizeMessage(raw: any): WaMessage {
  const key = raw.key || {};
  const msg = raw.message || {};
  const text =
    raw.text ||
    raw.body ||
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    "";
  const type =
    raw.messageType ||
    (msg.imageMessage ? "imageMessage" :
      msg.videoMessage ? "videoMessage" :
      msg.audioMessage ? "audioMessage" :
      msg.pttMessage ? "pttMessage" :
      msg.documentMessage ? "documentMessage" :
      msg.stickerMessage ? "stickerMessage" :
      msg.locationMessage ? "locationMessage" : "text");

  return {
    id: raw.messageid || raw.id || key.id || Math.random().toString(36).slice(2),
    from_me: raw.fromMe ?? key.fromMe ?? false,
    text,
    timestamp: raw.messageTimestamp || raw.t || raw.timestamp,
    type,
    source: "whatsapp",
    media_url:
      msg.imageMessage?.url || msg.videoMessage?.url ||
      msg.audioMessage?.url || msg.documentMessage?.url || undefined,
    mimetype:
      msg.imageMessage?.mimetype || msg.videoMessage?.mimetype ||
      msg.audioMessage?.mimetype || msg.documentMessage?.mimetype || undefined,
  };
}

async function fetchUazapi(url: string, token: string, method = "GET", body?: any) {
  const headers: Record<string, string> = { Accept: "application/json", token };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Converte timestamp para Date — detecta automaticamente segundos vs milissegundos
// UAZAPI retorna messageTimestamp em segundos (ex: 1711450000), mas às vezes em ms
function tsToDate(ts: number | string | null): Date | null {
  if (!ts) return null;
  if (typeof ts === "string") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  // Se > 1e12 já está em milissegundos; caso contrário, está em segundos
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d;
}

function formatTime(ts: number | string | null): string {
  const d = tsToDate(ts);
  if (!d) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "agora";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min`;
  if (diff < 86_400_000) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diff < 604_800_000) return d.toLocaleDateString("pt-BR", { weekday: "short" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatMsgTime(ts: number | string | null): string {
  const d = tsToDate(ts);
  if (!d) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function getDateLabel(ts: number | string | null): string {
  const d = tsToDate(ts);
  if (!d) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - msgDay.getTime();
  if (diff === 0) return "Hoje";
  if (diff === 86_400_000) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function getInitials(name: string): string {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?";
}

// ========== COMPONENT ==========
export default function Chat() {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [wpConfig, setWpConfig] = useState<WpInstance | null>(null);
  const [wpConnected, setWpConnected] = useState<boolean | null>(null);
  const [waChats, setWaChats] = useState<WaChat[]>([]);
  const [waMessages, setWaMessages] = useState<WaMessage[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientOpp, setClientOpp] = useState<{ id: string; stage: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [newConvClientId, setNewConvClientId] = useState("");
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ---------- Load WP config ----------
  useEffect(() => {
    supabase.from("whatsapp_instances")
      .select("api_url, api_token, instance_name, instance_token, status")
      .maybeSingle()
      .then(({ data }) => {
        if (data) { setWpConfig(data as WpInstance); setWpConnected(data.status === "connected"); }
        else setWpConnected(false);
      });
  }, []);

  // ---------- Fetch chats ----------
  const fetchChats = useCallback(async () => {
    if (!wpConfig || wpConfig.status !== "connected") return;
    const token = wpConfig.instance_token || wpConfig.api_token;
    if (!token) return;
    setLoadingChats(true);
    setChatError(null);
    try {
      const url = `${wpConfig.api_url.replace(/\/$/, "")}/chat/find`;
      const data = await fetchUazapi(url, token, "POST", { limit: 50 });
      const raw: any[] = Array.isArray(data) ? data : (data.chats || data.data || data.result || []);

      let normalized = raw.map(normalizeChat).filter(c => !c.is_group && c.phone.length >= 8);

      // Enrich with CRM names (tenta ambos formatos de telefone)
      const phones = normalized.map(c => c.phone);
      const alts = phones.map(p => p.startsWith("55") ? p.slice(2) : `55${p}`);
      const allPhones = [...new Set([...phones, ...alts])];
      const { data: crmClients } = await supabase.from("clients").select("id, phone, name, avatar_url").in("phone", allPhones);
      const crmMap: Record<string, { id: string; name: string; avatar_url?: string | null }> = {};
      (crmClients || []).forEach((c: any) => { crmMap[c.phone] = { id: c.id, name: c.name, avatar_url: c.avatar_url }; });
      normalized.forEach(chat => {
        const crm = crmMap[chat.phone] || crmMap[chat.phone.startsWith("55") ? chat.phone.slice(2) : `55${chat.phone}`];
        if (crm) { chat.name = crm.name; chat.crm_client_id = crm.id; chat.avatar_url = crm.avatar_url; }
      });

      normalized.sort((a, b) => {
        const ta = tsToDate(a.last_message_at)?.getTime() ?? 0;
        const tb = tsToDate(b.last_message_at)?.getTime() ?? 0;
        return tb - ta;
      });
      setWaChats(normalized);
      if (raw.length === 0) setChatError(`Sem conversas. Resposta: ${JSON.stringify(data).slice(0, 150)}`);
    } catch (e: any) {
      setChatError(`Erro: ${e.message}`);
    }
    setLoadingChats(false);
  }, [wpConfig]);

  useEffect(() => {
    supabase.from("clients").select("id, name, phone, ticket_medio, origin, avatar_url")
      .then(({ data }) => setClients((data || []) as Client[]));
  }, []);

  useEffect(() => {
    if (wpConnected) {
      fetchChats();
      const interval = setInterval(fetchChats, 30_000);
      return () => clearInterval(interval);
    }
  }, [wpConnected, fetchChats]);

  // ---------- Fetch messages ----------
  const fetchMessages = useCallback(async (chatId: string) => {
    if (!wpConfig) return;
    const token = wpConfig.instance_token || wpConfig.api_token;
    const fullJid = chatId.includes("@") ? chatId : `${chatId}@s.whatsapp.net`;
    setLoadingMessages(true);
    try {
      const url = `${wpConfig.api_url.replace(/\/$/, "")}/message/find`;
      const data = await fetchUazapi(url, token, "POST", { chatid: fullJid, limit: 50 });
      const raw: any[] = Array.isArray(data) ? data : (data.messages || data.data || []);
      const normalized = raw.map(normalizeMessage);

      // CRM messages (tenta ambos formatos)
      const rawPhone = fullJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
      let clientData: { id: string } | null = null;
      for (const ph of [rawPhone, rawPhone.startsWith("55") ? rawPhone.slice(2) : `55${rawPhone}`]) {
        const { data: cd } = await supabase.from("clients").select("id").eq("phone", ph).limit(1).maybeSingle();
        if (cd) { clientData = cd; break; }
      }

      let crmMsgs: WaMessage[] = [];
      if (clientData) {
        const { data: dbMsgs } = await supabase.from("messages")
          .select("id, content, is_from_client, created_at, sender_type")
          .eq("client_id", clientData.id)
          .order("created_at", { ascending: true })
          .limit(50);
        crmMsgs = (dbMsgs || []).map(m => ({
          id: `crm-${m.id}`, from_me: !m.is_from_client,
          text: m.content || "", timestamp: m.created_at,
          source: "crm", sender_type: m.sender_type, type: "text",
        }));

        const { data: opp } = await supabase.from("opportunities")
          .select("id, stage").eq("client_id", clientData.id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        setClientOpp(opp || null);
      } else {
        setClientOpp(null);
      }

      // Merge: WA messages prevalecem, CRM complementa
      const waIds = new Set(normalized.map(m => m.id));
      const merged = [...normalized, ...crmMsgs.filter(m => !waIds.has(m.id))];
      merged.sort((a, b) => {
        const ta = tsToDate(a.timestamp)?.getTime() ?? 0;
        const tb = tsToDate(b.timestamp)?.getTime() ?? 0;
        return ta - tb;
      });
      setWaMessages(merged);
    } catch (e: any) {
      console.error("Erro ao buscar mensagens:", e);
      toast.error("Erro ao carregar mensagens");
    }
    setLoadingMessages(false);
  }, [wpConfig]);

  useEffect(() => {
    if (activeChatId) fetchMessages(activeChatId);
  }, [activeChatId, fetchMessages]);

  // ---------- Fetch & save profile picture ----------
  const fetchAndSaveProfilePicture = useCallback(async (chat: WaChat) => {
    if (!wpConfig || chat.avatar_url) return; // already have it
    const token = wpConfig.instance_token || wpConfig.api_token;
    const phone = chat.phone.startsWith("55") ? chat.phone : `55${chat.phone}`;
    try {
      const url = `${wpConfig.api_url.replace(/\/$/, "")}/contact/profilepicture`;
      const data = await fetchUazapi(url, token, "POST", { number: phone });
      const picUrl: string | undefined =
        data?.profilePictureUrl || data?.imageUrl || data?.picture || data?.url;
      if (!picUrl) return;
      // Update local state
      setWaChats(prev => prev.map(c => c.id === chat.id ? { ...c, avatar_url: picUrl } : c));
      // Persist to Supabase if client exists in CRM
      if (chat.crm_client_id) {
        await supabase.from("clients").update({ avatar_url: picUrl } as any).eq("id", chat.crm_client_id);
      } else {
        // Try to find client by phone and update
        const rawPhone = chat.phone;
        for (const ph of [rawPhone, rawPhone.startsWith("55") ? rawPhone.slice(2) : `55${rawPhone}`]) {
          const { data: cd } = await supabase.from("clients").select("id").eq("phone", ph).limit(1).maybeSingle();
          if (cd) { await supabase.from("clients").update({ avatar_url: picUrl } as any).eq("id", cd.id); break; }
        }
      }
    } catch { /* silent — profile picture is optional */ }
  }, [wpConfig]);

  useEffect(() => {
    if (activeChatId) {
      const chat = waChats.find(c => c.id === activeChatId);
      if (chat) fetchAndSaveProfilePicture(chat);
    }
  }, [activeChatId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [waMessages]);

  // ---------- Send text ----------
  const sendMessage = async () => {
    const content = msg.trim();
    if (!content || !activeChatId || !wpConfig) return;
    setMsg("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const token = wpConfig.instance_token || wpConfig.api_token;
    const phone = activeChatId.replace("@s.whatsapp.net", "").replace("@c.us", "");
    const formattedPhone = phone.startsWith("55") ? phone : `55${phone}`;

    // Otimista
    const tempMsg: WaMessage = {
      id: `local-${Date.now()}`, from_me: true, text: content,
      timestamp: Math.floor(Date.now() / 1000), type: "text", source: "local",
    };
    setWaMessages(prev => [...prev, tempMsg]);

    try {
      const sendUrl = `${wpConfig.api_url.replace(/\/$/, "")}/send/text`;
      await fetchUazapi(sendUrl, token, "POST", { number: formattedPhone, text: content });

      // Salva no CRM
      const activeChat = waChats.find(c => c.id === activeChatId);
      if (activeChat?.crm_client_id) {
        const { data: convData } = await supabase.from("conversations")
          .select("id").eq("client_id", activeChat.crm_client_id)
          .in("status", ["aberta", "em_atendimento", "aguardando"] as any)
          .order("last_message_at", { ascending: false }).limit(1).maybeSingle();
        if (convData?.id) {
          await supabase.from("messages").insert({
            conversation_id: convData.id, client_id: activeChat.crm_client_id,
            content, sender_type: "atendente" as any, sender_id: user?.id,
            channel: "whatsapp" as any, is_from_client: false,
          });
          await supabase.from("conversations").update({
            last_message: content, last_message_at: new Date().toISOString(),
            status: "em_atendimento" as any,
          }).eq("id", convData.id);
        }
      }
    } catch (e: any) {
      console.error("Erro ao enviar:", e);
      toast.error("Erro ao enviar mensagem");
      setWaMessages(prev => prev.filter(m => m.id !== tempMsg.id));
    }
  };

  // ---------- Send media ----------
  const sendMedia = async (file: File) => {
    if (!activeChatId || !wpConfig) return;
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      const type = file.type.startsWith("image/") ? "image" :
        file.type.startsWith("video/") ? "video" :
        file.type.startsWith("audio/") ? "audio" : "document";
      try {
        const res = await fetch(`${PYTHON_BACKEND_URL}/whatsapp/conversations/send-media`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: activeChatId, media_type: type, file: base64,
            text: file.name, doc_name: type === "document" ? file.name : undefined,
          }),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `HTTP ${res.status}`); }
        toast.success("Mídia enviada!");
        setTimeout(() => fetchMessages(activeChatId), 1500);
      } catch (e: any) {
        toast.error(`Erro ao enviar mídia: ${e.message}`);
      } finally { setIsUploading(false); }
    };
    reader.readAsDataURL(file);
  };

  // ---------- Send location ----------
  const sendLocation = () => {
    if (!activeChatId) return;
    if (!navigator.geolocation) { toast.error("Geolocalização não suportada"); return; }
    toast.info("Obtendo localização...");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const res = await fetch(`${PYTHON_BACKEND_URL}/whatsapp/conversations/send-location`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: activeChatId, latitude: pos.coords.latitude,
            longitude: pos.coords.longitude, name: "Minha Localização",
            address: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
          }),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `HTTP ${res.status}`); }
        toast.success("Localização enviada!");
        setTimeout(() => fetchMessages(activeChatId), 1500);
      } catch (e: any) { toast.error(`Erro ao enviar localização: ${e.message}`); }
    }, () => toast.error("Permissão de localização negada"));
  };

  // ---------- Delete message ----------
  const deleteMessage = async (messageId: string) => {
    if (!confirm("Apagar mensagem para TODOS?")) return;
    try {
      const res = await fetch(`${PYTHON_BACKEND_URL}/whatsapp/messages/delete`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: messageId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `HTTP ${res.status}`); }
      toast.success("Mensagem apagada!");
      setWaMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (e: any) { toast.error(`Erro: ${e.message}`); }
  };

  // ---------- Delete conversation ----------
  const deleteConversation = async () => {
    if (!activeChatId || !confirm("Apagar esta conversa?")) return;
    try {
      const res = await fetch(`${PYTHON_BACKEND_URL}/whatsapp/conversations/delete`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: activeChatId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `HTTP ${res.status}`); }
      toast.success("Conversa apagada!");
      setActiveChatId(null); setWaMessages([]);
      setTimeout(fetchChats, 800);
    } catch (e: any) { toast.error(`Erro: ${e.message}`); }
  };

  // ---------- Stage change ----------
  const handleStageChange = async (newStage: string) => {
    if (!user) return;
    const activeChat = waChats.find(c => c.id === activeChatId);
    let clientId = activeChat?.crm_client_id;

    // Tenta encontrar cliente pelos dois formatos de telefone
    if (!clientId && activeChatId) {
      const rawPhone = activeChatId.replace("@s.whatsapp.net", "").replace("@c.us", "");
      for (const ph of [rawPhone, rawPhone.startsWith("55") ? rawPhone.slice(2) : `55${rawPhone}`]) {
        const { data } = await supabase.from("clients").select("id").eq("phone", ph).limit(1).maybeSingle();
        if (data) { clientId = data.id; break; }
      }
    }

    // Se ainda não encontrou → cria o cliente automaticamente a partir dos dados do WhatsApp
    if (!clientId && activeChatId && activeChat) {
      const rawPhone = activeChatId.replace("@s.whatsapp.net", "").replace("@c.us", "");
      const { data: newClient, error: clientErr } = await supabase
        .from("clients")
        .insert({
          name: activeChat.name || `WhatsApp ${rawPhone.slice(-4)}`,
          phone: rawPhone,
          origin: "whatsapp",
        })
        .select("id")
        .single();
      if (clientErr) { toast.error(`Erro ao criar cliente: ${clientErr.message}`); return; }
      clientId = newClient.id;
      // Atualiza o chat local com o novo crm_client_id
      setWaChats(prev => prev.map(c => c.id === activeChatId ? { ...c, crm_client_id: clientId } : c));
      toast.success(`Lead "${activeChat.name}" adicionado ao CRM!`);
    }

    if (!clientId) { toast.error("Não foi possível identificar o cliente"); return; }

    const oldStage = clientOpp?.stage;

    if (clientOpp) {
      const { error } = await supabase.from("opportunities")
        .update({ stage: newStage as any, responsible_id: user.id })
        .eq("id", clientOpp.id);
      if (error) { console.error(error); toast.error(`Erro: ${error.message}`); return; }
      toast.success("Etapa atualizada!");
      setClientOpp({ ...clientOpp, stage: newStage });
      // Notifica o motor de follow-up
      fetch(`${PYTHON_BACKEND_URL}/followup/on-stage-change`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, opportunity_id: clientOpp.id, new_stage: newStage, old_stage: oldStage }),
      }).catch(() => {});
    } else {
      const client = clients.find(c => c.id === clientId);
      const { data, error } = await supabase.from("opportunities").insert({
        client_id: clientId,
        title: `Lead WhatsApp - ${client?.name || activeChat?.name || "Cliente"}`,
        stage: newStage as any, responsible_id: user.id,
        estimated_value: 0,
      }).select("id, stage").single();
      if (error) { console.error(error); toast.error(`Erro: ${error.message}`); return; }
      toast.success("Lead adicionado ao CRM!");
      setClientOpp(data);
      // Notifica o motor de follow-up
      fetch(`${PYTHON_BACKEND_URL}/followup/on-stage-change`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, opportunity_id: data.id, new_stage: newStage, old_stage: null }),
      }).catch(() => {});
    }
  };

  // ---------- Create conversation ----------
  const createConversation = async () => {
    if (!user || !newConvClientId) return;
    const { error } = await supabase.from("conversations").insert({
      client_id: newConvClientId, responsible_id: user.id, status: "aberta" as any,
    });
    if (error) toast.error("Erro ao criar conversa");
    else { toast.success("Conversa criada!"); setNewConvOpen(false); setNewConvClientId(""); }
  };

  // ---------- Computed ----------
  const activeChat = waChats.find(c => c.id === activeChatId);
  const activeClient = activeChat?.crm_client_id ? clients.find(c => c.id === activeChat.crm_client_id) : null;
  const filteredChats = waChats.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm)
  );

  // Group messages by date
  const groupedMessages: { label: string; msgs: WaMessage[] }[] = [];
  waMessages.forEach(m => {
    const label = getDateLabel(m.timestamp);
    const last = groupedMessages[groupedMessages.length - 1];
    if (!last || last.label !== label) groupedMessages.push({ label, msgs: [m] });
    else last.msgs.push(m);
  });

  // ========== RENDER ==========

  const renderMessageContent = (m: WaMessage) => {
    const isMedia = ["imageMessage", "videoMessage"].includes(m.type || "");
    const isAudio = ["audioMessage", "pttMessage"].includes(m.type || "");
    const isDoc = m.type === "documentMessage";
    const isSticker = m.type === "stickerMessage";
    const isLocation = m.type === "locationMessage";

    if (isMedia && m.media_url) return (
      <div className="mb-1">
        {m.type === "imageMessage"
          ? <img src={m.media_url} alt="imagem" className="rounded-lg max-w-[240px] max-h-[200px] object-cover cursor-pointer" onClick={() => window.open(m.media_url)} />
          : <video src={m.media_url} controls className="rounded-lg max-w-[240px]" />
        }
        {m.text && <p className="text-[13px] mt-1 whitespace-pre-wrap">{m.text}</p>}
      </div>
    );
    if (isAudio && m.media_url) return <audio src={m.media_url} controls className="max-w-[220px] h-8" />;
    if (isDoc) return (
      <div className="flex items-center gap-2 p-2 bg-black/10 rounded-lg cursor-pointer" onClick={() => m.media_url && window.open(m.media_url)}>
        <FileText className="h-4 w-4 shrink-0" />
        <span className="text-[12px] truncate max-w-[180px]">{m.text || "Documento"}</span>
      </div>
    );
    if (isLocation) return (
      <div className="flex items-center gap-2 p-2 bg-black/10 rounded-lg">
        <MapPin className="h-4 w-4 shrink-0" />
        <span className="text-[12px]">{m.text || "Localização"}</span>
      </div>
    );
    if (isSticker) return <span className="text-3xl">{m.text || "🎭"}</span>;
    return <span className="text-[13.5px] leading-[1.4] whitespace-pre-wrap break-words">{m.text || msgTypePreview(m.type)}</span>;
  };

  const renderSidebar = () => (
    <div className="flex flex-col h-full" style={{ background: "hsl(var(--card))" }}>
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex gap-2 items-center shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 bg-background text-[12.5px] border-border rounded-full"
            placeholder="Buscar conversa..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <Dialog open={newConvOpen} onOpenChange={setNewConvOpen}>
          <DialogTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0"><Plus className="h-4 w-4" /></Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Conversa</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select value={newConvClientId} onValueChange={setNewConvClientId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={createConversation} className="w-full" disabled={!newConvClientId}>Iniciar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status */}
      {wpConnected === true && (
        <div className="px-3 py-1.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-500 border-b border-border bg-emerald-500/5 shrink-0">
          <Wifi className="h-3 w-3" /> WhatsApp conectado — conversas em tempo real.
        </div>
      )}
      {wpConnected === false && (
        <div className="px-3 py-1.5 flex items-center gap-1.5 text-[11px] font-medium text-destructive border-b border-border shrink-0">
          <WifiOff className="h-3 w-3" /> Desconectado.
          <a href="/whatsapp-connect" className="underline ml-0.5">Conectar</a>
        </div>
      )}

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {loadingChats && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
          </div>
        )}
        {chatError && (
          <div className="m-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-[11px] text-destructive break-all">
            {chatError}
          </div>
        )}
        {!loadingChats && filteredChats.map(chat => {
          const isActive = chat.id === activeChatId;
          return (
            <div key={chat.id} onClick={() => { setActiveChatId(chat.id); if (isMobile) setShowMobileChat(true); }}
              className={`flex items-center gap-3 px-3 py-3 cursor-pointer border-b border-border/30 transition-colors ${isActive ? "bg-primary/10" : "hover:bg-muted/40"}`}>
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full shrink-0 overflow-hidden bg-gradient-to-br from-chart-2/80 to-chart-1/80 flex items-center justify-center">
                {chat.avatar_url
                  ? <img src={chat.avatar_url} alt={chat.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  : <span className="text-white text-[12px] font-bold">{getInitials(chat.name)}</span>
                }
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline gap-1">
                  <span className="text-foreground font-semibold text-[13px] truncate">{chat.name}</span>
                  <span className={`text-[11px] shrink-0 ${chat.unread_count > 0 ? "text-emerald-500 font-semibold" : "text-muted-foreground"}`}>
                    {formatTime(chat.last_message_at)}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-1 mt-0.5">
                  <span className="text-muted-foreground text-[12px] truncate">{chat.last_message || "..."}</span>
                  {chat.unread_count > 0 && (
                    <span className="bg-emerald-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center shrink-0">
                      {chat.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!loadingChats && !chatError && filteredChats.length === 0 && (
          <div className="py-16 text-center text-muted-foreground text-sm">
            {wpConnected ? "Nenhuma conversa" : "WhatsApp não conectado"}
          </div>
        )}
      </div>
    </div>
  );

  const renderMessages = () => {
    if (!activeChatId) return (
      <div className="flex-1 flex items-center justify-center" style={{ background: "hsl(var(--background))" }}>
        <div className="text-center text-muted-foreground">
          <User className="h-14 w-14 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Selecione uma conversa</p>
        </div>
      </div>
    );

    return (
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-border bg-card flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            {isMobile && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowMobileChat(false)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-chart-2/80 to-chart-1/80 flex items-center justify-center shrink-0">
              {activeChat?.avatar_url
                ? <img src={activeChat.avatar_url} alt={activeChat.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                : <span className="text-white text-xs font-bold">{getInitials(activeChat?.name || "?")}</span>
              }
            </div>
            <div>
              <div className="text-foreground font-semibold text-[14px]">{activeChat?.name || "..."}</div>
              <div className="text-muted-foreground text-[11px] flex items-center gap-1">
                <Phone className="h-3 w-3" /> {activeChat?.phone || ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={deleteConversation} title="Apagar conversa">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
          style={{
            background: "hsl(var(--background))",
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%239C92AC' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          }}
        >
          {loadingMessages && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando mensagens...
            </div>
          )}

          {!loadingMessages && waMessages.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              Nenhuma mensagem. Envie a primeira!
            </div>
          )}

          {groupedMessages.map(group => (
            <div key={group.label}>
              {/* Date divider */}
              <div className="flex items-center justify-center my-3">
                <span className="text-[11px] font-medium px-3 py-0.5 rounded-full bg-card border border-border text-muted-foreground shadow-sm">
                  {group.label}
                </span>
              </div>
              {group.msgs.map((m, idx) => {
                const isMe = m.from_me;
                const isBot = m.sender_type === "ia" || m.sender_type === "agent";
                const prevMsg = idx > 0 ? group.msgs[idx - 1] : null;
                const isConsecutive = prevMsg?.from_me === m.from_me;

                return (
                  <div key={m.id} className={`flex group ${isMe ? "justify-end" : "justify-start"} ${isConsecutive ? "mt-0.5" : "mt-2"}`}>
                    {/* Avatar for received (only on first of a sequence) */}
                    {!isMe && !isConsecutive && (
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-chart-2/60 to-chart-1/60 flex items-center justify-center text-white text-[9px] font-bold shrink-0 mr-1.5 mt-auto mb-0.5">
                        {getInitials(activeChat?.name || "?")}
                      </div>
                    )}
                    {!isMe && isConsecutive && <div className="w-6 mr-1.5 shrink-0" />}

                    <div className={`relative max-w-[72%] ${isMe ? "items-end" : "items-start"}`}>
                      {/* Bot label */}
                      {isBot && (
                        <div className="text-[10px] font-semibold mb-0.5 text-chart-3 flex items-center gap-1">
                          <Bot className="h-3 w-3" /> Bot
                        </div>
                      )}
                      {/* Bubble */}
                      <div className={`relative px-3 py-[6px] rounded-2xl shadow-sm ${
                        isMe
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-card border border-border/60 text-foreground rounded-bl-sm"
                      }`}>
                        {renderMessageContent(m)}
                        {/* Time + status */}
                        <div className={`flex items-center gap-1 justify-end mt-0.5 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                          <span className="text-[10px]">{formatMsgTime(m.timestamp)}</span>
                          {isMe && (
                            m.source === "local"
                              ? <Check className="h-3 w-3 opacity-60" />
                              : <CheckCheck className="h-3 w-3 opacity-80" />
                          )}
                        </div>
                        {/* Delete on hover */}
                        {isMe && (
                          <button
                            onClick={() => deleteMessage(m.id)}
                            className="absolute -left-7 top-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-3 py-2.5 border-t border-border bg-card shrink-0">
          <div className="flex items-end gap-2">
            <input type="file" ref={fileInputRef} className="hidden"
              onChange={e => e.target.files?.[0] && sendMedia(e.target.files[0])} />

            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = "*/*"; fileInputRef.current.click(); } }} title="Anexo">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = "image/*,video/*"; fileInputRef.current.click(); } }} title="Imagem/Vídeo">
                <ImageIcon className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={sendLocation} title="Localização">
                <MapPin className="h-4 w-4" />
              </Button>
            </div>

            <textarea
              ref={textareaRef}
              rows={1}
              className="flex-1 resize-none rounded-2xl border border-border bg-background px-3.5 py-2 text-[13.5px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring min-h-[36px] max-h-[120px] overflow-y-auto"
              placeholder={isUploading ? "Enviando arquivo..." : "Digite uma mensagem..."}
              value={msg}
              disabled={isUploading}
              onChange={e => {
                setMsg(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            />

            <Button size="icon"
              className="h-9 w-9 shrink-0 rounded-full"
              onClick={sendMessage}
              disabled={(!msg.trim() && !isUploading) || isUploading}
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : msg.trim() ? <Send className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderContactPanel = () => {
    if (!activeChat) return null;
    return (
      <div className="w-[220px] border-l border-border bg-card flex flex-col hidden lg:flex shrink-0">
        <div className="p-4 border-b border-border text-center">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-chart-2/80 to-chart-1/80 mx-auto mb-2 flex items-center justify-center text-white font-bold text-lg">
            {getInitials(activeChat.name)}
          </div>
          <div className="text-foreground font-bold text-sm leading-tight">{activeChat.name}</div>
          <div className="text-muted-foreground text-[11px] mt-0.5">{activeChat.phone}</div>
        </div>
        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          {activeClient && (
            <>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Ticket Médio</div>
                <div className="text-[13px] font-semibold">R$ {(activeClient.ticket_medio || 0).toLocaleString("pt-BR")}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Origem</div>
                <div className="text-[13px] font-semibold">{activeClient.origin || "—"}</div>
              </div>
            </>
          )}
          <div className="pt-2 border-t border-border">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Etapa no CRM</div>
            {!activeChat?.crm_client_id && !clientOpp && (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs gap-1.5 mb-2 border-dashed"
                onClick={() => handleStageChange("lead_novo")}
              >
                <Plus className="h-3.5 w-3.5" />Adicionar ao CRM
              </Button>
            )}
            <Select value={clientOpp?.stage || ""} onValueChange={handleStageChange}>
              <SelectTrigger className="h-8 text-xs rounded-lg">
                <SelectValue placeholder="Sem etapa" />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map(s => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    );
  };

  // ─── Main layout ─────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-60px)] overflow-hidden animate-fade-in">
      {/* Sidebar */}
      {(!isMobile || !showMobileChat) && (
        <div className={`${isMobile ? "w-full" : "w-[300px]"} border-r border-border flex flex-col shrink-0`}>
          {renderSidebar()}
        </div>
      )}

      {/* Messages */}
      {(!isMobile || showMobileChat) && (
        <div className="flex-1 flex min-w-0">
          {renderMessages()}
          {!isMobile && renderContactPanel()}
        </div>
      )}
    </div>
  );
}
