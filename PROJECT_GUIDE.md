# Vocero CRM Multicanal — Guía Maestra de Proyecto y Arquitectura

Documento técnico y de gestión para guiar al equipo de desarrollo, DevOps y producto.

---

## 1. Resumen Ejecutivo y Objetivos

### ¿Qué es Vocero CRM?
**Vocero CRM** es una plataforma de **atención al cliente, ventas y CRM omnicanal con Inteligencia Artificial** diseñada para centralizar conversaciones de múltiples canales de mensajería (WhatsApp Web vía QR, WhatsApp Cloud API oficial de Meta, Instagram Direct, MercadoLibre Preguntas/Post-venta y Facebook Messenger) en una única bandeja de entrada multi-agente con pipeline de ventas y soporte de agentes autónomos de IA.

---

## 2. Metas del Negocio

1. **Unificación de Canales:** Centralizar la atención de múltiples vendedores y números de teléfono en una sola plataforma web multi-agente.
2. **Independencia de la API de Meta:** Permitir operar tanto con cuentas de WhatsApp normales vinculadas por código QR (sin costos por plantilla ni restricciones de 24 horas) como con la API oficial de Meta para líneas corporativas masivas.
3. **Automatización con Inteligencia Artificial:** Responder consultas frecuentes de inventario, precios y calificar prospectos automáticamente mediante modelos de lenguaje (OpenRouter / Claude / GPT) antes de transferir a un asesor humano (*Handoff*).
4. **Seguimiento del Embudo (Pipeline):** Todo contacto que escribe genera automáticamente un *Lead* en el tablero Kanban para medir conversión, clientes perdidos y ventas cerradas.

---

## 3. Estado Actual y Diagnóstico Técnico

### Lo que ya está funcionando y probado:
- ✅ **Bandeja de Entrada Multi-canal (`/inbox`):** Renderiza conversaciones, contactos, estados de lectura, etiquetas de etapa e historial de mensajes.
- ✅ **Envío de Mensajes Salientes:** Tanto texto como medios multimedia salen correctamente desde la bandeja hacia WhatsApp Web y son entregados al cliente con doble check.
- ✅ **Desbloqueo de Ventana de 24h:** La restricción de Meta no bloquea a las líneas de WhatsApp Web.
- ✅ **Ingesta Masiva y Sincronización de Chats:** Al conectar la sesión, se extraen automáticamente todos los contactos y chats con sus números reales (+58...).
- ✅ **Normalización de Identidad:** Coincidencia exacta por dígitos numéricos de teléfono para evitar duplicidad de contactos.

### Desafío Actual: Tiempo Real Inmediato en WhatsApp Web
- **Situación:** Cuando el cliente responde desde su teléfono, el mensaje se almacena en la sesión del navegador virtual (Puppeteer), pero el evento "en vivo" no llega de forma instantánea al CRM en tiempo real a menos que se refresque o se ejecute la sincronización periódica.
- **Causa Raíz:** En entornos Dockerizados (Coolify), el contenedor de `whatsapp-web-manager` corre en una red aislada y el envío de webhooks HTTP salientes hacia el contenedor Next.js requiere o bien **WebSockets dedicados**, **red compartida de Docker (`host` o red interna común)**, o **polling continuo** entre el CRM y el manager.

---

## 4. Estructura del Código y Componentes

El proyecto se organiza bajo una arquitectura modular limpia en TypeScript:

```text
VOCERO CRM/
├── src/
│   ├── app/                      # Next.js 15 App Router (Frontend + API Routes)
│   │   ├── (app)/                # Vistas de la aplicación autenticada
│   │   │   ├── inbox/            # Bandeja de entrada en tiempo real
│   │   │   ├── pipeline/         # Tablero Kanban de ventas
│   │   │   ├── contacts/         # Libreta y búsqueda de contactos
│   │   │   ├── agent/            # Configuración del bot / IA
│   │   │   └── settings/         # Ajustes de canales, equipo y marca
│   │   └── api/                  # Endpoints REST y Webhooks
│   │       ├── channels/         # Gestión de líneas y sesiones QR
│   │       ├── conversations/    # CRUD de conversaciones y mensajes
│   │       ├── events/           # Server-Sent Events (SSE) para tiempo real
│   │       └── webhooks/         # Receptores de WhatsApp Web, Meta, MeLi, IG
│   ├── components/               # Componentes UI en React 19 (Tailwind + Radix)
│   │   ├── inbox/                # Composer, Thread, ConversationList, ContactPanel
│   │   ├── pipeline/             # Columnas Kanban, Drag-and-Drop, Leads
│   │   └── channels/             # Modal de escaneo QR y estado de conexión
│   ├── lib/                      # Base de datos y utilidades compartidas
│   │   ├── db/                   # Esquema Drizzle ORM y cliente PostgreSQL
│   │   └── auth/                 # Autenticación multi-inquilino con BetterAuth
│   └── server/                   # Lógica de negocio del servidor
│       ├── ai/                   # Pipeline de IA (Prompting, OpenRouter, Juez)
│       ├── channels/             # Adaptadores de canales (WhatsApp Web, IG, MeLi)
│       └── inbox/                # Ingesta, envío y reglas de negocio
├── services/
│   └── whatsapp-web-manager/     # Microservicio Node.js autónomo
│       ├── WhatsAppMultiManager.js # Motor WPPConnect / Puppeteer multi-sesión
│       ├── InstagramManager.js    # Motor Instagram Direct (Private API)
│       ├── MercadoLibreManager.js # Conector API oficial MercadoLibre
│       └── server.js             # Servidor Express con endpoints de control y QR
├── Dockerfile                    # Multi-stage build para Next.js Standalone
└── docker-compose.yml            # Orquestación (App + PostgreSQL + Caddy)
```

