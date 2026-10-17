"use client";

import { useEffect, useRef, useState } from "react";
import { Inbox, Megaphone, Search, Sparkles, UserRound, X } from "lucide-react";
import type { ConversationDto } from "@/lib/types";
import { etiquetaDeOrigen, titularDeOrigen } from "@/lib/anuncios";
import { CHANNEL_LABEL, type Channel } from "@/lib/channels";
import { ChannelBadge } from "@/components/channel-badge";
import { ChannelBadge as OmniChannelBadge } from "@/components/channels/channel-badge";
import { matchesQuery } from "@/lib/search";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  emptyInboxDescription,
  formatTime,
  previewText,
  liveWaitingMs,
  sortInboxByDate,
  sortInboxByPriority,
  formatWaiting,
  waitingUrgency,
} from "./helpers";

export type InboxSortMode = "date" | "priority";
const INBOX_SORT_KEY = "vocero.inboxSort";

/* Puntos de etapa: los tokens del tema, no hex copiados del tema claro —
   así siguen al acento white-label y se recalculan en oscuro. */
const STAGE_DOT: Record<string, string> = {
  Nuevo: "var(--text-3)",
  "En conversación": "var(--accent)",
  Interesado: "var(--warning)",
  Cliente: "var(--success)",
  Perdido: "var(--danger)",
};
const STAGE_DOT_FALLBACK = "var(--text-3)";

/**
 * Foco por teclado de chips y selector: el anillo de `ui/button`, acento
 * sólido separado del control (el elegido ya ES del color del acento y un
 * anillo pegado se fundiría con él). El suave de los campos
 * (`ring-brand-soft`) queda a ~1.3:1 del fondo: aquí no hay borde que cambie
 * de color para compensarlo, y se veía menos que el del navegador.
 */
const FOCO_SEPARADO =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function InboxEmptyState({
  onSeeded,
  channels,
}: {
  onSeeded: () => void;
  channels: readonly Channel[];
}) {
  const [seeding, setSeeding] = useState(false);
  const [failed, setFailed] = useState(false);

  async function seed() {
    setSeeding(true);
    const res = await fetch("/api/seed/demo", { method: "POST" }).catch(
      () => null
    );
    setSeeding(false);
    if (res?.ok) onSeeded();
    else setFailed(true);
  }

  return (
    <EmptyState
      icon={Inbox}
      className="h-full"
      title="Sin conversaciones todavía"
      description={emptyInboxDescription(channels.map((ch) => CHANNEL_LABEL[ch]))}
      action={
        !failed && (
          <Button
            size="sm"
            variant="outline"
            disabled={seeding}
            onClick={() => void seed()}
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.7} />
            {seeding ? "Cargando demo…" : "Cargar datos de demostración"}
          </Button>
        )
      }
    />
  );
}

function FetchErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium text-danger-text">No se pudo cargar la bandeja</p>
      <p className="text-xs text-text-3">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}

const URGENCY_CLASS: Record<ReturnType<typeof waitingUrgency>, string> = {
  normal: "border-border bg-secondary text-text-2",
  warning: "border-warning-soft bg-warning-tint text-warning-text",
  critical: "border-danger-soft bg-danger-tint text-danger-text",
};

