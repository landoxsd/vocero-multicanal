const express = require("express");
const path = require("path");
const fs = require("fs");
const qrcode = require("qrcode");
require("dotenv").config();

const OmniChannelManager = require("./OmniChannelManager");

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const PORT = process.env.PORT || 3005;
const SESSIONS_DIR = process.env.SESSIONS_DIR || "./sessions";
const DEFAULT_WEBHOOK = process.env.DEFAULT_WEBHOOK_URL || "http://localhost:3000/api/webhooks/whatsapp-web";
const HEADLESS_MODE = process.env.HEADLESS !== "false";

// Instanciar Gestor Omnicanal
const omni = new OmniChannelManager({
    sessionsDir: SESSIONS_DIR,
    headless: HEADLESS_MODE,
    webhookUrl: DEFAULT_WEBHOOK
});

// Middleware de API KEY (permite dashboard web local)
function checkApiKey(req, res, next) {
    const requiredKey = process.env.API_KEY;
    if (!requiredKey) return next();

    const clientKey = req.headers["x-api-key"] || req.query.api_key;
    const referer = req.headers["referer"] || req.headers["host"] || "";
    
    if (clientKey === requiredKey || referer.includes(`localhost:${PORT}`) || referer.includes("127.0.0.1")) {
        return next();
    }
    return res.status(401).json({ error: "No autorizado. API Key inválida." });
}

