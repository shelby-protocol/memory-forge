import { MemoryStore, type Memory } from "../src/store.js";

export function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: `test-${Math.random().toString(36).slice(2, 10)}`,
    name: "Test Memory",
    content: "User prefers camelCase naming",
    category: "user-preference",
    tags: ["coding-style"],
    priority: 7,
    vector: [],
    created_at: new Date().toISOString(),
    access_count: 0,
    last_accessed: null,
    ...overrides,
  };
}

export function makeStore(count: number, opts: { prefix?: string; category?: string; tags?: string[] } = {}): MemoryStore {
  const s = new MemoryStore();
  const prefix = opts.prefix ?? "m";
  for (let i = 0; i < count; i++) {
    s.add(
      makeMemory({
        id: `${prefix}-${i}`,
        content: `${opts.category ?? "general"} memory ${i}`,
        category: opts.category ?? "general",
        tags: opts.tags ?? [],
        access_count: i,
        priority: 1 + (i % 10),
      }),
    );
  }
  return s;
}
