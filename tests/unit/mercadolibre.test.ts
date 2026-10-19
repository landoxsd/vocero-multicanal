import { beforeAll, describe, expect, it } from "vitest";
import { outboundMetaFromInbound } from "@/server/channels/mercadolibre/outbound-meta";
import { parseMeliWebhookBody } from "@/server/channels/mercadolibre/webhook";
import {
  legacyAccessTokenFromMetadata,
  publicChannelAccount,
  publicChannelMetadata,
} from "@/server/channels/mercadolibre/credentials";

beforeAll(() => {
  process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.BETTER_AUTH_SECRET = "secret-de-test-suficiente";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-token-test";
});

describe("outboundMetaFromInbound", () => {
  it("usa questionId del entrante y no el buyer id", () => {
    const meta = outboundMetaFromInbound({
      subType: "question",
      questionId: "999888",
      buyerId: "111",
      itemId: "MLA123",
    });
    expect(meta.subType).toBe("question");
    expect(meta.questionId).toBe("999888");
    expect(meta.buyerId).toBe("111");
  });

  it("reconoce post_sale con packId", () => {
    const meta = outboundMetaFromInbound({
      subType: "post_sale",
      packId: 200,
      buyerId: 50,
      sellerId: 10,
    });
    expect(meta.subType).toBe("post_sale");
    expect(meta.packId).toBe("200");
    expect(meta.buyerId).toBe("50");
  });

  it("por defecto es pregunta si no hay metadata", () => {
    expect(outboundMetaFromInbound(null).subType).toBe("question");
  });
});

describe("parseMeliWebhookBody", () => {
  it("parsea notificación nativa de MeLi", () => {
    const parsed = parseMeliWebhookBody({
      topic: "questions",
      resource: "/questions/123",
      user_id: 555,
    });
    expect(parsed).toEqual({
      topic: "questions",
      resource: "/questions/123",
      userId: "555",
      data: null,
    });
  });

  it("parsea envoltorio del manager con data ya resuelta", () => {
    const parsed = parseMeliWebhookBody({
      event: "mercadolibre.notification",
      topic: "questions",
      user_id: "555",
      payload: {
        topic: "questions",
        resource: "/questions/123",
        sellerId: "555",
        data: { id: 123, text: "¿Hay stock?", status: "UNANSWERED", from: { id: 9 } },
      },
    });
    expect(parsed?.topic).toBe("questions");
    expect(parsed?.userId).toBe("555");
    expect(parsed?.data?.id).toBe(123);
  });

  it("ignora body vacío", () => {
    expect(parseMeliWebhookBody(null)).toBeNull();
    expect(parseMeliWebhookBody({})).toBeNull();
  });
});

describe("credenciales MeLi", () => {
  it("cifra y descifra el blob OAuth", async () => {
    const { encryptMeliSecrets, decryptMeliSecrets } = await import(
      "@/server/channels/mercadolibre/credentials"
    );
    const secrets = {
      appId: "app",
      clientSecret: "sec",
      refreshToken: "ref",
      accessToken: "acc",
      expiresAt: Date.now() + 3600_000,
    };
    const enc = encryptMeliSecrets(secrets);
    const back = decryptMeliSecrets(enc);
    expect(back).toEqual(secrets);
  });

  it("publicChannelAccount no expone accessToken ni columnas cipher", () => {
    const row = {
      id: "ch_1",
      provider: "mercadolibre" as const,
      credentialsCipher: "x",
      credentialsIv: "y",
      credentialsTag: "z",
      metadata: {
        sellerId: "555",
        accessToken: "APP_USR-secret",
        refreshToken: "TG-secret",
      },
    };
    const pub = publicChannelAccount(row);
    expect(pub).not.toHaveProperty("credentialsCipher");
    expect(pub.metadata).toEqual({ sellerId: "555" });
    expect(pub.hasCredentials).toBe(true);
  });

  it("legacyAccessTokenFromMetadata lee el token viejo", () => {
    expect(legacyAccessTokenFromMetadata({ accessToken: " APP " })).toBe("APP");
    expect(legacyAccessTokenFromMetadata({})).toBeNull();
  });

  it("publicChannelMetadata solo deja sellerId", () => {
    expect(
      publicChannelMetadata({
        sellerId: "1",
        accessToken: "x",
        foo: "bar",
      })
    ).toEqual({ sellerId: "1" });
  });
});
