# Vocero CRM — Guía para Claude

Este repo es un **fork de Vocero** (MIT): CRM self-hosted convertido en
**atención unificada omnicanal** con agente de IA integrado. Una instancia =
un negocio. WhatsApp se opera por **Cloud API** y/o por **WhatsApp Web +
Puppeteer** (`services/whatsapp-web-manager/`), con mejoras propias de este
fork (identidad, sync, outbound, Gemini). Este archivo guía a Claude Code (u
otro asistente) para **modificar** el repositorio.

No trates el código omnicanal como una violación del Vocero original: la
constitución vigente es **2.0.0**.

## Stack

**Next.js 15 (App Router) + React 19** en monolito · TypeScript estricto
(`strict` + `noUncheckedIndexedAccess`) · Tailwind CSS (tema oscuro propio,
acento `#25D366`) · **PostgreSQL + Drizzle ORM** (migraciones versionadas en
`drizzle/`, aplicadas al ARRANCAR el contenedor) · **Better Auth** + plugin
organization · **Zod** en todo input externo · nanoid con prefijos (`ct_`,
`cv_`, `msg_`…) · pnpm · Vitest (unit) + guiones E2E en `tests/e2e/`
conducidos con Playwright · Docker multi-stage (standalone, healthcheck
`/api/health`) · deploy en Coolify (Ruta A) o docker compose + Caddy (Ruta B).

Tiempo real hacia el **navegador** por **SSE** (`/api/events`): heartbeat
`: ping` ~25s, headers anti-buffering, catch-up por refetch con `since=`. El
trabajo en segundo plano (agente, Laboratorio) es in-process, sin colas
externas. Entre el CRM y el manager de WhatsApp Web, en red privada, se
permite polling o transporte interno (el compose aún no orquesta el manager:
trátalo como deuda operativa, no como señal de que el canal no existe).

## Mapa del código (fronteras de modificación)

| Quieres cambiar… | Toca… |
|---|---|
| El cerebro/proveedor LLM | `src/lib/ai/` (`chatJson<T>`: Gemini nativo y/o OpenRouter) |
| El comportamiento/prompt del agente | `src/server/ai/prompts.ts` |
| Las acciones que puede tomar el agente | `src/server/ai/actions.ts` + ejecución en `src/server/ai/pipeline.ts` |
| Las personas o el juez del Laboratorio | `src/server/lab/personas.ts` · `src/server/lab/judge.ts` |
| WhatsApp Cloud API (Graph) | `src/lib/meta/` + `src/server/whatsapp/` |
| WhatsApp Web / Puppeteer | `services/whatsapp-web-manager/` + `src/server/channels/whatsapp-web/` |
| Orquestación omnicanal | `src/server/channels/omnichannel-manager.ts` + `src/server/channels/types.ts` |
| IG / MeLi / Messenger | adaptadores en `src/server/channels/{instagram,mercadolibre,facebook}/` — no están entregados hasta estar cableados de punta a punta |
| Campos/tablas | `src/lib/db/schema.ts` → `pnpm db:generate` → migración nueva en `drizzle/` |
| Ingesta/envío Cloud API | `src/server/inbox/` (ingest idempotente, send con sandbox; ventana 24h **solo** Cloud) |
| Envío que elige canal | `src/server/inbox/send.ts` (Graph vs `omniChannelManager`) |
| Cómo se identifica a un contacto | `src/server/inbox/identity.ts` + normalización por dígitos en el camino Web |
| Conectar TU propio bot en vez del agente | `src/app/api/bot/*` + `src/server/bot/auth.ts` (X-API-Key) |
| UI | `src/components/` + `src/app/(app)/` (canales: `settings/channels`) |

Los mocks del entorno de pruebas viven en `src/app/api/dev/` (wa-mock +
ai-mock) tras un gate único (`src/lib/dev-guard.ts`): 404 incondicional en
producción.

**Identidad de contacto**: en Cloud API, Meta migra de teléfono a
Business-Scoped User IDs; `from` puede no venir. La llave estable es
`contact.wa_identity` (teléfono normalizado 521→52, o `bsuid:<id>`); `phone`
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

Ver [.specify/memory/constitution.md](.specify/memory/constitution.md) (v2.0.0).

