import { describe, it, expect, vi, afterAll } from "vitest";

const origExit = process.exit;

function mockExit() {
  process.exit = vi.fn((code?: number) => {
    throw new Error(`__EXIT__:${code ?? 0}`);
  }) as unknown as (code?: number) => never;
}

describe("CLI — migrate", () => {
  afterAll(() => {
    process.exit = origExit;
  });

  async function run(argv: string[]) {
    mockExit();
    process.argv = ["node", "memory-forge", ...argv];
    vi.resetModules();
    try {
      await import("../src/index.js");
    } catch (e) {
      if (!(e instanceof Error && e.message.startsWith("__EXIT__"))) throw e;
    }
  }

  it("prints 'No legacy memories' when none exist", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s: string) => logs.push(s));
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.doMock("../src/storage/local.js", () => ({
      loadAllMemories: vi.fn().mockReturnValue([]),
      loadGlobalMemories: vi.fn().mockReturnValue([]),
      loadProjectMemories: vi.fn().mockReturnValue([]),
      hasLegacyMemories: vi.fn().mockReturnValue(false),
      cleanupTombstones: vi.fn(),
      deleteMemoryFile: vi.fn(),
      saveMemory: vi.fn(),
    }));

    await run(["migrate"]);
    expect(logs.some((l) => l.includes("No legacy memories"))).toBe(true);
  });

  it("shows error when no project detected", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s: string) => logs.push(s));
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.doMock("../src/storage/local.js", () => ({
      loadAllMemories: vi.fn().mockReturnValue([]),
      loadGlobalMemories: vi.fn().mockReturnValue([]),
      loadProjectMemories: vi.fn().mockReturnValue([]),
      hasLegacyMemories: vi.fn().mockReturnValue(true),
      cleanupTombstones: vi.fn(),
      deleteMemoryFile: vi.fn(),
      saveMemory: vi.fn(),
    }));

    vi.doMock("../src/project.js", () => ({
      resolveProject: vi.fn().mockReturnValue(null),
      getGlobalModeHint: vi.fn().mockReturnValue(""),
    }));

    await run(["migrate"]);
    expect(logs.some((l) => l.includes("No project detected"))).toBe(true);
  });

  it("dry-run prints preview", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s: string) => logs.push(s));
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.doMock("../src/storage/local.js", () => ({
      loadAllMemories: vi.fn().mockReturnValue([]),
      loadGlobalMemories: vi.fn().mockReturnValue([]),
      loadProjectMemories: vi.fn().mockReturnValue([]),
      hasLegacyMemories: vi.fn().mockReturnValue(true),
      cleanupTombstones: vi.fn(),
      deleteMemoryFile: vi.fn(),
      saveMemory: vi.fn(),
    }));

    vi.doMock("../src/project.js", () => ({
      resolveProject: vi
        .fn()
        .mockReturnValue({ hash: "abc123", name: "test-project", source: "git-remote" }),
      getGlobalModeHint: vi.fn().mockReturnValue(""),
    }));

    vi.doMock("../src/migrate/legacy.js", () => ({
      migrateLegacyMemories: vi.fn().mockReturnValue({
        movedToProject: 5,
        movedToGlobal: 2,
        skipped: 0,
        errors: 0,
        total: 7,
      }),
    }));

    await run(["migrate", "--dry-run"]);
    expect(logs.some((l) => l.includes("[DRY RUN]"))).toBe(true);
    expect(logs.some((l) => l.includes("Legacy memories found: 7"))).toBe(true);
  });

  it("migrates with project auto-detection", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s: string) => logs.push(s));
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.doMock("../src/storage/local.js", () => ({
      loadAllMemories: vi.fn().mockReturnValue([]),
      loadGlobalMemories: vi.fn().mockReturnValue([]),
      loadProjectMemories: vi.fn().mockReturnValue([]),
      hasLegacyMemories: vi.fn().mockReturnValue(true),
      cleanupTombstones: vi.fn(),
      deleteMemoryFile: vi.fn(),
      saveMemory: vi.fn(),
    }));

    vi.doMock("../src/project.js", () => ({
      resolveProject: vi
        .fn()
        .mockReturnValue({ hash: "abc123", name: "test-project", source: "git-remote" }),
      getGlobalModeHint: vi.fn().mockReturnValue(""),
    }));

    let capturedProject: string | undefined;
    vi.doMock("../src/migrate/legacy.js", () => ({
      migrateLegacyMemories: vi.fn((opts: { projectHash: string; projectName: string }) => {
        capturedProject = opts.projectName;
        return { movedToProject: 3, movedToGlobal: 0, skipped: 0, errors: 0, total: 3 };
      }),
    }));

    await run(["migrate"]);
    expect(logs.some((l) => l.includes("Legacy memories found"))).toBe(true);
    expect(capturedProject).toBe("test-project");
  });

  it("accepts --project and --project-hash flags", async () => {
    let capturedProject: string | undefined;
    vi.doMock("../src/migrate/legacy.js", () => ({
      migrateLegacyMemories: vi.fn((opts: { projectHash: string; projectName: string }) => {
        capturedProject = opts.projectName;
        return { movedToProject: 1, movedToGlobal: 0, skipped: 0, errors: 0, total: 1 };
      }),
    }));

    vi.doMock("../src/storage/local.js", () => ({
      loadAllMemories: vi.fn().mockReturnValue([]),
      loadGlobalMemories: vi.fn().mockReturnValue([]),
      loadProjectMemories: vi.fn().mockReturnValue([]),
      hasLegacyMemories: vi.fn().mockReturnValue(true),
      cleanupTombstones: vi.fn(),
      deleteMemoryFile: vi.fn(),
      saveMemory: vi.fn(),
    }));

    vi.doMock("../src/project.js", () => ({
      resolveProject: vi.fn().mockReturnValue(null),
      getGlobalModeHint: vi.fn().mockReturnValue(""),
    }));

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s: string) => logs.push(s));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await run(["migrate", "--project", "my-custom-project", "--project-hash", "def456ghi789"]);
    expect(capturedProject).toBe("my-custom-project");
  });
});
