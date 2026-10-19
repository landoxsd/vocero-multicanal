/**
 * Metadatos que el adaptador de MercadoLibre necesita para enviar.
 * Se recuperan del último mensaje entrante del hilo (pregunta o post-venta).
 */

export type MeliOutboundMeta = {
  subType: "question" | "post_sale";
  questionId?: string;
  packId?: string;
  buyerId?: string;
  sellerId?: string;
  itemId?: string;
};

export function outboundMetaFromInbound(
  metadata: Record<string, unknown> | null | undefined
): MeliOutboundMeta {
  if (!metadata) {
    return { subType: "question" };
  }

  const subType =
    metadata.subType === "post_sale" || metadata.subType === "postsale"
      ? "post_sale"
      : "question";

  const asString = (value: unknown): string | undefined => {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return undefined;
  };

  return {
    subType,
    questionId: asString(metadata.questionId) ?? asString(metadata.question_id),
    packId: asString(metadata.packId) ?? asString(metadata.pack_id),
    buyerId: asString(metadata.buyerId) ?? asString(metadata.buyer_id),
    sellerId: asString(metadata.sellerId) ?? asString(metadata.seller_id),
    itemId: asString(metadata.itemId) ?? asString(metadata.item_id),
  };
}
