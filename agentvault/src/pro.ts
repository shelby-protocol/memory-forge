#!/usr/bin/env node
/**
 * MemoryForge Pro: Shelby 云存储 + 多设备同步。
 *
 * 用法: npx memory-forge pro
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  loadAllMemories,
  saveMemory,
  deleteMemoryFile,
  getTombstonedIds,
  cleanupTombstones,
  saveSyncCheckpoint,
  clearSyncCheckpoint,
} from "./storage/local.js";
import {
  initShelby,
  uploadMemory,
  downloadMemory,
  listBlobs,
  getMemoryId,
  getShelbyConfig,
  isAuthFailed,
  deleteBlob,
  getBlobName,
  getCloudTombstones,
  getBalances,
} from "./storage/shelby.js";
import { MemoryStore } from "./store.js";
import type { Memory } from "./store.js";
import { nowISO, tick as clockTick } from "./clock.js";
import { SyncQueue } from "./sync-queue.js";

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
      const result = await initShelby(apiKey, process.env.APTOS_PRIVATE_KEY);
      if (!result) {
        console.log("   Failed to initialize Shelby SDK. Pro features disabled.");
        return;
      }
      const { address } = result;
      profile.privateKey = process.env.APTOS_PRIVATE_KEY;
      profile.address = address;
      console.log(`   Account switched to ${address}`);
    }
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));
    try {
      fs.chmodSync(PROFILE_PATH, 0o600);
    } catch {
      /* best-effort */
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
  const initResult = await initShelby(apiKey, privateKey);
  if (!initResult) {
    console.log(
      "\n❌ Shelby SDK not available. Install with:\n   npm install @shelby-protocol/sdk @aptos-labs/ts-sdk",
    );
    process.exitCode = 1;
    return;
  }
  const { address, generatedKey } = initResult;

  if (generatedKey) {
    // Save generated key for future runs
    privateKey = generatedKey;
    console.log("");
    console.log("  ┌──────────────────────────────────────────────────────────┐");
    console.log("  │  ⚠️  IMPORTANT: Back up your private key!                 │");
    console.log("  │                                                          │");
    console.log("  │  This key controls your Shelby cloud storage account.    │");
    console.log("  │  If you lose it, ALL cloud memories become inaccessible. │");
    console.log(`  │  Address: ${address.slice(0, 10)}…                                  │`);
    console.log("  │                                                          │");
    console.log("  │  Key saved to: ~/.memory-forge/pro.json                 │");
    console.log("  │  Copy this file to a safe location (password manager,    │");
    console.log("  │  encrypted backup, etc.)                                 │");
    console.log("  └──────────────────────────────────────────────────────────┘");
    console.log("");
  } else {
    console.log(`   ℹ️  Using account: ${address}`);
  }

  // Check balances before uploading — unfunded accounts will fail silently
  let balances: { apt: string; shelbyUsd: string } | null = null;
  try {
    balances = await getBalances();
  } catch {
    // Network issue — proceed optimistically
  }

  const isUnfunded =
    balances && parseFloat(balances.apt) === 0 && parseFloat(balances.shelbyUsd) === 0;

  let uploaded = 0;

  if (isUnfunded) {
    console.log("");
    console.log("   💰 Account needs gas to upload:");
    console.log("      APT:       https://docs.shelby.xyz/apis/faucet/aptos");
    console.log("      ShelbyUSD: https://docs.shelby.xyz/apis/faucet/shelbyusd");
    console.log("");
    console.log("   ℹ️  Profile saved — sync starts after funding. Re-run:");
    console.log("      npx memory-forge pro");
  } else {
    console.log("📤 Uploading existing memories to Shelby...");
    for (const m of loadAllMemories()) {
      const result = await uploadMemory(m);
      if (result) uploaded++;
    }
  }

  // Save Pro profile
  if (!fs.existsSync(MEMORYFORGE_DIR)) {
    fs.mkdirSync(MEMORYFORGE_DIR, { recursive: true });
  }
  fs.writeFileSync(
    PROFILE_PATH,
    JSON.stringify(
      {
        version: 2,
        activatedAt: new Date().toISOString(),
        privateKey,
        address,
        apiKey,
      },
      null,
      2,
    ),
  );

  const syncIcon = uploaded > 0 ? "✅" : "⚠️";
  const hintLine = isUnfunded
    ? `  Wallet: ${address.slice(0, 10)}… needs gas (see above) `
    : uploaded === 0
      ? "⚠️  Check SHELBY_API_KEY if sync didn't work"
      : " ".repeat(43);
  console.log(`
  ┌──────────────────────────────────────┐
  │  MemoryForge Pro is active!           │
  │                                      │
  │  ${syncIcon} ${uploaded} memories synced to Shelby  │
  │  ✅ Auto-sync on every session       │
  │  ✅ Memories survive across devices  │
  │                                      │
  │  ${hintLine}   │
  └──────────────────────────────────────┘
  `);
}

