#!/usr/bin/env node
/**
 * Diagnóstico CRM → whatsapp-web-manager (ejecutar dentro del contenedor Coolify).
 *
 * Uso:
 *   node scripts/test-wa-web-manager-connectivity.mjs
 *   node scripts/test-wa-web-manager-connectivity.mjs false_CHATID_MSGID
 *
 * Variables: WA_WEB_MANAGER_URL, WA_WEB_MANAGER_API_KEY (opcional).
 */
const managerUrl = (process.env.WA_WEB_MANAGER_URL || "http://127.0.0.1:3005").replace(
  /\/$/,
  ""
);
const apiKey = process.env.WA_WEB_MANAGER_API_KEY?.trim();
const testMessageId = process.argv[2]?.trim();

function headers() {
  const h = { Accept: "application/json" };
  if (apiKey) h["x-api-key"] = apiKey;
  return h;
}

async function probe(label, url, init = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, { ...init, headers: { ...headers(), ...init.headers } });
    const ms = Date.now() - started;
    const body = await res.text();
    console.log(`✓ ${label}`);
    console.log(`  URL: ${url}`);
    console.log(`  HTTP ${res.status} (${ms}ms)`);
    if (body) console.log(`  Body: ${body.slice(0, 300)}`);
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    const ms = Date.now() - started;
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`✗ ${label}`);
    console.error(`  URL: ${url}`);
    console.error(`  Error (${ms}ms): ${reason}`);
    return { ok: false, error: reason };
  }
}

console.log("=== Vocero CRM → WA Web Manager ===\n");
console.log(`WA_WEB_MANAGER_URL = ${managerUrl}`);
console.log(`WA_WEB_MANAGER_API_KEY = ${apiKey ? "(configurada)" : "(no configurada)"}\n`);

const health = await probe("Health del manager", `${managerUrl}/health`);
const sessions = await probe("Listado de sesiones", `${managerUrl}/api/sessions`);

let workingSession = null;
if (sessions.ok && sessions.body) {
  try {
    const parsed = JSON.parse(sessions.body);
    const list = Array.isArray(parsed) ? parsed : parsed.sessions || [];
    workingSession = list.find((s) => s.status === "WORKING");
    if (workingSession) {
      console.log(`\nSesión WORKING: ${workingSession.sessionId}`);
    } else {
      console.log("\n⚠ No hay sesión WORKING — las imágenes no se pueden descargar.");
    }
  } catch {
    /* ignore */
  }
}

if (testMessageId) {
  const encoded = encodeURIComponent(testMessageId);
  await probe(
    "Descarga de media (GET /api/media)",
    `${managerUrl}/api/media/${encoded}`
  );
} else if (workingSession) {
  console.log(
    "\nTip: pasa un externalMessageId de un mensaje con imagen para probar descarga:"
  );
  console.log(
    "  node scripts/test-wa-web-manager-connectivity.mjs 'false_...@c.us_ABC123'"
  );
}

const failed = !health.ok || health.error;
if (failed) {
  console.log("\n=== DIAGNÓSTICO ===");
  console.log(
    "El CRM no alcanza el manager. En Coolify, configura WA_WEB_MANAGER_URL con la IP/host"
  );
  console.log(
    "donde corre el manager (p. ej. http://192.168.1.58:3005 o http://host.docker.internal:3005)."
  );
  console.log(
    "127.0.0.1 apunta al propio contenedor del CRM, no al host donde corre Puppeteer."
  );
  process.exit(1);
}

console.log("\nConectividad básica OK.");
