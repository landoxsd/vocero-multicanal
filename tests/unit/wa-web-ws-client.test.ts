import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveManagerWsUrl,
  stopWaWebManagerSocketForTests,
} from "@/server/channels/whatsapp-web/ws-client";

describe("resolveManagerWsUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    stopWaWebManagerSocketForTests();
  });

  it("deriva ws desde WA_WEB_MANAGER_URL", () => {
    vi.stubEnv("WA_WEB_MANAGER_URL", "http://whatsapp-web-manager:3005");
    expect(resolveManagerWsUrl()).toBe("ws://whatsapp-web-manager:3005/ws/events");
  });

  it("respeta WA_WEB_MANAGER_WS_URL explícita", () => {
    vi.stubEnv("WA_WEB_MANAGER_WS_URL", "ws://custom:4000/events");
    vi.stubEnv("WA_WEB_MANAGER_URL", "http://ignored:3005");
    expect(resolveManagerWsUrl()).toBe("ws://custom:4000/events");
  });

  it("null si WS deshabilitado", () => {
    vi.stubEnv("WA_WEB_MANAGER_URL", "http://localhost:3005");
    vi.stubEnv("WA_WEB_MANAGER_WS_ENABLED", "false");
    expect(resolveManagerWsUrl()).toBeNull();
  });

  it("null sin URL de manager", () => {
    vi.stubEnv("WA_WEB_MANAGER_URL", "");
    expect(resolveManagerWsUrl()).toBeNull();
  });
});
