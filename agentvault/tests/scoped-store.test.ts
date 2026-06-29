import { describe, it, expect } from "vitest";
import { MemoryStore, type Memory } from "../src/store.js";
import { ScopedMemoryStore } from "../src/scoped-store.js";
import { makeMemory } from "./test-helpers.js";

function mem(id: string, projectId: string | undefined, content: string): Memory {
  return makeMemory({
    id,
    content,
    project_id: projectId,
    project_name: projectId ? `project-${projectId}` : undefined,
    scope: projectId ? ("project" as const) : ("global" as const),
  });
}

describe("ScopedMemoryStore", () => {
  describe("add() injects metadata automatically", () => {
    it("injects project_id and project_name", () => {
      const inner = new MemoryStore();
      const scoped = new ScopedMemoryStore(inner, "hash123", "my-project");
      const m = mem(
        "m1",
        undefined,
        "This is a test memory with enough words to pass quality checks",
      );
      scoped.add(m);
      const stored = inner.get("m1")!;
      expect(stored.project_id).toBe("hash123");
      expect(stored.project_name).toBe("my-project");
      expect(stored.scope).toBe("project");
    });

    it("sets scope to 'global' when no project hash", () => {
      const inner = new MemoryStore();
      const scoped = new ScopedMemoryStore(inner, null, null);
      const m = mem("m2", undefined, "This is a global memory with enough words to pass checks");
      scoped.add(m);
      expect(inner.get("m2")!.scope).toBe("global");
    });
  });

  describe("search filtering", () => {
    function setup() {
      const inner = new MemoryStore();
      const scoped = new ScopedMemoryStore(inner, "proj-a", "project-a");
      // Add directly to inner to bypass scopedStore.add() overwriting project_id
      inner.add(
        mem("a1", "proj-a", "Memory for the project alpha containing important development notes"),
      );
      inner.add(
        mem("b1", "proj-b", "Memory for the project beta containing different design specs"),
      );
      inner.add(
        mem("g1", undefined, "Global memory about general coding preferences and standards"),
      );
      return { inner, scoped };
    }

    it("filters to current project + global by default", () => {
      const { scoped } = setup();
      const results = scoped.search("memory", { limit: 10 });
      const ids = results.map((r) => r.id);
      expect(ids).toContain("a1");
      expect(ids).toContain("g1");
      expect(ids).not.toContain("b1");
    });

    it("includes all projects when includeAllProjects is true", () => {
      const { scoped } = setup();
      const results = scoped.search("memory", { limit: 10, includeAllProjects: true });
      const ids = results.map((r) => r.id);
      expect(ids).toContain("a1");
      expect(ids).toContain("b1");
      expect(ids).toContain("g1");
    });

    it("searchCurrentProjectOnly excludes global memories", () => {
      const { scoped } = setup();
      const results = scoped.searchCurrentProjectOnly("memory", { limit: 10 });
      const ids = results.map((r) => r.id);
      expect(ids).toContain("a1");
      expect(ids).not.toContain("g1");
      expect(ids).not.toContain("b1");
    });
  });

  describe("list filtering", () => {
    function setup() {
      const inner = new MemoryStore();
      const scoped = new ScopedMemoryStore(inner, "proj-a", "project-a");
      inner.add(
        mem("a1", "proj-a", "Memory for the project alpha containing important development notes"),
      );
      inner.add(
        mem("b1", "proj-b", "Memory for the project beta containing different design specs"),
      );
      inner.add(
        mem("g1", undefined, "Global memory about general coding preferences and standards"),
      );
      return { scoped };
    }

    it("lists current project + global by default", () => {
      const { scoped } = setup();
      const results = scoped.list({ limit: 10, offset: 0 });
      const ids = results.map((r) => r.id);
      expect(ids).toContain("a1");
      expect(ids).toContain("g1");
      expect(ids).not.toContain("b1");
    });

    it("lists all projects when includeAllProjects is true", () => {
      const { scoped } = setup();
      const results = scoped.list({ limit: 10, offset: 0, includeAllProjects: true });
      const ids = results.map((r) => r.id);
      expect(ids).toContain("a1");
      expect(ids).toContain("b1");
      expect(ids).toContain("g1");
    });
  });

  describe("delegation", () => {
    it("get/remove/touch/size/stats delegate to inner", () => {
      const inner = new MemoryStore();
      const scoped = new ScopedMemoryStore(inner, "hash", "name");
      const m = mem("m1", "hash", "This is a test memory with enough words to pass quality checks");
      inner.add(m);

      expect(scoped.get("m1")).not.toBeNull();
      expect(scoped.size()).toBe(1);

      scoped.touch("m1");
      expect(inner.get("m1")!.access_count).toBe(1);

      expect(scoped.remove("m1")).toBe(true);
      expect(scoped.get("m1")).toBeNull();

      expect(scoped.stats().total).toBe(0);
      expect(scoped.getProjectHash()).toBe("hash");
      expect(scoped.getProjectName()).toBe("name");
    });
  });
});
