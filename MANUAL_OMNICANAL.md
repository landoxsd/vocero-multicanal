# 📖 MANUAL TÉCNICO Y GUÍA DE USO: VOCERO CRM OMNICANAL
**Plataforma Unificada Multi-WhatsApp, Instagram Direct, MercadoLibre y Facebook Marketplace**

---

## 1. 🌟 INTRODUCCIÓN Y ARQUITECTURA

**Vocero CRM** es una solución de mensajería omnicanal y gestión de clientes que centraliza múltiples canales de comunicación en una sola bandeja de entrada en tiempo real, respaldada por un Pipeline Kanban de ventas y un Agente de IA para atención automatizada.

### 🏢 Arquitectura del Sistema

```
                      ┌───────────────────────────────────────────────┐
                      │                VOCERO CRM                     │
                      │  - Bandeja Unificada (SSE en tiempo real)     │
                      │  - Tablero Kanban / Pipeline de Ventas        │
                      │  - Agente de IA Contextual Multi-Canal        │
                      │  - Panel de Canales (/settings/channels)      │
                      └──────────────────────┬────────────────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       │        Orquestador Omnicanal Central      │
                       │   (src/server/channels/omnichannel-manager)│
                       └───────┬─────────┬──────────┬───────────┬──┘
                               │         │          │           │
           ┌───────────────────┴─┐   ┌───┴────┐ ┌───┴────┐  ┌───┴───────────────┐
           │ WhatsApp Web        │   │ Insta  │ │ MeLi   │  │ Facebook          │
           │ Multi-Session       │   │ Direct │ │ Tienda │  │ Marketplace &     │
           │ (Motor PMV-CORE)    │   │ (Meta) │ │ 1 & 2  │  │ Messenger (Meta)  │
           └─────────────────────┘   └────────┘ └────────┘  └───────────────────┘
```

---

## 2. ⚙️ REQUISITOS PREVIOS Y VARIABLES DE ENTORNO

### Variables en tu archivo `.env`:

```env
# URL base pública de tu instalación del CRM
APP_BASE_URL="http://192.168.1.58:3000" # O tu dominio con HTTPS

# Conexión a Base de Datos PostgreSQL
DATABASE_URL="postgresql://postgres:TU_PASSWORD@localhost:5432/postgres"

# Secretos de Seguridad y Cifrado
BETTER_AUTH_SECRET="tu_secreto_generado_hex"
ENCRYPTION_KEY="tu_clave_de_cifrado_hex_32_bytes"

# URL del Motor de WhatsApp Web (PMV-CORE / WhatsApp Web Manager)
WA_WEB_MANAGER_URL="http://127.0.0.1:3001"

# Webhooks de Meta (Instagram y Facebook)
META_WEBHOOK_VERIFY_TOKEN="vocero_crm_webhook_token_2026"
META_GRAPH_API_VERSION="v21.0"
```

---

## 3. 🚀 PASO A PASO: INSTALACIÓN Y PUESTA EN MARCHA

### Paso 1: Ejecutar la Migración de Base de Datos
Para crear la tabla de canales (`channel_account`) y las columnas omnicanal:
```bash
pnpm db:migrate
```

### Paso 2: Iniciar el Motor de WhatsApp Web
Asegúrate de que el servicio de `WHATSAPP_WEB_MANAGER` o `PMV-CORE` esté corriendo en el puerto configurado (por ejemplo `3001`):
```bash
node index.js
```

### Paso 3: Iniciar Vocero CRM
```bash
pnpm dev # Para desarrollo en puerto 3000
# o
pnpm build && pnpm start # Para producción
```

---

## 4. 📱 GUÍA DE USO: CONFIGURACIÓN DE CANALES

Dirígete en el menú lateral a **Configuración $\rightarrow$ Canales** (`/settings/channels`).

