import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryStore } from "../src/store.js";
import type { ToolOptions } from "../src/tools/types.js";
import { register as registerList } from "../src/tools/list.js";
import { makeMemory } from "./test-helpers.js";

function captureTool(register: (server: McpServer, opts: ToolOptions) => void) {
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

  register(mockServer, { store, version: "0.8.2", hasPro: false });
  return { store, handler: capturedHandler! };
}

describe("memory_list tool", () => {
  it("returns empty list for empty store", async () => {
    const { handler } = captureTool(registerList);
    const result = await handler({ limit: 10, offset: 0 });
    const body = JSON.parse(result.content[0].text);
    expect(body.total).toBe(0);
    expect(body.count).toBe(0);
    expect(body.memories).toEqual([]);
  });

  it("lists all memories", async () => {
    const { store, handler } = captureTool(registerList);
    store.add(makeMemory({ id: "a", name: "Alpha" }));
    store.add(makeMemory({ id: "b", name: "Beta" }));
    store.add(makeMemory({ id: "c", name: "Gamma" }));
    const result = await handler({ limit: 10, offset: 0 });
    const body = JSON.parse(result.content[0].text);
    expect(body.total).toBe(3);
    expect(body.count).toBe(3);
    expect(body.memories).toHaveLength(3);
  });

  it("filters by category", async () => {
    const { store, handler } = captureTool(registerList);
    store.add(makeMemory({ id: "a", category: "decision-log" }));
    store.add(makeMemory({ id: "b", category: "code-pattern" }));
    store.add(makeMemory({ id: "c", category: "decision-log" }));
    const result = await handler({ category: "decision-log", limit: 10, offset: 0 });
    const body = JSON.parse(result.content[0].text);
    expect(body.total).toBe(2);
    expect(body.count).toBe(2);
  });

  it("filters by tags", async () => {
    const { store, handler } = captureTool(registerList);
    store.add(makeMemory({ id: "a", tags: ["react"] }));
    store.add(makeMemory({ id: "b", tags: ["vue"] }));
    store.add(makeMemory({ id: "c", tags: ["react", "typescript"] }));
    const result = await handler({ tags: ["react"], limit: 10, offset: 0 });
    const body = JSON.parse(result.content[0].text);
    expect(body.total).toBe(2);
  });

  it("paginates with limit and offset", async () => {
    const { store, handler } = captureTool(registerList);
    for (let i = 0; i < 10; i++) {
      store.add(makeMemory({ id: `p-${i}` }));
    }
    const page1 = await handler({ limit: 3, offset: 0 });
    const body1 = JSON.parse(page1.content[0].text);
    expect(body1.count).toBe(3);
    expect(body1.total).toBe(10);

    const page4 = await handler({ limit: 3, offset: 9 });
    const body4 = JSON.parse(page4.content[0].text);
    expect(body4.count).toBe(1);

    const emptyPage = await handler({ limit: 3, offset: 20 });
    const bodyEmpty = JSON.parse(emptyPage.content[0].text);
    expect(bodyEmpty.count).toBe(0);
  });

  it("includes preview truncated content", async () => {
    const { store, handler } = captureTool(registerList);
    store.add(
      makeMemory({
        id: "long",
        content: "A".repeat(500),
      }),
    );
    const result = await handler({ limit: 1, offset: 0 });
    const body = JSON.parse(result.content[0].text);
    expect(body.memories[0].preview.length).toBeLessThanOrEqual(300); // safeTruncate
  });

  it("returns metadata for each memory", async () => {
    const { store, handler } = captureTool(registerList);
    store.add(makeMemory({ id: "meta-test", access_count: 42, priority: 3 }));
    const result = await handler({ limit: 10, offset: 0 });
    const body = JSON.parse(result.content[0].text);
    const mem = body.memories.find((m: Record<string, unknown>) => m.memory_id === "meta-test");
    expect(mem.access_count).toBe(42);
    expect(mem.priority).toBe(3);
    expect(mem.memory_id).toBe("meta-test");
    expect(mem.name).toBeDefined();
    expect(mem.created_at).toBeDefined();
  });
});
