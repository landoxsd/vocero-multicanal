# Vocero CRM — Guía para Claude

Este repo es un **fork omnicanal de Vocero** (MIT): CRM self-hosted con atención
unificada (WhatsApp Cloud API, WhatsApp Web por QR, Instagram, Messenger, TikTok,
MercadoLibre), motor de citas, analíticas y agente de IA integrado (OpenRouter,
OpenAI-compatible o Gemini nativo). Una instancia = un negocio. Lee también [AGENTS.md](AGENTS.md):
el mapa del código y las reglas de modificación viven ahí; este archivo añade lo
específico para Claude Code.

## Stack

**Next.js 15 (App Router) + React 19** en monolito · TypeScript estricto
(`strict` + `noUncheckedIndexedAccess`) · Tailwind CSS (sistema de diseño de la
marca Vocero: tokens en `src/app/globals.css`, tema claro/oscuro, acento white-label
por defecto `#0d5bff`, fuentes Archivo + Instrument Serif + IBM Plex Mono self-hosted
vía `next/font`; el logo vive en `src/lib/brand.ts` y se dibuja con `src/components/brand-mark.tsx`) ·
**PostgreSQL + Drizzle ORM** (migraciones versionadas en
`drizzle/`, aplicadas al ARRANCAR el contenedor) · **Better Auth** + plugin
organization · **Zod** en todo input externo · nanoid con prefijos (`ct_`,
`cv_`, `msg_`…) · pnpm · Vitest (unit) + guiones E2E en `tests/e2e/`
conducidos con Playwright · Docker multi-stage (standalone, healthcheck
`/api/health`) · deploy en Coolify (Ruta A) o docker compose + Caddy (Ruta B).

Tiempo real hacia el **navegador** por **SSE** (`/api/events`). Entre el CRM y
el manager de WhatsApp Web hay **WebSocket** (`/ws/events`) además del webhook
HTTP de respaldo.

## Mapa del código (fronteras de modificación)

| Quieres cambiar… | Toca… |
|---|---|
| El cerebro/proveedor LLM | `src/lib/ai/` (`chatJson<T>`: Gemini nativo, OpenAI o OpenRouter) |
| El comportamiento/prompt del agente | `src/server/ai/prompts.ts` |
| Las acciones que puede tomar el agente | `src/server/ai/actions.ts` + ejecución en `src/server/ai/pipeline.ts` |
| Las personas o el juez del Laboratorio | `src/server/lab/personas.ts` · `src/server/lab/judge.ts` |
| El canal WhatsApp (Graph API) | `src/lib/meta/` (cliente único) + `src/server/whatsapp/` |
| WhatsApp Web / Puppeteer | `services/whatsapp-web-manager/` + `src/server/channels/whatsapp-web/` |
| Orquestación omnicanal | `src/server/channels/omnichannel-manager.ts` + `src/server/channels/types.ts` |
| Los canales opcionales (Instagram, Messenger, TikTok; ADR-001) | `src/lib/channels.ts` (catálogo) · `src/server/channels/` (capacidades y bandera `CHANNELS`) · `src/server/instagram/` · `src/server/messenger/` · `src/server/tiktok/` · `src/server/zernio/` |
| Campos/tablas | `src/lib/db/schema.ts` → `pnpm db:generate` → migración nueva en `drizzle/` |
| La ingesta/envío de mensajes | `src/server/inbox/` (ingest idempotente, send con guard de sandbox, ventana 24h por canal) |
| Envío que elige canal | `src/server/inbox/send.ts` (Graph/Zernio vs `omniChannelManager`) |
| Cómo se identifica a un contacto | `src/server/inbox/identity.ts` (teléfono normalizado, `bsuid:<id>`, `ig:<id>`, `fb:<id>`, `tt:<id>`) |
| Conectar TU propio bot en vez del agente | `src/app/api/bot/*` + `src/server/bot/auth.ts` (X-API-Key) · quién responde: `src/server/bot/status.ts` + `GET /api/agent/brain-status` |
| La agenda (horarios, huecos, citas) | `src/server/agenda/` — detrás de la bandera `AGENDA` (`flag.ts`) |
| Cómo se entrega la reunión (Zoom, Meet…) | `src/server/agenda/connectors/` + catálogo en `src/lib/agenda-connectors.ts` · guía: [docs/agenda-conectores.md](docs/agenda-conectores.md) |
| De qué anuncio llegó cada conversación | `src/server/attribution/referral.ts` · `creativo.ts` · `store.ts` · tarjeta en `src/components/anuncio-origen.tsx` |
| Los números de Resultados | `src/server/analytics/` (ventas, agente, origen y anuncios, higiene) · UI en `src/components/results/` |
| La atribución de anuncios y CAPI | `src/server/attribution/` — detrás de la bandera `ATRIBUCION` (`flag.ts`) + `src/lib/meta/capi.ts` |
| UI | `src/components/` + `src/app/(app)/` |

Los mocks del entorno de pruebas viven en `src/app/api/dev/` (wa-mock +
ai-mock) tras un gate único (`src/lib/dev-guard.ts`): 404 incondicional en
producción.

