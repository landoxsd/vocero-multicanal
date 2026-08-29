const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const SESSION_STATUS = {
    STOPPED: "STOPPED",
    STARTING: "STARTING",
    SCAN_QR_CODE: "SCAN_QR_CODE",
    WORKING: "WORKING",
    FAILED: "FAILED",
    RECONNECTING: "RECONNECTING"
};

function getManagerPublicUrl() {
    return (
        process.env.MANAGER_PUBLIC_URL ||
        process.env.WA_WEB_MANAGER_PUBLIC_URL ||
        `http://localhost:${process.env.PORT || 3005}`
    ).replace(/\/$/, "");
}

function findSystemBrowserPath() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
        console.log(`🌐 Chromium de entorno detectado: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    const possiblePaths = [
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome-stable",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        (process.env.LOCALAPPDATA || "") + "\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
    ];

    for (const p of possiblePaths) {
        if (p && fs.existsSync(p)) {
            console.log(`🌐 Navegador del sistema detectado: ${p}`);
            return p;
        }
    }
    return undefined;
}

class WhatsAppMultiManager {
    constructor(options = {}) {
        this.sessionsPath = path.resolve(options.sessionsPath || "./sessions");
        this.headless = options.headless !== undefined ? options.headless : false;
        this.webhookUrl = options.webhookUrl || "http://localhost:3000/api/webhooks/whatsapp-web";
        this.webhookSecret = options.webhookSecret || process.env.WA_WEB_WEBHOOK_SECRET || null;
        this.eventSink = options.eventSink || null;
        this.remoteWaWebVersion = options.remoteWaWebVersion || 
            "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014583151-alpha.html";

        this.sessions = new Map();
        this.reconnectMaxAttempts = Number(process.env.WA_RECONNECT_MAX_ATTEMPTS || "12");

        this.onStatusChange = null;
        this.onMessage = null;
        this.onQr = null;

        this._setupUncaughtHandlers();
        
        // Auto-restaurar sesiones guardadas en disco al iniciar
        setTimeout(() => this.autoRestoreSessions(), 1000);
    }

    _setupUncaughtHandlers() {
        process.on("uncaughtException", (err) => {
            console.error("🚨 [WhatsAppMultiManager] Error no capturado:", err.message);
        });

        process.on("unhandledRejection", (reason) => {
            console.error("🚨 [WhatsAppMultiManager] Promesa rechazada no capturada:", reason);
        });
    }

    async autoRestoreSessions() {
        if (!fs.existsSync(this.sessionsPath)) return;
        
        try {
            const files = fs.readdirSync(this.sessionsPath);
            const sessionIds = files
                .filter(f => f.startsWith("session-"))
                .map(f => f.replace("session-", ""))
                .filter(id => id && id !== "PRUEBA" && !this.sessions.has(id));

            for (const sessionId of sessionIds) {
                console.log(`🔄 [AutoRestore] Restaurando sesión guardada en disco: ${sessionId}`);
                try {
                    this.createSession(sessionId);
                } catch (err) {
                    console.error(`⚠️ Error restaurando sesión ${sessionId}:`, err.message);
                }
                // Esperar 3.5 segundos entre cada lanzamiento de Chrome para evitar bloqueos
                await new Promise(r => setTimeout(r, 3500));
            }
        } catch (e) {
            console.error("⚠️ Error durante autoRestoreSessions:", e.message);
        }
    }

    createSession(sessionId, config = {}) {
        if (!sessionId || typeof sessionId !== "string") {
            throw new Error("El sessionId debe ser una cadena de texto válida.");
        }

        if (this.sessions.has(sessionId)) {
            console.log(`ℹ️ [${sessionId}] La sesión ya existe en memoria.`);
            return this.sessions.get(sessionId);
        }

        console.log(`⚡ [${sessionId}] Inicializando nueva sesión de WhatsApp...`);

        const systemBrowser = findSystemBrowserPath();

        const puppeteerOptions = {
            headless: this.headless,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--no-zygote",
                "--disable-gpu"
            ]
        };

        if (systemBrowser) {
            puppeteerOptions.executablePath = systemBrowser;
        }

        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: sessionId,
                dataPath: this.sessionsPath
            }),
            webVersionCache: {
                type: "remote",
                remotePath: this.remoteWaWebVersion,
            },
            puppeteer: puppeteerOptions
        });

        const sessionObj = {
            sessionId,
            client,
            status: SESSION_STATUS.STARTING,
            ready: false,
            lastQr: null,
            webhookUrl: config.webhookUrl || this.webhookUrl,
            startedAt: new Date()
        };

        this.sessions.set(sessionId, sessionObj);
        this._bindEvents(sessionId, sessionObj);

        client.initialize();
        this._updateStatus(sessionObj, SESSION_STATUS.STARTING);
        return sessionObj;
    }

    _updateStatus(sessionObj, newStatus) {
        sessionObj.status = newStatus;
        console.log(`📌 [${sessionObj.sessionId}] Estado actualizado -> ${newStatus}`);

        if (this.onStatusChange) {
            try { this.onStatusChange(sessionObj.sessionId, newStatus); } catch (e) {}
        }

        this._sendWebhook(sessionObj, "session.status", {
            sessionId: sessionObj.sessionId,
            status: newStatus,
            timestamp: new Date().toISOString()
        });
    }

    _bindEvents(sessionId, sessionObj) {
        const { client } = sessionObj;

        client.on("qr", (qr) => {
            console.log(`⚡ [${sessionId}] QR RECIBIDO. ESCANEA CON TU CELULAR:`);
            qrcode.generate(qr, { small: true });
            sessionObj.lastQr = qr;
            sessionObj.ready = false;

            this._updateStatus(sessionObj, SESSION_STATUS.SCAN_QR_CODE);

            if (this.onQr) {
                try { this.onQr(sessionId, qr); } catch (e) {}
            }
            this._sendWebhook(sessionObj, "qr", { sessionId, qr });
        });

        client.on("ready", () => {
            console.log(`✅ [${sessionId}] WhatsApp CONECTADO Y OPERATIVO (WORKING)`);
            sessionObj.lastQr = null;
            sessionObj.ready = true;
            sessionObj._reconnectAttempt = 0;

            this._updateStatus(sessionObj, SESSION_STATUS.WORKING);
        });

        client.on("auth_failure", (msg) => {
            console.error(`❌ [${sessionId}] ERROR DE AUTENTICACIÓN:`, msg);
            sessionObj.ready = false;
            sessionObj._manualStop = true;
            if (sessionObj._reconnectTimer) {
                clearTimeout(sessionObj._reconnectTimer);
                sessionObj._reconnectTimer = null;
            }

            this._updateStatus(sessionObj, SESSION_STATUS.FAILED);
        });

        client.on("disconnected", (reason) => {
            console.warn(`⚠️ [${sessionId}] DESCONECTADO:`, reason);
            sessionObj.ready = false;
            this._scheduleSilentReconnect(sessionId, sessionObj, reason);
        });

        client.on("message_create", async (msg) => {
            try {
                if (this.onMessage) {
                    await this.onMessage(sessionId, msg, this);
                }

                let fromJid = msg.from;
                let notifyName = msg._data ? (msg._data.notifyName || msg._data.pushname) : "";

                // Si el remitente es un LID (@lid), resolver el contacto para obtener su número real
                if (fromJid && fromJid.endsWith("@lid")) {
                    try {
                        const contact = await msg.getContact();
                        if (contact) {
                            if (contact.number) fromJid = `${contact.number}@c.us`;
                            if (contact.name || contact.pushname) notifyName = contact.name || contact.pushname;
                        }
                    } catch (e) {}
                }

                const msgIdStr = msg.id ? (msg.id._serialized || msg.id.$1 || msg.id) : null;
                const hasMedia = !!(msg.hasMedia || msg.type === "ptt" || msg.type === "audio" || msg.type === "image" || msg.type === "video" || msg.type === "sticker" || msg.type === "document");
                const mediaUrl = (hasMedia && msgIdStr)
                    ? `${getManagerPublicUrl()}/api/media/${msgIdStr}`
                    : null;
                const mimetype = msg.mimetype || (msg.type === "ptt" || msg.type === "audio" ? "audio/ogg; codecs=opus" : (msg.type === "image" ? "image/jpeg" : null));

                const payload = {
                    id: msgIdStr,
                    from: fromJid,
                    to: msg.to,
                    fromMe: msg.fromMe,
                    author: msg.author || fromJid,
                    body: msg.body || "",
                    hasMedia: hasMedia,
                    type: msg.type || "chat",
                    mediaUrl: mediaUrl,
                    media: mediaUrl ? { url: mediaUrl, mimetype: mimetype } : null,
                    mimetype: mimetype,
                    timestamp: msg.timestamp,
                    _data: {
                        notifyName: notifyName,
                        pushName: notifyName
                    }
                };

                // Enviar webhook 'message' y 'message.any' para compatibilidad completa con CRM BR
                await this._sendWebhook(sessionObj, "message", payload);
                await this._sendWebhook(sessionObj, "message.any", payload);

            } catch (err) {
                console.error(`❌ [${sessionId}] Error en procesador de mensajes:`, err.message);
            }
        });
    }

    async _teardownSession(sessionId, { notify = true } = {}) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;

        const meta = {
            webhookUrl: session.webhookUrl,
            reconnectAttempt: session._reconnectAttempt || 0,
            manualStop: Boolean(session._manualStop),
        };

        if (session._reconnectTimer) {
            clearTimeout(session._reconnectTimer);
            session._reconnectTimer = null;
        }

        try {
            await session.client.destroy();
        } catch (e) {}

        if (notify) {
            this._updateStatus(session, SESSION_STATUS.STOPPED);
        }

        this.sessions.delete(sessionId);
        return meta;
    }

    _scheduleSilentReconnect(sessionId, sessionObj, reason) {
        if (sessionObj._manualStop) return;
        if (sessionObj._reconnectTimer) return;

        const attempt = (sessionObj._reconnectAttempt || 0) + 1;
        if (attempt > this.reconnectMaxAttempts) {
            console.error(
                `❌ [${sessionId}] Reconexión abandonada tras ${this.reconnectMaxAttempts} intentos (${reason})`
            );
            this._updateStatus(sessionObj, SESSION_STATUS.FAILED);
            return;
        }

        sessionObj._reconnectAttempt = attempt;
        const delay = Math.min(30000, 2000 * Math.pow(2, Math.min(attempt - 1, 4)));
        const webhookUrl = sessionObj.webhookUrl;

        console.log(
            `🔄 [${sessionId}] Reconexión silenciosa en ${delay}ms (intento ${attempt}/${this.reconnectMaxAttempts})`
        );
        this._updateStatus(sessionObj, SESSION_STATUS.RECONNECTING);

        sessionObj._reconnectTimer = setTimeout(async () => {
            sessionObj._reconnectTimer = null;
            const current = this.sessions.get(sessionId);
            if (current?._manualStop) return;

            const meta = await this._teardownSession(sessionId, { notify: false });
            if (!meta || meta.manualStop) return;

            try {
                const newSession = this.createSession(sessionId, {
                    webhookUrl: meta.webhookUrl || webhookUrl,
                });
                newSession._reconnectAttempt = meta.reconnectAttempt;
            } catch (err) {
                console.error(`⚠️ [${sessionId}] Falló reconexión:`, err.message);
                const shell = {
                    sessionId,
                    webhookUrl: meta.webhookUrl || webhookUrl,
                    _reconnectAttempt: meta.reconnectAttempt,
                    _manualStop: false,
                    client: null,
                    status: SESSION_STATUS.RECONNECTING,
                };
                this.sessions.set(sessionId, shell);
                this._scheduleSilentReconnect(sessionId, shell, err.message);
            }
        }, delay);
    }

    async _sendWebhook(sessionObj, event, payload) {
        const targetUrl = sessionObj.webhookUrl || this.webhookUrl;
        if (!targetUrl) return;

        const headers = { "Content-Type": "application/json" };
        if (this.webhookSecret) {
            headers["X-Webhook-Secret"] = this.webhookSecret;
        }

        try {
            await axios.post(targetUrl, {
                event,
                session: sessionObj.sessionId,
                payload
            }, {
                headers,
                timeout: 15000  // aumentado a 15s para tolerar CRM lento al arrancar
            });
        } catch (e) {
            console.log(`⚠️ [${sessionObj.sessionId}] No se pudo enviar Webhook (${event}) a ${targetUrl}: ${e.message}`);
        }

        if (this.eventSink) {
            try {
                this.eventSink({ event, session: sessionObj.sessionId, payload });
            } catch (e) {
                console.log(`⚠️ [${sessionObj.sessionId}] eventSink falló (${event}): ${e.message}`);
            }
        }
    }

    /**
     * Obtiene los chats recientes de WhatsApp con sus últimos mensajes.
     * Útil para re-sincronizar conversaciones al CRM después de una reconexión.
     */
    async getChats(sessionId, limit = 20, messagesPerChat = 10) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.client || session.status !== SESSION_STATUS.WORKING) {
            throw new Error(`Sesión '${sessionId}' no está en estado WORKING.`);
        }

        const client = session.client;
        const page = client.pupPage || (client.pupBrowser && (await client.pupBrowser.pages())[0]);
        if (!page) throw new Error("No se pudo obtener la página de Puppeteer.");

        const rawChats = await page.evaluate(async (maxChats, maxMsgs) => {
            try {
                const { Chat, Msg } = window.require('WAWebCollections');
                const chatModels = Chat.getModelsArray();
                const result = [];

                for (const c of chatModels.slice(0, maxChats)) {
                    const msgs = c.msgs ? c.msgs.getModelsArray().slice(-maxMsgs) : [];
                    let chatPhoneJid = c.id ? (c.id._serialized || c.id) : "";

                    if (chatPhoneJid.endsWith('@lid')) {
                        const rawPhone = c.contact ? String(c.contact.phoneNumber || c.contact.phone || c.contact.id?.user || '') : '';
                        const phoneDigits = rawPhone.replace(/\D/g, '');
                        if (phoneDigits && phoneDigits.length >= 10 && phoneDigits.length <= 15) {
                            chatPhoneJid = `${phoneDigits}@c.us`;
                        } else {
                            const authorMsg = msgs.find(m => m.author && (m.author._serialized || String(m.author)).endsWith('@c.us'));
                            if (authorMsg) {
                                chatPhoneJid = authorMsg.author._serialized || String(authorMsg.author);
                            } else if (c.formattedTitle && c.formattedTitle.match(/\+?\d{10,15}/)) {
                                chatPhoneJid = `${c.formattedTitle.replace(/\D/g, '')}@c.us`;
                            }
                        }
                    }

                    result.push({
                        chatId: chatPhoneJid,
                        name: c.formattedTitle || c.name || c.id.user || "",
                        isGroup: !!c.isGroup,
                        unreadCount: c.unreadCount || 0,
                        timestamp: c.t || Math.floor(Date.now() / 1000),
                        messages: msgs.map(m => {
                            const serializedId = m.id ? (typeof m.id === 'string' ? m.id : (m.id._serialized || m.id.id)) : null;
                            const fromMe = !!(m.id && m.id.fromMe);
                            const remoteJid = chatPhoneJid;
                            const fromJid = fromMe ? "me" : (m.from ? (m.from._serialized || m.from) : remoteJid);
                            const toJid = fromMe ? (m.to ? (m.to._serialized || m.to) : remoteJid) : "me";
                            const msgIdStr = serializedId || `sync_${remoteJid}_${m.t || Date.now()}`;

                            let rawBody = m.body || m.caption || "";
                            const isBase64Img = typeof rawBody === 'string' && (rawBody.startsWith('/9j/') || rawBody.startsWith('iVBORw0KGgo') || rawBody.startsWith('data:image'));
                            const hasMedia = !!(m.isMedia || m.mediaData || isBase64Img || m.type === "ptt" || m.type === "audio" || m.type === "image" || m.type === "video" || m.type === "sticker" || m.type === "document");
                            
                            let msgType = m.type || (hasMedia ? (m.isSticker ? "sticker" : (isBase64Img ? "image" : "audio")) : "chat");
                            if (isBase64Img) msgType = "image";

                            const mediaUrl = hasMedia ? `http://localhost:3005/api/media/${msgIdStr}` : null;
                            const mimetype = m.mimetype || (msgType === "image" ? "image/jpeg" : (msgType === "ptt" || msgType === "audio" ? "audio/ogg; codecs=opus" : null));

                            return {
                                id: msgIdStr,
                                from: fromJid,
                                to: toJid,
                                fromMe: fromMe,
                                author: m.author ? (m.author._serialized || m.author) : fromJid,
                                body: isBase64Img ? "" : rawBody,
                                rawBase64: isBase64Img ? rawBody : null,
                                hasMedia: hasMedia,
                                type: msgType,
                                mediaUrl: mediaUrl,
                                media: mediaUrl ? { url: mediaUrl, mimetype: mimetype } : null,
                                mimetype: mimetype,
                                timestamp: m.t || Math.floor(Date.now() / 1000),
                                _data: {
                                    notifyName: m.sender ? (m.sender.pushname || m.sender.name || "") : "",
                                    pushName: m.sender ? (m.sender.pushname || m.sender.name || "") : ""
                                }
                            };
                        })
                    });
                }
                return result;
            } catch (e) {
                return { error: e.message };
            }
        }, limit, messagesPerChat);

        if (rawChats && rawChats.error) {
            throw new Error(`Error extrayendo chats de WhatsApp Web: ${rawChats.error}`);
        }

        return rawChats || [];
    }

    /**
     * Re-envía los mensajes de los chats recientes al webhook del CRM.
     * Permite recuperar conversaciones que se perdieron por timeouts al arrancar.
     */
    async syncChatsToWebhook(sessionId, limit = 20, messagesPerChat = 5) {
        const sessionObj = this.sessions.get(sessionId);
        if (!sessionObj) throw new Error(`Sesión '${sessionId}' no encontrada.`);

        const chats = await this.getChats(sessionId, limit, messagesPerChat);
        let sent = 0;
        let errors = 0;

        for (const chat of chats) {
            for (const msg of chat.messages) {
                try {
                    msg.chatName = chat.name || "";
                    if (msg.fromMe) {
                        msg.to = chat.chatId;
                    } else {
                        msg.from = chat.chatId;
                    }
                    await this._sendWebhook(sessionObj, "message", msg);
                    sent++;
                } catch (e) {
                    errors++;
                }
            }
        }

        console.log(`🔄 [${sessionId}] Sync completado: ${sent} mensajes reenviados al CRM. Errores: ${errors}`);
        return { chats: chats.length, sent, errors };
    }

    _normalizeDownloadInput(msg) {
        if (typeof msg === "string") {
            return {
                msgIdObj: { _serialized: msg, $1: msg },
                msgIdStr: msg,
                nativeMsg: null,
            };
        }
        if (msg && typeof msg === "object") {
            if (typeof msg.downloadMedia === "function") {
                const id = msg.id || {};
                const msgIdStr =
                    id._serialized || id.$1 || (typeof id === "string" ? id : String(id));
                return { msgIdObj: id, msgIdStr, nativeMsg: msg };
            }
            if (msg.id) {
                const id =
                    typeof msg.id === "string"
                        ? { _serialized: msg.id, $1: msg.id }
                        : msg.id;
                const msgIdStr =
                    typeof msg.id === "string"
                        ? msg.id
                        : msg.id._serialized || msg.id.$1 || String(msg.id);
                return { msgIdObj: id, msgIdStr, nativeMsg: null };
            }
        }
        const fallback = String(msg ?? "");
        return {
            msgIdObj: { _serialized: fallback, $1: fallback },
            msgIdStr: fallback,
            nativeMsg: null,
        };
    }

    /**
     * Descarga adjuntos con el parche $1 de IndexedDB (PMV-CORE) y fallback nativo.
     * Acepta messageId string, { id }, o instancia Message de whatsapp-web.js.
     */
    async downloadMedia(sessionId, msg) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.client) return null;

        const { msgIdObj, msgIdStr, nativeMsg } = this._normalizeDownloadInput(msg);
        if (!msgIdStr) return null;

        let media = null;

        try {
            const page =
                session.client.pupPage ||
                (session.client.pupBrowser &&
                    (await session.client.pupBrowser.pages())[0]);
            if (page) {
                media = await page.evaluate(
                    async (msgIdObjParam, msgIdStrParam) => {
                        const { Msg } = window.require("WAWebCollections");
                        const { createWid } = window.require("WAWebWidFactory");
                        const msgIdStr =
                            msgIdStrParam ||
                            msgIdObjParam._serialized ||
                            msgIdObjParam.$1;
                        const key1 = {
                            ...msgIdObjParam,
                            remote:
                                typeof msgIdObjParam.remote === "string"
                                    ? createWid(msgIdObjParam.remote)
                                    : msgIdObjParam.remote,
                            participant:
                                typeof msgIdObjParam.participant === "string"
                                    ? createWid(msgIdObjParam.participant)
                                    : msgIdObjParam.participant,
                            _serialized: msgIdStr,
                            $1: msgIdStr,
                        };
                        const key2 = {
                            fromMe: msgIdObjParam.fromMe,
                            remote: key1.remote,
                            id: msgIdObjParam.id,
                            participant: key1.participant,
                            _serialized: msgIdStr,
                            $1: msgIdStr,
                        };
                        const candidates = [key2, key1, msgIdStr];

                        let message = null;
                        let debugLog = "";
                        for (const cand of candidates) {
                            try {
                                const m = Msg.get(cand);
                                if (m && m.mediaData) {
                                    message = m;
                                    break;
                                }
                            } catch (e) {
                                debugLog += `get(${typeof cand}) err: ${e.message}; `;
                            }

                            try {
                                const dbRes = await Msg.getMessagesById([cand]);
                                if (
                                    dbRes &&
                                    dbRes.messages &&
                                    dbRes.messages.length > 0 &&
                                    dbRes.messages[0] &&
                                    dbRes.messages[0].mediaData
                                ) {
                                    message = dbRes.messages[0];
                                    break;
                                }
                            } catch (e) {
                                debugLog += `db(${typeof cand}) err: ${e.message}; `;
                            }
                        }

                        if (!message) {
                            message = Msg.getModelsArray().find(
                                (m) => m.id && m.id._serialized === msgIdStr
                            );
                        }
                        if (!message) {
                            return {
                                error:
                                    "Message not found in WAWebCollections. " +
                                    debugLog,
                            };
                        }

                        if (
                            message.mediaData &&
                            message.mediaData.mediaStage === "REUPLOADING"
                        ) {
                            return { error: "mediaData is REUPLOADING" };
                        }

                        try {
                            await message.downloadMedia({
                                downloadEvenIfExpensive: true,
                                rmrReason: 1,
                                isUserInitiated: true,
                            });
                        } catch (e) {
                            debugLog += "downloadMedia err: " + e.message + ". ";
                        }

                        if (
                            message.mediaData &&
                            (message.mediaData.mediaStage.includes("ERROR") ||
                                message.mediaData.mediaStage === "FETCHING")
                        ) {
                            return { error: "mediaStage is ERROR or FETCHING" };
                        }

                        const cached = window
                            .require("WAWebMediaInMemoryBlobCache")
                            .InMemoryMediaBlobCache.get(
                                message.mediaObject?.filehash
                            );

                        let blob;
                        if (cached) {
                            blob = cached;
                        } else if (message.mediaObject?.mediaBlob) {
                            blob = message.mediaObject.mediaBlob.forceToBlob();
                        }

                        if (!blob) {
                            return {
                                error: `Blob could not be extracted. mediaObject: ${!!message.mediaObject}, cached: ${!!cached}. debug: ${debugLog}`,
                            };
                        }

                        const data = await window.WWebJS.arrayBufferToBase64Async(
                            await blob.arrayBuffer()
                        );
                        return {
                            data,
                            mimetype: message.mimetype,
                            filename: message.filename,
                            filesize: message.size,
                        };
                    },
                    msgIdObj,
                    msgIdStr
                );

                if (media && media.error) {
                    console.error(
                        `⚠️ [${sessionId}] Parche $1: ${media.error}`
                    );
                    media = null;
                } else if (media && media.data) {
                    console.log(
                        `✅ [${sessionId}] Media descargada (parche $1) para ${msgIdStr}`
                    );
                }
            }
        } catch (err) {
            console.error(
                `⚠️ [${sessionId}] Error en parche $1 de descarga:`,
                err.message
            );
        }

        if (!media && nativeMsg) {
            try {
                console.log(
                    `ℹ️ [${sessionId}] Fallback downloadMedia() nativo para ${msgIdStr}`
                );
                const stdMedia = await nativeMsg.downloadMedia();
                if (stdMedia && stdMedia.data) {
                    media = stdMedia;
                }
            } catch (err) {
                console.error(
                    `⚠️ [${sessionId}] Fallback nativo falló:`,
                    err.message
                );
            }
        }

        return media;
    }

    async getScreenshot(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.client) {
            return null;
        }

        try {
            const client = session.client;
            let page = client.pupPage;
            
            if (!page && client.pupBrowser) {
                const pages = await client.pupBrowser.pages();
                if (pages && pages.length > 0) {
                    page = pages[0];
                }
            }

            if (page) {
                const screenshotBuffer = await page.screenshot({ type: "png" });
                console.log(`📸 Screenshot capturada exitosamente para [${sessionId}]`);
                return screenshotBuffer;
            } else {
                return null;
            }
        } catch (err) {
            console.error(`❌ Error tomando screenshot de [${sessionId}]:`, err.message);
            return null;
        }
    }

    async sendMessage(sessionId, chatId, text) {
        const session = this.sessions.get(sessionId);
        if (!session || session.status !== SESSION_STATUS.WORKING) {
            throw new Error(`La sesión '${sessionId}' no está activa o lista (Estado actual: ${session ? session.status : 'NO_EXISTE'}).`);
        }

        let targetJid = chatId;
        const cleanPhone = (targetJid || "").replace(/@.*$/, "").replace(/\D/g, "");

        if (!targetJid.endsWith("@g.us") && cleanPhone) {
            try {
                const numberDetails = await session.client.getNumberId(cleanPhone);
                if (numberDetails && numberDetails._serialized) {
                    targetJid = numberDetails._serialized;
                } else if (!targetJid.includes("@")) {
                    targetJid = `${cleanPhone}@c.us`;
                }
            } catch (e) {
                if (!targetJid.includes("@")) {
                    targetJid = `${cleanPhone}@c.us`;
                }
            }
        }

        try {
            const result = await session.client.sendMessage(targetJid, text);
            return result || { id: { _serialized: `true_${targetJid}_${Date.now()}` } };
        } catch (err) {
            const msg = err ? (err.message || String(err)) : "Error desconocido";
            if (msg.includes("No LID for user") || msg.includes("Evaluation failed")) {
                throw new Error(`El número (${cleanPhone || chatId}) no existe en WhatsApp o es un identificador de prueba no válido.`);
            }
            throw err;
        }
    }

    async sendMedia(sessionId, chatId, fileSource, filename, caption = "") {
        const session = this.sessions.get(sessionId);
        if (!session || session.status !== SESSION_STATUS.WORKING) {
            throw new Error(`La sesión '${sessionId}' no está en estado WORKING.`);
        }

        let targetJid = chatId;
        const cleanPhone = (targetJid || "").replace(/@.*$/, "").replace(/\D/g, "");

        if (!targetJid.endsWith("@g.us") && cleanPhone) {
            try {
                const numberDetails = await session.client.getNumberId(cleanPhone);
                if (numberDetails && numberDetails._serialized) {
                    targetJid = numberDetails._serialized;
                } else if (!targetJid.includes("@")) {
                    targetJid = `${cleanPhone}@c.us`;
                }
            } catch (e) {
                if (!targetJid.includes("@")) {
                    targetJid = `${cleanPhone}@c.us`;
                }
            }
        }

        let media;
        if (Buffer.isBuffer(fileSource)) {
            const mimetype = require("mime-types").lookup(filename) || "application/octet-stream";
            media = new MessageMedia(mimetype, fileSource.toString("base64"), filename);
        } else {
            media = MessageMedia.fromFilePath(fileSource);
        }

        try {
            const result = await session.client.sendMessage(targetJid, media, { caption });
            return result || { id: { _serialized: `true_${targetJid}_${Date.now()}` } };
        } catch (err) {
            const msg = err ? (err.message || String(err)) : "Error desconocido";
            if (msg.includes("No LID for user") || msg.includes("Evaluation failed")) {
                throw new Error(`El número (${cleanPhone || chatId}) no existe en WhatsApp o es un identificador de prueba no válido.`);
            }
            throw err;
        }
    }

    async stopSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session._manualStop = true;
            await this._teardownSession(sessionId, { notify: true });
            console.log(`🛑 Sesión [${sessionId}] detenida.`);
            return true;
        }
        return false;
    }

    static resetSessionFiles(sessionId, sessionsPath = "./sessions") {
        const sessionFolder = path.resolve(sessionsPath, `session-${sessionId}`);
        if (fs.existsSync(sessionFolder)) {
            fs.rmSync(sessionFolder, { recursive: true, force: true });
            console.log(`🗑️ Carpeta de sesión eliminada: ${sessionFolder}`);
            return true;
        }
        return false;
    }

    _getSessionMeInfo(sessionObj) {
        if (!sessionObj.ready || !sessionObj.client || !sessionObj.client.info) {
            return null;
        }
        const info = sessionObj.client.info;
        const wid = info.wid ? info.wid._serialized : null;
        const pushName = info.pushname || "";
        return wid ? { id: wid, pushName } : null;
    }

    getSessionsList() {
        const list = [];
        for (const [id, s] of this.sessions.entries()) {
            list.push({
                name: id,
                sessionId: id,
                status: s.status,
                ready: s.ready,
                hasQr: !!s.lastQr,
                qr: s.lastQr,
                me: this._getSessionMeInfo(s),
                webhookUrl: s.webhookUrl,
                startedAt: s.startedAt
            });
        }
        return list;
    }

    getSession(sessionId) {
        const s = this.sessions.get(sessionId);
        if (!s) return null;
        return {
            ...s,
            name: sessionId,
            me: this._getSessionMeInfo(s)
        };
    }
}

module.exports = { WhatsAppMultiManager, SESSION_STATUS };
