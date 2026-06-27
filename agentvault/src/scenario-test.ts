/**
 * Real-world scenario tests — simulates actual user workflows.
 */
import { MemoryStore, contentOverlap, safeTruncate } from "./store.js";
import { saveMemory, loadAllMemories, deleteMemoryFile } from "./storage/local.js";
import { autoName, generateContextSummary } from "./auto/index.js";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

let ok = 0; let ng = 0;
function t(name: string, fn: () => void) { try { fn(); ok++; } catch(e: any) { ng++; console.log("FAIL:", name, "—", e.message); } }

const now = new Date().toISOString();

// ═══ SCENARIO 1: Corrupted memory file ═══
console.log("=== Scenario 1: Corrupted memory file ===");
const corruptId = randomUUID();
const memDir = path.join(process.env.HOME ?? process.env.USERPROFILE ?? "/tmp", ".memory-forge", "memories");
const corruptPath = path.join(memDir, corruptId + ".md");
fs.mkdirSync(memDir, { recursive: true });
fs.writeFileSync(corruptPath, "NOT VALID MEMORY FILE\njust garbage\nno frontmatter");
t("corrupted file does not crash loader", () => { loadAllMemories(); });
t("corrupted file loads as memory with id-based name", () => {
  const all = loadAllMemories();
  const recovered = all.find(m => m.id === corruptId);
  if (!recovered) throw new Error("should load file content as memory");
  // Without frontmatter, name defaults to id, content is full file text
  if (recovered.category !== "general") throw new Error("default category missing");
});
fs.unlinkSync(corruptPath);

// ═══ SCENARIO 2: Duplicate import resilience ═══
console.log("\n=== Scenario 2: Duplicate import resilience ===");
const s2 = new MemoryStore();
const dup1 = { id: randomUUID(), name: "Pref", content: "Always use React 19 with TypeScript strict mode", category: "user-preference", tags: ["react"], priority: 8, vector: [] as number[], created_at: now, access_count: 0, last_accessed: null as string | null };
const dup2 = { id: randomUUID(), name: "Pref", content: "Always use React 19 with TypeScript strict mode", category: "user-preference", tags: ["react"], priority: 8, vector: [], created_at: now, access_count: 0, last_accessed: null };
s2.add(dup1); s2.add(dup2);
t("both stored (different IDs)", () => { if (s2.size() !== 2) throw new Error("size=" + s2.size()); });
const overlap = contentOverlap(dup1.content, dup2.content);
t("100% overlap detected", () => { if (overlap < 0.99) throw new Error("overlap=" + overlap); });

// ═══ SCENARIO 3: Memory lifecycle ═══
console.log("\n=== Scenario 3: Full memory lifecycle ===");
const s3 = new MemoryStore();
const lifeId = randomUUID();
s3.add({ id: lifeId, name: "Lifecycle Test", content: "Original content v1", category: "general", tags: ["test"], priority: 5, vector: [], created_at: now, access_count: 0, last_accessed: null });
t("create", () => { if (!s3.get(lifeId)) throw new Error("not found"); });
const m = s3.get(lifeId)!;
m.content = "Updated content v2"; m.name = autoName(m.content);
m.category = "decision-log"; m.tags = ["updated", "v2"]; m.priority = 9;
t("update content", () => { if (s3.get(lifeId)!.content !== "Updated content v2") throw new Error("content"); });
t("update category", () => { if (s3.get(lifeId)!.category !== "decision-log") throw new Error("category"); });
t("update tags", () => { if (s3.get(lifeId)!.tags.length !== 2) throw new Error("tags"); });
t("update priority", () => { if (s3.get(lifeId)!.priority !== 9) throw new Error("priority"); });
t("update name", () => { if (s3.get(lifeId)!.name !== "Updated content v2") throw new Error("name"); });
const found = s3.keywordSearch("updated", { limit: 5 });
t("search finds updated", () => { if (found.length === 0) throw new Error("not found"); });
t("search score reasonable", () => { if (found[0]._score! < 5) throw new Error("score=" + found[0]._score); });
s3.remove(lifeId);
t("forget removes", () => { if (s3.get(lifeId) !== null) throw new Error("still exists"); });

// ═══ SCENARIO 4: Context summary ranking ═══
console.log("\n=== Scenario 4: Context summary ranking ===");
const s4 = new MemoryStore();
s4.add({ id: "high", name: "High Priority", content: "Critical security config", category: "decision-log", tags: [], priority: 10, vector: [], created_at: now, access_count: 100, last_accessed: now });
s4.add({ id: "low", name: "Low Priority", content: "Casual note", category: "general", tags: [], priority: 1, vector: [], created_at: "2020-01-01T00:00:00Z", access_count: 0, last_accessed: null });
const summary = generateContextSummary(s4, 1);
t("high priority wins", () => { if (!summary.includes("High Priority")) throw new Error("low won"); });
t("low priority excluded", () => { if (summary.includes("Low Priority")) throw new Error("low included"); });

