#!/usr/bin/env node
/**
 * MemoryForge Pro: Shelby 云存储 + 多设备同步。
 *
 * 用法: npx memory-forge pro
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { loadAllMemories, saveMemory, deleteMemoryFile, getTombstonedIds, cleanupTombstones } from "./storage/local.js";
import {
  initShelby,
  uploadMemory,
  downloadMemory,
  listBlobs,
  getMemoryId,
  getShelbyConfig,
  getBalances,
  getStorageUsage,
  isAuthFailed,
  deleteBlob,
  getBlobName,
  getCloudTombstones,
} from "./storage/shelby.js";
import { MemoryStore } from "./store.js";

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
const MEMORYFORGE_DIR = path.join(HOME, ".memory-forge");
const PROFILE_PATH = path.join(MEMORYFORGE_DIR, "pro.json");

/** Prompt user for API key via stdin if not in environment. */
async function promptApiKey(): Promise<string | null> {
  const key = process.env.SHELBY_API_KEY;
  if (key) return key;

  console.log("");
  console.log("  Get your free API key at:");
  console.log("  https://docs.shelby.xyz/sdks/typescript/acquire-api-keys");
  console.log("");
  console.log("  Paste your key (or press Enter to cancel):");

  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question("  ", (answer) => {
      rl.close();
      resolve(answer.trim() || null);
    });
  });
}

export async function pro(): Promise<void> {
  // Check if already initialized
  if (fs.existsSync(PROFILE_PATH)) {
    const apiKey = await promptApiKey();
    if (!apiKey) {
      console.log("   No key provided. Sync skipped.");
      return;
    }
    const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf-8"));
    // Always save API key so getShelbyConfig() can find it
    profile.apiKey = apiKey;
    // If user provided a different private key, update the profile
    if (process.env.APTOS_PRIVATE_KEY && profile.privateKey !== process.env.APTOS_PRIVATE_KEY) {
      const { address } = initShelby(apiKey, process.env.APTOS_PRIVATE_KEY);
      profile.privateKey = process.env.APTOS_PRIVATE_KEY;
      profile.address = address;
      console.log(`   Account switched to ${address}`);
    }
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));
    console.log("✅ Pro is active. Syncing memories...");
    await syncAll();
    return;
  }

  console.log(`
  ╔══════════════════════════╗
  ║   MemoryForge Pro Setup   ║
  ╚══════════════════════════╝
  `);

  const apiKey = await promptApiKey();
  if (!apiKey) {
    console.log("");
    console.log("💡 Free tier: npx memory-forge setup (local storage only)");
    process.exitCode = 1;
    return;
  }

  // Load or generate Aptos account
  let privateKey = process.env.APTOS_PRIVATE_KEY;
  if (!privateKey && fs.existsSync(PROFILE_PATH)) {
    try {
      const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf-8"));
      privateKey = profile.privateKey;
    } catch {
      console.error("[MemoryForge] Corrupted profile — run `memory-forge pro` to repair");
      return;
    }
  }

  console.log("🔄 Initializing Shelby storage...");
  const { address, generatedKey } = initShelby(apiKey, privateKey);

  if (generatedKey) {
    // Save generated key for future runs
    privateKey = generatedKey;
    console.log("   ℹ️  Auto-generated Shelbynet account");
    console.log(`   ℹ️  Address: ${address}`);
    console.log("   ⚠️  Fund this account with APT + ShelbyUSD:");
    console.log("      APT:       https://docs.shelby.xyz/apis/faucet/aptos");
    console.log("      ShelbyUSD: https://docs.shelby.xyz/apis/faucet/shelbyusd");
    console.log("");
  } else {
    console.log(`   ℹ️  Using account: ${address}`);
  }

  console.log("📤 Uploading existing memories to Shelby...");
  let uploaded = 0;
  for (const m of loadAllMemories()) {
    const result = await uploadMemory(m);
    if (result) uploaded++;
  }

  // Save Pro profile
  if (!fs.existsSync(MEMORYFORGE_DIR)) {
    fs.mkdirSync(MEMORYFORGE_DIR, { recursive: true });
  }
  fs.writeFileSync(
    PROFILE_PATH,
    JSON.stringify({
      version: 2,
      activatedAt: new Date().toISOString(),
      privateKey,
      address,
      apiKey,
    }, null, 2)
  );

  const syncIcon = uploaded > 0 ? "✅" : "⚠️";
  console.log(`
  ┌──────────────────────────────────────┐
  │  MemoryForge Pro is active!           │
  │                                      │
  │  ${syncIcon} ${uploaded} memories synced to Shelby  │
  │  ✅ Auto-sync on every session       │
  │  ✅ Memories survive across devices  │
  │                                      │
  │  ${uploaded === 0 ? "⚠️  Check SHELBY_API_KEY if sync didn't work" : " "}   │
  └──────────────────────────────────────┘
  `);
}

