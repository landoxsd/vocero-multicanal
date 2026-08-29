import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import {
  kindFromMime,
  saveMediaFile,
  type MediaKind,
} from "@/server/whatsapp/media";

const BINARY_KINDS = new Set<MediaKind>([
  "image",
  "video",
  "audio",
  "document",
  "sticker",
]);

export type WaWebMediaPayload = { source: "whatsapp_web"; waMessageId: string };

export function isWaWebMediaPayload(
  payload: unknown
): payload is WaWebMediaPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as WaWebMediaPayload).source === "whatsapp_web" &&
    typeof (payload as WaWebMediaPayload).waMessageId === "string"
  );
}

/** Mapea tipos de whatsapp-web.js a kind del CRM. */
export function normalizeWaWebMediaKind(
  rawType: string | undefined,
  mimeType?: string | null,
  hasMedia?: boolean
): MediaKind | null {
  const t = (rawType || "").toLowerCase();
  if (t === "ptt" || t === "audio") return "audio";
  if (t === "image" || t === "sticker" || t === "video" || t === "document") {
    return t as MediaKind;
  }
  if (hasMedia && mimeType) {
    try {
      return kindFromMime(mimeType.split(";")[0]?.trim() ?? mimeType);
    } catch {
      return "document";
    }
  }
  if (hasMedia) return "document";
  return null;
}

function managerUrl(): string {
  return process.env.WA_WEB_MANAGER_URL || "http://127.0.0.1:3005";
}

function managerHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const apiKey = process.env.WA_WEB_MANAGER_API_KEY;
  if (apiKey) headers["x-api-key"] = apiKey;
  return headers;
}

/** Descarga binario del manager (`GET /api/media/:waMessageId`). */
export async function downloadWaWebMedia(
  waMessageId: string
): Promise<{ data: Buffer; mimeType: string | null }> {
  const encoded = encodeURIComponent(waMessageId);
  const res = await fetch(`${managerUrl()}/api/media/${encoded}`, {
    headers: managerHeaders(),
  }).catch(() => null);
  if (!res?.ok) {
    throw new Error(`Manager respondió ${res?.status ?? "sin conexión"}`);
  }
  const mimeType = res.headers.get("content-type");
  const data = Buffer.from(await res.arrayBuffer());
  if (data.byteLength === 0) throw new Error("Adjunto vacío");
  return { data, mimeType };
}

export async function storeWaWebMediaAsset(input: {
  organizationId: string;
  messageId: string;
  waMessageId: string;
  kind: MediaKind;
  mimeType?: string | null;
  fileName?: string | null;
  caption?: string | null;
}): Promise<typeof schema.mediaAsset.$inferSelect | null> {
  if (!BINARY_KINDS.has(input.kind)) return null;

  const db = getDb();
  const assetId = newId("mediaAsset");

  try {
    const { data, mimeType } = await downloadWaWebMedia(input.waMessageId);
    const storagePath = await saveMediaFile(input.organizationId, assetId, data);
    const payload: WaWebMediaPayload = {
      source: "whatsapp_web",
      waMessageId: input.waMessageId,
    };

    const inserted = await db
      .insert(schema.mediaAsset)
      .values({
        id: assetId,
        organizationId: input.organizationId,
        kind: input.kind,
        waMediaId: input.waMessageId,
        mimeType: input.mimeType ?? mimeType,
        fileName: input.fileName ?? null,
        caption: input.caption ?? null,
        payload,
        storagePath,
        fileSize: data.byteLength,
        fetchStatus: "available",
      })
      .returning();

    const asset = inserted[0];
    if (!asset) return null;

    await db
      .update(schema.message)
      .set({ mediaAssetId: asset.id })
      .where(eq(schema.message.id, input.messageId));

    return asset;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[wa-web/media] no se pudo guardar adjunto ${input.waMessageId}:`,
      message
    );

    const failed = await db
      .insert(schema.mediaAsset)
      .values({
        id: assetId,
        organizationId: input.organizationId,
        kind: input.kind,
        waMediaId: input.waMessageId,
        mimeType: input.mimeType ?? null,
        fileName: input.fileName ?? null,
        caption: input.caption ?? null,
        payload: { source: "whatsapp_web", waMessageId: input.waMessageId },
        fetchStatus: "failed",
        fetchError: message,
      })
      .returning();

    const asset = failed[0];
    if (asset) {
      await db
        .update(schema.message)
        .set({ mediaAssetId: asset.id })
        .where(eq(schema.message.id, input.messageId));
    }
    return asset ?? null;
  }
}

/** Reintenta descarga on-demand (ruta `/api/media` del CRM). */
export async function ensureWaWebAssetAvailable(
  organizationId: string,
  assetId: string
): Promise<typeof schema.mediaAsset.$inferSelect | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.mediaAsset)
    .where(eq(schema.mediaAsset.id, assetId))
    .limit(1);
  const asset = rows[0];
  if (!asset || asset.organizationId !== organizationId) return null;
  if (asset.fetchStatus === "available") return asset;
  if (!isWaWebMediaPayload(asset.payload)) return null;

  try {
    const { data, mimeType } = await downloadWaWebMedia(asset.payload.waMessageId);
    const storagePath = await saveMediaFile(organizationId, assetId, data);
    const updated = await db
      .update(schema.mediaAsset)
      .set({
        storagePath,
        mimeType: asset.mimeType ?? mimeType,
        fileSize: data.byteLength,
        fetchStatus: "available",
        fetchError: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.mediaAsset.id, assetId))
      .returning();
    return updated[0] ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.mediaAsset)
      .set({ fetchStatus: "failed", fetchError: message, updatedAt: new Date() })
      .where(eq(schema.mediaAsset.id, assetId));
    return null;
  }
}

/** Mensajes viejos sin adjunto: intenta crear el asset al listar el hilo. */
export async function backfillWaWebMedia(
  organizationId: string,
  message: typeof schema.message.$inferSelect
): Promise<typeof schema.mediaAsset.$inferSelect | null> {
  if (message.mediaAssetId) return null;
  const waId = message.externalMessageId || message.waMessageId;
  if (!waId) return null;

  const kind = normalizeWaWebMediaKind(message.type);
  if (!kind) return null;

  const meta = message.metadata as Record<string, unknown> | null;
  const mimeType =
    (typeof meta?.mimetype === "string" ? meta.mimetype : null) ??
    (typeof meta?.mimeType === "string" ? meta.mimeType : null);
  const fileName =
    kind === "document" && message.text?.trim() ? message.text.trim() : null;

  return storeWaWebMediaAsset({
    organizationId,
    messageId: message.id,
    waMessageId: waId,
    kind,
    mimeType,
    fileName,
    caption: message.text,
  });
}
