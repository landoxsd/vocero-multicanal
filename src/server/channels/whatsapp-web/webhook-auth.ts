import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Autenticación del webhook interno `/api/webhooks/whatsapp-web`.
 * El manager envía `X-Webhook-Secret` contra `WA_WEB_WEBHOOK_SECRET`.
 */

export function requireWaWebWebhookSecret(req: Request): Response | null {
  const expected = process.env.WA_WEB_WEBHOOK_SECRET;
  const provided = req.headers.get("x-webhook-secret");

  if (!expected || expected.length < 16) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Webhook de WhatsApp Web no configurado" },
        { status: 503 }
      );
    }
    // Dev sin secreto: migración local; no aceptar en producción.
    return null;
  }

  if (!provided) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return null;
}
