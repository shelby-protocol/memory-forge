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
} from "./storage/shelby.js";
import { MemoryStore } from "./store.js";

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
const MEMORYFORGE_DIR = path.join(HOME, ".memory-forge");
const PROFILE_PATH = path.join(MEMORYFORGE_DIR, "pro.json");

export async function pro(): Promise<void> {
  // Check if already initialized
  if (fs.existsSync(PROFILE_PATH)) {
    console.log("✅ Pro is already active. Syncing memories...");
    await syncAll();
    return;
  }

  console.log(`
  ╔══════════════════════════╗
  ║   MemoryForge Pro Setup   ║
  ╚══════════════════════════╝
  `);

  const apiKey = process.env.SHELBY_API_KEY;
  if (!apiKey) {
    console.log("Pro requires a Shelby API Key.");
    console.log("");
    console.log("  Get your key at: https://docs.shelby.xyz/sdks/typescript/acquire-api-keys");
    console.log('  Then run: SHELBY_API_KEY="aptoslabs_***" npx memory-forge pro');
    console.log("");
    console.log("💡 Free tier: npx memory-forge setup (local storage only)");
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

  console.log(`
  ┌──────────────────────────────────────┐
  │  MemoryForge Pro is active!           │
  │                                      │
  │  ✅ ${uploaded} memories synced to Shelby  │
  │  ✅ Auto-sync on every session       │
  │  ✅ Memories survive across devices  │
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

  // Download and merge blob memories (skip tombstoned)
  let downloaded = 0;
  for (const blobName of blobs) {
    const memoryId = getMemoryId(blobName);
    if (!memoryId) continue;
    if (store.get(memoryId)) continue; // already local
    if (tombstoned.has(memoryId)) continue; // user deleted this — don't resurrect

    const memory = await downloadMemory(blobName);
    if (memory) {
      store.add(memory);
      saveMemory(memory);
      downloaded++;
    }
  }

  // Upload any local-only memories
  let uploaded = 0;
  for (const m of loadAllMemories()) {
    const blobName = `memories/${m.id}.json`;
    if (blobs.includes(blobName)) continue; // already on Shelby
    const result = await uploadMemory(m);
    if (result) uploaded++;
  }

  if (downloaded > 0 || uploaded > 0) {
    console.error(`[MemoryForge] Sync: ↑${uploaded} ↓${downloaded}`);
  }

  // Purge expired tombstones
  cleanupTombstones();
}
