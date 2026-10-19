import { eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { ChannelAccountRecord } from "@/server/channels/types";

/**
 * Credenciales OAuth de MercadoLibre cifradas en
 * `channel_account.credentials_*`. El `access_token` dura ~6 h; se renueva
 * con el refresh_token antes de cada llamada si está por vencer.
 */

export type MeliOAuthSecrets = {
  appId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken: string;
  /** Epoch ms; renovar cuando Date.now() >= expiresAt. */
  expiresAt: number;
};

export type MeliChannelPublicMeta = {
  sellerId?: string;
};

const BUFFER_MS = 60_000;

export function encryptMeliSecrets(secrets: MeliOAuthSecrets): {
  credentialsCipher: string;
  credentialsIv: string;
  credentialsTag: string;
} {
  const enc = encryptSecret(JSON.stringify(secrets));
  return {
    credentialsCipher: enc.cipher,
    credentialsIv: enc.iv,
    credentialsTag: enc.tag,
  };
}

export function decryptMeliSecrets(account: {
  credentialsCipher?: string | null;
  credentialsIv?: string | null;
  credentialsTag?: string | null;
}): MeliOAuthSecrets | null {
  if (
    !account.credentialsCipher ||
    !account.credentialsIv ||
    !account.credentialsTag
  ) {
    return null;
  }
  try {
    const raw = decryptSecret({
      cipher: account.credentialsCipher,
      iv: account.credentialsIv,
      tag: account.credentialsTag,
    });
    const parsed = JSON.parse(raw) as Partial<MeliOAuthSecrets>;
    if (
      typeof parsed.appId !== "string" ||
      typeof parsed.clientSecret !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.accessToken !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    return {
      appId: parsed.appId,
      clientSecret: parsed.clientSecret,
      refreshToken: parsed.refreshToken,
      accessToken: parsed.accessToken,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

/** Legacy: token en claro en metadata (instalaciones anteriores). */
export function legacyAccessTokenFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  const token = metadata?.accessToken;
  return typeof token === "string" && token.trim() ? token.trim() : null;
}

export function publicChannelMetadata(
  metadata: Record<string, unknown> | null | undefined
): MeliChannelPublicMeta | null {
  if (!metadata) return null;
  const sellerId =
    typeof metadata.sellerId === "string"
      ? metadata.sellerId
      : typeof metadata.sellerId === "number"
        ? String(metadata.sellerId)
        : undefined;
  return sellerId ? { sellerId } : {};
}

/** Quita secretos de la fila antes de devolverla a la UI. */
export function publicChannelAccount<
  T extends {
    credentialsCipher?: string | null;
    credentialsIv?: string | null;
    credentialsTag?: string | null;
    metadata?: Record<string, unknown> | null;
    provider: string;
  },
>(row: T): Omit<T, "credentialsCipher" | "credentialsIv" | "credentialsTag"> & {
  hasCredentials: boolean;
  metadata: Record<string, unknown> | null;
} {
  const {
    credentialsCipher: _c,
    credentialsIv: _i,
    credentialsTag: _t,
    ...rest
  } = row;
  const hasCredentials = Boolean(row.credentialsCipher);
  const metadata =
    row.provider === "mercadolibre"
      ? (publicChannelMetadata(row.metadata) as Record<string, unknown> | null)
      : stripSensitiveMetadata(row.metadata);
  return {
    ...(rest as Omit<
      T,
      "credentialsCipher" | "credentialsIv" | "credentialsTag"
    >),
    hasCredentials,
    metadata,
  };
}

function stripSensitiveMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!metadata) return null;
  const {
    accessToken: _a,
    refreshToken: _r,
    secret: _s,
    clientSecret: _cs,
    ...safe
  } = metadata;
  return safe;
}

type RefreshResult = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId?: string;
};

export async function refreshMeliAccessToken(input: {
  appId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<RefreshResult> {
  const res = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: input.appId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user_id?: number | string;
    message?: string;
    error?: string;
  };
  if (!res.ok || !data.access_token || !data.refresh_token) {
    throw new Error(
      data.message || data.error || "No se pudo renovar el token de MercadoLibre"
    );
  }
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 21600;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + expiresIn * 1000 - BUFFER_MS,
    userId: data.user_id != null ? String(data.user_id) : undefined,
  };
}

/**
 * Devuelve un access_token válido; renueva y persiste si hace falta.
 * Soporta filas legacy con token solo en metadata (sin renovación).
 */
export async function resolveMeliAccessToken(
  account: ChannelAccountRecord
): Promise<string | null> {
  const secrets = decryptMeliSecrets(account);
  if (secrets) {
    if (Date.now() < secrets.expiresAt && secrets.accessToken) {
      return secrets.accessToken;
    }
    try {
      const refreshed = await refreshMeliAccessToken({
        appId: secrets.appId,
        clientSecret: secrets.clientSecret,
        refreshToken: secrets.refreshToken,
      });
      const next: MeliOAuthSecrets = {
        appId: secrets.appId,
        clientSecret: secrets.clientSecret,
        refreshToken: refreshed.refreshToken,
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresAt,
      };
      await persistMeliSecrets(account.id, account.organizationId, next);
      return next.accessToken;
    } catch {
      await markMeliDisconnected(account.id, account.organizationId);
      return null;
    }
  }

  return legacyAccessTokenFromMetadata(account.metadata);
}

export async function persistMeliSecrets(
  channelId: string,
  organizationId: string,
  secrets: MeliOAuthSecrets
): Promise<void> {
  const enc = encryptMeliSecrets(secrets);
  const db = getDb();
  await db
    .update(schema.channelAccount)
    .set({
      ...enc,
      status: "connected",
      errorMessage: null,
      lastConnectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      scoped(
        schema.channelAccount.organizationId,
        organizationId,
        eq(schema.channelAccount.id, channelId)
      )
    );
}

async function markMeliDisconnected(
  channelId: string,
  organizationId: string
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.channelAccount)
    .set({
      status: "disconnected",
      errorMessage: "El token de MercadoLibre expiró: vuelve a vincular la cuenta",
      updatedAt: new Date(),
    })
    .where(
      scoped(
        schema.channelAccount.organizationId,
        organizationId,
        eq(schema.channelAccount.id, channelId)
      )
    );
}

/** Alta o re-vinculación: valida OAuth, cifra y deja la cuenta connected. */
export async function provisionMeliCredentials(input: {
  appId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<{ secrets: MeliOAuthSecrets; sellerIdFromToken?: string }> {
  const refreshed = await refreshMeliAccessToken({
    appId: input.appId.trim(),
    clientSecret: input.clientSecret.trim(),
    refreshToken: input.refreshToken.trim(),
  });
  return {
    secrets: {
      appId: input.appId.trim(),
      clientSecret: input.clientSecret.trim(),
      refreshToken: refreshed.refreshToken,
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
    },
    sellerIdFromToken: refreshed.userId,
  };
}
