import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryStore } from "../src/store.js";
import type { ToolOptions } from "../src/tools/types.js";
import { register as registerRecall } from "../src/tools/recall.js";
import { makeMemory } from "./test-helpers.js";

// Mock saveMemory to avoid filesystem writes
vi.mock("../src/storage/local.js", () => ({ saveMemory: vi.fn() }));

function captureTool(register: (server: McpServer, opts: ToolOptions) => void) {
  const store = new MemoryStore();
  let capturedHandler: ((params: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>) | null = null;

  const mockServer = {
    registerTool: vi.fn(
      (_name: string, _config: unknown, handler: typeof capturedHandler) => {
        capturedHandler = handler;
      },
    ),
  } as unknown as McpServer;

  register(mockServer, { store, version: "0.8.2", hasPro: false });
  return { store, mockServer, handler: capturedHandler! };
}

describe("memory_recall tool", () => {
  it("retrieves memory by ID", async () => {
    const { store, handler } = captureTool(registerRecall);
    store.add(
      makeMemory({
        id: "recall-1",
        name: "Important Config",
        content: "DB_HOST=localhost",
        category: "project-context",
        tags: ["config"],
        priority: 8,
      }),
    );
    const result = await handler({ memory_id: "recall-1" });
    const body = JSON.parse(result.content[0].text);
    expect(body.memory_id).toBe("recall-1");
    expect(body.name).toBe("Important Config");
    expect(body.content).toBe("DB_HOST=localhost");
    expect(body.category).toBe("project-context");
    expect(body.tags).toEqual(["config"]);
    expect(body.priority).toBe(8);
    expect(body.access_count).toBe(1); // touched
  });

  it("increments access_count on recall", async () => {
    const { store, handler } = captureTool(registerRecall);
    store.add(makeMemory({ id: "recall-2", access_count: 5 }));
    await handler({ memory_id: "recall-2" });
    expect(store.get("recall-2")!.access_count).toBe(6);
  });

  it("returns error for nonexistent memory", async () => {
    const { handler } = captureTool(registerRecall);
    const result = await handler({ memory_id: "no-such-id" });
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toBe("Not found");
    expect(body.memory_id).toBe("no-such-id");
  });
});
