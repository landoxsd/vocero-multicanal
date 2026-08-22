import {
  ChannelAccountRecord,
  ChannelProviderAdapter,
  ChannelStatus,
  OutboundMessagePayload,
  SendResult,
} from "../types";

export class MercadoLibreAdapter implements ChannelProviderAdapter {
  provider = "mercadolibre" as const;

  async sendMessage(
    account: ChannelAccountRecord,
    payload: OutboundMessagePayload
  ): Promise<SendResult> {
    const meta = (account.metadata || {}) as {
      accessToken?: string;
      refreshToken?: string;
      sellerId?: string;
    };
    const accessToken = meta.accessToken;

    if (!accessToken) {
      return {
        success: false,
        error: "Falta el access_token de MercadoLibre",
      };
    }

    const subType = (payload.metadata?.subType as string) || "question";

    try {
      if (subType === "question" || payload.metadata?.questionId) {
        // Respuesta a Pregunta Pre-Venta
        const questionId = payload.metadata?.questionId || payload.recipientId;
        const res = await fetch("https://api.mercadolibre.com/answers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            question_id: questionId,
            text: payload.text,
          }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          return {
            success: false,
            error: data.message || data.error || "Error al responder pregunta en MercadoLibre",
          };
        }

        return {
          success: true,
          externalMessageId: String(data.id || questionId),
        };
      } else {
        // Mensaje Post-Venta
        const packId = (payload.metadata?.packId as string) || payload.recipientId;
        const sellerId = meta.sellerId || (payload.metadata?.sellerId as string);
        const buyerId = payload.metadata?.buyerId as string;

        if (!packId || !sellerId || !buyerId) {
          return {
            success: false,
            error: "Faltan packId, sellerId o buyerId para mensaje post-venta en MercadoLibre",
          };
        }

        const url = `https://api.mercadolibre.com/messages/packs/${packId}/sellers/${sellerId}?tag=post_sale`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            from: { user_id: sellerId },
            to: [{ user_id: buyerId, resource: "orders", resource_id: packId }],
            text: payload.text,
          }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          return {
            success: false,
            error: data.message || data.error || "Error al enviar mensaje post-venta en MercadoLibre",
          };
        }

        return {
          success: true,
          externalMessageId: data.id || `meli_${Date.now()}`,
        };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  async getStatus(account: ChannelAccountRecord): Promise<ChannelStatus> {
    const meta = (account.metadata || {}) as { accessToken?: string };
    return meta.accessToken ? "connected" : "disconnected";
  }
}
