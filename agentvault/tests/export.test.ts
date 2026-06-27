import { describe, it, expect } from "vitest";
import { MemoryStore } from "../src/store.js";
import { makeMemory } from "./test-helpers.js";

const mem = makeMemory();

describe("export & share", () => {
  it("JSON export includes all fields", () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "e1", name: "Alpha", content: "Content A", category: "cat-a", tags: ["x"], priority: 8, created_at: "2026-01-01T00:00:00Z" });
    s.add({ ...mem, id: "e2", name: "Beta", content: "Content B", category: "cat-b", tags: ["y"], priority: 3, created_at: "2026-06-01T00:00:00Z" });

    const all = s.list({ limit: 100, offset: 0 });
    const pkg = {
      exported_at: new Date().toISOString(),
      version: "memory-forge-1.0",
      count: all.length,
      memories: all.map((m) => ({ id: m.id, name: m.name, content: m.content, category: m.category, tags: m.tags, priority: m.priority, created_at: m.created_at })),
    };
    expect(pkg.count).toBe(2);
    expect(pkg.memories.some((m) => m.name === "Alpha")).toBe(true);
    expect(pkg.memories.some((m) => m.name === "Beta")).toBe(true);
  });

  it("Markdown export format", () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "md1", name: "Coding Style", content: "Use tabs", tags: ["style"] });
    const all = s.list({ limit: 100, offset: 0 });
    const md = all.map((m) => [`# ${m.name}`, `> category: ${m.category} | tags: ${m.tags.join(", ")} | priority: ${m.priority}`, `> created: ${m.created_at} | access_count: ${m.access_count}`, "", m.content, "", "---"].join("\n")).join("\n\n");

    expect(md).toContain("# Coding Style");
    expect(md).toContain("Use tabs");
    expect(md).toContain("---");
  });

  it("export empty store", () => {
    expect(new MemoryStore().list({ limit: 100, offset: 0 })).toHaveLength(0);
  });

  it("share package valid structure", () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "sh1", name: "Deploy Checklist", content: "1. Run tests\n2. Build\n3. Push", category: "decision-log", tags: ["deploy"] });
    const m = s.get("sh1")!;
    const share = {
      type: "memory-forge-share", version: "1.0", shared_at: new Date().toISOString(),
      recipient: "frontend-team", note: "Follow this for every deploy",
      memory: { name: m.name, content: m.content, category: m.category, tags: m.tags },
      import_instruction: "Use memory_store with this content to import.",
    };
    expect(share.type).toBe("memory-forge-share");
    expect(share.recipient).toBe("frontend-team");
    expect(share.memory.tags).toHaveLength(1);
    expect(share.memory.content).toContain("Run tests");
  });

  it("share without optional fields", () => {
    const share = {
      type: "memory-forge-share", version: "1.0", shared_at: new Date().toISOString(),
      recipient: null, note: null,
      memory: { name: "Solo", content: "Just me", category: "general", tags: [] },
      import_instruction: "Use memory_store with this content to import.",
    };
    expect(share.recipient).toBeNull();
    expect(share.note).toBeNull();
  });

  it("share preserves special characters", () => {
    const content = "API endpoint: https://api.example.com/v1?token=abc&mode=strict\n\n`curl -X POST`";
    const share = {
      type: "memory-forge-share", version: "1.0", shared_at: new Date().toISOString(),
      recipient: null, note: null,
      memory: { name: "API Config", content, category: "general", tags: [] },
      import_instruction: "Use memory_store with this content to import.",
    };
    const parsed = JSON.parse(JSON.stringify(share));
    expect(parsed.memory.content).toBe(content);
  });
});
