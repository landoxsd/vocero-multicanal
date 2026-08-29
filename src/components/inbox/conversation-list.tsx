"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Sparkles, UserRound, X } from "lucide-react";
import type { ConversationDto } from "@/lib/types";
import { matchesQuery } from "@/lib/search";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { ChannelBadge } from "@/components/channels/channel-badge";
import { formatTime, liveWaitingMs, previewText, sortInboxByDate, sortInboxByPriority, formatWaiting, waitingUrgency } from "./helpers";

export type InboxSortMode = "date" | "priority";
const INBOX_SORT_KEY = "vocero.inboxSort";

const STAGE_DOT: Record<string, string> = {
  Nuevo: "#9ca3af",
  "En conversación": "#7b93b3",
  Interesado: "#b08b5e",
  Cliente: "#5f8f74",
  Perdido: "#a2504c",
};

function EmptyState({ onSeeded }: { onSeeded: () => void }) {
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
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium">Sin conversaciones todavía</p>
      <p className="text-xs text-text-3">
        Cuando alguien escriba a tu número de WhatsApp, su conversación
        aparecerá aquí en tiempo real.
      </p>
      {!failed && (
        <Button
          size="sm"
          variant="outline"
          disabled={seeding}
          onClick={() => void seed()}
        >
          <Sparkles className="h-4 w-4" strokeWidth={1.7} />
          {seeding ? "Cargando demo…" : "Cargar datos de demostración"}
        </Button>
      )}
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
  selectedId,
  onSelect,
  onSeeded,
  markReadOnOpen,
  onMarkReadOnOpenChange,
}: {
  conversations: ConversationDto[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeeded: () => void;
  markReadOnOpen: boolean;
  onMarkReadOnOpenChange: (value: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "waiting">("all");
  const [sortMode, setSortMode] = useState<InboxSortMode>("date");
  const [stage, setStage] = useState<string>("all");
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

  const loading = conversationsProp === null;
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
  const unreadCount = searched.filter((c) => c.unreadCount > 0).length;
  const waitingCount = searched.filter((c) => c.needsReply).length;
  const filtered =
    filter === "unread"
      ? searched.filter((c) => c.unreadCount > 0)
      : filter === "waiting"
        ? searched.filter((c) => c.needsReply)
        : searched;
  const sorted =
    sortMode === "priority"
      ? sortInboxByPriority(filtered)
      : sortInboxByDate(filtered);
  const visible = sorted;

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
        <div className="mb-3 flex items-baseline gap-2">
          <h2 className="text-[17px] font-[650] tracking-tight">Bandeja</h2>
          <span className="text-sm text-text-3">{conversations.length}</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-secondary px-3 py-[7px] transition-colors focus-within:border-brand focus-within:bg-background focus-within:ring-[3px] focus-within:ring-brand-soft">
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

      <div className="flex items-center gap-1.5 overflow-x-auto border-b px-4 py-2.5">
        {(
          [
            { id: "all", label: "Todas", count: searched.length },
            { id: "unread", label: "No leídas", count: unreadCount },
            { id: "waiting", label: "Esperando", count: waitingCount },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[5px] text-[12.5px] font-medium transition-colors",
              filter === f.id
                ? "border-brand bg-brand text-brand-fg"
                : "bg-background text-text-2 hover:bg-accent"
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
              "min-w-0 max-w-[38%] truncate rounded-full border px-2 py-[5px] text-[12.5px] font-medium transition-colors",
              stage === "all"
                ? "bg-background text-text-2 hover:bg-accent"
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
            "shrink-0 rounded-full border px-2 py-[5px] text-[12.5px] font-medium transition-colors",
            sortMode === "priority"
              ? "border-brand bg-brand text-brand-fg"
              : "bg-background text-text-2 hover:bg-accent",
            stages.length === 0 ? "ml-auto" : ""
          )}
        >
          <option value="date">Más recientes</option>
          <option value="priority">Prioridad</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-6 text-center text-xs text-text-3">Cargando…</p>
        ) : conversations.length === 0 ? (
          <EmptyState onSeeded={onSeeded} />
        ) : visible.length === 0 ? (
          <p className="p-6 text-center text-xs text-text-3">
            Sin resultados para este filtro.
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
                <li key={c.id} className="relative border-b border-border/70">
                  {active && (
                    <span className="absolute inset-y-0 left-0 w-[3px] bg-brand" />
                  )}
                  <button
                    onClick={() => onSelect(c.id)}
                    className={cn(
                      "flex w-full items-start gap-[11px] px-4 py-[var(--row-py)] text-left transition-colors",
                      active ? "bg-[var(--bg-active)]" : "hover:bg-subtle"
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
                        <span
                          className={cn(
                            "truncate text-sm",
                            unread ? "font-[680]" : "font-semibold"
                          )}
                        >
                          {c.contact.name}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[11.5px]",
                            unread ? "font-semibold text-brand" : "text-text-3"
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
                            {c.unreadCount}
                          </span>
                        )}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {c.platform && c.platform !== "whatsapp" && (
                          <ChannelBadge platform={c.platform} label={c.channelName} size="sm" />
                        )}
                        {c.stageName && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border bg-secondary px-2 py-0.5 text-[11px] text-text-2">
                            <span
                              className="h-[7px] w-[7px] rounded-full"
                              style={{
                                background: STAGE_DOT[c.stageName] ?? "#9ca3af",
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
