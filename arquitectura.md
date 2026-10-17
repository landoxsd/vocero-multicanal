# 🏛️ Vocero CRM — Resumen de Arquitectura y Guía Técnica

## 1. Visión General del Proyecto
**Vocero CRM** es una plataforma de CRM y atención al cliente omnicanal **self-hosted** con agente de Inteligencia Artificial integrado. Centraliza conversaciones de mensajería en una bandeja de entrada multi-agente (`/inbox`), gestiona prospectos en un tablero Kanban (`/pipeline`) y permite automatizar respuestas mediante LLMs con transferencia a operadores humanos (*Handoff*).

---

## 2. Stack Tecnológico

| Capa | Tecnología |
|---|---|
| **Frontend & Core API** | Next.js 15 (App Router) + React 19 + TypeScript (`strict` + `noUncheckedIndexedAccess`) |
| **Estilos & UI** | Tailwind CSS (tema oscuro propio, acento WhatsApp `#25D366`), Lucide Icons, Radix UI / dnd-kit |
| **Base de Datos** | PostgreSQL 16 + Drizzle ORM (migraciones versionadas en `drizzle/`) |
| **Autenticación** | Better Auth (soporte multi-tenant con plugin `organization`) |
| **Microservicio WhatsApp Web** | Node.js + Express + `whatsapp-web.js` (Puppeteer/Chromium) + WebSockets (`ws`) |
| **IA / LLMs** | Google Gemini (nativo vía `GEMINI_API_KEY`, default: `gemini-3.6-flash`) y/o OpenRouter |
| **Tiempo Real** | SSE (Server-Sent Events) hacia el navegador (`/api/events`), WebSockets + Webhooks internos entre microservicios |
| **Infraestructura / Deploy** | Docker multi-stage, Docker Compose + Caddy (Ruta B) o despliegue en Coolify (Ruta A) |
| **Testing** | Vitest (unit tests) + Playwright / Mocks de desarrollo (`scripts/e2e-selftest.mjs`) |

---

## 3. Diagrama de Arquitectura del Sistema

```text
               ┌────────────────────────────────────────────────────────┐
               │                   CANALES EXTERNOS                     │
               │  WhatsApp Web (QR)  │  WhatsApp Cloud (Meta)  │  IG/ML │
               └───────────┬──────────────────────┬─────────────────────┘
                           │                      │
            (Puppeteer)    │                      │ (Meta Webhooks)
                           ▼                      │
             ┌───────────────────────────┐        │
             │   whatsapp-web-manager    │        │
             │ (Microservicio Node :3005)│        │
             └─────────────┬─────────────┘        │
                           │                      │
           (HTTP Webhook / │                      │
            WebSocket /ws) │                      │
                           ▼                      ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                           VOCERO CRM (Next.js 15)                        │
  │                                                                          │
  │  [Ingesta / Webhooks]  ──────▶  [Drizzle ORM / Postgres]                 │
  │          │                                   │                           │
  │          ▼                                   ▼                           │
  │  [AI Agent Pipeline]                [Event Bus (SSE)]                    │
  │  (Gemini / OpenRouter)                       │                           │
  │          │                                   ▼                           │
  │          ▼                        [Frontend React 19 UI]                 │
  │  [Router de Salida] ─────▶ (/inbox, /pipeline, /contacts)                │
  └──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Componentes y Flujos Clave

### A. Core de la Aplicación (`src/`)
* **`src/app/(app)/`**: Vistas autenticadas de la app:
  * `inbox/`: Bandeja de entrada en tiempo real con selector de canal y visor de adjuntos.
  * `pipeline/`: Tablero Kanban de leads/etapas comerciales.
  * `contacts/`: Gestión y búsqueda de contactos.
  * `settings/`: Configuración de canales (QR, Meta Cloud API, etc.).
* **`src/server/inbox/`**: Ingesta idempotente (`ingest.ts`), resolución de identidad (`identity.ts`) y enrutamiento de salida (`send.ts`).
* **`src/server/channels/`**: Adaptadores omnicanal (`whatsapp-web`, `instagram`, `mercadolibre`, etc.).
* **`src/lib/db/`**: Esquema Drizzle (`schema.ts`) y aislamiento multi-tenant (`tenant.ts` con helper `scoped()`).

### B. Microservicio WhatsApp Web (`services/whatsapp-web-manager/`)
* Servicio independiente en Node.js que levanta instancias de Chromium headless mediante `whatsapp-web.js`.
* Corre en el puerto **`3005`** (`http://whatsapp-web-manager:3005` o `localhost:3005`).
* Expone API REST para inicializar sesión (`/api/sessions/start`), generar QR, sincronizar chats (`/api/sessions/:id/chats`) y enviar mensajes (`/api/send-message`).
* Se comunica bidireccionalmente con Next.js mediante **WebSockets** (`/ws/events`) y **Webhooks HTTP** (`/api/webhooks/whatsapp-web`) con autenticación `WA_WEB_WEBHOOK_SECRET`.

