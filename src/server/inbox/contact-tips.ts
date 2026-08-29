import { z } from "zod";
import { chatJson } from "@/lib/ai";
import { fichaEntries, fichaLabel, fichaValueText } from "@/lib/ficha";
import { isAiConfigured } from "@/lib/env";
import type { ContactTip, FichaDto } from "@/lib/types";
import { getContactStage } from "@/server/contacts";
import { getConversation, listMessages } from "@/server/inbox/queries";
import { computeWaitingState } from "@/server/inbox/waiting";

export type { ContactTip };

const tipsSchema = z.object({
  tips: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(220),
        kind: z.enum(["accion", "dato", "alerta"]),
      })
    )
    .min(1)
    .max(5),
});

const FICHA_TIPO_KEYS = ["tipo_cliente", "tipocliente", "tipo", "segmento"];
const FICHA_VEHICLE_KEYS = [
  "vehiculos",
  "vehiculo",
  "vehículos",
  "marca",
  "modelo",
  "año",
  "ano",
  "motor",
];

function fichaHasKey(ficha: FichaDto, keys: string[]): boolean {
  return Object.keys(ficha).some((k) =>
    keys.includes(k.toLowerCase().replace(/[_\s-]/g, ""))
  );
}

function fichaText(ficha: FichaDto): string {
  if (Object.keys(ficha).length === 0) return "(vacía)";
  return fichaEntries(ficha)
    .map(([k, v]) => `${fichaLabel(k)}: ${fichaValueText(v)}`)
    .join("\n");
}

function transcriptSnippet(
  messages: { direction: string; text: string | null }[],
  limit = 14
): string {
  const slice = messages.slice(-limit);
  if (slice.length === 0) return "(sin mensajes)";
  return slice
    .map((m) => {
      const who = m.direction === "in" ? "CLIENTE" : "EQUIPO";
      const body = m.text?.trim() || "(sin texto)";
      return `${who}: ${body}`;
    })
    .join("\n");
}

/** Tips deterministas cuando no hay IA o el proveedor falla. */
export function buildHeuristicTips(input: {
  ficha: FichaDto;
  handoffAt: Date | null;
  handoffReason: string | null;
  needsReply: boolean;
  waitingMs: number | null;
  stageName: string | null;
  preview: string | null;
}): ContactTip[] {
  const tips: ContactTip[] = [];

  if (input.handoffAt) {
    tips.push({
      kind: "alerta",
      text:
        input.handoffReason === "cliente"
          ? "Pidió hablar con una persona: prioriza respuesta humana y confirma que lo atiendes."
          : "La IA está en pausa en este chat: revisa el contexto antes de responder.",
    });
  }

  if (input.needsReply && input.waitingMs !== null) {
    const min = Math.floor(input.waitingMs / 60_000);
    if (min >= 15) {
      tips.push({
        kind: "alerta",
        text: `Lleva ${min} min esperando respuesta — conviene atender pronto.`,
      });
    } else if (min >= 5) {
      tips.push({
        kind: "accion",
        text: `Cliente esperando ~${min} min: confirma que recibiste y da un tiempo estimado.`,
      });
    }
  }

  if (!fichaHasKey(input.ficha, FICHA_TIPO_KEYS)) {
    tips.push({
      kind: "accion",
      text: "Pregunta si compra para uso propio, si es taller o si compra al mayor.",
    });
  }

  if (!fichaHasKey(input.ficha, FICHA_VEHICLE_KEYS)) {
    tips.push({
      kind: "accion",
      text: "Confirma marca, modelo y año del vehículo (y motor si aplica) antes de cotizar.",
    });
  } else {
    tips.push({
      kind: "dato",
      text: "Ya hay datos de vehículo en la ficha — úsalos para no repetir preguntas.",
    });
  }

  if (
    input.preview &&
    /precio|cuesta|cotiz|costo|vale cuánto|vale cuanto/i.test(input.preview)
  ) {
    tips.push({
      kind: "accion",
      text: "Preguntaron por precio: verifica stock y cotiza; no inventes montos.",
    });
  }

  if (input.stageName === "Nuevo" || input.stageName === "En conversación") {
    tips.push({
      kind: "dato",
      text: "Lead en etapa temprana: enfócate en identificar pieza y cerrar datos del vehículo.",
    });
  }

  if (tips.length === 0) {
    tips.push({
      kind: "dato",
      text: "Revisa el hilo reciente y actualiza la ficha con lo que confirmes.",
    });
  }

  return tips.slice(0, 5);
}