// ─── File-based sync cooldown (cross-process) ──────────────────
// Previously in-memory `lastSyncAll` failed across separate CLI hook
// processes. File-based cooldown persists across invocations so
// PreCompact → Stop back-to-back hooks don't double-sync.

const COOLDOWN_FILE = path.join(MEMORYFORGE_DIR, "last-sync-time");
const SYNC_COOLDOWN_MS = 30_000;

function isCooldownActive(): boolean {
  try {
    if (fs.existsSync(COOLDOWN_FILE)) {
      const val = parseInt(fs.readFileSync(COOLDOWN_FILE, "utf-8"), 10);
      if (!isNaN(val) && Date.now() - val < SYNC_COOLDOWN_MS) return true;
    }
  } catch {
    /* corrupted — proceed */
  }
  return false;
}

function touchCooldown(): void {
  try {
    if (!fs.existsSync(MEMORYFORGE_DIR)) fs.mkdirSync(MEMORYFORGE_DIR, { recursive: true });
    fs.writeFileSync(COOLDOWN_FILE, String(Date.now()));
  } catch {
    /* best-effort */
  }
}

// ─── Profile Validation ────────────────────────────────────────

const PROFILE_REQUIRED_FIELDS: Record<string, string> = {
  version: "number",
  activatedAt: "string",
  privateKey: "string",
  address: "string",
  apiKey: "string",
};