/** Sync: download from Shelby, merge with local */
export async function syncAll(): Promise<void> {
  if (!fs.existsSync(PROFILE_PATH)) return;

  const apiKey = getShelbyConfig().apiKey;
  if (!apiKey) {
    console.error("[MemoryForge] Pro sync skipped: SHELBY_API_KEY not set");
    return;
  }

  let profile: { address: string; privateKey: string };
  try {
    profile = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf-8"));
  } catch (err) {
    console.error("[MemoryForge] Pro sync skipped: corrupted profile (run `memory-forge pro` to repair)");
    return;
  }
  const privateKey = process.env.APTOS_PRIVATE_KEY || profile.privateKey;

  initShelby(apiKey, privateKey);

  const blobs = await listBlobs();
  const store = new MemoryStore();

  // Load existing local memories
  for (const m of loadAllMemories()) {
    store.add(m);
  }

  // Load tombstones: local + cloud (cross-device delete propagation)
  const tombstoned = getTombstonedIds();
  for (const id of getCloudTombstones(blobs)) tombstoned.add(id);

  // Deduplicate blobs by memoryId — keep latest version (timestamp in blob name)
  const latestBlobs = new Map<string, string>(); // memoryId → blobName
  for (const blobName of blobs) {
    const memoryId = getMemoryId(blobName);
    if (!memoryId) continue;
    if (blobName.endsWith(".deleted")) continue;
    const existing = latestBlobs.get(memoryId);
    if (!existing || blobName > existing) {
      latestBlobs.set(memoryId, blobName);
    }
  }

  // Download and merge blob memories (skip tombstoned, prefer newer remote)
  let downloaded = 0;
  let mergeConflicts = 0;
  for (const [memoryId, blobName] of latestBlobs) {
    if (tombstoned.has(memoryId)) continue;

    const local = store.get(memoryId);
    const remote = await downloadMemory(blobName);
    if (!remote) continue;

    if (local) {
      const localTime = new Date(local.created_at).getTime();
      const remoteTime = new Date(remote.created_at).getTime();

      if (remoteTime < localTime) continue;

      // Field-level merge: track which fields conflict (both sides changed)
      const fieldConflicts: string[] = [];
      const merged = { ...local };
      merged.last_accessed = remote.last_accessed ?? local.last_accessed;
      if (remote.vector?.length) merged.vector = remote.vector; // restore vector for search

      if (remote.content !== local.content) {
        merged.content = remote.content;
        fieldConflicts.push("content");
      }
      if (remote.category !== local.category) {
        merged.category = remote.category;
        fieldConflicts.push("category");
      }
      if (JSON.stringify(remote.tags) !== JSON.stringify(local.tags)) {
        merged.tags = remote.tags;
        fieldConflicts.push("tags");
      }
      if (remote.priority !== local.priority) {
        merged.priority = remote.priority;
        fieldConflicts.push("priority");
      }
      merged.access_count = Math.max(local.access_count, remote.access_count);

      if (fieldConflicts.length > 0) {
        mergeConflicts++;
        console.error(`[MemoryForge] Merge conflict on "${merged.name}": ${fieldConflicts.join(", ")} — remote won`);
      }

      store.add(merged);
      saveMemory(merged);
    } else {
      store.add(remote);
      saveMemory(remote);
    }
    downloaded++;
  }

  // Cross-device deletion: remove local files tombstoned on cloud
  for (const id of tombstoned) {
    if (store.get(id)) {
      store.remove(id);
      try { deleteMemoryFile(id); } catch {}
    }
  }

  // Build set of memory IDs already on cloud (versioned blobs — not exact name match) (versioned blobs — not exact name match)
  const existingIds = new Set<string>();
  for (const blobName of blobs) {
    const id = getMemoryId(blobName);
    if (id) existingIds.add(id);
  }

  // Upload any local-only memories (batch: log summary, not per-memory spam)
  let uploaded = 0;
  let uploadFailed = 0;
  for (const m of loadAllMemories()) {
    if (existingIds.has(m.id)) continue;
    const result = await uploadMemory(m);
    if (result) uploaded++; else uploadFailed++;
  }

  if (downloaded > 0 || uploaded > 0 || uploadFailed > 0) {
    const parts: string[] = [];
    if (uploaded > 0) parts.push(`↑${uploaded}`);
    if (downloaded > 0) parts.push(`↓${downloaded}`);
    if (uploadFailed > 0) parts.push(`✗${uploadFailed}`);
    console.error(`[MemoryForge] Sync: ${parts.join(" ")}`);
  }

  // Cleanup: tombstone remote blobs that no longer exist locally
  let cleanedBlobs = 0;
  const localIds = new Set(loadAllMemories().map((m) => m.id));
  for (const blobName of blobs) {
    const id = getMemoryId(blobName);
    if (id && !localIds.has(id) && !tombstoned.has(id)) {
      deleteBlob(getBlobName(id)).catch(() => {});
      cleanedBlobs++;
    }
  }
  if (cleanedBlobs > 0) {
    console.error(`[MemoryForge] Cleanup: tombstoned ${cleanedBlobs} stale cloud blobs`);
  }

  // Touch last-sync timestamp with stats
  updateSyncStamp(uploaded, downloaded, uploadFailed, mergeConflicts);

  // Purge expired tombstones
  cleanupTombstones();
}

