import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { omniChannelManager } from "@/server/channels/omnichannel-manager";
import { requireWaWebWebhookSecret } from "@/server/channels/whatsapp-web/webhook-auth";

export async function POST(req: Request) {
  const authError = requireWaWebWebhookSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { event, session, payload } = body;
    const qr = body.qr ?? payload?.qr;

    if (!session) {
      return NextResponse.json(
        { error: "Falta el identificador de sesión" },
        { status: 400 }
      );
    }

    const db = getDb();
    const [channel] = await db
      .select()
      .from(schema.channelAccount)
      .where(
        and(
          eq(schema.channelAccount.provider, "whatsapp_web"),
          eq(schema.channelAccount.accountIdentifier, session)
        )
      )
      .limit(1);

    if (!channel) {
      return NextResponse.json(
        { error: `Canal con sesión "${session}" no encontrado en el CRM` },
        { status: 404 }
      );
    }

    const orgId = channel.organizationId;
    const channelWhere = scoped(
      schema.channelAccount.organizationId,
      orgId,
      eq(schema.channelAccount.id, channel.id)
    );

    // 1. Código QR
    if (event === "qr" && qr) {
      await db
        .update(schema.channelAccount)
        .set({
          status: "scan_qr",
          qrCode: qr,
          updatedAt: new Date(),
        })
        .where(channelWhere);

      return NextResponse.json({ status: "qr_updated" });
    }

    // 2. Estado de sesión (formato del manager)
    if (event === "session.status") {
      const status = payload?.status as string | undefined;
      if (status === "WORKING") {
        await db
          .update(schema.channelAccount)
          .set({
            status: "connected",
            qrCode: null,
            errorMessage: null,
            lastConnectedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(channelWhere);
        return NextResponse.json({ status: "connected" });
      }
      if (status === "SCAN_QR_CODE" && qr) {
        await db
          .update(schema.channelAccount)
          .set({
            status: "scan_qr",
            qrCode: qr,
            updatedAt: new Date(),
          })
          .where(channelWhere);
        return NextResponse.json({ status: "qr_updated" });
      }
      if (status === "STARTING" || status === "RECONNECTING") {
        await db
          .update(schema.channelAccount)
          .set({
            status: "connecting",
            errorMessage: null,
            updatedAt: new Date(),
          })
          .where(channelWhere);
        return NextResponse.json({ status: "connecting" });
      }
      if (status === "FAILED" || status === "STOPPED") {
        await db
          .update(schema.channelAccount)
          .set({
            status: "disconnected",
            qrCode: null,
            errorMessage: payload?.error || "Sesión cerrada o desvinculada",
            updatedAt: new Date(),
          })
          .where(channelWhere);
        return NextResponse.json({ status: "disconnected" });
      }
    }

    // 3. Sesión conectada (alias legacy)
    if (event === "ready" || event === "authenticated") {
      await db
        .update(schema.channelAccount)
        .set({
          status: "connected",
          qrCode: null,
          errorMessage: null,
          lastConnectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(channelWhere);

      return NextResponse.json({ status: "connected" });
    }

    // 4. Desconexión
    if (event === "disconnected" || event === "auth_failure") {
      await db
        .update(schema.channelAccount)
        .set({
          status: "disconnected",
          qrCode: null,
          errorMessage: body.error || payload?.error || "Sesión cerrada o desvinculada",
          updatedAt: new Date(),
        })
        .where(channelWhere);

      return NextResponse.json({ status: "disconnected" });
    }

    // 5. Mensaje (entrante o saliente)
    if (event === "message" || event === "message_create" || event === "message.any") {
      const isFromMe = Boolean(payload?.fromMe || body.fromMe);
      const targetJid = isFromMe
        ? (payload?.to || body.to || "")
        : (payload?.from || body.from || "");

      if (!targetJid || targetJid === "status@broadcast" || targetJid === "me") {
        return NextResponse.json({ status: "ignored_broadcast_or_self" });
      }

      const text = payload?.body || payload?.text || body.text || "";
      const rawPhone = String(targetJid).replace(/@.*$/, "");
      const senderName = isFromMe
        ? (payload?.chatName || payload?.name || rawPhone)
        : (payload?.notifyName || payload?._data?.notifyName || payload?.name || rawPhone);

      const result = await omniChannelManager.processInboundMessage({
        channelAccountId: channel.id,
        provider: "whatsapp_web",
        platform: "whatsapp",
        senderId: targetJid,
        senderName,
        senderPhone: rawPhone,
        direction: isFromMe ? "out" : "in",
        text,
        externalMessageId: payload?.id?._serialized || payload?.id || `waw_${Date.now()}`,
        mediaUrl: payload?.mediaUrl,
        mediaType: payload?.type,
        metadata: payload,
        timestamp: payload?.timestamp ? new Date(payload.timestamp * 1000) : new Date(),
      });

      return NextResponse.json({ status: "processed", ...result });
    }

    return NextResponse.json({ status: "ignored_event" });
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    console.error("[Webhook WhatsApp Web] Error procesando evento:", err);
    return NextResponse.json({ error: err }, { status: 500 });
  }
}
