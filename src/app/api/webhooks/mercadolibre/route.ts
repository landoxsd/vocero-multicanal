import { NextResponse } from "next/server";
import { requireMeliWebhookSecret } from "@/server/channels/mercadolibre/webhook-auth";
import { processMeliNotification } from "@/server/channels/mercadolibre/webhook";

export const dynamic = "force-dynamic";

/**
 * Webhook de notificaciones de MercadoLibre (preguntas y mensajes).
 * También acepta el envoltorio que reenvía `whatsapp-web-manager`.
 * MeLi espera 200 rápido; el procesamiento es síncrono pero acotado.
 */
export async function POST(req: Request) {
  const denied = requireMeliWebhookSecret(req);
  if (denied) return denied;

  try {
    const body: unknown = await req.json();
    const result = await processMeliNotification(body);
    // MeLi reintenta ante 5xx; channel_not_found / ignored → 200.
    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    console.error("[Webhook MercadoLibre] Error procesando evento:", err);
    return NextResponse.json({ error: "processing_error" }, { status: 500 });
  }
}
