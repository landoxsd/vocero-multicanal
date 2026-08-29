<!--
SYNC IMPACT REPORT
==================
Versión: 1.3.0 → 2.0.0

Cambios:
  - Principio II "Soberanía / Self-Hosted" → REDEFINIDO (incompatible con
    1.x): la lista cerrada "solo Cloud API + OpenRouter, Google prohibido"
    deja de ser la ley. Este fork es un CRM de atención unificada. Runtime
    permitido: canales detrás de adaptadores (WhatsApp Cloud API, WhatsApp
    Web self-hosted con Puppeteer, e Instagram / MercadoLibre / Messenger
    cuando el adaptador esté cableado); LLM vía OpenRouter-compatible y/o
    Gemini nativo. Siguen prohibidos S3/R2, email, Stripe/billing y Google
    como almacenamiento/correo/login. El cliente no oficial de WhatsApp Web
    es dependencia aceptada de ESTE fork, aislada en el microservicio
    `whatsapp-web-manager`. La ventana 24 h y las plantillas aplican a
    Cloud API, no bloquean canales Web/omnicanal.
  - Principio VIII "Foco Vertical — CRM de Conversaciones y Leads de
    WhatsApp" → REDEFINIDO y RETITULADO: el producto es atención unificada
    (bandeja + pipeline + IA) para UN negocio; WhatsApp deja de ser el
    único canal constitucional. Siguen fuera broadcast, scraping y
    constructores visuales de flujos.
  - Principio IV → EXPANDIDO: la clave de idempotencia es el id externo del
    canal (`wa_message_id` / `externalMessageId`), no solo el de Meta.
  - Restricciones de plataforma → ALINEADAS: adaptadores de canal +
    `lib/ai`; webhooks de managers internos MUST autenticarse; consultas
    omnicanal MUST pasar por `scoped()`; SSE al navegador; transporte
    interno (polling o socket en red Docker) entre CRM y manager está
    permitido y no sustituye SSE.
  - Principios I, III, V, VI, VII, IX: íntegros en sustancia. IX ya cubría
    herramientas no oficiales (allowlist, anti-flood); ahora aplica de
    forma explícita al manager de WhatsApp Web.
  - Párrafo de apertura: este repositorio es un fork de Vocero original.
  - Governance: sin cambio de procedimiento; versión MAJOR.

Bump: MAJOR (1.3.0 → 2.0.0) — redefinición incompatible de II y VIII.
Lo que cumplía 1.x "Cloud-only + OpenRouter" ya no es el producto. El
código del fork (canales, Gemini, Puppeteer) pasa a ser constitucional,
no una violación a remediar.

Motivación:
  El dueño ratificó que esta instancia convierte Vocero en un CRM
  omnicanal de atención unificada con IA integrada, y que WhatsApp se
  opera también por WhatsApp Web + Puppeteer con mejoras propias. Sin
  esta enmienda, CLAUDE.md y el Principio II ordenaban "arreglar" el
  producto.

