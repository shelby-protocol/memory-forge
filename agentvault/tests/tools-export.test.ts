import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryStore } from "../src/store.js";
import type { ToolOptions } from "../src/tools/types.js";
import { register as registerExport } from "../src/tools/export.js";
import { makeMemory } from "./test-helpers.js";

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

describe("memory_export tool", () => {
  it("returns empty message for empty store", async () => {
    const { handler } = captureTool(registerExport);
    const result = await handler({ format: "json" });
    const body = JSON.parse(result.content[0].text);
    expect(body.exported).toBe(0);
    expect(body.message).toBe("No memories to export.");
  });

  it("exports all memories as JSON", async () => {
    const { store, handler } = captureTool(registerExport);
    store.add(
      makeMemory({ id: "e1", name: "Alpha", content: "Content A", category: "cat-a", tags: ["x"] }),
    );
    store.add(
      makeMemory({ id: "e2", name: "Beta", content: "Content B", category: "cat-b", tags: ["y"] }),
    );
    const result = await handler({ format: "json" });
    // Free user gets JSON + Pro hint appended; extract JSON portion
    const jsonPart = result.content[0].text.split(/\n{2,}💡/)[0];
    const body = JSON.parse(jsonPart);
    expect(body.count).toBe(2);
    expect(body.version).toBe("memory-forge-0.8.2");
    expect(body.exported_at).toBeDefined();
    expect(body.memories.some((m: Record<string, unknown>) => m.name === "Alpha")).toBe(true);
    expect(body.memories.some((m: Record<string, unknown>) => m.name === "Beta")).toBe(true);
  });

  it("exports specific memories by IDs", async () => {
    const { store, handler } = captureTool(registerExport);
    store.add(makeMemory({ id: "e1", name: "Alpha" }));
    store.add(makeMemory({ id: "e2", name: "Beta" }));
    store.add(makeMemory({ id: "e3", name: "Gamma" }));
    const result = await handler({ memory_ids: ["e1", "e3"], format: "json" });
    const jsonPart = result.content[0].text.split(/\n{2,}💡/)[0];
    const body = JSON.parse(jsonPart);
    expect(body.count).toBe(2);
    expect(body.memories.some((m: Record<string, unknown>) => m.name === "Alpha")).toBe(true);
    expect(body.memories.some((m: Record<string, unknown>) => m.name === "Gamma")).toBe(true);
    expect(body.memories.some((m: Record<string, unknown>) => m.name === "Beta")).toBe(false);
  });

  it("skips nonexistent memory_ids gracefully", async () => {
    const { store, handler } = captureTool(registerExport);
    store.add(makeMemory({ id: "e1" }));
    const result = await handler({ memory_ids: ["e1", "no-exist"], format: "json" });
    const jsonPart = result.content[0].text.split(/\n{2,}💡/)[0];
    const body = JSON.parse(jsonPart);
    expect(body.count).toBe(1);
  });

  it("exports as Markdown format", async () => {
    const { store, handler } = captureTool(registerExport);
    store.add(
      makeMemory({
        id: "md1",
        name: "Coding Style",
        content: "Use tabs not spaces",
        tags: ["style"],
        category: "user-preference",
        priority: 7,
      }),
    );
    const result = await handler({ format: "markdown" });
    expect(result.content[0].text).toContain("# Coding Style");
    expect(result.content[0].text).toContain("Use tabs not spaces");
    expect(result.content[0].text).toContain("> category:");
    expect(result.content[0].text).toContain("---");
  });

  it("shows Pro hint for free users", async () => {
    const { handler } = captureTool(registerExport, false);
    const result = await handler({ format: "json" });
    expect(result.content[0].text).toContain("Pro auto-syncs");
  });

  it("no Pro hint for Pro users", async () => {
    const { store, handler } = captureTool(registerExport, true);
    store.add(makeMemory({ id: "p1" }));
    const result = await handler({ format: "json" });
    expect(result.content[0].text).not.toContain("Pro auto-syncs");
  });
});
