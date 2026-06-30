import { describe, it, expect, vi, afterAll } from "vitest";

// Keep original exit
const origExit = process.exit;

// Mock project detection for CLI tests (no real git in test env)
vi.mock("../src/project.js", () => ({
  resolveProject: vi.fn().mockReturnValue(null),
  getGlobalModeHint: vi.fn().mockReturnValue(""),
}));

// Mock process.exit to record code without throwing
function mockExit() {
  process.exit = vi.fn((code?: number) => {
    throw new Error(`__EXIT__:${code ?? 0}`);
  }) as unknown as (code?: number) => never;
}

function mockExitNoThrow() {
  process.exit = vi.fn() as unknown as (code?: number) => never;
}

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    readFileSync: vi
      .fn()
      .mockImplementation((p: string) =>
        p.endsWith("package.json") ? '{"version":"0.8.2"}' : actual.readFileSync(p),
      ),
  };
});
vi.mock("../src/embedding.js", () => ({ preload: vi.fn() }));
vi.mock("../src/storage/local.js", () => ({
  loadAllMemories: vi.fn().mockReturnValue([]),
  loadGlobalMemories: vi.fn().mockReturnValue([]),
  loadProjectMemories: vi.fn().mockReturnValue([]),
  hasLegacyMemories: vi.fn().mockReturnValue(false),
  cleanupTombstones: vi.fn(),
  deleteMemoryFile: vi.fn(),
  saveMemory: vi.fn(),
}));
vi.mock("../src/storage/shelby.js", () => ({
  deleteBlob: vi.fn().mockResolvedValue(undefined),
  getBlobName: vi.fn((id: string) => `blob-${id}`),
  getShelbyConfig: vi.fn().mockReturnValue({}),
  getBalances: vi.fn().mockResolvedValue({ apt: "1.5", shelbyUsd: "100.0" }),
  getStorageUsage: vi.fn().mockResolvedValue({ blobCount: 3, totalBytes: 10240 }),
  initShelby: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/auto/index.js", () => ({
  autoPriority: vi.fn().mockReturnValue(5),
  autoDecay: vi.fn().mockReturnValue(1),
  generateContextSummary: vi.fn().mockReturnValue("[MemoryForge] Test context."),
}));
vi.mock("../src/setup.js", () => ({
  setup: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/pro.js", () => ({
  pro: vi.fn().mockResolvedValue(undefined),
  proStatus: vi.fn().mockReturnValue({ active: false }),
  proAutoActivate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/transcript.js", () => ({
  captureTranscript: vi.fn().mockReturnValue("Transcript saved (42 lines)"),
  cliCaptureTranscript: vi.fn(),
}));
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: vi.fn().mockReturnValue({ registerTool: vi.fn() }),
}));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn().mockReturnValue({}),
}));

describe("CLI — sync commands", () => {
  afterAll(() => {
    process.exit = origExit;
  });

  async function run(argv: string[]) {
    mockExit(); // throw on exit (sync commands)
    process.argv = ["node", "memory-forge", ...argv];
    vi.resetModules();
    try {
      await import("../src/index.js");
    } catch (e) {
      if (!(e instanceof Error && e.message.startsWith("__EXIT__"))) throw e;
    }
  }

  it("--version prints version", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s: string) => logs.push(s));
    await run(["--version"]);
    expect(logs).toContain("0.8.2");
  });

  it("-v prints version", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s: string) => logs.push(s));
    await run(["-v"]);
    expect(logs).toContain("0.8.2");
  });

  it("unknown command prints error", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation((s: string) => logs.push(s));
    await run(["unknown-cmd"]);
    expect(logs.some((l) => l.includes("Unknown command"))).toBe(true);
  });

  it("list prints empty message", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s: string) => logs.push(s));
    await run(["list"]);
    expect(logs.some((l) => l.includes("No memories yet"))).toBe(true);
  });

  it("search without query shows usage", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s: string) => logs.push(s));
    await run(["search"]);
    expect(logs.some((l) => l.includes("Usage:"))).toBe(true);
  });

  it("stats shows zero stats", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation((s: string) => logs.push(s));
    await run(["stats"]);
    expect(logs.some((l) => l.includes("Total: 0"))).toBe(true);
  });

  it("post-tool-use hook outputs event", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation((s: string) => logs.push(s));
    await run(["hook", "post-tool-use"]);
    const output = logs.join("");
    const parsed = JSON.parse(output);
    expect(parsed.hookSpecificOutput.hookEventName).toBe("PostToolUse");
  });

  it("unknown hook type errors", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation((s: string) => logs.push(s));
    await run(["hook", "bad-hook"]);
    expect(logs.some((l) => l.includes("Unknown hook type"))).toBe(true);
  });
});

describe("CLI — hooks (async)", () => {
  afterAll(() => {
    process.exit = origExit;
  });

  async function run(argv: string[]) {
    mockExitNoThrow(); // don't throw — async commands rely on event loop
    process.argv = ["node", "memory-forge", ...argv];
    vi.resetModules();
    await import("../src/index.js");
    // Give promises time to resolve
    await new Promise((r) => setTimeout(r, 10));
  }

  it("session-start hook outputs context JSON", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation((s: string) => logs.push(s));
    await run(["hook", "session-start"]);
    const output = logs.join("");
    expect(output).toContain("SessionStart");
  });

  it("stop hook runs maintenance", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation((s: string) => logs.push(s));
    await run(["hook", "stop"]);
    expect(logs.some((l) => l.includes("memories maintained"))).toBe(true);
  });

  it("stop hook saves exit status for next SessionStart", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation((s: string) => logs.push(s));
    await run(["hook", "stop"]);

    // Verify last-exit.json was created
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
    const exitPath = `${home}/.memory-forge/last-exit.json`;
    const fs = await import("node:fs");
    expect(fs.existsSync(exitPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(exitPath, "utf-8"));
    expect(data).toHaveProperty("timestamp");
    expect(data).toHaveProperty("lines");
    expect(data.lines.some((l: string) => l.includes("memories maintained"))).toBe(true);
  });

  it("session-start hook includes last exit status", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation((s: string) => logs.push(s));
    await run(["hook", "session-start"]);
    const output = logs.join("");
    expect(output).toContain("SessionStart");
    expect(output).toContain("Last exit");
  });

  it("pre-compact hook preserves context", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation((s: string) => logs.push(s));
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(["hook", "pre-compact"]);
    expect(logs.some((l) => l.includes("PreCompact") || l.includes("pre-compact"))).toBe(true);
  });
});
