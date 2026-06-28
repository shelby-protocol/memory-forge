import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFs = vi.hoisted(() => {
  const files = new Map<string, string>();
  return { files };
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn((p: fs.PathLike) => {
      const s = String(p).replace(/\\/g, "/");
      if (s.endsWith(".memory-forge/pro.json")) return mockFs.files.has("pro.json");
      if (s.includes(".memory-forge")) return true;
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
  initShelby: vi.fn().mockResolvedValue({ address: "0xe1c47", generatedKey: "0xabc123" }),
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

import { proStatus, proAutoActivate } from "../src/pro.js";

describe("proStatus", () => {
  it("returns inactive when no profile", () => {
    mockFs.files.clear();
    expect(proStatus().active).toBe(false);
  });

  it("returns active with profile data", () => {
    mockFs.files.set("pro.json", JSON.stringify({
      address: "0xabc123", lastSync: "2026-06-01T00:00:00Z",
      totalUploaded: 10, totalDownloaded: 5, totalFailed: 0, totalConflicts: 0, syncHistory: [],
    }));
    const status = proStatus();
    expect(status.active).toBe(true);
    expect(status.address).toBe("0xabc123");
    expect(status.totalUploaded).toBe(10);
  });

  it("handles corrupted profile", () => {
    mockFs.files.set("pro.json", "not-valid-json{{{");
    expect(proStatus().active).toBe(false);
  });
});

describe("proAutoActivate", () => {
  beforeEach(() => { mockFs.files.clear(); });

  it("skips when no API key", async () => {
    await proAutoActivate();
    expect(mockFs.files.has("pro.json")).toBe(false);
  });

  it("activates with API key", async () => {
    const { getShelbyConfig } = await import("../src/storage/shelby.js");
    vi.mocked(getShelbyConfig).mockReturnValue({ apiKey: "AG-test" } as any);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await proAutoActivate();
    expect(mockFs.files.has("pro.json")).toBe(true);
  });

  it("syncs when already active", async () => {
    mockFs.files.set("pro.json", JSON.stringify({
      address: "0xexisting", privateKey: "0xkey", apiKey: "AG-test",
    }));
    const { getShelbyConfig } = await import("../src/storage/shelby.js");
    vi.mocked(getShelbyConfig).mockReturnValue({ apiKey: "AG-test" } as any);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await proAutoActivate();
    // Should not throw
  });
});
