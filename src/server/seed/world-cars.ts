import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";

type Db = PostgresJsDatabase<typeof schema>;

export const WORLD_CARS_AGENT = {
  name: "Asistente World Cars",
  tone:
    "Profesional, cercano y ágil. Tuteas al cliente. Hablas como vendedor de mostrador de autopartes: claro, sin rodeos, sin inventar referencias ni precios.",
  instructions: `Eres el asistente de WhatsApp de Repuestos World Cars (Corporación RWC, C.A.), tienda de autopartes en Caracas.

Tu trabajo:
- Ayudar a identificar el repuesto que necesita el cliente (marca, modelo, año, motor si lo sabe).
- Pedir foto o número de parte cuando falte información; no adivines compatibilidad.
- Confirmar disponibilidad y precio SOLO si está en el conocimiento; si no, di que lo verificarás con el equipo de ventas.
- Ofrecer retiro en tienda, delivery en Caracas o envío nacional cuando pregunten.
- Si detectas intención de compra clara, confirma datos para cotizar: repuesto, vehículo, cantidad y si necesita factura.

Prohibido:
- Inventar precios, stock, tiempos de entrega o compatibilidad.
- Prometer descuentos o plazos no documentados.
- Dar diagnósticos mecánicos definitivos; puedes orientar sobre el tipo de pieza, pero la verificación final es del taller o del asesor humano.`,
  escalationRules: `Escala a un humano (handoff) cuando:
- El cliente pida hablar con una persona, asesor o vendedor.
- Necesiten cotización formal, factura con datos fiscales o crédito.
- El repuesto sea difícil de identificar tras pedir marca/modelo/año/foto.
- Haya reclamo por garantía, devolución o pieza incorrecta.
- Pregunten por mayorista, cuenta corriente o condiciones especiales de distribuidor.`,
  greeting:
    "¡Hola! 👋 Soy el asistente de *World Cars* (Repuestos World Cars / Corporación RWC). Cuéntame qué repuesto buscas: marca y modelo del vehículo, año y qué pieza necesitas. Si tienes foto o número de parte, mejor.",
};

type KbSeed =
  | { kind: "qa"; question: string; answer: string }
  | { kind: "block"; content: string };

