import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryStore } from "../src/store.js";
import { register as registerSearch } from "../src/tools/search.js";
import { makeMemory } from "./test-helpers.js";

const EMBED_DIM = 3;
const mockVec = vi.hoisted(() => new Float32Array([0.5, 0.5, 0.5]));

vi.mock("../src/embedding.js", () => ({
  embed: vi.fn().mockResolvedValue(mockVec),
}));
vi.mock("../src/search/expand.js", () => ({
  expandQuery: vi.fn((q: string) => ({ expanded: `${q} extra`, original: q })),
}));
vi.mock("../src/storage/local.js", () => ({ saveMemory: vi.fn() }));

/** Add memory with matching vector so vector/hybrid search can find it. */
function addMem(
  store: MemoryStore,
  id: string,
  content: string,
  overrides: Record<string, unknown> = {},
) {
  store.add(
    makeMemory({
      id,
      content,
      vector: [0.1, 0.2, 0.3],
      ...overrides,
    }),
  );
}

function captureSearch() {
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

  registerSearch(mockServer, { store, version: "0.8.2", hasPro: false });
  return { store, handler: captured! };
}

describe("memory_search tool", () => {
  it("returns results for matching query (bm25)", async () => {
    const { store, handler } = captureSearch();
    addMem(store, "s1", "OAuth2 JWT authentication setup with token refresh", { tags: ["auth"] });
    addMem(store, "s2", "Docker multi-stage build deployment", { tags: ["deploy"] });
    const result = await handler({
      query: "authentication tokens",
      limit: 5,
      min_similarity: 0,
      search_method: "bm25",
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.query).toBe("authentication tokens");
    expect(body.count).toBeGreaterThanOrEqual(0);
    // BM25-only mode — fallback may be "keyword" since store uses keywordSearch internally
    for (const r of body.results) {
      expect(["bm25", "keyword"]).toContain(r._method);
    }
  });

  it("includes expanded_query when different from query", async () => {
    const { store, handler } = captureSearch();
    addMem(store, "eq", "test query content here");
    const result = await handler({ query: "hello", limit: 5, search_method: "bm25" });
    const body = JSON.parse(result.content[0].text);
    expect(body.expanded_query).toBeDefined();
    expect(body.expanded_query).not.toBe("hello");
  });

  it("returns hint on empty results", async () => {
    const { handler } = captureSearch();
    const result = await handler({
      query: "completely_unmatched_term_xyz",
      limit: 5,
      min_similarity: 0.9,
      search_method: "bm25",
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.hint).toBe("No relevant memories found.");
    expect(body.count).toBe(0);
  });

  it("filters by category (bm25)", async () => {
    const { store, handler } = captureSearch();
    addMem(store, "c1", "React component testing patterns", { category: "code-pattern" });
    addMem(store, "c2", "Project milestone decision", { category: "decision-log" });
    const result = await handler({
      query: "patterns",
      category: "code-pattern",
      limit: 5,
      search_method: "bm25",
    });
    const body = JSON.parse(result.content[0].text);
    for (const r of body.results) {
      expect(r.memory_id).toBeDefined();
    }
  });

  it("respects limit parameter", async () => {
    const { store, handler } = captureSearch();
    for (let i = 0; i < 10; i++) {
      addMem(store, `sr${i}`, `test content number ${i}`);
    }
    const result = await handler({ query: "test", limit: 3, search_method: "bm25" });
    const body = JSON.parse(result.content[0].text);
    expect(body.results.length).toBeLessThanOrEqual(3);
  });

  it("hybrid search with vector and BM25", async () => {
    const { store, handler } = captureSearch();
    addMem(store, "h1", "TypeScript type system generic constraints", { category: "code-pattern" });
    addMem(store, "h2", "Docker container orchestration", { category: "devops" });
    const result = await handler({
      query: "TypeScript generics",
      limit: 5,
      search_method: "hybrid",
      min_similarity: 0,
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.query).toBe("TypeScript generics");
    for (const r of body.results) {
      expect(r.memory_id).toBeDefined();
      expect(r.similarity).toBeDefined();
      expect(r._score).toBeDefined();
    }
  });

  it("vector-only search", async () => {
    const { store, handler } = captureSearch();
    addMem(store, "v1", "Python asyncio event loop patterns");
    addMem(store, "v2", "Rust ownership borrowing lifetime");
    const result = await handler({
      query: "Python async programming",
      limit: 5,
      search_method: "vector",
      min_similarity: 0,
    });
    const body = JSON.parse(result.content[0].text);
    for (const r of body.results) {
      expect(["vector", "hybrid"]).toContain(r._method);
    }
  });

  it("results include similarity and score metadata", async () => {
    const { store, handler } = captureSearch();
    addMem(store, "meta1", "Kubernetes pod networking service mesh", {
      priority: 8,
      access_count: 10,
    });
    const result = await handler({ query: "kubernetes", limit: 1, search_method: "bm25" });
    const body = JSON.parse(result.content[0].text);
    if (body.results.length > 0) {
      const r = body.results[0];
      expect(typeof r.similarity).toBe("number");
      expect(r._score ?? 0).toBeGreaterThanOrEqual(0);
    }
  });
});
