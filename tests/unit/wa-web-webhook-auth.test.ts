import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireWaWebWebhookSecret } from "@/server/channels/whatsapp-web/webhook-auth";

const SECRET = "secreto-webhook-wa-web-min-16";

function reqWith(secret?: string): Request {
  return new Request("http://localhost/api/webhooks/whatsapp-web", {
    method: "POST",
    headers: secret ? { "X-Webhook-Secret": secret } : {},
  });
}

describe("requireWaWebWebhookSecret", () => {
  beforeEach(() => {
    vi.stubEnv("WA_WEB_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("NODE_ENV", "production");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("secreto correcto → pasa (null)", () => {
    expect(requireWaWebWebhookSecret(reqWith(SECRET))).toBeNull();
  });

  it("secreto incorrecto → 401", () => {
    expect(requireWaWebWebhookSecret(reqWith("otro-secreto-igual-de-largo"))?.status).toBe(
      401
    );
  });

  it("sin header → 401", () => {
    expect(requireWaWebWebhookSecret(reqWith())?.status).toBe(401);
  });

  it("sin WA_WEB_WEBHOOK_SECRET en producción → 503", () => {
    vi.stubEnv("WA_WEB_WEBHOOK_SECRET", "");
    expect(requireWaWebWebhookSecret(reqWith(SECRET))?.status).toBe(503);
  });

  it("sin WA_WEB_WEBHOOK_SECRET en desarrollo → permite (migración local)", () => {
    vi.stubEnv("WA_WEB_WEBHOOK_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(requireWaWebWebhookSecret(reqWith())).toBeNull();
  });
});
