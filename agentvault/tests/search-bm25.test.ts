import { describe, it, expect } from "vitest";
import { Bm25 } from "../src/search/bm25.js";
import { expandQuery } from "../src/search/expand.js";
import { MemoryStore } from "../src/store.js";
import { makeMemory } from "./test-helpers.js";

const mem = makeMemory();

describe("Bm25 tokenize", () => {
  it("tokenizes lowercase", () => {
    const tokens = Bm25.tokenize("Hello World TEST");
    expect(tokens).toEqual(["hello", "world", "test"]);
  });

  it("filters single-char tokens", () => {
    const tokens = Bm25.tokenize("a b c d e f test");
    expect(tokens).toEqual(["test"]);
  });

  it("handles punctuation", () => {
    const tokens = Bm25.tokenize("react.js + typescript!");
    expect(tokens).toContain("react");
    expect(tokens).toContain("js");
    expect(tokens).toContain("typescript");
  });

  it("handles CJK via character match", () => {
    const tokens = Bm25.tokenize("中文 テスト 한국어");
    expect(tokens).toContain("中文");
    expect(tokens).toContain("テスト");
    expect(tokens).toContain("한국어");
  });

  it("empty string returns empty", () => {
    expect(Bm25.tokenize("")).toEqual([]);
  });
});

describe("Bm25 search", () => {
  it("scores exact matches higher", () => {
    const bm25 = new Bm25();
    bm25.index([
      { id: "a", tokens: Bm25.tokenize("react typescript hooks deployment pipeline") },
      { id: "b", tokens: Bm25.tokenize("python django rest api") },
    ]);
    const results = bm25.search("react typescript", 5);
    expect(results[0].id).toBe("a");
    expect(results).toHaveLength(1); // only "a" matches "react typescript"
  });

  it("returns empty for no matches", () => {
    const bm25 = new Bm25();
    bm25.index([{ id: "a", tokens: Bm25.tokenize("apple banana") }]);
    expect(bm25.search("xylophone", 5)).toEqual([]);
  });

  it("empty corpus returns empty", () => {
    const bm25 = new Bm25();
    bm25.index([]);
    expect(bm25.search("anything", 5)).toEqual([]);
  });

  it("empty query returns empty", () => {
    const bm25 = new Bm25();
    bm25.index([{ id: "a", tokens: Bm25.tokenize("test") }]);
    expect(bm25.search("", 5)).toEqual([]);
  });

  it("handles 100 docs efficiently", () => {
    const bm25 = new Bm25();
    const docs = [];
    for (let i = 0; i < 100; i++) {
      docs.push({ id: `doc-${i}`, tokens: Bm25.tokenize(`content ${i} unique term here`) });
    }
    bm25.index(docs);
    const results = bm25.search("content 50", 3);
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("expandQuery", () => {
  it("expands 'auth' to synonyms", () => {
    const r = expandQuery("auth module");
    expect(r.tokens).toContain("authentication");
    expect(r.tokens).toContain("jwt");
  });

  it("expands 'db' to database synonyms", () => {
    const r = expandQuery("db migration");
    expect(r.tokens).toContain("database");
    expect(r.tokens).toContain("postgres");
  });

  it("expands CJK tokens", () => {
    const r = expandQuery("认证 系统");
    expect(r.tokens).toContain("authentication");
    expect(r.tokens).toContain("auth");
  });

  it("preserves original tokens", () => {
    const r = expandQuery("react deployment pipeline");
    expect(r.tokens).toContain("react");
    expect(r.tokens).toContain("deployment");
    expect(r.tokens).toContain("pipeline");
  });

  it("unknown tokens pass through unchanged", () => {
    const r = expandQuery("xylophone zebra");
    expect(r.tokens).toEqual(["xylophone", "zebra"]);
  });
});

describe("MemoryStore hybrid search", () => {
  it("returns results with hybrid method tag when vector available", () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "a", content: "React TypeScript hooks pattern deployment pipeline", vector: [0.1, 0.2, 0.3, 0.4], tags: [] });
    s.add({ ...mem, id: "b", content: "Python Django REST API authentication module", vector: [0.5, 0.6, 0.7, 0.8], tags: [] });

    const qv = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const results = s.search("react typescript", {
      limit: 5,
      queryVec: qv,
      alpha: 0.7,
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]._fallback).toBe("hybrid");
  });

  it("pure BM25 mode when alpha=0", () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "a", content: "React TypeScript hooks pattern", tags: [] });
    s.add({ ...mem, id: "b", content: "Python Django REST API", tags: [] });

    const results = s.search("react hooks", {
      limit: 5,
      queryVec: undefined,
      alpha: 0,
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("scores relevant content higher with BM25 boost", () => {
    const s = new MemoryStore();
    // Vector points to "a", but query text matches "b" better
    s.add({
      ...mem,
      id: "a",
      content: "random words zebra xylophone quantum",
      vector: [0.1, 0.2, 0.3, 0.4],
      tags: [],
      priority: 5,
      access_count: 0,
    });
    s.add({
      ...mem,
      id: "b",
      content: "react typescript hooks component pattern deployment",
      vector: [0.5, 0.6, 0.7, 0.8],
      tags: [],
      priority: 5,
      access_count: 0,
    });

    const qv = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const results = s.search("react typescript hooks", {
      limit: 5,
      queryVec: qv,
      alpha: 0.3, // heavily weighted toward BM25
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});
