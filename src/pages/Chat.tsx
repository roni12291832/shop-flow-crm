import { useEffect, useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search, Bot, Send, Plus, Trash2, WifiOff, Wifi, Phone,
  User, ArrowLeft, Paperclip, MapPin, Loader2, Mic,
  Image as ImageIcon, FileText, CheckCheck, Check, X,
  Smile, CornerUpLeft, ChevronDown, Play, Pause, Download,
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

const PYTHON_BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const WAVEFORM_HEIGHTS = [4, 8, 12, 6, 16, 10, 4, 14, 8, 12, 6, 18, 10, 4, 12, 8, 16, 6, 10, 4];

const EMOJIS = [
  "😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇",
  "🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚",
  "😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔",
  "🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥",
  "😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤧",
  "🥵","🥶","🥴","😵","🤯","🤠","🥳","😎","🤓","🧐",
  "👍","👎","👋","🤚","✋","🖐","👌","🤌","✌","🤞",
  "🤙","💪","🦾","🙏","❤","🧡","💛","💚","💙","💜",
];

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
  raw_message_id?: string; // ID original do UAZAPI para download de mídia
  chat_id?: string;        // JID do chat para download de mídia
  base64_data?: string;    // base64 do arquivo (áudio já vem em sendPayload.file)
  waveform?: string;       // waveform real do WhatsApp (base64)
  duration?: number;       // duração em segundos
}
interface Client {
  id: string; name: string; phone: string | null;
  ticket_medio: number | null; origin: string | null;
  avatar_url?: string | null;
}
interface ReplyInfo {
  id: string;
  from_me: boolean;
  text: string;
  contactName: string;
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

  // UAZAPI retorna a mídia em campos não-convencionais:
  // - content.URL: URL CDN do WhatsApp (.enc = criptografada, não reproduzível)
  // - content.mimetype: tipo MIME real
  // - sendPayload.file: base64 do arquivo real (já decodificado!) — disponível para áudio/PTT
  // - Para imagens: sendPayload.file pode estar vazio → precisa chamar /message/download
  const content = (typeof raw.content === "object" && raw.content !== null) ? raw.content : {};
  const sendPayload = (typeof raw.sendPayload === "object" && raw.sendPayload !== null) ? raw.sendPayload : {};

  const base64File = sendPayload.file || "";
  const contentUrl = content.URL || content.url || "";
  // Usa content.URL como media_url apenas para imagens (URLs de imagem costumam ser acessíveis)
  const rawMediaUrl =
    raw.mediaUrl || raw.fileURL ||
    msg.imageMessage?.url || msg.videoMessage?.url ||
    msg.audioMessage?.url || msg.pttMessage?.url ||
    msg.documentMessage?.url || msg.stickerMessage?.url ||
    contentUrl || undefined;

  const rawId = raw.messageid || raw.id || key.id || "";

  return {
    id: rawId || Math.random().toString(36).slice(2),
    raw_message_id: rawId || undefined,
    chat_id: raw.chatid || key.remoteJid || undefined,
    from_me: raw.fromMe ?? key.fromMe ?? false,
    text,
    timestamp: raw.messageTimestamp || raw.t || raw.timestamp,
    type,
    source: "whatsapp",
    media_url: rawMediaUrl,
    mimetype:
      content.mimetype || raw.mimetype ||
      msg.imageMessage?.mimetype || msg.videoMessage?.mimetype ||
      msg.audioMessage?.mimetype || msg.pttMessage?.mimetype ||
      msg.documentMessage?.mimetype || undefined,
    base64_data: base64File || undefined,
    waveform: content.waveform || undefined,
    duration: content.seconds || undefined,
  };
}

