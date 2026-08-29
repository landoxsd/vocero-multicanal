import { and, eq } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { listConversations } from "@/server/inbox/queries";
import { WhatsAppWebAdapter } from "@/server/channels/whatsapp-web/provider";

export const dynamic = "force-dynamic";

// Throttle global: máximo una sincronización cada 20 segundos para no saturar
// el motor de WhatsApp Web. Con webhook + SSE activos es red de seguridad.
let lastSync = 0;

export const GET = withAuth(async (session, req: Request) => {
  const db = getDb();

  if (Date.now() - lastSync > 20000) {
    lastSync = Date.now();
    db.select()
      .from(schema.channelAccount)
      .where(
        and(
          eq(schema.channelAccount.organizationId, session.organizationId),
          eq(schema.channelAccount.provider, "whatsapp_web"),
          eq(schema.channelAccount.status, "connected")
        )
      )
      .then(async (channels) => {
        if (channels.length > 0) {
          const waAdapter = new WhatsAppWebAdapter();
          for (const ch of channels) {
            await waAdapter.syncChats(ch).catch(() => null);
          }
        }
      })
      .catch(() => null);
  }

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  const conversations = await listConversations(
    session.organizationId,
    since && !Number.isNaN(since.getTime()) ? since : undefined
  );
  return Response.json({ conversations });
});

