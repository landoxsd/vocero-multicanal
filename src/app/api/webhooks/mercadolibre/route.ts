import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { omniChannelManager } from "@/server/channels/omnichannel-manager";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { resource, user_id, topic } = body;

    if (!user_id || !resource) {
      return NextResponse.json({ status: "ignored" });
    }

    const db = getDb();
    const [channel] = await db
      .select()
      .from(schema.channelAccount)
      .where(
        and(
          eq(schema.channelAccount.provider, "mercadolibre"),
          eq(schema.channelAccount.accountIdentifier, String(user_id))
        )
      )
      .limit(1);

    if (!channel) {
      return NextResponse.json({ status: "channel_not_found" });
    }

    const meta = (channel.metadata || {}) as { accessToken?: string };
    const accessToken = meta.accessToken;

    if (topic === "questions" && accessToken) {
      // Consultar detalle de la pregunta a la API de MercadoLibre
      const questionRes = await fetch(`https://api.mercadolibre.com${resource}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (questionRes.ok) {
        const qData = await questionRes.json();
        if (qData.status === "UNANSWERED") {
          await omniChannelManager.processInboundMessage({
            channelAccountId: channel.id,
            provider: "mercadolibre",
            platform: "mercadolibre",
            senderId: String(qData.from?.id || qData.id),
            senderName: `Comprador MeLi #${qData.from?.id || qData.id}`,
            text: qData.text,
            externalMessageId: String(qData.id),
            metadata: {
              subType: "question",
              questionId: qData.id,
              itemId: qData.item_id,
              raw: qData,
            },
          });
        }
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    console.error("[Webhook MercadoLibre] Error procesando evento:", err);
    return NextResponse.json({ error: err }, { status: 500 });
  }
}