interface SyncEntry { time: string; up: number; down: number; failed: number; conflicts?: number }

function updateSyncStamp(up: number, down: number, failed: number, conflicts?: number): void {
  try {
    const profile = fs.existsSync(PROFILE_PATH)
      ? JSON.parse(fs.readFileSync(PROFILE_PATH, "utf-8"))
      : { version: 1 };
    profile.lastSync = new Date().toISOString();
    profile.syncHistory = profile.syncHistory || [];
    profile.syncHistory.push({ time: profile.lastSync, up, down, failed, conflicts: conflicts ?? 0 });
    if (profile.syncHistory.length > 10) profile.syncHistory = profile.syncHistory.slice(-10);
    profile.totalUploaded = (profile.totalUploaded || 0) + up;
    profile.totalDownloaded = (profile.totalDownloaded || 0) + down;
    profile.totalFailed = (profile.totalFailed || 0) + failed;
    profile.totalConflicts = (profile.totalConflicts || 0) + (conflicts ?? 0);
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));
  } catch { /* best-effort */ }
}

/** Silent auto-activation — called on MCP server startup when SHELBY_API_KEY is set.
 *  Creates account + syncs if first time, just syncs if already active. */
export async function proAutoActivate(): Promise<void> {
  const cfg = getShelbyConfig();
  if (!cfg.apiKey) return;

  // Already active? Just sync.
  if (fs.existsSync(PROFILE_PATH)) {
    try {
      await syncAll();
      console.error(`[MemoryForge] Pro sync complete — cross-device sync active`);
    } catch (err) {
      console.error("[MemoryForge] Pro sync failed:", (err as Error).message);
    }
    return;
  }

  // First time: create account and sync
  let privateKey = process.env.APTOS_PRIVATE_KEY;
  const { address, generatedKey } = initShelby(cfg.apiKey, privateKey);
  if (generatedKey) privateKey = generatedKey;

  // Save profile
  if (!fs.existsSync(MEMORYFORGE_DIR)) fs.mkdirSync(MEMORYFORGE_DIR, { recursive: true });
  fs.writeFileSync(PROFILE_PATH, JSON.stringify({
    version: 2,
    activatedAt: new Date().toISOString(),
    privateKey,
    address,
    apiKey: cfg.apiKey,
  }, null, 2));

  console.error(`[MemoryForge] Pro activated — Shelby account ${address.slice(0, 10)}…`);
  if (generatedKey) {
    console.error(`[MemoryForge] ⚠️  Fund this account with APT + ShelbyUSD for storage transactions:`);
    console.error(`[MemoryForge]    APT:       https://docs.shelby.xyz/apis/faucet/aptos`);
    console.error(`[MemoryForge]    ShelbyUSD: https://docs.shelby.xyz/apis/faucet/shelbyusd`);
  }

  // Sync
  await syncAll();
}

/** Return Pro status for CLI display. */
export function proStatus(): {
  active: boolean; address?: string; lastSync?: string;
  totalUploaded?: number; totalDownloaded?: number; totalFailed?: number;
  totalConflicts?: number; syncHistory?: SyncEntry[]; localCount?: number;
  apiKeyValid?: boolean; balances?: { apt: string; shelbyUsd: string } | null;
  storage?: { blobCount: number; totalBytes: number } | null;
} {
  if (!fs.existsSync(PROFILE_PATH)) return { active: false };
  try {
    const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf-8"));
    const cfg = getShelbyConfig();
    return {
      active: true,
      address: profile.address,
      lastSync: profile.lastSync ?? null,
      totalUploaded: profile.totalUploaded ?? 0,
      totalDownloaded: profile.totalDownloaded ?? 0,
      totalFailed: profile.totalFailed ?? 0,
      totalConflicts: profile.totalConflicts ?? 0,
      syncHistory: profile.syncHistory ?? [],
      localCount: loadAllMemories().length,
      apiKeyValid: cfg.apiKey ? !isAuthFailed() : undefined,
      balances: null, // filled async by CLI
      storage: null,  // filled async by CLI
    };
  } catch {
    return { active: false };
  }
}
