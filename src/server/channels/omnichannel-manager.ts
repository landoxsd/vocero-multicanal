import { eq, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { publish } from "@/server/events/bus";
import { onLeadActivity } from "@/server/inbox/lead-activity";
import { maybeRunAgentTurn } from "@/server/ai/trigger";
import { WhatsAppWebAdapter } from "./whatsapp-web/provider";
import {
  normalizeWaWebMediaKind,
  storeWaWebMediaAsset,
} from "./whatsapp-web/media";
import { InstagramAdapter } from "./instagram/provider";
import { MercadoLibreAdapter } from "./mercadolibre/provider";
import { FacebookMessengerAdapter } from "./facebook/provider";
import type {
  ChannelAccountRecord,
  ChannelProvider,
  ChannelProviderAdapter,
  InboundMessagePayload,
  OutboundMessagePayload,
  SendResult,
} from "./types";

export class OmniChannelManager {
  private adapters: Map<ChannelProvider, ChannelProviderAdapter> = new Map();

  constructor() {
    this.adapters.set("whatsapp_web", new WhatsAppWebAdapter());
    this.adapters.set("instagram", new InstagramAdapter());
    this.adapters.set("mercadolibre", new MercadoLibreAdapter());
    this.adapters.set("facebook_messenger", new FacebookMessengerAdapter());
  }

  getAdapter(provider: ChannelProvider): ChannelProviderAdapter | undefined {
    return this.adapters.get(provider);
  }

  /**
   * Procesa un mensaje entrante de cualquier canal omnicanal
   */
  async processInboundMessage(payload: InboundMessagePayload): Promise<{
    messageId: string;
    conversationId: string;
    contactId: string;
  }> {
    const db = getDb();

    // 1. Obtener la cuenta del canal
    const [channel] = await db
      .select()
      .from(schema.channelAccount)
      .where(eq(schema.channelAccount.id, payload.channelAccountId))
      .limit(1);

    if (!channel) {
      throw new Error(`Canal no encontrado: ${payload.channelAccountId}`);
    }

    const orgId = channel.organizationId;
    const rawDigits = (payload.senderPhone || payload.senderId || "").replace(/\D/g, "");
    const identityKey =
      payload.provider === "whatsapp_web" || payload.platform === "whatsapp"
        ? rawDigits || payload.senderPhone || payload.senderId
        : `${payload.platform}:${payload.senderId}`;

    // 2. Buscar o crear el contacto
    let contactId: string;
    const [foundContact] = await db
      .select()
      .from(schema.contact)
      .where(
        scoped(
          schema.contact.organizationId,
          orgId,
          or(
            eq(schema.contact.waIdentity, identityKey),
            eq(schema.contact.waIdentity, payload.senderId),
            rawDigits ? eq(schema.contact.waIdentity, rawDigits) : undefined,
            rawDigits ? eq(schema.contact.waIdentity, `+${rawDigits}`) : undefined,
            rawDigits ? eq(schema.contact.phone, rawDigits) : undefined,
            rawDigits ? eq(schema.contact.phone, `+${rawDigits}`) : undefined,
            rawDigits
              ? sql`regexp_replace(coalesce(${schema.contact.phone}, ''), '\\D', '', 'g') = ${rawDigits}`
              : undefined
          )
        )
      )
      .limit(1);

    if (!foundContact) {
      contactId = newId("contact");
      await db.insert(schema.contact).values({
        id: contactId,
        organizationId: orgId,
        channelAccountId: channel.id,
        platform: payload.platform,
        externalId: payload.senderId,
        waIdentity: identityKey,
        phone: payload.senderPhone || null,
        name: payload.senderName || `${payload.platform.toUpperCase()} User`,
        source: "organico",
      });

      // Crear lead en la primera etapa del pipeline
      const [firstStage] = await db
        .select()
        .from(schema.pipelineStage)
        .where(scoped(schema.pipelineStage.organizationId, orgId))
        .orderBy(schema.pipelineStage.position)
        .limit(1);

      if (firstStage) {
        await db.insert(schema.lead).values({
          id: newId("lead"),
          organizationId: orgId,
          contactId: contactId,
          stageId: firstStage.id,
          position: 0,
        });
      }
    } else {
      contactId = foundContact.id;
    }

    const isOutbound = payload.direction === "out";
    const msgTimestamp = payload.timestamp || new Date();

    // 3. Idempotencia primero: el polling de WhatsApp Web puede reenviar el mismo
    // mensaje; si ya existe, salir sin tocar unread ni timestamps de conversación.
    const extId = payload.externalMessageId || `ext_${Date.now()}_${Math.random()}`;
    if (payload.externalMessageId) {
      const [existingMsg] = await db
        .select({
          id: schema.message.id,
          conversationId: schema.message.conversationId,
        })
        .from(schema.message)
        .where(
          scoped(
            schema.message.organizationId,
            orgId,
            eq(schema.message.externalMessageId, extId)
          )
        )
        .limit(1);
      if (existingMsg) {
        return {
          messageId: existingMsg.id,
          conversationId: existingMsg.conversationId,
          contactId,
        };
      }
    }

    // 4. Buscar o crear la conversación (solo para mensajes genuinamente nuevos)
    let convId: string;
    let convUnreadCount = 0;
    const [foundConv] = await db
      .select()
      .from(schema.conversation)
      .where(
        scoped(
          schema.conversation.organizationId,
          orgId,
          eq(schema.conversation.contactId, contactId),
          eq(schema.conversation.isTest, false)
        )
      )
      .limit(1);

    if (!foundConv) {
      convId = newId("conversation");
      convUnreadCount = isOutbound ? 0 : 1;
      await db.insert(schema.conversation).values({
        id: convId,
        organizationId: orgId,
        contactId: contactId,
        channelAccountId: channel.id,
        platform: payload.platform,
        aiEnabled: true,
        unreadCount: convUnreadCount,
        lastInboundAt: isOutbound ? null : msgTimestamp,
        lastMessageAt: msgTimestamp,
      });
    } else {
      convId = foundConv.id;
      convUnreadCount = isOutbound
        ? (foundConv.unreadCount || 0)
        : (foundConv.unreadCount || 0) + 1;
      await db
        .update(schema.conversation)
        .set({
          channelAccountId: channel.id,
          platform: payload.platform,
          unreadCount: isOutbound
            ? foundConv.unreadCount
            : sql`${schema.conversation.unreadCount} + 1`,
          lastInboundAt: isOutbound ? foundConv.lastInboundAt : msgTimestamp,
          lastMessageAt: msgTimestamp,
          updatedAt: new Date(),
        })
        .where(
          scoped(
            schema.conversation.organizationId,
            orgId,
            eq(schema.conversation.id, convId)
          )
        );
    }

    // 5. Guardar el mensaje

    const messageId = newId("message");
    const meta = payload.metadata as Record<string, unknown> | undefined;
    const mimeType =
      payload.mimeType ??
      (typeof meta?.mimetype === "string" ? meta.mimetype : null) ??
      (typeof meta?.mimeType === "string" ? meta.mimeType : null);
    const hasMedia = Boolean(
      payload.mediaUrl ||
        meta?.hasMedia ||
        payload.mediaType
    );
    const mediaKind =
      payload.provider === "whatsapp_web"
        ? normalizeWaWebMediaKind(
            payload.mediaType || (typeof meta?.type === "string" ? meta.type : undefined),
            mimeType,
            hasMedia
          )
        : payload.mediaType ?? null;
    const msgType = mediaKind || (payload.text ? "text" : payload.mediaType || "text");

    await db.insert(schema.message).values({
      id: messageId,
      organizationId: orgId,
      conversationId: convId,
      channelAccountId: channel.id,
      platform: payload.platform,
      externalMessageId: extId,
      waMessageId:
        payload.provider === "whatsapp_web"
          ? extId
          : null,
      direction: isOutbound ? "out" : "in",
      type: msgType,
      text: payload.text || "",
      status: "delivered",
      metadata: payload.metadata || null,
      createdAt: msgTimestamp,
    });

    if (
      payload.provider === "whatsapp_web" &&
      mediaKind &&
      extId
    ) {
      const fileName =
        payload.fileName ??
        (mediaKind === "document" && payload.text?.trim()
          ? payload.text.trim()
          : null);
      void storeWaWebMediaAsset({
        organizationId: orgId,
        messageId,
        waMessageId: extId,
        kind: mediaKind,
        mimeType,
        fileName,
        caption: payload.text || null,
      }).catch(() => null);
    }

    const [savedMsg] = await db
      .select()
      .from(schema.message)
      .where(
        scoped(
          schema.message.organizationId,
          orgId,
          eq(schema.message.id, messageId)
        )
      )
      .limit(1);

    // 6. Publicar eventos en SSE para actualización en vivo de la bandeja
    if (savedMsg) {
      publish(orgId, {
        type: "message.new",
        data: {
          conversationId: convId,
          message: savedMsg,
        },
      });
    }

    publish(orgId, {
      type: "conversation.updated",
      data: {
        conversation: {
          id: convId,
          contactId,
          channelAccountId: channel.id,
          platform: payload.platform,
          unreadCount: convUnreadCount,
          lastInboundAt: isOutbound ? undefined : msgTimestamp.toISOString(),
          lastMessageAt: msgTimestamp.toISOString(),
        },
      },
    });

    // 7. Actualizar actividad de lead y disparar IA (solo para mensajes entrantes)
    if (!isOutbound) {
      await onLeadActivity(orgId, contactId, msgTimestamp);

      if (foundConv?.aiEnabled ?? true) {
        maybeRunAgentTurn(convId).catch((err) => {
          console.error("[OmniChannel] Error ejecutando turno de IA:", err);
        });
      }
    }

    return {
      messageId,
      conversationId: convId,
      contactId,
    };
  }

  /**
   * Envía un mensaje saliente a través del canal correspondiente
   */
  async sendOutboundMessage(
    account: ChannelAccountRecord,
    payload: OutboundMessagePayload
  ): Promise<SendResult> {
    const adapter = this.getAdapter(account.provider);
    if (!adapter) {
      return {
        success: false,
        error: `No hay adaptador registrado para el canal ${account.provider}`,
      };
    }

    return adapter.sendMessage(account, payload);
  }
}

export const omniChannelManager = new OmniChannelManager();
