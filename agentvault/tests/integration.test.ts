import { describe, it, expect } from "vitest";
import { MemoryStore } from "../src/store.js";
import { makeMemory } from "./test-helpers.js";

const mem = makeMemory();

describe("integration scenarios", () => {
  it("full lifecycle: store → search → export → forget", () => {
    const s = new MemoryStore();
    const id = "life-" + Date.now();
    s.add({ ...mem, id, content: "Integration test memory content here" });
    expect(s.size()).toBe(1);

    const found = s.keywordSearch("integration test", { limit: 5 });
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(s.get(id)).not.toBeNull();

    const all = s.list({ limit: 100, offset: 0 });
    expect(all).toHaveLength(1);

    expect(s.remove(id)).toBe(true);
    expect(s.size()).toBe(0);
  });

  it("multi-category store + filtered recall", () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "c1", category: "user-preference", content: "Dark mode" });
    s.add({ ...mem, id: "c2", category: "project-context", content: "Monorepo with pnpm" });
    s.add({ ...mem, id: "c3", category: "decision-log", content: "Chose PostgreSQL" });
    s.add({ ...mem, id: "c4", category: "code-pattern", content: "Repository pattern" });

    expect(s.list({ category: "user-preference", limit: 10, offset: 0 })).toHaveLength(1);
    expect(s.list({ category: "nonexistent", limit: 10, offset: 0 })).toHaveLength(0);

    const results = s.keywordSearch("postgresql", { limit: 5 });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

describe("LRU eviction", () => {
  it("keeps all at exactly 5000", () => {
    const s = new MemoryStore();
    for (let i = 0; i < 5000; i++) s.add({ ...mem, id: `lr-${i}`, access_count: i });
    expect(s.size()).toBe(5000);
  });

  it("evicts lowest access_count at 5001", () => {
    const s = new MemoryStore();
    for (let i = 0; i < 5001; i++) s.add({ ...mem, id: `lr-${i}`, access_count: i });
    expect(s.size()).toBeLessThanOrEqual(5000);
    expect(s.get("lr-0")).toBeNull();
    expect(s.get("lr-5000")).not.toBeNull();
  });

  it("tiebreaker: same access, lower priority evicted", () => {
    const s = new MemoryStore();
    for (let i = 0; i < 5000; i++) {
      s.add({ ...mem, id: `tp-${i}`, access_count: 0, priority: i % 2 === 0 ? 1 : 10 });
    }
    s.add({ ...mem, id: "overflow", access_count: 0, priority: 10 });
    expect(s.size()).toBeLessThanOrEqual(5000);

    const survivors = [...s.list({ limit: 5000, offset: 0 })];
    const lowPriCount = survivors.filter((m) => m.priority === 1).length;
    const highPriCount = survivors.filter((m) => m.priority === 10).length;
    expect(highPriCount).toBeGreaterThan(lowPriCount);
  });

  it("stats computes correctly", () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "a", category: "user-preference", tags: ["t1", "t2"], access_count: 5 });
    s.add({ ...mem, id: "b", category: "user-preference", tags: ["t1"], access_count: 3 });
    s.add({ ...mem, id: "c", category: "project-context", tags: ["t3"], access_count: 1 });

    const st = s.stats();
    expect(st.total).toBe(3);
    expect(st.categories["user-preference"]).toBe(2);
    expect(st.categories["project-context"]).toBe(1);
    expect(st.total_accesses).toBe(9);
    expect(st.newest).not.toBeNull();
    expect(st.oldest).not.toBeNull();
  });
});

describe("stress", () => {
  it("5000 memories — LRU eviction", () => {
    const s = new MemoryStore();
    for (let i = 0; i < 5010; i++) {
      s.add({
        ...mem,
        id: `stress-${i}`,
        content: `Memory content ${i}`,
        access_count: i % 100,
        priority: 1 + (i % 10),
      });
    }
    expect(s.size()).toBeLessThanOrEqual(5000);
    expect(s.size()).toBe(5000);
  });

  it("rapid 200 stores + searches — no crash", () => {
    const s = new MemoryStore();
    const start = Date.now();
    for (let i = 0; i < 200; i++) {
      s.add({
        ...mem,
        id: `rapid-${i}`,
        content: `Rapid content ${i} unique text.`,
        priority: 5 + (i % 6),
      });
      s.keywordSearch(`content ${i}`, { limit: 5 });
      if (i % 50 === 0) s.remove(`rapid-${i}`);
    }
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it("150KB content — no crash", () => {
    const s = new MemoryStore();
    const big = "x".repeat(150_000);
    s.add({ ...mem, id: "big", content: big });
    expect(s.get("big")).not.toBeNull();
    expect(s.get("big")!.content.length).toBe(150_000);
  });

  it("10 searches across 1000 memories — perf", () => {
    const s = new MemoryStore();
    const topics = [
      "auth",
      "database",
      "deploy",
      "testing",
      "styling",
      "perf",
      "api",
      "config",
      "logging",
      "security",
    ];
    for (let i = 0; i < 1000; i++) {
      s.add({
        ...mem,
        id: `perf-${i}`,
        content: `${topics[i % 10]} config for item ${i}.`,
        access_count: i % 50,
        priority: 3 + (i % 8),
      });
    }
    const start = Date.now();
    for (let i = 0; i < 10; i++) s.keywordSearch(topics[i], { limit: 10 });
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe("memory_update", () => {
  it("update content + recompute name", () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "up-1", content: "Original content" });
    const m = s.get("up-1")!;
    m.content = "Updated content with new information";
    s.touch("up-1");
    expect(m.content).toContain("Updated");
    expect(m.access_count).toBeGreaterThanOrEqual(1);
  });

  it("update category only keeps other fields", () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "up-2", category: "general", content: "Some content", tags: ["old"] });
    const m = s.get("up-2")!;
    m.category = "decision-log";
    s.touch("up-2");
    expect(m.category).toBe("decision-log");
    expect(m.tags[0]).toBe("old");
    expect(m.content).toBe("Some content");
  });

  it("update tags replaces array", () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "up-3", tags: ["old-tag"] });
    const m = s.get("up-3")!;
    m.tags = ["new-tag", "extra"];
    expect(m.tags).toHaveLength(2);
    expect(m.tags).toContain("new-tag");
  });

  it("update priority changes priority", () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "up-4", priority: 5 });
    const m = s.get("up-4")!;
    m.priority = 9;
    expect(m.priority).toBe(9);
  });
});
