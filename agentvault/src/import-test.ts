/**
 * Rule import unit tests.
 * All test content uses unique markers to avoid dedup collision with existing memories.
 * Run: npx tsx src/import-test.ts
 */
import { rulesToMemories } from "./migrate/import.js";
import type { ImportedRule } from "./migrate/import.js";
import { saveMemory, loadAllMemories, deleteMemoryFile } from "./storage/local.js";
import type { Memory } from "./store.js";

const M = "IMPORT-TEST-UNIQUE-MARKER-";

let ok = 0; let ng = 0;
function t(name: string, fn: () => void) { try { fn(); ok++; } catch(e: any) { ng++; console.log(`  FAIL ${name}: ${e.message}`); } }

// ═══ 1. rulesToMemories — basic ═══
console.log("=== 1. rulesToMemories basic ===");

t("empty rules returns empty", () => {
  const result = rulesToMemories([]);
  if (result.length !== 0) throw new Error(`expected 0, got ${result.length}`);
});

t("single rule creates one memory", () => {
  const rules: ImportedRule[] = [{ source: "/home/.claude/CLAUDE.md", key: "test", content: M + "Q7X9: TypeScript 7.2 strict mode with exactOptionalPropertyTypes enabled" }];
  const result = rulesToMemories(rules);
  if (result.length !== 1) throw new Error(`expected 1, got ${result.length}`);
});

t("memory has correct category for claude-rules", () => {
  const rules: ImportedRule[] = [{ source: "/home/.claude/CLAUDE.md", key: "test", content: M + "K3W2: Use Biome instead of ESLint for all new projects" }];
  const result = rulesToMemories(rules);
  if (result[0].category !== "claude-rules") throw new Error(`category: "${result[0].category}"`);
});

t("memory has auto-generated name", () => {
  const rules: ImportedRule[] = [{ source: "/home/.claude/CLAUDE.md", key: "test", content: M + "L9P1: Prefer tabs over spaces for Rust and Go indentation" }];
  const result = rulesToMemories(rules);
  if (!result[0].name || result[0].name === "memory") throw new Error(`bad name: "${result[0].name}"`);
});

t("memory gets priority=7", () => {
  const rules: ImportedRule[] = [{ source: "/home/.claude/CLAUDE.md", key: "test", content: M + "M5R8: All microservices must expose health check endpoints on port 9090" }];
  const result = rulesToMemories(rules);
  if (result[0].priority !== 7) throw new Error(`priority=${result[0].priority}`);
});

t("memory has vector=[] (deferred embedding)", () => {
  const rules: ImportedRule[] = [{ source: "/home/.claude/CLAUDE.md", key: "test", content: M + "F2T6: All database migrations require down scripts for rollback support" }];
  const result = rulesToMemories(rules);
  if (result[0].vector.length !== 0) throw new Error("vector should be empty");
});

t("memory has valid UUID", () => {
  const rules: ImportedRule[] = [{ source: "/home/.claude/CLAUDE.md", key: "test", content: M + "B8N4: GraphQL resolvers must implement DataLoader batching by default" }];
  const result = rulesToMemories(rules);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(result[0].id)) throw new Error(`bad UUID: "${result[0].id}"`);
});

// ═══ 2. rulesToMemories — dedup ═══
console.log("\n=== 2. rulesToMemories dedup ===");

t("duplicate rule content deduplicated", () => {
  const dupContent = M + "DEDUP-TEST: Kyber-1024 lattice-based post-quantum cryptography implementation guidelines";
  const rules: ImportedRule[] = [
    { source: "/home/.claude/CLAUDE.md", key: "a", content: dupContent },
    { source: "/home/.claude/CLAUDE.md", key: "b", content: dupContent },
  ];
  const result = rulesToMemories(rules);
  if (result.length !== 1) throw new Error(`expected 1 (deduped), got ${result.length}`);
});

