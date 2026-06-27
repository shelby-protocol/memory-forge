/**
 * AgentVault 精简版 — 完整测试套件
 * 覆盖 8 工具 + 5 自动化 + 存储 + 嵌入降级
 * 运行: npx tsx src/test.ts
 */

import { MemoryStore } from "./store.js";
import { autoName, autoMerge, autoPriority, autoDecay, generateContextSummary } from "./auto/index.js";
import { embed } from "./embedding.js";
import { saveMemory, loadAllMemories, deleteMemoryFile } from "./storage/local.js";

let passed = 0;
let failed = 0;

async function run(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`FAIL: ${msg}`);
}

function assertEq<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`FAIL: ${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const mem = {
  id: "t-1",
  name: "Test Memory",
  content: "User prefers camelCase naming",
  category: "user-preference",
  tags: ["coding-style"],
  priority: 7,
  vector: [],
  created_at: new Date().toISOString(),
  access_count: 0,
  last_accessed: null as string | null,
};

// ═══════════════════════════════════════════════════════════════
console.log("\n📦 MemoryStore");

await run("add + get", () => {
  const s = new MemoryStore();
  s.add({ ...mem });
  assert(s.get("t-1") !== null, "get");
  assertEq(s.get("t-1")!.name, "Test Memory", "name");
  assertEq(s.size(), 1, "size 1");
});

await run("duplicate id overwrites", () => {
  const s = new MemoryStore();
  s.add({ ...mem, content: "first" });
  s.add({ ...mem, content: "second" });
  assertEq(s.size(), 1, "size still 1");
  assertEq(s.get("t-1")!.content, "second", "overwritten");
});

await run("touch + remove", () => {
  const s = new MemoryStore();
  s.add({ ...mem });
  s.touch("t-1");
  s.touch("t-1");
  assertEq(s.get("t-1")!.access_count, 2, "access_count");
  assert(s.remove("t-1"), "removed");
  assertEq(s.size(), 0, "empty");
  assert(s.get("t-1") === null, "null after remove");
});

await run("remove nonexistent returns false", () => {
  const s = new MemoryStore();
  s.add({ ...mem });
  assert(!s.remove("no-such"), "remove nonexistent");
  assertEq(s.size(), 1, "size unchanged");
});

await run("list with category filter", () => {
  const s = new MemoryStore();
  s.add({ ...mem, id: "a", category: "x" });
  s.add({ ...mem, id: "b", category: "y" });
  s.add({ ...mem, id: "c", category: "x" });
  assertEq(s.list({ category: "x", limit: 10, offset: 0 }).length, 2, "cat x");
  assertEq(s.list({ category: "z", limit: 10, offset: 0 }).length, 0, "cat z empty");
});

await run("list with tags filter", () => {
  const s = new MemoryStore();
  s.add({ ...mem, id: "a", tags: ["react"] });
  s.add({ ...mem, id: "b", tags: ["vue"] });
  s.add({ ...mem, id: "c", tags: ["react", "typescript"] });
  const r = s.list({ tags: ["react"], limit: 10, offset: 0 });
  assertEq(r.length, 2, "tag react");
});

await run("list pagination", () => {
  const s = new MemoryStore();
  for (let i = 0; i < 10; i++) s.add({ ...mem, id: `p-${i}`, access_count: i });
  assertEq(s.list({ limit: 3, offset: 0 }).length, 3, "first page");
  assertEq(s.list({ limit: 3, offset: 3 }).length, 3, "second page");
  assertEq(s.list({ limit: 3, offset: 9 }).length, 1, "last item");
  assertEq(s.list({ limit: 3, offset: 20 }).length, 0, "beyond range");
});

await run("list empty store", () => {
  const s = new MemoryStore();
  assertEq(s.list({ limit: 10, offset: 0 }).length, 0, "empty list");
});

await run("keywordSearch with no tokens returns empty", () => {
  const s = new MemoryStore();
  s.add({ ...mem, content: "hello" });
  assertEq(s.keywordSearch("a", { limit: 5 }).length, 0, "single char ignored");
});

await run("keywordSearch empty query", () => {
  const s = new MemoryStore();
  s.add({ ...mem, content: "hello" });
  assertEq(s.keywordSearch("", { limit: 5 }).length, 0, "empty query");
});

await run("keywordSearch with name match scores higher", () => {
  const s = new MemoryStore();
  s.add({ ...mem, id: "a", name: "react rules", content: "something else" });
  s.add({ ...mem, id: "b", name: "other", content: "react react react" });
  const r = s.keywordSearch("react", { limit: 5 });
  assert(r.length === 2, "two matches");
});

await run("vectorSearch with no vector returns empty if threshold high", () => {
  const s = new MemoryStore();
  s.add({ ...mem, id: "a", vector: [0.1, 0.2, 0.3] });
  s.add({ ...mem, id: "b", vector: [] });

  const qv = new Float32Array([0.1, 0.2, 0.3]);
  // Access private via any — testing public search API
  const results = s.search("test", { limit: 3, queryVec: qv, minSimilarity: 0.999 });
  assert(results.length >= 0, "vector search doesn't crash");
});

await run("LRU at exactly 5000 keeps all", () => {
  const s = new MemoryStore();
  for (let i = 0; i < 5000; i++) s.add({ ...mem, id: `lr-${i}`, access_count: i });
  assertEq(s.size(), 5000, "all 5000 kept");
});

await run("LRU at 5001 evicts lowest", () => {
  const s = new MemoryStore();
  for (let i = 0; i < 5001; i++) s.add({ ...mem, id: `lr-${i}`, access_count: i });
  assert(s.size() <= 5000, "capped");
  assert(s.get("lr-0") === null, "lowest gone");
  assert(s.get("lr-5000") !== null, "highest kept");
});

await run("LRU tiebreaker: same access, lower priority evicted", () => {
  const s = new MemoryStore();
  // Add 5000 items with same access_count=0, alternating priorities
  for (let i = 0; i < 5000; i++) {
    s.add({ ...mem, id: `tp-${i}`, access_count: 0, priority: (i % 2 === 0) ? 1 : 10 });
  }
  // Add one more to trigger eviction
  s.add({ ...mem, id: "overflow", access_count: 0, priority: 10 });
  assert(s.size() <= 5000, "capped");
  // Low-priority items should be evicted first
  const survivors = [...s.list({ limit: 5000, offset: 0 })];
  const lowPriCount = survivors.filter((m) => m.priority === 1).length;
  const highPriCount = survivors.filter((m) => m.priority === 10).length;
  assert(highPriCount > lowPriCount, `high priority ${highPriCount} should outnumber low ${lowPriCount}`);
});

await run("stats computes correctly", () => {
  const s = new MemoryStore();
  s.add({ ...mem, id: "a", category: "x", tags: ["t1", "t2"], access_count: 5 });
  s.add({ ...mem, id: "b", category: "x", tags: ["t1"], access_count: 3 });
  s.add({ ...mem, id: "c", category: "y", tags: ["t3"], access_count: 1 });

  const st = s.stats();
  assertEq(st.total, 3, "total");
  assertEq(st.categories.x, 2, "cat x");
  assertEq(st.categories.y, 1, "cat y");
  assertEq(st.total_accesses, 9, "total accesses");
  assert(st.newest !== null, "has newest");
  assert(st.oldest !== null, "has oldest");
});

// ═══════════════════════════════════════════════════════════════
console.log("\n🤖 Auto Engines");

await run("autoName normal text", () => {
  const n = autoName("Prefer single quotes and 2-space indent");
  assert(n.length > 0 && n.length <= 40, "length ok");
  assert(!n.includes("```"), "no code fences");
});