async function fetchUazapi(url: string, token: string, method = "GET", body?: any) {
  const headers: Record<string, string> = { Accept: "application/json", token };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function tsToDate(ts: number | string | null): Date | null {
  if (!ts) return null;
  if (typeof ts === "string") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Gera cor de gradiente única por nome
function nameToGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${h1},65%,50%), hsl(${h2},65%,40%))`;
}

// ========== AudioPlayer ==========
function AudioPlayer({ src, token, fromMe, contactName }: {
  src: string; token: string; fromMe: boolean; contactName: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // A URL já vem resolvida pelo MediaResolver (blob URL ou URL pública).
    // Se for blob URL (começa com blob:) ou data URL — usa direto.
    // Se for URL pública (http/https sem .enc) — tenta carregar diretamente.
    // Não precisa de fetch com token pois o MediaResolver já resolveu.
    if (!src) return;
    if (src.startsWith("blob:") || src.startsWith("data:")) {
      setBlobUrl(src);
      return;
    }
    // Para URLs públicas do UAZAPI storage, tenta carregar diretamente
    setBlobUrl(src);
  }, [src]);

  const audioSrc = blobUrl || src || undefined;

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  };

  const handleTimeUpdate = () => {
    const a = audioRef.current;
    if (a) setCurrent(a.currentTime);
  };

  const handleLoadedMetadata = () => {
    const a = audioRef.current;
    if (a && a.duration && isFinite(a.duration)) setDuration(a.duration);
  };

  const handleEnded = () => setPlaying(false);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect || !audioRef.current) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = ratio * (duration || 0);
  };

  const progress = duration > 0 ? current / duration : 0;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl min-w-[220px] max-w-[280px] ${fromMe ? "bg-black/10" : "bg-black/5 dark:bg-white/5"}`}>
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
        style={{ background: nameToGradient(contactName) }}
      >
        {getInitials(contactName)}
      </div>

      {/* Play/Pause */}
      <button
        onClick={togglePlay}
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
      </button>

      {/* Waveform + progress */}
      <div className="flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-[2px] h-[20px]">
          {WAVEFORM_HEIGHTS.map((h, i) => {
            const filled = progress > 0 && i / WAVEFORM_HEIGHTS.length < progress;
            return (
              <div
                key={i}
                className={`rounded-full transition-all ${filled ? "bg-emerald-500" : "bg-current opacity-30"} ${playing ? "animate-pulse" : ""}`}
                style={{ width: 2, height: h, animationDelay: `${i * 40}ms`, animationDuration: "0.8s" }}
              />
            );
          })}
        </div>
        {/* Progress bar */}
        <div
          ref={progressRef}
          className="h-1 rounded-full bg-current/20 cursor-pointer"
          onClick={handleProgressClick}
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        {/* Timer */}
        <div className="text-[10px] opacity-60 flex justify-between">
          <span>{formatDuration(current)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={audioSrc}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
        className="hidden"
      />
    </div>
  );
}

// ========== ImageLightbox ==========
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = src;
    a.download = "imagem.jpg";
    a.target = "_blank";
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <button
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          title="Download"
          onClick={(e) => { e.stopPropagation(); handleDownload(); }}
        >
          <Download className="h-4 w-4" />
        </button>
        <button
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          onClick={onClose}
          title="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <img
        src={src}
        alt="Imagem ampliada"
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

