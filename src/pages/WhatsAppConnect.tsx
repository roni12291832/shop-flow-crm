import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Smartphone, QrCode, Wifi, WifiOff, RefreshCw, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function WhatsAppConnect() {
  const {  hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [apiUrl, setApiUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [instanceName, setInstanceName] = useState("");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dbRecordId, setDbRecordId] = useState<string | null>(null);

  // Load saved config from DB
  useEffect(() => {
    const fetchConfig = async () => {
            
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("*")
        
        .maybeSingle();

      if (data) {
        setDbRecordId(data.id);
        setApiUrl(data.api_url);
        setApiToken(data.api_token);
        setInstanceName(data.instance_name);
        setStatus((data.status as any) || "disconnected");
        setSaved(true);
      }
    };
    fetchConfig();
  }, []);

  const saveConfig = async () => {
    if (!apiUrl || !apiToken || !instanceName) {
      toast.error("Preencha todos os campos");
      return;
    }
    
    setLoading(true);
    
    let error;
    if (dbRecordId) {
      const res = await supabase.from("whatsapp_instances").update({
        api_url: apiUrl,
        api_token: apiToken,
        instance_name: instanceName,
        status,
      }).eq("id", dbRecordId);
      error = res.error;
    } else {
      const res = await supabase.from("whatsapp_instances").insert({
        api_url: apiUrl,
        api_token: apiToken,
        instance_name: instanceName,
        status,
      }).select().single();
      error = res.error;
      if (res.data) setDbRecordId(res.data.id);
    }

    setLoading(false);
    
    if (error) {
      toast.error("Erro ao salvar no banco");
      console.error(error);
      return;
    }
    
    setSaved(true);
    toast.success("Configuração salva no banco de dados!");
  };

  const updateStatusInDb = async (newStatus: string) => {
    if (dbRecordId) {
      await supabase.from("whatsapp_instances").update({ status: newStatus }).eq("id", dbRecordId);
    }
    setStatus(newStatus as "disconnected" | "connecting" | "connected");
  };

  const checkStatus = async () => {
    if (!apiUrl || !apiToken || !instanceName) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/instance/status/${instanceName}`, {
        headers: { "Authorization": `Bearer ${apiToken}` },
      });
      const data = await res.json();
      if (data?.status === "open" || data?.instance?.state === "open") {
        await updateStatusInDb("connected");
        setQrCode(null);
      } else {
        await updateStatusInDb("disconnected");
      }
    } catch {
      await updateStatusInDb("disconnected");
    }
    setLoading(false);
  };

  const generateQR = async () => {
    if (!apiUrl || !apiToken || !instanceName) {
      toast.error("Configure a API primeiro");
      return;
    }
    setLoading(true);
    await updateStatusInDb("connecting");
    try {
      // Try to create instance first
      await fetch(`${apiUrl}/instance/create`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ instanceName, qrcode: true }),
      });

      // --- AUTO-CONFIG WEBHOOK (Zero-Touch Setup) ---
      // We set the webhook to point to the Render backend automatically
      const webhookUrl = "https://shop-flow-crm-noleto.onrender.com/webhook/uzapi";
      try {
        await fetch(`${apiUrl}/webhook/set/${instanceName}`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            enabled: true,
            url: webhookUrl,
            webhookByEvents: false,
            events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE"]
          }),
        });
        console.log("Webhook auto-configured to:", webhookUrl);
      } catch (webhookErr) {
        console.error("Failed to auto-configure webhook (not fatal):", webhookErr);
      }

      // Then get QR code
      const res = await fetch(`${apiUrl}/instance/connect/${instanceName}`, {
        headers: { "Authorization": `Bearer ${apiToken}` },
      });
      const data = await res.json();
      
      if (data?.base64 || data?.qrcode?.base64) {
        setQrCode(data.base64 || data.qrcode.base64);
        toast.success("QR Code gerado! Escaneie com o WhatsApp");
      } else if (data?.instance?.state === "open") {
        await updateStatusInDb("connected");
        toast.success("WhatsApp já está conectado!");
      } else {
        toast.error("Não foi possível gerar o QR Code");
        await updateStatusInDb("disconnected");
      }
    } catch (err) {
      toast.error("Erro ao conectar com a API UAZAPI");
      await updateStatusInDb("disconnected");
    }
    setLoading(false);
  };

  const disconnect = async () => {
    if (!apiUrl || !apiToken || !instanceName) return;
    setLoading(true);
    try {
      await fetch(`${apiUrl}/instance/logout/${instanceName}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${apiToken}` },
      });
      await updateStatusInDb("disconnected");
      setQrCode(null);
      toast.info("WhatsApp desconectado");
    } catch {
      toast.error("Erro ao desconectar");
    }
    setLoading(false);
  };

  return (
    <div className="p-4 md:p-7 space-y-7 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-foreground font-bold text-xl flex items-center gap-2">
          <Smartphone className="h-5 w-5" /> Conexão WhatsApp
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Conecte o WhatsApp da loja para receber leads automaticamente</p>
      </div>

      {/* Status card */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-foreground font-bold text-base">Status da Conexão</h3>
          <Badge className={`border-0 ${
            status === "connected" ? "bg-chart-2/20 text-chart-2" :
            status === "connecting" ? "bg-chart-3/20 text-chart-3" :
            "bg-destructive/20 text-destructive"
          }`}>
            {status === "connected" && <><Wifi className="h-3 w-3 mr-1" /> Conectado</>}
            {status === "connecting" && <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Conectando</>}
            {status === "disconnected" && <><WifiOff className="h-3 w-3 mr-1" /> Desconectado</>}
          </Badge>
        </div>

        {status === "connected" && (
          <div className="bg-chart-2/10 border border-chart-2/30 rounded-xl p-4 text-sm text-chart-2 mb-4">
            ✅ WhatsApp conectado! Seu CRM já pode enviar e receber mensagens automaticamente.
          </div>
        )}

        <div className="bg-secondary/50 border border-border rounded-xl p-4 text-sm text-muted-foreground mb-4 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-chart-3" />
          <div>
            <p className="font-semibold text-foreground mb-1">Conexão Persistente</p>
            <p>Seus dados de conexão são protegidos no banco de dados. Qualquer atendente da loja pode usar a mesma conexão para enviar mensagens. Não é necessário manter a tela aberta.</p>
          </div>
        </div>
      </div>

      {/* API Config */}
      {isAdmin && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h3 className="text-foreground font-bold text-base">Configuração UAZAPI / Evolution</h3>
          <div className="space-y-2">
            <Label>URL da API</Label>
            <Input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://sua-instancia.uazapi.com" />
          </div>
          <div className="space-y-2">
            <Label>Token da API</Label>
            <Input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} placeholder="Seu token de acesso" />
          </div>
          <div className="space-y-2">
            <Label>Nome da Instância</Label>
            <Input value={instanceName} onChange={e => setInstanceName(e.target.value)} placeholder="minha-loja" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={saveConfig} className="gap-1.5"><Save className="h-4 w-4" /> Salvar Config</Button>
            {saved && <Button variant="outline" onClick={checkStatus} disabled={loading} className="gap-1.5"><RefreshCw className="h-4 w-4" /> Verificar Status</Button>}
          </div>
        </div>
      )}

      {/* QR Code */}
      {saved && (
        <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center gap-4">
          <h3 className="text-foreground font-bold text-base flex items-center gap-2"><QrCode className="h-5 w-5" /> QR Code WhatsApp</h3>
          
          {qrCode ? (
            <div className="bg-white rounded-2xl p-4">
              <img src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR Code" className="w-64 h-64" />
            </div>
          ) : status === "connected" ? (
            <div className="text-center py-8">
              <Wifi className="h-16 w-16 mx-auto mb-3 text-chart-2" />
              <p className="text-foreground font-semibold">WhatsApp conectado com sucesso!</p>
              <p className="text-muted-foreground text-sm mt-1">Os leads estão sendo recebidos automaticamente</p>
            </div>
          ) : (
            <div className="text-center py-8">
              <QrCode className="h-16 w-16 mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="text-muted-foreground text-sm">Clique no botão abaixo para gerar o QR Code</p>
            </div>
          )}

          <div className="flex gap-3">
            {status !== "connected" && (
              <Button onClick={generateQR} disabled={loading} className="gap-1.5">
                <QrCode className="h-4 w-4" /> {loading ? "Gerando..." : "Gerar QR Code"}
              </Button>
            )}
            {status === "connected" && (
              <Button variant="destructive" onClick={disconnect} disabled={loading} className="gap-1.5">
                <WifiOff className="h-4 w-4" /> Desconectar
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center max-w-md mt-2">
            Abra o WhatsApp no celular → Menu (⋮) → Dispositivos Conectados → Conectar Dispositivo → Escaneie o QR Code acima
          </p>
        </div>
      )}
    </div>
  );
}