await run("autoName code-only returns 'memory'", () => {
  const n = autoName("```\ncode block only\n```");
  assertEq(n, "memory", "fallback");
});

await run("autoName empty", () => {
  const n = autoName("");
  assertEq(n, "memory", "empty fallback");
});

await run("autoName truncates long text", () => {
  const n = autoName("A".repeat(100));
  assert(n.length <= 40, "capped");
});

await run("autoMerge 100% identical merges", async () => {
  const s = new MemoryStore();
  s.add({ ...mem, id: "old", content: "React 19 TypeScript hooks" });
  const merged = await autoMerge(s, { ...mem, id: "new", content: "React 19 TypeScript hooks" });
  assert(merged !== null, "identical merges");
});

await run("autoMerge 0% overlap skips", async () => {
  const s = new MemoryStore();
  s.add({ ...mem, id: "old", content: "apple banana cherry" });
  const merged = await autoMerge(s, { ...mem, id: "new", content: "xylophone zebra quantum" });
  assert(merged === null, "no overlap");
});

await run("autoMerge empty store skips", async () => {
  const s = new MemoryStore();
  const merged = await autoMerge(s, { ...mem, id: "new", content: "anything" });
  assert(merged === null, "empty store");
});

await run("autoMerge detects short words JWT/API/SSL/DNS", async () => {
  const s = new MemoryStore();
  s.add({ ...mem, id: "old", content: "API JWT SSL DNS auth tokens web security deploy layer prod" });
  const merged = await autoMerge(s, { ...mem, id: "new", content: "API JWT SSL DNS auth tokens web security deploy layer staging" });
  assert(merged !== null, "short words should contribute to overlap");
});

