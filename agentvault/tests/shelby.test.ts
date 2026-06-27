import { describe, it, expect } from "vitest";
import { getMemoryId, getCloudTombstones, getBlobName, getShelbyConfig, uploadMemory, downloadMemory, listBlobs, deleteBlob, getShelbyClient, getShelbyAccount, isAuthFailed, initShelby, getBalances, getStorageUsage } from "../src/storage/shelby.js";
import type { Memory } from "../src/store.js";

const testMem: Memory = {
  id: "test-null-client",
  name: "test",
  content: "test content",
  category: "general",
  tags: [],
  priority: 5,
  vector: [],
  created_at: new Date().toISOString(),
  access_count: 0,
  last_accessed: null,
};

describe("getMemoryId", () => {
  it("new format: users/ns/memories/uuid-ts.json", () => {
    expect(getMemoryId("users/0xabc/memories/550e8400-e29b-41d4-a716-446655440000-1719000000000.json")).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("new format with .deleted suffix", () => {
    expect(getMemoryId("users/0xabc/memories/550e8400-e29b-41d4-a716-446655440000-1719000000000.json.deleted")).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("new format with @address prefix", () => {
    expect(getMemoryId("@0xabc/users/ns/memories/660e8400-e29b-41d4-a716-446655440001-100.json")).toBe("660e8400-e29b-41d4-a716-446655440001");
  });

  it("old format: memories/id.json", () => {
    expect(getMemoryId("memories/legacy-id-123.json")).toBe("legacy-id-123");
  });

  it("non-memory blob returns null", () => {
    expect(getMemoryId("users/0xabc/config/settings.json")).toBeNull();
  });

  it("garbage string returns null", () => {
    expect(getMemoryId("not-a-valid-path")).toBeNull();
  });

  it("empty string returns null", () => {
    expect(getMemoryId("")).toBeNull();
  });

  it("rejects uppercase UUID", () => {
    expect(getMemoryId("users/0xabc/memories/ABCD1234-ABCD-4ABC-8abc-ABCDEF123456-1.json")).toBeNull();
  });

  it("valid lowercase UUID extracted", () => {
    expect(getMemoryId("users/0xabc/memories/a1b2c3d4-e5f6-7890-abcd-ef1234567890-1.json")).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  });
});

describe("getCloudTombstones", () => {
  it("extracts tombstone IDs from blob list", () => {
    const blobs = [
      "users/0xabc/memories/a1b2c3d4-e5f6-7890-abcd-ef1234567890-100.json.deleted",
      "users/0xabc/memories/b2c3d4e5-f6a7-8901-bcde-f12345678901-200.json",
      "users/0xabc/memories/c3d4e5f6-a7b8-9012-cdef-123456789012-300.json.deleted",
    ];
    const ids = getCloudTombstones(blobs);
    expect(ids.size).toBe(2);
    expect(ids.has("c3d4e5f6-a7b8-9012-cdef-123456789012")).toBe(true);
  });

  it("empty blob list returns empty set", () => {
    expect(getCloudTombstones([]).size).toBe(0);
  });

  it("no tombstones returns empty", () => {
    expect(getCloudTombstones(["users/0xabc/memories/uuid-1-100.json", "users/0xabc/memories/uuid-2-200.json"]).size).toBe(0);
  });

  it("deduplicates same tombstone with different timestamps", () => {
    const blobs = [
      "users/0xabc/memories/a1b2c3d4-e5f6-7890-abcd-ef1234567890-100.json.deleted",
      "users/0xabc/memories/a1b2c3d4-e5f6-7890-abcd-ef1234567890-200.json.deleted",
    ];
    expect(getCloudTombstones(blobs).size).toBe(1);
  });

  it("ignores corrupt blob names", () => {
    expect(getCloudTombstones(["garbage.deleted", "also-bad.deleted"]).size).toBe(0);
  });
});

describe("getBlobName", () => {
  it("generates namespaced blob name", () => {
    const name = getBlobName("test-id-123");
    expect(name).toContain("memories/test-id-123-");
    expect(name).toMatch(/\.json$/);
    expect(name).toMatch(/^users\//);
  });

  it("contains 13-digit timestamp", () => {
    const name = getBlobName("same-id");
    const match = name.match(/-(\d{13})\.json$/);
    expect(match).not.toBeNull();
    const ts = parseInt(match![1]);
    expect(ts).toBeGreaterThan(1700000000000);
    expect(ts).toBeLessThan(1800000000000);
  });
});

describe("getShelbyConfig", () => {
  it("returns valid structure", () => {
    const cfg = getShelbyConfig();
    expect(typeof cfg.apiKey === "string" || cfg.apiKey === null).toBe(true);
    expect(cfg.namespace).toBeDefined();
    expect(cfg.namespace).toMatch(/^users\//);
    expect(cfg.accountAddress === null || typeof cfg.accountAddress === "string").toBe(true);
  });
});

describe("null-client graceful degradation", () => {
  it("uploadMemory returns null", async () => {
    expect(await uploadMemory(testMem)).toBeNull();
  });

  it("downloadMemory returns null", async () => {
    expect(await downloadMemory("users/default/memories/test-123.json")).toBeNull();
  });

  it("listBlobs returns empty array", async () => {
    expect(await listBlobs()).toEqual([]);
  });

  it("deleteBlob does not throw", async () => {
    await deleteBlob("users/default/memories/test-123.json");
  });

  it("getShelbyClient returns null by default", () => {
    expect(getShelbyClient()).toBeNull();
  });

  it("getShelbyAccount returns null by default", () => {
    expect(getShelbyAccount()).toBeNull();
  });

  it("isAuthFailed initially false", () => {
    expect(isAuthFailed()).toBe(false);
  });
});

describe("initShelby", () => {
  it("initShelby with generated key creates client", async () => {
    const result = await initShelby("test-api-key-mock-12345");
    if (!result) return; // SDK load failed, skip
    expect(result.address).toBeDefined();
    expect(result.address.length).toBeGreaterThanOrEqual(40);
    expect(typeof result.generatedKey).toBe("string");
    expect(getShelbyClient()).not.toBeNull();
    expect(getShelbyAccount()).not.toBeNull();
  });

  it("initShelby with private key uses provided key", async () => {
    const testKey = "a".repeat(64);
    const result = await initShelby("test-api-key-2", testKey);
    if (!result) return;
    expect(result.generatedKey).toBeUndefined();
    expect(result.address).toBeDefined();
  });

  it("initShelby resets authFailed", async () => {
    await initShelby("test-api-key-reset");
    expect(isAuthFailed()).toBe(false);
  });

  it("getBalances returns null or valid format", async () => {
    const result = await getBalances();
    if (result !== null) {
      expect(typeof result.apt).toBe("string");
      expect(typeof result.shelbyUsd).toBe("string");
    }
  });

  it("getStorageUsage returns null or valid format", async () => {
    const result = await getStorageUsage();
    if (result !== null) {
      expect(typeof result.blobCount).toBe("number");
      expect(typeof result.totalBytes).toBe("number");
    }
  });
});
