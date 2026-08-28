import { eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { WhatsAppWebAdapter } from "@/server/channels/whatsapp-web/provider";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const db = getDb();

  const [channel] = await db
    .select()
    .from(schema.channelAccount)
    .where(eq(schema.channelAccount.id, id))
    .limit(1);

  if (!channel) {
    return apiError(404, "not_found", "Canal no encontrado");
  }

  if (channel.organizationId !== session.organizationId) {
    return apiError(403, "forbidden", "No tienes acceso a este canal");
  }

  if (channel.provider !== "whatsapp_web") {
    return apiError(400, "invalid_provider", "Solo los canales WhatsApp Web soportan sincronizacion");
  }

  const waAdapter = new WhatsAppWebAdapter();
  const result = await waAdapter.syncChats(channel);

  if (!result.success) {
    return apiError(500, "sync_failed", "No se pudo sincronizar los chats");
  }

  return Response.json({
    message: "Sincronizacion completada",
    ...result,
  });
});
