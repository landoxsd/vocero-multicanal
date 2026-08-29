/** Tiempo de espera del cliente cuando el último mensaje fue entrante. */

export function computeWaitingState(input: {
  lastMessageDirection: "in" | "out" | null;
  lastInboundAt: Date | null;
  now?: number;
}): { needsReply: boolean; waitingMs: number | null } {
  const { lastMessageDirection, lastInboundAt } = input;
  if (lastMessageDirection !== "in" || !lastInboundAt) {
    return { needsReply: false, waitingMs: null };
  }
  const now = input.now ?? Date.now();
  return {
    needsReply: true,
    waitingMs: Math.max(0, now - lastInboundAt.getTime()),
  };
}
