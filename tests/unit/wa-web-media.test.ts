import { describe, expect, it } from "vitest";
import {
  needsWaWebMediaBackfill,
  normalizeWaWebMediaKind,
} from "@/server/channels/whatsapp-web/media";

describe("needsWaWebMediaBackfill", () => {
  const imageMsg = { type: "image", channelAccountId: "chn_1" };

  it("reintenta cuando el asset existe pero falló", () => {
    expect(
      needsWaWebMediaBackfill(imageMsg, { fetchStatus: "failed" })
    ).toBe(true);
  });

  it("no reintenta cuando el asset ya está disponible", () => {
    expect(
      needsWaWebMediaBackfill(imageMsg, { fetchStatus: "available" })
    ).toBe(false);
  });

  it("pide backfill si falta el asset en un mensaje con media", () => {
    expect(needsWaWebMediaBackfill(imageMsg, null)).toBe(true);
  });

  it("ignora mensajes de texto sin adjunto", () => {
    expect(
      needsWaWebMediaBackfill(
        { type: "text", channelAccountId: "chn_1" },
        null
      )
    ).toBe(false);
  });
});

describe("normalizeWaWebMediaKind", () => {
  it("mapea ptt a audio", () => {
    expect(normalizeWaWebMediaKind("ptt")).toBe("audio");
  });

  it("detecta imagen por tipo", () => {
    expect(normalizeWaWebMediaKind("image")).toBe("image");
  });

  it("infiere documento con mimetype cuando hasMedia", () => {
    expect(
      normalizeWaWebMediaKind("chat", "application/pdf", true)
    ).toBe("document");
  });
});
