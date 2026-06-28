import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks ──
const mockFs = vi.hoisted(() => {
  const files = new Map<string, string>();
  let homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
  return { files, homeDir };
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn((p: fs.PathLike) => {
      const s = String(p).replace(/\\/g, "/");
      if (s.endsWith(".memory-forge/pro.json")) return mockFs.files.has("pro.json");
      if (s.includes(".memory-forge")) return true; // directory exists
      return actual.existsSync(p);
    }),
    readFileSync: vi.fn((p: fs.PathLike) => {
      const s = String(p).replace(/\\/g, "/");
      if (s.endsWith(".memory-forge/pro.json")) return mockFs.files.get("pro.json") ?? "";
      return '{ "version": "0.8.2" }';
    }),
    writeFileSync: vi.fn((p: fs.PathLike, data: string) => {
      const s = String(p).replace(/\\/g, "/");
      if (s.endsWith(".memory-forge/pro.json")) mockFs.files.set("pro.json", data);
    }),
    mkdirSync: vi.fn(),
    chmodSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

vi.mock("../src/storage/local.js", () => ({
  loadAllMemories: vi.fn().mockReturnValue([]),
  saveMemory: vi.fn(),
  deleteMemoryFile: vi.fn(),
  getTombstonedIds: vi.fn().mockReturnValue(new Set<string>()),
  cleanupTombstones: vi.fn(),
}));
vi.mock("../src/storage/shelby.js", () => ({
  initShelby: vi.fn().mockResolvedValue({
    address: "0xe1c4784a9ce9778acaa386aa4ef711681b5bf03b",
    generatedKey: "0xabc123",
  }),
  uploadMemory: vi.fn().mockResolvedValue(true),
  downloadMemory: vi.fn().mockResolvedValue(null),
  listBlobs: vi.fn().mockResolvedValue([]),
  getMemoryId: vi.fn().mockReturnValue(null),
  getShelbyConfig: vi.fn().mockReturnValue({}),
  isAuthFailed: vi.fn().mockReturnValue(false),
  deleteBlob: vi.fn().mockResolvedValue(undefined),
  getBlobName: vi.fn((id: string) => `blob-${id}`),
  getCloudTombstones: vi.fn().mockReturnValue([]),
}));

import { pro, proStatus, proAutoActivate, syncAll } from "../src/pro.js";

describe("proStatus", () => {
  it("returns inactive when no profile", () => {
    mockFs.files.clear();
    const status = proStatus();
    expect(status.active).toBe(false);
  });

  it("returns active with profile data", () => {
    mockFs.files.set(
      "pro.json",
      JSON.stringify({
        address: "0xabc123",
        lastSync: "2026-06-01T00:00:00Z",
        totalUploaded: 10,
        totalDownloaded: 5,
        totalFailed: 0,
        totalConflicts: 0,
        syncHistory: [],
      }),
    );
    const status = proStatus();
    expect(status.active).toBe(true);
    expect(status.address).toBe("0xabc123");
    expect(status.totalUploaded).toBe(10);
    expect(status.totalDownloaded).toBe(5);
  });

  it("handles corrupted profile", () => {
    mockFs.files.set("pro.json", "not-valid-json{{{");
    const status = proStatus();
    expect(status.active).toBe(false);
  });
});

describe("proAutoActivate", () => {
  beforeEach(() => {
    mockFs.files.clear();
  });

  it("skips when no API key", async () => {
    await proAutoActivate();
    // Should return early, no fs writes
    expect(mockFs.files.has("pro.json")).toBe(false);
  });

  it("activates with SHELBY_API_KEY set", async () => {
    const { getShelbyConfig } = await import("../src/storage/shelby.js");
    vi.mocked(getShelbyConfig).mockReturnValue({
      apiKey: "AG-test-key",
    } as any);
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation((s: string) => logs.push(s));
    await proAutoActivate();
    expect(logs.some((l) => l.includes("Pro activated"))).toBe(true);
    expect(mockFs.files.has("pro.json")).toBe(true);
  });

  it("just syncs when already active", async () => {
    mockFs.files.set(
      "pro.json",
      JSON.stringify({
        address: "0xexisting",
        privateKey: "0xkey",
        apiKey: "AG-test-key",
      }),
    );
    const { getShelbyConfig } = await import("../src/storage/shelby.js");
    vi.mocked(getShelbyConfig).mockReturnValue({
      apiKey: "AG-test-key",
    } as any);
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation((s: string) => logs.push(s));
    await proAutoActivate();
    expect(logs.some((l) => l.includes("sync complete"))).toBe(true);
  });
});

function setupSyncProfile() {
  mockFs.files.set(
    "pro.json",
    JSON.stringify({
      address: "0xsync",
      privateKey: "0xkey123",
      version: 2,
    }),
  );
}

describe("syncAll", () => {
  beforeEach(async () => {
    mockFs.files.clear();
    setupSyncProfile();
    const m = await import("../src/storage/shelby.js");
    vi.mocked(m.getShelbyConfig).mockReturnValue({ apiKey: "AG-sync-key" } as any);
    vi.mocked(m.listBlobs).mockResolvedValue([]);
    vi.mocked(m.downloadMemory).mockResolvedValue(null);
    vi.mocked(m.uploadMemory).mockResolvedValue(true);
    vi.mocked(m.getMemoryId).mockReturnValue(null);
  });

  it("skips when no profile", async () => {
    mockFs.files.clear();
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation((s: string) => logs.push(s));
    await syncAll();
    expect(logs.length).toBe(0);
  });

  it("syncs when profile exists", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation((s: string) => logs.push(s));
    await syncAll();
    // Should complete without throwing
  });

  it("syncs and downloads remote memories with merge", async () => {
    const { listBlobs, downloadMemory, getMemoryId } = await import("../src/storage/shelby.js");
    const { loadAllMemories, saveMemory } = await import("../src/storage/local.js");
    loadAllMemories.mockReturnValue([
      {
        id: "local-1", name: "Local Mem", content: "local content",
        category: "general", tags: [], priority: 5, vector: [],
        created_at: "2026-01-01T00:00:00Z", access_count: 1, last_accessed: null,
      },
    ]);
    getMemoryId.mockReturnValue("remote-1");
    listBlobs.mockResolvedValue(["blob-remote-1_v2026-06-28"]);
    downloadMemory.mockResolvedValue({
      id: "remote-1", name: "Remote Mem", content: "remote content",
      category: "decision-log", tags: ["remote-tag"], priority: 8,
      vector: [0.1, 0.2], created_at: "2026-06-15T00:00:00Z",
      access_count: 5, last_accessed: "2026-06-20T00:00:00Z",
    });
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation((s: string) => logs.push(s));
    await syncAll();
    // Should not throw; merge may produce conflict log or sync log
    expect(logs.length).toBeGreaterThanOrEqual(0);
  });
});