t("similar but different rules NOT deduplicated", () => {
  const rules: ImportedRule[] = [
    { source: "/home/.claude/CLAUDE.md", key: "a", content: M + "FRONTEND-TEST: React 19 with Tailwind v5 and shadcn/ui v3 component architecture decisions" },
    { source: "/home/.claude/CLAUDE.md", key: "b", content: M + "BACKEND-TEST: FastAPI with PostgreSQL v17 and Redis v8 caching layer orchestration patterns" },
  ];
  const result = rulesToMemories(rules);
  if (result.length !== 2) throw new Error(`expected 2, got ${result.length}`);
});

// ═══ 3. rulesToMemories — dedup vs existing ═══
console.log("\n=== 3. rulesToMemories vs existing memories ===");

t("dedup against existing saved memory", () => {
  const dedupContent = M + "EXISTING-DEDUP: Always use pnpm v10 instead of npm for monorepo package management";
  const mem: Memory = {
    id: "existing-rule-test-001", name: "Existing Rule",
    content: dedupContent,
    category: "claude-rules", tags: ["pnpm"], priority: 7, vector: [],
    created_at: new Date().toISOString(), access_count: 0, last_accessed: null,
  };
  saveMemory(mem);

  const rules: ImportedRule[] = [{ source: "/home/.claude/CLAUDE.md", key: "test", content: dedupContent }];
  const result = rulesToMemories(rules);
  if (result.length !== 0) throw new Error(`expected 0 (deduped), got ${result.length}`);

  deleteMemoryFile("existing-rule-test-001");
});

t("new unique rule passes dedup against saved memories", () => {
  const mem: Memory = {
    id: "unique-baseline-001", name: "Baseline",
    content: M + "BASELINE-TEST: Xylophone zebra quantum cryptography baseline memory for import dedup verification",
    category: "claude-rules", tags: [], priority: 7, vector: [],
    created_at: new Date().toISOString(), access_count: 0, last_accessed: null,
  };
  saveMemory(mem);

  const rules: ImportedRule[] = [{
    source: "/home/.cursor/rules/testing.md", key: "cursor-testing",
    content: M + "CURSOR-TEST: All API endpoints must return RFC 9457 Problem Details JSON error bodies",
  }];
  const result = rulesToMemories(rules);
  if (result.length !== 1) throw new Error(`expected 1, got ${result.length}`);

  deleteMemoryFile("unique-baseline-001");
});

// ═══ 4. importRules — smoke test ═══
console.log("\n=== 4. importRules smoke ===");
import { importRules } from "./migrate/import.js";

t("importRules returns array", () => {
  const rules = importRules();
  if (!Array.isArray(rules)) throw new Error("should return array");
});

t("importRules each rule has required fields", () => {
  const rules = importRules();
  for (const r of rules) {
    if (typeof r.source !== "string") throw new Error("missing source");
    if (typeof r.key !== "string") throw new Error("missing key");
    if (typeof r.content !== "string") throw new Error("missing content");
    if (r.content.length < 10) throw new Error(`content too short: ${r.content.length} chars`);
  }
});

// ═══ 5. rulesToMemories — multiple sources ═══
console.log("\n=== 5. rulesToMemories multiple sources ===");

t("mix of valid rules from different sources", () => {
  const rules: ImportedRule[] = [
    { source: "/home/.claude/CLAUDE.md", key: "c1", content: M + "MULTI-1: Nix flakes for reproducible development environments across all machines" },
    { source: "/home/.cursor/rules/a.mdc", key: "c2", content: M + "MULTI-2: OpenTelemetry tracing required for all gRPC service-to-service calls" },
  ];
  const result = rulesToMemories(rules);
  if (result.length !== 2) throw new Error(`expected 2, got ${result.length}`);
});

t("tags derived from source filename", () => {
  const rules: ImportedRule[] = [{ source: "/Users/test/CLAUDE.md", key: "r1", content: M + "TAG-TEST: Some rule content specifically for tag extraction verification" }];
  const result = rulesToMemories(rules);
  if (result[0].tags.length === 0) throw new Error("should have at least 1 tag");
  if (!result[0].tags.some((t: string) => t.includes("CLAUDE") || t.includes("claude"))) throw new Error(`unexpected tags: ${result[0].tags}`);
});

console.log(`\n${ok} passed, ${ng} failed`);
if (ng > 0) process.exit(1);