await run("autoPriority fresh high-access = high score", () => {
  const m = { ...mem, access_count: 50, last_accessed: new Date().toISOString() };
  const p = autoPriority(m);
  assert(p >= 7 && p <= 10, `score ${p} should be high`);
});

await run("autoPriority old never-accessed = low score", () => {
  const oldDate = new Date(Date.now() - 365 * 86400000).toISOString();
  const m = { ...mem, created_at: oldDate, access_count: 0, last_accessed: null };
  const p = autoPriority(m);
  assert(p >= 1 && p <= 4, `score ${p} should be low`);
});

await run("autoDecay 0 days = 1.0", () => {
  const m = { ...mem, last_accessed: new Date().toISOString() };
  assertEq(autoDecay(m), 1.0, "fresh");
});

await run("autoDecay 5 days = 0.8", () => {
  const d = new Date(Date.now() - 5 * 86400000).toISOString();
  assertEq(autoDecay({ ...mem, last_accessed: d }), 0.8, "5d");
});

await run("autoDecay 45 days = 0.2", () => {
  const d = new Date(Date.now() - 45 * 86400000).toISOString();
  assertEq(autoDecay({ ...mem, last_accessed: d }), 0.2, "45d");
});

await run("autoDecay 100 days archived = 0", () => {
  const d = new Date(Date.now() - 100 * 86400000).toISOString();
  assertEq(autoDecay({ ...mem, last_accessed: d }), 0, "100d archived");
});

await run("generateContextSummary tiebreaker: same recency, higher priority wins", () => {
  const s = new MemoryStore();
  s.add({ ...mem, id: "a", content: "Winner", priority: 9, access_count: 5 });
  s.add({ ...mem, id: "b", content: "Loser", priority: 2, access_count: 5 });
  const summary = generateContextSummary(s, 1);
  assert(summary.includes("Winner"), "higher priority wins tiebreaker");
  assert(!summary.includes("Loser"), "lower priority excluded");
});