async function buildAiTips(input: {
  contactName: string;
  ficha: FichaDto;
  stageName: string | null;
  transcript: string;
  handoffAt: Date | null;
  needsReply: boolean;
  waitingMs: number | null;
}): Promise<ContactTip[] | null> {
  const waitLine =
    input.needsReply && input.waitingMs !== null
      ? `Esperando respuesta hace ~${Math.max(1, Math.floor(input.waitingMs / 60_000))} min.`
      : "No está esperando respuesta urgente.";

  const result = await chatJson(tipsSchema, [
    {
      role: "system",
      content: [
        "Eres un copiloto para vendedores de autopartes en WhatsApp (World Cars / repuestos).",
        "Generas tips CORTOS (máx. 1 línea cada uno) para quien atiende el chat a mano.",
        'Responde SOLO JSON: {"tips":[{"text":"...","kind":"accion"|"dato"|"alerta"}]}',
        "Reglas:",
        "- accion = qué preguntar o hacer ahora",
        "- dato = contexto útil del historial o la ficha",
        "- alerta = riesgo (espera larga, reclamo, datos faltantes críticos)",
        "- No inventes stock, precios ni compatibilidad.",
        "- Máximo 5 tips, sin repetir ideas.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `CONTACTO: ${input.contactName}`,
        `ETAPA: ${input.stageName ?? "sin etapa"}`,
        input.handoffAt
          ? "Estado: atención humana (IA en pausa)."
          : "Estado: conversación normal.",
        waitLine,
        `FICHA ACTUAL:\n${fichaText(input.ficha)}`,
        `ÚLTIMOS MENSAJES:\n${input.transcript}`,
        "Genera tips prácticos para el vendedor.",
      ].join("\n\n"),
    },
  ]);

  if (!result.ok) return null;
  return result.data.tips;
}

export async function generateContactTips(
  organizationId: string,
  conversationId: string
): Promise<{ tips: ContactTip[]; source: "ai" | "heuristic" }> {
  const row = await getConversation(organizationId, conversationId);
  if (!row) return { tips: [], source: "heuristic" };

  const stageRow = await getContactStage(organizationId, row.contact.id);
  const stageName = stageRow?.stage.name ?? null;

  const messageRows = await listMessages(organizationId, conversationId);
  const messages = messageRows.map((r) => r.message);
  const lastDir = messages.at(-1)?.direction ?? null;
  const { needsReply, waitingMs } = computeWaitingState({
    lastMessageDirection: lastDir,
    lastInboundAt: row.conversation.lastInboundAt,
  });

  const preview =
    messages
      .slice()
      .reverse()
      .find((m) => m.text?.trim())?.text ?? null;

  const heuristic = buildHeuristicTips({
    ficha: (row.contact.ficha ?? {}) as FichaDto,
    handoffAt: row.conversation.handoffAt,
    handoffReason: row.conversation.handoffReason,
    needsReply,
    waitingMs,
    stageName,
    preview,
  });

  if (!isAiConfigured()) {
    return { tips: heuristic, source: "heuristic" };
  }

  const aiTips = await buildAiTips({
    contactName: row.contact.name,
    ficha: (row.contact.ficha ?? {}) as FichaDto,
    stageName,
    transcript: transcriptSnippet(messages),
    handoffAt: row.conversation.handoffAt,
    needsReply,
    waitingMs,
  });

  if (!aiTips || aiTips.length === 0) {
    return { tips: heuristic, source: "heuristic" };
  }

  return { tips: aiTips, source: "ai" };
}
