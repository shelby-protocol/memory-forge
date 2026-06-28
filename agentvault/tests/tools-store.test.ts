import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryStore } from "../src/store.js";
import { register as registerStore } from "../src/tools/store.js";
import { makeMemory } from "./test-helpers.js";
import { autoMerge } from "../src/auto/index.js";

const mockVec = vi.hoisted(() => new Float32Array([0.1, 0.2, 0.3]));

vi.mock("../src/embedding.js", () => ({
  embed: vi.fn().mockResolvedValue(mockVec),
}));
vi.mock("../src/auto/index.js", () => ({
  autoName: vi.fn((content: string) => `Auto: ${content.slice(0, 30)}`),
  autoMerge: vi.fn().mockResolvedValue(null), // Never merge in tests
  suggestTags: vi.fn((_c: string) => ["auto-tag"]),
  inferCategory: vi.fn((_c: string) => "code-pattern"),
}));
vi.mock("../src/storage/local.js", () => ({ saveMemory: vi.fn() }));
vi.mock("../src/storage/shelby.js", () => ({
  uploadMemory: vi.fn().mockResolvedValue(undefined),
}));

// Fix UUID for predictability
vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "fixed-uuid-0001"),
}));

function captureStore(hasPro = false) {
  const store = new MemoryStore();
  let captured: ((params: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>) | null = null;

  const mockServer = {
    registerTool: vi.fn(
      (_name: string, _config: unknown, handler: typeof captured) => {
        captured = handler;
      },
    ),
  } as unknown as McpServer;

  registerStore(mockServer, { store, version: "0.8.2", hasPro });
  return { store, handler: captured! };
}

describe("memory_store tool", () => {
  it("stores a new memory with auto-generated name", async () => {
    const { store, handler } = captureStore();
    const result = await handler({
      content: "Use camelCase for all variables",
      category: "user-preference",
      tags: ["coding-style"],
      priority: 7,
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.success).toBe(true);
    expect(body.memory_id).toBe("fixed-uuid-0001");
    expect(body.name).toContain("Auto:");
    expect(body.preview).toBeDefined();
    expect(store.size()).toBe(1);
  });

  it("uses custom name when provided", async () => {
    const { handler } = captureStore();
    const result = await handler({
      content: "Use camelCase",
      category: "user-preference",
      tags: [],
      priority: 5,
      name: "Custom Name",
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.name).toBe("Custom Name");
  });

  it("auto-tags and infers category when auto_tag is true", async () => {
    const { handler } = captureStore();
    const result = await handler({
      content: "React hooks should use useCallback for memoization",
      category: "general",
      tags: [],
      priority: 5,
      auto_tag: true,
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.suggested_tags).toBeDefined();
    expect(body.inferred_category).toBe("code-pattern");
  });

  it("skips auto-tag when auto_tag is false", async () => {
    const { handler } = captureStore();
    const result = await handler({
      content: "Some content",
      category: "general",
      tags: [],
      priority: 5,
      auto_tag: false,
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.suggested_tags).toBeUndefined();
    expect(body.inferred_category).toBeUndefined();
  });

  it("merges user tags with auto-suggested tags", async () => {
    const { handler } = captureStore();
    const result = await handler({
      content: "TypeScript types",
      category: "general",
      tags: ["my-tag"],
      priority: 5,
      auto_tag: true,
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.suggested_tags).toContain("auto-tag");
  });

  it("handles minimal valid input", async () => {
    const { store, handler } = captureStore();
    const result = await handler({
      content: "Minimal content",
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.success).toBe(true);
    expect(store.size()).toBe(1);
  });

  it("shows Pro hint when 20+ memories and not Pro", async () => {
    const { store, handler } = captureStore(false);
    // Pre-fill with 19 memories + the one being added = 20
    for (let i = 0; i < 19; i++) {
      store.add(makeMemory({ id: `pre-${i}` }));
    }
    const result = await handler({
      content: "Memory number 20",
      category: "general",
      tags: [],
      priority: 5,
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.hint).toContain("Upgrade to Pro");
  });

  it("handles auto-merge when duplicate detected", async () => {
    vi.mocked(autoMerge).mockResolvedValueOnce({
      id: "merged-id",
      name: "Merged Memory",
      content: "Combined content",
      category: "user-preference",
      tags: ["merged"],
      priority: 8,
      vector: [0.1, 0.2, 0.3],
      created_at: new Date().toISOString(),
      access_count: 5,
      last_accessed: null as string | null,
    });
    const { handler } = captureStore();
    const result = await handler({
      content: "Duplicate-like content",
      category: "user-preference",
      tags: [],
      priority: 5,
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.merged).toBe(true);
    expect(body.memory_id).toBe("merged-id");
  });
});
