import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MemoryStore, contentOverlap } from "../src/store.js";
import { saveMemory, loadAllMemories, deleteMemoryFile } from "../src/storage/local.js";
import { autoName, generateContextSummary } from "../src/auto/index.js";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Memory } from "../src/store.js";

const now = new Date().toISOString();

describe("Scenario 1: Corrupted memory file", () => {
  const corruptId = randomUUID();
  const memDir = path.join(os.homedir(), ".memory-forge", "memories");
  const corruptPath = path.join(memDir, corruptId + ".md");

  beforeAll(() => {
    fs.mkdirSync(memDir, { recursive: true });
    fs.writeFileSync(corruptPath, "NOT VALID MEMORY FILE\njust garbage\nno frontmatter");
  });

  afterAll(() => {
    try {
      fs.unlinkSync(corruptPath);
    } catch {}
  });

  it("does not crash loader", () => {
    loadAllMemories();
  });

  it("loads file content as memory", () => {
    const all = loadAllMemories();
    const recovered = all.find((m) => m.id === corruptId);
    expect(recovered).toBeDefined();
    expect(recovered!.category).toBe("general");
  });
});

describe("Scenario 2: Duplicate import resilience", () => {
  const s = new MemoryStore();
  const dup1: Memory = {
    id: randomUUID(),
    name: "Pref",
    content: "Always use React 19 with TypeScript strict mode",
    category: "user-preference",
    tags: ["react"],
    priority: 8,
    vector: [],
    created_at: now,
    access_count: 0,
    last_accessed: null,
  };
  const dup2: Memory = {
    id: randomUUID(),
    name: "Pref",
    content: "Always use React 19 with TypeScript strict mode",
    category: "user-preference",
    tags: ["react"],
    priority: 8,
    vector: [],
    created_at: now,
    access_count: 0,
    last_accessed: null,
  };

  it("both stored with different IDs", () => {
    s.add(dup1);
    s.add(dup2);
    expect(s.size()).toBe(2);
  });

  it("100% overlap detected", () => {
    expect(contentOverlap(dup1.content, dup2.content)).toBeGreaterThan(0.99);
  });
});

describe("Scenario 3: Full memory lifecycle", () => {
  const s = new MemoryStore();
  const lifeId = randomUUID();
  const life: Memory = {
    id: lifeId,
    name: "Lifecycle Test",
    content: "Original content v1",
    category: "general",
    tags: ["test"],
    priority: 5,
    vector: [],
    created_at: now,
    access_count: 0,
    last_accessed: null,
  };

  it("create", () => {
    s.add(life);
    expect(s.get(lifeId)).not.toBeNull();
  });

  it("update content + name + category + tags + priority", () => {
    const m = s.get(lifeId)!;
    m.content = "Updated content v2";
    m.name = autoName(m.content);
    m.category = "decision-log";
    m.tags = ["updated", "v2"];
    m.priority = 9;
    expect(s.get(lifeId)!.content).toBe("Updated content v2");
    expect(s.get(lifeId)!.category).toBe("decision-log");
    expect(s.get(lifeId)!.tags).toHaveLength(2);
    expect(s.get(lifeId)!.priority).toBe(9);
    expect(s.get(lifeId)!.name).toBe("Updated content v2");
  });

  it("search finds updated memory", () => {
    const found = s.keywordSearch("updated", { limit: 5 });
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]._score!).toBeGreaterThanOrEqual(5);
  });

  it("forget removes", () => {
    s.remove(lifeId);
    expect(s.get(lifeId)).toBeNull();
  });
});

describe("Scenario 4: Context summary ranking", () => {
  it("high priority wins over low", () => {
    const s = new MemoryStore();
    s.add({
      id: "high",
      name: "High Priority",
      content: "Critical security config",
      category: "decision-log",
      tags: [],
      priority: 10,
      vector: [],
      created_at: now,
      access_count: 100,
      last_accessed: now,
    });
    s.add({
      id: "low",
      name: "Low Priority",
      content: "Casual note",
      category: "general",
      tags: [],
      priority: 1,
      vector: [],
      created_at: "2020-01-01T00:00:00Z",
      access_count: 0,
      last_accessed: null,
    });
    const summary = generateContextSummary(s, 1);
    expect(summary).toContain("High Priority");
    expect(summary).not.toContain("Low Priority");
  });
});

describe("Scenario 5: Concurrent write safety", () => {
  it("last write wins", () => {
    const s = new MemoryStore();
    const cid = randomUUID();
    s.add({
      id: cid,
      name: "First",
      content: "First write",
      category: "general",
      tags: [],
      priority: 5,
      vector: [],
      created_at: now,
      access_count: 0,
      last_accessed: null,
    });
    s.add({
      id: cid,
      name: "Second",
      content: "Second write",
      category: "general",
      tags: [],
      priority: 5,
      vector: [],
      created_at: now,
      access_count: 0,
      last_accessed: null,
    });
    expect(s.get(cid)!.content).toBe("Second write");
  });
});

