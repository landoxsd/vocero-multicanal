const axios = require("axios");
const fs = require("fs");
const path = require("path");

class InstagramManager {
    /**
     * @param {Object} options 
     * @param {string} [options.dataPath='./sessions/instagram'] Ruta para guardar credenciales de Instagram
     * @param {string} [options.webhookUrl] URL para enviar webhooks salientes
     */
    constructor(options = {}) {
        this.dataPath = path.resolve(options.dataPath || "./sessions/instagram");
        this.webhookUrl = options.webhookUrl || null;
        
        /** @type {Map<string, { accountId: string, pageId: string, accessToken: string, type: 'OFFICIAL'|'PRIVATE' }>} */
        this.accounts = new Map();

        this._ensureDir();
        this._loadStoredAccounts();
    }

    _ensureDir() {
        if (!fs.existsSync(this.dataPath)) {
            fs.mkdirSync(this.dataPath, { recursive: true });
        }
    }

    _loadStoredAccounts() {
        try {
            const files = fs.readdirSync(this.dataPath).filter(f => f.endsWith(".json"));
            for (const file of files) {
                const content = fs.readFileSync(path.join(this.dataPath, file), "utf-8");
                const data = JSON.parse(content);
                this.accounts.set(data.accountId, data);
                console.log(`📸 [Instagram] Cuenta '${data.accountId}' cargada.`);
            }
        } catch (e) {
            console.error("❌ Error cargando cuentas de Instagram:", e.message);
        }
    }

    _saveAccountData(acc) {
        const filePath = path.join(this.dataPath, `${acc.accountId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(acc, null, 2), "utf-8");
    }

    /**
     * Registrar cuenta de Instagram usando la API Oficial de Meta Graph
     */
    addOfficialAccount(accountId, { pageId, accessToken }) {
        const acc = {
            accountId,
            pageId,
            accessToken,
            type: "OFFICIAL"
        };
        this.accounts.set(accountId, acc);
        this._saveAccountData(acc);
        console.log(`✅ [Instagram] Cuenta Oficial '${accountId}' registrada con éxito.`);
        return acc;
    }

    /**
     * Enviar mensaje Direct de Instagram (API Oficial Meta Messenger)
     * @param {string} accountId 
     * @param {string} recipientId Instagram Scoped ID (IGSID)
     * @param {string} text Texto del mensaje
     */
    async sendMessage(accountId, recipientId, text) {
        const acc = this.accounts.get(accountId);
        if (!acc) throw new Error(`Cuenta de Instagram '${accountId}' no encontrada.`);

        if (acc.type === "OFFICIAL") {
            const url = `https://graph.facebook.com/v19.0/${acc.pageId}/messages`;
            const res = await axios.post(
                url,
                {
                    recipient: { id: recipientId },
                    message: { text }
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${acc.accessToken}`
                    }
                }
            );
            console.log(`📸 [Instagram] Mensaje enviado a ${recipientId} via Meta Graph API.`);
            return res.data;
        } else {
            throw new Error("Tipo de cuenta no soportado aún.");
        }
    }

    /**
     * Procesar Webhook entrante de Meta Instagram Graph API
     */
    async handleWebhookNotification(body) {
        if (body.object !== "instagram" && body.object !== "page") return;

        console.log("📸 [Instagram Webhook] Notificación recibida de Meta.");
        
        for (const entry of body.entry || []) {
            for (const messaging of entry.messaging || []) {
                const senderId = messaging.sender.id;
                const messageText = messaging.message ? messaging.message.text : "";

                const eventData = {
                    channel: "instagram",
                    senderId,
                    recipientId: messaging.recipient.id,
                    text: messageText,
                    timestamp: messaging.timestamp
                };

                if (this.webhookUrl) {
                    await axios.post(this.webhookUrl, { event: "instagram.message", payload: eventData }).catch(() => {});
                }
            }
        }
    }

    getAccountsList() {
        return Array.from(this.accounts.values()).map(a => ({
            accountId: a.accountId,
            type: a.type,
            pageId: a.pageId
        }));
    }
}

module.exports = InstagramManager;
