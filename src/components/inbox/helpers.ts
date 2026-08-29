/** Utilidades de presentación de la bandeja. */

import type { ConversationDto } from "@/lib/types";

export function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export function formatRemaining(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Tiempo que el cliente lleva esperando respuesta. */
export function formatWaiting(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return "<1 min";
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export type WaitingUrgency = "normal" | "warning" | "critical";

const WAIT_WARN_MS = 5 * 60 * 1000;
const WAIT_CRIT_MS = 15 * 60 * 1000;

export function waitingUrgency(ms: number): WaitingUrgency {
  if (ms >= WAIT_CRIT_MS) return "critical";
  if (ms >= WAIT_WARN_MS) return "warning";
  return "normal";
}

/** Recalcula espera en vivo a partir del timestamp del último entrante. */
export function liveWaitingMs(c: ConversationDto, now = Date.now()): number | null {
  if (!c.needsReply || !c.lastInboundAt) return null;
  return Math.max(0, now - Date.parse(c.lastInboundAt));
}

/** Cola operativa: handoff → más tiempo esperando → no leídas → recientes. */
export function sortInboxConversations(list: ConversationDto[]): ConversationDto[] {
  return [...list].sort((a, b) => {
    const aHandoff = a.handoffAt ? 1 : 0;
    const bHandoff = b.handoffAt ? 1 : 0;
    if (aHandoff !== bHandoff) return bHandoff - aHandoff;

    if (a.needsReply !== b.needsReply) {
      return (b.needsReply ? 1 : 0) - (a.needsReply ? 1 : 0);
    }
    const aWait = a.waitingMs ?? 0;
    const bWait = b.waitingMs ?? 0;
    if (a.needsReply && b.needsReply && aWait !== bWait) return bWait - aWait;

    if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;

    const aT = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
    const bT = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
    return bT - aT;
  });
}

const MEDIA_LABELS: Record<string, string> = {
  image: "Imagen",
  audio: "Audio",
  video: "Video",
  document: "Documento",
  sticker: "Sticker",
  location: "Ubicación",
  contacts: "Contacto compartido",
  template: "Plantilla",
};

export function mediaLabel(type: string): string {
  return MEDIA_LABELS[type] ?? "Contenido";
}

/** 008 — Tamaño humano de un adjunto. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function previewText(preview: string | null): string {
  if (!preview) return "";
  return MEDIA_LABELS[preview] ? `📎 ${MEDIA_LABELS[preview]}` : preview;
}
