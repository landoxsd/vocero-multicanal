"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, Send } from "lucide-react";
import type { TemplateDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Cuenta {{1}}..{{n}} igual que el servidor, para pedir sus valores. */
function countVariables(body: string): number {
  const found = new Set(
    Array.from(body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map((m) => m[1])
  );
  return found.size;
}

export function StartConversation({
  contactId,
  onStarted,
}: {
  contactId: string;
  onStarted: (conversationId: string) => void;
}) {
  const [mode, setMode] = useState<"text" | "template">("text");
  const [directText, setDirectText] = useState("");
  const [templates, setTemplates] = useState<TemplateDto[] | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [vars, setVars] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/templates").catch(() => null);
      if (!res?.ok) return setTemplates([]);
      const data = (await res.json()) as { templates: TemplateDto[] };
      const aprobadas = data.templates.filter((t) => t.status === "approved");
      setTemplates(aprobadas);
      setTemplateId(aprobadas[0]?.id ?? "");
    })();
  }, []);

  const elegida = templates?.find((t) => t.id === templateId) ?? null;
  const nVars = elegida ? countVariables(elegida.body) : 0;

  async function enviarTextoDirecto() {
    if (!directText.trim()) return;
    setEnviando(true);
    setError(null);
    const res = await fetch(`/api/contacts/${contactId}/start-conversation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: directText.trim() }),
    }).catch(() => null);
    setEnviando(false);
    const data = (await res?.json().catch(() => null)) as
      | { error?: { message?: string }; conversationId?: string }
      | null;
    if (!res?.ok) {
      setError(data?.error?.message ?? "No se pudo enviar el mensaje");
      return;
    }
    onStarted(data?.conversationId ?? "");
  }

  async function abrirEnBandeja() {
    setEnviando(true);
    setError(null);
    const res = await fetch(`/api/contacts/${contactId}/start-conversation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => null);
    setEnviando(false);
    const data = (await res?.json().catch(() => null)) as
      | { error?: { message?: string }; conversationId?: string }
      | null;
    if (!res?.ok) {
      setError(data?.error?.message ?? "No se pudo abrir la conversación");
      return;
    }
    onStarted(data?.conversationId ?? "");
  }

  async function enviarPlantilla() {
    setEnviando(true);
    setError(null);
    const res = await fetch(`/api/contacts/${contactId}/start-conversation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        templateId,
        variables: nVars > 0 ? vars.slice(0, nVars) : undefined,
      }),
    }).catch(() => null);
    setEnviando(false);
    const data = (await res?.json().catch(() => null)) as
      | { error?: { message?: string }; conversationId?: string }
      | null;
    if (!res?.ok) {
      setError(data?.error?.message ?? "No se pudo iniciar la conversación");
      return;
    }
    onStarted(data?.conversationId ?? "");
  }

  return (
    <div className="space-y-3 rounded-lg border bg-secondary/20 p-3">
      <div className="flex items-center gap-2 border-b pb-2">
        <button
          type="button"
          onClick={() => setMode("text")}
          className={`text-xs font-semibold px-2.5 py-1 rounded transition-colors ${
            mode === "text"
              ? "bg-brand text-brand-fg"
              : "text-text-2 hover:bg-secondary"
          }`}
        >
          Mensaje Directo (WhatsApp Web)
        </button>
        {templates && templates.length > 0 && (
          <button
            type="button"
            onClick={() => setMode("template")}
            className={`text-xs font-semibold px-2.5 py-1 rounded transition-colors ${
              mode === "template"
                ? "bg-brand text-brand-fg"
                : "text-text-2 hover:bg-secondary"
            }`}
          >
            Plantilla (Cloud API)
          </button>
        )}
      </div>

      {mode === "text" ? (
        <div className="space-y-2">
          <Textarea
            value={directText}
            onChange={(e) => setDirectText(e.target.value)}
            placeholder="Escribe el primer mensaje para este contacto…"
            rows={2}
            className="text-sm bg-background"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={enviando || !directText.trim()}
              onClick={() => void enviarTextoDirecto()}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.7} />
              {enviando ? "Enviando…" : "Enviar mensaje"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={enviando}
              onClick={() => void abrirEnBandeja()}
            >
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.7} />
              Abrir en Bandeja
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <select
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setVars([]);
            }}
            aria-label="Plantilla para iniciar"
            className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
          >
            {templates?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.language})
              </option>
            ))}
          </select>

          {elegida && (
            <p className="rounded-md border bg-secondary/40 px-3 py-2 text-[12px] text-text-2">
              {elegida.body}
            </p>
          )}

          {Array.from({ length: nVars }, (_, i) => (
            <Input
              key={i}
              value={vars[i] ?? ""}
              aria-label={`Valor de la variable ${i + 1}`}
              placeholder={`Valor de {{${i + 1}}}`}
              onChange={(e) => {
                const next = [...vars];
                next[i] = e.target.value;
                setVars(next);
              }}
            />
          ))}

          <Button
            size="sm"
            disabled={enviando || !templateId || vars.slice(0, nVars).some((v) => !v?.trim())}
            onClick={() => void enviarPlantilla()}
          >
            <Send className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.7} />
            {enviando ? "Enviando…" : "Iniciar con plantilla"}
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-danger-text">{error}</p>}
    </div>
  );
}
