import { eq } from "drizzle-orm";
import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { WhatsAppWebAdapter } from "@/server/channels/whatsapp-web/provider";

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

  return Response.json({ channels });
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

  let initialStatus: "connected" | "connecting" | "scan_qr" | "disconnected" | "error" =
    "disconnected";
  let qrCode: string | null = null;

  // Si es WhatsApp Web, inicializar sesión con WhatsAppMultiManager
  if (body.data.provider === "whatsapp_web") {
    const waAdapter = new WhatsAppWebAdapter();
    const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
    const webhookUrl = `${appBaseUrl}/api/webhooks/whatsapp-web`;

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

  await db.insert(schema.channelAccount).values({
    id: channelId,
    organizationId: session.organizationId,
    provider: body.data.provider,
    name: body.data.name,
    status: initialStatus,
    phoneNumber: body.data.phoneNumber || null,
    accountIdentifier: identifier,
    qrCode,
    metadata: body.data.metadata || null,
  });

  const [created] = await db
    .select()
    .from(schema.channelAccount)
    .where(eq(schema.channelAccount.id, channelId))
    .limit(1);

  return Response.json({ channel: created }, { status: 201 });
});
