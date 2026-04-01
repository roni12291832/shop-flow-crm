import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import express from "express";
import { toDataURL } from "qrcode";
import pino from "pino";
import { mkdir } from "fs/promises";

const WEBHOOK_URL =
  process.env.INTERNAL_WEBHOOK_URL || "http://localhost:8000/webhook/uzapi";
const PORT = parseInt(process.env.WA_CONNECTOR_PORT || "3001");
const AUTH_DIR = process.env.WA_AUTH_DIR || "./wa_auth";

const logger = pino({ level: "silent" });
const app = express();
app.use(express.json({ limit: "50mb" }));

let sock = null;
let qrCodeBase64 = null;
let connectionState = "close"; // 'close' | 'connecting' | 'open'
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;

// ─── WhatsApp Connection ───────────────────────────────────────────

async function connectToWhatsApp() {
  try {
    await mkdir(AUTH_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`[WA] Iniciando com Baileys v${version.join(".")}`);

    sock = makeWASocket({
      version,
      auth: state,
      logger,
      browser: ["ShopFlow CRM", "Chrome", "126.0.0"],
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        try {
          qrCodeBase64 = await toDataURL(qr);
          connectionState = "connecting";
          console.log("[WA] QR Code gerado — aguardando escaneamento");
        } catch (e) {
          console.error("[WA] Erro ao gerar QR:", e.message);
        }
      }

      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        connectionState = "close";
        qrCodeBase64 = null;
        console.log(`[WA] Conexão fechada (código: ${code})`);

        if (loggedOut) {
          console.log("[WA] Deslogado — aguardando nova leitura de QR");
          reconnectAttempts = 0;
        } else if (reconnectAttempts < MAX_RECONNECT) {
          reconnectAttempts++;
          const delay = Math.min(5000 * reconnectAttempts, 60000);
          console.log(`[WA] Reconectando em ${delay / 1000}s (tentativa ${reconnectAttempts})`);
          setTimeout(connectToWhatsApp, delay);
        } else {
          console.log("[WA] Limite de reconexões atingido");
        }
      }

      if (connection === "open") {
        connectionState = "open";
        qrCodeBase64 = null;
        reconnectAttempts = 0;
        console.log("[WA] Conectado!");
        notifyBackend("connected");
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        if (!msg.message) continue;
        if (msg.key.fromMe) continue;
        if (msg.key.remoteJid?.endsWith("@g.us")) continue;
        if (msg.key.remoteJid?.endsWith("@broadcast")) continue;

        const payload = {
          event: "messages",
          instance: "shopflow",
          data: {
            key: {
              remoteJid: msg.key.remoteJid,
              fromMe: false,
              id: msg.key.id,
            },
            pushName: msg.pushName || "",
            message: msg.message,
            messageTimestamp: msg.messageTimestamp,
          },
        };

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(10000),
            });
            console.log(`[WA] Webhook → ${msg.key.remoteJid} (HTTP ${res.status})`);
            break;
          } catch (e) {
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 2000));
            } else {
              console.error(`[WA] Webhook falhou: ${e.message}`);
            }
          }
        }
      }
    });
  } catch (e) {
    console.error("[WA] Erro ao iniciar:", e.message);
    setTimeout(connectToWhatsApp, 10000);
  }
}

async function notifyBackend(status) {
  try {
    await fetch("http://localhost:8000/wa/internal/set-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (_) {
    // Python pode ainda não estar pronto, ignora
  }
}

// ─── REST API ──────────────────────────────────────────────────────

app.get("/status", (req, res) => {
  res.json({
    state: connectionState,
    connected: connectionState === "open",
    hasQr: !!qrCodeBase64,
  });
});

app.get("/qr", (req, res) => {
  res.json({
    qr: qrCodeBase64,
    state: connectionState,
    connected: connectionState === "open",
  });
});

app.post("/connect", async (req, res) => {
  // Força nova conexão/QR
  try {
    if (sock) {
      try { await sock.logout(); } catch (_) {}
      sock = null;
    }
    connectionState = "connecting";
    reconnectAttempts = 0;
    setTimeout(connectToWhatsApp, 500);
    res.json({ success: true, message: "Conectando..." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/disconnect", async (req, res) => {
  try {
    if (sock) {
      await sock.logout();
      sock = null;
    }
    connectionState = "close";
    qrCodeBase64 = null;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/send/text", async (req, res) => {
  const { number, text } = req.body;
  if (!text) return res.status(400).json({ error: "Campo text obrigatório" });
  if (!sock || connectionState !== "open") {
    return res.status(503).json({ error: "WhatsApp não conectado" });
  }
  try {
    const jid = number.includes("@")
      ? number
      : `${number.replace(/\D/g, "")}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text });
    res.json({ success: true, to: jid });
  } catch (e) {
    console.error(`[WA] Erro ao enviar para ${number}:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/send/media", async (req, res) => {
  const { number, mediaType, file, text, doc_name } = req.body;
  if (!sock || connectionState !== "open") {
    return res.status(503).json({ error: "WhatsApp não conectado" });
  }
  try {
    const jid = number.includes("@")
      ? number
      : `${number.replace(/\D/g, "")}@s.whatsapp.net`;
    const buffer = Buffer.from(
      file.replace(/^data:[^;]+;base64,/, ""),
      "base64"
    );
    let msgContent;
    if (mediaType === "image") {
      msgContent = { image: buffer, caption: text || "" };
    } else if (mediaType === "video") {
      msgContent = { video: buffer, caption: text || "" };
    } else if (mediaType === "audio" || mediaType === "ptt") {
      msgContent = { audio: buffer, mimetype: "audio/ogg; codecs=opus", ptt: true };
    } else {
      msgContent = { document: buffer, fileName: doc_name || "arquivo", caption: text || "" };
    }
    await sock.sendMessage(jid, msgContent);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Compatibilidade com uazapi_client.py
app.post("/webhook", (req, res) => {
  res.json([{
    enabled: true,
    url: WEBHOOK_URL,
    events: ["messages", "connection", "chats"],
    excludeMessages: ["wasSentByApi"],
    id: "internal",
  }]);
});

app.get("/instance/status", (req, res) => {
  res.json({
    connected: connectionState === "open",
    state: connectionState,
    status: connectionState,
  });
});

app.post("/chat/find", (req, res) => { res.json([]); });
app.post("/message/find", (req, res) => { res.json([]); });

app.get("/health", (req, res) => {
  res.json({ status: "ok", wa: connectionState });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[WA] Conector rodando em localhost:${PORT}`);
});

connectToWhatsApp();
