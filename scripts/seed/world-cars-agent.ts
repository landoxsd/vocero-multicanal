/**
 * Configura el agente de IA para Repuestos World Cars / Corporación RWC.
 *
 * Uso:
 *   pnpm seed:world-cars
 *   pnpm seed:world-cars -- --replace-kb    # borra KB existente y carga la de World Cars
 *   pnpm seed:world-cars -- --no-enable     # no enciende el toggle del agente
 */
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { seedWorldCarsAgent } from "@/server/seed/world-cars";

function loadEnvVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const env = readFileSync(".env", "utf8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim();
  } catch {
    return undefined;
  }
}

const url = loadEnvVar("DATABASE_URL");
if (!url) {
  console.error("[world-cars] DATABASE_URL no está definida");
  process.exit(1);
}

const replaceKb = process.argv.includes("--replace-kb");
const enableAgent = !process.argv.includes("--no-enable");

const sql = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(sql, { schema });

const orgs = await db.select().from(schema.organization).limit(1);
const org = orgs[0];
if (!org) {
  console.error("[world-cars] No hay organización. Regístrate primero en la app.");
  await sql.end();
  process.exit(1);
}

try {
  const result = await seedWorldCarsAgent(db, org.id, { replaceKb, enableAgent });
  console.log(
    `[world-cars] Agente configurado para "${org.name}": ${result.kbEntries} entradas KB, perfil actualizado=${result.profileUpdated}, enabled=${enableAgent}`
  );
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[world-cars] ${msg}`);
  await sql.end();
  process.exit(1);
}

await sql.end();
process.exit(0);
