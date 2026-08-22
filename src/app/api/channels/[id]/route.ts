import { and, eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { WhatsAppWebAdapter } from "@/server/channels/whatsapp-web/provider";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/channels/:id
 * Consulta estado y código QR en vivo del canal
 */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const db = getDb();

  const [channel] = await db
    .select()
    .from(schema.channelAccount)
    .where(
      and(
        eq(schema.channelAccount.id, id),
        eq(schema.channelAccount.organizationId, session.organizationId)
      )
    )
    .limit(1);

  if (!channel) return apiError(404, "not_found", "Canal no encontrado");

  // Si es WhatsApp Web y no está conectado, consultar QR en vivo
  if (channel.provider === "whatsapp_web" && channel.status !== "connected") {
    const waAdapter = new WhatsAppWebAdapter();
    const liveQr = await waAdapter.getQrCode(channel);
    if (liveQr && liveQr !== channel.qrCode) {
      await db
        .update(schema.channelAccount)
        .set({ qrCode: liveQr, status: "scan_qr", updatedAt: new Date() })
        .where(eq(schema.channelAccount.id, id));
      channel.qrCode = liveQr;
      channel.status = "scan_qr";
    }
  }

  return Response.json({ channel });
});

/**
 * DELETE /api/channels/:id
 * Desconecta y elimina un canal
 */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const db = getDb();

  const [channel] = await db
    .select()
    .from(schema.channelAccount)
    .where(
      and(
        eq(schema.channelAccount.id, id),
        eq(schema.channelAccount.organizationId, session.organizationId)
      )
    )
    .limit(1);

  if (!channel) return apiError(404, "not_found", "Canal no encontrado");

  if (channel.provider === "whatsapp_web") {
    const waAdapter = new WhatsAppWebAdapter();
    await waAdapter.disconnect(channel);
  }

  await db
    .delete(schema.channelAccount)
    .where(eq(schema.channelAccount.id, id));

  return Response.json({ ok: true });
});
