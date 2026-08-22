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
      process.env.WA_WEB_MANAGER_URL || "http://127.0.0.1:3001";
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
      if (payload.mediaUrl) {
        const response = await fetch(`${this.managerUrl}/api/sendMedia`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session: sessionId,
            chatId: recipient,
            mediaUrl: payload.mediaUrl,
            caption: payload.text || "",
            mediaType: payload.mediaType,
            fileName: payload.fileName,
          }),
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
        headers: { "Content-Type": "application/json" },
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
      const res = await fetch(`${this.managerUrl}/api/sessions/${sessionId}/status`);
      if (!res.ok) return "disconnected";
      const data = await res.json();
      return (data.status as ChannelStatus) || "disconnected";
    } catch {
      return "disconnected";
    }
  }

  async getQrCode(account: ChannelAccountRecord): Promise<string | null> {
    const sessionId = account.accountIdentifier || account.id;
    try {
      const res = await fetch(`${this.managerUrl}/api/sessions/${sessionId}/qr`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.qrCode || data.qr || null;
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: sessionId,
        webhookUrl,
      }),
    });
    const data = await res.json();
    return {
      qrCode: data.qr || data.qrCode,
      status: (data.status as ChannelStatus) || "connecting",
    };
  }

  async disconnect(account: ChannelAccountRecord): Promise<void> {
    const sessionId = account.accountIdentifier || account.id;
    try {
      await fetch(`${this.managerUrl}/api/sessions/${sessionId}`, {
        method: "DELETE",
      });
    } catch {
      // Ignorar error al desconectar
    }
  }
}
