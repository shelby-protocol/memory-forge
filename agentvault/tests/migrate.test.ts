import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";

const FAKE_MF = "/tmp/mock-mf";

const mockFs = vi.hoisted(() => {
  const files = new Map<string, string>();
  return { files };
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn((p: unknown) => {
      const s = String(p).replace(/\\/g, "/");
      if (s.startsWith(FAKE_MF)) {
        const keys = Array.from(mockFs.files.keys());
        return keys.some((k) => k.startsWith(s)) || s.endsWith("memories") || s === FAKE_MF;
      }
      return actual.existsSync(p as string);
    }),
    readdirSync: vi.fn((p: unknown) => {
      const s = String(p).replace(/\\/g, "/");
      if (s.startsWith(FAKE_MF)) {
        return Array.from(mockFs.files.keys())
          .filter((k) => k.startsWith(s) && k.endsWith(".md"))
          .map((k) => k.split("/").pop()!);
      }
      return actual.readdirSync(p as import("fs").PathLike);
    }),
    readFileSync: vi.fn((p: unknown) => {
      const s = String(p).replace(/\\/g, "/");
      const content = mockFs.files.get(s);
      if (content !== undefined) return content;
      return actual.readFileSync(p as string);
    }),
    writeFileSync: vi.fn((p: unknown, data: unknown) => {
      const s = String(p).replace(/\\/g, "/");
      mockFs.files.set(s, String(data));
    }),
    mkdirSync: vi.fn(),
    renameSync: vi.fn((oldPath: unknown, newPath: unknown) => {
      const old = String(oldPath).replace(/\\/g, "/");
      const newP = String(newPath).replace(/\\/g, "/");
      const content = mockFs.files.get(old);
      if (content !== undefined) {
        mockFs.files.set(newP, content);
        mockFs.files.delete(old);
      }
    }),
    unlinkSync: vi.fn((p: unknown) => {
      const s = String(p).replace(/\\/g, "/");
      mockFs.files.delete(s);
    }),
  };
});

const legacyMemMd = (id: string, category: string, content: string) =>
  [
    `# Test ${id}`,
    `> category: ${category}`,
    `> tags: []`,
    `> priority: 5`,
    `> created: 2026-06-29T00:00:00.000Z`,
    `> access_count: 0`,
    `> last_accessed: `,
    ``,
    content,
  ].join("\n");

describe("migrateLegacyMemories (unit)", () => {
  beforeEach(() => {
    mockFs.files.clear();
    vi.resetModules();
    process.env.MEMORYFORGE_HOME = FAKE_MF;
  });

  afterAll(() => {
    delete process.env.MEMORYFORGE_HOME;
  });

  it("returns zero when no legacy memories", async () => {
    const { migrateLegacyMemories } = await import("../src/migrate/legacy.js");
    const result = migrateLegacyMemories({
      projectHash: "abc123",
      projectName: "test",
    });
    expect(result.total).toBe(0);
    expect(result.movedToProject).toBe(0);
  });

  it("moves project-category memory to project dir", async () => {
    const legacyPath = `${FAKE_MF}/memories/test-1.md`;
    mockFs.files.set(
      legacyPath,
      legacyMemMd(
        "test-1",
        "project-context",
        "This is a test memory about project configuration details",
      ),
    );

    const { migrateLegacyMemories } = await import("../src/migrate/legacy.js");
    const result = migrateLegacyMemories({
      projectHash: "abc123",
      projectName: "test-project",
    });

    expect(result.total).toBe(1);
    expect(result.movedToProject).toBe(1);
    expect(mockFs.files.has(legacyPath)).toBe(false);
    expect(
      Array.from(mockFs.files.keys()).some((k) => k.includes("projects/abc123/memories/test-1.md")),
    ).toBe(true);
  });

  it("routes user-preference to global dir", async () => {
    const legacyPath = `${FAKE_MF}/memories/pref-1.md`;
    mockFs.files.set(
      legacyPath,
      legacyMemMd("pref-1", "user-preference", "Always use camelCase for variable names"),
    );

    const { migrateLegacyMemories } = await import("../src/migrate/legacy.js");
    const result = migrateLegacyMemories({
      projectHash: "abc123",
      projectName: "test",
    });

    expect(result.movedToGlobal).toBe(1);
    expect(mockFs.files.has(legacyPath)).toBe(false);
    expect(
      Array.from(mockFs.files.keys()).some((k) => k.includes("global/memories/pref-1.md")),
    ).toBe(true);
  });

  it("routes claude-rules to global dir", async () => {
    const legacyPath = `${FAKE_MF}/memories/rule-1.md`;
    mockFs.files.set(
      legacyPath,
      legacyMemMd(
        "rule-1",
        "claude-rules",
        "Always format code before committing to the repository",
      ),
    );

    const { migrateLegacyMemories } = await import("../src/migrate/legacy.js");
    const result = migrateLegacyMemories({
      projectHash: "abc123",
      projectName: "test",
    });

    expect(result.movedToGlobal).toBe(1);
    expect(mockFs.files.has(legacyPath)).toBe(false);
  });

  it("skips if target already exists", async () => {
    const legacyPath = `${FAKE_MF}/memories/dup-1.md`;
    const existingPath = `${FAKE_MF}/projects/abc123/memories/dup-1.md`;

    mockFs.files.set(
      legacyPath,
      legacyMemMd(
        "dup-1",
        "project-context",
        "This is a test memory about project configuration details",
      ),
    );
    mockFs.files.set(existingPath, legacyMemMd("dup-1", "project-context", "already here"));

    const { migrateLegacyMemories } = await import("../src/migrate/legacy.js");
    const result = migrateLegacyMemories({
      projectHash: "abc123",
      projectName: "test",
    });

    expect(result.skipped).toBe(1);
    expect(result.movedToProject).toBe(0);
    expect(mockFs.files.has(legacyPath)).toBe(false); // deleted as duplicate
  });

  it("dry-run does not move or delete", async () => {
    const legacyPath = `${FAKE_MF}/memories/dry-1.md`;
    mockFs.files.set(
      legacyPath,
      legacyMemMd(
        "dry-1",
        "project-context",
        "This is a test memory about project configuration details",
      ),
    );

    const { migrateLegacyMemories } = await import("../src/migrate/legacy.js");
    const result = migrateLegacyMemories({
      projectHash: "abc123",
      projectName: "test",
      dryRun: true,
    });

    expect(result.total).toBe(1);
    expect(result.movedToProject).toBe(1);
    expect(mockFs.files.has(legacyPath)).toBe(true);
  });

  it("routes cursor-rules to global dir", async () => {
    const legacyPath = `${FAKE_MF}/memories/cursor-1.md`;
    mockFs.files.set(
      legacyPath,
      legacyMemMd("cursor-1", "cursor-rules", "Use 2-space indentation in all TypeScript files"),
    );

    const { migrateLegacyMemories } = await import("../src/migrate/legacy.js");
    const result = migrateLegacyMemories({
      projectHash: "abc123",
      projectName: "test",
    });

    expect(result.movedToGlobal).toBe(1);
    expect(mockFs.files.has(legacyPath)).toBe(false);
  });
});