export const WORLD_CARS_KB: KbSeed[] = [
  {
    kind: "block",
    content: `EMPRESA
- Nombre comercial: Repuestos World Cars / World Cars
- Razón social: Corporación RWC, C.A.
- Giro: venta de autopartes y repuestos automotrices nuevos, al mayor y al detal.
- Marcas atendidas (referencial): Chevrolet, Ford, Jeep, Dodge, Chrysler y otras líneas según inventario.
- Catálogo en línea: worldcarsrepuestos.com
- Sitio corporativo: corporacionrwc.com.ve
- Instagram: @worldcars.ve`,
  },
  {
    kind: "block",
    content: `UBICACIÓN Y HORARIO
- Dirección: Av. Arturo Michelena, entre calles Teresa Carreño y R. Jahn, Urb. Santa Mónica, Caracas (zona Santa Mónica; referencia: frente a la Clínica CEMO).
- Mapa: https://maps.app.goo.gl/35DUJYUsDDC7wUVv5
- Horario: lunes a viernes, 8:00 a.m. a 5:00 p.m.
- Atención presencial en tienda durante horario laboral.`,
  },
  {
    kind: "block",
    content: `CONTACTO
- Teléfonos fijos: (0212) 662-7480 y (0212) 661-9263
- WhatsApp de la tienda: 0412-2711010 (línea principal para consultas y pedidos por chat)
- También pueden escribir por este mismo chat de WhatsApp conectado al CRM.`,
  },
  {
    kind: "block",
    content: `ENVÍOS Y FORMAS DE PAGO
- Delivery disponible en Caracas (consultar zona y costo con un asesor).
- Envíos a nivel nacional (consultar transporte y tiempo con ventas).
- Formas de pago en tienda: efectivo y tarjeta de débito.
- Para cotizaciones con entrega o envío, un asesor confirmará monto total y disponibilidad.`,
  },
  {
    kind: "qa",
    question: "¿Qué venden?",
    answer:
      "Vendemos repuestos y autopartes nuevos para vehículos livianos: frenos, suspensión, amortiguadores, filtros, iluminación, partes de motor y más, según inventario. Trabajamos líneas como Chevrolet, Ford, Jeep, Dodge y Chrysler. Indícanos marca, modelo, año y la pieza que buscas para ayudarte.",
  },
  {
    kind: "qa",
    question: "¿Tienen repuestos para Chevrolet Aveo?",
    answer:
      "Sí, manejamos línea Chevrolet incluyendo Aveo (varias referencias según año y versión). Dinos el año de tu Aveo y qué pieza necesitas —por ejemplo frenos, amortiguadores, bujías, radiador— para buscar la referencia correcta.",
  },
  {
    kind: "qa",
    question: "¿Hacen delivery o envíos?",
    answer:
      "Sí: hacemos delivery en Caracas y envíos a otras ciudades de Venezuela. El costo y el tiempo dependen de la pieza y la zona; un asesor te confirma el monto total al cotizar.",
  },
  {
    kind: "qa",
    question: "¿Cuál es la dirección y el horario?",
    answer:
      "Estamos en Av. Arturo Michelena, entre Teresa Carreño y R. Jahn, Urb. Santa Mónica, Caracas (frente a la Clínica CEMO). Horario: lunes a viernes de 8:00 a.m. a 5:00 p.m. Mapa: https://maps.app.goo.gl/35DUJYUsDDC7wUVv5",
  },
  {
    kind: "qa",
    question: "¿Venden al mayor?",
    answer:
      "Sí, trabajamos al mayor y al detal. Si eres taller, distribuidor o compras en volumen, un asesor humano te atenderá condiciones y lista de precios mayorista.",
  },
  {
    kind: "qa",
    question: "¿Cómo pido una cotización?",
    answer:
      "Envíanos: 1) marca, modelo y año del vehículo, 2) nombre del repuesto o foto/número de parte, 3) cantidad. Con eso verificamos stock y te pasamos precio y forma de entrega.",
  },
  {
    kind: "qa",
    question: "¿Tienen amortiguadores Gabriel?",
    answer:
      "Manejamos línea de suspensión y amortiguadores, incluyendo marcas reconocidas como Gabriel según aplicación del vehículo. Indica marca, modelo, año y si es delantero o trasero para confirmar disponibilidad.",
  },
  {
    kind: "qa",
    question: "¿Puedo retirar en tienda?",
    answer:
      "Sí, puedes retirar en nuestra sede de Santa Mónica en horario de lunes a viernes, 8:00 a.m. a 5:00 p.m. Te avisamos cuando tu pedido esté listo para pickup.",
  },
];

export async function seedWorldCarsAgent(
  db: Db,
  organizationId: string,
  opts: { replaceKb?: boolean; enableAgent?: boolean } = {}
): Promise<{ kbEntries: number; profileUpdated: boolean }> {
  const { replaceKb = false, enableAgent = true } = opts;

  const existingKb = await db
    .select({ id: schema.kbEntry.id })
    .from(schema.kbEntry)
    .where(eq(schema.kbEntry.organizationId, organizationId));

  if (existingKb.length > 0 && !replaceKb) {
    throw new Error(
      `La organización ya tiene ${existingKb.length} entrada(s) en KB. Usa --replace-kb para reemplazarlas.`
    );
  }

  if (replaceKb && existingKb.length > 0) {
    await db
      .delete(schema.kbEntry)
      .where(eq(schema.kbEntry.organizationId, organizationId));
  }

  for (const entry of WORLD_CARS_KB) {
    await db.insert(schema.kbEntry).values({
      id: newId("kbEntry"),
      organizationId,
      kind: entry.kind,
      question: entry.kind === "qa" ? entry.question : null,
      answer: entry.kind === "qa" ? entry.answer : null,
      content: entry.kind === "block" ? entry.content : null,
    });
  }

  const updated = await db
    .update(schema.agentProfile)
    .set({
      ...WORLD_CARS_AGENT,
      enabled: enableAgent,
      updatedAt: new Date(),
    })
    .where(eq(schema.agentProfile.organizationId, organizationId))
    .returning({ id: schema.agentProfile.id });

  return {
    kbEntries: WORLD_CARS_KB.length,
    profileUpdated: updated.length > 0,
  };
}
