/**
 * 029 — ¿El agente incluido se queda callado cuando le toca contestar?
 *
 * Mide el prompt real (`src/server/ai/prompts.ts`) contra el modelo real: un
 * negocio de ejemplo, una lista de mensajes y varias vueltas de cada uno, con
 * los mismos reintentos que `chatJson`. Los saludos, las pruebas y las
 * preguntas tienen que contestarse siempre; los cierres («ok gracias», «👍»)
 * pueden quedar en silencio.
 *
 * Gasta dinero real (centavos) y por eso NO corre en CI. Usa la llave y el
 * modelo del `.env` (`OPENROUTER_API_TOKEN`, `OPENROUTER_BASE_URL`,
 * `OPENROUTER_MODEL`); el modelo se puede cambiar con `EVAL_MODEL`.
 *
 *   pnpm eval:silencios            # 6 vueltas por mensaje
 *   EVAL_VUELTAS=10 EVAL_MODEL=openai/gpt-4o-mini pnpm eval:silencios
 *
 * Sale distinto de cero si algún mensaje que debía contestarse se quedó sin
 * respuesta o si algún turno agotó los reintentos.
 */
import { agentActionSchema, type AgentActionType } from "@/server/ai/actions";
import { buildAgentSystemPrompt, TURN_FORMAT_REMINDER } from "@/server/ai/prompts";
import { chatCompletionsUrl } from "@/lib/ai/presets";

type Msg = { role: "system" | "user" | "assistant"; content: string };
type Profile = Parameters<typeof buildAgentSystemPrompt>[0]["profile"];
type Kb = Parameters<typeof buildAgentSystemPrompt>[0]["kb"];

const token = process.env.OPENROUTER_API_TOKEN;
const baseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api";
const model = process.env.EVAL_MODEL || process.env.OPENROUTER_MODEL;
const vueltas = Number(process.env.EVAL_VUELTAS || 6);
if (!token || !model) {
  console.error("Faltan OPENROUTER_API_TOKEN y OPENROUTER_MODEL (o EVAL_MODEL) en el entorno.");
  process.exit(2);
}

// Un consultorio de ejemplo, como los que configura cualquier instalación.
const profile = {
  name: "Sofía",
  tone: "Cálido, respetuoso y claro. Habla de usted, con frases cortas.",
  instructions:
    "Eres Sofía, la asistente virtual del Consultorio Vida Sana. Informas sobre servicios, horarios, costos y ubicación, y tomas los datos de quien quiera una cita. Respondes solo con tu base de conocimiento, en mensajes de 2 a 4 líneas.",
  escalationRules:
    "Pasa la conversación a una persona cuando ya tomaste los datos de una cita, cuando preguntan algo médico sobre su caso o cuando piden hablar con una persona.",
  greeting: "¡Hola! Soy Sofía, asistente virtual del Consultorio Vida Sana. ¿En qué le puedo ayudar?",
} as unknown as Profile;
const kb = [
  { kind: "qa", question: "¿Qué servicios ofrecen?", answer: "Consulta general, control de diabetes e hipertensión, chequeo general y certificados médicos." },
  { kind: "qa", question: "¿Cuánto cuesta la consulta?", answer: "La consulta general cuesta $600 MXN." },
  { kind: "qa", question: "¿Cuál es el horario?", answer: "Lunes a viernes de 9:00 a 19:00 y sábados de 9:00 a 14:00." },
] as unknown as Kb;
const stages = [{ name: "Nuevo" }, { name: "Interesado" }, { name: "Cliente" }];
const system = buildAgentSystemPrompt({ profile, kb, stages, agenda: false });

const saludo = "¡Hola! Soy Sofía, asistente virtual del Consultorio Vida Sana. ¿En qué le puedo ayudar?";
const precio = "La consulta general cuesta $600 MXN. ¿Le gustaría agendar una?";
const u = (content: string): Msg => ({ role: "user", content });
const a = (content: string): Msg => ({ role: "assistant", content });

