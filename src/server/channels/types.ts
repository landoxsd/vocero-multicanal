export type ChannelProvider =
  | "whatsapp_web"
  | "whatsapp_cloud"
  | "instagram"
  | "mercadolibre"
  | "facebook_messenger";

export type ChannelStatus =
  | "connected"
  | "connecting"
  | "scan_qr"
  | "disconnected"
  | "error";

export type PlatformType = "whatsapp" | "instagram" | "mercadolibre" | "facebook";

export interface ChannelAccountRecord {
  id: string;
  organizationId: string;
  provider: ChannelProvider;
  name: string;
  status: ChannelStatus;
  phoneNumber?: string | null;
  accountIdentifier?: string | null;
  qrCode?: string | null;
  credentialsCipher?: string | null;
  credentialsIv?: string | null;
  credentialsTag?: string | null;
  metadata?: Record<string, unknown> | null;
  errorMessage?: string | null;
  lastConnectedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InboundMessagePayload {
  channelAccountId: string;
  provider: ChannelProvider;
  platform: PlatformType;
  senderId: string;
  senderName: string;
  senderPhone?: string;
  direction?: "in" | "out";
  text?: string;
  externalMessageId?: string;
  mediaUrl?: string;
  mediaType?: "image" | "audio" | "video" | "document" | "sticker";
  mimeType?: string;
  fileName?: string;
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

export interface OutboundMessagePayload {
  channelAccountId: string;
  recipientId: string;
  text: string;
  mediaUrl?: string;
  mediaType?: "image" | "audio" | "video" | "document" | "sticker";
  fileName?: string;
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
}

export interface SendResult {
  success: boolean;
  externalMessageId?: string;
  error?: string;
}

export interface ChannelProviderAdapter {
  provider: ChannelProvider;
  sendMessage(
    account: ChannelAccountRecord,
    payload: OutboundMessagePayload
  ): Promise<SendResult>;
  getStatus?(account: ChannelAccountRecord): Promise<ChannelStatus>;
  getQrCode?(account: ChannelAccountRecord): Promise<string | null>;
  disconnect?(account: ChannelAccountRecord): Promise<void>;
}
