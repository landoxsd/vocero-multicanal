"use client";

import { useEffect, useState } from "react";
import { BookMarked, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function SaveKbDialog({
  conversationId,
  messageId,
  onClose,
  onSaved,
}: {
  conversationId: string;
  messageId?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const qs = messageId
        ? `?messageId=${encodeURIComponent(messageId)}`
        : "";
      const res = await fetch(
        `/api/conversations/${conversationId}/kb-suggest${qs}`
      ).catch(() => null);
      if (cancelled) return;
      if (!res?.ok) {
        const data = (await res?.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(data?.error?.message ?? "No se pudo sugerir una entrada");
        setLoading(false);
        return;
      }
      const data = (await res.json()) as {
        suggestion: { question: string; answer: string };
      };
      setQuestion(data.suggestion.question);
      setAnswer(data.suggestion.answer);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [conversationId, messageId]);

  async function save() {
    if (!question.trim() || !answer.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/kb", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "qa",
        question: question.trim(),
        answer: answer.trim(),
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo guardar en el conocimiento");
      return;
    }
    onSaved?.();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Guardar en conocimiento"
    >
      <div className="w-full max-w-md rounded-lg border bg-card p-4 shadow-pop">
        <div className="flex items-center gap-2">
          <BookMarked className="h-4 w-4 text-brand" strokeWidth={1.7} />
          <h3 className="font-semibold">Guardar en conocimiento</h3>
        </div>
        <p className="mt-1 text-xs text-text-3">
          Revisa y edita antes de guardar. El agente usará esta P/R en futuras
          conversaciones.
        </p>

        {loading ? (
          <p className="mt-6 flex items-center justify-center gap-2 text-sm text-text-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            Sugiriendo pregunta y respuesta…
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium" htmlFor="kb-q">
                Pregunta del cliente
              </label>
              <Input
                id="kb-q"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="¿Tienen filtro de aceite para…?"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" htmlFor="kb-a">
                Respuesta
              </label>
              <Textarea
                id="kb-a"
                rows={4}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Sí, tenemos en stock…"
              />
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 text-xs text-danger-text">{error}</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={loading || saving || !question.trim() || !answer.trim()}
          >
            {saving ? "Guardando…" : "Guardar P/R"}
          </Button>
        </div>
      </div>
    </div>
  );
}
