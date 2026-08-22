import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { omniChannelManager } from "@/server/channels/omnichannel-manager";

// Verificación de Webhook de Meta (Instagram / Facebook)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || "vocero_crm_webhook_token_2026";

  if (mode === "subscribe" && token === verifyToken) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

// Recepción de eventos de Instagram Direct
export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.object !== "instagram" && body.object !== "page") {
      return NextResponse.json({ status: "ignored" });
    }

    const db = getDb();

    for (const entry of body.entry || []) {
      const recipientId = entry.id; // Instagram Business Account ID o Page ID

      // Buscar canal por accountIdentifier
      const [channel] = await db
        .select()
        .from(schema.channelAccount)
        .where(
          and(
            eq(schema.channelAccount.provider, "instagram"),
            eq(schema.channelAccount.accountIdentifier, recipientId)
          )
        )
        .limit(1);

      if (!channel) continue;

      for (const messaging of entry.messaging || []) {
        const senderId = messaging.sender?.id;
        const message = messaging.message;

        if (!senderId || !message || message.is_echo) continue;

        await omniChannelManager.processInboundMessage({
          channelAccountId: channel.id,
          provider: "instagram",
          platform: "instagram",
          senderId,
          senderName: `@ig_user_${senderId.slice(-4)}`,
          text: message.text || "",
          externalMessageId: message.mid,
          mediaUrl: message.attachments?.[0]?.payload?.url,
          mediaType: message.attachments?.[0]?.type,
          metadata: messaging,
        });
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    console.error("[Webhook Instagram] Error procesando evento:", err);
    return NextResponse.json({ error: err }, { status: 500 });
  }
}
