import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryStore } from "../src/store.js";
import { register as registerUpdate } from "../src/tools/update.js";
import { makeMemory } from "./test-helpers.js";

const mockVec = vi.hoisted(() => new Float32Array([0.1, 0.2, 0.3]));

vi.mock("../src/embedding.js", () => ({
  embed: vi.fn().mockResolvedValue(mockVec),
}));
vi.mock("../src/auto/index.js", () => ({
  autoName: vi.fn((content: string) => `Auto: ${content.slice(0, 30)}`),
  suggestTags: vi.fn((_c: string) => ["auto-tag"]),
  inferCategory: vi.fn((_c: string) => "code-pattern"),
}));
vi.mock("../src/storage/local.js", () => ({ saveMemory: vi.fn() }));
vi.mock("../src/storage/shelby.js", () => ({
  uploadMemory: vi.fn().mockResolvedValue(undefined),
}));

function captureUpdate() {
  const store = new MemoryStore();
  let captured:
    | ((params: Record<string, unknown>) => Promise<{
        content: Array<{ type: string; text: string }>;
      }>)
    | null = null;

  const mockServer = {
    registerTool: vi.fn((_name: string, _config: unknown, handler: typeof captured) => {
      captured = handler;
    }),
  } as unknown as McpServer;

  registerUpdate(mockServer, { store, version: "0.8.2", hasPro: false });
  return { store, handler: captured! };
}

describe("memory_update tool", () => {
  it("updates content of existing memory", async () => {
    const { store, handler } = captureUpdate();
    store.add(
      makeMemory({
        id: "up-1",
        name: "Old Name",
        content: "Old content",
        category: "general",
        tags: ["old"],
        priority: 5,
        vector: [0.1, 0.2, 0.3],
      }),
    );
    const result = await handler({
      memory_id: "up-1",
      content: "New updated content here",
      auto_tag: false,
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.success).toBe(true);
    expect(body.memory_id).toBe("up-1");
    expect(body.updated_fields).toContain("content");
    const mem = store.get("up-1")!;
    expect(mem.content).toBe("New updated content here");
    expect(mem.name).toContain("Auto:");
    expect(mem.access_count).toBe(1);
  });

  it("updates category only", async () => {
    const { store, handler } = captureUpdate();
    store.add(makeMemory({ id: "up-2", category: "general" }));
    const result = await handler({ memory_id: "up-2", category: "decision-log" });
    const body = JSON.parse(result.content[0].text);
    expect(body.success).toBe(true);
    expect(store.get("up-2")!.category).toBe("decision-log");
    expect(body.updated_fields).toContain("category");
  });

  it("updates tags only", async () => {
    const { store, handler } = captureUpdate();
    store.add(makeMemory({ id: "up-3", tags: ["a"] }));
    const result = await handler({ memory_id: "up-3", tags: ["b", "c"] });
    const body = JSON.parse(result.content[0].text);
    expect(body.success).toBe(true);
    expect(store.get("up-3")!.tags).toEqual(["b", "c"]);
    expect(body.updated_fields).toContain("tags");
  });

  it("updates priority only", async () => {
    const { store, handler } = captureUpdate();
    store.add(makeMemory({ id: "up-4", priority: 1 }));
    const result = await handler({ memory_id: "up-4", priority: 9 });
    const body = JSON.parse(result.content[0].text);
    expect(body.success).toBe(true);
    expect(store.get("up-4")!.priority).toBe(9);
    expect(body.updated_fields).toContain("priority");
  });

  it("updates name without content change", async () => {
    const { store, handler } = captureUpdate();
    store.add(makeMemory({ id: "up-5", name: "Old" }));
    const result = await handler({ memory_id: "up-5", name: "New Name" });
    const body = JSON.parse(result.content[0].text);
    expect(body.success).toBe(true);
    expect(store.get("up-5")!.name).toBe("New Name");
  });

  it("returns error for nonexistent memory", async () => {
    const { handler } = captureUpdate();
    const result = await handler({ memory_id: "no-such", content: "test" });
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toBe("Not found");
    expect(body.hint).toContain("memory_list");
  });

  it("returns error when no fields to update", async () => {
    const { store, handler } = captureUpdate();
    store.add(makeMemory({ id: "up-6" }));
    const result = await handler({ memory_id: "up-6" });
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toBe("No fields to update");
    expect(body.hint).toContain("content, category, tags, priority");
  });

  it("auto-tags when updating content with auto_tag true", async () => {
    const { store, handler } = captureUpdate();
    store.add(makeMemory({ id: "up-7", content: "old", tags: ["existing"] }));
    const result = await handler({
      memory_id: "up-7",
      content: "TypeScript generics pattern",
      auto_tag: true,
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.suggested_tags).toBeDefined();
    expect(body.success).toBe(true);
  });

  it("infers category when auto_tag true and category not set", async () => {
    const { store, handler } = captureUpdate();
    store.add(makeMemory({ id: "up-8", content: "old", category: "general" }));
    const result = await handler({
      memory_id: "up-8",
      content: "Use React.memo for optimization",
      auto_tag: true,
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.inferred_category).toBe("code-pattern");
  });

  it("updates multiple fields at once", async () => {
    const { store, handler } = captureUpdate();
    store.add(makeMemory({ id: "up-9", content: "old", category: "a", tags: ["x"] }));
    const result = await handler({
      memory_id: "up-9",
      content: "New",
      category: "b",
      tags: ["y"],
      priority: 3,
      auto_tag: false,
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.success).toBe(true);
    expect(body.updated_fields.length).toBeGreaterThanOrEqual(3);
    const mem = store.get("up-9")!;
    expect(mem.content).toBe("New");
    expect(mem.category).toBe("b");
    expect(mem.tags).toEqual(["y"]);
    expect(mem.priority).toBe(3);
  });
});
