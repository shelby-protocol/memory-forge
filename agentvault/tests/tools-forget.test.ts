import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryStore } from "../src/store.js";
import type { ToolOptions } from "../src/tools/types.js";
import { register as registerForget } from "../src/tools/forget.js";
import { makeMemory } from "./test-helpers.js";

// Mock filesystem and cloud storage
vi.mock("../src/storage/local.js", () => ({ deleteMemoryFile: vi.fn() }));
vi.mock("../src/storage/shelby.js", () => ({
  deleteBlob: vi.fn().mockResolvedValue(undefined),
  getBlobName: vi.fn((id: string) => `blob-${id}`),
}));

function captureTool(register: (server: McpServer, opts: ToolOptions) => void, hasPro = false) {
  const store = new MemoryStore();
  let capturedHandler:
    | ((params: Record<string, unknown>) => Promise<{
        content: Array<{ type: string; text: string }>;
      }>)
    | null = null;

  const mockServer = {
    registerTool: vi.fn((_name: string, _config: unknown, handler: typeof capturedHandler) => {
      capturedHandler = handler;
    }),
  } as unknown as McpServer;

  register(mockServer, { store, version: "0.8.2", hasPro });
  return { store, handler: capturedHandler! };
}

describe("memory_forget tool", () => {
  it("deletes existing memory returns success", async () => {
    const { store, handler } = captureTool(registerForget);
    store.add(makeMemory({ id: "forget-me" }));
    const result = await handler({ memory_id: "forget-me" });
    const body = JSON.parse(result.content[0].text);
    expect(body.success).toBe(true);
    expect(body.action).toBe("deleted");
    expect(body.memory_id).toBe("forget-me");
    expect(store.get("forget-me")).toBeNull();
    expect(store.size()).toBe(0);
  });

  it("returns not_found for nonexistent memory", async () => {
    const { handler } = captureTool(registerForget);
    const result = await handler({ memory_id: "no-such" });
    const body = JSON.parse(result.content[0].text);
    expect(body.success).toBe(false);
    expect(body.action).toBe("not_found");
    expect(body.memory_id).toBe("no-such");
  });

  it("removes memory from store", async () => {
    const { store, handler } = captureTool(registerForget);
    store.add(makeMemory({ id: "f-1" }));
    store.add(makeMemory({ id: "f-2" }));
    await handler({ memory_id: "f-1" });
    expect(store.size()).toBe(1);
    expect(store.get("f-1")).toBeNull();
    expect(store.get("f-2")).not.toBeNull();
  });
});