---

## 5. Stack Tecnológico y Lenguajes

| Capa | Tecnología | Propósito |
| :--- | :--- | :--- |
| **Framework Web** | Next.js 15 (App Router, Node.js 22) | Renderizado híbrido SSR/Cliente y API Routes |
| **Lenguaje** | TypeScript 5.8 | Tipado estricto en todo el flujo de datos |
| **Base de Datos** | PostgreSQL 16 + Drizzle ORM | Persistencia relacional, esquemas y migraciones |
| **UI / Estilos** | Tailwind CSS + Lucide Icons + Radix UI | Interfaz rápida, responsiva y accesible |
| **Autenticación** | Better-Auth | Sesiones seguras multi-organización |
| **Gestor Omnicanal** | Puppeteer + WPPConnect Core | Emulación de WhatsApp Web multi-sesión con almacenamiento `LocalAuth` |
| **Tiempo Real** | Server-Sent Events (SSE) + EventBus | Transmisión de eventos `message.new` al navegador |
| **IA / LLM** | OpenRouter (Claude 3.5 Sonnet / GPT-4o) | Generación de respuestas y extracción de datos clave |
| **Despliegue** | Docker + Coolify + Caddy | CI/CD automático y proxy HTTPS inverso |

---

## 6. Competencias y Skills Requeridos para el Equipo

Para operar y extender esta base de código, el equipo debe dominar:

1. **Frontend Moderno:** React 19, Hooks avanzados (`useMemo`, `useCallback`, `useRef`), Tailwind CSS y consumo de SSE.
2. **Backend & Base de Datos:** Next.js Server Components, Drizzle ORM, consultas SQL relacionales complejas y diseño de migraciones.
3. **Automatización Web y Scraping:** Node.js, Puppeteer/Chromium headless, depuración del DOM de WhatsApp Web e inyección de scripts IndexedDB.
4. **Infraestructura y DevOps:** Docker Compose, redes internas de Docker (`bridge` vs `host`), Coolify y variables de entorno seguras.
5. **Prompt Engineering & Agentes IA:** Manejo de llamadas a APIs de LLMs estructuradas (JSON Schema), control de temperatura y diseño de prompts de ventas con *fallback* a humanos.

---

## 7. Hoja de Ruta (Roadmap) y Próximos Pasos

### Fase 1: Perfeccionar Tiempo Real en WhatsApp Web (Inmediato)
- [ ] **Socket / Long-Polling bidireccional:** Configurar un canal de WebSockets o un worker interno en Next.js para escuchar eventos directos del `whatsapp-web-manager` sin depender de webhooks HTTP externos en Docker.
- [ ] **Reconexión Automática Silenciosa:** Si la sesión de WhatsApp Web se desconecta por inactividad, intentar reanudar la sesión usando las cookies de `LocalAuth` sin requerir re-escaneo del código QR.

### Fase 2: Activación de Canales Restantes
- [ ] **Instagram Direct:** Habilitar el módulo `InstagramManager.js` para recibir DMs y respuestas a historias.
- [ ] **MercadoLibre:** Conectar el Webhook oficial de MercadoLibre para responder preguntas en menos de 2 minutos y mensajes post-venta.

### Fase 3: Potenciar el Agente de Inteligencia Artificial
- [ ] **Base de Conocimiento (RAG):** Subida de PDFs y catálogos de productos para que la IA responda con datos exactos de stock y precios.
- [ ] **Cierre de Ventas Automatizado:** Capacidad de la IA de solicitar datos de facturación y generar enlaces de pago de forma autónoma.
