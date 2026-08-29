import { describe, expect, it } from "vitest";
import { buildHeuristicTips } from "@/server/inbox/contact-tips";

describe("buildHeuristicTips", () => {
  it("sugiere tipo de cliente y vehículo con ficha vacía", () => {
    const tips = buildHeuristicTips({
      ficha: {},
      handoffAt: null,
      handoffReason: null,
      needsReply: false,
      waitingMs: null,
      stageName: null,
      preview: null,
    });
    expect(tips.some((t) => t.text.includes("taller"))).toBe(true);
    expect(tips.some((t) => t.text.includes("marca"))).toBe(true);
  });

  it("alerta cuando el cliente espera mucho", () => {
    const tips = buildHeuristicTips({
      ficha: { marca: "Chevrolet" },
      handoffAt: null,
      handoffReason: null,
      needsReply: true,
      waitingMs: 20 * 60_000,
      stageName: "Interesado",
      preview: "¿Cuánto cuesta?",
    });
    expect(tips.some((t) => t.kind === "alerta" && t.text.includes("20"))).toBe(
      true
    );
    expect(tips.some((t) => t.text.includes("precio"))).toBe(true);
  });

  it("prioriza handoff del cliente", () => {
    const tips = buildHeuristicTips({
      ficha: {},
      handoffAt: new Date(),
      handoffReason: "cliente",
      needsReply: true,
      waitingMs: 2 * 60_000,
      stageName: "Nuevo",
      preview: null,
    });
    expect(tips[0]?.kind).toBe("alerta");
    expect(tips[0]?.text).toMatch(/persona/i);
  });
});
