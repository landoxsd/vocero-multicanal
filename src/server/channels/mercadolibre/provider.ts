import {
  legacyAccessTokenFromMetadata,
  resolveMeliAccessToken,
} from "@/server/channels/mercadolibre/credentials";
import { outboundMetaFromInbound } from "@/server/channels/mercadolibre/outbound-meta";
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
    const accessToken = await resolveMeliAccessToken(account);
    if (!accessToken) {
      return {
        success: false,
        error:
          "Falta o expiró el access_token de MercadoLibre: vuelve a vincular la cuenta",
      };
    }

    const meta = outboundMetaFromInbound(
      (payload.metadata || {}) as Record<string, unknown>
    );
    const accountMeta = (account.metadata || {}) as { sellerId?: string };
    const sellerId =
      meta.sellerId ||
      accountMeta.sellerId ||
      account.accountIdentifier ||
      undefined;

    try {
      if (meta.subType === "question" || meta.questionId) {
        const questionId = meta.questionId || payload.recipientId;
        if (!questionId) {
          return {
            success: false,
            error: "Falta questionId para responder la pregunta en MercadoLibre",
          };
        }

        const res = await fetch("https://api.mercadolibre.com/answers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            question_id: Number.isFinite(Number(questionId))
              ? Number(questionId)
              : questionId,
            text: payload.text,
          }),
        });

        const data = (await res.json()) as {
          id?: string | number;
          message?: string;
          error?: string;
        };
        if (!res.ok || data.error) {
          return {
            success: false,
            error:
              data.message ||
              data.error ||
              "Error al responder pregunta en MercadoLibre",
          };
        }

        return {
          success: true,
          externalMessageId: String(data.id || questionId),
        };
      }

      const packId = meta.packId || payload.recipientId;
      const buyerId = meta.buyerId;
      if (!packId || !sellerId || !buyerId) {
        return {
          success: false,
          error:
            "Faltan packId, sellerId o buyerId para mensaje post-venta en MercadoLibre",
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
          from: {
            user_id: Number.isFinite(Number(sellerId))
              ? Number(sellerId)
              : sellerId,
          },
          to: {
            user_id: Number.isFinite(Number(buyerId))
              ? Number(buyerId)
              : buyerId,
          },
          text: { plain: payload.text },
        }),
      });

      const data = (await res.json()) as {
        id?: string | number;
        message?: string;
        error?: string;
      };
      if (!res.ok || data.error) {
        return {
          success: false,
          error:
            data.message ||
            data.error ||
            "Error al enviar mensaje post-venta en MercadoLibre",
        };
      }

      return {
        success: true,
        externalMessageId: String(data.id || `meli_${Date.now()}`),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  async getStatus(account: ChannelAccountRecord): Promise<ChannelStatus> {
    const token =
      (await resolveMeliAccessToken(account)) ||
      legacyAccessTokenFromMetadata(account.metadata);
    return token ? "connected" : "disconnected";
  }
}
