import {
  ChannelAccountRecord,
  ChannelProviderAdapter,
  ChannelStatus,
  OutboundMessagePayload,
  SendResult,
} from "../types";

export class FacebookMessengerAdapter implements ChannelProviderAdapter {
  provider = "facebook_messenger" as const;
  private apiVersion: string;

  constructor() {
    this.apiVersion = process.env.META_GRAPH_API_VERSION || "v21.0";
  }

  async sendMessage(
    account: ChannelAccountRecord,
    payload: OutboundMessagePayload
  ): Promise<SendResult> {
    const meta = (account.metadata || {}) as { pageAccessToken?: string };
    const token = meta.pageAccessToken;

    if (!token) {
      return {
        success: false,
        error: "Falta el Page Access Token para Facebook Messenger",
      };
    }

    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/me/messages`;
      const body: Record<string, unknown> = {
        recipient: { id: payload.recipientId },
      };

      if (payload.mediaUrl) {
        body.message = {
          attachment: {
            type: payload.mediaType || "image",
            payload: { url: payload.mediaUrl, is_reusable: true },
          },
        };
      } else {
        body.message = { text: payload.text };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        return {
          success: false,
          error: data.error?.message || "Error al enviar mensaje por Facebook Messenger",
        };
      }

      return {
        success: true,
        externalMessageId: data.message_id || `fb_${Date.now()}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  async getStatus(account: ChannelAccountRecord): Promise<ChannelStatus> {
    const meta = (account.metadata || {}) as { pageAccessToken?: string };
    return meta.pageAccessToken ? "connected" : "disconnected";
  }
}
