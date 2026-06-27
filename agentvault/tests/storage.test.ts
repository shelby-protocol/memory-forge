import { describe, it, expect } from "vitest";
import { saveMemory, loadAllMemories, deleteMemoryFile } from "../src/storage/local.js";
import { makeMemory } from "./test-helpers.js";

const mem = makeMemory();

describe("local storage", () => {
  it("save + load round-trip preserves fields", () => {
    const id = "rt-" + Date.now();
    saveMemory({ ...mem, id, tags: ["a", "b", "c"], priority: 9, access_count: 42 });

    const loaded = loadAllMemories().find((m) => m.id === id);
    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe(mem.name);
    expect(loaded!.category).toBe(mem.category);
    expect(loaded!.priority).toBe(9);
    expect(loaded!.access_count).toBe(42);
    expect(loaded!.tags).toContain("a");
    expect(loaded!.tags).toContain("c");

    deleteMemoryFile(id);
  });

  it("loadAllMemories returns array when dir missing", () => {
    expect(Array.isArray(loadAllMemories())).toBe(true);
  });

  it("deleteMemoryFile nonexistent does not crash", () => {
    deleteMemoryFile("definitely-does-not-exist-12345");
  });
});
