import {
  ChannelAccountRecord,
  ChannelProviderAdapter,
  ChannelStatus,
  OutboundMessagePayload,
  SendResult,
} from "../types";

export class WhatsAppWebAdapter implements ChannelProviderAdapter {
  provider = "whatsapp_web" as const;
  private managerUrl: string;

  constructor() {
    this.managerUrl =
      process.env.WA_WEB_MANAGER_URL || "http://127.0.0.1:3005";
  }

  private managerHeaders(
    extra?: Record<string, string>
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...extra,
    };
    const apiKey = process.env.WA_WEB_MANAGER_API_KEY;
    if (apiKey) headers["x-api-key"] = apiKey;
    return headers;
  }

  async sendMessage(
    account: ChannelAccountRecord,
    payload: OutboundMessagePayload
  ): Promise<SendResult> {
    const sessionId = account.accountIdentifier || account.id;
    const recipient = payload.recipientId.includes("@")
      ? payload.recipientId
      : `${payload.recipientId}@c.us`;

    try {
      if (payload.mediaData || payload.mediaUrl) {
        const defaultName =
          payload.fileName ||
          (payload.mediaType === "image"
            ? "imagen.jpg"
            : payload.mediaType === "video"
              ? "video.mp4"
              : payload.mediaType === "audio"
                ? "audio.ogg"
                : payload.mediaType === "document"
                  ? "documento.pdf"
                  : "adjunto.bin");

        const body: Record<string, unknown> = {
          session: sessionId,
          chatId: recipient,
          filename: defaultName,
          caption: payload.text || "",
          mediaType: payload.mediaType,
        };

        if (payload.mediaData) {
          body.fileSource = payload.mediaData.toString("base64");
          body.encoding = "base64";
        } else {
          body.mediaUrl = payload.mediaUrl;
        }

        const response = await fetch(`${this.managerUrl}/api/sendMedia`, {
          method: "POST",
          headers: this.managerHeaders(),
          body: JSON.stringify(body),
        });

        const data = await response.json();
        if (!response.ok || data.error) {
          return {
            success: false,
            error: data.error || "Error al enviar multimedia por WhatsApp Web",
          };
        }

        return {
          success: true,
          externalMessageId: data.messageId || data.id || `waw_${Date.now()}`,
        };
      }

      const response = await fetch(`${this.managerUrl}/api/sendText`, {
        method: "POST",
        headers: this.managerHeaders(),
        body: JSON.stringify({
          session: sessionId,
          chatId: recipient,
          text: payload.text,
        }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        return {
          success: false,
          error: data.error || "Error al enviar mensaje por WhatsApp Web",
        };
      }

      return {
        success: true,
        externalMessageId: data.messageId || data.id || `waw_${Date.now()}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  async getStatus(account: ChannelAccountRecord): Promise<ChannelStatus> {
    const sessionId = account.accountIdentifier || account.id;
    try {
      const res = await fetch(`${this.managerUrl}/api/sessions/${sessionId}`, {
        headers: this.managerHeaders(),
      });
      if (!res.ok) return "disconnected";
      const data = await res.json();
      const rawStatus = (data.status as string) || "";
      if (rawStatus === "WORKING" || data.ready) return "connected";
      if (rawStatus === "SCAN_QR_CODE" || data.hasQr) return "scan_qr";
      if (rawStatus === "STARTING" || rawStatus === "RECONNECTING") return "connecting";
      return "disconnected";
    } catch {
      return "disconnected";
    }
  }

  async getQrCode(account: ChannelAccountRecord): Promise<string | null> {
    const sessionId = account.accountIdentifier || account.id;
    try {
      const res = await fetch(`${this.managerUrl}/api/sessions/${sessionId}`, {
        headers: this.managerHeaders(),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.qr || data.qrCode || data.lastQr || null;
    } catch {
      return null;
    }
  }

  async createSession(
    account: ChannelAccountRecord,
    webhookUrl: string
  ): Promise<{ qrCode?: string; status: ChannelStatus }> {
    const sessionId = account.accountIdentifier || account.id;
    const res = await fetch(`${this.managerUrl}/api/sessions`, {
      method: "POST",
      headers: this.managerHeaders(),
      body: JSON.stringify({
        name: sessionId,
        webhookUrl,
      }),
    });
    const data = await res.json();
    const rawStatus = (data.status as string) || "";
    let status: ChannelStatus = "connecting";
    if (rawStatus === "WORKING" || data.ready) status = "connected";
    else if (rawStatus === "SCAN_QR_CODE" || data.qr) status = "scan_qr";

    return {
      qrCode: data.qr || data.qrCode,
      status,
    };
  }

  async syncChats(
    account: ChannelAccountRecord
  ): Promise<{ success: boolean; chats?: number; sent?: number }> {
    const sessionId = account.accountIdentifier || account.id;
    try {
      // 1. Obtener los chats y mensajes directamente desde el gestor de WhatsApp
      const res = await fetch(
        `${this.managerUrl}/api/sessions/${sessionId}/chats?limit=50&msgs=20`,
        { headers: this.managerHeaders() }
      );
      if (!res.ok) return { success: false };
      const data = (await res.json()) as {
        success?: boolean;
        chats?: Array<{
          chatId: string;
          name: string;
          messages: Array<{
            id: string | { _serialized?: string };
            from: string | { _serialized?: string };
            to: string | { _serialized?: string };
            fromMe: boolean;
            body: string;
            type?: string;
            timestamp?: number;
            _data?: { notifyName?: string; pushName?: string };
          }>;
        }>;
      };

      const rawChats = data.chats || [];
      const { omniChannelManager } = await import("../omnichannel-manager");

      let processedCount = 0;
      for (const chat of rawChats) {
        const rawChatId = typeof chat.chatId === "string" ? chat.chatId : "";
        if (!rawChatId || rawChatId.includes("status@broadcast") || rawChatId.includes("@g.us")) continue;
        const cleanPhone = rawChatId.replace(/@.*$/, "");

        for (const msg of chat.messages || []) {
          const fromMe = Boolean(msg.fromMe);
          const fromJid = typeof msg.from === "string" ? msg.from : msg.from?._serialized || rawChatId;
          const toJid = typeof msg.to === "string" ? msg.to : msg.to?._serialized || rawChatId;
          const targetJid = fromMe ? (toJid === "me" ? rawChatId : toJid) : (fromJid === "me" ? rawChatId : fromJid);
          const msgIdStr = typeof msg.id === "string" ? msg.id : msg.id?._serialized || `waw_${Date.now()}_${Math.random()}`;
          const senderName = fromMe
            ? (chat.name || cleanPhone)
            : (msg._data?.notifyName || msg._data?.pushName || chat.name || cleanPhone);

          let mediaType: "image" | "audio" | "video" | "document" | "sticker" | undefined = undefined;
          if (
            msg.type === "image" ||
            msg.type === "audio" ||
            msg.type === "video" ||
            msg.type === "document" ||
            msg.type === "sticker"
          ) {
            mediaType = msg.type;
          }

          await omniChannelManager.processInboundMessage({
            channelAccountId: account.id,
            provider: "whatsapp_web",
            platform: "whatsapp",
            senderId: targetJid,
            senderName,
            senderPhone: cleanPhone,
            direction: fromMe ? "out" : "in",
            text: msg.body || "",
            externalMessageId: msgIdStr,
            mediaType,
            timestamp: msg.timestamp ? new Date(msg.timestamp * 1000) : new Date(),
          });
          processedCount++;
        }
      }

      return { success: true, chats: rawChats.length, sent: processedCount };
    } catch (e) {
      console.error("[WhatsAppWebAdapter] Error sincronizando chats:", e);
      return { success: false };
    }
  }

  async disconnect(account: ChannelAccountRecord): Promise<void> {
    const sessionId = account.accountIdentifier || account.id;
    try {
      await fetch(`${this.managerUrl}/api/sessions/${sessionId}`, {
        method: "DELETE",
        headers: this.managerHeaders(),
      });
    } catch {
      // Ignorar error al desconectar
    }
  }
}