function validateProfile(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Profile is not a valid object"] };
  }
  for (const [key, type] of Object.entries(PROFILE_REQUIRED_FIELDS)) {
    if (typeof data[key] !== type) {
      errors.push(`Missing or invalid field '${key}' (expected ${type})`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// ─── Conflict Persistence ──────────────────────────────────────

const CONFLICTS_PATH = path.join(MEMORYFORGE_DIR, "conflicts.json");
const MAX_CONFLICT_RECORDS = 50;

interface ConflictRecord {
  memoryId: string;
  memoryName: string;
  fields: string[];
  localPreview: string;
  remotePreview: string;
  timestamp: string;
}

function persistConflict(record: ConflictRecord): void {
  try {
    const existing: ConflictRecord[] = fs.existsSync(CONFLICTS_PATH)
      ? JSON.parse(fs.readFileSync(CONFLICTS_PATH, "utf-8"))
      : [];
    existing.push(record);
    if (existing.length > MAX_CONFLICT_RECORDS) {
      existing.splice(0, existing.length - MAX_CONFLICT_RECORDS);
    }
    if (!fs.existsSync(MEMORYFORGE_DIR)) fs.mkdirSync(MEMORYFORGE_DIR, { recursive: true });
    fs.writeFileSync(CONFLICTS_PATH, JSON.stringify(existing, null, 2));
  } catch {
    /* best-effort */
  }
}

/** Sync: download from Shelby, merge with local.
 *  When projectHash is provided, only sync that project + global.
 *  When null, sync all projects (full sync). */
export async function syncAll(_projectHash?: string | null): Promise<void> {
  if (isCooldownActive()) return;
  touchCooldown();

  if (!fs.existsSync(PROFILE_PATH)) return;

  const apiKey = getShelbyConfig().apiKey;
  if (!apiKey) {
    console.error("[MemoryForge] Pro sync skipped: SHELBY_API_KEY not set");
    return;
  }

  let profile: { address: string; privateKey: string };
  try {
    profile = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf-8"));
  } catch {
    console.error(
      "[MemoryForge] Pro sync skipped: corrupted profile (run `memory-forge pro` to repair)",
    );
    return;
  }

  // Validate profile fields
  const validation = validateProfile(profile);
  if (!validation.valid) {
    console.error(`[MemoryForge] ❌ pro.json validation failed: ${validation.errors.join("; ")}`);
    console.error("[MemoryForge]    Run `memory-forge pro` to repair your profile.");
    return;
  }
  const privateKey = process.env.APTOS_PRIVATE_KEY || profile.privateKey;

  await initShelby(apiKey, privateKey);

  // Save checkpoint before modifying local state
  saveSyncCheckpoint();

  try {
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
    let skipped = 0;
    let mergeConflicts = 0;
    for (const [memoryId, blobName] of latestBlobs) {
      if (tombstoned.has(memoryId)) continue;

      const local = store.get(memoryId);
      const remote = await downloadMemory(blobName);
      if (!remote) {
        skipped++;
        continue;
      }

      // Advance local clock past remote timestamp (#24)
      clockTick(new Date(remote.created_at).getTime());

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
          persistConflict({
            memoryId: merged.id,
            memoryName: merged.name || "unnamed",
            fields: fieldConflicts,
            localPreview: local.content.slice(0, 200),
            remotePreview: remote.content.slice(0, 200),
            timestamp: nowISO(),
          });
          console.error(
            `[MemoryForge] ⚡ Merge conflict on "${merged.name}": ${fieldConflicts.join(", ")} — remote won`,
          );
          console.error(`[MemoryForge]    See ~/.memory-forge/conflicts.json for details`);
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
        try {
          deleteMemoryFile(id);
        } catch {}
      }
    }

    // Build set of memory IDs already on cloud (versioned blobs — not exact name match)
    const existingIds = new Set<string>();
    for (const blobName of blobs) {
      const id = getMemoryId(blobName);
      if (id) existingIds.add(id);
    }

    // Upload any local-only memories (batch: log summary, not per-memory spam)
    let uploaded = 0;
    let uploadFailed = 0;
    const failedMemories: Memory[] = [];
    for (const m of loadAllMemories()) {
      if (existingIds.has(m.id)) continue;
      const result = await uploadMemory(m);
      if (result) uploaded++;
      else {
        uploadFailed++;
        failedMemories.push(m);
      }
    }
    // Queue failed uploads for retry so they don't just become permanent failures
    if (failedMemories.length > 0) {
      const queue = new SyncQueue();
      for (const m of failedMemories) {
        queue.enqueue({ id: m.id, type: "upload" as const, memoryId: m.id, memory: m });
      }
    }

    if (downloaded > 0 || uploaded > 0 || uploadFailed > 0 || skipped > 0) {
      const parts: string[] = [];
      if (uploaded > 0) parts.push(`↑${uploaded}`);
      if (downloaded > 0) parts.push(`↓${downloaded}`);
      if (skipped > 0) parts.push(`⊘${skipped}`);
      if (uploadFailed > 0) parts.push(`✗${uploadFailed}`);
      console.error(`[MemoryForge] Sync: ${parts.join(" ")}`);
    }

    // Cleanup: tombstone remote blobs that no longer exist locally
    let cleanedBlobs = 0;
    const localIds = new Set(loadAllMemories().map((m) => m.id));
    for (const blobName of blobs) {
      const id = getMemoryId(blobName);
      if (!id) continue;
      if (blobName.endsWith(".deleted")) continue;
      if (!localIds.has(id)) {
        deleteBlob(getBlobName(id)).catch((err) =>
          console.error("[MemoryForge] Cleanup tombstone failed:", (err as Error).message),
        );
        cleanedBlobs++;
      }
    }
    if (cleanedBlobs > 0) {
      console.error(`[MemoryForge] Cleanup: tombstoned ${cleanedBlobs} stale cloud blobs`);
    }

    // Drain pending queue (retry failed uploads/tombstones)
    const queue = new SyncQueue();
    const pending = queue.drain();
    let queuedUploaded = 0;
    let queuedFailed = 0;
    const confirmedOps: typeof pending = [];
    const retryOps: typeof pending = [];

    for (const op of pending) {
      if (op.type === "upload" && op.memory) {
        const result = await uploadMemory(op.memory);
        if (result) {
          queuedUploaded++;
          confirmedOps.push(op);
        } else {
          queuedFailed++;
          retryOps.push(op);
        }
      } else if (op.type === "tombstone") {
        try {
          await deleteBlob(getBlobName(op.memoryId, op.projectHash));
          confirmedOps.push(op);
        } catch {
          retryOps.push(op);
        }
      }
    }

    queue.confirm(confirmedOps);
    if (retryOps.length > 0) {
      queue.reEnqueue(retryOps);
    }

    if (queuedUploaded > 0 || queuedFailed > 0) {
      console.error(
        `[MemoryForge] Queue: ↑${queuedUploaded} retried, ✗${queuedFailed} still pending`,
      );
    }

    // User-visible error summary
    if (uploadFailed > 0 || mergeConflicts > 0 || queuedFailed > 0) {
      const parts: string[] = [];
      if (uploadFailed > 0) parts.push(`${uploadFailed} uploads failed (queued for retry)`);
      if (queuedFailed > 0) parts.push(`${queuedFailed} queue items still pending`);
      if (mergeConflicts > 0)
        parts.push(`${mergeConflicts} merge conflicts (see ~/.memory-forge/conflicts.json)`);
      console.error(`[MemoryForge] ℹ️  ${parts.join("; ")}`);
      console.error(`[MemoryForge] ℹ️  Run \`memory-forge pro status\` for full sync health.`);
    }

    // Touch last-sync timestamp with stats
    updateSyncStamp(uploaded, downloaded, uploadFailed, mergeConflicts);

    // Purge expired tombstones
    cleanupTombstones();
  } finally {
    // Always clear checkpoint, even on error
    clearSyncCheckpoint();
  }
}

interface SyncEntry {
  time: string;
  up: number;
  down: number;
  failed: number;
  conflicts?: number;
}

function updateSyncStamp(up: number, down: number, failed: number, conflicts?: number): void {
  try {
    const profile = fs.existsSync(PROFILE_PATH)
      ? JSON.parse(fs.readFileSync(PROFILE_PATH, "utf-8"))
      : { version: 1 };
    profile.lastSync = new Date().toISOString();
    profile.syncHistory = profile.syncHistory || [];
    profile.syncHistory.push({
      time: profile.lastSync,
      up,
      down,
      failed,
      conflicts: conflicts ?? 0,
    });
    if (profile.syncHistory.length > 10) profile.syncHistory = profile.syncHistory.slice(-10);
    profile.totalUploaded = (profile.totalUploaded || 0) + up;
    profile.totalDownloaded = (profile.totalDownloaded || 0) + down;
    profile.totalFailed = (profile.totalFailed || 0) + failed;
    profile.totalConflicts = (profile.totalConflicts || 0) + (conflicts ?? 0);
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));
    try {
      fs.chmodSync(PROFILE_PATH, 0o600);
    } catch {
      /* best-effort */
    }
  } catch {
    /* best-effort */
  }
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
  const initResult = await initShelby(cfg.apiKey, privateKey);
  if (!initResult) {
    console.error("[MemoryForge] Shelby SDK not available. Pro auto-activation skipped.");
    return;
  }
  const { address, generatedKey } = initResult;
  if (generatedKey) privateKey = generatedKey;

  // Save profile
  if (!fs.existsSync(MEMORYFORGE_DIR)) fs.mkdirSync(MEMORYFORGE_DIR, { recursive: true });
  fs.writeFileSync(
    PROFILE_PATH,
    JSON.stringify(
      {
        version: 2,
        activatedAt: new Date().toISOString(),
        privateKey,
        address,
        apiKey: cfg.apiKey,
      },
      null,
      2,
    ),
  );

  console.error(`[MemoryForge] Pro activated — Shelby account ${address.slice(0, 10)}…`);
  if (generatedKey) {
    console.error(
      `[MemoryForge] ⚠️  Fund this account with APT + ShelbyUSD for storage transactions:`,
    );
    console.error(`[MemoryForge]    APT:       https://docs.shelby.xyz/apis/faucet/aptos`);
    console.error(`[MemoryForge]    ShelbyUSD: https://docs.shelby.xyz/apis/faucet/shelbyusd`);
  }

  // Sync
  await syncAll();
}

