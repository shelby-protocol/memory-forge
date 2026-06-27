import { describe, it, expect } from "vitest";
import { MemoryStore } from "../src/store.js";
import { makeMemory, makeStore } from "./test-helpers.js";

describe("MemoryStore", () => {
  describe("add + get", () => {
    it("stores and retrieves a memory", () => {
      const s = new MemoryStore();
      const m = makeMemory({ id: "t-1" });
      s.add(m);
      expect(s.get("t-1")).not.toBeNull();
      expect(s.get("t-1")!.name).toBe("Test Memory");
      expect(s.size()).toBe(1);
    });

    it("duplicate id overwrites", () => {
      const s = new MemoryStore();
      s.add(makeMemory({ id: "t-1", content: "first" }));
      s.add(makeMemory({ id: "t-1", content: "second" }));
      expect(s.size()).toBe(1);
      expect(s.get("t-1")!.content).toBe("second");
    });
  });

  describe("touch + remove", () => {
    it("increments access_count on touch", () => {
      const s = new MemoryStore();
      s.add(makeMemory({ id: "t-1" }));
      s.touch("t-1");
      s.touch("t-1");
      expect(s.get("t-1")!.access_count).toBe(2);
    });

    it("removes memory and returns true", () => {
      const s = new MemoryStore();
      s.add(makeMemory({ id: "t-1" }));
      expect(s.remove("t-1")).toBe(true);
      expect(s.size()).toBe(0);
      expect(s.get("t-1")).toBeNull();
    });

    it("remove nonexistent returns false", () => {
      const s = new MemoryStore();
      s.add(makeMemory({ id: "t-1" }));
      expect(s.remove("no-such")).toBe(false);
      expect(s.size()).toBe(1);
    });
  });

  describe("list", () => {
    it("filters by category", () => {
      const s = new MemoryStore();
      s.add(makeMemory({ id: "a", category: "decision-log" }));
      s.add(makeMemory({ id: "b", category: "code-pattern" }));
      s.add(makeMemory({ id: "c", category: "decision-log" }));
      expect(s.list({ category: "decision-log", limit: 10, offset: 0 })).toHaveLength(2);
      expect(s.list({ category: "nonexistent", limit: 10, offset: 0 })).toHaveLength(0);
    });

    it("filters by tags", () => {
      const s = new MemoryStore();
      s.add(makeMemory({ id: "a", tags: ["react"] }));
      s.add(makeMemory({ id: "b", tags: ["vue"] }));
      s.add(makeMemory({ id: "c", tags: ["react", "typescript"] }));
      expect(s.list({ tags: ["react"], limit: 10, offset: 0 })).toHaveLength(2);
    });

    it("paginates correctly", () => {
      const s = makeStore(10);
      expect(s.list({ limit: 3, offset: 0 })).toHaveLength(3);
      expect(s.list({ limit: 3, offset: 3 })).toHaveLength(3);
      expect(s.list({ limit: 3, offset: 9 })).toHaveLength(1);
      expect(s.list({ limit: 3, offset: 20 })).toHaveLength(0);
    });

    it("returns empty for empty store", () => {
      expect(new MemoryStore().list({ limit: 10, offset: 0 })).toHaveLength(0);
    });
  });
});