Plantillas dependientes:
  - .specify/templates/spec-template.md — ✅ compatible (sin secciones
    nuevas obligatorias; el Constitution Check del carril ligero se
    evalúa contra 2.0.0).
  - .specify/templates/plan-template.md — ✅ compatible (el check cita
    "gates from constitution file"; no hardcodeaba Cloud-only).
  - .specify/templates/tasks-template.md — ✅ compatible.
  - CLAUDE.md — ✅ actualizado a 2.0.0 (mapa de canales, manager, Gemini).
  - README.md — ✅ actualizado: fork omnicanal, no vocero-core 1.x.
  - .env.example — ✅ GEMINI_* y WA_WEB_MANAGER_URL.
  - specs/README.md — ✅ aclara que 001–003 son el origen, no el mapa
    actual.
  - specs/001-vocero-core/* — ⚠ históricos a propósito; no se reescriben.

TODOs diferidos (cumplimiento, no redacción):
  - Webhook `/api/webhooks/whatsapp-web` autenticado con `WA_WEB_WEBHOOK_SECRET`.
  - `OmniChannelManager` usa `scoped()` en queries de dominio post-canal.
  - `whatsapp-web-manager` en `docker-compose.yml` (Ruta B).
  - Instagram / MercadoLibre / Messenger: adaptadores presentes, no
    activados como producto.
-->

# Vocero CRM Constitution

Este repositorio es un **fork de Vocero CRM** (MIT, origen: CRM self-hosted
de WhatsApp Cloud API). El producto de este fork es un **CRM de atención
unificada omnicanal** con agente de IA integrado: una bandeja, un pipeline y
un cerebro, varios canales. Una instancia = un negocio.

Esta constitución define las reglas no negociables del fork. Aplica a todas
las fases del flujo de trabajo (specify, plan, tasks, implement). Cualquier
conflicto entre una decisión de implementación y esta constitución SE
RESUELVE A FAVOR de esta constitución.

## Core Principles

### I. Seguridad de Datos Primero (NO NEGOCIABLE)

La protección de datos es la primera responsabilidad del sistema, por encima de
velocidad de entrega o conveniencia de desarrollo.

- Tokens, credenciales y secretos sensibles NUNCA se exponen al cliente (navegador,
  app, respuestas de API) ni se escriben en logs, trazas o mensajes de error.
- Todo secreto se almacena cifrado en reposo. Las claves de cifrado se gestionan
  fuera del código fuente y fuera del control de versiones.
- Si el producto es multi-tenant, todo dato de un tenant está aislado de los demás:
  ninguna consulta, endpoint o tarea en segundo plano debe devolver o modificar datos
  de un tenant distinto al del solicitante. El aislamiento se aplica por defecto.

**Rationale**: Una fuga de credenciales o un cruce de datos entre clientes es un
fallo catastrófico e irreversible; prevenirlo siempre cuesta menos que remediarlo.

### II. Soberanía / Self-Hosted (OMNICANAL)

Vocero (este fork) opera completo sobre la infraestructura del operador. Auth y
base de datos son self-hosted (Better Auth + PostgreSQL de la instancia). Las
integraciones externas se aíslan tras adaptadores; el dominio (contacto,
conversación, lead, agente) no se acopla a un proveedor.

Dependencias externas de runtime PERMITIDAS:

1. **Canales de mensajería**, cada uno detrás de un adaptador en
   `src/server/channels/` o, para Cloud API, `src/lib/meta/` + `src/server/whatsapp/`:
   - WhatsApp Cloud API (Meta Graph API) — camino oficial, ventana 24 h y plantillas.
   - WhatsApp Web self-hosted — microservicio `services/whatsapp-web-manager/`
     (Puppeteer / whatsapp-web.js). El CRM no habla con el DOM de WhatsApp; solo
     con la API interna del manager. Cliente no oficial: aceptado en ESTE fork,
     con los guardarraíles del Principio IX.
   - Otros canales del modelo (`instagram`, `mercadolibre`, `facebook_messenger`)
     cuando su adaptador esté cableado de punta a punta. Un enum en el schema no
     equivale a un canal entregado.
2. **Proveedor LLM**, opcional, accedido EXCLUSIVAMENTE por `src/lib/ai/`
   (`chatJson<T>`): OpenRouter-compatible y/o **Gemini nativo** (`GEMINI_API_KEY`).
   Sin ninguna key, el producto funciona como CRM sin agente.

PROHIBIDO:

- Almacenamiento de objetos externo (S3/R2), correo transaccional, Stripe u otro
  billing.
- Google como Drive, Gmail, OAuth de login o object storage. Gemini como LLM
  detrás de `lib/ai` SÍ está permitido.
- Hablar con WhatsApp Web, Instagram privado u otras APIs no oficiales desde el
  monolito Next.js: eso vive en el manager o en el adaptador de canal.

La ventana de 24 horas y las plantillas de Meta aplican a conversaciones del
camino Cloud API. MUST NOT usarse esas reglas para bloquear envío en WhatsApp
Web u otros canales que no las imponen.

El instalador de este fork necesita: VPS con Docker, dominio HTTPS para webhooks
oficiales, y según canales conectados: credenciales de Meta, el servicio del
manager (Chromium) para WhatsApp Web, y (opcional) keys de LLM.

**Rationale**: Self-hosted sigue siendo la promesa. El fork deja de fingir un
solo canal; cada dependencia extra se paga en operación (Puppeteer, ToS, red
Docker). Por eso los canales son adaptadores y el manager es un proceso aparte,
no lógica mezclada en la bandeja.

### III. Multi-Tenancy Real

El sistema sirve a organizaciones independientes desde una sola instancia lógica.
En Vocero cada instancia sirve a UN negocio, pero el modelo de datos es
multi-tenant real (organización del plugin de auth) para mantener el aislamiento
exigible y no cerrar la puerta a evoluciones.

- Cada organización (tenant) gestiona sus propios usuarios, roles y permisos.
- El identificador de tenant (`organization_id`) es un parámetro de primer nivel en
  el modelo de datos y en la capa de acceso a datos, no un campo opcional añadido a
  posteriori. Toda tabla de dominio lo lleva NOT NULL e indexado org-first.
- Toda query de dominio —incluida la ingesta omnicanal y los webhooks de
  managers internos— MUST construirse con `scoped()` de `src/lib/db/tenant.ts`.

**Rationale**: Multi-tenancy diseñado desde el inicio evita reescrituras costosas y
hace cumplible el aislamiento del Principio I.

### IV. Idempotencia en Integraciones Externas

Todo evento entrante de un sistema externo (webhooks, callbacks, notificaciones de
terceros, pushes o sync del manager de WhatsApp Web) se procesa de forma
idempotente.

- Recibir el mismo evento dos o más veces NO duplica efectos observables (mensajes
  reenviados, registros duplicados, acciones del agente repetidas).
- Cada evento entrante se identifica de forma única por el id que emite el canal
  (`wa_message_id` en Cloud API; `externalMessageId` u homólogo en el resto) y su
  procesamiento se registra para detectar y descartar reintentos.

**Rationale**: Los proveedores externos y el manager reintentan entregas por
diseño; sin idempotencia, los reintentos corrompen datos y generan acciones
duplicadas.

### V. Calidad Verificable Antes de "Hecho" (NO NEGOCIABLE)

Ninguna tarea se considera terminada sin pasar verificación.

- "Hecho" requiere, como mínimo: comprobación de tipos, lint y build; y tests donde
  apliquen al alcance de la tarea.
- Lo que NO se pueda verificar automáticamente se marca explícitamente como
  "pendiente de verificación humana"; no se reporta como completado sin esa marca.
- No se reporta una tarea como terminada describiendo que "debería funcionar": o pasa
  la verificación, o se declara su estado real (incluyendo fallos).

**Rationale**: La verificación automática es la única definición de "hecho" que no
depende de optimismo.

### VI. Specs Antes de Código

Ninguna feature se implementa sin una especificación previa. La especificación
describe el comportamiento observable por el usuario, no la implementación.

El **carril** se elige y se declara ANTES de escribir código, y en los tres casos
la decisión queda por escrito:

- **Ciclo completo** (`specify → plan → tasks → implement`) — obligatorio cuando la
  feature toca el **modelo de datos** (cualquier migración) o un **contrato
  publicado** (`/api/bot/*`, webhooks, SSE, API del manager, o un DTO que consuma
  algo fuera de este repo). Ahí el coste de equivocarse no lo paga quien programa:
  lo paga quien ya tiene datos guardados o un cliente conectado.

- **Carril ligero** (`spec.md` únicamente) — para features con comportamiento
  observable nuevo que NO tocan el modelo de datos ni un contrato. El `spec.md`
  MUST contener, y le basta con: qué problema resuelve, el comportamiento
  observable con criterios de aceptación verificables, y qué se decidió NO hacer y
  por qué.

- **Exento** — correcciones triviales y cambios sin comportamiento observable nuevo
  (typos, formato, refactors internos sin cambio de contrato, dependencias,
  herramientas de desarrollo).

Reglas que sostienen lo anterior:

- Si una feature del carril ligero descubre a mitad de camino que necesita una
  migración o cambiar un contrato, **sube de carril**: se escribe el plan antes de
  continuar, no después de terminar.
- Un spec escrito DESPUÉS de la implementación se marca visiblemente como tal en su
  encabezado. Es documentación, no diseño, y confundirlos hace creer a quien lo lea
  dentro de un año que esas decisiones se tomaron antes de programar.

**Rationale**: Especificar el comportamiento observable antes de codificar previene
retrabajo y mantiene alineadas todas las fases del flujo. Los tres carriles existen
porque un único ciclo, calibrado para una feature que define el producto entero, es
más ceremonia que trabajo en un cambio de doscientas líneas — y una regla que cuesta
más de lo que rinde no se discute: se erosiona en silencio, hasta que "specs antes de
código" significa "sin specs". Nombrar el escalón intermedio es lo que evita que el
siguiente paso hacia abajo sea ninguno.

### VII. Trazabilidad de Decisiones

Las decisiones tomadas sin contexto suficiente se documentan para revisión humana.

- Cuando una decisión se toma con información incompleta o supuestos no confirmados,
  se registra de forma visible (en el spec, el plan, el PR o un marcador
  `NEEDS CLARIFICATION` / TODO con responsable), no se entierra en el código.
- Los supuestos que condicionan el comportamiento se hacen explícitos para que un
  humano pueda revisarlos y revertirlos.

**Rationale**: Las decisiones implícitas bajo incertidumbre son la principal fuente
de deuda oculta; hacerlas visibles permite corregirlas a tiempo.

### VIII. Foco Vertical — Atención Unificada (Conversaciones y Leads)

Es un CRM de **atención unificada**: conversaciones y leads de los canales
conectados, que se despliegan para UN negocio. No es plataforma de marketing
masivo, ni constructor visual de flujos, ni herramienta de scraping. Lo que no
ayude a *atender, organizar y convertir conversaciones de UN negocio* se rechaza.

- El modelo de datos y los flujos MUST reflejar ese dominio: contactos que escriben
  por un canal, conversaciones en una bandeja, leads en un pipeline, un agente de
  IA que atiende con el conocimiento del negocio y escala a humanos.
- Los canales son adaptadores; el producto es el CRM. Features de canal que no
  sirvan a atender/organizar/convertir (broadcast masivo, scraping de números,
  flujos visuales genéricos) quedan FUERA.
- Toda feature MUST servir a quien despliega o al negocio que opera UNA instancia.
  Lo que solo sirva a una plataforma centralizada (billing, planes, multi-instancia
  como producto SaaS) queda FUERA.

**Rationale**: Un foco vertical explícito mantiene el modelo alineado con el
negocio real y da un criterio claro para aceptar o rechazar alcance. Ampliar de
"solo WhatsApp Cloud" a "omnicanal" no autoriza convertirlo en suite de marketing.

### IX. Verificación de Comportamiento en Vivo (NO NEGOCIABLE)

Complementa el Principio V. TODA feature con comportamiento observable —UI web,
mensajería, API o integración externa— se verifica ejerciendo ese comportamiento como
lo haría un usuario real antes de declararse "Hecha". El gate técnico (Principio V) es
el piso, no el techo.

- **Self-test + loop por el implementador (self-improvement loop).** Tras implementar,
  quien implementa ejecuta el self-test E2E —camino feliz Y camino infeliz (degradación
  sin colgarse)— y, si algo falla, diagnostica, corrige y re-verifica él mismo hasta
  verde. No se entrega trabajo a medio verificar ni se delega la prueba funcional al
  dueño. Lo único delegable a verificación humana es lo intrínsecamente no verificable
  por herramientas (juicio visual, aprobación de un tercero), marcado explícitamente.
- **Se conduce la interfaz real.** Navegador vía Playwright para features de UI; la línea
  del canal (Cloud API de prueba, sesión de WhatsApp Web en entorno controlado, mock)
  para mensajería; llamadas a la API donde esa sea la superficie. No basta con
  tipos/lint/build, ni con que un endpoint devuelva 2xx, ni con inspeccionar la base
  de datos: se observa el resultado de cara al usuario.
- **Local primero, nube después.** Si el comportamiento puede reproducirse en `localhost`
  —incluyendo integraciones externas vía túnel (p. ej. ngrok + handshake del webhook desde
  el panel del proveedor)—, SHOULD probarse ahí antes de desplegar. El deploy a la nube se
  reserva para lo que el entorno local no pueda reproducir, porque desplegar consume tiempo
  y reduce la agilidad del ciclo.
- **Guardarraíles con herramientas no oficiales.** WhatsApp Web / Puppeteer y cualquier
  otra herramienta no oficial vinculada a un número o cuenta real MUST respetar reglas
  duras: enviar solo a destinatarios de una allowlist, NUNCA mensajes en ráfaga
  (anti-flood obligatorio), y minimizar el volumen. La integridad de la cuenta del
  operador es un activo a proteger, en línea con el Principio I.

**Rationale**: El gate técnico no detecta que un agente "se calló", que una tarjeta no
llegó como un solo mensaje, o que un botón de UI no disparó nada — eso solo aparece
ejerciendo el flujo real. Y el valor del paso no está solo en detectar el fallo sino en
cerrarlo: el implementador itera hasta verde en vez de devolver trabajo a medias. Probar
en local primero mantiene el ciclo ágil; y sin guardarraíles duros, una prueba con
herramientas no oficiales podría provocar un baneo irreversible.

## Restricciones de Plataforma y Seguridad

Estas restricciones derivan de los Principios I y II y son verificables en revisión:

- **Gestión de secretos**: los secretos se inyectan vía configuración de entorno o un
  gestor de secretos; nunca se comprometen a control de versiones.
- **Cifrado en reposo**: credenciales y datos sensibles se almacenan cifrados; el
  almacenamiento en claro de secretos es una violación.
- **Frontera de tenant**: la capa de acceso a datos exige el identificador
  de tenant vía `scoped()`; cualquier acceso que pueda omitirlo requiere justificación
  explícita.
- **Aislamiento de integraciones**: Graph API, manager de WhatsApp Web, Gemini,
  OpenRouter y el resto de canales se acceden a través de adaptadores dedicados
  (`lib/meta`, `lib/ai`, `server/channels/*`), no dispersos por el dominio.
- **Webhooks de managers internos**: MUST autenticarse (secreto compartido, red
  privada, o equivalente). Un POST anónimo que acepte `session` no cumple el
  Principio I.
- **Tiempo real hacia el navegador**: SSE (`/api/events`). Entre el CRM y el
  manager, en red privada Docker, se permite polling o un transporte interno
  (incl. socket). Eso no sustituye SSE ni introduce colas externas.
- **Instancia pública endurecida**: las rutas de mock/desarrollo devuelven 404
  incondicional en producción; el registro se cierra tras la primera organización
  (salvo habilitación explícita); las conversaciones `is_test` del Laboratorio
  JAMÁS alcanzan un canal real (Cloud API ni WhatsApp Web).

## Flujo de Desarrollo y Puertas de Calidad

- **Orden del flujo**: depende del carril declarado (Principio VI). En el ciclo
  completo, `specify → plan → tasks → implement`, y cada fase consume el artefacto
  de la anterior. En el carril ligero, `specify → implement`.
- **Puerta constitucional (Constitution Check)**: se evalúa SIEMPRE, en los dos
  carriles — cambia dónde vive, no si ocurre. En el ciclo completo, en el plan:
  antes de la Fase 0 y de nuevo tras el diseño de la Fase 1. En el carril ligero,
  en el propio `spec.md`, antes de escribir código. Las violaciones se registran y
  justifican (Complexity Tracking en el ciclo completo, o una nota explícita en el
  spec) o se eliminan.

  El carril ligero ahorra ceremonia de planificación, NUNCA la revisión
  constitucional: los principios que más caro cuesta romper —aislamiento entre
  inquilinos, soberanía, idempotencia— se violan igual de fácil en doscientas
  líneas que en dos mil.
- **Puerta de calidad (Definición de "Hecho")**: tipos + lint + build en verde, y
  tests donde apliquen; lo no verificable automáticamente se marca como pendiente de
  verificación humana (Principio V). Para features con comportamiento observable de cara
  al usuario, "Hecho" exige además el self-test de comportamiento en vivo ejecutado por el
  implementador, con sus guardarraíles (Principio IX).
- **Trazabilidad**: decisiones bajo incertidumbre y supuestos se documentan de forma
  visible (Principio VII), no en comentarios enterrados.

## Governance

Esta constitución es la autoridad máxima del proyecto. Prevalece sobre cualquier otra
práctica, convención o preferencia; ante un conflicto, gana la constitución.

- **Procedimiento de enmienda**: toda enmienda se propone por escrito describiendo el
  cambio y su motivación, se aprueba por el responsable del proyecto y se registra en
  el control de versiones junto con el Sync Impact Report actualizado.
- **Política de versionado** (semantic versioning de la constitución):
  - **MAJOR**: eliminación o redefinición incompatible de un principio o de la
    gobernanza.
  - **MINOR**: adición de un principio/sección nueva o expansión material.
  - **PATCH**: aclaraciones, correcciones de redacción y refinamientos no semánticos.
- **Revisión de cumplimiento**: cada PR y cada revisión de diseño verifican el
  cumplimiento de estos principios. La complejidad que viole un principio debe
  justificarse; si no, debe eliminarse.
- **Propagación**: al enmendar la constitución se revisan y, si procede, se actualizan
  las plantillas dependientes (plan, spec, tasks) y la guía de agentes (`CLAUDE.md`).

**Version**: 2.0.0 | **Ratified**: 2026-07-09 | **Last Amended**: 2026-08-28
