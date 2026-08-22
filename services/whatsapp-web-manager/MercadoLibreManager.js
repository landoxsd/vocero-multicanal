const axios = require("axios");
const fs = require("fs");
const path = require("path");

class MercadoLibreManager {
    /**
     * @param {Object} options 
     * @param {string} [options.dataPath='./sessions/mercadolibre'] Ruta para guardar los tokens OAuth
     * @param {string} [options.webhookUrl] URL para reenviar notificaciones de MercadoLibre
     */
    constructor(options = {}) {
        this.dataPath = path.resolve(options.dataPath || "./sessions/mercadolibre");
        this.webhookUrl = options.webhookUrl || null;
        
        /** @type {Map<string, { accountId: string, appId: string, secret: string, accessToken: string, refreshToken: string, sellerId: string, expiresAt: number }>} */
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
                console.log(`💛 [MercadoLibre] Cuenta '${data.accountId}' cargada desde disco.`);
            }
        } catch (e) {
            console.error("❌ Error cargando cuentas de MercadoLibre:", e.message);
        }
    }

    _saveAccountData(acc) {
        const filePath = path.join(this.dataPath, `${acc.accountId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(acc, null, 2), "utf-8");
    }

    /**
     * Vincula y guarda las credenciales OAuth de una cuenta de MercadoLibre
     */
    async addAccount(accountId, { appId, secret, refreshToken, sellerId }) {
        const acc = {
            accountId,
            appId,
            secret,
            refreshToken,
            sellerId,
            accessToken: null,
            expiresAt: 0
        };

        this.accounts.set(accountId, acc);
        await this.refreshAccessToken(accountId);
        return acc;
    }

    /**
     * Renueva automáticamente el token de acceso OAuth2 antes de que expire (dura 6 horas)
     */
    async refreshAccessToken(accountId) {
        const acc = this.accounts.get(accountId);
        if (!acc) throw new Error(`Cuenta de MercadoLibre '${accountId}' no encontrada.`);

        try {
            console.log(`🔄 [MercadoLibre] Renovando Token para '${accountId}'...`);
            const res = await axios.post("https://api.mercadolibre.com/oauth/token", {
                grant_type: "refresh_token",
                client_id: acc.appId,
                client_secret: acc.secret,
                refresh_token: acc.refreshToken
            });

            acc.accessToken = res.data.access_token;
            acc.refreshToken = res.data.refresh_token;
            acc.sellerId = acc.sellerId || res.data.user_id;
            acc.expiresAt = Date.now() + (res.data.expires_in * 1000) - (60 * 1000); // 1 min buffer

            this._saveAccountData(acc);
            console.log(`✅ [MercadoLibre] Token renovado exitosamente para '${accountId}'!`);
            return acc.accessToken;
        } catch (err) {
            console.error(`❌ [MercadoLibre] Error renovando Token para '${accountId}':`, err.response ? err.response.data : err.message);
            throw err;
        }
    }

    async _getValidToken(accountId) {
        const acc = this.accounts.get(accountId);
        if (!acc) throw new Error(`Cuenta '${accountId}' no existe.`);
        if (Date.now() >= acc.expiresAt || !acc.accessToken) {
            return await this.refreshAccessToken(accountId);
        }
        return acc.accessToken;
    }

    /**
     * Responder a una PREGUNTA pre-compra de una publicación
     * @param {string} accountId 
     * @param {number|string} questionId ID de la pregunta
     * @param {string} answerText Texto de la respuesta
     */
    async answerQuestion(accountId, questionId, answerText) {
        const token = await this._getValidToken(accountId);
        const res = await axios.post(
            "https://api.mercadolibre.com/answers",
            {
                question_id: parseInt(questionId),
                text: answerText
            },
            {
                headers: { Authorization: `Bearer ${token}` }
            }
        );
        console.log(`💛 [MercadoLibre] Pregunta ${questionId} respondida exitosamente.`);
        return res.data;
    }

    /**
     * Enviar mensaje POST-VENTA en una compra realizada
     * @param {string} accountId 
     * @param {string} packId ID del paquete/orden de compra
     * @param {string} buyerUserId ID del comprador
     * @param {string} text Texto del mensaje
     */
    async sendPostSaleMessage(accountId, packId, buyerUserId, text) {
        const acc = this.accounts.get(accountId);
        const token = await this._getValidToken(accountId);

        const url = `https://api.mercadolibre.com/messages/packs/${packId}/sellers/${acc.sellerId}?client_id=${acc.appId}`;
        const res = await axios.post(
            url,
            {
                from: { user_id: parseInt(acc.sellerId) },
                to: { user_id: parseInt(buyerUserId) },
                text: { plain: text }
            },
            {
                headers: { Authorization: `Bearer ${token}` }
            }
        );
        console.log(`💛 [MercadoLibre] Mensaje post-venta enviado a Pack ${packId}.`);
        return res.data;
    }

    /**
     * Procesador de Webhooks de MercadoLibre (recibe notificaciones POST de MeLi)
     */
    async handleWebhookNotification(body) {
        const { topic, resource, user_id } = body;
        console.log(`💛 [MercadoLibre Webhook] Notificación recibida: Topic=${topic}, Resource=${resource}`);

        // Encontrar cuenta correspondiente por sellerId
        let matchedAccount = null;
        for (const acc of this.accounts.values()) {
            if (String(acc.sellerId) === String(user_id)) {
                matchedAccount = acc;
                break;
            }
        }

        if (!matchedAccount) {
            console.warn(`⚠️ Notificación de MercadoLibre no coincide con ninguna cuenta registrada (sellerId: ${user_id})`);
            return;
        }

        // Obtener detalles del recurso
        try {
            const token = await this._getValidToken(matchedAccount.accountId);
            const res = await axios.get(`https://api.mercadolibre.com${resource}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const eventData = {
                channel: "mercadolibre",
                accountId: matchedAccount.accountId,
                topic,
                resource,
                data: res.data
            };

            // Notificar vía webhook global
            if (this.webhookUrl) {
                await axios.post(this.webhookUrl, { event: "mercadolibre.notification", payload: eventData }).catch(() => {});
            }

            return eventData;
        } catch (e) {
            console.error("❌ Error procesando recurso de MercadoLibre:", e.message);
        }
    }

    getAccountsList() {
        return Array.from(this.accounts.values()).map(a => ({
            accountId: a.accountId,
            sellerId: a.sellerId,
            hasToken: !!a.accessToken,
            expiresAt: new Date(a.expiresAt).toISOString()
        }));
    }
}

module.exports = MercadoLibreManager;
