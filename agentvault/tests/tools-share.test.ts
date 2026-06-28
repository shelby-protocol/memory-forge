import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryStore } from "../src/store.js";
import type { ToolOptions } from "../src/tools/types.js";
import { register as registerShare } from "../src/tools/share.js";
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

describe("memory_share tool", () => {
  it("packages memory into shareable JSON", async () => {
    const { store, handler } = captureTool(registerShare);
    store.add(
      makeMemory({
        id: "sh-1",
        name: "Deploy Checklist",
        content: "1. Run tests\n2. Build\n3. Push",
        category: "decision-log",
        tags: ["deploy"],
      }),
    );
    const result = await handler({ memory_id: "sh-1" });
    const body = JSON.parse(result.content[0].text);
    expect(body.type).toBe("memory-forge-share");
    expect(body.version).toBe("1.0");
    expect(body.memory.name).toBe("Deploy Checklist");
    expect(body.memory.content).toContain("Run tests");
    expect(body.memory.category).toBe("decision-log");
    expect(body.memory.tags).toEqual(["deploy"]);
    expect(body.import_instruction).toBeDefined();
  });

  it("includes optional recipient and note", async () => {
    const { store, handler } = captureTool(registerShare);
    store.add(makeMemory({ id: "sh-2" }));
    const result = await handler({
      memory_id: "sh-2",
      recipient: "frontend-team",
      note: "Follow this for every deploy",
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.recipient).toBe("frontend-team");
    expect(body.note).toBe("Follow this for every deploy");
  });

  it("returns null for omitted recipient and note", async () => {
    const { store, handler } = captureTool(registerShare);
    store.add(makeMemory({ id: "sh-3" }));
    const result = await handler({ memory_id: "sh-3" });
    const body = JSON.parse(result.content[0].text);
    expect(body.recipient).toBeNull();
    expect(body.note).toBeNull();
  });

  it("increments access_count on share", async () => {
    const { store, handler } = captureTool(registerShare);
    store.add(makeMemory({ id: "sh-4", access_count: 0 }));
    await handler({ memory_id: "sh-4" });
    expect(store.get("sh-4")!.access_count).toBe(1);
  });

  it("returns error for nonexistent memory", async () => {
    const { handler } = captureTool(registerShare);
    const result = await handler({ memory_id: "no-such" });
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toBe("Not found");
    expect(body.hint).toBe("Use memory_list to find the correct ID.");
  });

  it("preserves special characters in content", async () => {
    const { store, handler } = captureTool(registerShare);
    store.add(
      makeMemory({
        id: "sh-5",
        content: "API endpoint: https://api.example.com/v1?token=abc&mode=strict\n`curl -X POST`",
      }),
    );
    const result = await handler({ memory_id: "sh-5" });
    const body = JSON.parse(result.content[0].text);
    expect(body.memory.content).toContain("curl -X POST");
  });
});