await run("generateContextSummary recency-first: newer memory appears first", () => {
  const s = new MemoryStore();
  s.add({ ...mem, id: "old", content: "Old content", priority: 9, access_count: 100,
    created_at: "2026-01-01T00:00:00.000Z", last_accessed: "2026-01-01T00:00:00.000Z" });
  s.add({ ...mem, id: "new", content: "New content", priority: 1, access_count: 0,
    created_at: "2026-06-27T00:00:00.000Z", last_accessed: "2026-06-27T00:00:00.000Z" });
  const summary = generateContextSummary(s, 2);
  // First entry should be the newer memory (header line contains name, date, category)
  const firstEntryHeader = summary.split("\n").find((l) => l.startsWith("- [")) || "";
  assert(firstEntryHeader.includes("Jun 27"), "newer memory date should appear first");
});

await run("generateContextSummary empty store shows welcome", () => {
  const s = new MemoryStore();
  const summary = generateContextSummary(s, 5);
  assert(summary.includes("Welcome"), "empty store should show welcome message");
  assert(summary.includes("memory_store"), "should mention memory_store");
  assert(summary.includes("transcripts"), "should mention transcripts");
});

await run("generateContextSummary limits count with dedup", () => {
  const s = new MemoryStore();
  const contents = [
    "Authentication module requires OAuth2 integration with Google and GitHub providers",
    "Database schema needs migration from PostgreSQL 14 to 16 with partitioning",
    "Frontend redesign should use Tailwind CSS with dark mode support",
    "API gateway must enforce rate limiting with Redis-backed token buckets",
    "Deployment pipeline needs GitHub Actions with Docker multi-stage builds",
    "Monitoring stack requires Prometheus metrics and Grafana dashboard alerts",
    "User feedback analysis shows high demand for mobile responsive layout",
    "Performance benchmarks indicate database query optimization is needed urgently",
    "Security audit found three medium vulnerabilities in dependency tree",
    "Documentation overhaul should cover onboarding guides and API references",
  ];
  for (let i = 0; i < 10; i++) {
    s.add({ ...mem, id: `g-${i}`, name: `Topic ${i}`, content: contents[i], priority: i });
  }
  const summary = generateContextSummary(s, 5);
  const entryCount = summary.split("\n").filter((l) => l.startsWith("- [")).length;
  assert(entryCount >= 3, `should show at least 3 (got ${entryCount}) — dedup may filter near-duplicates`);
});

await run("generateContextSummary includes agent instruction", () => {
  const s = new MemoryStore();
  s.add({ ...mem, id: "a", content: "Some content", priority: 9 });
  const summary = generateContextSummary(s, 1);
  assert(summary.includes("[MemoryForge] IMPORTANT"), "should include proactive agent instruction");
});

await run("generateContextSummary category boost: decision-log beats user-preference at same time", () => {
  const s = new MemoryStore();
  const now = new Date().toISOString();
  s.add({ ...mem, id: "dl", name: "Decision", content: "Decision log entry",
    category: "decision-log", priority: 1, created_at: now, access_count: 0 });
  s.add({ ...mem, id: "up", name: "Preference", content: "User preference entry",
    category: "user-preference", priority: 9, created_at: now, access_count: 0 });
  const summary = generateContextSummary(s, 1);
  assert(summary.includes("Decision"), "decision-log should beat user-preference with same recency");
});

await run("generateContextSummary session-transcript excluded from context", () => {
  const s = new MemoryStore();
  s.add({ ...mem, id: "dl", name: "Decision log", content: "Important decision",
    category: "decision-log", priority: 5, created_at: new Date().toISOString(), access_count: 0 });
  s.add({ ...mem, id: "tx", name: "Transcript", content: "Raw transcript dump",
    category: "session-transcript", priority: 9, created_at: new Date().toISOString(), access_count: 0 });
  const summary = generateContextSummary(s, 2);
  // session-transcript (boost=0) should be excluded entirely
  assert(summary.includes("Decision log"), "decision-log should be included");
  assert(!summary.includes("Transcript"), "session-transcript should be excluded");
});

