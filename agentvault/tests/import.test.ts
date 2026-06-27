import { describe, it, expect, afterAll } from "vitest";
import { rulesToMemories, importRules } from "../src/migrate/import.js";
import type { ImportedRule } from "../src/migrate/import.js";
import { saveMemory, deleteMemoryFile } from "../src/storage/local.js";
import type { Memory } from "../src/store.js";

const U = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 14);

// Long unique padding to prevent 3-gram Jaccard overlap with any real on-disk memory
function content(body: string): string {
  const pad = "x" + U() + "y" + U() + "z" + U();
  return `${body} // ${pad} // ${pad.split("").reverse().join("")}`;
}

const cleanIds: string[] = [];

afterAll(() => {
  for (const id of cleanIds) deleteMemoryFile(id);
});

describe("rulesToMemories", () => {
  it("empty rules returns empty", () => {
    expect(rulesToMemories([])).toHaveLength(0);
  });

  it("single rule creates one memory", () => {
    const rules: ImportedRule[] = [
      { source: "/home/.claude/CLAUDE.md", key: "test", content: content("TypeScript 7.2 strict mode with exactOptionalPropertyTypes enabled for all compilation units across the monorepo") },
    ];
    expect(rulesToMemories(rules)).toHaveLength(1);
  });

  it("memory has correct category for claude-rules", () => {
    const rules: ImportedRule[] = [
      { source: "/home/.claude/CLAUDE.md", key: "test", content: content("Use Biome instead of ESLint for all new TypeScript projects with strict formatting rules") },
    ];
    expect(rulesToMemories(rules)[0].category).toBe("claude-rules");
  });

  it("memory has auto-generated name", () => {
    const rules: ImportedRule[] = [
      { source: "/home/.claude/CLAUDE.md", key: "test", content: content("Prefer tabs over spaces for Rust and Go indentation in all new repositories and projects") },
    ];
    const m = rulesToMemories(rules)[0];
    expect(m).toBeDefined();
    expect(m.name).toBeDefined();
    expect(m.name).not.toBe("memory");
  });

  it("memory gets priority=7", () => {
    const rules: ImportedRule[] = [
      { source: "/home/.claude/CLAUDE.md", key: "test", content: content("All microservices must expose health check endpoints on port 9090 with proper readiness probes") },
    ];
    expect(rulesToMemories(rules)[0].priority).toBe(7);
  });

  it("memory has vector=[] (deferred embedding)", () => {
    const rules: ImportedRule[] = [
      { source: "/home/.claude/CLAUDE.md", key: "test", content: content("All database migrations must include down scripts for rollback support in all production and staging environments") },
    ];
    expect(rulesToMemories(rules)[0].vector).toEqual([]);
  });

  it("memory has valid UUID", () => {
    const rules: ImportedRule[] = [
      { source: "/home/.claude/CLAUDE.md", key: "test", content: content("GraphQL resolvers must implement DataLoader batching by default for all entity query operations and nested field resolution") },
    ];
    expect(rulesToMemories(rules)[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("duplicate rule content deduplicated", () => {
    const dupContent = content("Kyber-1024 lattice-based post-quantum cryptography implementation guidelines for secure protocol design and key exchange mechanisms");
    const rules: ImportedRule[] = [
      { source: "/home/.claude/CLAUDE.md", key: "a", content: dupContent },
      { source: "/home/.claude/CLAUDE.md", key: "b", content: dupContent },
    ];
    expect(rulesToMemories(rules)).toHaveLength(1);
  });

  it("different rules NOT deduplicated", () => {
    const rules: ImportedRule[] = [
      { source: "/home/.claude/CLAUDE.md", key: "a", content: content("React 19 with Tailwind v5 and shadcn/ui v3 component architecture patterns for scalable dashboard UI design") },
      { source: "/home/.claude/CLAUDE.md", key: "b", content: content("FastAPI with PostgreSQL v17 and Redis v8 caching layer orchestration for high-throughput microservice APIs") },
    ];
    expect(rulesToMemories(rules)).toHaveLength(2);
  });

  it("dedup against existing saved memory", () => {
    const dedupContent = content("Always use pnpm v10 instead of npm for monorepo package management across all workspaces and CI pipelines");
    const mem: Memory = {
      id: "existing-rule-test-001", name: "Existing Rule", content: dedupContent,
      category: "claude-rules", tags: ["pnpm"], priority: 7, vector: [],
      created_at: new Date().toISOString(), access_count: 0, last_accessed: null,
    };
    saveMemory(mem);
    cleanIds.push("existing-rule-test-001");

    const rules: ImportedRule[] = [{ source: "/home/.claude/CLAUDE.md", key: "test", content: dedupContent }];
    expect(rulesToMemories(rules)).toHaveLength(0);
  });

  it("new unique rule passes dedup against saved memories", () => {
    const baselineContent = content("Xylophone zebra quantum cryptography baseline reference memory for import dedup verification against stored datasets");
    const mem: Memory = {
      id: "unique-baseline-001", name: "Baseline",
      content: baselineContent,
      category: "claude-rules", tags: [], priority: 7, vector: [],
      created_at: new Date().toISOString(), access_count: 0, last_accessed: null,
    };
    saveMemory(mem);
    cleanIds.push("unique-baseline-001");

    const rules: ImportedRule[] = [
      { source: "/home/.cursor/rules/testing.md", key: "cursor-testing", content: content("All API endpoints must return RFC 9457 Problem Details JSON error bodies with proper content negotiation headers for client error handling") },
    ];
    expect(rulesToMemories(rules)).toHaveLength(1);
  });

  it("tags derived from source filename", () => {
    const rules: ImportedRule[] = [
      { source: "/Users/test/CLAUDE.md", key: "r1-" + Date.now(), content: content("Specific rule content for verifying tag derivation from source filenames in the import pipeline with various edge cases and encoding scenarios") },
    ];
    const tags = rulesToMemories(rules)[0].tags;
    expect(tags.length).toBeGreaterThanOrEqual(1);
    expect(tags.some((t: string) => t.toLowerCase().includes("claude"))).toBe(true);
  });

  it("mix of valid rules from different sources", () => {
    const rules: ImportedRule[] = [
      { source: "/home/.claude/CLAUDE.md", key: "c1", content: content("Nix flakes for reproducible development environments across all machines operating systems and CPU architectures") },
      { source: "/home/.cursor/rules/a.mdc", key: "c2", content: content("OpenTelemetry tracing required for all gRPC service-to-service calls with W3C context propagation and sampling policies") },
    ];
    expect(rulesToMemories(rules)).toHaveLength(2);
  });
});

describe("importRules smoke", () => {
  it("returns array", () => {
    expect(Array.isArray(importRules())).toBe(true);
  });

  it("each rule has required fields", () => {
    for (const r of importRules()) {
      expect(typeof r.source).toBe("string");
      expect(typeof r.key).toBe("string");
      expect(typeof r.content).toBe("string");
      expect(r.content.length).toBeGreaterThanOrEqual(10);
    }
  });
});