describe("Scenario 6: Export/import round-trip", () => {
  it("preserves content and tags", () => {
    const s1 = new MemoryStore();
    s1.add({
      id: "e1",
      name: "Export Test",
      content: "Data for export",
      category: "general",
      tags: ["export"],
      priority: 5,
      vector: [],
      created_at: now,
      access_count: 0,
      last_accessed: null,
    });
    const exported = s1.list({ limit: 100, offset: 0 });
    const s2 = new MemoryStore();
    for (const em of exported) s2.add({ ...em });
    expect(s2.get("e1")!.content).toBe("Data for export");
    expect(s2.get("e1")!.tags[0]).toBe("export");
  });
});

describe("Scenario 7: Multi-tag filtering", () => {
  const s = new MemoryStore();
  beforeAll(() => {
    s.add({
      id: "t1",
      name: "A",
      content: "x",
      category: "general",
      tags: ["react", "typescript", "tailwind"],
      priority: 5,
      vector: [],
      created_at: now,
      access_count: 0,
      last_accessed: null,
    });
    s.add({
      id: "t2",
      name: "B",
      content: "x",
      category: "general",
      tags: ["react", "vue"],
      priority: 5,
      vector: [],
      created_at: now,
      access_count: 0,
      last_accessed: null,
    });
    s.add({
      id: "t3",
      name: "C",
      content: "x",
      category: "general",
      tags: ["python", "django"],
      priority: 5,
      vector: [],
      created_at: now,
      access_count: 0,
      last_accessed: null,
    });
  });

  it("single tag", () => expect(s.list({ tags: ["react"], limit: 10, offset: 0 })).toHaveLength(2));
  it("OR multi-tag", () => expect(s.list({ tags: ["python", "django"], limit: 10, offset: 0 })).toHaveLength(1));
  it("no-match tag", () => expect(s.list({ tags: ["rust"], limit: 10, offset: 0 })).toHaveLength(0));
});

describe("Scenario 8: Large batch performance", () => {
  it("500 inserts under 500ms", () => {
    const s = new MemoryStore();
    const start = Date.now();
    for (let i = 0; i < 500; i++) {
      s.add({
        id: `perf-${i}`,
        name: `Memory ${i}`,
        content: `Content for memory ${i}`,
        category: i % 4 === 0 ? "decision-log" : i % 4 === 1 ? "user-preference" : i % 4 === 2 ? "code-pattern" : "general",
        tags: [`tag-${i % 10}`],
        priority: 1 + (i % 10),
        vector: [],
        created_at: now,
        access_count: i,
        last_accessed: null,
      });
    }
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("50 searches under 200ms", () => {
    const s = new MemoryStore();
    for (let i = 0; i < 500; i++) {
      s.add({
        id: `perf-${i}`,
        name: `Memory ${i}`,
        content: `Content for memory ${i}`,
        category: "general",
        tags: [],
        priority: 5,
        vector: [],
        created_at: now,
        access_count: i,
        last_accessed: null,
      });
    }
    const start = Date.now();
    for (let i = 0; i < 50; i++) s.keywordSearch(`content ${i}`, { limit: 10 });
    expect(Date.now() - start).toBeLessThan(200);
  });
});

describe("Scenario 9: Edge state stress", () => {
  const s = new MemoryStore();

  it("empty store list", () => expect(s.list({ limit: 10, offset: 0 })).toHaveLength(0));
  it("empty store size 0", () => expect(s.size()).toBe(0));

  it("empty store stats", () => {
    const st = s.stats();
    expect(st.total).toBe(0);
    expect(st.total_accesses).toBe(0);
  });

  it("empty store keyword search", () => {
    expect(s.keywordSearch("anything", { limit: 5 })).toHaveLength(0);
  });

  it("empty store get nonexistent", () => {
    expect(s.get("nope")).toBeNull();
  });

  it("empty store context summary", () => {
    expect(generateContextSummary(s, 5)).toContain("Welcome");
  });
});

describe("Scenario 10: LRU eviction stress", () => {
  it("capped at 5000", () => {
    const s = new MemoryStore();
    for (let i = 0; i < 5100; i++) {
      s.add({
        id: `lru-${i}`,
        name: `Memory ${i}`,
        content: `Content ${i}`,
        category: "general",
        tags: [],
        priority: 5,
        vector: [],
        created_at: now,
        access_count: i,
        last_accessed: null,
      });
    }
    expect(s.size()).toBeLessThanOrEqual(5000);
  });

  it("evicted lowest access", () => {
    const s = new MemoryStore();
    for (let i = 0; i < 5100; i++) {
      s.add({
        id: `lru-${i}`,
        name: `Memory ${i}`,
        content: `Content ${i}`,
        category: "general",
        tags: [],
        priority: 5,
        vector: [],
        created_at: now,
        access_count: i,
        last_accessed: null,
      });
    }
    const all = s.list({ limit: 5000, offset: 0 });
    const minAccess = Math.min(...all.map((m) => m.access_count));
    expect(minAccess).toBeGreaterThanOrEqual(100);
  });
});
