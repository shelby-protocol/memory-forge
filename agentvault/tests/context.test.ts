import { describe, it, expect } from "vitest";
import { MemoryStore } from "../src/store.js";
import { generateContextSummary } from "../src/auto/index.js";
import { makeMemory } from "./test-helpers.js";

const mem = makeMemory();
const now = new Date().toISOString();

describe("generateContextSummary", () => {
  it("tiebreaker: same recency, higher priority wins", () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "a", name: "Winner", content: "Winner", priority: 9, access_count: 5 });
    s.add({ ...mem, id: "b", name: "Loser", content: "Loser", priority: 2, access_count: 5 });
    const summary = generateContextSummary(s, 1);
    expect(summary).toContain("Winner");
    expect(summary).not.toContain("Loser");
  });

  it("recency-first: newer memory appears first", () => {
    const s = new MemoryStore();
    s.add({
      ...mem,
      id: "old",
      name: "Old",
      content: "Old content",
      priority: 9,
      access_count: 100,
      created_at: "2026-01-01T00:00:00.000Z",
      last_accessed: "2026-01-01T00:00:00.000Z",
    });
    s.add({
      ...mem,
      id: "new",
      name: "New",
      content: "New content",
      priority: 1,
      access_count: 0,
      created_at: now,
      last_accessed: now,
    });
    const summary = generateContextSummary(s, 2);
    const firstLine = summary.split("\n").find((l: string) => l.startsWith("- [")) || "";
    expect(firstLine).toContain("New");
  });

  it("empty store shows welcome message", () => {
    const summary = generateContextSummary(new MemoryStore(), 5);
    expect(summary).toContain("Welcome");
    expect(summary).toContain("memory_store");
    expect(summary).toContain("transcripts");
  });

  it("dedup skips similar entries", () => {
    const s = new MemoryStore();
    s.add({
      ...mem,
      id: "a",
      name: "Report A",
      content: "TypeScript React frontend JWT auth",
      category: "decision-log",
      priority: 7,
      created_at: now,
      access_count: 5,
    });
    s.add({
      ...mem,
      id: "b",
      name: "Report B",
      content: "TypeScript React frontend",
      category: "decision-log",
      priority: 5,
      created_at: now,
      access_count: 3,
    });
    const summary = generateContextSummary(s, 3);
    expect(summary).toContain("Report A");
    expect(summary).not.toContain("Report B");
  });

  it("includes agent instruction", () => {
    const s = new MemoryStore();
    s.add({ ...mem, id: "a", content: "Some content", priority: 9 });
    const summary = generateContextSummary(s, 1);
    expect(summary).toContain("[MemoryForge]");
  });

  it("newer beats older regardless of category", () => {
    const s = new MemoryStore();
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    s.add({
      ...mem,
      id: "old-dl",
      name: "Old Decision",
      content: "Old decision log",
      category: "decision-log",
      priority: 9,
      created_at: yesterday,
      access_count: 0,
      last_accessed: yesterday,
    });
    s.add({
      ...mem,
      id: "new-up",
      name: "New Preference",
      content: "New user preference",
      category: "user-preference",
      priority: 1,
      created_at: now,
      access_count: 0,
      last_accessed: now,
    });
    const summary = generateContextSummary(s, 1);
    expect(summary).toContain("New Preference");
  });

  it("evergreen: priority=10 force-included", () => {
    const s = new MemoryStore();
    const veryOld = new Date(Date.now() - 90 * 86400000).toISOString();
    s.add({
      ...mem,
      id: "ever",
      name: "Evergreen",
      content: "Critical evergreen fact",
      category: "general",
      priority: 10,
      created_at: veryOld,
      access_count: 0,
      last_accessed: veryOld,
    });
    s.add({
      ...mem,
      id: "new",
      name: "New Memory",
      content: "Newly stored",
      category: "user-preference",
      priority: 5,
      created_at: now,
      access_count: 0,
      last_accessed: now,
    });
    expect(generateContextSummary(s, 2)).toContain("Evergreen");
  });

  it("session-transcript excluded from context", () => {
    const s = new MemoryStore();
    s.add({
      ...mem,
      id: "dl",
      name: "Decision log",
      content: "Important decision",
      category: "decision-log",
      priority: 5,
      created_at: now,
      access_count: 0,
    });
    s.add({
      ...mem,
      id: "tx",
      name: "Transcript",
      content: "Raw transcript dump",
      category: "session-transcript",
      priority: 9,
      created_at: now,
      access_count: 0,
    });
    const summary = generateContextSummary(s, 2);
    expect(summary).toContain("Decision log");
    expect(summary).not.toContain("Transcript");
  });

  it("all-transcript store shows welcome", () => {
    const s = new MemoryStore();
    s.add({
      ...mem,
      id: "tx",
      name: "Transcript",
      content: "Raw transcript",
      category: "session-transcript",
      priority: 9,
      access_count: 100,
      created_at: now,
    });
    expect(generateContextSummary(s, 5)).toContain("Welcome");
  });

  it("redacts private keys", () => {
    const s = new MemoryStore();
    s.add({
      ...mem,
      id: "sk",
      name: "Secrets",
      content:
        "Account info\nPrivate Key: ed25519-priv-0x745b30cf6ed6ab8584d0de1316be81f952aad9ccaf621b32655a644e0ecf6500\nAPI Key: AG-DB9VDTVMTAM2FYMAGVQFZP9AC7TTGN7DU",
      category: "project-context",
      priority: 9,
      access_count: 100,
      created_at: now,
      last_accessed: now,
    });
    const summary = generateContextSummary(s, 1);
    expect(summary).not.toContain("ed25519-priv-0x745b");
    expect(summary).not.toContain("AG-DB9VDTVMTAM2FYMAGVQFZP9AC7TTGN7DU");
    expect(summary).toContain("[REDACTED");
  });

  it("smartPreview uses paragraphs not raw truncation", () => {
    const s = new MemoryStore();
    s.add({
      ...mem,
      id: "sp",
      name: "Structured Doc",
      content: "# Title\n\nActual paragraph content here.\n\n## Section\nMore details.",
      category: "decision-log",
      priority: 9,
      access_count: 10,
      created_at: now,
    });
    const summary = generateContextSummary(s, 1);
    expect(summary).toContain("Actual paragraph content here");
    expect(summary).not.toContain("# Title");
  });

  it("limits count with dedup", () => {
    const s = new MemoryStore();
    const contents = [
      "Auth module OAuth2 Google GitHub providers",
      "Database migration PostgreSQL 14 to 16 partitioning",
      "Frontend redesign Tailwind CSS dark mode",
      "API gateway rate limiting Redis token buckets",
      "Deployment GitHub Actions Docker multi-stage",
      "Monitoring Prometheus Grafana dashboard alerts",
      "User feedback mobile responsive layout demand",
      "Performance database query optimization urgent",
      "Security audit medium vulnerabilities dependency tree",
      "Documentation onboarding guides API references",
    ];
    for (let i = 0; i < 10; i++) {
      s.add({ ...mem, id: `g-${i}`, name: `Topic ${i}`, content: contents[i], priority: i });
    }
    const summary = generateContextSummary(s, 5);
    const entryCount = summary.split("\n").filter((l: string) => l.startsWith("- [")).length;
    expect(entryCount).toBeGreaterThanOrEqual(3);
  });
});
