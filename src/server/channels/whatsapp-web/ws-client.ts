import WebSocket from "ws";
import {
  processWaWebEvent,
  type WaWebWebhookBody,
} from "@/server/channels/whatsapp-web/process-event";

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 2_000;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;
let started = false;

/** URL ws del manager. Null si no hay configuración suficiente. */
export function resolveManagerWsUrl(): string | null {
  const explicit = process.env.WA_WEB_MANAGER_WS_URL?.trim();
  if (explicit) return explicit;

  const disabled = process.env.WA_WEB_MANAGER_WS_ENABLED === "false";
  if (disabled) return null;

  const httpBase = process.env.WA_WEB_MANAGER_URL?.trim();
  if (!httpBase) return null;

  return `${httpBase.replace(/^http/i, "ws").replace(/\/$/, "")}/ws/events`;
}

function buildWsUrl(base: string, secret: string): string {
  const url = new URL(base);
  url.searchParams.set("secret", secret);
  return url.toString();
}

function scheduleReconnect(): void {
  if (reconnectTimer || !started) return;
  attempt += 1;
  const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.min(attempt - 1, 4));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect(): void {
  const secret = process.env.WA_WEB_WEBHOOK_SECRET;
  const wsBase = resolveManagerWsUrl();

  if (!wsBase || !secret || secret.length < 16) {
    return;
  }

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const url = buildWsUrl(wsBase, secret);
  const apiKey = process.env.WA_WEB_MANAGER_API_KEY;

  try {
    socket = new WebSocket(url, {
      headers: apiKey ? { "x-api-key": apiKey } : undefined,
    });
  } catch (err) {
    console.error("[wa-web-ws] No se pudo abrir WebSocket:", err);
    scheduleReconnect();
    return;
  }

  socket.on("open", () => {
    attempt = 0;
    console.log("[wa-web-ws] Conectado al manager de WhatsApp Web");
  });

  socket.on("message", (raw) => {
    void (async () => {
      try {
        const body = JSON.parse(String(raw)) as WaWebWebhookBody;
        const result = await processWaWebEvent(body);
        if (!result.ok && result.httpStatus >= 500) {
          console.error("[wa-web-ws] Error procesando evento:", result.error);
        }
      } catch (err) {
        console.error("[wa-web-ws] Mensaje malformado o fallo de proceso:", err);
      }
    })();
  });

  socket.on("close", () => {
    socket = null;
    if (started) scheduleReconnect();
  });

  socket.on("error", (err) => {
    console.error("[wa-web-ws] Error de socket:", err.message);
  });
}

/** Arranca el cliente WS in-process (idempotente). */
export function startWaWebManagerSocket(): void {
  if (started) return;
  if (!resolveManagerWsUrl()) return;

  started = true;
  connect();
}

/** Solo para tests. */
export function stopWaWebManagerSocketForTests(): void {
  started = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  socket?.close();
  socket = null;
  attempt = 0;
}
