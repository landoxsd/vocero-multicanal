"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, Lightbulb, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContactTip } from "@/lib/types";

const KIND_ICON = {
  accion: Lightbulb,
  dato: Info,
  alerta: AlertTriangle,
} as const;

const KIND_CLASS = {
  accion: "border-brand-soft bg-brand-tint text-brand-text",
  dato: "border-border bg-secondary text-text-2",
  alerta: "border-warning-soft bg-warning-tint text-warning-text",
} as const;

export function FichaTips({
  conversationId,
  refreshKey = 0,
}: {
  conversationId: string;
  refreshKey?: number;
}) {
  const [tips, setTips] = useState<ContactTip[]>([]);
  const [source, setSource] = useState<"ai" | "heuristic" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastFetchRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (force = false) => {
      const now = Date.now();
      if (!force && now - lastFetchRef.current < 25_000) return;

      setLoading(true);
      setError(null);
      const res = await fetch(`/api/conversations/${conversationId}/tips`).catch(
        () => null
      );
      lastFetchRef.current = Date.now();
      if (!res?.ok) {
        setError("No se pudieron generar tips");
        setLoading(false);
        return;
      }
      const data = (await res.json()) as {
        tips: ContactTip[];
        source: "ai" | "heuristic";
      };
      setTips(data.tips);
      setSource(data.source);
      setLoading(false);
    },
    [conversationId]
  );

  useEffect(() => {
    void load(true);
  }, [conversationId, load]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void load();
    }, 2_500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [refreshKey, load]);

  return (
    <section className="border-b p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-brand" strokeWidth={1.7} />
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-3">
            Tips
          </p>
          {source === "heuristic" && !loading && (
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-text-3">
              básicos
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          aria-label="Actualizar tips"
          className="rounded p-1 text-text-3 hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            strokeWidth={1.7}
          />
        </button>
      </div>

      {loading && tips.length === 0 ? (
        <p className="flex items-center gap-2 text-xs text-text-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analizando conversación…
        </p>
      ) : error ? (
        <p className="text-xs text-danger-text">{error}</p>
      ) : (
        <ul className="space-y-1.5">
          {tips.map((tip, i) => {
            const Icon = KIND_ICON[tip.kind];
            return (
              <li
                key={`${tip.kind}-${i}`}
                className={cn(
                  "flex items-start gap-2 rounded-md border px-2.5 py-2 text-[12px] leading-snug",
                  KIND_CLASS[tip.kind]
                )}
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
                <span>{tip.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
