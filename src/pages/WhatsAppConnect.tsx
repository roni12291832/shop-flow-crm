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
  const [instanceToken, setInstanceToken] = useState<string>("");
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const addLog = (msg: string, data?: any) => {
    const logStr = data ? `${msg} | Data: ${JSON.stringify(data)}` : msg;
    console.log("[WA-DEBUG]", logStr);
    setDebugLogs(prev => [...prev, logStr]);
  };

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
        setInstanceToken(data.instance_token || "");
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
        instance_token: instanceToken,
        status,
      }).eq("id", dbRecordId);
      error = res.error;
    } else {
      const res = await supabase.from("whatsapp_instances").insert({
        api_url: apiUrl,
        api_token: apiToken,
        instance_name: instanceName,
        instance_token: instanceToken,
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

  const updateStatusInDb = async (newStatus: string, tokenToSave?: string) => {
    const updateData: any = { status: newStatus };
    if (tokenToSave) updateData.instance_token = tokenToSave;
    
    if (dbRecordId) {
      await supabase.from("whatsapp_instances").update(updateData).eq("id", dbRecordId);
    }
    setStatus(newStatus as "disconnected" | "connecting" | "connected");
    if (tokenToSave) setInstanceToken(tokenToSave);
  };

  const isOpen = (data: any): boolean => {
    // Formato uazapiGO (Data.connected === true ou Data.status.connected === true)
    if (data?.connected === true) return true;
    if (data?.instance?.connected === true) return true;
    if (data?.status?.connected === true) return true;
    
    const state =
      data?.instance?.state ||
      data?.instance?.status ||
      data?.state ||
      data?.status;
    return state === "open" || state === "connected";
  };

  const checkStatus = async () => {
    if (!apiUrl || !apiToken || !instanceName) return;
    setLoading(true);
    setDebugLogs([]);
    addLog(`Verificando status da instância: ${instanceName}`);

    const attempts = [
      {
        label: "uazapiGO: status + token header",
        url: `${apiUrl}/instance/status`,
        headers: { "token": instanceToken || apiToken },
      },
      {
        label: "connectionState + apikey",
        url: `${apiUrl}/instance/connectionState/${instanceName}`,
        headers: { "apikey": apiToken },
      },
      {
        label: "status + apikey",
        url: `${apiUrl}/instance/status/${instanceName}`,
        headers: { "apikey": apiToken },
      },
    ];

    for (const attempt of attempts) {
      try {
        addLog(`Tentando [${attempt.label}]: GET ${attempt.url}`);
        const res = await fetch(attempt.url, { headers: attempt.headers });
        addLog(`HTTP ${res.status}`);
        const text = await res.text();
        addLog(`Resposta: ${text}`);

        if (res.ok) {
          const data = JSON.parse(text);
          if (isOpen(data)) {
            addLog(`Conectado detectado via [${attempt.label}]!`);
            await updateStatusInDb("connected");
            setQrCode(null);
            toast.success("WhatsApp conectado!");
            setLoading(false);
            return;
          }
          addLog(`Estado não reconhecido como conectado. JSON: ${JSON.stringify(data)}`);
        }
      } catch (e: any) {
        addLog(`Erro em [${attempt.label}]: ${e.message}`);
      }
    }

    addLog("Nenhum endpoint retornou estado 'open' ou 'connected'. Veja os logs acima.");
    await updateStatusInDb("disconnected");
    toast.error("WhatsApp não reconhecido como conectado. Veja os logs abaixo.");
    setLoading(false);
  };

  const generateQR = async () => {
    if (!apiUrl || !apiToken || !instanceName) {
      toast.error("Configure a API primeiro");
      return;
    }
    setLoading(true);
    setDebugLogs([]); // Clear previous logs
    addLog(`Iniciando geração de QR para a instância: ${instanceName}`);
    
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

      addLog(`[STEP 1] POST /instance/init com nome: ${instanceName}`);
      // --- STEP 1: INITIALIZE INSTANCE ---
      const createRes = await fetch(`${apiUrl}/instance/init`, {
        method: "POST",
        headers: {
          ...headers,
          "admintoken": apiToken
        },
        body: JSON.stringify({ name: instanceName }),
      });
      
      const statusText1 = createRes.status;
      addLog(`[STEP 1] Init HTTP Status: ${statusText1}`);

      if (createRes.status === 401 || createRes.status === 403) {
        throw new Error("Token da API inválido (Verifique o admintoken no painel)");
      }

      let createData: any = {};
      if (createRes.ok) {
        const textData = await createRes.text();
        try { createData = JSON.parse(textData); } catch(e) {}
        addLog("[STEP 1] Instância Criada/Iniciada", createData);
      } else if (createRes.status !== 409 && createRes.status !== 400) {
        const errText = await createRes.text().catch(() => "");
        addLog(`[STEP 1] Erro do Servidor`, errText);
        throw new Error(`Erro ${createRes.status} no servidor ao criar conexão`);
      }

      // Tenta achar o token da instância (padrão v2 UAZAPI)
      // Pode vir em createData.instance.token, createData.hash.token, ou ser a propria global apikey
      const currentInstanceToken = createData?.instance?.token || createData?.hash?.token || createData?.token || apiToken;
      addLog(`[Token] Usando token da instância: ${currentInstanceToken ? currentInstanceToken.substring(0,8) + '...' : 'Vazio'}`);
      setInstanceToken(currentInstanceToken);

      await new Promise(resolve => setTimeout(resolve, 1500));

      // --- STEP 2: CONNECT INSTANCE & POLLING FOR QR CODE ---
      let connectData: any = null;

      addLog(`[STEP 2] POST /instance/connect`);
      // Chama POST /instance/connect para iniciar a Engine do WhatsApp na UAZAPI
      try {
        const res = await fetch(`${apiUrl}/instance/connect`, { 
          method: "POST", 
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "token": currentInstanceToken,
            "admintoken": apiToken,
            "apikey": apiToken
          },
          body: JSON.stringify({ "base64": true })
        });
        const connText = await res.text();
        addLog(`[STEP 2] Response Status: ${res.status}`);
        try {
          connectData = JSON.parse(connText);
          addLog("[STEP 2] Connect Data", connectData);
        } catch(e) {
          addLog(`[STEP 2] Resposta Não-JSON`, connText);
        }
      } catch(e: any) {
        addLog(`[STEP 2] Falha na requisição fetch: ${e.message}`, e);
      }

      const hasQr = (d: any) => d?.base64 || d?.qrcode || d?.instance?.qrcode || d?.instance?.base64;

      // Se a resposta imediata trouxer o QR Code, já exibe na tela
      let foundQr = hasQr(connectData);
      if (foundQr) {
        addLog(`[Polling] QR Code encontrado instantaneamente no passo 2!`);
        const qrString = connectData?.base64 || connectData?.qrcode?.base64 || connectData?.qrcode || connectData?.instance?.qrcode || connectData?.instance?.base64;
        setQrCode(qrString);
        toast.success("QR Code gerado! Escaneie com o WhatsApp");
      }

      let maxAttempts = 60; // 60 tentativas x 2 segundos = 120 segundos (~2 minutos para scannear)
      let isConnected = isOpen(connectData);

      addLog(`[Polling] Iniciando monitoramento da conexão (Até 120s)...`);

      // Fica verificando o status da conexão até que a pessoa escaneie e conecte (ou dê timeout)
      while (!isConnected && maxAttempts > 0) {
        addLog(`[Polling] Aguardando 2s (Tentativas restantes: ${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        maxAttempts--;
        try {
          // Tenta primeiro o endpoint sugerido pelo diagnóstico: /instance/status com token
          const statusRes = await fetch(`${apiUrl}/instance/status`, {
            method: "GET",
            headers: {
              "Accept": "application/json",
              "token": currentInstanceToken || apiToken,
            }
          });
          const textRes = await statusRes.text();
          addLog(`[Polling] Status Req HTTP: ${statusRes.status}`, textRes);

          if (statusRes.ok) {
            try {
              const statusData = JSON.parse(textRes);
              if (isOpen(statusData)) {
                connectData = statusData;
                isConnected = true;
                addLog(`[Polling] Conexão detectada — WhatsApp conectado com SUCESSO!`);
                break;
              } else if (!foundQr && hasQr(statusData)) {
                // Se ainda não tínhamos o QR e ele apareceu agora, mostra na tela
                foundQr = true;
                connectData = statusData;
                const qrString = statusData?.base64 || statusData?.qrcode?.base64 || statusData?.qrcode || statusData?.instance?.qrcode || statusData?.instance?.base64;
                setQrCode(qrString);
                toast.success("QR Code gerado! Escaneie com o WhatsApp");
                addLog(`[Polling] QR Code recebido com sucesso no polling!`);
              }
            } catch(e) {}
          }
        } catch(e: any) {
          addLog(`[Polling] Erro HTTP no status: ${e.message}`);
        }
      }

      if (isConnected) {
        addLog(`[ProcessQR] Instância conectada!`);
        await updateStatusInDb("connected", currentInstanceToken);
        setQrCode(null);
        toast.success("WhatsApp conectado com sucesso!");
        
        // --- AUTO CONFIGURAÇÃO DE WEBHOOK (UAZAPI v2) ---
        try {
          addLog("[Webhook] Iniciando configuração automática v2...");
          const webhookUrl = "https://shop-flow-crm-noleto.onrender.com/webhook/uzapi";
          
          // UAZAPI v2 usa POST /webhook com o 'token' da instância
          const url = `${apiUrl}/webhook`;
          addLog(`[Webhook] Configurando via POST ${url}`);
          
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "token": currentInstanceToken || apiToken,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              enabled: true,
              url: webhookUrl,
              events: ["messages", "connection"],
              excludeMessages: ["wasSentByApi"]
            })
          });
          
          if (res.ok) {
            addLog(`[Webhook] ✅ Configurado com sucesso!`);
            toast.success("Integração de mensagens ativada!");
          } else {
            const errText = await res.text();
            addLog(`[Webhook] ❌ Falha (${res.status}): ${errText}`);
            // Fallback para outros endpoints caso seja versão antiga
            const fallbackEndpoints = [
              `${apiUrl}/webhook/instance/${instanceName}`,
              `${apiUrl}/instance/webhook/${instanceName}`,
            ];
            for (const fUrl of fallbackEndpoints) {
                const fRes = await fetch(fUrl, {
                    method: "POST",
                    headers: { "apikey": apiToken, "Content-Type": "application/json" },
                    body: JSON.stringify({ url: webhookUrl, enabled: true, events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"] })
                });
                if (fRes.ok) { addLog(`[Webhook] ✅ Configurado via fallback: ${fUrl}`); break; }
            }
          }
        } catch (e: any) {
          addLog(`[Webhook] Erro crítico na configuração: ${e.message}`);
        }
      } else {
        addLog(`[ProcessQR] Tempo esgotado para escanear o QR Code.`);
        updateStatusInDb("disconnected");
        toast.error("Tempo esgotado para conectar. Tente gerar novamente.");
      }
      
    } catch (err: any) {
      addLog(`[ERRO FATAL]`, err.message || err.toString());
      console.error("Connection Error:", err);
      toast.error(`Erro na conexão. Veja os logs de depuração para detalhes.`);
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
        headers: { "apikey": apiToken },
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
            <div className="flex items-end gap-2">
              <Button onClick={saveConfig} variant="outline" className="gap-1.5 flex-1"><Save className="h-4 w-4" /> Salvar</Button>
              <Button 
                onClick={() => {
                    const setup = async () => {
                      const webhookUrl = "https://shop-flow-crm-noleto.onrender.com/webhook/uzapi";
                      const currentToken = instanceToken || apiToken;
                      const endpoints = [
                        { url: `${apiUrl}/webhook`, headers: { "token": currentToken, "admintoken": apiToken } },
                        { url: `${apiUrl}/instance/webhook/${instanceName}`, headers: { "apikey": apiToken } },
                        { url: `${apiUrl}/webhook/instance/${instanceName}`, headers: { "apikey": apiToken } }
                      ];
                      
                      addLog(`[Webhook] Iniciando configuração manual... Target: ${webhookUrl}`);
                      toast.info("Configurando integração...");

                      for (const ep of endpoints) {
                        try {
                          addLog(`[Webhook] Tentando: ${ep.url}`);
                          const res = await fetch(ep.url, {
                            method: "POST",
                            headers: { ...ep.headers, "Content-Type": "application/json" },
                            body: JSON.stringify({
                              enabled: true,
                              url: webhookUrl,
                              events: ["messages", "connection", "MESSAGES_UPSERT", "CONNECTION_UPDATE"],
                              excludeMessages: ["wasSentByApi"]
                            })
                          });
                          if (res.ok) {
                            addLog(`[Webhook] ✅ Sucesso via ${ep.url}`);
                            toast.success("Integração ativada com sucesso!");
                            return;
                          }
                          const errText = await res.text();
                          addLog(`[Webhook] ❌ Falha em ${ep.url} (${res.status}): ${errText}`);
                        } catch (e: any) {
                          addLog(`[Webhook] Erro em ${ep.url}: ${e.message}`);
                        }
                      }
                      toast.error("Não foi possível ativar a integração. Veja os logs abaixo.");
                    };
                    setup();
                }} 
                className="gap-1.5 flex-1 bg-chart-1 hover:bg-chart-1/80"
              >
                Ativar Integração
              </Button>
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

          <div className="flex gap-3 flex-wrap justify-center">
            {status !== "connected" && (
              <Button onClick={generateQR} disabled={loading} className="gap-1.5">
                <QrCode className="h-4 w-4" /> {loading ? "Gerando..." : "Gerar QR Code"}
              </Button>
            )}
            <Button onClick={checkStatus} disabled={loading} variant="outline" className="gap-1.5">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Verificar Status
            </Button>
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

      {/* Logs de Depuração */}
      {debugLogs.length > 0 && (
        <details className="mt-4 bg-muted border border-border rounded-xl p-4 text-xs">
          <summary className="text-foreground font-semibold cursor-pointer mb-2">Logs de Depuração da Conexão (Clique para expandir)</summary>
          <div className="space-y-1 mt-2 max-h-60 overflow-y-auto font-mono whitespace-pre-wrap break-all text-muted-foreground">
            {debugLogs.map((log, i) => (
              <div key={i} className="border-b border-border/50 pb-1">{log}</div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
