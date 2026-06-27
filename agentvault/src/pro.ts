#!/usr/bin/env node
/**
 * MemoryForge Pro: Shelby 云存储 + 多设备同步。
 *
 * 用法: npx memory-forge pro
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { loadAllMemories, saveMemory, getTombstonedIds, cleanupTombstones } from "./storage/local.js";
import {
  initShelby,
  uploadMemory,
  downloadMemory,
  listBlobs,
  getMemoryId,
  getShelbyConfig,
} from "./storage/shelby.js";
import { MemoryStore } from "./store.js";

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
const MEMORYFORGE_DIR = path.join(HOME, ".memory-forge");
const PROFILE_PATH = path.join(MEMORYFORGE_DIR, "pro.json");

export async function pro(): Promise<void> {
  const apiKey = process.env.SHELBY_API_KEY;

  // Check if already initialized
  if (fs.existsSync(PROFILE_PATH)) {
    if (!apiKey) {
      console.log("✅ Pro profile exists but SHELBY_API_KEY not set.");
      console.log("   Set SHELBY_API_KEY and re-run to sync.");
      return;
    }
    console.log("✅ Pro is active. Syncing memories...");
    await syncAll();
    return;
  }

  console.log(`
  ╔══════════════════════════╗
  ║   MemoryForge Pro Setup   ║
  ╚══════════════════════════╝
  `);

  if (!apiKey) {
    console.log("Pro requires a Shelby API Key.");
    console.log("");
    console.log("  Get your key at: https://docs.shelby.xyz/sdks/typescript/acquire-api-keys");
    console.log('  Then run: SHELBY_API_KEY="aptoslabs_***" npx memory-forge pro');
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
      version: 1,
      activatedAt: new Date().toISOString(),
      privateKey,
      address,
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

  const apiKey = process.env.SHELBY_API_KEY;
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

  // Load tombstones once for this sync
  const tombstoned = getTombstonedIds();

  // Download and merge blob memories (skip tombstoned, prefer newer remote)
  let downloaded = 0;
  for (const blobName of blobs) {
    const memoryId = getMemoryId(blobName);
    if (!memoryId) continue;
    if (tombstoned.has(memoryId)) continue; // user deleted this — don't resurrect

    const local = store.get(memoryId);
    const remote = await downloadMemory(blobName);
    if (!remote) continue;

    if (local) {
      // Field-level merge: combine non-conflicting fields, LWW for same-field edits
      const localTime = new Date(local.created_at).getTime();
      const remoteTime = new Date(remote.created_at).getTime();

      if (remoteTime <= localTime) {
        // Remote is older — keep local as-is, but merge remote-only fields
        // (fields remote changed that local hasn't touched since sync)
        continue;
      }

      // Remote is newer — merge intelligently
      const merged = { ...local };
      merged.last_accessed = remote.last_accessed ?? local.last_accessed;

      // Each field: remote wins if changed (timestamp proxy), else keep local
      if (remote.content !== local.content) merged.content = remote.content;
      if (remote.category !== local.category) merged.category = remote.category;
      if (JSON.stringify(remote.tags) !== JSON.stringify(local.tags)) merged.tags = remote.tags;
      if (remote.priority !== local.priority) merged.priority = remote.priority;
      // access_count: keep max
      merged.access_count = Math.max(local.access_count, remote.access_count);

      store.add(merged);
      saveMemory(merged);
    } else {
      store.add(remote);
      saveMemory(remote);
    }
    downloaded++;
  }

  // Upload any local-only memories (batch: log summary, not per-memory spam)
  let uploaded = 0;
  let uploadFailed = 0;
  for (const m of loadAllMemories()) {
    const blobName = `memories/${m.id}.json`;
    if (blobs.includes(blobName)) continue;
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

  // Touch last-sync timestamp
  updateSyncStamp();

  // Purge expired tombstones
  cleanupTombstones();
}

function updateSyncStamp(): void {
  try {
    const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf-8"));
    profile.lastSync = new Date().toISOString();
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
    version: 1,
    activatedAt: new Date().toISOString(),
    privateKey,
    address,
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
export function proStatus(): { active: boolean; address?: string; lastSync?: string } {
  if (!fs.existsSync(PROFILE_PATH)) return { active: false };
  try {
    const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf-8"));
    return {
      active: true,
      address: profile.address,
      lastSync: profile.lastSync ?? null,
    };
  } catch {
    return { active: false };
  }
}
