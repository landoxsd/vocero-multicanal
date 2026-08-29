import { and, eq } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { listConversations } from "@/server/inbox/queries";
import { WhatsAppWebAdapter } from "@/server/channels/whatsapp-web/provider";

export const dynamic = "force-dynamic";

let lastSync = 0;

export const GET = withAuth(async (session, req: Request) => {
  const db = getDb();
  // Sincronización proactiva en vivo para WhatsApp Web (throttled a 4s)
  if (Date.now() - lastSync > 4000) {
    lastSync = Date.now();
    const channels = await db
      .select()
      .from(schema.channelAccount)
      .where(
        and(
          eq(schema.channelAccount.organizationId, session.organizationId),
          eq(schema.channelAccount.provider, "whatsapp_web"),
          eq(schema.channelAccount.status, "connected")
        )
      );

    if (channels.length > 0) {
      const waAdapter = new WhatsAppWebAdapter();
      for (const ch of channels) {
        await waAdapter.syncChats(ch).catch(() => null);
      }
    }
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