// Helper para generar Buffer PNG de QR
async function renderQrBuffer(qrString) {
    return await qrcode.toBuffer(qrString, {
        type: "png",
        width: 320,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" }
    });
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD WEB INTERACTIVO
// ═══════════════════════════════════════════════════════════════

app.get("/health", (req, res) => {
    res.json({
        status: "UP",
        service: "WhatsApp & OmniChannel Web Manager (Compatible con CRM BR)",
        timestamp: new Date().toISOString(),
        summary: omni.getSummary()
    });
});

app.get("/", (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp Web Manager — Integrado con CRM BR</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
            h1 { color: #38bdf8; border-bottom: 2px solid #334155; padding-bottom: 10px; margin-bottom: 20px; }
            .card { background: #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { text-align: left; padding: 12px; border-bottom: 1px solid #334155; }
            th { background: #0f172a; color: #94a3b8; }
            .badge { padding: 4px 10px; border-radius: 20px; font-weight: bold; font-size: 0.85em; }
            .badge-WORKING { background: #166534; color: #4ade80; }
            .badge-SCAN_QR_CODE { background: #854d0e; color: #fef08a; animation: pulse 1.5s infinite; }
            .badge-STARTING { background: #1e40af; color: #93c5fd; }
            .badge-FAILED { background: #991b1b; color: #fca5a5; }
            .badge-STOPPED { background: #334155; color: #94a3b8; }
            .btn { background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; text-decoration: none; display: inline-block; font-weight: bold; }
            .btn:hover { background: #1d4ed8; }
            .btn-qr { background: #eab308; color: black; font-weight: bold; }
            .btn-qr:hover { background: #ca8a04; }
            .btn-danger { background: #dc2626; }
            .btn-danger:hover { background: #b91c1c; }
            input, select { padding: 10px 14px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: white; margin-right: 10px; margin-bottom: 10px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

            .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; justify-content: center; align-items: center; }
            .modal-box { background: #1e293b; padding: 30px; border-radius: 16px; text-align: center; max-width: 450px; width: 90%; border: 1px solid #38bdf8; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
            .modal-box img { width: 280px; height: 280px; border-radius: 12px; background: white; padding: 10px; margin: 15px 0; }
            @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        </style>
    </head>
    <body>
        <h1>🟢 WhatsApp Web Manager (Compatible con CRM BR)</h1>

        <div class="card">
            <h3>🟩 1. Conectar Cuenta de WhatsApp</h3>
            <p style="color:#94a3b8; margin-top:-10px;">Las sesiones creadas aquí o enviadas por <b>CRM BR</b> aparecerán automáticamente en esta lista.</p>
            <form onsubmit="createWaSession(event)">
                <input type="text" id="sessionName" placeholder="Nombre de sesión (ej: default)" required>
                <input type="url" id="webhookUrl" placeholder="Webhook URL (Opcional)">
                <button type="submit" class="btn">Conectar WhatsApp</button>
            </form>
        </div>

        <div class="card">
            <h3>📱 Estado de Cuentas WhatsApp</h3>
            <div id="waTable">Cargando...</div>
        </div>

        <div class="grid">
            <div class="card">
                <h3>💛 2. Vincular MercadoLibre</h3>
                <form onsubmit="addMeliAccount(event)">
                    <input type="text" id="meliId" placeholder="ID Cuenta (ej: meli_ventas)" required><br>
                    <input type="text" id="meliAppId" placeholder="App ID de MercadoLibre" required><br>
                    <input type="text" id="meliSecret" placeholder="Client Secret" required><br>
                    <input type="text" id="meliToken" placeholder="Refresh Token OAuth" required><br>
                    <button type="submit" class="btn" style="background:#eab308; color:black;">Guardar MercadoLibre</button>
                </form>
                <div id="meliList" style="margin-top:15px;"></div>
            </div>

            <div class="card">
                <h3>📸 3. Vincular Instagram Direct</h3>
                <form onsubmit="addIgAccount(event)">
                    <input type="text" id="igId" placeholder="ID Cuenta (ej: ig_ventas)" required><br>
                    <input type="text" id="igPageId" placeholder="Facebook Page ID" required><br>
                    <input type="text" id="igToken" placeholder="Page Access Token (Meta)" required><br>
                    <button type="submit" class="btn" style="background:#e1306c;">Guardar Instagram</button>
                </form>
                <div id="igList" style="margin-top:15px;"></div>
            </div>
        </div>

        <!-- MODAL DE QR INTEGRADO -->
        <div id="qrModal" class="modal-overlay">
            <div class="modal-box">
                <h2 style="color:#eab308; margin-top:0;">📷 Código QR de WhatsApp</h2>
                <p id="qrSessionTitle" style="font-weight:bold; color:#93c5fd;"></p>
                <img id="qrImage" src="" alt="Cargando Código QR..." />
                <p style="color:#94a3b8; font-size:0.9em;">Abre WhatsApp ➔ Dispositivos vinculados ➔ Vincular dispositivo</p>
                <br>
                <button class="btn btn-danger" onclick="closeQrModal()">Cerrar Ventana</button>
            </div>
        </div>

        <script>
            let currentOpenSession = null;

            async function loadData() {
                try {
                    const res = await fetch('/api/sessions');
                    const data = await res.json();

                    if (!Array.isArray(data) || data.length === 0) {
                        document.getElementById('waTable').innerHTML = '<p style="color:#94a3b8">No hay sesiones de WhatsApp activas o registradas.</p>';
                    } else {
                        let html = '<table><tr><th>ID Sesión</th><th>Teléfono</th><th>Estado</th><th>Acciones</th></tr>';
                        data.forEach(s => {
                            let actionBtns = '';
                            if (s.status === 'SCAN_QR_CODE') {
                                actionBtns += \`<button class="btn btn-qr" onclick="showQrModal('\${s.sessionId}')">📷 Escanear QR</button> \`;
                            } else if (s.status === 'WORKING') {
                                actionBtns += \`<span style="color:#4ade80; font-weight:bold; margin-right:10px;">✓ Conectado</span> \`;
                                actionBtns += \`<button class="btn" style="background:#0891b2" onclick="syncChats('\${s.sessionId}')">🔄 Sincronizar al CRM</button> \`;
                            }
                            actionBtns += \`<a class="btn" style="background:#475569" href="/api/sessions/\${s.sessionId}/screenshot" target="_blank">📸 Screenshot</a> \`;
                            actionBtns += \`<button class="btn btn-danger" onclick="stopSession('\${s.sessionId}')">Eliminar / Detener</button>\`;

                            const phoneStr = s.me && s.me.id ? s.me.id.replace('@c.us', '') : '-';

                            html += \`<tr>
                                <td><b>\${s.sessionId}</b></td>
                                <td>\${phoneStr}</td>
                                <td><span class="badge badge-\${s.status}">\${s.status}</span></td>
                                <td>\${actionBtns}</td>
                            </tr>\`;

                            if (currentOpenSession === s.sessionId && s.status === 'WORKING') {
                                closeQrModal();
                            }
                        });
                        html += 'allocation table';
                        document.getElementById('waTable').innerHTML = html;
                    }

                    const hRes = await fetch('/health');
                    const hData = await hRes.json();
                    
                    const meliAccs = hData.summary.mercadolibre;
                    if (meliAccs.length === 0) {
                        document.getElementById('meliList').innerHTML = '<p style="color:#94a3b8">Sin cuentas de MercadoLibre.</p>';
                    } else {
                        let mHtml = '<b>Cuentas Conectadas:</b><ul>';
                        meliAccs.forEach(m => mHtml += \`<li>\${m.accountId} (Seller ID: \${m.sellerId})</li>\`);
                        mHtml += '</ul>';
                        document.getElementById('meliList').innerHTML = mHtml;
                    }

                    const igAccs = hData.summary.instagram;
                    if (igAccs.length === 0) {
                        document.getElementById('igList').innerHTML = '<p style="color:#94a3b8">Sin cuentas de Instagram.</p>';
                    } else {
                        let iHtml = '<b>Cuentas Conectadas:</b><ul>';
                        igAccs.forEach(i => iHtml += \`<li>\${i.accountId} (Page ID: \${i.pageId})</li>\`);
                        iHtml += '</ul>';
                        document.getElementById('igList').innerHTML = iHtml;
                    }

                } catch(e) {
                    console.error("Error cargando dashboard:", e);
                }
            }

            async function syncChats(sessionId) {
                const btn = event.target;
                btn.disabled = true;
                btn.innerText = '⏳ Sincronizando...';
                try {
                    const r = await fetch('/api/sessions/' + sessionId + '/sync-chats', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ limit: 20, msgs: 5 })
                    });
                    const data = await r.json();
                    if (data.success) {
                        alert('✅ Sincronización completada!\n' + data.chats + ' chats\n' + data.sent + ' mensajes enviados al CRM\n' + data.errors + ' errores');
                    } else {
                        alert('❌ Error: ' + data.error);
                    }
                } catch(e) {
                    alert('❌ Error de conexión: ' + e.message);
                } finally {
                    btn.disabled = false;
                    btn.innerText = '🔄 Sincronizar al CRM';
                }
            }

            async function showQrModal(sessionId) {
                currentOpenSession = sessionId;
                document.getElementById('qrSessionTitle').innerText = 'Sesión: [' + sessionId + ']';
                const qrUrl = '/api/' + sessionId + '/auth/qr?t=' + Date.now();
                document.getElementById('qrImage').src = qrUrl;
                document.getElementById('qrModal').style.display = 'flex';
            }

            function closeQrModal() {
                currentOpenSession = null;
                document.getElementById('qrModal').style.display = 'none';
            }

            async function createWaSession(e) {
                e.preventDefault();
                const name = document.getElementById('sessionName').value;
                const webhookUrl = document.getElementById('webhookUrl').value;
                await fetch('/api/sessions', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ name, webhookUrl })
                });
                document.getElementById('sessionName').value = '';
                loadData();
            }

            async function addMeliAccount(e) {
                e.preventDefault();
                const accountId = document.getElementById('meliId').value;
                const appId = document.getElementById('meliAppId').value;
                const secret = document.getElementById('meliSecret').value;
                const refreshToken = document.getElementById('meliToken').value;

                await fetch('/api/mercadolibre/accounts', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ accountId, appId, secret, refreshToken })
                });
                alert('Cuenta de MercadoLibre guardada!');
                loadData();
            }

            async function addIgAccount(e) {
                e.preventDefault();
                const accountId = document.getElementById('igId').value;
                const pageId = document.getElementById('igPageId').value;
                const accessToken = document.getElementById('igToken').value;

                await fetch('/api/instagram/accounts', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ accountId, pageId, accessToken })
                });
                alert('Cuenta de Instagram guardada!');
                loadData();
            }

            async function stopSession(id) {
                if (!confirm('¿Eliminar y detener ' + id + '?')) return;
                await fetch('/api/sessions/' + id, { method: 'DELETE' });
                loadData();
            }

            setInterval(loadData, 2000);
            loadData();
        </script>
    </body>
    </html>
    `);
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINTS DE SESIONES (COMPATIBILIDAD 100% CON WAHA & CRM BR)
// ═══════════════════════════════════════════════════════════════

app.get("/api/sessions", checkApiKey, (req, res) => {
    res.json(omni.whatsapp.getSessionsList());
});

app.post("/api/sessions", checkApiKey, (req, res) => {
    const name = req.body.name || req.body.session || req.body.sessionId;
    const webhookUrl = req.body.webhookUrl || (req.body.config ? req.body.config.webhookUrl : null);
    if (!name) return res.status(400).json({ error: "El parámetro 'name' es requerido" });

    const existing = omni.whatsapp.getSession(name);
    if (existing) {
        return res.json({
            name,
            sessionId: name,
            status: existing.status,
            ready: existing.ready,
            qr: existing.lastQr,
            me: existing.me
        });
    }

    const session = omni.whatsapp.createSession(name, { webhookUrl });
    res.json({
        name,
        sessionId: name,
        status: session.status,
        ready: session.ready,
        qr: session.lastQr,
        me: session.me
    });
});

app.post("/api/sessions/:id/start", checkApiKey, (req, res) => {
    const name = req.params.id;
    let session = omni.whatsapp.getSession(name);
    if (!session) {
        session = omni.whatsapp.createSession(name);
    }
    res.json({
        name,
        sessionId: name,
        status: session.status,
        ready: session.ready,
        qr: session.lastQr,
        me: session.me
    });
});

app.get("/api/sessions/:id", checkApiKey, (req, res) => {
    const session = omni.whatsapp.getSession(req.params.id);
    if (!session) {
        return res.status(404).json({ error: "Sesión no encontrada", status: "STOPPED", me: null });
    }

    res.json({
        name: session.sessionId,
        sessionId: session.sessionId,
        status: session.status,
        ready: session.ready,
        qr: session.lastQr,
        hasQr: !!session.lastQr,
        me: session.me,
        startedAt: session.startedAt
    });
});

app.post("/api/sessions/:id/stop", checkApiKey, async (req, res) => {
    await omni.whatsapp.stopSession(req.params.id);
    res.json({ success: true, status: "STOPPED" });
});

app.delete("/api/sessions/:id", checkApiKey, async (req, res) => {
    await omni.whatsapp.stopSession(req.params.id);
    const { WhatsAppMultiManager } = require("./WhatsAppMultiManager");
    WhatsAppMultiManager.resetSessionFiles(req.params.id);
    res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINTS DE IMAGEN QR (COMPATIBLE CON CRM BR Y NAVEGADORES)
// ═══════════════════════════════════════════════════════════════

app.get("/api/:id/auth/qr", checkApiKey, async (req, res) => {
    const session = omni.whatsapp.getSession(req.params.id);
    if (!session || !session.lastQr) {
        return res.status(404).send("QR no disponible para esta sesión.");
    }

    try {
        const qrBuffer = await renderQrBuffer(session.lastQr);
        res.contentType("image/png");
        res.setHeader("Cache-Control", "no-store, max-age=0");
        res.send(qrBuffer);
    } catch (e) {
        res.status(500).send("Error generando QR buffer");
    }
});

app.get("/api/sessions/:id/auth/qr", checkApiKey, async (req, res) => {
    const session = omni.whatsapp.getSession(req.params.id);
    if (!session || !session.lastQr) {
        return res.status(404).send("QR no disponible para esta sesión.");
    }

    try {
        const qrBuffer = await renderQrBuffer(session.lastQr);
        res.contentType("image/png");
        res.setHeader("Cache-Control", "no-store, max-age=0");
        res.send(qrBuffer);
    } catch (e) {
        res.status(500).send("Error generando QR buffer");
    }
});

app.get("/api/sessions/:id/qr-image", async (req, res) => {
    const session = omni.whatsapp.getSession(req.params.id);
    if (!session || !session.lastQr) {
        return res.status(404).send("QR no disponible.");
    }
    try {
        const qrBuffer = await renderQrBuffer(session.lastQr);
        res.contentType("image/png");
        res.send(qrBuffer);
    } catch (e) {
        res.status(500).send("Error generando QR");
    }
});

app.get("/api/sessions/:id/screenshot", checkApiKey, async (req, res) => {
    const buffer = await omni.whatsapp.getScreenshot(req.params.id);
    if (!buffer) return res.status(404).send("Screenshot no disponible.");
    res.contentType("image/png");
    res.send(buffer);
});

app.get("/api/sessions/:id/chats", checkApiKey, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const msgs = parseInt(req.query.msgs) || 5;
        const chats = await omni.whatsapp.getChats(req.params.id, limit, msgs);
        res.json({ success: true, chats });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════════
app.post("/api/sessions/:id/sync-chats", checkApiKey, async (req, res) => {
    const body = req.body || {};
    const limit = parseInt(body.limit) || 20;
    const msgsPerChat = parseInt(body.msgs) || 5;

    try {
        console.log(`🔄 Iniciando sync de chats para sesión [${req.params.id}]... (${limit} chats, ${msgsPerChat} msgs/chat)`);
        const result = await omni.whatsapp.syncChatsToWebhook(req.params.id, limit, msgsPerChat);
        res.json({ success: true, ...result });
    } catch (e) {
        const errorMsg = e.stack || e.message || String(e);
        console.error("❌ Error en sync-chats:", errorMsg);
        res.status(500).json({ error: errorMsg });
    }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINTS DE MENSAJERÍA COMPATIBLES CON WAHA Y CRM BR
// ═══════════════════════════════════════════════════════════════

app.post("/api/sendText", checkApiKey, async (req, res) => {
    let session = req.body.session || req.body.sessionId || "default";
    const { chatId, text } = req.body;

    if (!chatId || !text) {
        return res.status(400).json({ error: "Faltan parámetros requeridos: 'chatId', 'text'" });
    }

    // Fallback si la sesión pedida es 'default' o no se encuentra: usar la primera sesión WORKING
    const sessionObj = omni.whatsapp.sessions.get(session);
    if (!sessionObj || sessionObj.status !== "WORKING") {
        const workingSession = omni.whatsapp.getSessionsList().find(s => s.status === "WORKING");
        if (workingSession) {
            console.log(`ℹ️ [/api/sendText] Redirigiendo sesión '${session}' -> '${workingSession.sessionId}' (WORKING)`);
            session = workingSession.sessionId;
        }
    }

    try {
        const result = await omni.sendMessage({ channel: "whatsapp", accountId: session, recipientId: chatId, text });
        const id = (result && result.id) ? (result.id._serialized || result.id) : (result ? (result._serialized || result) : `true_${chatId}_${Date.now()}`);
        res.json({ success: true, id, result });
    } catch (e) {
        console.error("❌ Error en /api/sendText:", e.message);
        res.status(500).json({ error: e.message });
    }
});

const mediaHandler = async (req, res) => {
    let session = req.body.session || req.body.sessionId || "default";
    const chatId = req.body.chatId;
    const fileSource = req.body.fileSource || req.body.file || req.body.url;
    const filename = req.body.filename || req.body.name || "adjunto.png";
    const caption = req.body.caption || "";

    if (!chatId || !fileSource) {
        return res.status(400).json({ error: "Faltan parámetros: 'chatId', 'fileSource'" });
    }

    const sessionObj = omni.whatsapp.sessions.get(session);
    if (!sessionObj || sessionObj.status !== "WORKING") {
        const workingSession = omni.whatsapp.getSessionsList().find(s => s.status === "WORKING");
        if (workingSession) {
            console.log(`ℹ️ [mediaHandler] Redirigiendo sesión '${session}' -> '${workingSession.sessionId}' (WORKING)`);
            session = workingSession.sessionId;
        }
    }

    try {
        const result = await omni.whatsapp.sendMedia(session, chatId, fileSource, filename, caption);
        const id = (result && result.id) ? (result.id._serialized || result.id) : (result ? (result._serialized || result) : `true_${chatId}_${Date.now()}`);
        res.json({ success: true, id, result });
    } catch (e) {
        console.error("❌ Error en mediaHandler:", e.message);
        res.status(500).json({ error: e.message });
    }
};

app.post("/api/sendMedia", checkApiKey, mediaHandler);
app.post("/api/sendImage", checkApiKey, mediaHandler);
app.post("/api/sendFile", checkApiKey, mediaHandler);

app.post("/api/sessions/:id/download-media", async (req, res) => {
    let session = req.params.id;
    const { messageId } = req.body;
    if (!messageId) return res.status(400).json({ error: "Falta messageId" });

    const sessionObj = omni.whatsapp.sessions.get(session);
    if (!sessionObj || sessionObj.status !== "WORKING") {
        const working = omni.whatsapp.getSessionsList().find(s => s.status === "WORKING");
        if (working) session = working.sessionId;
    }

    try {
        const media = await omni.whatsapp.downloadMedia(session, { id: messageId });
        res.json({ success: true, media });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/media/:messageId", async (req, res) => {
    const messageId = req.params.messageId;
    const workingSession = omni.whatsapp.getSessionsList().find(s => s.status === "WORKING");
    if (!workingSession) {
        return res.status(503).json({ error: "No hay sesiones de WhatsApp activas." });
    }

    try {
        const media = await omni.whatsapp.downloadMedia(workingSession.sessionId, messageId);
        if (!media || !media.data) {
            return res.status(404).json({ error: "Mídia não encontrada ou falha ao baixar do WhatsApp." });
        }

        const buffer = Buffer.from(media.data, "base64");
        res.setHeader("Content-Type", media.mimetype || "application/octet-stream");
        res.setHeader("Content-Length", buffer.length);
        res.send(buffer);
    } catch (e) {
        console.error("❌ Error en GET /api/media:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINTS MERCADOLIBRE & INSTAGRAM
// ═══════════════════════════════════════════════════════════════

app.post("/api/messages/send", checkApiKey, async (req, res) => {
    const { channel, accountId, recipientId, text, subType, buyerId } = req.body;
    if (!channel || !accountId || !recipientId || !text) {
        return res.status(400).json({ error: "Faltan parámetros: 'channel', 'accountId', 'recipientId', 'text'" });
    }

    try {
        const result = await omni.sendMessage({ channel, accountId, recipientId, text, subType, buyerId });
        res.json({ success: true, result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/mercadolibre/accounts", checkApiKey, async (req, res) => {
    const { accountId, appId, secret, refreshToken, sellerId } = req.body;
    try {
        const acc = await omni.mercadolibre.addAccount(accountId, { appId, secret, refreshToken, sellerId });
        res.json({ success: true, account: acc });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/webhooks/mercadolibre", async (req, res) => {
    res.sendStatus(200);
    await omni.mercadolibre.handleWebhookNotification(req.body);
});

app.post("/api/instagram/accounts", checkApiKey, (req, res) => {
    const { accountId, pageId, accessToken } = req.body;
    try {
        const acc = omni.instagram.addOfficialAccount(accountId, { pageId, accessToken });
        res.json({ success: true, account: acc });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/webhooks/instagram", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === (process.env.META_VERIFY_TOKEN || "my_verify_token")) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

app.post("/api/webhooks/instagram", async (req, res) => {
    res.sendStatus(200);
    await omni.instagram.handleWebhookNotification(req.body);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor WhatsApp & Omnicanal corriendo en: http://localhost:${PORT}`);
    console.log(`   Soporte completo de Dashboard Web y CRM BR activado!`);
});
