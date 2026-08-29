import { NextResponse } from "next/server";
import { processWaWebEvent } from "@/server/channels/whatsapp-web/process-event";
import { requireWaWebWebhookSecret } from "@/server/channels/whatsapp-web/webhook-auth";

export async function POST(req: Request) {
  const authError = requireWaWebWebhookSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const result = await processWaWebEvent(body);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.httpStatus });
    }

    const { status, ...rest } = result;
    return NextResponse.json({ status, ...rest });
  } catch (error: unknown) {
    const err = error instanceof Error ? error.message : String(error);
    console.error("[Webhook WhatsApp Web] Error procesando evento:", err);
    return NextResponse.json({ error: err }, { status: 500 });
  }
}