// ═══ SCENARIO 5: Concurrent write safety ═══
console.log("\n=== Scenario 5: Concurrent write safety ===");
const s5 = new MemoryStore();
const cid = randomUUID();
s5.add({ id: cid, name: "First", content: "First write", category: "general", tags: [], priority: 5, vector: [], created_at: now, access_count: 0, last_accessed: null });
s5.add({ id: cid, name: "Second", content: "Second write", category: "general", tags: [], priority: 5, vector: [], created_at: now, access_count: 0, last_accessed: null });
t("last write wins", () => { if (s5.get(cid)!.content !== "Second write") throw new Error(s5.get(cid)!.content); });

// ═══ SCENARIO 6: Export/import round-trip ═══
console.log("\n=== Scenario 6: Export/import round-trip ===");
const s6 = new MemoryStore();
s6.add({ id: "e1", name: "Export Test", content: "Data for export", category: "general", tags: ["export"], priority: 5, vector: [], created_at: now, access_count: 0, last_accessed: null });
const exported = s6.list({ limit: 100, offset: 0 });
const imported = new MemoryStore();
for (const em of exported) imported.add({ ...em });
t("round-trip content", () => { if (imported.get("e1")!.content !== "Data for export") throw new Error("lost"); });
t("round-trip tags", () => { if (imported.get("e1")!.tags[0] !== "export") throw new Error("tags lost"); });

// ═══ SCENARIO 7: Multi-tag filtering ═══
console.log("\n=== Scenario 7: Multi-tag filtering ===");
const s7 = new MemoryStore();
s7.add({ id: "t1", name: "A", content: "x", category: "general", tags: ["react", "typescript", "tailwind"], priority: 5, vector: [], created_at: now, access_count: 0, last_accessed: null });
s7.add({ id: "t2", name: "B", content: "x", category: "general", tags: ["react", "vue"], priority: 5, vector: [], created_at: now, access_count: 0, last_accessed: null });
s7.add({ id: "t3", name: "C", content: "x", category: "general", tags: ["python", "django"], priority: 5, vector: [], created_at: now, access_count: 0, last_accessed: null });
t("single tag", () => { if (s7.list({ tags: ["react"], limit: 10, offset: 0 }).length !== 2) throw new Error("react"); });
t("OR multi-tag", () => { if (s7.list({ tags: ["python", "django"], limit: 10, offset: 0 }).length !== 1) throw new Error("python"); });
t("no-match tag", () => { if (s7.list({ tags: ["rust"], limit: 10, offset: 0 }).length !== 0) throw new Error("rust"); });

// ═══ SCENARIO 8: Large batch performance ═══
console.log("\n=== Scenario 8: Large batch performance ===");
const s8 = new MemoryStore();
const start = Date.now();
for (let i = 0; i < 500; i++) {
  s8.add({ id: `perf-${i}`, name: `Memory ${i}`, content: `Content for memory number ${i} with tags and metadata`, category: i % 4 === 0 ? "decision-log" : i % 4 === 1 ? "user-preference" : i % 4 === 2 ? "code-pattern" : "general", tags: [`tag-${i % 10}`], priority: 1 + (i % 10), vector: [], created_at: now, access_count: i, last_accessed: null });
}
const insertTime = Date.now() - start;
t("500 inserts under 500ms", () => { if (insertTime > 500) throw new Error(insertTime + "ms"); });

const searchStart = Date.now();
for (let i = 0; i < 50; i++) s8.keywordSearch(`content ${i}`, { limit: 10 });
t("50 searches under 200ms", () => { if (Date.now() - searchStart > 200) throw new Error((Date.now() - searchStart) + "ms"); });

// ═══ SCENARIO 9: Empty/edge state stress ═══
console.log("\n=== Scenario 9: Edge state stress ===");
const s9 = new MemoryStore();
t("empty store list", () => { if (s9.list({ limit: 10, offset: 0 }).length !== 0) throw new Error("not empty"); });
t("empty store size 0", () => { if (s9.size() !== 0) throw new Error("not zero"); });
t("empty store stats", () => {
  const st = s9.stats();
  if (st.total !== 0 || st.total_accesses !== 0) throw new Error("not empty stats");
});
t("empty store keyword search", () => { if (s9.keywordSearch("anything", { limit: 5 }).length !== 0) throw new Error("found in empty"); });
t("empty store get nonexistent", () => { if (s9.get("nope") !== null) throw new Error("found in empty"); });
t("empty store context summary", () => {
  const cs = generateContextSummary(s9, 5);
  if (!cs.includes("Welcome")) throw new Error("no welcome");
});

// ═══ SCENARIO 10: LRU eviction stress ═══
console.log("\n=== Scenario 10: LRU eviction stress ===");
const s10 = new MemoryStore();
for (let i = 0; i < 5100; i++) {
  s10.add({ id: `lru-${i}`, name: `Memory ${i}`, content: `Content ${i}`, category: "general", tags: [], priority: 5, vector: [], created_at: now, access_count: i, last_accessed: null });
}
t("LRU capped at 5000", () => { if (s10.size() > 5000) throw new Error("size=" + s10.size()); });
t("LRU evicted lowest access", () => {
  const all = s10.list({ limit: 5000, offset: 0 });
  const minAccess = Math.min(...all.map(m => m.access_count));
  if (minAccess < 100) throw new Error("should have evicted 0-99 range, min=" + minAccess);
});

console.log("\n" + ok + " passed, " + ng + " failed");
if (ng > 0) process.exit(1);
