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
  const [apiUrl, setApiUrl] = useState("https://nexaflow.uazapi.com");
  const [apiToken, setApiToken] = useState("z6hUzjbsDoZKwYzUr3l8rRbDavfG6tgr55ifG4IdIl82w2cSfY");
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
    
    // Auto-save/update config if needed before generating QR
    if (!dbRecordId || saved === false) {
      await saveConfig();
    }

    await updateStatusInDb("connecting");
    try {
      const headers = {
        "apikey": apiToken,
        "Content-Type": "application/json",
      };

      // --- STEP 1: INITIALIZE INSTANCE ---
      const createRes = await fetch(`${apiUrl}/instance/init`, {
        method: "POST",
        headers: {
          ...headers,
          "admintoken": apiToken
        },
        body: JSON.stringify({ name: instanceName }),
      });
      
      if (createRes.status === 401 || createRes.status === 403) {
        throw new Error("Token da API inválido (Verifique o admintoken no painel)");
      }

      let createData: any = {};
      if (createRes.ok) {
        createData = await createRes.json().catch(() => ({}));
        console.log("Instância Criada/Iniciada:", createData);
      } else if (createRes.status !== 409 && createRes.status !== 400) {
        throw new Error(`Erro ${createRes.status} no servidor ao criar conexão`);
      }

      // Tenta achar o token da instância (padrão v2 UAZAPI)
      // Pode vir em createData.instance.token, createData.hash.token, ou ser a propria global apikey
      const instanceToken = createData?.instance?.token || createData?.hash?.token || createData?.token || apiToken;

      await new Promise(resolve => setTimeout(resolve, 1500));

      // --- STEP 2: CONNECT INSTANCE & GET QR CODE ---
      let connectData = null;

      // Faz a chamada oficial V2 POST /instance/connect
      try {
        const res = await fetch(`${apiUrl}/instance/connect`, { 
          method: "POST", 
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "token": instanceToken,
            "admintoken": apiToken,
            "apikey": apiToken
          },
          body: JSON.stringify({ "base64": true })
        });
        if (res.ok) {
          connectData = await res.json();
          console.log("Connect Data (POST /instance/connect):", connectData);
        }
      } catch(e) {
        console.log("Falha no POST /instance/connect", e);
      }

      // Se falhar ou não trouxer QR, tenta o V2 GET /instance/status
      const hasQr = (d: any) => d?.base64 || d?.qrcode || d?.instance?.qrcode || d?.instance?.base64;

      if (!hasQr(connectData)) {
        try {
          const statusRes = await fetch(`${apiUrl}/instance/status`, {
            method: "GET",
            headers: {
              "Accept": "application/json",
              "token": instanceToken,
              "admintoken": apiToken,
              "apikey": apiToken
            }
          });
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            console.log("Status Data (GET /instance/status):", statusData);
            if (hasQr(statusData)) {
              connectData = statusData;
            }
          }
        } catch(e) {}
      }

      // Se todas as rotas V2 puras falharem, tenta as rotas mistas/antigas
      if (!hasQr(connectData)) {
        try {
          const fallbackRes = await fetch(`${apiUrl}/instance/connect/${instanceName}`, { method: "GET", headers: { ...headers, "apikey": apiToken, "admintoken": apiToken, "token": instanceToken }});
          if (fallbackRes.ok) connectData = await fallbackRes.json();
        } catch (e) {}
      }

      processQrData(connectData || createData);
      
      function processQrData(data: any) {
        if (!data) {
           toast.error("Não recebemos dados do QR Code");
           updateStatusInDb("disconnected");
           return;
        }
        
        const qrString = data?.base64 || data?.qrcode?.base64 || data?.qrcode || data?.instance?.qrcode || data?.instance?.base64;
        
        if (qrString) {
          setQrCode(qrString);
          toast.success("QR Code gerado! Escaneie com o WhatsApp");
        } else if (data?.instance?.state === "open" || data?.connected || data?.instance?.status === "connected") {
          updateStatusInDb("connected");
          toast.success("WhatsApp já está conectado!");
        } else {
          toast.error("Não foi possível gerar o QR Code (veja o console)");
          updateStatusInDb("disconnected");
        }
      }
      
    } catch (err: any) {
      console.error("Connection Error:", err);
      toast.error(`Erro na API UAZAPI: ${err.message || "Verifique a URL e o Token"}`);
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

      {/* API Config - Hidden for regular UX, but kept for full transparency for Admins if needed */}
      {isAdmin && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-foreground font-bold text-base">Configuração do Sistema</h3>
            <Badge variant="outline" className="text-[10px] opacity-70">Admin Only</Badge>
          </div>
          
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-xs text-primary mb-2">
            ℹ️ A conexão utiliza a API Central da UAZAPI. Você só precisa definir o Nome da Instância abaixo.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome da Instância (Obrigatório)</Label>
              <Input 
                value={instanceName} 
                onChange={e => {
                  setInstanceName(e.target.value);
                  setSaved(false);
                }} 
                placeholder="Ex: minha-loja-ag" 
                className="bg-background border-primary/30"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={saveConfig} className="gap-1.5 w-full"><Save className="h-4 w-4" /> Registrar Instância</Button>
            </div>
          </div>

          {/* Hidden fields for convenience but accessible if needed to change */}
          <details className="mt-4">
            <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-primary">Configurações Avançadas de API</summary>
            <div className="pt-4 space-y-4">
              <div className="space-y-2">
                <Label>URL da API</Label>
                <Input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://sua-instancia.uazapi.com" />
              </div>
              <div className="space-y-2">
                <Label>Token da API</Label>
                <Input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} placeholder="Seu token de acesso" />
              </div>
            </div>
          </details>
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