// ========== EmojiPicker ==========
function EmojiPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-14 left-0 z-30 bg-card border border-border rounded-2xl shadow-xl p-3 w-[280px]"
    >
      <div className="grid grid-cols-10 gap-1">
        {EMOJIS.map((emoji, i) => (
          <button
            key={i}
            className="text-xl hover:bg-muted rounded p-0.5 transition-colors leading-none"
            onClick={() => { onSelect(emoji); }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

// ========== MediaResolver — obtém URL reproduzível para mídia UAZAPI ==========
// UAZAPI retorna mídias de 3 formas:
//   1. sendPayload.file = base64 do arquivo real → áudio/PTT já vêm assim (WebM/Opus)
//   2. content.URL = URL criptografada do CDN do WhatsApp → NÃO reproduzível
//   3. fileURL = URL pública (após chamar /message/download com return_link: true)
// Para áudio: usa base64 direto (sem precisar de API call)
// Para imagem/vídeo: chama POST /message/download com return_link: true
function base64ToUrl(b64: string, mime: string): string {
  // Cria blob URL a partir de base64 para evitar limite de tamanho de data URLs
  const byteChars = atob(b64);
  const byteArr = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArr], { type: mime });
  return URL.createObjectURL(blob);
}

function MediaResolver({
  msg, apiUrl, token, children
}: {
  msg: WaMessage;
  apiUrl: string;
  token: string;
  children: (resolvedUrl: string | null, loading: boolean) => React.ReactNode;
}) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let blobUrl: string | null = null;

    const resolve = async () => {
      // ── Caso 1: base64 já disponível (áudio/PTT do UAZAPI) ──────────────────
      if (msg.base64_data) {
        const mime = msg.mimetype || "audio/webm;codecs=opus";
        // WebM com mimetype "audio/ogg" — usa audio/webm para browser
        const playMime = mime.includes("ogg") ? "audio/webm;codecs=opus" : mime;
        blobUrl = base64ToUrl(msg.base64_data, playMime);
        setResolvedUrl(blobUrl);
        setLoading(false);
        return;
      }

      // ── Caso 2: URL já é pública e acessível (fileURL do UAZAPI storage) ────
      if (msg.media_url && !msg.media_url.includes(".enc") &&
          !msg.media_url.includes("mmg.whatsapp.net") &&
          !msg.media_url.includes("fna.whatsapp.net")) {
        setResolvedUrl(msg.media_url);
        setLoading(false);
        return;
      }

      // ── Caso 3: sem base64, chama POST /message/download ────────────────────
      // Endpoint correto da UAZAPI: POST /message/download
      // { id: messageId, return_link: true, generate_mp3: true (para áudio) }
      if (!msg.raw_message_id) {
        setResolvedUrl(msg.media_url || null);
        setLoading(false);
        return;
      }

      const type = (msg.type || "").toLowerCase();
      const isAudio = type.includes("audio") || type.includes("ptt");

      try {
        const base = apiUrl.replace(/\/$/, "");
        const r = await fetch(`${base}/message/download`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token },
          body: JSON.stringify({
            id: msg.raw_message_id,
            return_link: true,
            generate_mp3: isAudio,   // áudio vira MP3 (melhor compatibilidade)
            return_base64: false,
          }),
        });
        if (r.ok) {
          const data = await r.json();
          // Resposta: { fileURL, mimetype, base64Data, transcription }
          const url: string | undefined = data.fileURL || data.url || data.link;
          if (url) {
            setResolvedUrl(url);
          } else if (data.base64Data) {
            const mime = data.mimetype || msg.mimetype || "application/octet-stream";
            blobUrl = base64ToUrl(data.base64Data, mime);
            setResolvedUrl(blobUrl);
          } else {
            setResolvedUrl(msg.media_url || null);
          }
        } else {
          setResolvedUrl(msg.media_url || null);
        }
      } catch {
        setResolvedUrl(msg.media_url || null);
      } finally {
        setLoading(false);
      }
    };

    resolve();

    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [msg.raw_message_id, msg.base64_data, msg.media_url, apiUrl, token]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children(resolvedUrl, loading)}</>;
}