**Identidad de contacto**: en Cloud API, Meta migra de teléfono a
Business-Scoped User IDs; `from` puede no venir. La llave estable es
`contact.wa_identity` (teléfono normalizado 521→52, o `bsuid:<id>`, `ig:<id>`, etc.); `phone`
es OPCIONAL. En WhatsApp Web se unifica por dígitos (`+58…` / `58…` /
`@c.us`). Nunca asumas que un contacto tiene teléfono.

**Cerebro externo**: `/api/bot/*` (autenticada por `BOT_API_KEY`) deja que un
microservicio propio conduzca la conversación sin que el token de WhatsApp
salga del CRM. Respeta `conversation.ai_enabled`/`handoff_at` igual que el
agente in-process. Sin la key, esa superficie responde 401.

**Carriles SDD** (Principio VI): ciclo completo si toca modelo de datos o
contrato publicado (`/api/bot/*`, webhooks, SSE, API del manager); carril
ligero = `spec.md` con comportamiento observable; exento = typos/refactors
sin comportamiento nuevo.

## Reglas de la constitución (no negociables)

Ver [.specify/memory/constitution.md](.specify/memory/constitution.md) (v2.1.0).

- **Soberanía (II, omnicanal con conectores)**: self-hosted. Canales oficiales
  (WhatsApp Cloud, Instagram, Messenger, TikTok) y self-hosted (WhatsApp Web vía manager).
  LLM vía `lib/ai` (Gemini, OpenRouter, OpenAI-compatible). Conectores opcionales (Agenda, CAPI)
  tras banderas de despliegue (`AGENDA=on`, `ATRIBUCION=on`), aislados tras adaptadores,
  sin bloquear la operación core si fallan. PROHIBIDO S3/R2, email o billing como dependencia core.
- **Seguridad (I)**: secretos cifrados en reposo (AES-256-GCM, `lib/crypto`);
  jamás al cliente ni a logs. El token de WhatsApp solo muestra sus últimos 4.
  Webhook interno WA Web: `X-Webhook-Secret` contra `WA_WEB_WEBHOOK_SECRET`.
- **Multi-tenancy (III)**: `organization_id` NOT NULL en toda tabla de dominio;
  toda query pasa por `scoped()` de `src/lib/db/tenant.ts`.
- **Idempotencia (IV)**: webhooks dedup por `wa_message_id` / id externo UNIQUE; estados
  monotónicos; seeds y migraciones re-ejecutables.
- **Sandbox del Laboratorio**: las conversaciones `is_test` JAMÁS tocan la API
  real ni el manager — el sender lanza excepción (no lo "arregles": es un guardrail). Lo
  mismo vale para la agenda: una cita de prueba nunca llega a un conector.
- **Módulos opcionales (015, 016)**: lo que no usa toda instancia va detrás de una
  bandera de despliegue, apagado por defecto, con su superficie en 404 y la
  migración aplicada igual. Nunca en una rama aparte.

## Variables de entorno

`pnpm init-env` crea el `.env` con los secretos ya generados y `pnpm doctor`
lo valida con el mismo esquema del arranque (`safeParseEnv` en
`src/lib/env.ts`), prueba la base, `MEDIA_DIR` y el token de WhatsApp.
Ver `.env.example` (cada una con guía inline). Las claves: `APP_BASE_URL`,
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` (32 bytes base64),
`META_WEBHOOK_VERIFY_TOKEN` (segmento secreto del webhook), `META_APP_SECRET`
(opcional, firma), `WA_WEB_MANAGER_URL` (default `http://127.0.0.1:3005`),
`WA_WEB_WEBHOOK_SECRET`, `WA_WEB_MANAGER_API_KEY`. La IA se configura desde la app
(Ajustes → IA: proveedor, modelo y llave cifrada, con «Probar conexión»);
las variables son el respaldo mientras no haya nada guardado ahí:

```bash
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.6-flash
OPENROUTER_API_TOKEN=sk-or-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_JUDGE_MODEL=anthropic/claude-haiku-4.5   # opcional: juez más barato
```

Para el self-test local existe además el modo de pruebas interno (mocks) —
ver `specs/001-vocero-core/quickstart.md`. Nunca actives mocks en producción.
Arquitectura viva del fork: `PROJECT_GUIDE.md`. Specs `001`–`003` describen
el origen Cloud-only, no el mapa actual.

## Manejo de credenciales (obligatorio)

Cuando una feature necesite una variable/credencial nueva: (1) agrégala a
`.env` como placeholder `REEMPLAZA_...` (append), (2) deja guía inline `#` de
cómo obtenerla, (3) resume en el chat y sigue. `.env` está gitignored; para
deploy, las vars van también en la plataforma de hosting (runtime, no build).

## Convenciones de desarrollo

- **Commits atómicos**: un cambio lógico por commit, mensaje descriptivo en español o inglés según contexto (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
- **TypeScript estricto**: nunca `any` sin justificación documentada.
- **Validación en las fronteras**: Zod para toda entrada externa (body, query, headers, webhooks).
- **Traducciones y textos de UI**: todo en español claro y conciso, tono profesional y directo.
