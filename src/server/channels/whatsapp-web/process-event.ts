import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { omniChannelManager } from "@/server/channels/omnichannel-manager";

export type WaWebWebhookBody = {
  event: string;
  session: string;
  payload?: Record<string, unknown>;
  qr?: string;
  fromMe?: boolean;
  from?: string;
  to?: string;
  text?: string;
  error?: string;
};

export type WaWebProcessResult =
  | { ok: true; status: string; [key: string]: unknown }
  | { ok: false; httpStatus: number; error: string };

/**
 * Procesa un evento del whatsapp-web-manager (webhook HTTP o WebSocket).
 * La idempotencia de mensajes vive en OmniChannelManager (externalMessageId).
 */
export async function processWaWebEvent(
  body: WaWebWebhookBody
): Promise<WaWebProcessResult> {
  const { event, session, payload } = body;
  const qr = body.qr ?? (payload?.qr as string | undefined);

  if (!session) {
    return { ok: false, httpStatus: 400, error: "Falta el identificador de sesión" };
  }

  const db = getDb();
  const [channel] = await db
    .select()
    .from(schema.channelAccount)
    .where(
      and(
        eq(schema.channelAccount.provider, "whatsapp_web"),
        eq(schema.channelAccount.accountIdentifier, session)
      )
    )
    .limit(1);

  if (!channel) {
    return {
      ok: false,
      httpStatus: 404,
      error: `Canal con sesión "${session}" no encontrado en el CRM`,
    };
  }

  const orgId = channel.organizationId;
  const channelWhere = scoped(
    schema.channelAccount.organizationId,
    orgId,
    eq(schema.channelAccount.id, channel.id)
  );

  if (event === "qr" && qr) {
    await db
      .update(schema.channelAccount)
      .set({ status: "scan_qr", qrCode: qr, updatedAt: new Date() })
      .where(channelWhere);
    return { ok: true, status: "qr_updated" };
  }

  if (event === "session.status") {
    const status = payload?.status as string | undefined;
    if (status === "WORKING") {
      await db
        .update(schema.channelAccount)
        .set({
          status: "connected",
          qrCode: null,
          errorMessage: null,
          lastConnectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(channelWhere);
      return { ok: true, status: "connected" };
    }
    if (status === "SCAN_QR_CODE" && qr) {
      await db
        .update(schema.channelAccount)
        .set({ status: "scan_qr", qrCode: qr, updatedAt: new Date() })
        .where(channelWhere);
      return { ok: true, status: "qr_updated" };
    }
    if (status === "STARTING" || status === "RECONNECTING") {
      await db
        .update(schema.channelAccount)
        .set({
          status: "connecting",
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(channelWhere);
      return { ok: true, status: "connecting" };
    }
    if (status === "FAILED" || status === "STOPPED") {
      await db
        .update(schema.channelAccount)
        .set({
          status: "disconnected",
          qrCode: null,
          errorMessage:
            (payload?.error as string | undefined) || "Sesión cerrada o desvinculada",
          updatedAt: new Date(),
        })
        .where(channelWhere);
      return { ok: true, status: "disconnected" };
    }
  }

  if (event === "ready" || event === "authenticated") {
    await db
      .update(schema.channelAccount)
      .set({
        status: "connected",
        qrCode: null,
        errorMessage: null,
        lastConnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(channelWhere);
    return { ok: true, status: "connected" };
  }

  if (event === "disconnected" || event === "auth_failure") {
    await db
      .update(schema.channelAccount)
      .set({
        status: "disconnected",
        qrCode: null,
        errorMessage:
          body.error ||
          (payload?.error as string | undefined) ||
          "Sesión cerrada o desvinculada",
        updatedAt: new Date(),
      })
      .where(channelWhere);
    return { ok: true, status: "disconnected" };
  }

  if (event === "message" || event === "message_create") {
    const isFromMe = Boolean(payload?.fromMe || body.fromMe);
    const targetJid = isFromMe
      ? String(payload?.to || body.to || "")
      : String(payload?.from || body.from || "");

    if (!targetJid || targetJid === "status@broadcast" || targetJid === "me") {
      return { ok: true, status: "ignored_broadcast_or_self" };
    }

    const text = String(payload?.body || payload?.text || body.text || "");
    const rawPhone = targetJid.replace(/@.*$/, "");
    const senderName = isFromMe
      ? String(payload?.chatName || payload?.name || rawPhone)
      : String(
          payload?.notifyName ||
            (payload?._data as { notifyName?: string } | undefined)?.notifyName ||
            payload?.name ||
            rawPhone
        );

    const extId = payload?.id;
    const externalMessageId =
      (typeof extId === "object" && extId !== null && "_serialized" in extId
        ? String((extId as { _serialized?: string })._serialized)
        : typeof extId === "string"
          ? extId
          : null) || `waw_${Date.now()}`;

    const result = await omniChannelManager.processInboundMessage({
      channelAccountId: channel.id,
      provider: "whatsapp_web",
      platform: "whatsapp",
      senderId: targetJid,
      senderName,
      senderPhone: rawPhone,
      direction: isFromMe ? "out" : "in",
      text,
      externalMessageId,
      mediaUrl: payload?.mediaUrl as string | undefined,
      mediaType: payload?.type as
        | "image"
        | "audio"
        | "video"
        | "document"
        | "sticker"
        | undefined,
      metadata: payload,
      timestamp: payload?.timestamp
        ? new Date(Number(payload.timestamp) * 1000)
        : new Date(),
    });

    return { ok: true, status: "processed", ...result };
  }

  return { ok: true, status: "ignored_event" };
}
