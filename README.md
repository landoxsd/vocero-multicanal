# Vocero CRM

[![CI](https://github.com/kevinrivm/vocero-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/kevinrivm/vocero-crm/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Fork de Vocero: CRM omnicanal de atención unificada con IA integrada.**

Este repositorio parte de [Vocero CRM](https://github.com/kevinrivm/vocero-crm)
(MIT) y lo convierte en una bandeja unificada para varios canales — WhatsApp
por **Cloud API** y por **WhatsApp Web + Puppeteer**, más adaptadores para
Instagram, MercadoLibre y Messenger — con pipeline de ventas, un agente de IA
(Gemini y/o OpenRouter) y el **Laboratorio** original, donde clientes simulados
evalúan al agente antes de que hable con gente real. Una instancia = un
negocio, en tu propio servidor.

¿Ya tienes tu propio agente? Puedes apagar el de Vocero y conectar el tuyo por
la [API de servicio `/api/bot/*`](#-trae-tu-propio-agente): el token de WhatsApp
nunca sale del CRM.

![Bandeja de Vocero CRM](docs/screenshots/bandeja.png)

<p align="center">
  <img src="docs/screenshots/laboratorio.png" width="49%" alt="Laboratorio: reporte con score y hallazgos" />
  <img src="docs/screenshots/pipeline.png" width="49%" alt="Pipeline kanban" />
</p>

> 🎬 **Video-instalador oficial**: próximamente en
> [el canal de Kevin Belier](https://www.youtube.com/@KevinBelier)

## ¿Para quién es?

- **Agencias de IA/automatización** que implementan CRM + agente para sus
  clientes: despliegas una instancia por cliente en su VPS, la configuras y la
  entregas con evidencia de calidad (el reporte del Laboratorio).
- **Negocios** que quieren atender WhatsApp (y el resto de canales conectados)
  con IA sin regalar sus datos a un SaaS: todo corre en tu servidor.

## Features

### 🧪 Laboratorio: el agente se prueba solo

La pieza estelar. Seis clientes simulados —el comprador decidido, el preguntón
de precios, el cliente enojado, el que pregunta lo que no sabes, el que exige
un humano y el que escribe "ke onda si benden pintura"— conversan contra tu
agente REAL en un **sandbox interno que jamás envía mensajes reales**. Un juez
LLM independiente evalúa cada conversación y te entrega:

- un **score 0–100** de qué tan listo está el agente,
- **hallazgos con evidencia** (alucinaciones, huecos del conocimiento, fallas
  de escalado, tono),
- **sugerencias aplicables con un click** al knowledge base,
- e **historial con delta**: re-corre después de cada cambio y mira si mejoraste.

Deja de "esperar que el bot funcione": mídelo.

### 💬 Bandeja unificada

Tres columnas (conversaciones / hilo / contacto). En Cloud API, mensajes
entrantes en ≤2 segundos por SSE, estados enviado/entregado/leído, ventana de
24 horas visible y bloqueada (plantilla aprobada cuando está cerrada). En
WhatsApp Web la ventana de Meta **no aplica**: se envía texto libre y el hilo
se mantiene al día por sync/polling con el manager. Respuestas del agente
marcadas como IA y handoff a humano con un click.

### 📱 WhatsApp Web + Puppeteer

Además del camino oficial de Meta, puedes vincular números por **código QR**
vía el microservicio `services/whatsapp-web-manager/` (whatsapp-web.js /
Chromium). Sesiones persistentes, sync de chats históricos, identidad por
dígitos (`+58` / `58` / `@c.us`). Es un cliente no oficial: úsalo a sabiendas
(ToS de WhatsApp) y con los guardarraíles de prueba (allowlist, anti-flood).
Hoy el manager va en el `docker-compose.yml` de la Ruta B (servicio
`whatsapp-web-manager`, volumen de sesiones persistente).

### 📊 Contactos y pipeline kanban

Cada persona que escribe queda registrada sola y entra al pipeline
(Nuevo → En conversación → Interesado → Cliente → Perdido, editable). Arrastra
tarjetas, busca, agrega notas, archiva. El agente puede mover leads de etapa
cuando detecta intención de compra.

### 🤖 Agente de IA con TU conocimiento

Configura nombre, tono, instrucciones y reglas de escalado; dale conocimiento
en pares pregunta/respuesta y bloques libres. Responde SOLO con lo que sabe,
agrupa ráfagas de mensajes en una respuesta, escala a humano cuando el cliente
lo pide (con detección de respaldo), cuando él lo decide o cuando algo falla.
Proveedor LLM por `src/lib/ai`: **Gemini nativo** (`GEMINI_API_KEY`) y/o
cualquier endpoint OpenRouter-compatible.

### 🔌 Trae tu propio agente

Si prefieres conducir la conversación con tu propio cerebro —un microservicio
tuyo, en tu mismo servidor— apaga el agente de Vocero y habilita la API de
servicio con una `BOT_API_KEY`. Tu bot conversa a través del CRM, así que **el
token de WhatsApp nunca sale de aquí** y todo queda en la bandeja como
cualquier otra conversación.

| Endpoint | Para qué |
|---|---|
| `GET /api/bot/context` | Quién es la persona, su etapa, si un humano tomó la conversación y si la ventana de 24 h sigue abierta |
| `POST /api/bot/messages` | Responder. Sale por el mismo camino que el composer y queda marcado como IA |
| `GET /api/bot/profile` | El perfil del agente y el knowledge base que editaste en la app |
| `PUT /api/bot/ficha` | Guardar lo que tu bot descubre del lead (claves libres: cada negocio califica distinto) |
| `POST /api/bot/handoff` | Devolver la conversación a un humano |
| `POST /api/bot/typing` | Marcar leído y mostrar "escribiendo…" |
| `GET /api/bot/media/{id}` | Descargar un adjunto entrante sin tocar Meta |
| `POST /api/bot/reset` | Reiniciar una conversación de pruebas |

Los 409 vienen tipados (`ai_paused`, `window_closed`, `sandbox_violation`) para
que tu bot sepa si callarse, mandar plantilla o rendirse. El guion de pruebas
está en [`tests/e2e/us-bot-api.md`](tests/e2e/us-bot-api.md).

Agente de referencia: [nea-agent](https://github.com/kevinrivm/nea-agent), MIT.

### 📄 Plantillas · 👥 Multi-usuario · 🔐 Self-hosted

Plantillas con varias variables `{{1}}…{{n}}` y aprobación de Meta
sincronizada; cuentas de equipo creadas por el propietario (el registro público
se cierra tras la primera organización); token de WhatsApp cifrado en reposo
(AES-256-GCM),
webhook de Cloud API autenticado en dos capas. El runtime de este fork incluye
además el manager de WhatsApp Web (Puppeteer) cuando usas ese canal, y Gemini
u OpenRouter si enciendes el agente.

## Requisitos

- Un VPS con Docker (2 GB de RAM bastan) — con o sin [Coolify](https://coolify.io).
- Un dominio apuntando al VPS (Meta exige **https** para webhooks).
- Un número de WhatsApp: **Cloud API** de Meta y/o una sesión de **WhatsApp Web**
  (ver [Conexión](#conexión-del-número-de-whatsapp)).
- Opcional: `GEMINI_API_KEY` y/o una key de [OpenRouter](https://openrouter.ai)
  para el agente y el Laboratorio.

## Instalación (~15 minutos)

### 0. Apunta tu dominio

Crea un registro **A** de `crm.tudominio.com` hacia la IP del VPS y espera a
que resuelva.

### Ruta A — Coolify guiado por IA (recomendada)

Abre tu asistente de IA (p. ej. Claude Code con el MCP de Coolify), pásale el
archivo [`INSTALL-IA.md`](INSTALL-IA.md) y responde 3 preguntas (dominio, token
de OpenRouter opcional, ruta). El asistente crea la base de datos y la app,
genera los secretos y verifica el healthcheck.

### Ruta B — docker compose

```bash
git clone https://github.com/kevinrivm/vocero-crm.git vocero && cd vocero
cp .env.example .env    # rellena: dominio + secretos (cada uno trae su comando openssl)
docker compose up -d --build
```

Caddy emite el certificado HTTPS solo. Verifica con
`https://crm.tudominio.com/api/health` → `{"ok":true}`.

### Primer arranque

1. Entra y **regístrate**: el primer registro crea tu organización y cierra el
   registro público.
2. Opcional: pulsa **"Cargar datos de demostración"** para explorar con la
   **Ferretería El Martillo** (contactos, conversaciones, pipeline, un
   knowledge base con huecos a propósito y una corrida de Laboratorio de
   ejemplo — corre el Laboratorio y mira cómo los encuentra).
3. WhatsApp Cloud API: **Configuración → WhatsApp**. WhatsApp Web (QR):
   **Configuración → Canales**, con el manager en marcha.

## Conexión del número de WhatsApp

Hay dos caminos. Pueden convivir en la misma instancia.

### WhatsApp Web (QR + Puppeteer)

1. Arranca `services/whatsapp-web-manager/` (puerto **3005** por defecto) y
   apunta `WA_WEB_MANAGER_URL` del CRM a esa URL. Configura
   `WA_WEB_WEBHOOK_SECRET` (mismo valor en CRM y manager) y, recomendado,
   `WA_WEB_MANAGER_API_KEY`.
2. En **Configuración → Canales** crea una cuenta WhatsApp Web y escanea el QR.
3. Al conectar o pulsar **Sincronizar**, se importan chats y se unifican
   contactos por dígitos de teléfono.

Este camino no usa la ventana de 24 h ni plantillas de Meta. Es un cliente no
oficial.

### WhatsApp Cloud API

El CRM **consume** un token de la WhatsApp Cloud API — no implementa el
Embedded Signup. Hay dos formas de obtenerlo:

### Modo directo (el negocio tiene su propia app de Meta)

1. Crea una app en [developers.facebook.com](https://developers.facebook.com)
   con el producto WhatsApp y vincula tu número.
2. Crea un **usuario del sistema** (Business Settings → System users) con
   acceso a la WABA y genera un token permanente con permisos
   `whatsapp_business_messaging` y `whatsapp_business_management`.
3. En Vocero: **Configuración → WhatsApp** → pega WABA ID + Phone Number ID +
   token → **Probar conexión** → Guardar.
4. En el panel de Meta (WhatsApp → Configuration → Webhook) pega la **URL del
   webhook** y el **verify token** que Vocero te muestra, y suscribe el campo
   `messages` (y `message_template_status_update` si usarás plantillas).
5. Recomendado: agrega `META_APP_SECRET` (App Secret de tu app) a las
   variables de la instancia para la verificación de firma de cada evento.

### Modo agencia (Tech Provider) — para agencias

Tu plataforma de agencia ya hace el Embedded Signup y guarda los tokens de tus
clientes; la instancia de Vocero del cliente solo recibe su token. El webhook
del cliente se conecta con el **override de callback por WABA**:

```text
   Meta (WABA del cliente)
        │  webhooks (override_callback_uri)
        ▼
   ┌────────────────────────────┐      ┌─────────────────────────────┐
   │  Instancia Vocero          │      │  Backend de TU agencia      │
   │  (VPS del cliente)         │      │  (Embedded Signup + tokens) │
   │  /api/webhooks/wa/<token>  │      └──────────────┬──────────────┘
   └────────────▲───────────────┘                     │
                └────── token del cliente ────────────┘
                        (pegado en el wizard)
```

**Checklist de 5 pasos (el orden importa):**

1. **Despliega la instancia primero** (Ruta A o B) — el webhook debe estar en
   línea para el paso 4.
2. **Embedded Signup en TU plataforma**: el cliente conecta su número en tu
   onboarding y tu backend guarda su token (intercambio de código → token).
3. **Pega las credenciales en el wizard** de la instancia (WABA ID, Phone
   Number ID, token) → **Probar conexión** → **GUARDAR**. Este paso va ANTES
   del override: el webhook enruta cada mensaje por el Phone Number ID
   **guardado** — sin conexión guardada, el handshake del paso 4 pasa igual,
   pero los mensajes que lleguen se descartan en silencio.
4. **Configura el override del callback a nivel WABA** hacia la instancia:

   ```http
   POST https://graph.facebook.com/v25.0/{WABA_ID_DEL_CLIENTE}/subscribed_apps
   Authorization: Bearer {TOKEN_DEL_CLIENTE}
   Content-Type: application/json

   {
     "override_callback_uri": "https://crm.cliente.com/api/webhooks/wa/{VERIFY_TOKEN}",
     "verify_token": "{VERIFY_TOKEN}"
   }
   ```

   La URL y el verify token exactos están en **Configuración → WhatsApp** de la
   instancia. Meta hace el handshake en ese momento (la URI debe responder, si
   no devuelve 422).
5. **Registra el número** en la Cloud API si aún no lo está
   (`POST /{PHONE_NUMBER_ID}/register`) y manda un mensaje de prueba al número:
   debe aparecer en la bandeja en uno o dos segundos. Los mensajes del cliente
   llegan directo a SU instancia, no a tu backend.

> ⚠️ **Seguridad**: la URL del webhook contiene el verify token como segmento
> secreto — trátala como una contraseña (no la publiques ni la mandes por
> canales inseguros). En modo directo puedes añadir la capa extra de firma con
> `META_APP_SECRET`.
>
> ℹ️ **Limitación conocida de Meta**: los eventos de estado de PLANTILLAS
> (`message_template_status_update`) no siguen el override de callback — van a
> la app dueña. Por eso Vocero también **sincroniza plantillas por la API de
> Graph** (botón "Sincronizar" en Configuración → Plantillas), así el modo
> agencia ve las aprobaciones igual.

## Configuración de la IA

En las variables de la instancia:

```bash
GEMINI_API_KEY=                       # nativo; modelo default gemini-3.6-flash
GEMINI_MODEL=gemini-3.6-flash
OPENROUTER_API_TOKEN=sk-or-...        # alternativa o complemento
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_JUDGE_MODEL=               # opcional: modelo distinto para el juez del Laboratorio
OPENROUTER_BASE_URL=https://openrouter.ai/api   # o tu proveedor OpenAI-compatible
```

Sin ninguna key, todo lo demás funciona; Agente y Laboratorio muestran cómo
activarlos. Si hay `GEMINI_API_KEY`, el adaptador la usa por defecto. Después
configura el comportamiento y el conocimiento en la pestaña **Agente** y corre
el **Laboratorio** antes de encender el agente con clientes reales.

## Cumplimiento con las políticas de Meta

1. **Opt-in**: escribe solo a personas que iniciaron la conversación o
   aceptaron recibir mensajes. En Cloud API, Vocero respeta la ventana de 24 h
   y bloquea el texto libre fuera de ella. En WhatsApp Web esa regla de Meta
   no aplica; el operador sigue siendo responsable del uso de la cuenta.
2. **Plantillas aprobadas** para reabrir conversaciones: nada de trucos para
   saltarse la aprobación de Meta.
3. **El Laboratorio es 100 % interno**: los clientes simulados jamás tocan un
   canal real — ni Cloud API ni WhatsApp Web (bloqueado por diseño).
4. **Sin spam ni broadcast**: Vocero no incluye envíos masivos; úsalo para
   conversaciones reales de venta y soporte.
5. **Datos del cliente en su servidor**: cada negocio aloja su instancia; el
   token va cifrado en reposo y los webhooks se validan por URL secreta y
   firma opcional.

## FAQ de errores comunes

**El webhook no se verifica en Meta** — El dominio aún no resuelve, no es
https, o pegaste mal la URL/verify token. Cópialos exactos de Configuración →
WhatsApp.

**El webhook verificó bien pero no llegan mensajes** — Casi siempre: la
conexión no está GUARDADA en el wizard (el handshake no la necesita, la
ingesta sí — enruta por el Phone Number ID guardado). Entra a Configuración →
WhatsApp, guarda la conexión y reenvía un mensaje. Los logs de la instancia
muestran una advertencia con el Phone Number ID desconocido.

**Llegan mensajes pero no salen** — Revisa el estado de la conexión en
Configuración → WhatsApp. Si dice "reconectar", el token expiró: pega uno
nuevo. En modo directo usa un token de usuario del sistema (no expira).

**Error 131030 al enviar** — El número destino no está en la lista de
permitidos (números de prueba de Meta) o el formato es inválido. Vocero ya
normaliza los números de México (521 → 52).

**El agente no responde** — ¿`GEMINI_API_KEY` u `OPENROUTER_API_TOKEN`?
¿Toggle global encendido? ¿La conversación tiene la IA activa y sin handoff?
En Cloud API: ¿ventana de 24 h abierta? Revisa también los logs de la instancia.

**`ENCRYPTION_KEY` inválida al arrancar** — Debe ser exactamente 32 bytes en
base64 (44 caracteres): `openssl rand -base64 32`.

**La app arranca pero /api/health falla** — La base de datos no está lista o
`DATABASE_URL` apunta mal; revisa los logs (`docker compose logs app`).

**Olvidé mi contraseña y no puedo entrar** — Vocero no manda correos (sería una
dependencia externa) y el registro público se cierra con la primera
organización, así que no hay flujo de "olvidé mi contraseña". La salida es
reescribir el hash en la base:

```bash
NEW_PASSWORD='tu-contraseña-nueva' node scripts/reset-password.mjs tu@correo.com
```

El script **no toca la base**: te imprime el `UPDATE` para que lo pegues tú en
la consola de Postgres. Corre desde tu máquina, con el repo clonado y
`pnpm install` hecho — la contraseña nueva nunca sale de ahí. Va por variable de
entorno y no por argumento porque un argumento queda en el historial del shell
y se ve en `ps`.

Debe responder `UPDATE 1`. Si responde `UPDATE 0`, el correo no coincide;
míralos con `SELECT email FROM "user";`.

## Versiones

La versión que está corriendo se ve **abajo en la barra lateral** (`v1.1.0 ·
8e62d0b`) y en el healthcheck, para poder confirmar un despliegue con un
`curl` sin abrir la app:

```bash
curl -s https://crm.tudominio.com/api/health
# {"ok":true,"version":"1.1.0","commit":"8e62d0b"}
```

Los dos valores se congelan al **construir**, así que no pueden mentir en
tiempo de ejecución. El commit lo inyecta Coolify solo; con docker compose se
pasa con `--build-arg SOURCE_COMMIT=$(git rev-parse HEAD)`, y si falta se ve
solo la versión.

SemVer sobre lo que le importa a quien opera una instancia:

| | Cuándo sube |
|---|---|
| **Mayor** (`2.0.0`) | Hay que hacer algo a mano para actualizar: cambiar una variable de entorno, migrar datos, reconectar algo. |
| **Menor** (`1.2.0`) | Funciones nuevas. Actualizar es redesplegar. |
| **Parche** (`1.1.1`) | Arreglos y ajustes. Actualizar es redesplegar. |

La versión vive en `package.json` y se sube en el PR que publica el cambio.

## Roadmap

Este fork (prioridad operativa): push en tiempo real manager→CRM (WebSocket),
y activar Instagram / MercadoLibre / Messenger cuando estén cableados. Detalle en [`PROJECT_GUIDE.md`](PROJECT_GUIDE.md).

Origen Vocero (aún válido): multimedia completa en la bandeja, RAG para
knowledge bases grandes, personas configurables del Laboratorio.

### Fuera de alcance a propósito

**Motor de agendamiento** (horarios de atención, huecos, reservas). Son unas
mil líneas, dos tablas y una dependencia de fechas dentro de un proyecto cuyo
argumento es ser ligero; y el estado de qué huecos se ofrecieron pertenece a la
conversación, o sea al agente, no al CRM. Si tu bot agenda, el contrato que
esperan `/api/bot/availability` y `/api/bot/bookings` está documentado en el
[issue #8](https://github.com/kevinrivm/vocero-crm/issues/8) para que lo
implementes donde te convenga.

Si viste algún video donde digo que Vocero trae el motor de agendamiento: me
adelanté, y esta es la aclaración.

## Stack

Next.js 15 (App Router) + React 19 · TypeScript estricto · PostgreSQL +
Drizzle ORM · Better Auth · Tailwind CSS · SSE al navegador · manager de
WhatsApp Web (Puppeteer) · Docker multi-stage con migraciones al arranque.
Constitución v2.0.0 (omnicanal) en [`.specify/memory/constitution.md`](.specify/memory/constitution.md).
Guía de modificación: [`CLAUDE.md`](CLAUDE.md). Specs `001`–`003` son el origen
Cloud-only, no el mapa de este fork.

## Licencia

[MIT](LICENSE) — úsalo, véndelo instalado, modifícalo. Si te sirve, una ⭐ al
repo ayuda a que más gente lo encuentre.

## Créditos

Vocero original creado por [Kevin Belier](https://www.youtube.com/@KevinBelier).
Este repositorio es un **fork** de atención unificada (WhatsApp Web + Puppeteer,
canales, Gemini). Los patrones de producción del núcleo (webhook firmado,
ingesta idempotente, cifrado de tokens) vienen del proyecto original.
