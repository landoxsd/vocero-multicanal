import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { omniChannelManager } from "@/server/channels/omnichannel-manager";
import {
  legacyAccessTokenFromMetadata,
  resolveMeliAccessToken,
} from "@/server/channels/mercadolibre/credentials";
import type { ChannelAccountRecord } from "@/server/channels/types";

type MeliNotifyBody = {
  resource?: string;
  user_id?: string | number;
  topic?: string;
  /** Formato reenviado por whatsapp-web-manager. */
  event?: string;
  payload?: {
    topic?: string;
    resource?: string;
    accountId?: string;
    sellerId?: string | number;
    data?: Record<string, unknown>;
  };
};

export type ParsedMeliNotification = {
  topic: string;
  resource: string | null;
  userId: string | null;
  /** Detalle ya resuelto (manager) o null (hay que fetchear). */
  data: Record<string, unknown> | null;
};

/** Normaliza el body nativo de MeLi o el envoltorio del manager. */
export function parseMeliWebhookBody(body: unknown): ParsedMeliNotification | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as MeliNotifyBody;

  if (raw.event === "mercadolibre.notification" && raw.payload) {
    const topic = String(raw.payload.topic || raw.topic || "").toLowerCase();
    if (!topic) return null;
    const data =
      raw.payload.data && typeof raw.payload.data === "object"
        ? (raw.payload.data as Record<string, unknown>)
        : null;
    const sellerFromPayload =
      raw.payload.sellerId != null
        ? String(raw.payload.sellerId)
        : data && (data.seller_id != null || data.sellerId != null)
          ? String(data.seller_id ?? data.sellerId)
          : raw.user_id != null
            ? String(raw.user_id)
            : null;
    return {
      topic,
      resource: raw.payload.resource
        ? String(raw.payload.resource)
        : raw.resource
          ? String(raw.resource)
          : null,
      userId: sellerFromPayload,
      data,
    };
  }

  const topic = String(raw.topic || "").toLowerCase();
  if (!topic || raw.user_id == null) return null;
  return {
    topic,
    resource: raw.resource ? String(raw.resource) : null,
    userId: String(raw.user_id),
    data: null,
  };
}

async function findMeliChannel(
  sellerId: string
): Promise<ChannelAccountRecord | null> {
  const db = getDb();
  const [channel] = await db
    .select()
    .from(schema.channelAccount)
    .where(
      and(
        eq(schema.channelAccount.provider, "mercadolibre"),
        eq(schema.channelAccount.accountIdentifier, sellerId)
      )
    )
    .limit(1);
  return (channel as ChannelAccountRecord | undefined) ?? null;
}

async function fetchMeliResource(
  account: ChannelAccountRecord,
  resource: string
): Promise<Record<string, unknown> | null> {
  const token =
    (await resolveMeliAccessToken(account)) ||
    legacyAccessTokenFromMetadata(account.metadata);
  if (!token) return null;

  const path = resource.startsWith("/") ? resource : `/${resource}`;
  const res = await fetch(`https://api.mercadolibre.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

async function ingestQuestion(
  channel: ChannelAccountRecord,
  qData: Record<string, unknown>
): Promise<void> {
  const status = asString(qData.status);
  if (status && status !== "UNANSWERED") return;

  const questionId = asString(qData.id);
  const buyerId = asString(
    (qData.from as { id?: unknown } | undefined)?.id
  );
  const text = asString(qData.text);
  if (!questionId || !text) return;

  const senderId = buyerId || questionId;
  await omniChannelManager.processInboundMessage({
    channelAccountId: channel.id,
    provider: "mercadolibre",
    platform: "mercadolibre",
    senderId,
    senderName: `Comprador MeLi #${senderId}`,
    text,
    externalMessageId: `meli_q_${questionId}`,
    metadata: {
      subType: "question",
      questionId,
      itemId: asString(qData.item_id),
      buyerId: buyerId || senderId,
      sellerId: channel.accountIdentifier || undefined,
      raw: qData,
    },
  });
}

async function ingestPostSaleMessage(
  channel: ChannelAccountRecord,
  data: Record<string, unknown>,
  resource: string | null
): Promise<void> {
  // Varias formas según topic/messages de MeLi.
  const messages = Array.isArray(data.messages)
    ? (data.messages as Record<string, unknown>[])
    : data.id || data.text
      ? [data]
      : [];

  const sellerId = channel.accountIdentifier || "";
  const packFromResource = resource?.match(/packs\/([^/?]+)/i)?.[1];

  for (const msg of messages) {
    const fromId = asString(
      (msg.from as { user_id?: unknown; id?: unknown } | undefined)?.user_id ??
        (msg.from as { id?: unknown } | undefined)?.id
    );
    // Solo mensajes del comprador (no ecos del vendedor).
    if (fromId && sellerId && fromId === sellerId) continue;

    const textPlain =
      asString((msg.text as { plain?: unknown } | undefined)?.plain) ??
      asString(msg.text) ??
      asString(msg.message);
    if (!textPlain) continue;

    const msgId =
      asString(msg.id) ?? asString(msg.message_id) ?? `meli_msg_${Date.now()}`;
    const packId =
      asString(msg.pack_id) ??
      asString(msg.packId) ??
      asString(data.pack_id) ??
      packFromResource;
    const buyerId =
      fromId ||
      asString(msg.buyer_id) ||
      asString((data.to as { user_id?: unknown } | undefined)?.user_id);

    if (!buyerId) continue;

    await omniChannelManager.processInboundMessage({
      channelAccountId: channel.id,
      provider: "mercadolibre",
      platform: "mercadolibre",
      senderId: buyerId,
      senderName: `Comprador MeLi #${buyerId}`,
      text: textPlain,
      externalMessageId: `meli_m_${msgId}`,
      metadata: {
        subType: "post_sale",
        packId,
        buyerId,
        sellerId: sellerId || undefined,
        raw: msg,
      },
    });
  }
}

/**
 * Procesa una notificación de MercadoLibre (preguntas o mensajes post-venta).
 * Siempre idempotente vía externalMessageId en processInboundMessage.
 */
export async function processMeliNotification(
  body: unknown
): Promise<{ status: string }> {
  const parsed = parseMeliWebhookBody(body);
  if (!parsed) return { status: "ignored" };

  let channel: ChannelAccountRecord | null = null;
  if (parsed.userId) {
    channel = await findMeliChannel(parsed.userId);
  }

  // Si el manager no mandó sellerId, intentar seller_id del data.
  if (!channel && parsed.data) {
    const sid =
      asString(parsed.data.seller_id) ?? asString(parsed.data.sellerId);
    if (sid) channel = await findMeliChannel(sid);
  }

  if (!channel) return { status: "channel_not_found" };

  let data = parsed.data;
  if (!data && parsed.resource) {
    data = await fetchMeliResource(channel, parsed.resource);
  }
  if (!data) return { status: "resource_unavailable" };

  if (parsed.topic === "questions" || parsed.topic.includes("question")) {
    await ingestQuestion(channel, data);
    return { status: "ok" };
  }

  if (
    parsed.topic === "messages" ||
    parsed.topic.includes("message") ||
    parsed.topic === "post_sale"
  ) {
    await ingestPostSaleMessage(channel, data, parsed.resource);
    return { status: "ok" };
  }

  return { status: "topic_ignored" };
}
