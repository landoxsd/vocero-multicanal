import { describe, expect, it } from "vitest";
import { normalizeWaWebMediaKind } from "@/server/channels/whatsapp-web/media";

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
