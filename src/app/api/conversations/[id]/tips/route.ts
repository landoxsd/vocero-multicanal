import { apiError, withAuth } from "@/lib/api";
import { generateContactTips } from "@/server/inbox/contact-tips";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Tips contextuales para el operador (panel derecho de la bandeja). */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const result = await generateContactTips(session.organizationId, id);
  if (result.tips.length === 0) {
    return apiError(404, "not_found", "Conversación no encontrada");
  }
  return Response.json(result);
});