/** [nombre, historial, ¿callar está bien?] */
const escenarios: [string, Msg[], boolean][] = [
  ["«Hola»", [u("Hola")], false],
  ["«Buenas tardes»", [u("Buenas tardes")], false],
  ["«Hola prueba 1»", [u("Hola prueba 1")], false],
  ["«prueba»", [u("prueba")], false],
  ["«Hola prueba 1» después del saludo", [u("Hola"), a(saludo), u("Hola prueba 1")], false],
  ["«Hola» después de una respuesta", [u("¿Cuánto cuesta la consulta?"), a(precio), u("Hola")], false],
  ["una pregunta después del saludo", [u("Hola"), a(saludo), u("¿Qué servicios ofrecen y cuánto cuestan?")], false],
  ["«Ok gracias» (cierre)", [u("¿Cuánto cuesta la consulta?"), a(precio), u("Ok gracias")], true],
  ["«👍» (cierre)", [u("¿Cuánto cuesta la consulta?"), a(precio), u("👍")], true],
];

const STRICT =
  "STRICT: tu respuesta anterior no fue JSON válido según el esquema. Responde ÚNICAMENTE el objeto JSON, sin explicaciones ni markdown.";
const schema = agentActionSchema(false);

type Turno = { action: AgentActionType | null; intentos: number };

/** Igual que el pipeline y `chatJson`: recordatorio al final, 3 intentos. */
async function turno(historial: Msg[]): Promise<Turno> {
  for (let intento = 1; intento <= 3; intento++) {
    const messages: Msg[] = [
      { role: "system", content: system },
      ...historial,
      { role: "system", content: TURN_FORMAT_REMINDER },
      ...(intento > 1 ? [{ role: "system" as const, content: STRICT }] : []),
    ];
    const res = await fetch(chatCompletionsUrl(baseUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages }),
    });
    if (!res.ok) throw new Error(`el proveedor respondió ${res.status}`);
    const raw = ((await res.json()) as { choices?: { message?: { content?: string } }[] })
      .choices?.[0]?.message?.content ?? "";
    const desde = raw.indexOf("{");
    const hasta = raw.lastIndexOf("}");
    try {
      const parsed = schema.safeParse(JSON.parse(raw.slice(desde, hasta + 1)));
      if (parsed.success) return { action: parsed.data, intentos: intento };
    } catch {
      // sin JSON: siguiente intento, como chatJson
    }
  }
  return { action: null, intentos: 3 };
}

/** El cliente no recibe nada con esta acción. */
function sinRespuesta(x: AgentActionType | null): boolean {
  if (!x) return true;
  if (x.action === "none") return true;
  if (x.action === "update_lead" || x.action === "move_stage") return !x.reply;
  if (x.action === "handoff") return !x.farewell;
  return false;
}

console.log(`modelo ${model} · ${vueltas} vueltas por mensaje\n`);
let fallos = 0;
for (const [nombre, historial, callarOk] of escenarios) {
  const turnos = await Promise.all(Array.from({ length: vueltas }, () => turno(historial)));
  const callados = turnos.filter((t) => sinRespuesta(t.action)).length;
  const reintentos = turnos.filter((t) => t.intentos > 1).length;
  const agotados = turnos.filter((t) => t.action === null).length;
  const mal = (callarOk ? 0 : callados) + agotados;
  fallos += mal;
  console.log(
    `  ${mal ? "FAIL" : "OK  "} ${nombre}: ${callados}/${vueltas} sin respuesta` +
      (reintentos ? ` · ${reintentos} con reintento` : "") +
      (agotados ? ` · ${agotados} agotaron los reintentos` : "") +
      (callarOk ? " (callar está bien)" : "")
  );
}
console.log(fallos ? `\n${fallos} turnos mal` : "\ntodo en verde");
process.exit(fallos ? 1 : 0);
