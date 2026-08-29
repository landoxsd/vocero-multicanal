import { describe, expect, it } from "vitest";
import type { ConversationDto } from "@/lib/types";
import { sortInboxByDate, sortInboxByPriority } from "@/components/inbox/helpers";

function conv(
  id: string,
  lastMessageAt: string,
  extra: Partial<ConversationDto> = {}
): ConversationDto {
  return {
    id,
    contact: { id: `ct_${id}`, name: id, phone: null },
    stageName: null,
    aiEnabled: true,
    handoffAt: null,
    handoffReason: null,
    lastInboundAt: null,
    lastMessageAt,
    needsReply: false,
    waitingMs: null,
    unreadCount: 0,
    windowOpen: true,
    windowRemainingMs: 86_400_000,
    preview: null,
    ...extra,
  };
}

describe("sortInboxByDate", () => {
  it("ordena por último mensaje, más reciente arriba", () => {
    const list = [
      conv("a", "2026-08-28T10:00:00.000Z"),
      conv("b", "2026-08-29T06:00:00.000Z"),
      conv("c", "2026-08-29T02:00:00.000Z"),
    ];
    const sorted = sortInboxByDate(list);
    expect(sorted.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });
});

describe("sortInboxByPriority", () => {
  it("prioriza quien espera respuesta sobre fecha reciente", () => {
    const list = [
      conv("reciente", "2026-08-29T06:00:00.000Z"),
      conv("viejo", "2026-08-28T10:00:00.000Z", {
        needsReply: true,
        waitingMs: 3_600_000,
      }),
    ];
    const sorted = sortInboxByPriority(list);
    expect(sorted[0]?.id).toBe("viejo");
  });
});
