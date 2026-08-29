/**
 * URL del webhook del CRM que consume el whatsapp-web-manager.
 * En Docker usa la red interna (`WA_WEB_INTERNAL_WEBHOOK_URL`) para evitar
 * hairpin NAT; fuera de compose cae en `APP_BASE_URL`.
 */
export function waWebCrmWebhookUrl(): string {
  const internal = process.env.WA_WEB_INTERNAL_WEBHOOK_URL?.trim();
  if (internal) return internal;
  const base = (process.env.APP_BASE_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
  return `${base}/api/webhooks/whatsapp-web`;
}
