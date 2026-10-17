# Guion E2E — US3: Agente de IA con acciones tipadas

> Conducido con Playwright (MCP) contra `pnpm dev` con ai-mock
> (`OPENROUTER_BASE_URL` → `/api/dev/ai-mock`) y `AGENT_COALESCE_MS=2000`.

## Preparación

1. En `/agent`: encender el toggle global y agregar una entrada P/R al KB
   ("¿Hacen envíos?" → "Sí, a todo México en 2-5 días").
   ✅ El contador de tamaño del KB refleja la entrada.

## Camino feliz

2. **Respuesta con IA (FR-021)**: inbound "¿hacen envíos a Guadalajara?".
   ✅ Tras el debounce llega UNA respuesta del agente marcada "IA" en el hilo.
3. **Agrupación (FR-024)**: enviar 2 mensajes seguidos (<2s entre ellos).
   ✅ El agente responde UNA sola vez al conjunto.
4. **move_stage (FR-021)**: inbound "me interesa, lo compro".
   ✅ Respuesta del agente + el lead aparece en "Interesado" en el kanban.
5. **Handoff por frase (FR-022/SC-006)**: inbound "quiero hablar con un humano".
   ✅ El cliente recibe UN acuse («te comunico con una persona del equipo»),
   marcado como IA, ANTES del traspaso — igual que el `farewell` del camino
   del modelo. Sin él, quien pidió una persona se quedaba sin respuesta.
   Automatizado en `scripts/e2e-selftest.mjs` (sección FR-022).
   ✅ Badge de atención humana visible en la conversación; la IA queda
   silenciada (mensajes posteriores NO reciben respuesta, ni otro acuse).
   ✅ "Reactivar IA" desde el panel vuelve a activar al agente.

## Caminos infelices

6. **Toggle global apagado (FR-023)**: apagar el agente → inbound → sin respuesta.
7. **"somos 4 personas"**: NO produce handoff (cubierto por unit test del
   patrón; verificado además con inbound en vivo).
8. **Sin proveedor de IA (FR-026)**: pestañas Agente y Laboratorio muestran estado
   vacío explicativo con acciones deshabilitadas y enlace a Ajustes → IA
   (verificado en el checkpoint de compose, donde el entorno arranca sin token).
   Con el agente encendido, además, el banner «Tu agente no puede contestar
   todavía» se ve en toda la app.

## Ajustes → IA (#85)

> Con el ai-mock: una llave con sufijo `-invalid` responde 401 y una con
> `-sin-saldo`, 402 (contrato mocks.md). Sin `OPENROUTER_API_TOKEN` en el
> entorno, para ver el camino sin respaldo.

9. **Configurar desde la interfaz**: en Ajustes → IA elegir «Otro compatible
   con OpenAI», base URL `http://localhost:3000/api/dev/ai-mock`, modelo
   `mock/agente` y una llave cualquiera (p. ej. `llave-de-prueba`).
   ✅ «Probar conexión» → «Conexión correcta (N ms)» sin guardar nada
   (`GET /api/settings/ai` sigue sin credencial).
   ✅ «Traer modelos» rellena la lista con `mock/agente` y `mock/juez`.
   ✅ «Guardar» → «Llave conectada ••••ueba · Activo»; el banner desaparece y
   la pantalla Agente deja de pedir configuración. Un inbound recibe respuesta
   del agente (el turno usa la fila, no el entorno).
10. **Llave rechazada (401 → pausa)**: reemplazar la llave por `llave-invalid`
    y guardar (vuelve a «Activo»: guardar siempre reactiva). Enviar un inbound.
    ✅ Tras el turno, `GET /api/settings/ai` → `estado: paused_invalid_token`
    con `motivo` del proveedor; la pestaña dice «Pausado: llave rechazada» y
    el banner «Tu agente está pausado: el proveedor rechazó tu llave».
    ✅ Otro inbound NO produce llamada al proveedor (el agente calla).
    ✅ «Probar conexión» con la llave guardada → 422 `invalid_token`.
11. **Sin saldo (402)**: igual con `llave-sin-saldo` → `paused_no_credit`,
    «Pausado: sin saldo», y el banner pide recargar y probar la conexión.
12. **Recuperación**: pegar una llave válida y guardar → `active`; o, con la
    guardada, «Probar conexión» cuando el proveedor vuelva a aceptarla →
    «Tu llave vuelve a estar activa».
13. **Quitar**: «Quitar» borra la fila. Con `OPENROUTER_API_TOKEN` en el
    entorno, la pantalla dice que hoy responde con las variables del entorno
    (••••last4) y el agente sigue; sin él, vuelve el estado vacío.
