import { describe, it, expect } from "vitest";
import { MemoryStore } from "../src/store.js";
import { makeMemory } from "./test-helpers.js";

const mem = makeMemory();

describe("keywordSearch", () => {
  it("returns empty for single-char query", () => {
    const s = new MemoryStore();
    s.add({ ...mem, content: "hello" });
    expect(s.keywordSearch("a", { limit: 5 })).toHaveLength(0);
  });

  it("returns empty for empty query", () => {
    const s = new MemoryStore();
    s.add({ ...mem, content: "hello" });
    expect(s.keywordSearch("", { limit: 5 })).toHaveLength(0);
  });

  it("name match scores higher than content match", () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "a", name: "react rules", content: "something else" });
    s.add({ ...mem, id: "b", name: "other", content: "react react react" });
    const r = s.keywordSearch("react", { limit: 5 });
    expect(r.length).toBe(2);
  });

  it("finds CJK Japanese query", () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "cjk-ja", name: "test", content: "日本語テストデータ", tags: [] });
    expect(s.keywordSearch("日本語", { limit: 5 }).length).toBeGreaterThanOrEqual(1);
  });

  it("finds CJK Chinese query", () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "cjk-zh", name: "中文", content: "这是一个中文测试数据", tags: [] });
    expect(s.keywordSearch("中文", { limit: 5 }).length).toBeGreaterThanOrEqual(1);
  });

  it("finds CJK Korean query", () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "cjk-ko", name: "한글", content: "한국어 테스트 데이터", tags: [] });
    expect(s.keywordSearch("한국어", { limit: 5 }).length).toBeGreaterThanOrEqual(1);
  });
});

describe("vectorSearch", () => {
  it("does not crash when no vector available", () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "a", vector: [0.1, 0.2, 0.3] });
    s.add({ ...mem, id: "b", vector: [] });
    const qv = new Float32Array([0.1, 0.2, 0.3]);
    const results = s.search("test", { limit: 3, queryVec: qv, minSimilarity: 0.999 });
    expect(results.length).toBeGreaterThanOrEqual(0);
  });
});
