import { apiError, withAuth } from "@/lib/api";
import { getConversation, listMessages } from "@/server/inbox/queries";
import { suggestKbFromChat } from "@/server/kb/suggest-from-chat";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Sugiere P/R a partir del hilo (último intercambio o mensaje ancla). */
export const GET = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const row = await getConversation(session.organizationId, id);
  if (!row) return apiError(404, "not_found", "Conversación no encontrada");

  const url = new URL(req.url);
  const messageId = url.searchParams.get("messageId") ?? undefined;

  const rows = await listMessages(session.organizationId, id);
  const suggestion = suggestKbFromChat(
    rows.map((r) => ({
      id: r.message.id,
      direction: r.message.direction,
      text: r.message.text,
      createdAt: r.message.createdAt,
    })),
    messageId
  );

  if (!suggestion) {
    return apiError(
      404,
      "no_pair",
      "No hay un intercambio de texto suficiente para sugerir una entrada"
    );
  }

  return Response.json({ suggestion });
});