/** Return Pro status for CLI display. */
export function proStatus(): {
  active: boolean;
  address?: string;
  lastSync?: string;
  totalUploaded?: number;
  totalDownloaded?: number;
  totalFailed?: number;
  totalConflicts?: number;
  syncHistory?: SyncEntry[];
  localCount?: number;
  apiKeyValid?: boolean;
  profileValid?: boolean;
  profileErrors?: string[];
  keyBackedUp?: boolean;
  conflictCount?: number;
  queueSize?: number;
  balances?: { apt: string; shelbyUsd: string } | null;
  storage?: { blobCount: number; totalBytes: number } | null;
} {
  if (!fs.existsSync(PROFILE_PATH)) return { active: false };
  try {
    const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf-8"));
    const validation = validateProfile(profile);
    const cfg = getShelbyConfig();

    // Load conflict count
    let conflictCount = 0;
    try {
      if (fs.existsSync(CONFLICTS_PATH)) {
        const conflicts: ConflictRecord[] = JSON.parse(fs.readFileSync(CONFLICTS_PATH, "utf-8"));
        conflictCount = conflicts.length;
      }
    } catch {
      /* ignore */
    }

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
      profileValid: validation.valid,
      profileErrors: validation.errors.length > 0 ? validation.errors : undefined,
      keyBackedUp: profile.keyBackedUp ?? false,
      conflictCount,
      queueSize: new SyncQueue().size(),
      balances: null, // filled async by CLI
      storage: null, // filled async by CLI
    };
  } catch {
    return { active: false };
  }
}
