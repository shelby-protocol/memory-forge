import { describe, it, expect } from "vitest";
import { MemoryStore } from "../src/store.js";
import { autoName, autoMerge, autoPriority, autoDecay } from "../src/auto/index.js";
import { makeMemory } from "./test-helpers.js";

const mem = makeMemory();

describe("autoName", () => {
  it("extracts name from normal text", () => {
    const n = autoName("Prefer single quotes and 2-space indent");
    expect(n.length).toBeGreaterThan(0);
    expect(n.length).toBeLessThanOrEqual(40);
    expect(n).not.toContain("```");
  });

  it("returns 'memory' for code-only content", () => {
    expect(autoName("```\ncode block only\n```")).toBe("memory");
  });

  it("returns 'memory' for multiple code blocks", () => {
    expect(autoName("```\nconst x = 1;\n```\n```\nconst y = 2;\n```")).toBe("memory");
  });

  it("returns 'memory' for empty content", () => {
    expect(autoName("")).toBe("memory");
  });

  it("caps long text at 60 chars", () => {
    expect(autoName("A".repeat(100)).length).toBeLessThanOrEqual(60);
  });
});

describe("autoMerge", () => {
  it("merges 100% identical content", async () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "old", content: "React 19 TypeScript hooks" });
    const merged = await autoMerge(s, { ...mem, id: "new", content: "React 19 TypeScript hooks" });
    expect(merged).not.toBeNull();
  });

  it("skips 0% overlap", async () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "old", content: "apple banana cherry" });
    const merged = await autoMerge(s, { ...mem, id: "new", content: "xylophone zebra quantum" });
    expect(merged).toBeNull();
  });

  it("skips empty store", async () => {
    const s = new MemoryStore();
    const merged = await autoMerge(s, { ...mem, id: "new", content: "anything" });
    expect(merged).toBeNull();
  });

  it("detects overlap with short tech terms", async () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "old", content: "API JWT SSL DNS auth tokens web security deploy layer prod" });
    const merged = await autoMerge(s, { ...mem, id: "new", content: "API JWT SSL DNS auth tokens web security deploy layer staging" });
    expect(merged).not.toBeNull();
  });
});

describe("autoPriority", () => {
  it("high score for fresh high-access memory", () => {
    const m = { ...mem, access_count: 50, last_accessed: new Date().toISOString() };
    const p = autoPriority(m);
    expect(p).toBeGreaterThanOrEqual(7);
    expect(p).toBeLessThanOrEqual(10);
  });

  it("low score for old never-accessed memory", () => {
    const oldDate = new Date(Date.now() - 365 * 86400000).toISOString();
    const m = { ...mem, created_at: oldDate, access_count: 0, last_accessed: null };
    const p = autoPriority(m);
    expect(p).toBeGreaterThanOrEqual(1);
    expect(p).toBeLessThanOrEqual(4);
  });
});

describe("autoDecay", () => {
  it("0 days = 1.0", () => {
    expect(autoDecay({ ...mem, last_accessed: new Date().toISOString() })).toBe(1.0);
  });

  it("5 days = 0.8", () => {
    const d = new Date(Date.now() - 5 * 86400000).toISOString();
    expect(autoDecay({ ...mem, last_accessed: d })).toBe(0.8);
  });

  it("45 days = 0.2", () => {
    const d = new Date(Date.now() - 45 * 86400000).toISOString();
    expect(autoDecay({ ...mem, last_accessed: d })).toBe(0.2);
  });

  it("100 days archived = 0", () => {
    const d = new Date(Date.now() - 100 * 86400000).toISOString();
    expect(autoDecay({ ...mem, last_accessed: d })).toBe(0);
  });
});