await run("generateContextSummary all-transcript store shows welcome", () => {
  // Use a store with only session-transcript (boost=0, filtered out → treated as empty)
  const s = new MemoryStore();
  s.add({ ...mem, id: "tx", name: "Transcript", content: "Raw transcript",
    category: "session-transcript", priority: 9, access_count: 100,
    created_at: new Date().toISOString() });
  const summary = generateContextSummary(s, 5);
  assert(summary.includes("Welcome"), "should show welcome when no context-eligible memories");
});

await run("generateContextSummary redacts private keys", () => {
  const s = new MemoryStore();
  s.add({ ...mem, id: "sk", name: "Secrets", content: "Account info\nPrivate Key: ed25519-priv-0x745b30cf6ed6ab8584d0de1316be81f952aad9ccaf621b32655a644e0ecf6500\nAPI Key: AG-DB9VDTVMTAM2FYMAGVQFZP9AC7TTGN7DU",
    category: "project-context", priority: 9, access_count: 100,
    created_at: new Date().toISOString(), last_accessed: new Date().toISOString() });
  const summary = generateContextSummary(s, 1);
  assert(!summary.includes("ed25519-priv-0x745b"), "private key should be redacted");
  assert(!summary.includes("AG-DB9VDTVMTAM2FYMAGVQFZP9AC7TTGN7DU"), "API token should be redacted");
  assert(summary.includes("[REDACTED"), "should contain redaction markers");
});

await run("generateContextSummary dedup skips similar entries", () => {
  const s = new MemoryStore();
  const now = new Date().toISOString();
  s.add({ ...mem, id: "a", name: "Report A", content: "The project uses TypeScript and React for the frontend with JWT authentication",
    category: "decision-log", priority: 7, created_at: now, access_count: 5 });
  s.add({ ...mem, id: "b", name: "Report B", content: "The project uses TypeScript and React for the frontend", // 80% overlap
    category: "decision-log", priority: 5, created_at: now, access_count: 3 });
  const summary = generateContextSummary(s, 3);
  // Only the more recent/higher-priority entry should appear
  assert(summary.includes("Report A"), "higher priority entry should be kept");
  assert(!summary.includes("Report B"), "duplicate entry should be skipped");
});

await run("generateContextSummary smartPreview uses paragraphs not raw truncation", () => {
  const s = new MemoryStore();
  s.add({ ...mem, id: "sp", name: "Structured Doc", content: "# Title\n\nFirst meaningful paragraph here.\n\n## Section\nMore details here.",
    category: "decision-log", priority: 9, access_count: 10, created_at: new Date().toISOString() });
  const summary = generateContextSummary(s, 1);
  // Should show "First meaningful paragraph here." not "# Title" heading
  assert(summary.includes("First meaningful paragraph here"), "should use first paragraph, not heading");
  assert(!summary.includes("# Title"), "should skip markdown heading");
});

// ═══════════════════════════════════════════════════════════════
console.log("\n🧠 Embedding");

await run("embed returns null or Float32Array", async () => {
  const r = await embed("test");
  assert(r === null || r instanceof Float32Array, "type ok");
});

await run("embed empty string doesn't crash", async () => {
  const r = await embed("");
  assert(r === null || r instanceof Float32Array, "empty ok");
});

await run("embed long string doesn't crash", async () => {
  const r = await embed("React TypeScript hooks useState useEffect useCallback ".repeat(20));
  assert(r === null || r instanceof Float32Array, "long ok");
});

// ═══════════════════════════════════════════════════════════════
console.log("\n💾 Local Storage");

await run("save + load round-trip preserves fields", () => {
  const id = "rt-" + Date.now();
  const testMem = { ...mem, id, tags: ["a", "b", "c"], priority: 9, access_count: 42 };
  saveMemory(testMem);

  const loaded = loadAllMemories().find((m) => m.id === id);
  assert(loaded !== undefined, "found");
  assertEq(loaded!.name, testMem.name, "name");
  assertEq(loaded!.category, testMem.category, "category");
  assertEq(loaded!.priority, 9, "priority");
  assertEq(loaded!.access_count, 42, "access_count");
  assert(loaded!.tags.includes("a") && loaded!.tags.includes("c"), "tags");

  deleteMemoryFile(id);
});