export function ConversationList({
  conversations: conversationsProp,
  channels,
  selectedId,
  onSelect,
  onSeeded,
  markReadOnOpen,
  onMarkReadOnOpenChange,
  fetchError,
  onRetry,
}: {
  conversations: ConversationDto[] | null;
  /** Canales encendidos en esta instancia (ADR-001). */
  channels: readonly Channel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeeded: () => void;
  markReadOnOpen: boolean;
  onMarkReadOnOpenChange: (value: boolean) => void;
  fetchError?: string | null;
  onRetry?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "waiting" | "anuncios">("all");
  const [sortMode, setSortMode] = useState<InboxSortMode>("date");
  const [stage, setStage] = useState<string>("all");
  const [inbox, setInbox] = useState<Channel | "all">("all");
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(INBOX_SORT_KEY);
    if (stored === "priority") setSortMode("priority");
  }, []);

  function changeSortMode(mode: InboxSortMode) {
    setSortMode(mode);
    localStorage.setItem(INBOX_SORT_KEY, mode);
  }

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  /**
   * Rescate de lo tecleado ANTES de que hidratara el JS. La caja se pinta en
   * el HTML del servidor, así que se puede escribir en ella mientras carga la
   * página; al montar, React la dejaba vacía y esas pulsaciones se perdían en
   * silencio (el usuario veía la lista entera "sin filtrar"). Por eso el input
   * es NO controlado: el DOM manda y aquí solo adoptamos su valor.
   */
  useEffect(() => {
    const typed = inputRef.current?.value ?? "";
    if (typed) setQuery(typed);
  }, []);

  const loading = conversationsProp === null && !fetchError;
  const conversations = conversationsProp ?? [];
  // Solo NOMBRE y TELÉFONO, como cualquier filtro de contactos. Antes también
  // miraba el preview, y como el agente nombra al dueño en sus propios
  // mensajes, buscar ese nombre devolvía media bandeja. Encima era una
  // búsqueda de mensajes a medias: solo el último de cada hilo, no el historial.
  const searched = conversations.filter(
    (c) =>
      matchesQuery(query, {
        text: [c.contact.name],
        phone: c.contact.phone,
      }) && (stage === "all" || c.stageName === stage)
  );

  // La bandeja elegida es el filtro de AFUERA: "Todas" y "No leídas" cuentan
  // dentro de ella, no sobre la suma de los canales.
  const inInbox =
    inbox === "all" ? searched : searched.filter((c) => c.channel === inbox);
  const inboxCount = (ch: Channel) =>
    searched.filter((c) => c.channel === ch).length;
  const unreadCount = inInbox.filter((c) => c.unreadCount > 0).length;
  const waitingCount = inInbox.filter((c) => c.needsReply).length;
  // 018: las que abrió un anuncio (o una publicación con botón de WhatsApp).
  const deAnuncios = inInbox.filter((c) => c.anuncio !== null);

  const filtered =
    filter === "unread"
      ? inInbox.filter((c) => c.unreadCount > 0)
      : filter === "waiting"
        ? inInbox.filter((c) => c.needsReply)
        : filter === "anuncios"
          ? deAnuncios
          : inInbox;

  const sorted =
    sortMode === "priority"
      ? sortInboxByPriority(filtered)
      : sortInboxByDate(filtered);
  const visible = sorted;

  // Sin ninguna conversación de anuncio el filtro no aparece: a quien no
  // anuncia no se le pinta un botón que siempre dice 0. Si está elegido, se
  // queda, para poder salir de él aunque el contador baje a cero.
  const filtros: { id: typeof filter; label: string; count: number }[] = [
    { id: "all", label: "Todas", count: inInbox.length },
    { id: "unread", label: "No leídas", count: unreadCount },
    { id: "waiting", label: "Esperando", count: waitingCount },
  ];
  if (deAnuncios.length > 0 || filter === "anuncios") {
    filtros.push({ id: "anuncios", label: "Anuncios", count: deAnuncios.length });
  }

  // Con un solo canal encendido no hay bandejas que distinguir: ni marca en
  // los renglones ni filtro. La pantalla queda exactamente como antes de 014.
  const multiChannel = channels.length > 1;

  // Etapas presentes en la bandeja, en el orden en que llegan del pipeline.
  const stages: string[] = [];
  for (const c of conversations) {
    if (c.stageName && !stages.includes(c.stageName)) stages.push(c.stageName);
  }

  function clearQuery() {
    if (inputRef.current) inputRef.current.value = "";
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-4 pb-3 pt-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[17px] font-bold tracking-tight">Bandeja</h2>
          <span className="font-mono text-[12px] text-text-3">{conversations.length}</span>
          {multiChannel && (
            <div className="ml-auto flex items-center gap-1">
              {channels.map((ch) => {
                const on = inbox === ch;
                return (
                  <button
                    key={ch}
                    onClick={() => setInbox(on ? "all" : ch)}
                    aria-pressed={on}
                    title={
                      on
                        ? "Ver todas las bandejas"
                        : `Ver solo ${CHANNEL_LABEL[ch]}`
                    }
                    className={cn(
                      "flex items-center gap-1 rounded-full border py-[3px] pl-[5px] pr-2 text-[11.5px] font-medium transition-colors",
                      FOCO_SEPARADO,
                      on
                        ? "border-brand bg-brand-veil text-foreground"
                        : "text-text-3 hover:bg-accent",
                      inbox !== "all" && !on && "opacity-45"
                    )}
                  >
                    <ChannelBadge
                      channel={ch}
                      className="h-[13px] w-[13px] rounded-[4px]"
                    />
                    {inboxCount(ch)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-strong bg-chip px-3.5 py-[7px] shadow-sm transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand-soft">
          <Search className="h-4 w-4 shrink-0 text-text-3" strokeWidth={1.7} />
          <input
            ref={inputRef}
            placeholder="Buscar por nombre o teléfono…"
            aria-label="Buscar conversación"
            defaultValue=""
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-text-3"
          />
          {query && (
            <button
              onClick={clearQuery}
              aria-label="Limpiar búsqueda"
              className="shrink-0 rounded-full p-0.5 text-text-3 hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12px] text-text-2">
          <input
            type="checkbox"
            checked={markReadOnOpen}
            onChange={(e) => onMarkReadOnOpenChange(e.target.checked)}
            className="rounded border"
          />
          Marcar como leída al abrir
        </label>
      </header>

      {/* Envuelve: con el filtro de anuncios, los tres botones y el selector de
          etapa no caben en una columna de 300-360 px, y el selector se
          aplastaba hasta dejar solo la flecha. */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 border-b px-4 py-2.5">
        {filtros.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[5px] text-[12.5px] font-semibold transition-colors",
              FOCO_SEPARADO,
              filter === f.id
                ? "border-brand bg-brand text-brand-fg"
                : "border-border-strong bg-chip text-text-2 hover:border-text-3"
            )}
          >
            {f.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-[11px]",
                filter === f.id ? "bg-brand-veil" : "bg-secondary text-text-3"
              )}
            >
              {f.count}
            </span>
          </button>
        ))}

        {stages.length > 0 && (
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            aria-label="Filtrar por etapa del embudo"
            className={cn(
              "ml-auto min-w-0 max-w-[36%] truncate rounded-full border px-2 py-[5px] text-[12.5px] font-semibold transition-colors",
              FOCO_SEPARADO,
              stage === "all"
                ? "border-border-strong bg-chip text-text-2 hover:border-text-3"
                : "border-brand bg-brand text-brand-fg"
            )}
          >
            <option value="all">Toda etapa</option>
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        <select
          value={sortMode}
          onChange={(e) => changeSortMode(e.target.value as InboxSortMode)}
          aria-label="Ordenar conversaciones"
          className={cn(
            "shrink-0 rounded-full border px-2 py-[5px] text-[12.5px] font-semibold transition-colors",
            FOCO_SEPARADO,
            sortMode === "priority"
              ? "border-brand bg-brand text-brand-fg"
              : "border-border-strong bg-chip text-text-2 hover:border-text-3",
            stages.length === 0 ? "ml-auto" : ""
          )}
        >
          <option value="date">Más recientes</option>
          <option value="priority">Prioridad</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {fetchError ? (
          <FetchErrorState
            message={fetchError}
            onRetry={() => onRetry?.()}
          />
        ) : loading ? (
          <p className="p-6 text-center text-xs text-text-3">Cargando…</p>
        ) : conversations.length === 0 ? (
          <InboxEmptyState onSeeded={onSeeded} channels={channels} />
        ) : visible.length === 0 ? (
          <p className="p-6 text-center text-xs text-text-3">
            {/* 028: un canal en el que nadie ha escrito no es una búsqueda fallida. */}
            {inbox !== "all" &&
            !query &&
            filter === "all" &&
            stage === "all" &&
            !conversations.some((c) => c.channel === inbox)
              ? `Nadie ha escrito por ${CHANNEL_LABEL[inbox]} todavía.`
              : "Sin resultados para este filtro."}
          </p>
        ) : (
          <ul>
            {visible.map((c) => {
              const unread = c.unreadCount > 0;
              const active = selectedId === c.id;
              const waitMs = liveWaitingMs(c, now);
              const urgency =
                waitMs !== null ? waitingUrgency(waitMs) : "normal";
              return (
                <li key={c.id} className="relative border-b border-border">
                  {active && (
                    <span className="absolute inset-y-0 left-0 w-[3px] bg-brand" />
                  )}
                  <button
                    onClick={() => onSelect(c.id)}
                    className={cn(
                      "flex w-full items-start gap-[11px] px-4 py-[var(--row-py)] text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      active ? "bg-[var(--bg-active)]" : "hover:bg-row-hover"
                    )}
                  >
                    <span className="relative shrink-0">
                      <ContactAvatar name={c.contact.name} seed={c.contact.id} size="lg" />
                      {c.windowOpen && (
                        <span className="absolute bottom-0 right-0 h-[11px] w-[11px] rounded-full border-[2.5px] border-background bg-success" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {multiChannel && <ChannelBadge channel={c.channel} />}
                          <span
                            className={cn(
                              "truncate text-sm",
                              unread ? "font-[680]" : "font-semibold"
                            )}
                          >
                            {c.contact.name}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 font-mono text-[10.5px] tracking-[0.02em]",
                            unread ? "font-semibold text-brand-ink" : "text-text-3"
                          )}
                        >
                          {formatTime(c.lastMessageAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-[13px]",
                            unread ? "font-medium text-text-2" : "text-text-3"
                          )}
                        >
                          {previewText(c.preview)}
                        </span>
                        {unread && (
                          <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[10.5px] font-semibold text-brand-fg">
                            {c.unreadCount > 99 ? "99+" : c.unreadCount}
                          </span>
                        )}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {c.platform && c.platform !== "whatsapp" && (
                          <OmniChannelBadge platform={c.platform} label={c.channelName} size="sm" />
                        )}
                        {c.stageName && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-chip px-2 py-0.5 text-[11px] font-medium text-text-2">
                            <span
                              className="h-[7px] w-[7px] rounded-full"
                              style={{
                                background: STAGE_DOT[c.stageName] ?? STAGE_DOT_FALLBACK,
                              }}
                            />
                            {c.stageName}
                          </span>
                        )}
                        {c.handoffAt && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-warning-soft bg-warning-tint px-2 py-0.5 text-[11px] text-warning-text">
                            <UserRound className="h-3 w-3" strokeWidth={1.7} />
                            Atención humana
                          </span>
                        )}
                        {waitMs !== null && (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                              URGENCY_CLASS[urgency]
                            )}
                            title="Tiempo esperando respuesta"
                          >
                            ⏱ {formatWaiting(waitMs)}
                          </span>
                        )}
                        {c.anuncio && (
                          <span
                            className="inline-flex min-w-0 items-center gap-1 rounded-full border border-info-soft bg-info-tint px-2 py-0.5 text-[11px] text-info-text"
                            title={titularDeOrigen(c.anuncio.headline, c.anuncio.sourceType)}
                          >
                            <Megaphone className="h-3 w-3 shrink-0" strokeWidth={1.7} />
                            <span className="truncate">
                              {etiquetaDeOrigen(c.anuncio.sourceType)}
                              {c.anuncio.headline ? ` · ${c.anuncio.headline}` : ""}
                            </span>
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
