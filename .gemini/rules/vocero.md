# Reglas de Proyecto Vocero CRM — Antigravity

- **Aislamiento Multi-Tenant**: Toda consulta a tablas de dominio debe pasar obligatoriamente por `scoped(organizationId)` de `@/lib/db/tenant`.
- **Cifrado de Secretos**: Secretos y tokens se almacenan cifrados con AES-256-GCM (`@/lib/crypto`). Jamás exponerlos en logs ni respuestas cliente.
- **Validación**: Toda entrada externa se valida con Zod (`@/lib/api`).
- **Canales**:
  - WhatsApp Cloud API: Sujeto a ventana de 24h y plantillas aprobadas.
  - WhatsApp Web (QR): Microservicio `services/whatsapp-web-manager/`, exento de ventana 24h.
  - Redes sociales: Instagram, Messenger, TikTok bajo adaptador Zernio/Meta con ventanas declaradas.
- **Idioma**: Español en código, comentarios, UI y documentación.
