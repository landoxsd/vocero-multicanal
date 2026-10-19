import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import {
  encryptMeliSecrets,
  provisionMeliCredentials,
  publicChannelAccount,
} from "@/server/channels/mercadolibre/credentials";
import { WhatsAppWebAdapter } from "@/server/channels/whatsapp-web/provider";
import { waWebCrmWebhookUrl } from "@/server/channels/whatsapp-web/webhook-url";

export const dynamic = "force-dynamic";

const createChannelSchema = z.object({
  provider: z.enum([
    "whatsapp_web",
    "whatsapp_cloud",
    "instagram",
    "mercadolibre",
    "facebook_messenger",
  ]),
  name: z.string().min(1).max(100),
  phoneNumber: z.string().optional(),
  accountIdentifier: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  /** OAuth MercadoLibre (también se aceptan dentro de metadata). */
  appId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
  refreshToken: z.string().min(1).optional(),
});

/**
 * GET /api/channels
 * Lista todos los canales de la organización activa
 */
export const GET = withAuth(async (session) => {
  const db = getDb();
  const channels = await db
    .select()
    .from(schema.channelAccount)
    .where(eq(schema.channelAccount.organizationId, session.organizationId))
    .orderBy(schema.channelAccount.createdAt);

  const waAdapter = new WhatsAppWebAdapter();
  for (const channel of channels) {
    if (channel.provider !== "whatsapp_web") continue;

    const liveStatus = await waAdapter.getStatus(channel);
    if (liveStatus === channel.status) continue;

    const patch: {
      status: typeof channel.status;
      updatedAt: Date;
      qrCode?: string | null;
      errorMessage?: string | null;
      lastConnectedAt?: Date;
    } = { status: liveStatus, updatedAt: new Date() };

    if (liveStatus === "connected") {
      patch.qrCode = null;
      patch.errorMessage = null;
      patch.lastConnectedAt = new Date();
    } else if (liveStatus === "scan_qr") {
      patch.qrCode = (await waAdapter.getQrCode(channel)) ?? channel.qrCode;
      patch.errorMessage = null;
    } else if (liveStatus === "disconnected") {
      patch.errorMessage =
        channel.errorMessage ?? "Sesión de WhatsApp Web desconectada";
    } else if (liveStatus === "connecting") {
      patch.errorMessage = null;
    }

    await db
      .update(schema.channelAccount)
      .set(patch)
      .where(eq(schema.channelAccount.id, channel.id));

    channel.status = liveStatus;
    if (patch.qrCode !== undefined) channel.qrCode = patch.qrCode;
    if (patch.errorMessage !== undefined) channel.errorMessage = patch.errorMessage;
    if (patch.lastConnectedAt) channel.lastConnectedAt = patch.lastConnectedAt;
  }

  return Response.json({
    channels: channels.map((ch) => publicChannelAccount(ch)),
  });
});

/**
 * POST /api/channels
 * Crea o inicia la vinculación de un nuevo canal
 */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createChannelSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const channelId = newId("channelAccount");
  const identifier =
    body.data.accountIdentifier ||
    body.data.phoneNumber ||
    `session_${Date.now()}`;

  let initialStatus:
    | "connected"
    | "connecting"
    | "scan_qr"
    | "disconnected"
    | "error" = "disconnected";
  let qrCode: string | null = null;
  let metadata: Record<string, unknown> | null = body.data.metadata
    ? { ...body.data.metadata }
    : null;
  let credentialsCipher: string | null = null;
  let credentialsIv: string | null = null;
  let credentialsTag: string | null = null;
  let accountIdentifier = identifier;
  let errorMessage: string | null = null;

  if (body.data.provider === "whatsapp_web") {
    const waAdapter = new WhatsAppWebAdapter();
    const webhookUrl = waWebCrmWebhookUrl();

    try {
      const initResult = await waAdapter.createSession(
        {
          id: channelId,
          organizationId: session.organizationId,
          provider: "whatsapp_web",
          name: body.data.name,
          status: "connecting",
          accountIdentifier: identifier,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        webhookUrl
      );
      initialStatus = initResult.status;
      qrCode = initResult.qrCode || null;
    } catch {
      initialStatus = "scan_qr";
    }
  }

  if (body.data.provider === "mercadolibre") {
    const meta = metadata || {};
    const appId =
      body.data.appId ||
      (typeof meta.appId === "string" ? meta.appId : undefined);
    const clientSecret =
      body.data.clientSecret ||
      (typeof meta.clientSecret === "string"
        ? meta.clientSecret
        : typeof meta.secret === "string"
          ? meta.secret
          : undefined);
    const refreshToken =
      body.data.refreshToken ||
      (typeof meta.refreshToken === "string" ? meta.refreshToken : undefined);

    if (!appId?.trim() || !clientSecret?.trim() || !refreshToken?.trim()) {
      return apiError(
        422,
        "validation_error",
        "MercadoLibre requiere App ID, Client Secret y Refresh Token"
      );
    }

    try {
      const { secrets, sellerIdFromToken } = await provisionMeliCredentials({
        appId,
        clientSecret,
        refreshToken,
      });
      const enc = encryptMeliSecrets(secrets);
      credentialsCipher = enc.credentialsCipher;
      credentialsIv = enc.credentialsIv;
      credentialsTag = enc.credentialsTag;
      // El webhook de MeLi llega con user_id = seller del token; esa es la llave.
      accountIdentifier = (
        sellerIdFromToken ||
        body.data.accountIdentifier ||
        identifier
      ).trim();
      metadata = { sellerId: accountIdentifier };
      initialStatus = "connected";
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error al validar OAuth de MercadoLibre";
      return apiError(400, "meli_oauth_failed", msg);
    }
  }

  // No persistir secretos en metadata (legacy accessToken / refresh / secret).
  if (metadata) {
    const {
      accessToken: _a,
      refreshToken: _r,
      secret: _s,
      clientSecret: _cs,
      appId: _app,
      ...safe
    } = metadata;
    metadata = Object.keys(safe).length > 0 ? safe : null;
  }

  await db.insert(schema.channelAccount).values({
    id: channelId,
    organizationId: session.organizationId,
    provider: body.data.provider,
    name: body.data.name,
    status: initialStatus,
    phoneNumber: body.data.phoneNumber || null,
    accountIdentifier,
    qrCode,
    credentialsCipher,
    credentialsIv,
    credentialsTag,
    metadata,
    errorMessage,
    lastConnectedAt: initialStatus === "connected" ? new Date() : null,
  });

  const [created] = await db
    .select()
    .from(schema.channelAccount)
    .where(eq(schema.channelAccount.id, channelId))
    .limit(1);

  return Response.json(
    { channel: created ? publicChannelAccount(created) : null },
    { status: 201 }
  );
});
