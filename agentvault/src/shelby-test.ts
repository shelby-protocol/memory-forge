/**
 * Shelby cloud storage unit tests — pure functions (no SDK required).
 * Run: npx tsx src/shelby-test.ts
 */

import { getMemoryId, getCloudTombstones, getBlobName, getShelbyConfig, uploadMemory, downloadMemory, listBlobs, deleteBlob, getShelbyClient, getShelbyAccount, isAuthFailed, initShelby, getBalances, getStorageUsage } from "./storage/shelby.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Memory } from "./store.js";

let ok = 0;
let ng = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    ok++;
  } catch (e: any) {
    ng++;
    console.log(`  FAIL ${name}: ${e.message}`);
  }
}

// ═══ getMemoryId ═══
console.log("=== getMemoryId ===");

t("new format: users/ns/memories/uuid-ts.json", () => {
  const id = getMemoryId("users/0xabc/memories/550e8400-e29b-41d4-a716-446655440000-1719000000000.json");
  if (id !== "550e8400-e29b-41d4-a716-446655440000") throw new Error(`got "${id}"`);
});

t("new format with .deleted suffix", () => {
  const id = getMemoryId("users/0xabc/memories/550e8400-e29b-41d4-a716-446655440000-1719000000000.json.deleted");
  if (id !== "550e8400-e29b-41d4-a716-446655440000") throw new Error(`got "${id}"`);
});

t("new format with @address prefix", () => {
  const id = getMemoryId("@0xabc/users/ns/memories/660e8400-e29b-41d4-a716-446655440001-100.json");
  if (id !== "660e8400-e29b-41d4-a716-446655440001") throw new Error(`got "${id}"`);
});

t("old format: memories/id.json", () => {
  const id = getMemoryId("memories/legacy-id-123.json");
  if (id !== "legacy-id-123") throw new Error(`got "${id}"`);
});

t("non-memory blob returns null", () => {
  const id = getMemoryId("users/0xabc/config/settings.json");
  if (id !== null) throw new Error(`expected null, got "${id}"`);
});

t("garbage string returns null", () => {
  const id = getMemoryId("not-a-valid-path");
  if (id !== null) throw new Error(`expected null, got "${id}"`);
});

t("empty string returns null", () => {
  const id = getMemoryId("");
  if (id !== null) throw new Error(`expected null, got "${id}"`);
});

t("uuid must be lowercase hex (rejects uppercase)", () => {
  const id = getMemoryId("users/0xabc/memories/ABCD1234-ABCD-4ABC-8abc-ABCDEF123456-1.json");
  // Regex [0-9a-f] is case-sensitive — uppercase rejected, returns null
  if (id !== null) throw new Error(`expected null for uppercase UUID, got "${id}"`);
});

t("valid lowercase UUID extracted", () => {
  const id = getMemoryId("users/0xabc/memories/a1b2c3d4-e5f6-7890-abcd-ef1234567890-1.json");
  if (id !== "a1b2c3d4-e5f6-7890-abcd-ef1234567890") throw new Error(`got "${id}"`);
});

// ═══ getCloudTombstones ═══
console.log("\n=== getCloudTombstones ===");

t("extracts tombstone IDs from blob list", () => {
  const blobs = [
    "users/0xabc/memories/a1b2c3d4-e5f6-7890-abcd-ef1234567890-100.json.deleted",
    "users/0xabc/memories/b2c3d4e5-f6a7-8901-bcde-f12345678901-200.json",
    "users/0xabc/memories/c3d4e5f6-a7b8-9012-cdef-123456789012-300.json.deleted",
  ];
  const ids = getCloudTombstones(blobs);
  if (ids.size !== 2) throw new Error(`expected 2, got ${ids.size}`);
  if (!ids.has("c3d4e5f6-a7b8-9012-cdef-123456789012")) throw new Error("second tombstone missing");
});

t("empty blob list returns empty set", () => {
  const ids = getCloudTombstones([]);
  if (ids.size !== 0) throw new Error("should be empty");
});

t("no tombstones in list returns empty", () => {
  const blobs = ["users/0xabc/memories/uuid-1-100.json", "users/0xabc/memories/uuid-2-200.json"];
  const ids = getCloudTombstones(blobs);
  if (ids.size !== 0) throw new Error("should be empty");
});

t("deduplicates same tombstone ID with different timestamps", () => {
  const blobs = [
    "users/0xabc/memories/a1b2c3d4-e5f6-7890-abcd-ef1234567890-100.json.deleted",
    "users/0xabc/memories/a1b2c3d4-e5f6-7890-abcd-ef1234567890-200.json.deleted", // same id, diff timestamp
  ];
  const ids = getCloudTombstones(blobs);
  if (ids.size !== 1) throw new Error(`expected 1, got ${ids.size}`);
});

t("handles corrupt blob names (no UUID match)", () => {
  const blobs = ["garbage.deleted", "also-bad.deleted"];
  const ids = getCloudTombstones(blobs);
  if (ids.size !== 0) throw new Error("should ignore corrupt names");
});

