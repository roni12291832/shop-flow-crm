import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smartphone, QrCode, Wifi, WifiOff, RefreshCw, MessageSquare } from "lucide-react";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

type State = "disconnected" | "connecting" | "connected";

export default function WhatsAppConnect() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>("disconnected");
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/whatsapp/management/status`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.connected) {
        setState("connected");
        setQr(null);
        stopPoll();
      } else if (data.hasQr) {
        setState("connecting");
        const qrRes = await fetch(`${API_URL}/whatsapp/management/qr`);
        const qrData = await qrRes.json();
        if (qrData.qr) setQr(qrData.qr);
      }
    } catch (_) {}
  };

  // Polling enquanto aguardando QR
  useEffect(() => {
    if (state === "connecting") {
      pollRef.current = setInterval(fetchStatus, 3000);
    } else {
      stopPoll();
    }
    return stopPoll;
  }, [state]);

  // Verifica status inicial
  useEffect(() => { fetchStatus(); }, []);

  const handleConnect = async () => {
    setLoading(true);
    setQr(null);
    setState("connecting");
    try {
      await fetch(`${API_URL}/whatsapp/management/connect`, { method: "POST" });
      toast.info("Gerando QR Code...");
      // Aguarda 3s para neonize gerar o QR e então busca
      await new Promise(r => setTimeout(r, 3000));
      await fetchStatus();
    } catch {
      toast.error("Erro ao iniciar conexão. Verifique o servidor.");
      setState("disconnected");
    }
    setLoading(false);
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await fetch(`${API_URL}/whatsapp/management/disconnect`, { method: "POST" });
      setState("disconnected");
      setQr(null);
      toast.info("WhatsApp desconectado");
    } catch {
      toast.error("Erro ao desconectar");
    }
    setLoading(false);
  };

  const handleRefresh = async () => {
    setLoading(true);
    await fetchStatus();
    setLoading(false);
  };

  return (
    <div className="p-4 md:p-7 space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-foreground font-bold text-xl flex items-center gap-2">
          <Smartphone className="h-5 w-5" /> Conexão WhatsApp
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Conecte o WhatsApp da loja para receber e enviar mensagens automaticamente
        </p>
      </div>

      {/* Status */}
      <div className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between">
        <span className="text-foreground font-semibold text-sm">Status</span>
        <Badge className={`border-0 gap-1 ${
          state === "connected" ? "bg-green-500/20 text-green-400" :
          state === "connecting" ? "bg-yellow-500/20 text-yellow-400" :
          "bg-red-500/20 text-red-400"
        }`}>
          {state === "connected" && <><Wifi className="h-3 w-3" /> Conectado</>}
          {state === "connecting" && <><RefreshCw className="h-3 w-3 animate-spin" /> Aguardando QR</>}
          {state === "disconnected" && <><WifiOff className="h-3 w-3" /> Desconectado</>}
        </Badge>
      </div>

      {/* QR Code */}
      <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center gap-5">
        <h3 className="text-foreground font-bold text-base flex items-center gap-2">
          <QrCode className="h-5 w-5" /> QR Code WhatsApp
        </h3>

        {state === "connected" ? (
          <div className="text-center py-6">
            <Wifi className="h-16 w-16 mx-auto mb-3 text-green-400" />
            <p className="text-foreground font-semibold">WhatsApp conectado!</p>
            <p className="text-muted-foreground text-sm mt-1">Recebendo mensagens automaticamente</p>
          </div>
        ) : qr ? (
          <div className="bg-white rounded-2xl p-4 shadow">
            <img src={qr} alt="QR Code WhatsApp" className="w-64 h-64" />
          </div>
        ) : (
          <div className="text-center py-8">
            <QrCode className="h-16 w-16 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground text-sm">
              {state === "connecting" ? "Gerando QR Code..." : 'Clique em "Conectar" para gerar o QR Code'}
            </p>
          </div>
        )}

        <div className="flex gap-3 flex-wrap justify-center">
          {state !== "connected" && (
            <Button onClick={handleConnect} disabled={loading} className="gap-2">
              <QrCode className="h-4 w-4" />
              {loading ? "Aguarde..." : "Conectar WhatsApp"}
            </Button>
          )}
          {state === "connected" && (
            <Button
              onClick={() => navigate("/chat")}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              <MessageSquare className="h-4 w-4" /> Abrir Chat
            </Button>
          )}
          <Button onClick={handleRefresh} disabled={loading} variant="outline" className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Verificar Status
          </Button>
          {state === "connected" && (
            <Button variant="destructive" onClick={handleDisconnect} disabled={loading} className="gap-2">
              <WifiOff className="h-4 w-4" /> Desconectar
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center max-w-xs">
          Abra o WhatsApp no celular → Menu → Dispositivos Conectados → Conectar Dispositivo → Escaneie o QR
        </p>
      </div>
    </div>
  );
}
