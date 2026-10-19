import { afterEach, describe, expect, it } from "vitest";
import { requireMeliWebhookSecret } from "@/server/channels/mercadolibre/webhook-auth";

afterEach(() => {
  delete process.env.MELI_WEBHOOK_SECRET;
});

describe("requireMeliWebhookSecret", () => {
  it("sin secreto configurado deja pasar", () => {
    delete process.env.MELI_WEBHOOK_SECRET;
    const req = new Request("http://localhost/api/webhooks/mercadolibre", {
      method: "POST",
    });
    expect(requireMeliWebhookSecret(req)).toBeNull();
  });

  it("acepta el secreto por query", () => {
    process.env.MELI_WEBHOOK_SECRET = "a".repeat(32);
    const req = new Request(
      `http://localhost/api/webhooks/mercadolibre?secret=${"a".repeat(32)}`,
      { method: "POST" }
    );
    expect(requireMeliWebhookSecret(req)).toBeNull();
  });

  it("acepta el secreto por header", () => {
    process.env.MELI_WEBHOOK_SECRET = "b".repeat(32);
    const req = new Request("http://localhost/api/webhooks/mercadolibre", {
      method: "POST",
      headers: { "X-Webhook-Secret": "b".repeat(32) },
    });
    expect(requireMeliWebhookSecret(req)).toBeNull();
  });

  it("rechaza secreto incorrecto", async () => {
    process.env.MELI_WEBHOOK_SECRET = "c".repeat(32);
    const req = new Request(
      "http://localhost/api/webhooks/mercadolibre?secret=wrong",
      { method: "POST" }
    );
    const res = requireMeliWebhookSecret(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });
});