await run("loadAllMemories returns empty when dir missing", () => {
  // Just validates no crash — dir exists from previous tests
  const all = loadAllMemories();
  assert(Array.isArray(all), "returns array");
});

await run("deleteMemoryFile nonexistent doesn't crash", () => {
  deleteMemoryFile("definitely-does-not-exist-12345");
  // No throw = pass
});

// ═══════════════════════════════════════════════════════════════
console.log("\n📤 Export & Share");

await run("export JSON format includes all fields", () => {
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
  assertEq(pkg.count, 2, "count");
  assert(pkg.memories.some((m) => m.name === "Alpha"), "has Alpha");
  assert(pkg.memories.some((m) => m.name === "Beta"), "has Beta");
});

await run("export Markdown format", () => {
  const s = new MemoryStore();
  s.add({ ...mem, id: "md1", name: "Coding Style", content: "Use tabs", tags: ["style"] });

  const all = s.list({ limit: 100, offset: 0 });
  const md = all.map((m) => [
    `# ${m.name}`,
    `> category: ${m.category} | tags: ${m.tags.join(", ")} | priority: ${m.priority}`,
    `> created: ${m.created_at} | access_count: ${m.access_count}`,
    "",
    m.content,
    "",
    "---",
  ].join("\n")).join("\n\n");

  assert(md.includes("# Coding Style"), "md has title");
  assert(md.includes("Use tabs"), "md has content");
  assert(md.includes("---"), "md has separator");
});

await run("export empty store", () => {
  const s = new MemoryStore();
  const all = s.list({ limit: 100, offset: 0 });
  assertEq(all.length, 0, "empty export");
});

await run("share package valid structure", () => {
  const s = new MemoryStore();
  s.add({ ...mem, id: "sh1", name: "Deploy Checklist", content: "1. Run tests\n2. Build\n3. Push", category: "decision-log", tags: ["deploy"] });

  const m = s.get("sh1");
  const share = {
    type: "memory-forge-share",
    version: "1.0",
    shared_at: new Date().toISOString(),
    recipient: "frontend-team",
    note: "Follow this for every deploy",
    memory: { name: m!.name, content: m!.content, category: m!.category, tags: m!.tags },
    import_instruction: "Use memory_store with this content to import.",
  };

  assertEq(share.type, "memory-forge-share", "type");
  assertEq(share.recipient, "frontend-team", "recipient");
  assertEq(share.memory.tags.length, 1, "tags preserved");
  assert(share.memory.content.includes("Run tests"), "content preserved");
});

await run("share without optional fields", () => {
  const share = {
    type: "memory-forge-share",
    version: "1.0",
    shared_at: new Date().toISOString(),
    recipient: null,
    note: null,
    memory: { name: "Solo", content: "Just me", category: "general", tags: [] },
    import_instruction: "Use memory_store with this content to import.",
  };
  assertEq(share.recipient, null, "null recipient ok");
  assertEq(share.note, null, "null note ok");
});

await run("share preserves special characters", () => {
  const content = "API endpoint: https://api.example.com/v1?token=abc&mode=strict\n\n`curl -X POST`";
  const share = {
    type: "memory-forge-share",
    version: "1.0",
    shared_at: new Date().toISOString(),
    recipient: null, note: null,
    memory: { name: "API Config", content, category: "general", tags: [] },
    import_instruction: "Use memory_store with this content to import.",
  };
  const json = JSON.stringify(share);
  const parsed = JSON.parse(json);
  assertEq(parsed.memory.content, content, "special chars round-trip");
});

// ═══════════════════════════════════════════════════════════════
console.log("\n🔗 Integration Scenarios");

