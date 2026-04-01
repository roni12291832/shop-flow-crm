import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smartphone, QrCode, Wifi, WifiOff, RefreshCw, MessageSquare, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

type ConnStatus = "disconnected" | "connecting" | "connected";

export default function WhatsAppConnect() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<ConnStatus>("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Carrega status inicial do banco
  useEffect(() => {
    supabase.from("whatsapp_instances").select("status").limit(1).maybeSingle().then(({ data }) => {
      if (data?.status === "connected") setStatus("connected");
    });
  }, []);

  // Polling de status quando connecting
  useEffect(() => {
    if (status === "connecting") {
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/whatsapp/management/qr`);
          const data = await res.json();
          if (data.qr) setQrCode(data.qr);
          if (data.connected) {
            setStatus("connected");
            setQrCode(null);
            setLoading(false);
            toast.success("WhatsApp conectado!");
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch (_) {}
      }, 2500);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status]);

  const handleConnect = async () => {
    setLoading(true);
    setQrCode(null);
    setStatus("connecting");
    try {
      await fetch(`${API_URL}/whatsapp/management/connect`, { method: "POST" });
      toast.info("Gerando QR Code...");
      // Aguarda um pouco e busca o QR
      await new Promise(r => setTimeout(r, 2000));
      const res = await fetch(`${API_URL}/whatsapp/management/qr`);
      const data = await res.json();
      if (data.qr) {
        setQrCode(data.qr);
        toast.success("QR Code gerado! Escaneie com o WhatsApp.");
      }
    } catch (e) {
      toast.error("Erro ao iniciar conexão");
      setStatus("disconnected");
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await fetch(`${API_URL}/whatsapp/management/disconnect`, { method: "POST" });
      setStatus("disconnected");
      setQrCode(null);
      toast.info("WhatsApp desconectado");
    } catch (_) {
      toast.error("Erro ao desconectar");
    }
    setLoading(false);
  };

  const handleCheckStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/whatsapp/management/status`);
      const data = await res.json();
      if (data.connected) {
        setStatus("connected");
        toast.success("WhatsApp está conectado!");
      } else if (data.hasQr) {
        setStatus("connecting");
        const qrRes = await fetch(`${API_URL}/whatsapp/management/qr`);
        const qrData = await qrRes.json();
        if (qrData.qr) setQrCode(qrData.qr);
        toast.info("QR Code disponível — escaneie para conectar");
      } else {
        setStatus("disconnected");
        toast.error("WhatsApp desconectado");
      }
    } catch (_) {
      toast.error("Não foi possível verificar o status");
    }
    setLoading(false);
  };

  return (
    <div className="p-4 md:p-7 space-y-7 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-foreground font-bold text-xl flex items-center gap-2">
          <Smartphone className="h-5 w-5" /> Conexão WhatsApp
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Conecte o WhatsApp da loja para receber leads automaticamente
        </p>
      </div>

      {/* Status */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-foreground font-bold text-base">Status da Conexão</h3>
          <Badge className={`border-0 ${
            status === "connected" ? "bg-chart-2/20 text-chart-2" :
            status === "connecting" ? "bg-chart-3/20 text-chart-3" :
            "bg-destructive/20 text-destructive"
          }`}>
            {status === "connected" && <><Wifi className="h-3 w-3 mr-1" /> Conectado</>}
            {status === "connecting" && <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Aguardando QR</>}
            {status === "disconnected" && <><WifiOff className="h-3 w-3 mr-1" /> Desconectado</>}
          </Badge>
        </div>

        {status === "connected" && (
          <div className="bg-chart-2/10 border border-chart-2/30 rounded-xl p-4 text-sm text-chart-2">
            WhatsApp conectado! Leads chegando automaticamente.
          </div>
        )}

        <div className="bg-secondary/50 border border-border rounded-xl p-4 text-sm text-muted-foreground flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-chart-3" />
          <div>
            <p className="font-semibold text-foreground mb-1">Conexão Persistente</p>
            <p>A conexão é mantida pelo servidor. Não precisa manter esta tela aberta. Após um novo deploy, pode ser necessário escanear o QR novamente.</p>
          </div>
        </div>
      </div>

      {/* QR Code */}
      <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center gap-4">
        <h3 className="text-foreground font-bold text-base flex items-center gap-2">
          <QrCode className="h-5 w-5" /> QR Code WhatsApp
        </h3>

        {qrCode ? (
          <div className="bg-white rounded-2xl p-4">
            <img
              src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
              alt="QR Code"
              className="w-64 h-64"
            />
          </div>
        ) : status === "connected" ? (
          <div className="text-center py-8">
            <Wifi className="h-16 w-16 mx-auto mb-3 text-chart-2" />
            <p className="text-foreground font-semibold">WhatsApp conectado!</p>
            <p className="text-muted-foreground text-sm mt-1">Recebendo leads automaticamente</p>
          </div>
        ) : (
          <div className="text-center py-8">
            <QrCode className="h-16 w-16 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground text-sm">
              Clique em "Conectar WhatsApp" para gerar o QR Code
            </p>
          </div>
        )}

        <div className="flex gap-3 flex-wrap justify-center">
          {status !== "connected" && (
            <Button onClick={handleConnect} disabled={loading} className="gap-1.5">
              <QrCode className="h-4 w-4" />
              {loading ? "Conectando..." : "Conectar WhatsApp"}
            </Button>
          )}
          {status === "connected" && (
            <Button
              onClick={() => navigate("/chat")}
              className="gap-1.5 bg-chart-2 hover:bg-chart-2/80"
            >
              <MessageSquare className="h-4 w-4" /> Abrir WhatsApp
            </Button>
          )}
          <Button onClick={handleCheckStatus} disabled={loading} variant="outline" className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Verificar Status
          </Button>
          {status === "connected" && (
            <Button variant="destructive" onClick={handleDisconnect} disabled={loading} className="gap-1.5">
              <WifiOff className="h-4 w-4" /> Desconectar
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center max-w-md">
          Abra o WhatsApp no celular → Menu → Dispositivos Conectados → Conectar Dispositivo → Escaneie o QR Code
        </p>
      </div>
    </div>
  );
}
