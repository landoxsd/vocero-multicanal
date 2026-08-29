import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { omniChannelManager } from "@/server/channels/omnichannel-manager";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { event, session, payload, qr } = body;

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

    // 1. Manejo de Código QR en tiempo real
    if (event === "qr" && qr) {
      await db
        .update(schema.channelAccount)
        .set({
          status: "scan_qr",
          qrCode: qr,
          updatedAt: new Date(),
        })
        .where(eq(schema.channelAccount.id, channel.id));

      return NextResponse.json({ status: "qr_updated" });
    }

    // 2. Manejo de Sesión Conectada / Lista
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
        .where(eq(schema.channelAccount.id, channel.id));

      return NextResponse.json({ status: "connected" });
    }

    // 3. Manejo de Desconexión
    if (event === "disconnected" || event === "auth_failure") {
      await db
        .update(schema.channelAccount)
        .set({
          status: "disconnected",
          qrCode: null,
          errorMessage: body.error || "Sesión cerrada o desvinculada",
          updatedAt: new Date(),
        })
        .where(eq(schema.channelAccount.id, channel.id));

      return NextResponse.json({ status: "disconnected" });
    }

    // 4. Manejo de Mensaje (Entrante o Saliente)
    if (event === "message" || event === "message_create") {
      const isFromMe = Boolean(payload?.fromMe || body.fromMe);
      const targetJid = isFromMe
        ? (payload?.to || body.to || "")
        : (payload?.from || body.from || "");

      // Ignorar estados/historias o mensajes sin destinatario
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