// ========== MessageContent (improved) ==========
function MessageContent({
  msg, token, apiUrl, contactName, onImageClick
}: {
  msg: WaMessage;
  token: string;
  apiUrl: string;
  contactName: string;
  onImageClick: (src: string) => void;
}) {
  const type = (msg.type || "text").toLowerCase().replace("message", "");
  const text = msg.text;

  const isImage = type.includes("image");
  const isAudio = type.includes("audio") || type.includes("ptt");
  const isVideo = type.includes("video");
  const isDoc   = type.includes("document");

  if (isImage) {
    return (
      <MediaResolver msg={msg} apiUrl={apiUrl} token={token}>
        {(url, loading) => loading ? (
          <div className="w-[200px] h-[150px] rounded-lg bg-muted animate-pulse flex items-center justify-center text-muted-foreground text-xs">Carregando imagem...</div>
        ) : url ? (
          <div className="flex flex-col gap-1">
            <img
              src={url}
              alt="Imagem"
              className="max-w-[220px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => onImageClick(url)}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
            {text && !text.startsWith("[") && <p className="text-sm mt-1">{text}</p>}
          </div>
        ) : <p className="text-sm text-muted-foreground">📷 Imagem indisponível</p>}
      </MediaResolver>
    );
  }

  if (isAudio) {
    return (
      <MediaResolver msg={msg} apiUrl={apiUrl} token={token}>
        {(url, loading) => loading ? (
          <div className="flex items-center gap-2 w-[220px] h-12 bg-muted/40 rounded-xl animate-pulse px-3">
            <div className="w-8 h-8 rounded-full bg-muted-foreground/20" />
            <div className="flex-1 h-2 bg-muted-foreground/20 rounded" />
            <div className="w-8 text-xs text-muted-foreground">...</div>
          </div>
        ) : url ? (
          <AudioPlayer src={url} token={token} fromMe={msg.from_me} contactName={contactName} />
        ) : <p className="text-sm text-muted-foreground">🎤 Áudio indisponível</p>}
      </MediaResolver>
    );
  }

  if (isVideo) {
    return (
      <MediaResolver msg={msg} apiUrl={apiUrl} token={token}>
        {(url, loading) => loading ? (
          <div className="w-[220px] h-[140px] rounded-lg bg-muted animate-pulse flex items-center justify-center text-xs text-muted-foreground">Carregando vídeo...</div>
        ) : url ? (
          <video controls className="max-w-[220px] rounded-lg" preload="metadata">
            <source src={url} />
          </video>
        ) : <p className="text-sm text-muted-foreground">🎥 Vídeo indisponível</p>}
      </MediaResolver>
    );
  }

  if (isDoc) {
    const filename = text?.replace("[Documento: ", "").replace("]", "") || "Documento";
    return (
      <MediaResolver msg={msg} apiUrl={apiUrl} token={token}>
        {(url, loading) => loading ? (
          <div className="flex items-center gap-2 p-2 bg-muted rounded-lg animate-pulse w-[180px] h-9" />
        ) : url ? (
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm underline opacity-90">
            <FileText className="h-4 w-4 shrink-0" /> {filename}
          </a>
        ) : <p className="text-sm text-muted-foreground">📎 Documento indisponível</p>}
      </MediaResolver>
    );
  }

  if (type.includes("location")) {
    return <p className="text-sm flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Localização enviada</p>;
  }

  if (type.includes("sticker")) {
    return <p className="text-sm">🎭 Sticker</p>;
  }

  const displayText = text || msgTypePreview(msg.type, "");
  return <p className="text-[13.5px] leading-[1.4] whitespace-pre-wrap break-words">{displayText}</p>;
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

  // New states
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyInfo | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [searchMsg, setSearchMsg] = useState("");
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);

  const token = wpConfig ? (wpConfig.instance_token || wpConfig.api_token) : "";

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
    const tok = wpConfig.instance_token || wpConfig.api_token;
    if (!tok) return;
    setLoadingChats(true);
    setChatError(null);
    try {
      const url = `${wpConfig.api_url.replace(/\/$/, "")}/chat/find`;
      const data = await fetchUazapi(url, tok, "POST", { limit: 50 });
      const raw: any[] = Array.isArray(data) ? data : (data.chats || data.data || data.result || []);

      let normalized = raw.map(normalizeChat).filter(c => !c.is_group && c.phone.length >= 8);

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
    const tok = wpConfig.instance_token || wpConfig.api_token;
    const fullJid = chatId.includes("@") ? chatId : `${chatId}@s.whatsapp.net`;
    setLoadingMessages(true);
    try {
      const url = `${wpConfig.api_url.replace(/\/$/, "")}/message/find`;
      const data = await fetchUazapi(url, tok, "POST", { chatid: fullJid, limit: 50 });
      const raw: any[] = Array.isArray(data) ? data : (data.messages || data.data || []);
      const normalized = raw.map(normalizeMessage);

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
    if (!wpConfig || chat.avatar_url) return;
    const tok = wpConfig.instance_token || wpConfig.api_token;
    const phone = chat.phone.startsWith("55") ? chat.phone : `55${chat.phone}`;
    try {
      const url = `${wpConfig.api_url.replace(/\/$/, "")}/contact/profilepicture`;
      const data = await fetchUazapi(url, tok, "POST", { number: phone });
      const picUrl: string | undefined =
        data?.profilePictureUrl || data?.imageUrl || data?.picture || data?.url;
      if (!picUrl) return;
      setWaChats(prev => prev.map(c => c.id === chat.id ? { ...c, avatar_url: picUrl } : c));
      if (chat.crm_client_id) {
        await supabase.from("clients").update({ avatar_url: picUrl } as any).eq("id", chat.crm_client_id);
      } else {
        const rawPhone = chat.phone;
        for (const ph of [rawPhone, rawPhone.startsWith("55") ? rawPhone.slice(2) : `55${rawPhone}`]) {
          const { data: cd } = await supabase.from("clients").select("id").eq("phone", ph).limit(1).maybeSingle();
          if (cd) { await supabase.from("clients").update({ avatar_url: picUrl } as any).eq("id", cd.id); break; }
        }
      }
    } catch { /* silent */ }
  }, [wpConfig]);

  useEffect(() => {
    if (activeChatId) {
      const chat = waChats.find(c => c.id === activeChatId);
      if (chat) fetchAndSaveProfilePicture(chat);
    }
  }, [activeChatId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll
  useEffect(() => {
    if (!showScrollDown) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [waMessages, showScrollDown]);

  // Scroll detection
  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollDown(distFromBottom > 150);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollDown(false);
  };

  // ---------- Send text ----------
  const sendMessage = async () => {
    const replyPrefix = replyTo ? `> ${replyTo.text.slice(0, 80)}\n\n` : "";
    const content = (replyPrefix + msg).trim();
    if (!content || !activeChatId || !wpConfig) return;
    setMsg("");
    setReplyTo(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const tok = wpConfig.instance_token || wpConfig.api_token;
    const phone = activeChatId.replace("@s.whatsapp.net", "").replace("@c.us", "");
    const formattedPhone = phone.startsWith("55") ? phone : `55${phone}`;

    const tempMsg: WaMessage = {
      id: `local-${Date.now()}`, from_me: true, text: content,
      timestamp: Math.floor(Date.now() / 1000), type: "text", source: "local",
    };
    setWaMessages(prev => [...prev, tempMsg]);

    try {
      const sendUrl = `${wpConfig.api_url.replace(/\/$/, "")}/send/text`;
      await fetchUazapi(sendUrl, tok, "POST", { number: formattedPhone, text: content });

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

    if (!clientId && activeChatId) {
      const rawPhone = activeChatId.replace("@s.whatsapp.net", "").replace("@c.us", "");
      for (const ph of [rawPhone, rawPhone.startsWith("55") ? rawPhone.slice(2) : `55${rawPhone}`]) {
        const { data } = await supabase.from("clients").select("id").eq("phone", ph).limit(1).maybeSingle();
        if (data) { clientId = data.id; break; }
      }
    }

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

  // ---------- Voice recording ----------
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recordingChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) recordingChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `audio_${Date.now()}.webm`, { type: "audio/webm" });
        sendMedia(file);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      toast.error("Permissão de microfone negada");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingTime(0);
  };

  // ---------- Computed ----------
  const activeChat = waChats.find(c => c.id === activeChatId);
  const activeClient = activeChat?.crm_client_id ? clients.find(c => c.id === activeChat.crm_client_id) : null;
  const filteredChats = waChats.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm)
  );

  const filteredMessages = searchMsg
    ? waMessages.filter(m => m.text?.toLowerCase().includes(searchMsg.toLowerCase()))
    : waMessages;

  const groupedMessages: { label: string; msgs: WaMessage[] }[] = [];
  filteredMessages.forEach(m => {
    const label = getDateLabel(m.timestamp);
    const last = groupedMessages[groupedMessages.length - 1];
    if (!last || last.label !== label) groupedMessages.push({ label, msgs: [m] });
    else last.msgs.push(m);
  });

  // ========== RENDER ==========

  const renderSidebar = () => (
    <div className="flex flex-col h-full" style={{ background: "hsl(var(--card))" }}>
      {/* WA-style header */}
      <div className="px-4 py-3 border-b border-border bg-emerald-600 flex items-center justify-between shrink-0">
        <span className="text-white font-bold text-[16px] tracking-wide">WhatsApp</span>
        <Dialog open={newConvOpen} onOpenChange={setNewConvOpen}>
          <DialogTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-white hover:bg-white/10">
              <Plus className="h-4 w-4" />
            </Button>
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

      {/* Search */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 bg-background text-[12.5px] border-border rounded-full"
            placeholder="Buscar conversa..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      {/* Status */}
      {wpConnected === true && (
        <div className="px-3 py-1.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-500 border-b border-border bg-emerald-500/5 shrink-0">
          <Wifi className="h-3 w-3" /> Conectado
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
          <div className="p-3 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-muted shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-muted rounded w-3/4" />
                  <div className="h-2.5 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
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
            <div key={chat.id} onClick={() => { setActiveChatId(chat.id); }}
              className={`flex items-center gap-3 px-3 py-3 cursor-pointer border-b border-border/30 transition-colors ${isActive ? "bg-primary/10" : "hover:bg-muted/40"}`}>
              {/* Avatar with gradient fallback */}
              <div
                className="w-11 h-11 rounded-full shrink-0 overflow-hidden flex items-center justify-center"
                style={{ background: chat.avatar_url ? undefined : nameToGradient(chat.name) }}
              >
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

  const renderInput = () => (
    <div className="px-3 py-2.5 border-t border-border bg-card shrink-0">
      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-muted border-l-4 border-emerald-500">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-emerald-600 mb-0.5">
              {replyTo.from_me ? "Você" : replyTo.contactName}
            </div>
            <div className="text-[12px] text-muted-foreground truncate">{replyTo.text}</div>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 relative">
        <input type="file" ref={fileInputRef} className="hidden"
          onChange={e => e.target.files?.[0] && sendMedia(e.target.files[0])} />

        {/* Left actions */}
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
          {/* Emoji button */}
          <div className="relative">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => setShowEmoji(v => !v)} title="Emoji">
              <Smile className="h-4 w-4" />
            </Button>
            {showEmoji && (
              <EmojiPicker
                onSelect={e => setMsg(prev => prev + e)}
                onClose={() => setShowEmoji(false)}
              />
            )}
          </div>
        </div>

        {/* Recording UI */}
        {isRecording ? (
          <div className="flex-1 flex items-center gap-2 rounded-2xl border border-red-400 bg-red-50 dark:bg-red-950/20 px-3.5 py-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-red-600 text-[13px] font-medium">{formatDuration(recordingTime)}</span>
            <span className="text-red-400 text-[11px]">Gravando...</span>
          </div>
        ) : (
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
        )}

        {/* Right button: send / mic / stop */}
        {isRecording ? (
          <Button
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full bg-red-500 hover:bg-red-600"
            onClick={stopRecording}
            title="Parar gravação"
          >
            <span className="w-3 h-3 rounded-sm bg-white" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full"
            onClick={msg.trim() ? sendMessage : startRecording}
            disabled={isUploading}
            title={msg.trim() ? "Enviar" : "Gravar áudio"}
          >
            {isUploading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : msg.trim()
                ? <Send className="h-4 w-4" />
                : <Mic className="h-4 w-4" />
            }
          </Button>
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
            {/* Botão voltar — só aparece em mobile (sm:hidden) via CSS, sem depender de estado JS */}
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:hidden" onClick={() => setActiveChatId(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div
              className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center shrink-0"
              style={{ background: activeChat?.avatar_url ? undefined : nameToGradient(activeChat?.name || "?") }}
            >
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
            {/* Message search toggle */}
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => { setShowMsgSearch(v => !v); setSearchMsg(""); }} title="Buscar mensagens">
              <Search className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={deleteConversation} title="Apagar conversa">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Message search bar */}
        {showMsgSearch && (
          <div className="px-4 py-2 border-b border-border bg-muted/30 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-[12.5px] rounded-full"
                placeholder="Buscar nas mensagens..."
                value={searchMsg}
                onChange={e => setSearchMsg(e.target.value)}
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Messages area */}
        <div
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-1 relative"
          style={{
            background: "hsl(var(--background))",
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%239C92AC' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          }}
        >
          {loadingMessages && (
            <div className="space-y-3 py-2">
              {[1, 2, 3].map(i => (
                <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"} animate-pulse`}>
                  <div className={`h-10 rounded-2xl bg-muted ${i % 2 === 0 ? "w-48" : "w-36"}`} />
                </div>
              ))}
            </div>
          )}

          {!loadingMessages && waMessages.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              Nenhuma mensagem. Envie a primeira!
            </div>
          )}

          {groupedMessages.map(group => (
            <div key={group.label}>
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

                // Heurística de leitura: mensagem com mais de 1 minuto
                const msgDate = tsToDate(m.timestamp);
                const isRead = msgDate ? (Date.now() - msgDate.getTime()) > 60_000 : false;

                return (
                  <div key={m.id} className={`flex group ${isMe ? "justify-end" : "justify-start"} ${isConsecutive ? "mt-0.5" : "mt-2"}`}>
                    {/* Avatar for received */}
                    {!isMe && !isConsecutive && (
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 mr-1.5 mt-auto mb-0.5"
                        style={{ background: nameToGradient(activeChat?.name || "?") }}
                      >
                        {getInitials(activeChat?.name || "?")}
                      </div>
                    )}
                    {!isMe && isConsecutive && <div className="w-6 mr-1.5 shrink-0" />}

                    <div className={`relative max-w-[72%] ${isMe ? "items-end" : "items-start"}`}>
                      {/* Bot label */}
                      {isBot && (
                        <div className="text-[10px] font-semibold mb-0.5 text-purple-500 flex items-center gap-1">
                          <Bot className="h-3 w-3" /> 🤖 Bot
                        </div>
                      )}

                      {/* Reply button on hover */}
                      <button
                        className={`absolute top-1 ${isMe ? "-left-8" : "-right-8"} opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-foreground`}
                        onClick={() => setReplyTo({
                          id: m.id,
                          from_me: m.from_me,
                          text: m.text || msgTypePreview(m.type),
                          contactName: activeChat?.name || "Contato",
                        })}
                        title="Responder"
                      >
                        <CornerUpLeft className="h-3.5 w-3.5" />
                      </button>

                      {/* Bubble */}
                      <div className={`relative px-3 py-[6px] rounded-2xl shadow-sm ${
                        isMe
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-card border border-border/60 text-foreground rounded-bl-sm"
                      }`}>
                        <MessageContent
                          msg={m}
                          token={token}
                          apiUrl={wpConfig?.api_url || ""}
                          contactName={activeChat?.name || "Contato"}
                          onImageClick={(src) => setLightboxSrc(src)}
                        />
                        {/* Time + status */}
                        <div className={`flex items-center gap-1 justify-end mt-0.5 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                          <span className="text-[10px]">{formatMsgTime(m.timestamp)}</span>
                          {isMe && (
                            m.source === "local"
                              ? <Check className="h-3 w-3 opacity-60" />
                              : isRead
                                ? <CheckCheck className="h-3 w-3 text-blue-400" />
                                : <CheckCheck className="h-3 w-3 opacity-60" />
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

        {/* Scroll to bottom button */}
        {showScrollDown && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-20 right-6 w-9 h-9 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-10"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}

        {renderInput()}
      </div>
    );
  };

  const renderContactPanel = () => {
    if (!activeChat) return null;
    return (
      <div className="w-[220px] border-l border-border bg-card flex-col shrink-0 hidden lg:flex">
        <div className="p-4 border-b border-border text-center">
          <div
            className="w-14 h-14 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold text-lg overflow-hidden"
            style={{ background: activeChat.avatar_url ? undefined : nameToGradient(activeChat.name) }}
          >
            {activeChat.avatar_url
              ? <img src={activeChat.avatar_url} alt={activeChat.name} className="w-full h-full object-cover" />
              : getInitials(activeChat.name)
            }
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

  // ─── Main layout — CSS Grid ───────────────────────────────────────────────
  // Grid garante que a sidebar SEMPRE tem exatamente 300px no desktop.
  // No mobile a lógica usa data-atributos para esconder/mostrar via CSS.
  const showSidebar  = !isMobile || !activeChatId;
  const showMessages = !isMobile || !!activeChatId;

  return (
    <div
      className="h-[calc(100vh-60px)] overflow-hidden animate-fade-in"
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "300px 1fr",
        gridTemplateRows: "1fr",
      }}
    >
      {/* Lightbox */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      {/* SIDEBAR — coluna fixa 300px no desktop, nunca encolhe */}
      <div
        className="border-r border-border flex flex-col overflow-hidden bg-background"
        style={{
          display: showSidebar ? "flex" : "none",
          gridColumn: 1,
          gridRow: 1,
          minWidth: 0,
        }}
      >
        {renderSidebar()}
      </div>

      {/* ÁREA DE MENSAGENS — coluna flex-1 no desktop */}
      <div
        className="flex flex-col overflow-hidden"
        style={{
          display: showMessages ? "flex" : "none",
          gridColumn: isMobile ? 1 : 2,
          gridRow: 1,
          minWidth: 0,
        }}
      >
        <div className="flex flex-1 min-h-0 overflow-hidden relative">
          {renderMessages()}
          {renderContactPanel()}
        </div>
      </div>
    </div>
  );
}