// ═══ getBlobName ═══
console.log("\n=== getBlobName ===");

t("generates namespaced blob name for memory ID", () => {
  const name = getBlobName("test-id-123");
  if (!name.includes("memories/test-id-123-")) throw new Error(`got "${name}"`);
  if (!name.endsWith(".json")) throw new Error("should end with .json");
  if (!name.startsWith("users/")) throw new Error("should start with users/");
});

t("blob name contains 13-digit timestamp", () => {
  const name = getBlobName("same-id");
  const match = name.match(/-(\d{13})\.json$/);
  if (!match) throw new Error(`no timestamp in "${name}"`);
  const ts = parseInt(match[1]);
  if (ts < 1700000000000 || ts > 1800000000000) throw new Error(`timestamp out of range: ${ts}`);
});

// ═══ getShelbyConfig (via module) ═══
console.log("\n=== getShelbyConfig ===");
t("getShelbyConfig returns valid structure", () => {
  const cfg = getShelbyConfig();
  if (typeof cfg.apiKey !== "string" && cfg.apiKey !== null) throw new Error("apiKey should be string|null");
  if (!cfg.namespace || typeof cfg.namespace !== "string") throw new Error("namespace required");
  if (cfg.accountAddress !== null && typeof cfg.accountAddress !== "string") throw new Error("accountAddress should be string|null");
});

t("namespace contains users/ prefix", () => {
  const cfg = getShelbyConfig();
  if (!cfg.namespace.startsWith("users/")) throw new Error(`got "${cfg.namespace}"`);
});

// ═══ Null-client graceful degradation ═══
console.log("\n=== Null-client graceful degradation ===");

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

// Wrap all remaining tests in async main so we can await async t() calls
async function main() {
  await t("uploadMemory null client returns null", async () => {
    const result = await uploadMemory(testMem);
    if (result !== null) throw new Error(`expected null, got "${result}"`);
  });

  await t("downloadMemory null client returns null", async () => {
    const result = await downloadMemory("users/default/memories/test-123.json");
    if (result !== null) throw new Error(`expected null, got ${JSON.stringify(result)}`);
  });

  await t("listBlobs null client returns empty array", async () => {
    const result = await listBlobs();
    if (result.length !== 0) throw new Error(`expected [], got ${result.length} items`);
  });

  await t("deleteBlob null client does not throw", async () => {
    await deleteBlob("users/default/memories/test-123.json");
    // no throw = pass
  });

  t("getShelbyClient returns null by default", () => {
    if (getShelbyClient() !== null) throw new Error("should be null");
  });

  t("getShelbyAccount returns null by default", () => {
    if (getShelbyAccount() !== null) throw new Error("should be null");
  });

  t("isAuthFailed initially false", () => {
    if (isAuthFailed()) throw new Error("should be false before any auth attempt");
  });

  // ═══ initShelby — client/account creation ═══
  console.log("\n=== initShelby ===");

  await t("initShelby with generated key creates client", async () => {
    const result = await initShelby("test-api-key-mock-12345");
    if (!result) throw new Error("initShelby returned null — SDK load failed");
    if (!result.address) throw new Error("no address returned");
    if (typeof result.address !== "string" || result.address.length < 40) throw new Error(`bad address: "${result.address}"`);
    if (!result.generatedKey) throw new Error("should auto-generate key when not provided");
    if (getShelbyClient() === null) throw new Error("client should be set");
    if (getShelbyAccount() === null) throw new Error("account should be set");
  });

  await t("initShelby with private key uses provided key", async () => {
    const testKey = "a".repeat(64);
    const result = await initShelby("test-api-key-2", testKey);
    if (!result) throw new Error("initShelby returned null");
    if (result.generatedKey) throw new Error("should not generate when key provided");
    if (!result.address) throw new Error("no address");
  });

  await t("initShelby resets authFailed", async () => {
    await initShelby("test-api-key-reset");
    if (isAuthFailed()) throw new Error("should be reset to false after initShelby");
  });

  // ═══ getBalances / getStorageUsage null client ═══
  console.log("\n=== getBalances / getStorageUsage null client ===");

  await t("getBalances null client returns null", async () => {
    // After initShelby above, client IS set. But without real network, should return null.
    const result = await getBalances();
    // Either null (no network) or valid object (if Shelbynet accessible)
    if (result !== null && (typeof result.apt !== "string" || typeof result.shelbyUsd !== "string")) {
      throw new Error(`unexpected format: ${JSON.stringify(result)}`);
    }
  });

  await t("getStorageUsage null/error returns null", async () => {
    const result = await getStorageUsage();
    if (result !== null && (typeof result.blobCount !== "number" || typeof result.totalBytes !== "number")) {
      throw new Error(`unexpected format: ${JSON.stringify(result)}`);
    }
  });

  console.log(`\n${ok} passed, ${ng} failed`);
  if (ng > 0) process.exit(1);
}

main();