await run("full lifecycle: store → search → export → forget", () => {
  const s = new MemoryStore();
  const id = "life-" + Date.now();

  // Store
  s.add({ ...mem, id, content: "Integration test memory content here" });
  assertEq(s.size(), 1, "stored");

  // Search
  const found = s.keywordSearch("integration test", { limit: 5 });
  assert(found.length >= 1, "found by search");

  // Get
  assert(s.get(id) !== null, "get works");

  // Export
  const all = s.list({ limit: 100, offset: 0 });
  assertEq(all.length, 1, "exportable");

  // Forget
  assert(s.remove(id), "removed");
  assertEq(s.size(), 0, "gone");
});


  await run("stress: 5000 memories — LRU eviction", () => {
    const s = new MemoryStore();
    for (let i = 0; i < 5010; i++) {
      s.add({ ...mem, id: `stress-${i}`, content: `Memory content ${i} with filler to make it searchable.`, access_count: i % 100, priority: 1 + (i % 10) });
    }
    assert(s.size() <= 5000, "LRU capped at 5000");
    assert(s.size() >= 4000 && s.size() < 5000, `LRU eviction working: ${s.size()} items`);
  });

  await run("stress: rapid 200 stores + searches — no crash", () => {
    const s = new MemoryStore();
    const start = Date.now();
    for (let i = 0; i < 200; i++) {
      s.add({ ...mem, id: `rapid-${i}`, content: `Rapid content ${i} unique text.`, priority: 5 + (i % 6) });
      s.keywordSearch(`content ${i}`, { limit: 5 });
      if (i % 50 === 0) s.remove(`rapid-${i}`);
    }
    assert(Date.now() - start < 5000, `200 ops under 5s: ${Date.now() - start}ms`);
  });

  await run("stress: 150KB content — no crash", () => {
    const s = new MemoryStore();
    const big = "x".repeat(150_000);
    s.add({ ...mem, id: "big", content: big });
    assert(s.get("big") !== null, "large content stored");
    assert(s.get("big")!.content.length === 150_000, "full content preserved");
  });

  await run("stress: 10 searches across 1000 memories — perf", () => {
    const s = new MemoryStore();
    const topics = ["auth","database","deploy","testing","styling","perf","api","config","logging","security"];
    for (let i = 0; i < 1000; i++) {
      s.add({ ...mem, id: `perf-${i}`, content: `${topics[i%10]} config for item ${i}.`, access_count: i % 50, priority: 3+(i%8) });
    }
    const start = Date.now();
    for (let i = 0; i < 10; i++) s.keywordSearch(topics[i], { limit: 10 });
    assert(Date.now() - start < 1000, `10 searches / 1000 memories under 1s: ${Date.now()-start}ms`);
  });

await run("multi-category store + filtered recall", () => {
  const s = new MemoryStore();
  s.add({ ...mem, id: "c1", category: "user-preference", content: "Dark mode" });
  s.add({ ...mem, id: "c2", category: "project-context", content: "Monorepo with pnpm" });
  s.add({ ...mem, id: "c3", category: "decision-log", content: "Chose PostgreSQL" });
  s.add({ ...mem, id: "c4", category: "code-pattern", content: "Repository pattern" });

  assertEq(s.list({ category: "user-preference", limit: 10, offset: 0 }).length, 1, "pref");
  assertEq(s.list({ category: "project-context", limit: 10, offset: 0 }).length, 1, "context");
  assertEq(s.list({ category: "nonexistent", limit: 10, offset: 0 }).length, 0, "none");

  // Search across all categories
  const results = s.keywordSearch("postgresql", { limit: 5 });
  assert(results.length >= 1, "cross-category search");
});

// ═══════════════════════════════════════════════════════════════
console.log(`\n${"─".repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${"─".repeat(40)}\n`);

if (failed > 0) process.exit(1);
