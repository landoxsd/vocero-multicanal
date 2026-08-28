import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { getContactById } from "@/server/contacts";
import { getOrCreateConversation } from "@/server/inbox/ingest";
import { SendError, sendText } from "@/server/inbox/send";
import {
  sendTemplate,
  TemplateError,
  templateErrorStatus,
} from "@/server/whatsapp/templates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  templateId: z.string().min(1).optional(),
  variables: z.array(z.string().trim().max(500)).max(10).optional(),
  text: z.string().trim().max(4096).optional(),
});

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const contact = await getContactById(session.organizationId, id);
  if (!contact) return apiError(404, "not_found", "Contacto no encontrado");
  if (!contact.phone && !contact.waIdentity) {
    return apiError(422, "no_identity", "Este contacto no tiene a dónde escribir");
  }

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const existing = await db
    .select({ id: schema.conversation.id, lastInboundAt: schema.conversation.lastInboundAt })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        session.organizationId,
        eq(schema.conversation.contactId, id),
        eq(schema.conversation.isTest, false)
      )
    )
    .limit(1);

  const conversation =
    existing[0] ?? (await getOrCreateConversation(session.organizationId, id));

  // Si envía texto directo (WhatsApp Web u Omnicanal)
  if (body.data.text) {
    try {
      const result = await sendText({
        organizationId: session.organizationId,
        conversationId: conversation.id,
        text: body.data.text,
      });
      return Response.json({
        messageId: result.messageId,
        conversationId: conversation.id,
      });
    } catch (err) {
      if (err instanceof SendError) {
        return apiError(409, err.code, err.message);
      }
      throw err;
    }
  }

  // Si envía plantilla (WhatsApp Cloud API)
  if (body.data.templateId) {
    try {
      const result = await sendTemplate({
        organizationId: session.organizationId,
        conversationId: conversation.id,
        templateId: body.data.templateId,
        variables: body.data.variables,
      });
      return Response.json({
        messageId: result.messageId,
        conversationId: conversation.id,
      });
    } catch (err) {
      if (err instanceof TemplateError) {
        return apiError(templateErrorStatus(err), err.code, err.message);
      }
      if (err instanceof SendError) {
        return apiError(409, err.code, err.message);
      }
      throw err;
    }
  }

  // Si solo desea abrir la conversación
  return Response.json({
    conversationId: conversation.id,
  });
});
