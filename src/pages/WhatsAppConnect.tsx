import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Smartphone, QrCode, Wifi, WifiOff, RefreshCw, Save, AlertTriangle, MessageSquare } from "lucide-react";
import { toast } from "sonner";

/**
 * URL do webhook do backend Python.
 * Lida pelo banco de dados (whatsapp_instances.webhook_url) ou por variável de ambiente.
 * Fallback para o deploy atual no Koyeb.
 */
const DEFAULT_WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL || "";

export default function WhatsAppConnect() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [apiUrl, setApiUrl] = useState("https://nexaflow.uazapi.com");
  const [apiToken, setApiToken] = useState("");
  const [instanceName, setInstanceName] = useState("");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dbRecordId, setDbRecordId] = useState<string | null>(null);
  const [instanceToken, setInstanceToken] = useState<string>("");
  const [webhookUrl, setWebhookUrl] = useState(DEFAULT_WEBHOOK_URL);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const addLog = (msg: string, data?: any) => {
    const logStr = data ? `${msg} | ${JSON.stringify(data).slice(0, 300)}` : msg;
    console.log("[WA-DEBUG]", logStr);
    setDebugLogs(prev => [...prev.slice(-80), logStr]);
  };

  // Load saved config from DB
  useEffect(() => {
    const fetchConfig = async () => {
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .maybeSingle();

      if (data) {
        setDbRecordId(data.id);
        setApiUrl(data.api_url || "https://nexaflow.uazapi.com");
        setApiToken(data.api_token || "");
        setInstanceName(data.instance_name || "");
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
    toast.success("Configuração salva!");
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
    addLog(`Verificando status: ${instanceName}`);

    const attempts = [
      {
        label: "UAZAPI GO: /instance/status + token",
        url: `${apiUrl}/instance/status`,
        headers: { "token": instanceToken || apiToken },
      },
      {
        label: "connectionState + apikey",
        url: `${apiUrl}/instance/connectionState/${instanceName}`,
        headers: { "apikey": apiToken },
      },
      {
        label: "status/{name} + apikey",
        url: `${apiUrl}/instance/status/${instanceName}`,
        headers: { "apikey": apiToken },
      },
    ];

    for (const attempt of attempts) {
      try {
        addLog(`[${attempt.label}] GET ${attempt.url}`);
        const res = await fetch(attempt.url, { headers: attempt.headers });
        const text = await res.text();
        addLog(`HTTP ${res.status}: ${text.slice(0, 200)}`);

        if (res.ok) {
          const data = JSON.parse(text);
          if (isOpen(data)) {
            addLog(`Conectado via [${attempt.label}]`);
            await updateStatusInDb("connected");
            setQrCode(null);
            toast.success("WhatsApp conectado!");
            setLoading(false);
            return;
          }
        }
      } catch (e: any) {
        addLog(`Erro [${attempt.label}]: ${e.message}`);
      }
    }

    addLog("Nenhum endpoint retornou conectado.");
    await updateStatusInDb("disconnected");
    toast.error("WhatsApp não conectado. Veja os logs.");
    setLoading(false);
  };

  const configureWebhook = async (token: string) => {
    if (!webhookUrl) {
      addLog("[Webhook] URL do webhook não configurada — pulando configuração automática");
      return;
    }

    try {
      addLog(`[Webhook] Configurando: ${webhookUrl}`);
      const res = await fetch(`${apiUrl}/webhook`, {
        method: "POST",
        headers: {
          "token": token,
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
        addLog("[Webhook] Configurado com sucesso!");
        toast.success("Integração de mensagens ativada!");
      } else {
        const errText = await res.text();
        addLog(`[Webhook] Falha (${res.status}): ${errText}`);
      }
    } catch (e: any) {
      addLog(`[Webhook] Erro: ${e.message}`);
    }
  };

  const generateQR = async () => {
    if (!apiUrl || !apiToken || !instanceName) {
      toast.error("Configure a API primeiro");
      return;
    }
    setLoading(true);
    setDebugLogs([]);
    addLog(`Gerando QR para: ${instanceName}`);

    if (!dbRecordId || !saved) {
      await saveConfig();
    }

    await updateStatusInDb("connecting");
    try {
      // STEP 1: Initialize instance
      addLog("[STEP 1] POST /instance/init");
      const createRes = await fetch(`${apiUrl}/instance/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": apiToken,
          "admintoken": apiToken,
        },
        body: JSON.stringify({ name: instanceName }),
      });

      addLog(`[STEP 1] HTTP ${createRes.status}`);

      if (createRes.status === 401 || createRes.status === 403) {
        throw new Error("Token inválido (verifique admintoken)");
      }

      let createData: any = {};
      if (createRes.ok) {
        const textData = await createRes.text();
        try { createData = JSON.parse(textData); } catch {}
        addLog("[STEP 1] OK", createData);
      } else if (createRes.status !== 409 && createRes.status !== 400) {
        const errText = await createRes.text().catch(() => "");
        addLog(`[STEP 1] Erro`, errText);
        throw new Error(`Erro ${createRes.status} ao criar instância`);
      }

      const currentToken = createData?.instance?.token || createData?.hash?.token || createData?.token || apiToken;
      addLog(`[Token] ${currentToken.substring(0, 8)}...`);
      setInstanceToken(currentToken);

      await new Promise(resolve => setTimeout(resolve, 1500));

      // STEP 2: Connect and get QR
      addLog("[STEP 2] POST /instance/connect");
      let connectData: any = null;
      try {
        const res = await fetch(`${apiUrl}/instance/connect`, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "token": currentToken,
            "admintoken": apiToken,
            "apikey": apiToken,
          },
          body: JSON.stringify({ base64: true }),
        });
        const connText = await res.text();
        addLog(`[STEP 2] HTTP ${res.status}`);
        try {
          connectData = JSON.parse(connText);
          addLog("[STEP 2] Data", connectData);
        } catch {
          addLog("[STEP 2] Resposta não-JSON", connText);
        }
      } catch (e: any) {
        addLog(`[STEP 2] Fetch falhou: ${e.message}`);
      }

      const hasQr = (d: any) => d?.base64 || d?.qrcode || d?.instance?.qrcode || d?.instance?.base64;
      const extractQr = (d: any) => d?.base64 || d?.qrcode?.base64 || d?.qrcode || d?.instance?.qrcode || d?.instance?.base64;

      let foundQr = hasQr(connectData);
      if (foundQr) {
        addLog("[QR] Encontrado imediatamente!");
        setQrCode(extractQr(connectData));
        toast.success("QR Code gerado! Escaneie com o WhatsApp");
      }

      // STEP 3: Poll for connection
      let maxAttempts = 60;
      let isConnected = isOpen(connectData);
      addLog("[Polling] Monitorando conexão (até 120s)...");

      while (!isConnected && maxAttempts > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        maxAttempts--;
        try {
          const statusRes = await fetch(`${apiUrl}/instance/status`, {
            headers: {
              "Accept": "application/json",
              "token": currentToken || apiToken,
            }
          });
          const textRes = await statusRes.text();

          if (statusRes.ok) {
            try {
              const statusData = JSON.parse(textRes);
              if (isOpen(statusData)) {
                isConnected = true;
                addLog("[Polling] CONECTADO!");
                break;
              } else if (!foundQr && hasQr(statusData)) {
                foundQr = true;
                setQrCode(extractQr(statusData));
                toast.success("QR Code gerado! Escaneie com o WhatsApp");
                addLog("[Polling] QR recebido");
              }
            } catch {}
          }
        } catch (e: any) {
          addLog(`[Polling] Erro: ${e.message}`);
        }
      }

      if (isConnected) {
        addLog("Instância conectada com sucesso!");
        await updateStatusInDb("connected", currentToken);
        setQrCode(null);
        toast.success("WhatsApp conectado com sucesso!");

        // Auto-configure webhook
        await configureWebhook(currentToken);
      } else {
        addLog("Tempo esgotado para escanear QR Code.");
        await updateStatusInDb("disconnected");
        toast.error("Tempo esgotado. Tente novamente.");
      }
    } catch (err: any) {
      addLog(`[ERRO] ${err.message}`);
      console.error("Connection Error:", err);
      toast.error("Erro na conexão. Veja os logs.");
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
        headers: { "apikey": apiToken, "token": instanceToken || apiToken },
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
          <>
            <div className="bg-chart-2/10 border border-chart-2/30 rounded-xl p-4 text-sm text-chart-2 mb-4">
              WhatsApp conectado! Seu CRM ja pode enviar e receber mensagens automaticamente.
            </div>
            <Button
              onClick={() => navigate("/chat")}
              className="w-full gap-2 bg-chart-2 hover:bg-chart-2/80 text-white mb-4"
              size="lg"
            >
              <MessageSquare className="h-5 w-5" />
              Abrir WhatsApp no CRM
            </Button>
          </>
        )}

        <div className="bg-secondary/50 border border-border rounded-xl p-4 text-sm text-muted-foreground flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-chart-3" />
          <div>
            <p className="font-semibold text-foreground mb-1">Conexão Persistente</p>
            <p>Seus dados são protegidos no banco de dados. Qualquer atendente pode usar a mesma conexão. Não precisa manter a tela aberta.</p>
          </div>
        </div>
      </div>

      {/* Admin Config */}
      {isAdmin && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-foreground font-bold text-base">Configuração do Sistema</h3>
            <Badge variant="outline" className="text-[10px] opacity-70">Admin Only</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome da Instância (Obrigatório)</Label>
              <Input
                value={instanceName}
                onChange={e => { setInstanceName(e.target.value); setSaved(false); }}
                placeholder="Ex: minha-loja-ag"
                className="bg-background border-primary/30"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={saveConfig} variant="outline" className="gap-1.5 flex-1"><Save className="h-4 w-4" /> Salvar</Button>
              <Button
                onClick={async () => {
                  addLog("[Webhook] Configurando...");
                  toast.info("Configurando integração...");

                  let freshToken = instanceToken || apiToken;
                  try {
                    const initRes = await fetch(`${apiUrl}/instance/init`, {
                      method: "POST",
                      headers: { "apikey": apiToken, "admintoken": apiToken, "Content-Type": "application/json" },
                      body: JSON.stringify({ name: instanceName })
                    });
                    if (initRes.ok) {
                      const initData = await initRes.json();
                      const tok = initData.instance?.token || initData.hash?.token || initData.token;
                      if (tok) {
                        freshToken = tok;
                        if (dbRecordId) {
                          await supabase.from("whatsapp_instances").update({ instance_token: tok }).eq("id", dbRecordId);
                        }
                        addLog("[Webhook] Token renovado");
                      }
                    }
                  } catch (e: any) {
                    addLog(`[Webhook] Token não renovado: ${e.message}`);
                  }

                  await configureWebhook(freshToken);
                }}
                className="gap-1.5 flex-1 bg-chart-1 hover:bg-chart-1/80"
              >
                Ativar Integração
              </Button>
            </div>
          </div>

          <details className="mt-4">
            <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-primary">Configurações Avançadas</summary>
            <div className="pt-4 space-y-4">
              <div className="space-y-2">
                <Label>URL da API</Label>
                <Input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://sua-instancia.uazapi.com" />
              </div>
              <div className="space-y-2">
                <Label>Token da API</Label>
                <Input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} placeholder="Seu token de acesso" />
              </div>
              <div className="space-y-2">
                <Label>URL do Webhook (Backend Python)</Label>
                <Input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://seu-backend.koyeb.app/webhook/uzapi" />
                <p className="text-[10px] text-muted-foreground">URL do seu backend Python que recebe os webhooks do WhatsApp</p>
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
            {status === "connected" && (
              <Button onClick={() => navigate("/chat")} className="gap-1.5 bg-chart-2 hover:bg-chart-2/80">
                <MessageSquare className="h-4 w-4" /> Abrir WhatsApp
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
            Abra o WhatsApp no celular → Menu → Dispositivos Conectados → Conectar Dispositivo → Escaneie o QR Code
          </p>
        </div>
      )}

      {/* Debug Logs */}
      {debugLogs.length > 0 && (
        <details className="mt-4 bg-muted border border-border rounded-xl p-4 text-xs">
          <summary className="text-foreground font-semibold cursor-pointer mb-2">Logs de Depuração (Clique para expandir)</summary>
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