- **Soberanía (II)**: self-hosted. Canales solo por adaptadores. LLM solo por
  `lib/ai` (Gemini y/o OpenRouter). PROHIBIDO S3/R2, email, Stripe, Google
  como Drive/Gmail/login. El manager de WhatsApp Web es el único sitio del
  cliente no oficial. Ventana 24 h / plantillas: Cloud API, no Web.
- **Seguridad (I)**: secretos cifrados en reposo (AES-256-GCM, `lib/crypto`);
  jamás al cliente ni a logs. Webhook interno WA Web: `X-Webhook-Secret` contra
  `WA_WEB_WEBHOOK_SECRET`.
- **Multi-tenancy (III)**: `organization_id` NOT NULL; toda query de dominio
  pasa por `scoped()` (`src/lib/db/tenant.ts`), incluida la ingesta omnicanal.
- **Idempotencia (IV)**: dedup por id externo del canal (`wa_message_id` /
  `externalMessageId`); estados monotónicos; seeds y migraciones re-ejecutables.
- **Sandbox del Laboratorio**: las conversaciones `is_test` JAMÁS tocan un
  canal real — el sender lanza excepción (no lo "arregles": es un guardrail).
- **Foco (VIII)**: atención unificada de UN negocio. No broadcast, no scraping,
  no builder visual de flujos.

## Variables de entorno

Ver `.env.example` (cada una con guía inline). Las claves: `APP_BASE_URL`,
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` (32 bytes base64),
`META_WEBHOOK_VERIFY_TOKEN` (segmento secreto del webhook Cloud API),
`META_APP_SECRET` (opcional, firma), `WA_WEB_MANAGER_URL` (default
`http://127.0.0.1:3005`), `WA_WEB_WEBHOOK_SECRET` (webhook interno del
manager), `WA_WEB_MANAGER_API_KEY` (API del manager), y para IA (cualquiera
de las dos, o ambas):

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

## Definición de Hecho REFORZADA (obligatoria)

"Typecheck + lint + build (+ tests)" es el piso, NO el techo. Una feature no
está "Hecha" hasta correr el **self-test de COMPORTAMIENTO de punta a punta**
y dejarlo verde: flujo real como usuario, resultado observable, y el camino
infeliz degradando sin colgarse. Prohibido delegar la prueba al usuario.

- Camino Cloud API / UI original: Playwright + mocks (`WA_MOCK_ENABLED=true`,
  `META_GRAPH_BASE_URL` → wa-mock, `OPENROUTER_BASE_URL` → ai-mock).
- Camino WhatsApp Web: sesión controlada, allowlist, anti-flood (Principio IX).
  No dispares ráfagas contra números reales.

Si algo depende de un LLM, todo turno tolera formato inesperado con extracción
robusta + reintentos — un hipo del proveedor nunca tumba el turno. Al detectar
un fallo: diagnostica, corrige y re-verifica tú mismo hasta verde.

Gate técnico:

```bash
pnpm typecheck && pnpm lint && pnpm build && pnpm test
```

Guiones E2E por historia en `tests/e2e/*.md`. Parte de ellos ya están
automatizados: con la app viva y los mocks encendidos, `pnpm test:e2e`
(`scripts/e2e-selftest.mjs`) los conduce contra la app real y sale distinto de
cero si algo falla. Al agregar una historia, extiende el arnés en vez de dejar
solo el `.md`.

## Modo Objetivo — Loop SDD

Cuando el dueño da una META (no prompts paso a paso): Discover → Plan →
Execute → Verify → Iterate, de forma autónoma, volviendo solo con el objetivo
verificado en vivo o con un bloqueo real (decisión de producto, credenciales,
acción irreversible/costosa). Agrupa TODAS las preguntas bloqueantes al inicio.
El estado durable son los artefactos SDD en `specs/` (spec/plan/tasks) —
manténlos al día. Invocable como `/loop-sdd <objetivo>`.

## Memoria persistente

Memoria de archivos en `memory/` (índice `memory/MEMORY.md`, cargado por
sesión). Persiste decisiones, gotchas y correcciones; no dupliques lo que el
repo ya registra. Los subagentes con `memory: project` usan
`.claude/agent-memory/`.

## Arquitectura de agentes

1. **Orquestador** = la sesión principal de Claude Code (este CLAUDE.md + skill
   `loop-sdd`).
2. **Subagentes** (`.claude/agents/`): `deploy-ops` (deploy/logs/healthchecks,
   no escribe código de app) · `public-site-builder` (páginas públicas/legales
   y config de paneles externos).