### C. Pipeline de IA y Sandbox (`src/server/ai/` y `src/server/lab/`)
* Soporta **Google Gemini** y **OpenRouter** a través de una interfaz unificada `chatJson<T>`.
* **Coalescing:** Agrupa ráfagas de mensajes del usuario antes de invocar al LLM (`AGENT_COALESCE_MS`).
* **Tool Calling / Actions:** El agente puede consultar stock, mover etapas del pipeline, agendar citas o disparar `handoff` a un asesor humano.
* **Laboratorio de Evaluación:** Entorno de pruebas (`/lab`) con personas sintéticas y un juez LLM evaluador. Conversaciones marcadas con `is_test: true` tienen guardrails estrictos para jamás enviar mensajes a canales reales.

### D. Superficie de Bot Externo (`/api/bot/*`)
* Endpoint asegurado por `BOT_API_KEY` (`X-API-Key`) que permite conectar bots o agentes externos sin exponer las credenciales de WhatsApp ni salir del CRM.

---

## 5. Reglas de Dominio y Datos

1. **Multi-Tenancy Obligatorio:** Toda tabla de negocio tiene `organization_id NOT NULL`. Cualquier query de base de datos debe ejecutarse con `scoped(orgId)`.
2. **Identidad de Contacto Normalizada:**
   * La clave única es `contact.wa_identity` (normalizado por dígitos numéricos `58...` o `bsuid:<id>` en Meta).
   * El campo `phone` es **opcional**; nunca asumas que un contacto siempre tiene número de teléfono tradicional.
3. **Cifrado de Secretos:** API keys, tokens de Meta y secretos de webhook se guardan cifrados en base de datos con AES-256-GCM (`src/lib/crypto`).
4. **Idempotencia:** Deduplicación de mensajes por `wa_message_id` / `external_message_id`.

---

## 6. Mapa de Archivos para Modificaciones

| Si necesitas modificar... | Archivo / Carpeta principal |
|---|---|
| Cerebro / Modelos LLM | `src/lib/ai/` (Gemini & OpenRouter) |
| Prompt & Comportamiento del Agente | `src/server/ai/prompts.ts` |
| Herramientas / Acciones del Agente | `src/server/ai/actions.ts` y `src/server/ai/pipeline.ts` |
| Microservicio WhatsApp Web | `services/whatsapp-web-manager/` (`server.js`, `WhatsAppMultiManager.js`) |
| Integración WhatsApp Cloud (Meta) | `src/lib/meta/` y `src/server/whatsapp/` |
| Esquema de Base de Datos | `src/lib/db/schema.ts` (ejecutar `pnpm db:generate`) |
| Router de Envío Saliente | `src/server/inbox/send.ts` |
| Interfaz de Usuario (UI) | `src/components/` y `src/app/(app)/` |

---

## 7. Comandos de Desarrollo y Verificación

```bash
# Instalar dependencias
pnpm install

# Levantar frontend/backend Next.js (puerto 3000)
pnpm dev

# Levantar microservicio de WhatsApp Web (puerto 3005)
cd services/whatsapp-web-manager && npm install && npm start

# Base de datos (Drizzle)
pnpm db:generate   # Genera migraciones SQL
pnpm db:migrate    # Aplica migraciones a Postgres

# Verificación de Código (Definition of Done)
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
