/**
 * Tests for memory_health MCP tool.
 */
import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryStore } from "../src/store.js";
import { register as registerHealth } from "../src/tools/health.js";

vi.mock("../src/pro.js", () => ({
  proStatus: vi.fn().mockReturnValue({
    active: true,
    address: "0xtest1234",
    lastSync: "2026-06-30T10:00:00Z",
    totalUploaded: 10,
    totalDownloaded: 5,
    totalFailed: 0,
    totalConflicts: 1,
    conflictCount: 1,
    queueSize: 0,
    localCount: 42,
    apiKeyValid: true,
    profileValid: true,
    keyBackedUp: false,
  }),
}));

vi.mock("../src/sync-queue.js", () => ({
  SyncQueue: class {
    size() {
      return 0;
    }
  },
}));

vi.mock("../src/storage/shelby.js", () => ({
  getBalances: vi.fn().mockResolvedValue({ apt: "1.5000", shelbyUsd: "10.0000" }),
  getShelbyConfig: vi.fn().mockReturnValue({ apiKey: "test", namespace: "test" }),
  isAuthFailed: vi.fn().mockReturnValue(false),
}));

describe("memory_health tool", () => {
  it("returns health report with all required fields", async () => {
    const store = new MemoryStore();

    let capturedHandler:
      | ((params: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>)
      | null = null;

    const mockServer = {
      registerTool: vi.fn((_name: string, _config: unknown, handler: typeof capturedHandler) => {
        capturedHandler = handler;
      }),
    } as unknown as McpServer;

    registerHealth(mockServer, {
      store,
      version: "0.13.3",
      hasPro: true,
      projectHash: null,
      projectName: null,
      scopedStore: null as any,
    });

    const result = await capturedHandler!({});
    const body = JSON.parse(result.content[0].text);

    expect(body.pro_active).toBe(true);
    expect(body.profile_valid).toBe(true);
    expect(body.last_sync).toBe("2026-06-30T10:00:00Z");
    expect(body.pending_operations).toBe(0);
    expect(body.conflict_records).toBe(1);
    expect(body.total_uploaded).toBe(10);
    expect(body.total_downloaded).toBe(5);
    expect(body.total_failed).toBe(0);
    expect(body.total_sync_conflicts).toBe(1);
    expect(body.key_backed_up).toBe(false);
    expect(body.address).toBe("0xtest1234");
    expect(body.local_count).toBe(42);
    expect(body.balances).toBeDefined();
    expect(body.balances.apt).toBe("1.5000");
    expect(body.balances.shelby_usd).toBe("10.0000");
    expect(body.balances.apt_low).toBe(false);
    expect(body.balances.usd_low).toBe(false);
  });

  it("returns null balances when not pro", async () => {
    let capturedHandler:
      | ((params: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>)
      | null = null;

    const mockServer = {
      registerTool: vi.fn((_name: string, _config: unknown, handler: typeof capturedHandler) => {
        capturedHandler = handler;
      }),
    } as unknown as McpServer;

    registerHealth(mockServer, {
      store: new MemoryStore(),
      version: "0.13.3",
      hasPro: false,
      projectHash: null,
      projectName: null,
      scopedStore: null as any,
    });

    const result = await capturedHandler!({});
    const body = JSON.parse(result.content[0].text);
    expect(body.balances).toBeNull();
  });

  it("reports low balances correctly", async () => {
    const { getBalances } = await import("../src/storage/shelby.js");
    vi.mocked(getBalances).mockResolvedValue({ apt: "0.0000", shelbyUsd: "0.5000" });

    let capturedHandler:
      | ((params: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>)
      | null = null;

    const mockServer = {
      registerTool: vi.fn((_name: string, _config: unknown, handler: typeof capturedHandler) => {
        capturedHandler = handler;
      }),
    } as unknown as McpServer;

    registerHealth(mockServer, {
      store: new MemoryStore(),
      version: "0.13.3",
      hasPro: true,
      projectHash: null,
      projectName: null,
      scopedStore: null as any,
    });

    const result = await capturedHandler!({});
    const body = JSON.parse(result.content[0].text);
    expect(body.balances.apt_low).toBe(true);
    expect(body.balances.usd_low).toBe(true);
  });
});
