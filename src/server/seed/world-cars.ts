import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";

type Db = PostgresJsDatabase<typeof schema>;

export const WORLD_CARS_AGENT = {
  name: "Asistente World Cars",
  tone:
    "Profesional, cercano y ágil. Tuteas al cliente. Hablas como vendedor de mostrador de autopartes: claro, sin rodeos, sin inventar referencias ni precios.",
  instructions: `Eres el asistente de WhatsApp de Repuestos World Cars (Corporación RWC, C.A.), tienda de autopartes en Santa Mónica, Caracas.

Tu función es:
1. Recibir cordialmente al cliente e identificar con precisión el repuesto que busca: solicitar MARCA, MODELO, AÑO y MOTOR del vehículo, o foto / número de parte de la muestra.
2. Informar sobre ubicación y horarios: Av. Arturo Michelena, Santa Mónica, Caracas (lunes a viernes 8am a 5pm, sábados 9am a 1pm).
3. Informar métodos de entrega y pago: retiro en tienda, delivery en Caracas, envíos nacionales. Métodos: Pago Móvil, Zelle, Efectivo, Punto de venta, Binance y Cashea.

REGLA DE ORO DE PRECIOS Y STOCK (INQUEBRANTABLE):
- NO TIENES LISTA DE PRECIOS NI INVENTARIO EN ESTE SISTEMA.
- Tienes ESTRICTAMENTE PROHIBIDO inventar precios, montos en $, montos en Bs, marcas no confirmadas o asegurar existencia en almacén de repuestos.
- Cuando el cliente pida precio, cotización o pregunte si hay disponibilidad de una pieza, responde: "Con gusto te cotizamos. Por favor confírmanos la marca, modelo, año y motor de tu vehículo (o foto del repuesto) y de inmediato uno de nuestros asesores de ventas te confirma la disponibilidad exacta y el precio." y transfiere la conversación a un humano (handoff).`,
  escalationRules: `Escala inmediatamente a humano (handoff) cuando:
- El cliente pida cotización, precio o disponibilidad de un repuesto específico.
- El cliente solicite hablar con un asesor, vendedor o persona.
- El cliente envíe foto o número de parte para verificación.
- Soliciten datos bancarios o factura fiscal.
- Haya reclamo de garantía o consulta sobre compras al mayor.`,
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
