import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Autenticación del webhook de MercadoLibre.
 *
 * MeLi no envía headers custom: el secreto va en la URL al registrar el
 * callback (`…/api/webhooks/mercadolibre?secret=…`). También se acepta
 * `X-Webhook-Secret` (manager interno o proxy).
 *
 * Si `MELI_WEBHOOK_SECRET` no está definido, se acepta el POST (útil en
 * desarrollo). En producción conviene definirlo.
 */

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function requireMeliWebhookSecret(req: Request): Response | null {
  const expected = process.env.MELI_WEBHOOK_SECRET?.trim();
  if (!expected || expected.length < 16) {
    return null;
  }

  const header = req.headers.get("x-webhook-secret");
  const url = new URL(req.url);
  const query =
    url.searchParams.get("secret") || url.searchParams.get("token");

  const provided = header || query;
  if (!provided || !secretsMatch(provided, expected)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return null;
}
