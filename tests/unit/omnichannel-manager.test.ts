import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMock = vi.fn();
const insertMock = vi.fn().mockResolvedValue(undefined);
const publishMock = vi.fn();

function makeChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "where", "orderBy"]) {
    chain[m] = () => chain;
  }
  chain.limit = () => Promise.resolve(rows);
  return chain;
}

const selectRows: unknown[][] = [];

vi.mock("@/server/channels/whatsapp-web/provider", () => ({
  WhatsAppWebAdapter: class {},
}));
vi.mock("@/server/channels/instagram/provider", () => ({
  InstagramAdapter: class {},
}));
vi.mock("@/server/channels/mercadolibre/provider", () => ({
  MercadoLibreAdapter: class {},
}));
vi.mock("@/server/channels/facebook/provider", () => ({
  FacebookMessengerAdapter: class {},
}));
vi.mock("@/server/events/bus", () => ({ publish: publishMock }));
vi.mock("@/server/inbox/lead-activity", () => ({
  onLeadActivity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/server/ai/trigger", () => ({
  maybeRunAgentTurn: vi.fn(),
}));
vi.mock("@/lib/db/ids", () => ({
  newId: (prefix: string) => `${prefix}_new`,
}));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    getDb: () => ({
      select: () => makeChain(selectRows.shift() ?? []),
      insert: insertMock,
      update: (...args: unknown[]) => {
        updateMock(...args);
        return {
          set: () => ({
            where: () => Promise.resolve(undefined),
          }),
        };
      },
    }),
  };
});

describe("OmniChannelManager.processInboundMessage", () => {
  beforeEach(() => {
    selectRows.length = 0;
    updateMock.mockClear();
    insertMock.mockClear();
    publishMock.mockClear();
    vi.resetModules();
  });

  it("mensaje duplicado por externalMessageId no incrementa unread ni actualiza conversación", async () => {
    selectRows.push([{ id: "ch_1", organizationId: "org_1" }]);
    selectRows.push([
      {
        id: "ct_1",
        organizationId: "org_1",
        waIdentity: "584121234567",
      },
    ]);
    selectRows.push([
      {
        id: "msg_existing",
        conversationId: "cv_1",
      },
    ]);

    const { omniChannelManager } = await import(
      "@/server/channels/omnichannel-manager"
    );

    const result = await omniChannelManager.processInboundMessage({
      channelAccountId: "ch_1",
      provider: "whatsapp_web",
      platform: "whatsapp",
      senderId: "584121234567",
      senderName: "Cliente",
      senderPhone: "584121234567",
      externalMessageId: "wa_msg_dup_1",
      text: "hola otra vez",
    });

    expect(result).toEqual({
      messageId: "msg_existing",
      conversationId: "cv_1",
      contactId: "ct_1",
    });
    expect(updateMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });
});