```
                              PANEL DE CANALES
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  WhatsApp Web   │ │Instagram Direct │ │  MercadoLibre   │ │Facebook Market  │
│  [+ Añadir WA]  │ │ [+ Conectar IG] │ │  [+ Vincular]   │ │ [+ Conectar FB] │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

### A. 🟢 Cómo Conectar WhatsApp Web (Multi-Línea)

1. En el panel de Canales, haz clic en **`+ Añadir WhatsApp`**.
2. Escribe un nombre descriptivo para la línea (ej. *"WhatsApp Ventas Caracas"* o *"Línea Soporte"*).
3. Haz clic en **`Generar Código QR`**.
4. En pantalla se generará el código QR en tiempo real.
5. Abre WhatsApp en el teléfono celular $\rightarrow$ Ve a **Dispositivos vinculados** $\rightarrow$ **Vincular un dispositivo** y escanea el código en pantalla.
6. En segundos, el sistema detectará la conexión y cambiará automáticamente a estado **`🟢 Conectado`**.
7. Puedes repetir este proceso tantas veces como números telefónicos quieras tener activos a la vez.

---

### B. 🟡 Cómo Conectar tus Cuentas de MercadoLibre (Soporte Multi-Tienda)

El sistema permite conectar **ambas cuentas de MercadoLibre** (Tienda 1 y Tienda 2) de forma independiente:

1. En el panel de Canales, haz clic en **`+ Vincular MeLi`**.
2. Completa los 3 campos:
   * **Nombre de la Cuenta:** (ej. *"MercadoLibre Tienda Oficial"* o *"MercadoLibre Cuenta 2"*).
   * **User ID / Seller ID:** Tu número identificador de vendedor en MercadoLibre (ej. `123456789`).
   * **Access Token:** Tu token de aplicación de MercadoLibre (`APP_USR-...`).
3. En el portal de desarrolladores de MercadoLibre ([developers.mercadolibre.com](https://developers.mercadolibre.com)):
   * Configura la URL de Notificaciones Webhook apuntando a:
     ```
     https://tu-dominio.com/api/webhooks/mercadolibre
     ```
   * Habilita los tópicos: `questions` (preguntas) y `messages` (post-venta).
4. Haz clic en **`Guardar Cuenta MeLi`**.
5. Repite el mismo procedimiento para tu segunda cuenta de MercadoLibre. Ambas convivirán en el CRM sin interferir entre sí.

---

### C. 🟣 Cómo Conectar Instagram Direct

1. En el panel de Canales, haz clic en **`+ Conectar Instagram`**.
2. En [Meta for Developers](https://developers.facebook.com):
   * En tu App con permisos de `instagram_manage_messages` y `pages_messaging`, configura el Webhook:
     * **URL de devolución:** `https://tu-dominio.com/api/webhooks/instagram`
     * **Token de verificación:** El valor configurado en `META_WEBHOOK_VERIFY_TOKEN` (ej. `vocero_crm_webhook_token_2026`).
     * **Campos suscritos:** `messages`, `messaging_postbacks`, `message_deliveries`.
3. Registra el canal en el CRM con tu Instagram Account ID y Page Access Token.

---

### D. 🔵 Cómo Conectar Facebook Marketplace & Messenger

1. En el panel de Canales, haz clic en **`+ Conectar Facebook`**.
2. Configura el Webhook en tu Meta App para la página comercial correspondiente apuntando a:
   ```
   https://tu-dominio.com/api/webhooks/instagram
   ```
3. Registra el Page Access Token en el CRM.

---

## 5. 💬 OPERACIÓN DIARIA EN LA BANDEJA DE ENTRADA

### 🏷️ Identificación Visual con Insignias (Badges)
Cada conversación en la bandeja de entrada muestra una insignia oficial:
* 🟢 **WhatsApp Web / Cloud:** Icono verde + Nombre de la línea.
* 🟣 **Instagram:** Icono degradado morado/rosa con el usuario `@ig_user`.
* 🟡 **MercadoLibre:** Icono amarillo con el nombre de la tienda correspondiente (Tienda 1 o Tienda 2).
* 🔵 **Facebook:** Icono azul de Messenger.

### 🤖 Atención Automatizada vs Intervención Humana
* **Atención con IA:** Si el agente de IA está activo en la conversación, responderá automáticamente consultas frecuentes respetando las normas de cada plataforma (por ejemplo, sin enviar teléfonos en preguntas de MercadoLibre).
* **Intervención de Asesor:** En cualquier momento un asesor humano puede escribir directamente en el chat y presionar `Enter` para enviar. Al responder manualmente, el CRM realiza el handoff automático marcando el chat para atención humana.

---

## 6. 🛠️ DIAGNÓSTICO Y PREGUNTAS FRECUENTES

### ¿Qué pasa si se reinicia el servidor?
Las sesiones de WhatsApp Web se guardan en el directorio persistente `./sessions/` mediante `LocalAuth`. Al reiniciar, el sistema se reconecta automáticamente sin necesidad de volver a escanear el código QR.

### ¿Cómo desvincular un número o cuenta?
En **Configuración $\rightarrow$ Canales**, busca la cuenta deseada y haz clic en el icono del cesto de basura 🗑️. La sesión se cerrará de inmediato.
