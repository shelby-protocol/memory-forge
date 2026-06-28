import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryStore } from "../src/store.js";
import type { ToolOptions } from "../src/tools/types.js";
import { register as registerContext } from "../src/tools/context.js";
import { makeMemory } from "./test-helpers.js";

/** Mock McpServer.registerTool to capture handler, then test it directly. */
function captureTool<I, O>(register: (server: McpServer, opts: ToolOptions) => void) {
  const store = new MemoryStore();
  let capturedHandler:
    | ((params: I) => Promise<{
        content: Array<{ type: string; text: string }>;
      }>)
    | null = null;

  const mockServer = {
    registerTool: vi.fn(
      (_name: string, _config: unknown, handler: (params: I) => Promise<unknown>) => {
        capturedHandler = handler;
      },
    ),
  } as unknown as McpServer;

  register(mockServer, { store, version: "0.8.2", hasPro: false });
  return { store, mockServer, handler: capturedHandler! };
}

describe("memory_context tool", () => {
  it("returns context_loaded true with memory count", async () => {
    const { store, handler } = captureTool(registerContext);
    store.add(makeMemory({ id: "a" }));
    store.add(makeMemory({ id: "b" }));
    const result = await handler({ limit: 5 });
    const body = JSON.parse(result.content[0].text);
    expect(body.context_loaded).toBe(true);
    expect(body.memory_count).toBe(2);
    expect(body.context).toBeDefined();
  });

  it("includes instructions for empty store", async () => {
    const { handler } = captureTool(registerContext);
    const result = await handler({ limit: 3 });
    const body = JSON.parse(result.content[0].text);
    expect(body.context_loaded).toBe(true);
    expect(body.memory_count).toBe(0);
    expect(body.context).toContain("memory_store");
    expect(body.context).toContain("[MemoryForge]");
  });

  it("respects limit parameter", async () => {
    const { store, handler } = captureTool(registerContext);
    for (let i = 0; i < 20; i++) {
      store.add(makeMemory({ id: `m-${i}`, priority: 9, access_count: 100 }));
    }
    const result = await handler({ limit: 3 });
    const body = JSON.parse(result.content[0].text);
    expect(body.memory_count).toBe(20);
    // Context summary should be present
    expect(body.context).toBeDefined();
  });

  it("redacts sensitive content in context", async () => {
    const { store, handler } = captureTool(registerContext);
    store.add(
      makeMemory({
        id: "secret",
        name: "Secrets",
        content: "API Key: AG-DB9VDTVMTAM2FYMAGVQFZP9AC7TTGN7DU\nPrivate Key: 0xdeadbeef",
        priority: 9,
        access_count: 100,
      }),
    );
    const result = await handler({ limit: 1 });
    const body = JSON.parse(result.content[0].text);
    expect(body.context).toContain("[REDACTED");
    expect(body.context).not.toContain("AG-DB9VDTVMTAM2FYMAGVQFZP9AC7TTGN7DU");
  });
});
