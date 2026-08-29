/** Mensaje mínimo para emparejar pregunta/respuesta en el KB. */
export type ChatTurn = {
  id: string;
  direction: "in" | "out";
  text: string | null;
  createdAt: Date | string;
};

function byTime(a: ChatTurn, b: ChatTurn): number {
  return Date.parse(String(a.createdAt)) - Date.parse(String(b.createdAt));
}

/**
 * Sugiere una entrada P/R a partir del hilo. Con `anchorMessageId`, empareja
 * el mensaje elegido con su contraparte más cercana; sin ancla, usa el último
 * intercambio con texto.
 */
export function suggestKbFromChat(
  messages: ChatTurn[],
  anchorMessageId?: string
): { question: string; answer: string } | null {
  if (messages.length === 0) return null;
  const sorted = [...messages].sort(byTime);

  if (anchorMessageId) {
    const idx = sorted.findIndex((m) => m.id === anchorMessageId);
    if (idx < 0) return null;
    const anchor = sorted[idx];
    if (!anchor) return null;

    if (anchor.direction === "out") {
      const answer = anchor.text?.trim() ?? "";
      if (!answer) return null;
      for (let i = idx - 1; i >= 0; i--) {
        const m = sorted[i];
        if (!m) break;
        if (m.direction === "in" && m.text?.trim()) {
          return { question: m.text.trim(), answer };
        }
        if (m.direction === "out") break;
      }
      return null;
    }

    const question = anchor.text?.trim() ?? "";
    if (!question) return null;
    for (let i = idx + 1; i < sorted.length; i++) {
      const m = sorted[i];
      if (!m) break;
      if (m.direction === "out" && m.text?.trim()) {
        return { question, answer: m.text.trim() };
      }
    }
    return { question, answer: "" };
  }

  for (let i = sorted.length - 1; i >= 0; i--) {
    const out = sorted[i];
    if (!out || out.direction !== "out" || !out.text?.trim()) continue;
    for (let j = i - 1; j >= 0; j--) {
      const inn = sorted[j];
      if (!inn) break;
      if (inn.direction === "in" && inn.text?.trim()) {
        return { question: inn.text.trim(), answer: out.text.trim() };
      }
      if (inn.direction === "out") break;
    }
  }

  for (let i = sorted.length - 1; i >= 0; i--) {
    const m = sorted[i];
    if (m?.direction === "in" && m.text?.trim()) {
      return { question: m.text.trim(), answer: "" };
    }
  }

  return null;
}
