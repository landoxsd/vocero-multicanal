const { WhatsAppMultiManager } = require("./WhatsAppMultiManager");
const InstagramManager = require("./InstagramManager");
const MercadoLibreManager = require("./MercadoLibreManager");

class OmniChannelManager {
    /**
     * @param {Object} config 
     * @param {string} [config.sessionsDir='./sessions']
     * @param {boolean} [config.headless=false]
     * @param {string} [config.webhookUrl]
     */
    constructor(config = {}) {
        this.sessionsDir = config.sessionsDir || "./sessions";
        this.webhookUrl = config.webhookUrl || null;
        this.webhookSecret = config.webhookSecret || null;

        // Instanciar los tres gestores de canales
        this.whatsapp = new WhatsAppMultiManager({
            sessionsPath: `${this.sessionsDir}/whatsapp`,
            headless: config.headless,
            webhookUrl: this.webhookUrl,
            webhookSecret: this.webhookSecret
        });

        this.instagram = new InstagramManager({
            dataPath: `${this.sessionsDir}/instagram`,
            webhookUrl: this.webhookUrl
        });

        this.mercadolibre = new MercadoLibreManager({
            dataPath: `${this.sessionsDir}/mercadolibre`,
            webhookUrl: this.webhookUrl
        });
    }

    /**
     * Envía un mensaje a cualquier canal con una firma unificada
     * @param {Object} options
     * @param {'whatsapp'|'instagram'|'mercadolibre'} options.channel Canal de destino
     * @param {string} options.accountId ID de la cuenta emisora
     * @param {string} options.recipientId ID del destinatario / chat / order
     * @param {string} options.text Texto del mensaje
     * @param {string} [options.subType] Opcional: 'question' o 'post_sale' para MercadoLibre
     * @param {string} [options.buyerId] Opcional: Para MercadoLibre post-venta
     */
    async sendMessage({ channel, accountId, recipientId, text, subType, buyerId }) {
        console.log(`🌐 [OmniChannel] Enviando mensaje por [${channel.toUpperCase()}] desde [${accountId}] a [${recipientId}]...`);

        switch (channel.toLowerCase()) {
            case "whatsapp":
                return await this.whatsapp.sendMessage(accountId, recipientId, text);

            case "instagram":
                return await this.instagram.sendMessage(accountId, recipientId, text);

            case "mercadolibre":
                if (subType === "question") {
                    return await this.mercadolibre.answerQuestion(accountId, recipientId, text);
                } else {
                    return await this.mercadolibre.sendPostSaleMessage(accountId, recipientId, buyerId || recipientId, text);
                }

            default:
                throw new Error(`Canal '${channel}' no soportado. Usa: 'whatsapp', 'instagram' o 'mercadolibre'.`);
        }
    }

    /**
     * Obtiene el estado resumido de todos los canales activos
     */
    getSummary() {
        return {
            whatsapp: this.whatsapp.getSessionsList(),
            instagram: this.instagram.getAccountsList(),
            mercadolibre: this.mercadolibre.getAccountsList()
        };
    }
}

module.exports = OmniChannelManager;
